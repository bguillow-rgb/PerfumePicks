/**
 * ETL: Perfumania Shopify → Supabase (Secondary / Fallback)
 *
 * Fetches all products from perfumania.com/products.json (public Shopify
 * endpoint), creates new fragrances where missing, and upserts affiliate
 * buy links into fragrance_retailer_links.
 *
 * Use this script when the Perfumania CJ SFTP feed path is not yet confirmed.
 * Once etl-cj-sftp.ts has a confirmed Perfumania remote_dir, prefer that.
 *
 * CJ tracking URL:
 *   https://www.jdoqocy.com/click-101759456-17277211?url={encodedProductUrl}
 *
 * Required env (in .env.local):
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/etl-perfumania-shopify.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import {
  type AffiliateProduct,
  isDupe,
  isJunkListing,
  parseConcentration,
  parseGender,
  upsertProducts,
} from './lib/affiliate-etl-base';
import {
  cjUrl,
  cjCartUrl,
  DEFAULT_CJ_WEBSITE_ID,
  PERFUMANIA_BASE_URL,
} from './lib/perfumania-urls';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── Env / client ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Constants ────────────────────────────────────────────────────────────────

const CJ_WEBSITE_ID = process.env.CJ_WEBSITE_ID || DEFAULT_CJ_WEBSITE_ID;
const BASE_URL      = PERFUMANIA_BASE_URL;
const RETAILER_ID   = 'perfumania';

// ─── Shopify types ────────────────────────────────────────────────────────────

interface ShopifyVariant {
  id:         number;
  title:      string;
  price:      string;
  available?: boolean;
}

interface ShopifyProduct {
  id:           number;
  title:        string;
  handle:       string;
  vendor:       string;
  product_type: string;
  tags:         string[];
  variants:     ShopifyVariant[];
  images:       Array<{ src: string }>;
}

// ─── Product-type guard ───────────────────────────────────────────────────────
//
// The authoritative non-fragrance signal is Perfumania's Shopify `product_type`,
// NOT the title. Skincare/makeup like "Advanced Night Repair" have no skip
// keyword in the title and used to leak into the catalog (461 rows). These two
// classifiers mirror scripts/deactivate-non-fragrance.ts exactly so the ETL and
// the cleanup agree on what counts as a fragrance.

/** A genuine wearable-fragrance product type — trust it, never reject. */
function isFragranceType(pt: string): boolean {
  const t = (pt || '').toLowerCase().trim();
  return /\b(fragrance|perfume|cologne|parfum|toilette|eau de|elixir|extrait|essence)\b/.test(t) || t === 'oil';
}

/** True only for skincare/makeup/bath/accessory product types (Bucket A). */
function isNonFragranceType(pt: string): boolean {
  const t = (pt || '').toLowerCase().trim();
  if (!t) return false;            // blank type → defer to title-based cleanTitle
  if (isFragranceType(t)) return false;
  return /(beauty|moisturi|body cream|body lotion|dusting powder|after\s*shave|aftershave|concentrate|thermale|skin|makeup|cosmetic|accessor|lip balm|\bcream\b|\blotion\b|serum|cleanser|toner|\bmask\b|deodorant)/.test(t);
}

// ─── Title cleaning ───────────────────────────────────────────────────────────

/** Suffixes to strip from the end of a product title */
const TYPE_SUFFIXES = [
  'eau de parfum', 'eau de toilette', 'eau de cologne', 'extrait de parfum',
  'parfum', 'cologne', 'perfume', 'fragrance', 'edt', 'edp',
  'body mist', 'body spray', 'shower gel', 'body lotion', 'deodorant',
  'hair mist', 'solid perfume', 'oil',
];

/**
 * Clean a Shopify product title into a fragrance name.
 * Returns null if the product should be skipped (dupe, accessory, non-fragrance).
 */
function cleanTitle(title: string, vendor: string): string | null {
  // Dupe / inspired-by check (base lib)
  if (isDupe(title)) return null;
  // Tester + body-care check (shared with the cleanup classifier)
  if (isJunkListing(title)) return null;

  let name = title;
  const lower = title.toLowerCase();

  // Skip non-fragrance categories that leak through
  const skipKeywords = [
    'aftershave', 'after shave', 'soap', 'candle', 'diffuser', 'refill',
    'samples', 'deodorant', 'body lotion', 'body wash', 'shower gel',
    'hair mist',
  ];
  if (skipKeywords.some((k) => lower.includes(k))) return null;

  // Strip " by Brand" suffix
  name = name.replace(/\s+by\s+.+$/i, '');

  // Strip " for Men/Women/Unisex" suffix
  name = name.replace(/\s+(for\s+(men|women|him|her|unisex))$/i, '');

  // Strip type / concentration suffixes from end
  const suffixPattern = new RegExp(
    `\\s+(${TYPE_SUFFIXES.map((s) => s.replace(/\s/g, '\\s+')).join('|')})$`,
    'i',
  );
  name = name.replace(suffixPattern, '').trim();

  // Strip size suffixes (e.g. " 3.4 oz", " 100ml")
  name = name.replace(/\s+\d[\d.]*\s*(oz|ml|fl\.?\s*oz).*$/i, '').trim();

  // If name still starts with vendor name, strip it
  const vendorLower = vendor.toLowerCase();
  const nameLower   = name.toLowerCase();
  if (nameLower.startsWith(vendorLower + ' ')) {
    name = name.slice(vendor.length).trim();
  }

  if (name.length < 2) return null;
  return name.trim();
}

// ─── Shopify fetch ────────────────────────────────────────────────────────────

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  const url = `${BASE_URL}/products.json?limit=250&page=${page}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      if (res.status === 503 || res.status === 429) {
        const wait = attempt * 3000;
        console.log(`  Page ${page} rate-limited (${res.status}), retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) return [];
      const data = (await res.json()) as { products: ShopifyProduct[] };
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
    console.log(`  Page ${page}: ${products.length} products (total: ${all.length})`);
    page++;
    await new Promise((r) => setTimeout(r, 600));
  }
  return all;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Fetching Perfumania Shopify products...');
  const shopifyProducts = await fetchAllProducts();
  console.log(`Total Shopify products: ${shopifyProducts.length}`);

  // Map Shopify products → AffiliateProduct
  const products: AffiliateProduct[] = [];
  let dupeCount = 0;
  let skipCount = 0;

  let typeSkipCount = 0;
  for (const p of shopifyProducts) {
    // Reject skincare/makeup/bath/accessory by authoritative feed product_type
    // before any title cleaning — this is the gate that stops the 461-row leak.
    if (isNonFragranceType(p.product_type)) { typeSkipCount++; continue; }

    const name = cleanTitle(p.title, p.vendor);
    if (!name) {
      if (isDupe(p.title)) dupeCount++;
      else skipCount++;
      continue;
    }

    // Pick cheapest variant with a valid price. For Checkout 2.0 the pick must
    // ALSO be available — a cart permalink pointing at a sold-out variant lands
    // the buyer on an empty/blocked checkout with no way to detect it (Mark Z
    // review #2). `available !== false` keeps feeds that omit the field.
    const validVariants = p.variants
      .filter((v) => parseFloat(v.price) > 0)
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    if (!validVariants.length) { skipCount++; continue; }

    // Cheapest AVAILABLE variant drives BOTH the shown price and the permalink,
    // so the checkout total always matches the Buy button. Only when NO variant
    // is available do we fall back to the cheapest for price display — and then
    // build no permalink at all (product-page handoff).
    const availableVariants = validVariants.filter((v) => v.available !== false);
    const best        = availableVariants[0] ?? validVariants[0];
    const canCheckout = availableVariants.length > 0;
    const price_cents = Math.round(parseFloat(best.price) * 100);
    const image_url   = p.images[0]?.src ?? '';

    products.push({
      brand:         p.vendor.trim(),
      name,
      concentration: parseConcentration(p.title),
      gender:        parseGender(p.title),
      image_url,
      affiliate_url: cjUrl(p.handle, CJ_WEBSITE_ID),
      price_cents,
      retailer_id:   RETAILER_ID,
      source_id:     String(p.id),
      checkout_url:        canCheckout ? cjCartUrl(best.id, CJ_WEBSITE_ID) : null,
      checkout_variant_id: canCheckout ? best.id : null,
    });
  }

  console.log(
    `Candidates after cleaning: ${products.length}` +
    ` | dupes skipped: ${dupeCount}` +
    ` | non-fragrance type skipped: ${typeSkipCount}` +
    ` | other skipped: ${skipCount}`,
  );

  // Upsert — creates new fragrances AND adds retailer links. This ETL is the
  // ONE owner of the checkout columns (clobber guard: every other caller of
  // upsertProducts leaves them untouched).
  const result = await upsertProducts(supabase, products, RETAILER_ID, { manageCheckout: true });

  console.log(
    `\nDone.` +
    ` fragrances created: ${result.created}` +
    ` | images updated: ${result.updated}` +
    ` | retailer links upserted: ${result.linked}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
