/**
 * backfill-prices-from-links — populate fragrances.retail_msrp_usd_cents from
 * the affiliate ETL prices in fragrance_retailer_links.
 *
 * Only 124/7596 fragrances had a price, but ~7981 retailer_links carry
 * price_cents. The dupes RPC (get_dupes) computes savings as
 * original.retail_msrp_usd_cents - dupe.retail_msrp_usd_cents, so every
 * purchasable fragrance needs a real headline price or dupes show $0 saved.
 *
 * Per fragrance we pick the HERO SKU: the retailer link with the largest
 * size_ml (full bottle, not minis/samples/after-shave), tie-broken by the
 * highest price_cents. That price becomes retail_msrp_usd_cents.
 *
 * Only patches rows where retail_msrp_usd_cents is currently null/0 — never
 * overwrites an existing non-zero price (manual/editorial prices win).
 *
 * price_tier (5-point): 1 <$30 | 2 $30–79 | 3 $80–149 | 4 $150–299 | 5 $300+
 *
 * DRY RUN by default — prints what it WOULD do. Pass --commit to write.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/backfill-prices-from-links.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/backfill-prices-from-links.ts --commit
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function priceTier(cents: number): number {
  if (cents < 3000) return 1;
  if (cents < 8000) return 2;
  if (cents < 15000) return 3;
  if (cents < 30000) return 4;
  return 5;
}

type Link = { fragrance_id: string; price_cents: number | null; size_ml: number | null };

async function fetchAll<T>(
  table: string,
  cols: string,
  filter?: (q: any) => any,
): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(table).select(cols).range(offset, offset + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`${table} fetch error:`, error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log(`(${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  // Fragrances missing a price.
  const frags = await fetchAll<{ id: string; retail_msrp_usd_cents: number | null }>(
    'fragrances',
    'id, retail_msrp_usd_cents',
  );
  const needsPrice = new Set(
    frags.filter((f) => !f.retail_msrp_usd_cents || f.retail_msrp_usd_cents <= 0).map((f) => f.id),
  );
  console.log(`Fragrances total: ${frags.length}   needing price: ${needsPrice.size}`);

  // All retailer links with a usable price.
  const links = await fetchAll<Link>(
    'fragrance_retailer_links',
    'fragrance_id, price_cents, size_ml',
    (q) => q.gt('price_cents', 0),
  );
  console.log(`Retailer links with price>0: ${links.length}`);

  // Pick hero SKU per fragrance: largest size_ml, tie-break highest price.
  const hero = new Map<string, { price: number; size: number }>();
  for (const l of links) {
    if (!needsPrice.has(l.fragrance_id)) continue;
    const price = l.price_cents ?? 0;
    if (price <= 0) continue;
    const size = l.size_ml ?? 0;
    const cur = hero.get(l.fragrance_id);
    if (!cur || size > cur.size || (size === cur.size && price > cur.price)) {
      hero.set(l.fragrance_id, { price, size });
    }
  }
  console.log(`Fragrances resolvable from links: ${hero.size}\n`);

  const updates = [...hero.entries()].map(([id, h]) => ({
    id,
    retail_msrp_usd_cents: h.price,
    price_tier: priceTier(h.price),
  }));

  // Tier histogram for sanity.
  const tierHist: Record<number, number> = {};
  for (const u of updates) tierHist[u.price_tier] = (tierHist[u.price_tier] ?? 0) + 1;
  console.log('Tier distribution of backfill:', JSON.stringify(tierHist));
  console.log(`Sample:`, updates.slice(0, 5).map((u) => `$${(u.retail_msrp_usd_cents / 100).toFixed(2)} (t${u.price_tier})`).join(', '));

  if (!COMMIT) {
    console.log(`\nDRY RUN — would update ${updates.length} fragrances. Re-run with --commit.`);
    return;
  }
  if (updates.length === 0) { console.log('\nNothing to write.'); return; }

  // Patch one at a time (only the price + tier columns; never touches anything else).
  let done = 0, failed = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('fragrances')
      .update({ retail_msrp_usd_cents: u.retail_msrp_usd_cents, price_tier: u.price_tier })
      .eq('id', u.id);
    if (error) { failed++; if (failed <= 5) console.error('  update failed', u.id, error.message); }
    else { done++; if (done % 500 === 0) console.log(`  ...${done}`); }
  }
  console.log(`\n✓ Updated ${done} fragrances (${failed} failed).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
