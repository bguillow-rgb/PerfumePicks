/**
 * dna-seed-popularity — populate fragrances.popularity_tier from the Popularity
 * Seed List (docs/perfume-picks-popularity-seed-v1.md), the recognizability
 * source-of-truth for the Fragrance DNA picker. (Milestone M0.)
 *
 * Match each seed entry to a catalog row by NORMALIZED brand + name (reusing the
 * same normalizeStr the canonicalizer uses), set popularity_tier to the seed tier.
 * Everything not matched stays at the migration default (tier 2) — catalog-only,
 * never a picker tile. Concentration suffixes (EDP/EDT/Parfum/…) are stripped from
 * BOTH sides before matching so "Sauvage" matches "Sauvage Eau de Parfum".
 *
 * Reports, importantly, the UNMATCHED seed entries — these are catalog GAPS: famous
 * names the picker's coverage matrix needs but the catalog is missing. The list is
 * the target; the catalog must rise to meet it (seed doc).
 *
 * DRY RUN by default — prints the full plan and writes nothing. Pass --commit.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-seed-popularity.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/dna-seed-popularity.ts --commit
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeStr } from './lib/affiliate-etl-base';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

// ── The Popularity Seed List V1 (docs/perfume-picks-popularity-seed-v1.md) ─────
// [brand, name, tier]. Tiers 5/4/3 only — tiers 1-2 are the migration default.
const SEED: [string, string, number][] = [
  // Tier 5 — household icons
  ['Dior', 'Sauvage', 5],
  ['Chanel', 'Bleu de Chanel', 5],
  ['Giorgio Armani', 'Acqua di Gio', 5],
  ['Versace', 'Eros', 5],
  ['Creed', 'Aventus', 5],
  ['Paco Rabanne', '1 Million', 5],
  ['Jean Paul Gaultier', 'Le Male', 5],
  ['Chanel', 'Coco Mademoiselle', 5],
  ['Chanel', 'No. 5', 5],
  ['Dior', "J'adore", 5],
  ['Yves Saint Laurent', 'Black Opium', 5],
  ['Lancome', 'La Vie Est Belle', 5],
  ['Viktor & Rolf', 'Flowerbomb', 5],
  ['Carolina Herrera', 'Good Girl', 5],
  ['Marc Jacobs', 'Daisy', 5],
  ['Maison Francis Kurkdjian', 'Baccarat Rouge 540', 5],
  ['Tom Ford', 'Black Orchid', 5],
  ['Le Labo', 'Santal 33', 5],

  // Tier 4 — very well known
  ['Dior', 'Dior Homme Intense', 4],
  ['Yves Saint Laurent', "La Nuit de l'Homme", 4],
  ['Chanel', 'Allure Homme Sport', 4],
  ['Versace', 'Dylan Blue', 4],
  ['Paco Rabanne', 'Invictus', 4],
  ['Giorgio Armani', 'Acqua di Gio Profumo', 4],
  ['Prada', 'Luna Rossa', 4],
  ['Dolce & Gabbana', 'The One', 4],
  ['Tom Ford', 'Oud Wood', 4],
  ['Tom Ford', 'Tobacco Vanille', 4],
  ['Creed', 'Green Irish Tweed', 4],
  ['Parfums de Marly', 'Layton', 4],
  ['Initio', 'Oud for Greatness', 4],
  ['Xerjoff', 'Erba Pura', 4],
  ['Yves Saint Laurent', 'Libre', 4],
  ['Gucci', 'Bloom', 4],
  ['Gucci', 'Guilty', 4],
  ['Valentino', 'Born in Roma', 4],
  ['Mugler', 'Angel', 4],
  ['Mugler', 'Alien', 4],
  ['Narciso Rodriguez', 'For Her', 4],
  ['Dolce & Gabbana', 'Light Blue', 4],
  ['Burberry', 'Her', 4],
  ['Lancome', 'Idole', 4],
  ['Givenchy', "L'Interdit", 4],
  ['Ariana Grande', 'Cloud', 4],
  ['Maison Francis Kurkdjian', 'Grand Soir', 4],
  ['Jo Malone', 'Wood Sage & Sea Salt', 4],

  // Tier 3 — enthusiast-recognizable (reshuffle floor)
  ['Byredo', 'Gypsy Water', 3],
  ['Byredo', 'Mojave Ghost', 3],
  ['Byredo', 'Blanche', 3],
  ['Diptyque', 'Philosykos', 3],
  ['Diptyque', 'Tam Dao', 3],
  ['Maison Margiela', 'Replica By the Fireplace', 3],
  ['Maison Margiela', 'Replica Jazz Club', 3],
  ['Maison Margiela', 'Replica Beach Walk', 3],
  ['Frederic Malle', 'Portrait of a Lady', 3],
  ['Kilian', "Love, Don't Be Shy", 3],
  ['Parfums de Marly', 'Herod', 3],
  ['Parfums de Marly', 'Pegasus', 3],
  ['Nishane', 'Hacivat', 3],
  ['Amouage', 'Interlude Man', 3],
  ['Hermes', "Terre d'Hermes", 3],
  ['Guerlain', 'Shalimar', 3],
  ['Acqua di Parma', 'Colonia', 3],
  ['Maison Francis Kurkdjian', 'Oud Satin Mood', 3],
  ['Phlur', 'Missing Person', 3],
  ['Sol de Janeiro', 'Cheirosa 62', 3],
  ['Glossier', 'You', 3],
  ['Escentric Molecules', 'Molecule 01', 3],
  ['Le Labo', 'Another 13', 3],
  ["Penhaligon's", 'Halfeti', 3],
];

// Strip concentration / packaging words so seed "Sauvage" matches catalog
// "Sauvage Eau de Parfum". Applied to the NORMALIZED string (already lowercased,
// accent-stripped, punctuation→space by normalizeStr).
const CONC = /\b(eau de parfum|eau de toilette|eau de cologne|parfum|cologne|edp|edt|edc|extrait|intense|elixir|for (men|women|her|him)|pour (homme|femme)|spray|tester)\b/g;
const matchKey = (s: string) => normalizeStr(s).replace(CONC, ' ').replace(/\s+/g, ' ').trim();

type Frag = {
  id: string; name: string; brand_id: string; popularity_tier: number;
  is_active: boolean; is_discontinued: boolean;
};
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
  console.log(`dna-seed-popularity  (${COMMIT ? 'COMMIT' : 'DRY RUN'})\n`);

  const brands = await fetchAll<Brand>('brands', 'id, name');
  const frags = await fetchAll<Frag>('fragrances', 'id, name, brand_id, popularity_tier, is_active, is_discontinued');
  const brandById = new Map(brands.map((b) => [b.id, b]));

  // Index catalog rows by normalized-brand → matchKey(name) → rows.
  const byBrandName = new Map<string, Map<string, Frag[]>>();
  for (const f of frags) {
    const b = brandById.get(f.brand_id);
    if (!b) continue;
    const bk = normalizeStr(b.name);
    const nk = matchKey(f.name);
    let m = byBrandName.get(bk);
    if (!m) { m = new Map(); byBrandName.set(bk, m); }
    (m.get(nk) ?? m.set(nk, []).get(nk)!).push(f);
  }

  const updates: { id: string; name: string; brand: string; tier: number }[] = [];
  const unmatched: [string, string, number][] = [];
  const seen = new Set<string>();

  for (const [brand, name, tier] of SEED) {
    const bk = normalizeStr(brand);
    const nk = matchKey(name);
    const m = byBrandName.get(bk);
    let rows = m?.get(nk);
    // Fallback: a catalog name that STARTS WITH the seed key (e.g. seed "Eros" →
    // "Eros Flame" must NOT match, but "Aventus" → "Aventus" exact already hit;
    // startsWith only when no exact, and only the seed key as a whole token prefix).
    if ((!rows || !rows.length) && m) {
      for (const [cataKey, cataRows] of m) {
        if (cataKey === nk || cataKey.startsWith(nk + ' ')) { rows = cataRows; break; }
      }
    }
    if (!rows || !rows.length) { unmatched.push([brand, name, tier]); continue; }
    for (const f of rows) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      if (f.popularity_tier !== tier) updates.push({ id: f.id, name: f.name, brand, tier });
    }
  }

  console.log(`catalog: ${frags.length} fragrances, ${brands.length} brands`);
  console.log(`seed entries: ${SEED.length}   matched→update: ${updates.length}   unmatched (catalog gaps): ${unmatched.length}\n`);

  console.log('=== TIER ASSIGNMENTS (sample) ===');
  for (const u of updates.slice(0, 30)) console.log(`  tier ${u.tier}  ${u.brand} — ${u.name}`);
  if (updates.length > 30) console.log(`  … +${updates.length - 30} more`);

  console.log('\n=== UNMATCHED SEED ENTRIES (catalog gaps — create these rows) ===');
  for (const [b, n, t] of unmatched) console.log(`  tier ${t}  ${b} — ${n}`);

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.'); return; }

  console.log('\nApplying...');
  let done = 0;
  for (const u of updates) {
    const { error } = await supabase.from('fragrances').update({ popularity_tier: u.tier }).eq('id', u.id);
    if (error) { console.error(`update ${u.name}:`, error.message); process.exit(1); }
    if (++done % 25 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`  ✓ set popularity_tier on ${done} rows. Unmatched gaps: ${unmatched.length} (see above).`);
  console.log('\nNext: scripts/dna-compute-eligible.ts to compute dna_eligible.');
}

main().catch((e) => { console.error(e); process.exit(1); });
