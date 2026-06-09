/**
 * audit-live-catalog (read-only)
 *
 * PRD §8.2: measure the LIVE `fragrances` table before any backfill/migration
 * work. Writes nothing. Sizes the note-coverage and dupe-coverage gap so we
 * spend the backfill budget where it matters.
 *
 * Reports:
 *   - active count; purchasable count (>=1 row in fragrance_retailer_links)
 *   - note-pyramid coverage (top/heart/base) overall + by brand tier
 *   - same, restricted to the purchasable catalog (the set that actually matters)
 *   - top_accords coverage; dupe_of coverage; similar_fragrance_ids coverage
 *   - the new relational tables (fragrance_dupes / fragrance_similars) if present
 *   - designer-brand presence spot-check (Dior, Versace, Paco Rabanne, ...)
 *
 * Usage: npx tsx scripts/audit-live-catalog.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

type Frag = {
  id: string;
  slug: string;
  brand_id: string;
  top_notes: string[] | null;
  heart_notes: string[] | null;
  base_notes: string[] | null;
  top_accords: string[] | null;
  dupe_of: string | null;
  similar_fragrance_ids: string[] | null;
  retail_msrp_usd_cents: number | null;
  release_year: number | null;
  is_active: boolean;
};

function pct(n: number, d: number): string {
  return d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`;
}

function hasPyramid(f: Frag): boolean {
  return (f.top_notes?.length ?? 0) + (f.heart_notes?.length ?? 0) + (f.base_notes?.length ?? 0) > 0;
}

async function fetchAllActive(): Promise<Frag[]> {
  const all: Frag[] = [];
  const COLS =
    'id,slug,brand_id,top_notes,heart_notes,base_notes,top_accords,dupe_of,similar_fragrance_ids,retail_msrp_usd_cents,release_year,is_active';
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('fragrances')
      .select(COLS)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    all.push(...((data ?? []) as Frag[]));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

async function fetchBrandTiers(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('brands')
      .select('id,tier,name')
      .order('id', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const b of data ?? []) map.set(b.id as string, (b.tier as string) ?? 'unknown');
    if ((data ?? []).length < 1000) break;
  }
  return map;
}

/** Distinct fragrance_ids that have >=1 retailer link → "purchasable". */
async function fetchPurchasableIds(): Promise<Set<string>> {
  const set = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('fragrance_retailer_links')
      .select('fragrance_id')
      .order('fragrance_id', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) {
      console.warn(`  (fragrance_retailer_links unreadable: ${error.message})`);
      break;
    }
    for (const r of data ?? []) set.add(r.fragrance_id as string);
    if ((data ?? []).length < 1000) break;
  }
  return set;
}

async function tableCount(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}

async function main() {
  console.log('=== LIVE CATALOG AUDIT (read-only) ===\n');

  const [frags, tiers, purchasable] = await Promise.all([
    fetchAllActive(),
    fetchBrandTiers(),
    fetchPurchasableIds(),
  ]);

  const total = frags.length;
  const purch = frags.filter((f) => purchasable.has(f.id));

  console.log(`Active fragrances:        ${total}`);
  console.log(`Purchasable (>=1 link):   ${purch.length} (${pct(purch.length, total)})`);
  console.log('');

  // ── Coverage, overall ──
  const withPyr = frags.filter(hasPyramid).length;
  const withAccords = frags.filter((f) => (f.top_accords?.length ?? 0) > 0).length;
  const withDupe = frags.filter((f) => f.dupe_of != null).length;
  const withSimilar = frags.filter((f) => (f.similar_fragrance_ids?.length ?? 0) > 0).length;
  const withMsrp = frags.filter((f) => f.retail_msrp_usd_cents != null).length;
  const withYear = frags.filter((f) => f.release_year != null).length;

  console.log('── Coverage (all active) ──');
  console.log(`  note pyramid:           ${withPyr}/${total} (${pct(withPyr, total)})`);
  console.log(`  top_accords:            ${withAccords}/${total} (${pct(withAccords, total)})`);
  console.log(`  msrp:                   ${withMsrp}/${total} (${pct(withMsrp, total)})`);
  console.log(`  release_year:           ${withYear}/${total} (${pct(withYear, total)})`);
  console.log(`  dupe_of (legacy col):   ${withDupe}/${total} (${pct(withDupe, total)})`);
  console.log(`  similar_ids (legacy):   ${withSimilar}/${total} (${pct(withSimilar, total)})`);
  console.log('');

  // ── Coverage on the purchasable set (the one that matters) ──
  const pPyr = purch.filter(hasPyramid).length;
  const pAccords = purch.filter((f) => (f.top_accords?.length ?? 0) > 0).length;
  const pMsrp = purch.filter((f) => f.retail_msrp_usd_cents != null).length;
  console.log('── Coverage (PURCHASABLE only) ──');
  console.log(`  note pyramid:           ${pPyr}/${purch.length} (${pct(pPyr, purch.length)})  [PRD target >=80%]`);
  console.log(`  top_accords:            ${pAccords}/${purch.length} (${pct(pAccords, purch.length)})`);
  console.log(`  msrp:                   ${pMsrp}/${purch.length} (${pct(pMsrp, purch.length)})`);
  console.log('');

  // ── Note coverage by brand tier ──
  console.log('── Note-pyramid coverage by brand tier (all active) ──');
  const tierBuckets = new Map<string, { total: number; pyr: number; purch: number; purchPyr: number }>();
  for (const f of frags) {
    const tier = tiers.get(f.brand_id) ?? 'unknown';
    const b = tierBuckets.get(tier) ?? { total: 0, pyr: 0, purch: 0, purchPyr: 0 };
    b.total++;
    if (hasPyramid(f)) b.pyr++;
    if (purchasable.has(f.id)) {
      b.purch++;
      if (hasPyramid(f)) b.purchPyr++;
    }
    tierBuckets.set(tier, b);
  }
  for (const [tier, b] of [...tierBuckets.entries()].sort((a, c) => c[1].total - a[1].total)) {
    console.log(
      `  ${tier.padEnd(9)} total=${String(b.total).padStart(5)}  pyr=${pct(b.pyr, b.total).padStart(6)}` +
      `   purchasable=${String(b.purch).padStart(5)}  purch-pyr=${pct(b.purchPyr, b.purch).padStart(6)}`,
    );
  }
  console.log('');

  // ── New relational tables (post-migration sanity) ──
  console.log('── Relational dupe/similar tables (present only after migration) ──');
  for (const t of ['fragrance_dupes', 'fragrance_similars']) {
    const c = await tableCount(t);
    console.log(`  ${t.padEnd(20)} ${c == null ? 'NOT PRESENT' : `${c} rows`}`);
  }
  console.log('');

  // ── Designer-brand spot check (PRD §8.1 flagged these absent in enrichment) ──
  console.log('── Designer brand presence (live catalog) ──');
  const designers = ['Dior', 'Versace', 'Paco Rabanne', 'Jean Paul Gaultier', 'Gucci', 'Azzaro', 'Mugler', 'Carolina Herrera', 'Valentino', 'Chanel', 'Tom Ford'];
  for (const name of designers) {
    const { count, error } = await supabase
      .from('fragrances')
      .select('id, brands!inner(name)', { count: 'exact', head: true })
      .ilike('brands.name', `%${name}%`)
      .eq('is_active', true);
    console.log(`  ${name.padEnd(20)} ${error ? `err: ${error.message}` : `${count ?? 0} active`}`);
  }

  console.log('\n=== END AUDIT ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
