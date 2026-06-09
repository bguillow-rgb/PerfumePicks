/**
 * Backfill retail_msrp_usd_cents + price_tier on existing fragrance rows.
 *
 * Matches JSON entries to DB rows by fetching all DB slugs, then trying:
 *   1. Exact slug match using the full "brand-name" key
 *   2. Suffix match — DB slug ends with "-<normalized-name>" (handles brand
 *      aliases like "Demeter Fragrance" → "Demeter" in DB)
 *
 * Only patches rows where retail_msrp_usd_cents is currently null/0.
 * Never overwrites an existing non-zero price.
 *
 * price_tier derived from retail_msrp_usd_cents (5-point scale):
 *   1 = under $30  |  2 = $30–$79  |  3 = $80–$149  |  4 = $150–$299  |  5 = $300+
 *
 * Run:
 *   source .env.local && npx tsx scripts/backfill-prices.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalize } from './types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function priceTier(cents: number): number {
  if (cents < 3000)  return 1;
  if (cents < 8000)  return 2;
  if (cents < 15000) return 3;
  if (cents < 30000) return 4;
  return 5;
}

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'enriched-candidates.json'), 'utf-8'),
  ) as Array<{ brand: string; name: string; retail_msrp_usd_cents: number | null }>;

  const withPrice = raw.filter((r) => r.retail_msrp_usd_cents && r.retail_msrp_usd_cents > 0);
  console.log(`Entries with price in JSON: ${withPrice.length} / ${raw.length}`);

  // Fetch ALL fragrance rows from DB (id, slug, current price).
  const PAGE = 1000;
  let offset = 0;
  const dbRows: { id: string; slug: string; retail_msrp_usd_cents: number | null }[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, slug, retail_msrp_usd_cents')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error); process.exit(1); }
    if (!data || data.length === 0) break;
    dbRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`DB rows fetched: ${dbRows.length}`);

  // Build lookup: normalized-name-suffix → array of db rows sharing that name suffix.
  // This handles brand alias mismatches — we match on name alone when slug prefix differs.
  const byNameSuffix = new Map<string, typeof dbRows>();
  for (const row of dbRows) {
    // slug format: "<brand-slug>-<name-slug>"
    // Extract name suffix: everything after first hyphen-group that matches the name.
    // Simpler: just use the full slug as a key, AND also index by the last N tokens.
    // Strategy: split slug on '-', try matching the last 1..N tokens against the JSON name.
    byNameSuffix.set(row.slug, [row]); // exact slug key
  }

  // Also build name-only index for fuzzy brand matching.
  const byNormalizedName = new Map<string, typeof dbRows>();
  for (const row of dbRows) {
    // Extract just the name portion from the slug by stripping the leading brand prefix.
    // We can't know exactly where brand ends / name begins from slug alone,
    // so index by the full slug AND by every possible "tail" of the slug.
    const parts = row.slug.split('-');
    for (let i = 1; i < parts.length; i++) {
      const tail = parts.slice(i).join('-');
      if (!byNormalizedName.has(tail)) byNormalizedName.set(tail, []);
      byNormalizedName.get(tail)!.push(row);
    }
  }

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let ambiguous = 0;

  for (const r of withPrice) {
    const normName = normalize(r.name).replace(/\s+/g, '-');
    const normBrand = normalize(r.brand).replace(/\s+/g, '-');
    const fullSlug = `${normBrand}-${normName}`;

    // Try 1: exact slug match
    let candidates = byNameSuffix.get(fullSlug) ?? [];

    // Try 2: name-suffix match (handles brand aliases)
    if (candidates.length === 0) {
      candidates = byNormalizedName.get(normName) ?? [];
    }

    if (candidates.length === 0) { noMatch++; continue; }

    // If multiple DB rows share this name suffix, skip to avoid wrong updates.
    if (candidates.length > 1) { ambiguous++; continue; }

    const row = candidates[0];
    if (row.retail_msrp_usd_cents && row.retail_msrp_usd_cents > 0) { skipped++; continue; }

    const { error } = await supabase
      .from('fragrances')
      .update({
        retail_msrp_usd_cents: r.retail_msrp_usd_cents,
        price_tier: priceTier(r.retail_msrp_usd_cents!),
      })
      .eq('id', row.id);

    if (error) {
      console.error(`  ✗ ${row.slug}:`, error.message);
    } else {
      updated++;
      if (updated % 200 === 0) console.log(`  updated ${updated}...`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Updated:              ${updated}`);
  console.log(`  Skipped (had price):  ${skipped}`);
  console.log(`  No DB match:          ${noMatch}`);
  console.log(`  Skipped (ambiguous):  ${ambiguous}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
