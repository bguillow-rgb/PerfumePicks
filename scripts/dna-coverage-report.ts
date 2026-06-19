/**
 * dna-coverage-report — the picker-pool health check. (Milestone M0, the admin
 * tool.) READ-ONLY; writes nothing. Re-run after every ETL import: an import that
 * dumps un-enriched rows could silently shrink or skew the eligible picker pool.
 *
 * The DNA picker must span the coverage matrix — family × gender — entirely with
 * RECOGNIZABLE bottles (DNA spec Parts 5-6; trimmed family×gender×projection×price →
 * family×gender×price in v1.1 §A9, then → family×gender in M0 once price-banding was
 * shown to leave many real cells structurally empty, founder call 2026-06-18). This
 * report buckets dna_eligible rows into lane×gender and flags any cell with
 * < MIN_PER_CELL bottles (price shown as info only), because a thin cell means the
 * grid can't offer a recognizable pick in that lane. Cells the recognizable market
 * genuinely doesn't populate (see NA_CELLS) are documented N/A, not gaps.
 *
 * Exit code: 0 if every populated lane meets the floor, 1 if any gap — so the M0
 * Maestro gate / CI can assert coverage.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-coverage-report.ts
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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const MIN_PER_CELL = 2; // a lane needs >=2 recognizable bottles to offer a real pick

type Frag = {
  fragrance_family: string | null; gender: string | null; price_tier: number | null;
  popularity_tier: number;
};

// Group the catalog's many families into the picker's coarse accord lanes so the
// matrix is meaningful (not 30 near-empty family cells).
function lane(family: string | null): string {
  const f = (family || '').toLowerCase();
  if (/fresh|aquatic|citrus|green|marine/.test(f)) return 'fresh';
  if (/floral|white floral|powdery/.test(f)) return 'floral';
  if (/wood|chypre|leather|mossy/.test(f)) return 'woody';
  if (/orient|amber|spicy|gourmand|sweet|vanilla/.test(f)) return 'amber/sweet';
  if (/fougere|aromatic/.test(f)) return 'aromatic';
  return 'other';
}
const priceBand = (t: number | null) => (t == null ? 'unknown' : t <= 2 ? 'low' : t === 3 ? 'mid' : 'high');

async function fetchEligible(): Promise<Frag[]> {
  const PAGE = 1000; const rows: Frag[] = [];
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('fragrance_family, gender, price_tier, popularity_tier')
      .eq('dna_eligible', true)
      .range(o, o + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as Frag[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log('dna-coverage-report  (READ-ONLY)\n');
  const frags = await fetchEligible();
  console.log(`dna_eligible pool: ${frags.length}\n`);

  const lanes = ['fresh', 'floral', 'woody', 'amber/sweet', 'aromatic', 'other'];
  const genders = ['masculine', 'feminine', 'unisex'];
  const bands = ['low', 'mid', 'high'];

  const cell = new Map<string, number>();
  const key = (l: string, g: string, b: string) => `${l}|${g}|${b}`;
  for (const f of frags) cell.set(key(lane(f.fragrance_family), f.gender || 'unisex', priceBand(f.price_tier)),
    (cell.get(key(lane(f.fragrance_family), f.gender || 'unisex', priceBand(f.price_tier))) ?? 0) + 1);

  // Structurally-empty cells: lane×gender combinations the recognizable-fragrance
  // market simply doesn't produce, verified against the live catalog. We never
  // force no-name tiles into these (the picker's tiles-must-be-recognizable rule),
  // so they are documented N/A rather than counted as gaps.
  //   aromatic|feminine — feminine fougères barely exist: only 7 candidate rows in
  //   the entire ~10k catalog, none a household name. (M0 finding, 2026-06-18.)
  const NA_CELLS = new Set<string>(['aromatic|feminine']);
  const lgKey = (l: string, g: string) => `${l}|${g}`;

  // Matrix print + gap collection. The GATE is lane × gender (the picker spec's
  // family×gender intent, v1.1 §A9); price is shown as an informational breakdown
  // only — crossing price in skews many real cells empty (DNA milestone-plan M0,
  // founder call 2026-06-18: drop price as a coverage axis).
  const gaps: string[] = [];
  console.log('=== COVERAGE MATRIX (lane × gender; gate) — [price breakdown shown as info] ===');
  for (const l of lanes) {
    console.log(`\n  ${l}`);
    for (const g of genders) {
      const total = bands.reduce((s, b) => s + (cell.get(key(l, g, b)) ?? 0), 0);
      const info = bands.map((b) => `${b}:${String(cell.get(key(l, g, b)) ?? 0).padStart(2)}`).join('  ');
      const na = NA_CELLS.has(lgKey(l, g));
      if (total < MIN_PER_CELL && l !== 'other' && !na) gaps.push(`${l} / ${g}: ${total}`);
      const tag = na ? ' N/A (structural — see NA_CELLS)' : (total < MIN_PER_CELL && l !== 'other' ? '  ⚠️' : '');
      console.log(`    ${g.padEnd(10)} total:${String(total).padStart(2)}${tag}   [ ${info} ]`);
    }
  }

  // Tier sanity — grid 1 needs enough tier>=4.
  const tier4plus = frags.filter((f) => f.popularity_tier >= 4).length;
  const tier3 = frags.filter((f) => f.popularity_tier === 3).length;
  console.log(`\n=== TIER SUPPLY ===`);
  console.log(`  tier >=4 (grid-1 anchors): ${tier4plus}   ${tier4plus < 12 ? '⚠️  < 12 — grid 1 may not fill' : 'ok'}`);
  console.log(`  tier  3 (reshuffle pool):  ${tier3}`);

  console.log(`\n=== GAPS (< ${MIN_PER_CELL} eligible per lane×gender, excluding 'other' + structural N/A) ===`);
  if (!gaps.length && tier4plus >= 12) {
    console.log('  none — coverage matrix is complete. ✅');
    process.exit(0);
  }
  for (const g of gaps) console.log(`  ⚠️  ${g}`);
  if (tier4plus < 12) console.log(`  ⚠️  only ${tier4plus} tier>=4 anchors (need >=12 for grid 1)`);
  console.log('\n  → fill via enrichment, image sourcing, tier bumps, or creating missing famous rows.');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
