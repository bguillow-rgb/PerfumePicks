/**
 * dna-seed-coverage-fill — second-pass recognizability promotions aimed at the
 * specific lane×gender×price cells the base Popularity Seed List left thin.
 * (Milestone M0, coverage closure.)
 *
 * The base seed (dna-seed-popularity.ts) tiers the household icons. This pass
 * promotes a SECOND recognizable bottle into each still-thin coverage cell so the
 * DNA picker can offer a real pick in that lane. Every entry below is a genuinely
 * recognizable fragrance from a mainstream/known house — NOT an obscure filler —
 * because the picker's promise is "every tile is one you recognize."
 *
 * Each [brand, nameContains, tier] is matched against catalog rows by normalized
 * brand + a normalized-name substring (so a model matches its concentration
 * variants). popularity_tier is only ever RAISED, never lowered. Unmatched rows
 * are reported as catalog gaps (the catalog must rise to meet the list).
 *
 * DRY RUN by default. --commit to write. Re-run dna-compute-eligible.ts after.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeStr } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

// [brand, nameContains (normalized substring), tier] — targets the thin cells.
const FILL: [string, string, number][] = [
  // fresh / masculine / high
  ['Creed', 'erolfa', 3],
  // fresh / feminine / low + mid + high
  ['Giorgio Armani', 'acqua di gioia', 4],
  ['Issey Miyake', 'l eau d issey', 3],
  ['Carolina Herrera', '212', 3],
  ['Yves Saint Laurent', 'libre l eau nue', 3],
  ['Chanel', 'chance eau fraiche', 4],
  // fresh / unisex / mid + high
  ['Acqua di Parma', 'colonia', 3],
  ['Bvlgari', 'au the vert', 3],
  ['Creed', 'millesime imperial', 4],
  ['Creed', 'neroli sauvage', 3],
  // floral / unisex / high
  ['Diptyque', 'eau rose', 3],
  ['Tom Ford', 'rose prick', 3],
  // floral / masculine / high
  ['Dior', 'dior homme', 4],
  ['Chanel', 'egoiste', 3],
  // woody / masculine / low
  ['Chanel', 'antaeus', 3],
  ['Bvlgari', 'aqva pour homme', 3],
  // woody / unisex / mid
  ['Cartier', 'must de cartier', 3],
  ['Gucci', 'memoire', 3],
  // woody / feminine / low + mid + high
  ['Hermes', 'amazone', 3],
  ['Gucci', 'guilty absolute pour femme', 3],
  ['Hermes', 'caleche', 3],
  ['Tom Ford', 'white patchouli', 3],
  // amber/sweet / masculine / high
  ['Jean Paul Gaultier', 'le male elixir', 4],
  ['Paco Rabanne', '1 million elixir', 4],
  // amber/sweet / feminine / high
  ['Mugler', 'alien goddess', 3],
  ['Tom Ford', 'noir pour femme', 3],
  // amber/sweet / unisex / mid
  ['Guerlain', 'mon guerlain', 3],
  ['Prada', 'candy', 3],
  // aromatic / masculine / high
  ['Creed', 'viking', 3],
  // aromatic / unisex / low + mid + high
  ['Jo Malone', '154', 3],
  ['Maison Francis Kurkdjian', 'aqua vitae', 3],
  ['Cartier', 'declaration', 3],
  ['Creed', 'original santal', 3],
];

type Frag = { id: string; name: string; brand_id: string; popularity_tier: number };
type Brand = { id: string; name: string };

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const PAGE = 1000; const rows: T[] = [];
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).range(o, o + PAGE - 1);
    if (error) { console.error(table, error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log(`dna-seed-coverage-fill  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);
  const brands = await fetchAll<Brand>('brands', 'id, name');
  const frags = await fetchAll<Frag>('fragrances', 'id, name, brand_id, popularity_tier');
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const byBrand = new Map<string, Frag[]>();
  for (const f of frags) {
    const b = brandById.get(f.brand_id); if (!b) continue;
    const bk = normalizeStr(b.name);
    (byBrand.get(bk) ?? byBrand.set(bk, []).get(bk)!).push(f);
  }

  const updates: { id: string; name: string; from: number; to: number }[] = [];
  const unmatched: string[] = [];
  for (const [brand, sub, tier] of FILL) {
    const bk = normalizeStr(brand); const ns = normalizeStr(sub);
    const pool = byBrand.get(bk) || [];
    // shortest matching name = the base/most-recognizable variant
    const hits = pool.filter((f) => normalizeStr(f.name).includes(ns))
      .sort((a, b) => a.name.length - b.name.length);
    if (!hits.length) { unmatched.push(`${brand} — ${sub}`); continue; }
    const f = hits[0];
    if (f.popularity_tier < tier) updates.push({ id: f.id, name: `${brand} — ${f.name}`, from: f.popularity_tier, to: tier });
  }

  console.log(`fill targets: ${FILL.length}   promotions: ${updates.length}   unmatched: ${unmatched.length}\n`);
  for (const u of updates) console.log(`  tier ${u.from}→${u.to}  ${u.name}`);
  if (unmatched.length) { console.log('\n=== UNMATCHED (catalog gaps — would need row creation) ==='); for (const u of unmatched) console.log(`  ${u}`); }

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit.'); return; }
  console.log('\nApplying...');
  for (const u of updates) {
    const { error } = await supabase.from('fragrances').update({ popularity_tier: u.to }).eq('id', u.id);
    if (error) { console.error(`update ${u.name}:`, error.message); process.exit(1); }
  }
  console.log(`  ✓ promoted ${updates.length} rows. Next: dna-compute-eligible.ts --commit, then dna-coverage-report.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
