/**
 * DNA V3 — replay-fixture refresh (M1).
 *
 * READ-ONLY pull of every real prod pick stream (user_taste_profiles.dna->seeds,
 * the committed DNA picker runs) plus the catalog metadata for every referenced
 * bottle, written to __tests__/features/dna/fixtures/replay-picks.json.
 *
 * Privacy: user ids are replaced with sequential aliases (u01, u02, …) sorted
 * by user_id so re-runs are stable; the fixture carries fragrance ids +
 * catalog metadata only — no emails, no auth ids, no PII.
 *
 * The fixture feeds the M1/M2 replay gate: flag-on election over ALL real pick
 * streams must produce ≥8 distinct archetypes with max share ≤20%.
 *
 * Run:  node scripts/refresh-replay-fixture.mjs
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
  new URL('../__tests__/features/dna/fixtures/replay-picks.json', import.meta.url),
);

// The DnaCatalogFragrance fields the engine reads (types.ts), plus name for
// human-readable debugging. No PII lives on catalog rows. NOTE: the app (and
// therefore dna->seeds) keys fragrances by SLUG, not the uuid `id` column —
// we query by slug and emit the slug as the fixture's `id`.
const FRAG_SEL = [
  'slug', 'name', 'fragrance_family', 'gender',
  'top_notes', 'heart_notes', 'base_notes', 'top_accords', 'accord_intensity',
  'community_longevity', 'community_sillage', 'community_projection',
  'compliment_score', 'versatility_score', 'office_safe_score',
  'price_tier', 'retail_msrp_usd_cents', 'popularity_tier', 'release_year', 'dupe_of',
].join(',');

async function main() {
  // 1 — every profile with a committed DNA (seeds carry the pick stream)
  const r = await fetch(
    `${SB}/rest/v1/user_taste_profiles?select=user_id,dna&dna=not.is.null&order=user_id.asc&limit=10000`,
    { headers: H },
  );
  if (!r.ok) {
    console.error(`user_taste_profiles fetch failed: ${r.status}`);
    process.exit(1);
  }
  const rows = await r.json();

  const streams = [];
  const fragIds = new Set();
  let skippedEmpty = 0;
  for (const row of rows) {
    const seeds = row.dna?.seeds ?? [];
    if (!seeds.length) {
      skippedEmpty++;
      continue; // question-fallback / legacy rows with no pick stream
    }
    streams.push({
      user: `u${String(streams.length + 1).padStart(2, '0')}`,
      picks: seeds.map((s) => ({
        id: s.id,
        relation: s.relation ?? 'like',
        favorite: !!s.favorite,
        seededAt: s.seededAt ?? null,
      })),
    });
    for (const s of seeds) fragIds.add(s.id);
  }

  // 2 — catalog metadata for every referenced bottle
  const catalog = {};
  const ids = [...fragIds];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const inList = encodeURIComponent(`(${chunk.map((id) => `"${id}"`).join(',')})`);
    const cr = await fetch(
      `${SB}/rest/v1/fragrances?select=${FRAG_SEL}&slug=in.${inList}`,
      { headers: H },
    );
    if (!cr.ok) {
      console.error(`fragrances fetch failed: ${cr.status}`);
      process.exit(1);
    }
    for (const f of await cr.json()) {
      const { slug, ...rest } = f;
      catalog[slug] = { id: slug, ...rest };
    }
  }

  const missing = ids.filter((id) => !catalog[id]);
  if (missing.length) {
    console.warn(`WARNING: ${missing.length} picked ids not found in catalog:`, missing);
  }

  const fixture = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Real prod pick streams (user_taste_profiles.dna->seeds), anonymized. Regenerate: node scripts/refresh-replay-fixture.mjs',
    streamCount: streams.length,
    streams,
    catalog,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + '\n');
  console.log(
    `wrote ${OUT_PATH}\n  streams: ${streams.length} (skipped ${skippedEmpty} with empty seeds)\n  distinct bottles: ${ids.length}${missing.length ? `\n  MISSING FROM CATALOG: ${missing.length}` : ''}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
