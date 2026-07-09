/**
 * DNA V3 — simulation-pool fixture refresh (M2).
 *
 * READ-ONLY pull feeding the M2 simulation gate
 * (__tests__/features/dna/electionBalance.test.ts):
 *
 *   pool    — every dna_eligible + is_active bottle (the real picker pool the
 *             synthetic pick-sets sample from; 112 today).
 *   catalog — a deterministic sample (~400) of the FULL is_active catalog that
 *             passes the M4 picker-search completeness gate (fragrance_family
 *             present + accord data present). This is what the labeled
 *             "search-enthusiast" persona draws from, so the adventurousness
 *             axis — ~constant 0 for the all-popular pool — actually varies.
 *
 * Determinism: catalog rows are ordered by slug and sampled with a fixed-seed
 * mulberry32 PRNG, so re-runs against unchanged prod data are byte-identical.
 * No PII: fragrance catalog rows only.
 *
 * Run:  node scripts/refresh-sim-pool-fixture.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ── env ──
const envPath = new URL('../.env.local', import.meta.url);
for (const l of readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const OUT_PATH = fileURLToPath(
  new URL('../__tests__/features/dna/fixtures/sim-pool.json', import.meta.url),
);

const CATALOG_SAMPLE_SIZE = 400;
const SAMPLE_SEED = 0x5eed2;

// Same engine-facing field set as refresh-replay-fixture.mjs; slug is the id.
const FRAG_SEL = [
  'slug', 'name', 'fragrance_family', 'gender',
  'top_notes', 'heart_notes', 'base_notes', 'top_accords', 'accord_intensity',
  'community_longevity', 'community_sillage', 'community_projection',
  'compliment_score', 'versatility_score', 'office_safe_score',
  'price_tier', 'retail_msrp_usd_cents', 'popularity_tier', 'release_year', 'dupe_of',
].join(',');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bySlug = (rows) => {
  const out = {};
  for (const f of rows) {
    const { slug, ...rest } = f;
    out[slug] = { id: slug, ...rest };
  }
  return out;
};

/** M4 completeness gate: family present + some accord data present. */
const isComplete = (f) =>
  !!f.fragrance_family &&
  ((Array.isArray(f.top_accords) && f.top_accords.length > 0) ||
    (f.accord_intensity && Object.keys(f.accord_intensity).length > 0));

async function fetchAll(filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${SB}/rest/v1/fragrances?select=${FRAG_SEL}&${filter}&order=slug.asc&limit=1000&offset=${from}`,
      { headers: H },
    );
    if (!r.ok) {
      console.error(`fragrances fetch failed: ${r.status}`);
      process.exit(1);
    }
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function main() {
  // 1 — the real picker pool
  const pool = await fetchAll('dna_eligible=eq.true&is_active=eq.true');
  console.log(`pool: ${pool.length} dna_eligible bottles`);

  // 2 — full-catalog sample for the search-enthusiast persona
  const all = (await fetchAll('is_active=eq.true')).filter(isComplete);
  console.log(`catalog: ${all.length} complete is_active rows (pre-sample)`);
  const rand = mulberry32(SAMPLE_SEED);
  // Fisher–Yates partial shuffle over the slug-ordered rows, fixed seed.
  for (let i = 0; i < Math.min(CATALOG_SAMPLE_SIZE, all.length); i++) {
    const j = i + Math.floor(rand() * (all.length - i));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const sample = all
    .slice(0, CATALOG_SAMPLE_SIZE)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));

  const fixture = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'DNA V3 M2 sim fixture: dna_eligible picker pool + seeded full-catalog sample (search-enthusiast persona). Regenerate: node scripts/refresh-sim-pool-fixture.mjs',
    pool: bySlug(pool),
    catalogSample: bySlug(sample),
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + '\n');
  console.log(
    `wrote ${OUT_PATH}\n  pool: ${pool.length}  catalogSample: ${sample.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
