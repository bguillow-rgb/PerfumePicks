/**
 * ETL: Perfumania Shopify → fragrance_retailer_links
 *
 * Fetches all products from perfumania.com/products.json (public Shopify endpoint),
 * matches them to Supabase fragrances by slug, and upserts affiliate buy links.
 *
 * CJ tracking: https://www.jdoqocy.com/click-101759456-17277211?url={encodedProductUrl}
 *
 * Usage:
 *   npx tsx scripts/etl-perfumania-feed.ts
 *
 * Env required:
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const CJ_WEBSITE_ID = '101759456';   // Perfume Picks website ID — NOT the account CID (7966973); click- URLs need the website ID for mobile attribution
const CJ_ADVERTISER_ID = '17277211';
const BASE_URL = 'https://perfumania.com';

/** Build CJ tracking URL for a Perfumania product handle */
function cjUrl(handle: string): string {
  const dest = encodeURIComponent(`${BASE_URL}/products/${handle}`);
  return `https://www.jdoqocy.com/click-${CJ_WEBSITE_ID}-${CJ_ADVERTISER_ID}?url=${dest}`;
}

/** Normalize string for slug comparison */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
}

const TYPE_SUFFIXES = [
  'eau de parfum', 'eau de toilette', 'eau de cologne', 'extrait de parfum',
  'parfum', 'cologne', 'perfume', 'fragrance', 'edt', 'edp',
  'body mist', 'body spray', 'shower gel', 'body lotion', 'deodorant',
  'hair mist', 'solid perfume', 'oil',
];

const SKIP_KEYWORDS = [
  'gift set', 'set -', '- set', 'deodorant', 'body lotion', 'body wash',
  'shower gel', 'hair mist', 'aftershave', 'after shave', 'soap',
  'candle', 'diffuser', 'refill', 'samples',
];

function cleanTitle(title: string, vendor: string): string | null {
  let name = title;

  // Skip gift sets and non-fragrance products
  const lower = title.toLowerCase();
  if (SKIP_KEYWORDS.some((k) => lower.includes(k))) return null;

  // Strip " by Brand" suffix (e.g. "Versace Man Eau Fraiche by Versace for Men")
  name = name.replace(/\s+by\s+.+$/i, '');

  // Strip " for Men/Women/Unisex" suffix
  name = name.replace(/\s+(for\s+(men|women|him|her|unisex))$/i, '');

  // Strip type/concentration suffixes from end
  const suffixPattern = new RegExp(
    `\\s+(${TYPE_SUFFIXES.map((s) => s.replace(/\s/g, '\\s+')).join('|')})$`,
    'i',
  );
  name = name.replace(suffixPattern, '').trim();

  // Strip size suffixes (e.g. " 3.4 oz", " 100ml")
  name = name.replace(/\s+\d[\d.]*\s*(oz|ml|fl\.?\s*oz).*$/i, '').trim();

  // If name still starts with vendor name, strip it
  const vendorNorm = normalize(vendor);
  const nameNorm = normalize(name);
  if (nameNorm.startsWith(vendorNorm + ' ')) {
    name = name.slice(vendor.length).trim();
  }

  // Too short after cleaning → skip
  if (name.length < 2) return null;

  return name.trim();
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: Array<{
    id: number;
    title: string;
    price: string;
    available?: boolean;
  }>;
  images: Array<{ src: string }>;
}

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  const url = `${BASE_URL}/products.json?limit=250&page=${page}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (res.status === 503 || res.status === 429) {
        const wait = attempt * 3000;
        console.log(`    Page ${page} rate-limited (${res.status}), retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json() as { products: ShopifyProduct[] };
      return data.products ?? [];
    } catch (e) {
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return [];
}

async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let page = 1;
  while (true) {
    const products = await fetchPage(page);
    if (!products.length) break;
    all.push(...products);
    console.log(`  Fetched page ${page}: ${products.length} products (total: ${all.length})`);
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }
  return all;
}

async function main() {
  console.log('Fetching Perfumania products...');
  const products = await fetchAllProducts();
  console.log(`Total products fetched: ${products.length}`);

  // Parse candidates
  type Candidate = {
    vendor: string;
    name: string;
    slug: string;
    handle: string;
    price_cents: number;
    url: string;
  };
  const candidates: Candidate[] = [];

  for (const p of products) {
    const name = cleanTitle(p.title, p.vendor);
    if (!name) continue;

    // Pick cheapest variant with a valid price (exclude $0 / out-of-stock placeholder)
    const validVariants = p.variants
      .filter((v) => parseFloat(v.price) > 0)
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    if (!validVariants.length) continue;

    const best = validVariants[0];
    const price_cents = Math.round(parseFloat(best.price) * 100);

    candidates.push({
      vendor: p.vendor,
      name,
      slug: fragranceSlug(p.vendor, name),
      handle: p.handle,
      price_cents,
      url: cjUrl(p.handle),
    });
  }

  console.log(`Candidates after cleaning: ${candidates.length}`);

  // Batch-match slugs against Supabase
  const BATCH = 200;
  let matched = 0;
  let notFound = 0;
  let upserted = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const slugs = batch.map((c) => c.slug);

    const { data: rows, error } = await supabase
      .from('fragrances')
      .select('id, slug')
      .in('slug', slugs);

    if (error) { console.error('DB error:', error.message); continue; }

    const idBySlug = new Map((rows ?? []).map((r: any) => [r.slug, r.id]));

    // Deduplicate by fragrance_id — keep cheapest price when multiple
    // Perfumania SKUs clean to the same fragrance slug
    const byFragId = new Map<string, { fragrance_id: string; retailer: string; url: string; price_cents: number }>();
    for (const c of batch) {
      const fragId = idBySlug.get(c.slug);
      if (!fragId) continue;
      const existing = byFragId.get(fragId);
      if (!existing || c.price_cents < existing.price_cents) {
        byFragId.set(fragId, { fragrance_id: fragId, retailer: 'perfumania', url: c.url, price_cents: c.price_cents });
      }
    }
    const toUpsert = [...byFragId.values()];

    matched += toUpsert.length;
    notFound += batch.length - toUpsert.length;

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('fragrance_retailer_links')
        .upsert(toUpsert, { onConflict: 'fragrance_id,retailer' });
      if (upsertErr) console.error('Upsert error:', upsertErr.message);
      else upserted += toUpsert.length;
    }

    console.log(`  ${Math.min(i + BATCH, candidates.length)}/${candidates.length} | matched: ${matched} | not found: ${notFound} | upserted: ${upserted}`);
  }

  console.log(`\nDone. Upserted: ${upserted} | Not in DB: ${notFound}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
