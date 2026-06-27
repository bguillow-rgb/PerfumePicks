/**
 * ETL: FragranceShop CJ Affiliate Feed → Supabase
 *
 * Downloads FragranceShop_com_-CJ_Product_Feed-shopping.txt.zip from CJ SFTP,
 * parses the Google Shopping CSV, and upserts into:
 *   - brands
 *   - fragrances
 *   - fragrance_retailer_links
 *
 * The CJ LINK field already contains the affiliate tracking URL (publisher ID
 * baked in). No tag injection needed — store it as-is.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CJ_SFTP_PASSWORD             (set from Associates Central → Account → Subscriptions)
 *
 * CJ SFTP constants (fixed per CJ docs):
 *   Host:     sftp.cj.com
 *   Username: 7966973   (your CID)
 *   File:     /7966973/FragranceShop_com_-CJ_Product_Feed-shopping.txt.zip
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CJ_SFTP_PASSWORD=... \
 *     npx tsx scripts/etl-fragranceshop-feed.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalize } from './types';
import { Client as SftpClient } from 'ssh2';
import { parse as csvParse } from 'csv-parse/sync';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── Config ──────────────────────────────────────────────────────────────────

const CJ_SFTP_HOST     = 'datatransfer.cj.com';
const CJ_SFTP_PORT     = 22;
const CJ_SFTP_USER     = '7966973';      // publisher account CID — SFTP login only
const CJ_WEBSITE_ID    = process.env.CJ_WEBSITE_ID || '101759456';    // Perfume Picks website ID — must be the ID baked into click- URLs for attribution. NOT the account CID. Override via env.
const CJ_SFTP_PASSWORD = process.env.CJ_SFTP_PASSWORD || '';
const CJ_REMOTE_PATH   = '/outgoing/productcatalog/317600/FragranceShop_com_-CJ_Product_Feed-shopping.txt.zip';
const RETAILER_ID      = 'fragranceshop';
const RETAILER_ADV_ID  = '16941446';  // FragranceShop's CJ advertiser ID (from feed URL pattern)

const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!CJ_SFTP_PASSWORD) { console.error('Missing CJ_SFTP_PASSWORD'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedRow {
  PROGRAM_NAME:          string;
  ID:                    string;
  TITLE:                 string;
  DESCRIPTION:           string;
  LINK:                  string;   // already-tracked CJ affiliate URL
  IMAGE_LINK:            string;
  AVAILABILITY:          string;
  PRICE:                 string;   // "74.95 USD"
  SALE_PRICE:            string;
  BRAND:                 string;
  GENDER:                string;
  GOOGLE_PRODUCT_CATEGORY_NAME: string;
  SIZE:                  string;
}

interface ParsedProduct {
  brand:          string;
  name:           string;
  concentration:  string | null;
  size_ml:        number | null;
  gender:         'feminine' | 'masculine' | 'unisex' | null;
  price_cents:    number | null;
  image_url:      string;
  retailer_url:   string;
  in_stock:       boolean;
  description:    string;
  external_id:    string;
}

// ─── SFTP Download ────────────────────────────────────────────────────────────

function downloadFeed(localZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new SftpClient();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        sftp.readdir('/outgoing/productcatalog/317600', (lsErr, list) => {
          if (lsErr) { conn.end(); return reject(new Error(`Cannot list directory: ${lsErr.message}`)); }
          console.log('Files found:\n  ' + list.map(f => f.filename).join('\n  '));
          // Use the first zip file found — avoids hardcoding exact filename
          const zipFile = list.find(f => f.filename.endsWith('.zip'));
          if (!zipFile) { conn.end(); return reject(new Error('No zip file found in /outgoing/productcatalog/317600')); }
          const remotePath = `/outgoing/productcatalog/317600/${zipFile.filename}`;
          console.log(`Downloading ${remotePath} ...`);
          sftp.fastGet(remotePath, localZipPath, (dlErr) => {
            conn.end();
            if (dlErr) return reject(dlErr);
            console.log(`Downloaded to ${localZipPath}`);
            resolve();
          });
        });
      });
    });
    conn.on('error', reject);
    conn.connect({
      host:     CJ_SFTP_HOST,
      port:     CJ_SFTP_PORT,
      username: CJ_SFTP_USER,
      password: CJ_SFTP_PASSWORD,
      algorithms: {
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
      },
    });
  });
}

// ─── Parse ────────────────────────────────────────────────────────────────────

const CONCENTRATION_PATTERNS: [RegExp, string][] = [
  [/\bparfum\b/i,           'parfum'],
  [/\bextrait\b/i,          'extrait'],
  [/\beau\s+de\s+parfum\b/i,'edp'],
  [/\bedp\b/i,              'edp'],
  [/\beau\s+de\s+toilette\b/i,'edt'],
  [/\bedt\b/i,              'edt'],
  [/\beau\s+de\s+cologne\b/i,'cologne'],
  [/\bedc\b/i,              'cologne'],
  [/\bcologne\b/i,          'cologne'],
  [/\body\s+mist\b/i,       'mist'],
  [/\bhair\s+mist\b/i,      'mist'],
];

const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(ml|oz)/i;

function parseConcentration(title: string): string | null {
  for (const [re, conc] of CONCENTRATION_PATTERNS) {
    if (re.test(title)) return conc;
  }
  return null;
}

function parseSizeMl(title: string): number | null {
  const m = title.match(SIZE_PATTERN);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (m[2].toLowerCase() === 'oz') return Math.round(val * 29.5735);
  return val;
}

function parseGender(gender: string, title: string): 'feminine' | 'masculine' | 'unisex' | null {
  const g = (gender || '').toLowerCase();
  if (g === 'female') return 'feminine';
  if (g === 'male')   return 'masculine';
  if (g === 'unisex') return 'unisex';
  // fallback from title
  if (/\bfor women\b/i.test(title)) return 'feminine';
  if (/\bfor men\b/i.test(title))   return 'masculine';
  if (/\bunisex\b/i.test(title))    return 'unisex';
  return null;
}

function parsePriceCents(priceStr: string, salePriceStr: string): number | null {
  const raw = salePriceStr?.trim() || priceStr?.trim();
  if (!raw) return null;
  const m = raw.match(/[\d.]+/);
  if (!m) return null;
  return Math.round(parseFloat(m[0]) * 100);
}

/**
 * Parse the TITLE into fragrance name (strip brand prefix, concentration, size).
 * Example: "Acqua Di Parma Colonia Pura Cologne for Men - Eau de Cologne 3.4 oz"
 * → name: "Colonia Pura Cologne for Men"  (brand stripped from front)
 */
const CJ_DOMAINS = ['dpbolvw.net', 'kqzyfj.com', 'tkqlhce.com', 'anrdoezrs.net', 'lduhtrp.net', 'jdoqocy.com'];

/** Replace whatever website ID is baked into the feed URL with our Perfume
 * Picks website ID (101759456). The click- segment MUST be the website ID, not
 * the account CID (7966973), or CJ can't attribute mobile-app clicks. */
function rewriteCjUrl(url: string): string {
  if (!CJ_DOMAINS.some((d) => url.includes(d))) return url;
  const match = url.match(/[?&]url=([^&]+)/);
  if (!match) return url;
  return `https://www.anrdoezrs.net/click-${CJ_WEBSITE_ID}-${RETAILER_ADV_ID}?url=${match[1]}`;
}

function parseName(title: string, brand: string): string {
  let name = title;
  // strip brand prefix (case-insensitive)
  const brandRe = new RegExp('^' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
  name = name.replace(brandRe, '');
  // strip trailing concentration + size suffixes in two passes:
  // pass 1: "- Eau de Parfum 3.4 oz" style (dash-separated)
  name = name.replace(/\s*[-–]\s*(Eau\s+de\s+(Parfum|Toilette|Cologne)|Parfum|Extrait|Cologne|Body\s+Mist|Hair\s+Mist).*$/i, '');
  // pass 2: inline concentration / spray / size with no dash
  // e.g. "Bleu de Chanel Eau de Parfum Spray 3.4 oz" → "Bleu de Chanel"
  name = name.replace(/\s+(Eau\s+de\s+(Parfum|Toilette|Cologne)|Parfum|Extrait|Cologne|Spray|Mist|Roll-?On|\d[\d.]*\s*(oz|ml|fl\.?\s*oz)).*$/i, '');
  return name.trim() || title.trim();
}

function isFragrance(row: FeedRow): boolean {
  const cat = (row.GOOGLE_PRODUCT_CATEGORY_NAME || '').toLowerCase();
  const title = (row.TITLE || '').toLowerCase();
  // keep only fragrance/perfume/cologne category rows
  if (cat.includes('fragrance') || cat.includes('perfume') || cat.includes('cologne')) return true;
  if (/\b(eau\s+de|parfum|cologne|fragrance|perfume)\b/.test(title)) return true;
  return false;
}

function parseRow(row: FeedRow): ParsedProduct | null {
  if (!row.BRAND || !row.TITLE || !row.LINK) return null;
  if (!isFragrance(row)) return null;

  const brand = row.BRAND.trim();
  const name  = parseName(row.TITLE, brand);
  if (!name) return null;

  return {
    brand,
    name,
    concentration: parseConcentration(row.TITLE),
    size_ml:       parseSizeMl(row.TITLE),
    gender:        parseGender(row.GENDER, row.TITLE),
    price_cents:   parsePriceCents(row.PRICE, row.SALE_PRICE),
    image_url:     row.IMAGE_LINK?.trim() || '',
    retailer_url:  rewriteCjUrl(row.LINK.trim()),  // rewrite to our publisher ID
    in_stock:      (row.AVAILABILITY || '').toLowerCase() === 'in stock',
    description:   row.DESCRIPTION?.trim() || '',
    external_id:   row.ID?.trim() || '',
  };
}

// ─── Supabase upserts ─────────────────────────────────────────────────────────

function brandSlug(name: string): string {
  return normalize(name).replace(/\s+/g, '-');
}

function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
}

async function ensureBrand(name: string): Promise<string> {
  const slug = brandSlug(name);
  const { data: existing } = await supabase.from('brands').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) return existing.id;
  const { data: inserted, error } = await supabase.from('brands').insert({ name, slug }).select('id').single();
  if (error) throw new Error(`Brand insert failed (${name}): ${error.message}`);
  return inserted.id;
}

async function upsertFragrance(brandId: string, p: ParsedProduct): Promise<string> {
  const slug = fragranceSlug(p.brand, p.name);
  const payload: Record<string, unknown> = {
    brand_id:      brandId,
    slug,
    name:          p.name,
    concentration: p.concentration,
    gender:        p.gender,
    image_url:     p.image_url || null,
  };
  const { data, error } = await supabase
    .from('fragrances')
    .upsert(payload, { onConflict: 'slug' })
    .select('id')
    .single();
  if (error) throw new Error(`Fragrance upsert failed (${p.brand} ${p.name}): ${error.message}`);
  return data.id;
}

async function upsertRetailerLink(fragranceId: string, p: ParsedProduct): Promise<void> {
  const payload = {
    fragrance_id:      fragranceId,
    retailer:          RETAILER_ID,
    url:               p.retailer_url,
    our_affiliate_tag: null,             // CJ tag is already in the URL itself
    price_cents:       p.price_cents,
    size_ml:           p.size_ml,
    in_stock:          p.in_stock,
    last_seen_at:      new Date().toISOString(),
  };
  const { error } = await supabase
    .from('fragrance_retailer_links')
    .upsert(payload, { onConflict: 'fragrance_id,retailer' });
  if (error) throw new Error(`Retailer link upsert failed (${fragranceId}): ${error.message}`);
}

// ─── Schema check ─────────────────────────────────────────────────────────────

async function assertSchema() {
  const { error } = await supabase
    .from('fragrance_retailer_links')
    .select('id, fragrance_id, retailer, url, price_cents, size_ml, in_stock, last_seen_at')
    .limit(0);
  if (error) throw new Error(`Schema check failed: ${error.message}. Run migrations first.`);
  console.log('Schema check passed.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SKIP_THRESHOLD = 0.1; // abort if >10% of rows fail

async function main() {
  // 0. Verify DB schema before downloading anything
  await assertSchema();

  const tmpDir   = os.tmpdir();
  const localZip = path.join(tmpDir, 'fragranceshop-feed.txt.zip');
  let txtPath    = path.join(tmpDir, 'fragranceshop-feed.txt');

  try {
    // 1. Download from CJ SFTP
    await downloadFeed(localZip);

    // 2. Unzip
    console.log('Unzipping...');
    execSync(`unzip -o "${localZip}" -d "${tmpDir}"`);
    const extracted = fs.readdirSync(tmpDir).find(f => f.endsWith('.txt') && f.includes('FragranceShop'));
    txtPath = extracted ? path.join(tmpDir, extracted) : txtPath;
    if (!fs.existsSync(txtPath)) throw new Error(`Could not find extracted txt file in ${tmpDir}`);
    console.log(`Extracted: ${txtPath}`);

    // 3. Parse CSV
    console.log('Parsing CSV...');
    const raw = fs.readFileSync(txtPath, 'utf8');
    const rows: FeedRow[] = csvParse(raw, {
      columns:          true,
      skip_empty_lines: true,
      relax_quotes:     true,
      trim:             true,
    });
    console.log(`Total feed rows: ${rows.length}`);

    // 4. Filter + parse
    const products = rows.map(parseRow).filter((p): p is ParsedProduct => p !== null);
    console.log(`Fragrance rows after filter: ${products.length}`);

    // 5. Upsert into Supabase
    let inserted = 0, skipped = 0;
    const brandCache: Record<string, string> = {};

    for (const p of products) {
      try {
        if (!brandCache[p.brand]) {
          brandCache[p.brand] = await ensureBrand(p.brand);
        }
        const brandId     = brandCache[p.brand];
        const fragranceId = await upsertFragrance(brandId, p);
        await upsertRetailerLink(fragranceId, p);
        inserted++;
        if (inserted % 100 === 0) console.log(`  Upserted ${inserted}/${products.length}...`);
      } catch (err) {
        console.warn(`  SKIP ${p.brand} - ${p.name}: ${(err as Error).message}`);
        skipped++;
        if (products.length > 100 && skipped / products.length > SKIP_THRESHOLD) {
          throw new Error(`Aborting: skip rate ${(skipped / products.length * 100).toFixed(1)}% exceeds ${SKIP_THRESHOLD * 100}% threshold. Check schema and DB connectivity.`);
        }
      }
    }

    console.log(`\nDone. Upserted: ${inserted} | Skipped: ${skipped}`);
  } finally {
    if (fs.existsSync(localZip)) fs.unlinkSync(localZip);
    if (fs.existsSync(txtPath))  fs.unlinkSync(txtPath);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
