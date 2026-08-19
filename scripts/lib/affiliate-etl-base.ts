/**
 * Shared base library for CJ affiliate ETL scripts.
 *
 * Provides:
 *   - AffiliateProduct interface
 *   - String normalization helpers
 *   - Dupe/inspired-by filter
 *   - Concentration and gender parsers
 *   - Core Supabase upsert function (brands → fragrances → fragrance_retailer_links)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AffiliateProduct {
  brand:         string;
  name:          string;
  concentration: string | null;
  gender:        'feminine' | 'masculine' | 'unisex';
  image_url:     string;
  affiliate_url: string;
  price_cents:   number | null;
  retailer_id:   string;   // e.g. 'fragranceshop' | 'perfumania'
  source_id:     string;   // retailer's product ID or SKU
  /** Checkout 2.0 (plans/PRD-checkout-2.0.md): CJ-wrapped Shopify cart
   *  permalink that lands the buyer on checkout with the item in the bag.
   *  Only Shopify retailers can build one; omit/null => the client falls
   *  back to affiliate_url (today's product-page handoff). */
  checkout_url?: string | null;
  /** The Shopify variant id checkout_url was built from (debug/rebuild). */
  checkout_variant_id?: number | null;
}

export interface UpsertResult {
  created: number;
  updated: number;
  linked:  number;
}

// ─── String normalization ─────────────────────────────────────────────────────

/**
 * Lowercase, strip diacritics, replace non-alphanumeric runs with a single
 * space, trim. Mirrors the `normalize` function in scripts/types.ts.
 */
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents (Hermès → hermes)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Stable slug for a fragrance: "<brand-slug>-<name-slug>".
 * Spaces in the normalized parts become hyphens.
 */
export function fragranceSlug(brand: string, name: string): string {
  const b = normalizeStr(brand).replace(/\s+/g, '-');
  const n = normalizeStr(name).replace(/\s+/g, '-');
  return `${b}-${n}`;
}

/**
 * Stable slug for a brand name.
 */
export function brandSlug(name: string): string {
  return normalizeStr(name).replace(/\s+/g, '-');
}

// ─── SKU-variant name canonicalization ───────────────────────────────────────
// Brand-site scrapers title products by SKU/format ("Dragonfly Deluxe Bottle",
// "… Travel Spray", "… Sample", "Aventus 100ml"), so one scent lands as several
// rows. This strips the trailing SKU/format tag so variants collapse to one
// canonical fragrance at merge time (see scripts/dedupe-sku-variants.ts, which
// retro-cleans rows already in the catalog with the exact same logic).
//
// NEVER strips concentration (elixir/intense/parfum/EDP…) or flanker words (for
// her, noir…) — those are genuinely distinct fragrances. Requires a leading word
// boundary so it can't bite a word-suffix ("mini" inside "Gemini"), and reverts
// any strip that leaves a dangling connective ("Bestsellers Set of").
const _VARIANT_WORD =
  '(?:samples?|testers?|decants?|travel\\s*sprays?|travel\\s*size|purse\\s*spray|' +
  'deluxe\\s*bottle|gift\\s*set|discovery\\s*set|value\\s*set|mini(?:ature)?s?|' +
  'refills?|\\d+(?:\\.\\d+)?\\s*(?:ml|mls|milliliters?|oz|ounces?|g|grams?))';
const _CONC_OPT = '(?:\\s*(?:edp|edt|edc|parfum|cologne|eau\\s*de\\s*\\w+))?';
const _VARIANT_TAIL = new RegExp(
  `[\\s\\-–—(\\[]+${_VARIANT_WORD}${_CONC_OPT}(?:\\s*sprays?)?[\\s)\\]]*$`, 'i',
);
const _MINOR_TAIL = new Set(['of', 'de', 'du', 'des', 'the', 'a', 'an', 'and', 'le', 'la', 'les', 'y', 'et', '&']);

/** Strip a trailing SKU/format tag so "X Sample" / "X 50ml" → "X". */
export function stripVariantSuffix(name: string): string {
  let out = name.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(_VARIANT_TAIL, '').replace(/[\s\-–—(\[&]+$/, '').trim();
    if (next === out || next.length < 3) break;
    const lastWord = next.split(/\s+/).pop()!.replace(/[^a-z0-9&]/gi, '').toLowerCase();
    if (_MINOR_TAIL.has(lastWord)) break;
    out = next;
  }
  return out;
}

// ─── Dupe / inspired-by filter ────────────────────────────────────────────────

/**
 * Patterns whose presence in the product title signals a dupe, inspired-by,
 * or non-genuine fragrance that should be skipped.
 *
 * NOTE: gift sets, bundles, minis are intentionally NOT listed here —
 * those are filtered per-feed by concentration parsing / category logic.
 */
export const DUPE_PATTERNS: string[] = [
  'body perfume for',
  'impression of',
  'inspired by',
  'type for',
  'our version',
  'compare to',
  'body spray oil',
  'our impression',
  'type perfume oil',
  'type cologne oil',
  'perfume oil roll-on',
  'perfume oil 1 oz',
  'perfume oil 1/3 oz',
  'gift set',
  ' piece set',
  '2 piece',
  '3 piece',
  '4 piece',
  '5 piece',
  'mini set',
  'value set',
  'coffret',
  'body lotion',
  'shower gel',
  'shampoo',
  'self tan',
  'bronzing mousse',
  'hand cream',
  'body scrub',
  'body wash',
  'body butter',
];

/** Returns true if the product title matches any DUPE_PATTERNS entry. */
export function isDupe(title: string): boolean {
  const lower = title.toLowerCase();
  return DUPE_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Patterns for listings that are NOT a wearable fragrance and must never enter
 * the catalog: tester bottles (non-retail packaging) and body-care products.
 * Mirrors the classifiers in scripts/deactivate-junk-listings.ts so the cleanup
 * and the ETL agree on what "junk" means.
 */
export const NON_PERFUME_PATTERNS: RegExp[] = [
  /\btester\b/i,
  /after\s*shave/i,
  /shav(e|ing)\s+(balm|gel|cream|foam)/i,
  /\bdeodorant\b/i,
  /\bbody\s+(lotion|cream|milk|butter|souffl|powder|mist)/i,
  /\bdusting\s+powder\b/i,
  /\b(bar\s+soap|soap\s+with)\b/i,
  /\bmoisturi[sz]ing\s+cream\b/i,
  /\banti-?stress\b.*cream/i,
];

/** True for tester bottles and body-care products that aren't a fragrance. */
export function isJunkListing(title: string): boolean {
  return NON_PERFUME_PATTERNS.some((re) => re.test(title));
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

const CONCENTRATION_PATTERNS: Array<[RegExp, string]> = [
  [/\bextrait\s+de\s+parfum\b/i, 'extrait'],
  [/\bextrait\b/i,               'extrait'],
  [/\bparfum\b/i,                'parfum'],
  [/\beau\s+de\s+parfum\b/i,    'edp'],
  [/\bedp\b/i,                   'edp'],
  [/\beau\s+de\s+toilette\b/i,  'edt'],
  [/\bedt\b/i,                   'edt'],
  [/\beau\s+de\s+cologne\b/i,   'cologne'],
  [/\bedc\b/i,                   'cologne'],
  [/\bcologne\b/i,               'cologne'],
  [/\bbody\s+mist\b/i,          'mist'],
  [/\bhair\s+mist\b/i,          'mist'],
  [/\bperfume\s+oil\b/i,        'oil'],
  [/\bfragrance\s+oil\b/i,      'oil'],
  [/\bsolid\s+perfume\b/i,      'solid'],
];

/**
 * Extract concentration from a product title.
 * Returns one of: 'parfum' | 'extrait' | 'edp' | 'edt' | 'cologne' |
 *                 'mist' | 'oil' | 'solid' | null
 */
export function parseConcentration(title: string): string | null {
  for (const [re, conc] of CONCENTRATION_PATTERNS) {
    if (re.test(title)) return conc;
  }
  return null;
}

/**
 * Infer gender from title keywords and an optional feed-supplied gender field.
 * Maps to the three values used in the fragrances DB column: 'men' | 'women' | 'unisex'.
 *
 * @param title       Product title (e.g. "Bleu de Chanel for Men - Eau de Parfum")
 * @param brandGender Optional raw gender string from the feed (e.g. 'male', 'female', 'unisex')
 */
export function parseGender(
  title: string,
  brandGender?: string,
): 'feminine' | 'masculine' | 'unisex' {
  // First try the structured feed field
  const g = (brandGender ?? '').toLowerCase().trim();
  if (g === 'male' || g === 'men' || g === 'masculine')    return 'masculine';
  if (g === 'female' || g === 'women' || g === 'feminine') return 'feminine';
  if (g === 'unisex')                                       return 'unisex';

  // Fall back to title keywords
  const t = title.toLowerCase();
  if (/\bpour\s+femme\b|\bfor\s+women\b|\bwomen'?s\b|\bher\b/.test(t)) return 'feminine';
  if (/\bpour\s+homme\b|\bfor\s+men\b|\bmen'?s\b|\bhim\b/.test(t))     return 'masculine';
  if (/\bunisex\b/.test(t))                                               return 'unisex';

  // Default
  return 'unisex';
}

// ─── Core upsert ─────────────────────────────────────────────────────────────

/**
 * Upserts a batch of AffiliateProducts into Supabase:
 *
 *   1. Collect all unique brand names → upsert to `brands` (name, slug).
 *   2. For each product, upsert to `fragrances` (slug, name, brand_id,
 *      concentration, gender, image_url, is_active=true).
 *      On slug conflict: update image_url only if existing is null.
 *   3. Upsert to `fragrance_retailer_links` (fragrance_id, retailer, url,
 *      price_cents). On conflict(fragrance_id, retailer): update price_cents + url.
 *
 * Returns counts of { created, updated, linked }.
 */
/** Retailer-link row shape. checkout_* keys are ABSENT (not null) unless the
 *  calling ETL manages them — an absent key means PostgREST leaves the column
 *  untouched on conflict-update, so a non-Shopify ETL (e.g. the CJ SFTP feed)
 *  can never clobber another ETL's permalinks (Mark Z review, P0 #1). */
export interface LinkRow {
  fragrance_id: string;
  retailer:     string;
  url:          string;
  price_cents:  number | null;
  checkout_url?: string | null;
  checkout_variant_id?: number | null;
}

/** Pure row builder — exported so tests can pin the clobber-guard contract. */
export function buildLinkRow(
  fragId: string,
  p: AffiliateProduct,
  manageCheckout: boolean,
): LinkRow {
  const row: LinkRow = {
    fragrance_id: fragId,
    retailer:     p.retailer_id,
    url:          p.affiliate_url,
    price_cents:  p.price_cents,
  };
  if (manageCheckout) {
    // Explicit null (not undefined) so the OWNING ETL clears a stale permalink
    // it can no longer build; other ETLs never touch the columns at all.
    row.checkout_url        = p.checkout_url ?? null;
    row.checkout_variant_id = p.checkout_variant_id ?? null;
  }
  return row;
}

export async function upsertProducts(
  supabase: SupabaseClient,
  products: AffiliateProduct[],
  retailerLabel: string,
  /** manageCheckout: ONLY the ETL that owns checkout permalinks (the perfumania
   *  Shopify ETL) passes true. Default false = checkout columns untouched. */
  opts: { manageCheckout?: boolean } = {},
): Promise<UpsertResult> {
  const result: UpsertResult = { created: 0, updated: 0, linked: 0 };
  if (!products.length) return result;

  // ── Step 1: ensure all brands exist, build id map ────────────────────────

  const uniqueBrands = [...new Set(products.map((p) => p.brand))];
  const brandIdMap = new Map<string, string>();

  // Batch-upsert brands
  const brandRows = uniqueBrands.map((name) => ({ name, slug: brandSlug(name) }));
  const { error: brandErr } = await supabase
    .from('brands')
    .upsert(brandRows, { onConflict: 'slug', ignoreDuplicates: true });
  if (brandErr) {
    throw new Error(`[${retailerLabel}] brands upsert failed: ${brandErr.message}`);
  }

  // Fetch IDs back (upsert doesn't return rows on ignoreDuplicates)
  const { data: brandData, error: brandFetchErr } = await supabase
    .from('brands')
    .select('id, slug')
    .in('slug', uniqueBrands.map(brandSlug));
  if (brandFetchErr) {
    throw new Error(`[${retailerLabel}] brands fetch failed: ${brandFetchErr.message}`);
  }
  for (const row of brandData ?? []) {
    brandIdMap.set(row.slug, row.id);
  }

  // ── Step 2 + 3: upsert fragrances and retailer links in batches ──────────

  const BATCH = 200;

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);

    // Build fragrance upsert payloads
    const fragranceRows = batch.map((p) => {
      const slug    = fragranceSlug(p.brand, p.name);
      const bSlug   = brandSlug(p.brand);
      const brandId = brandIdMap.get(bSlug);
      if (!brandId) {
        throw new Error(`[${retailerLabel}] Missing brand ID for "${p.brand}" (slug: ${bSlug})`);
      }
      return {
        slug,
        name:          p.name,
        brand_id:      brandId,
        concentration: p.concentration ?? null,
        gender:        p.gender,
        image_url:     p.image_url || null,
        is_active:     true,
      };
    });

    // Upsert fragrances — on slug conflict do NOT overwrite existing image_url
    // We achieve "update image_url only when null" by using a raw UPDATE with
    // COALESCE via the merge-duplicate strategy: set image_url = COALESCE(excluded.image_url, fragrances.image_url).
    // PostgREST doesn't expose COALESCE in upsert, so we use ignoreDuplicates=false
    // and accept that existing image_url may be overwritten only when incoming is non-null.
    // For full correctness, use two passes: insert-ignore first, then targeted update.

    // Pass A: insert new rows (ignoreDuplicates=true → skip existing)
    const { error: insertErr } = await supabase
      .from('fragrances')
      .upsert(fragranceRows, { onConflict: 'slug', ignoreDuplicates: true });
    if (insertErr) {
      console.warn(`[${retailerLabel}] fragrance insert pass failed: ${insertErr.message}`);
    }

    // Fetch back all IDs for this batch's slugs
    const slugs = fragranceRows.map((r) => r.slug);
    const { data: fragData, error: fragFetchErr } = await supabase
      .from('fragrances')
      .select('id, slug, image_url')
      .in('slug', slugs);
    if (fragFetchErr) {
      console.warn(`[${retailerLabel}] fragrance fetch failed: ${fragFetchErr.message}`);
      continue;
    }

    const fragBySlug = new Map<string, { id: string; image_url: string | null }>();
    for (const row of fragData ?? []) {
      fragBySlug.set(row.slug, { id: row.id, image_url: row.image_url });
    }

    // Pass B: for existing rows where image_url is null, update it
    const imageUpdates = batch
      .map((p) => {
        const slug = fragranceSlug(p.brand, p.name);
        const existing = fragBySlug.get(slug);
        if (!existing || existing.image_url || !p.image_url) return null;
        return { id: existing.id, image_url: p.image_url };
      })
      .filter((u): u is { id: string; image_url: string } => u !== null);

    for (const update of imageUpdates) {
      const { error: updateErr } = await supabase
        .from('fragrances')
        .update({ image_url: update.image_url })
        .eq('id', update.id)
        .is('image_url', null);
      if (updateErr) {
        console.warn(`[${retailerLabel}] image_url update failed for ${update.id}: ${updateErr.message}`);
      } else {
        result.updated++;
      }
    }

    // Count newly created rows (those that didn't exist before the batch)
    result.created += batch.filter((p) => {
      const slug = fragranceSlug(p.brand, p.name);
      return fragBySlug.has(slug);
    }).length;

    // ── Step 3: upsert retailer links ───────────────────────────────────────

    // Deduplicate by fragrance_id — keep cheapest price when multiple products
    // in the same batch resolve to the same fragrance slug.
    const linkMap = new Map<string, LinkRow>();

    for (const p of batch) {
      const slug   = fragranceSlug(p.brand, p.name);
      const fragId = fragBySlug.get(slug)?.id;
      if (!fragId) continue;

      const existing = linkMap.get(fragId);
      const cheaper  =
        !existing ||
        (p.price_cents !== null &&
          (existing.price_cents === null || p.price_cents < existing.price_cents));

      if (cheaper) {
        linkMap.set(fragId, buildLinkRow(fragId, p, opts.manageCheckout === true));
      }
    }

    const linkRows = [...linkMap.values()];
    if (linkRows.length > 0) {
      const { error: linkErr } = await supabase
        .from('fragrance_retailer_links')
        .upsert(linkRows, { onConflict: 'fragrance_id,retailer' });
      if (linkErr) {
        console.warn(`[${retailerLabel}] retailer links upsert failed: ${linkErr.message}`);
      } else {
        result.linked += linkRows.length;
      }
    }

    console.log(
      `[${retailerLabel}] batch ${i + 1}–${Math.min(i + BATCH, products.length)} / ${products.length}` +
      ` | linked: ${result.linked}`,
    );
  }

  return result;
}
