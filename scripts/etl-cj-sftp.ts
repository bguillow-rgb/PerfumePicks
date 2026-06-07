/**
 * ETL: CJ SFTP Multi-Feed → Supabase
 *
 * Unified replacement for per-retailer CJ SFTP ETL scripts.
 * Downloads each configured feed zip from CJ SFTP, parses the Google Shopping
 * TSV/CSV, maps rows to AffiliateProduct, and upserts into:
 *   - brands
 *   - fragrances
 *   - fragrance_retailer_links
 *
 * CJ SFTP constants (fixed per CJ docs):
 *   Host:     datatransfer.cj.com
 *   Port:     22
 *   Username: 7966973  (publisher CID)
 *   Password: CJ_SFTP_PASSWORD env var
 *
 * Required env (in .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CJ_SFTP_PASSWORD
 *
 * Usage:
 *   npx tsx scripts/etl-cj-sftp.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { Client as SftpClient } from 'ssh2';
import { parse as csvParse } from 'csv-parse/sync';

import {
  type AffiliateProduct,
  isDupe,
  parseConcentration,
  parseGender,
  fragranceSlug,
  upsertProducts,
} from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── Env / client ─────────────────────────────────────────────────────────────

const CJ_SFTP_HOST     = 'datatransfer.cj.com';
const CJ_SFTP_PORT     = 22;
const CJ_SFTP_USER     = '7966973';
const CJ_SFTP_PASSWORD = process.env.CJ_SFTP_PASSWORD || '';
const SUPABASE_URL     = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!CJ_SFTP_PASSWORD) { console.error('Missing CJ_SFTP_PASSWORD'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Feed config ──────────────────────────────────────────────────────────────

interface FeedConfig {
  /** Matches the `retailer` column in fragrance_retailer_links */
  retailer_id:   string;
  /** Directory path on the CJ SFTP server — we readdir and pick the first zip */
  remote_dir:    string;
  /** CJ advertiser ID used when rewriting affiliate URLs */
  advertiser_id: string;
}

const FEEDS: FeedConfig[] = [
  {
    retailer_id:   'fragranceshop',
    remote_dir:    '/outgoing/productcatalog/317600',
    advertiser_id: '16941446',   // FragranceShop's actual CJ advertiser ID
  },
  // Perfumania CJ feed — subscription 318053 created 2026-06-07 (CJ Product
  // Export "Perfumania", Shopping/Google format, CJ SFTP). Still commented out
  // until CJ generates its FIRST export (Last Export Date was empty at creation);
  // uncomment once the .zip appears in the remote_dir below.
  // {
  //   retailer_id:   'perfumania',
  //   remote_dir:    '/outgoing/productcatalog/318053',
  //   advertiser_id: '17277211',
  // },
];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Google Shopping feed columns present in CJ product feeds */
interface FeedRow {
  ID:                           string;
  TITLE:                        string;
  DESCRIPTION:                  string;
  LINK:                         string;   // already a CJ-tracked affiliate URL
  IMAGE_LINK:                   string;
  AVAILABILITY:                 string;
  PRICE:                        string;   // "74.95 USD"
  SALE_PRICE:                   string;
  BRAND:                        string;
  GENDER:                       string;
  GOOGLE_PRODUCT_CATEGORY_NAME: string;
  SIZE:                         string;
  PROGRAM_NAME:                 string;
}

// ─── SFTP helpers ─────────────────────────────────────────────────────────────

/** ssh2 algorithm negotiation config — same set as etl-fragranceshop-feed.ts */
const SSH_ALGORITHMS = {
  kex: [
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group1-sha1',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
  ],
  serverHostKey: [
    'ssh-rsa',
    'ssh-dss',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-256',
    'rsa-sha2-512',
  ],
} as const;

/**
 * Connect to CJ SFTP, list remote_dir, download the first .zip found to
 * localZipPath, then close the connection.
 */
function downloadFeed(remoteDir: string, localZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new SftpClient();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }

        sftp.readdir(remoteDir, (lsErr, list) => {
          if (lsErr) {
            conn.end();
            return reject(new Error(`Cannot list ${remoteDir}: ${lsErr.message}`));
          }

          console.log(`  Remote files in ${remoteDir}:\n    ` + list.map((f) => f.filename).join('\n    '));

          const zipFile = list.find((f) => f.filename.endsWith('.zip'));
          if (!zipFile) {
            conn.end();
            return reject(new Error(`No zip file found in ${remoteDir}`));
          }

          const remotePath = `${remoteDir}/${zipFile.filename}`;
          console.log(`  Downloading ${remotePath} ...`);

          sftp.fastGet(remotePath, localZipPath, (dlErr) => {
            conn.end();
            if (dlErr) return reject(dlErr);
            console.log(`  Downloaded → ${localZipPath}`);
            resolve();
          });
        });
      });
    });

    conn.on('error', reject);

    conn.connect({
      host:       CJ_SFTP_HOST,
      port:       CJ_SFTP_PORT,
      username:   CJ_SFTP_USER,
      password:   CJ_SFTP_PASSWORD,
      algorithms: SSH_ALGORITHMS,
    });
  });
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

const CJ_DOMAINS = [
  'dpbolvw.net', 'kqzyfj.com', 'tkqlhce.com',
  'anrdoezrs.net', 'lduhtrp.net', 'jdoqocy.com',
];

/**
 * Rewrite the publisher ID baked into the feed URL to ours (7966973) and
 * point at our advertiser ID. This ensures commissions are attributed correctly
 * regardless of which publisher ID CJ baked in.
 */
function rewriteCjUrl(url: string, advertiserId: string): string {
  if (!CJ_DOMAINS.some((d) => url.includes(d))) return url;
  const match = url.match(/[?&]url=([^&]+)/);
  if (!match) return url;
  return `https://www.anrdoezrs.net/click-${CJ_SFTP_USER}-${advertiserId}?url=${match[1]}`;
}

const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(ml|oz)/i;

function parseSizeMl(title: string): number | null {
  const m = title.match(SIZE_PATTERN);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return m[2].toLowerCase() === 'oz' ? Math.round(val * 29.5735) : val;
}

function parsePriceCents(priceStr: string, salePriceStr: string): number | null {
  const raw = salePriceStr?.trim() || priceStr?.trim();
  if (!raw) return null;
  const m = raw.match(/[\d.]+/);
  if (!m) return null;
  return Math.round(parseFloat(m[0]) * 100);
}

/**
 * Strip the brand prefix, concentration label, and size suffix from a TITLE.
 * e.g. "Acqua Di Parma Colonia Pura Cologne for Men - Eau de Cologne 3.4 oz"
 *   → "Colonia Pura Cologne for Men"
 */
function parseName(title: string, brand: string): string {
  let name = title;

  // Strip brand prefix (case-insensitive)
  const brandRe = new RegExp(
    '^' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*',
    'i',
  );
  name = name.replace(brandRe, '');

  // Strip trailing "- Eau de Parfum 3.4 oz" style suffix
  name = name.replace(
    /\s*[-–]\s*(Eau\s+de\s+(Parfum|Toilette|Cologne)|Parfum|Extrait|Cologne|Body\s+Mist|Hair\s+Mist).*$/i,
    '',
  );

  // Strip inline concentration / spray / size without dash
  // e.g. "Bleu de Chanel Eau de Parfum Spray 3.4 oz" → "Bleu de Chanel"
  name = name.replace(
    /\s+(Eau\s+de\s+(Parfum|Toilette|Cologne)|Parfum|Extrait|Cologne|Spray|Mist|Roll-?On|\d[\d.]*\s*(oz|ml|fl\.?\s*oz)).*$/i,
    '',
  );

  return name.trim() || title.trim();
}

/** Returns true if the row looks like a fragrance (by category or title keywords) */
function isFragrance(row: FeedRow): boolean {
  const cat   = (row.GOOGLE_PRODUCT_CATEGORY_NAME || '').toLowerCase();
  const title = (row.TITLE || '').toLowerCase();
  if (cat.includes('fragrance') || cat.includes('perfume') || cat.includes('cologne')) return true;
  if (/\b(eau\s+de|parfum|cologne|fragrance|perfume)\b/.test(title)) return true;
  return false;
}

/**
 * Map a raw feed row to AffiliateProduct.
 * Returns null if the row should be skipped (missing fields, not a fragrance,
 * dupe/inspired-by).
 */
function rowToProduct(row: FeedRow, feed: FeedConfig): AffiliateProduct | null {
  if (!row.BRAND || !row.TITLE || !row.LINK) return null;
  if (!isFragrance(row)) return null;
  if (isDupe(row.TITLE)) return null;

  const brand = row.BRAND.trim();
  const name  = parseName(row.TITLE, brand);
  if (!name) return null;

  // Sanity: skip rows where stripping leaves us with no meaningful name
  if (name.length < 2) return null;

  return {
    brand,
    name,
    concentration: parseConcentration(row.TITLE),
    gender:        parseGender(row.TITLE, row.GENDER),
    image_url:     row.IMAGE_LINK?.trim() || '',
    affiliate_url: rewriteCjUrl(row.LINK.trim(), feed.advertiser_id),
    price_cents:   parsePriceCents(row.PRICE, row.SALE_PRICE),
    retailer_id:   feed.retailer_id,
    source_id:     row.ID?.trim() || '',
  };
}

// ─── Schema check ─────────────────────────────────────────────────────────────

async function assertSchema(): Promise<void> {
  const { error } = await supabase
    .from('fragrance_retailer_links')
    .select('id, fragrance_id, retailer, url, price_cents')
    .limit(0);
  if (error) {
    throw new Error(`Schema check failed: ${error.message}. Run migrations first.`);
  }
  console.log('Schema check passed.');
}

// ─── Per-feed ETL ─────────────────────────────────────────────────────────────

async function processFeed(feed: FeedConfig): Promise<void> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Feed: ${feed.retailer_id} (advertiser ${feed.advertiser_id})`);
  console.log(`${'─'.repeat(60)}`);

  const tmpDir     = os.tmpdir();
  const localZip   = path.join(tmpDir, `cj-feed-${feed.retailer_id}.txt.zip`);
  let   txtPath    = path.join(tmpDir, `cj-feed-${feed.retailer_id}.txt`);

  try {
    // 1. Download
    await downloadFeed(feed.remote_dir, localZip);

    // 2. Unzip
    console.log('  Unzipping...');
    execSync(`unzip -o "${localZip}" -d "${tmpDir}"`);

    // Find the extracted .txt file
    const extracted = fs.readdirSync(tmpDir).find(
      (f) => f.endsWith('.txt') && f !== path.basename(txtPath),
    );
    if (extracted) txtPath = path.join(tmpDir, extracted);
    if (!fs.existsSync(txtPath)) {
      throw new Error(`Could not find extracted .txt file in ${tmpDir}`);
    }
    console.log(`  Extracted: ${txtPath}`);

    // 3. Parse CSV
    console.log('  Parsing CSV...');
    const raw  = fs.readFileSync(txtPath, 'utf8');
    const rows = csvParse(raw, {
      columns:          true,
      skip_empty_lines: true,
      relax_quotes:     true,
      trim:             true,
    }) as FeedRow[];
    console.log(`  Total feed rows: ${rows.length}`);

    // 4. Filter + map
    const products: AffiliateProduct[] = [];
    let   dupeCount = 0;
    let   skipCount = 0;

    for (const row of rows) {
      const p = rowToProduct(row, feed);
      if (!p) {
        // Distinguish dupes from other skips for reporting
        if (row.TITLE && isDupe(row.TITLE)) dupeCount++;
        else skipCount++;
        continue;
      }
      products.push(p);
    }

    console.log(
      `  After filter: ${products.length} products` +
      ` | dupes skipped: ${dupeCount}` +
      ` | other skipped: ${skipCount}`,
    );

    // 5. Upsert into Supabase
    const result = await upsertProducts(supabase, products, feed.retailer_id);

    console.log(
      `\n  ✓ ${feed.retailer_id} done.` +
      ` fetched: ${rows.length}` +
      ` | dupes filtered: ${dupeCount}` +
      ` | fragrances created: ${result.created}` +
      ` | images updated: ${result.updated}` +
      ` | retailer links upserted: ${result.linked}`,
    );
  } finally {
    if (fs.existsSync(localZip)) fs.unlinkSync(localZip);
    if (fs.existsSync(txtPath))  fs.unlinkSync(txtPath);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await assertSchema();

  console.log(`Running ${FEEDS.length} feed(s): ${FEEDS.map((f) => f.retailer_id).join(', ')}`);

  for (const feed of FEEDS) {
    await processFeed(feed);
  }

  console.log('\nAll feeds complete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
