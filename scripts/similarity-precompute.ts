/**
 * similarity-precompute v2
 *
 * Computes the similarity matrix and writes:
 *   - fragrance_similars   (the "Similar fragrances" rail, top-N per fragrance)
 *
 * It does NOT write dupes. A "dupe" is a deliberate clone of a SPECIFIC
 * fragrance — human community knowledge, not a similarity score. Accord/note
 * overlap produces confident FALSE dupe claims (e.g. "Montale Starry Night is
 * a dupe of J.Lo Enduring Glow"), so fragrance_dupes is CURATED ONLY
 * (seed/editorial, via scripts/import-dupe-seeds.ts). This job never touches it.
 *
 * v2 design:
 *   1. Writes to the FK-constrained relational table, NOT the old
 *      fragrances.similar_fragrance_ids uuid[] column. The app keys on slug and
 *      resolves via the get_similars() RPC, which joins UUID -> slug server-side.
 *   2. Atomic staging -> swap. We bulk-insert into the UNLOGGED staging table,
 *      then call swap_similars() which replaces live rows in a single
 *      transaction. No split-brain on a mid-run crash.
 *
 * Similarity model:
 *   0.35 note_overlap + 0.30 accord_jaccard + 0.15 performance + 0.10 price +
 *   0.10 family_match
 *
 * Usage:
 *   npx tsx scripts/similarity-precompute.ts            # write similars
 *   npx tsx scripts/similarity-precompute.ts --dry-run  # compute + report only
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

const DRY_RUN = process.argv.includes('--dry-run');

const TOP_N_SIMILAR = 12;          // store top 12 for the "Similar fragrances" rail
const SIMILAR_FLOOR = 0.25;        // ignore weak pairs entirely
const INSERT_CHUNK = 500;

type Frag = {
  id: string;
  fragrance_family: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  community_longevity: number | null;
  community_sillage: number | null;
  community_projection: number | null;
  price_tier: number | null;
  retail_msrp_usd_cents: number | null;
};

function hasNotes(f: Frag): boolean {
  return (f.top_notes?.length ?? 0) + (f.heart_notes?.length ?? 0) + (f.base_notes?.length ?? 0) > 0;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const A = new Set(a.map((x) => x.toLowerCase().trim()));
  const B = new Set(b.map((x) => x.toLowerCase().trim()));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function noteOverlap(a: Frag, b: Frag): number {
  // Weight base > heart > top — base notes drive the long-tail "smells like".
  const top = jaccard(a.top_notes, b.top_notes);
  const heart = jaccard(a.heart_notes, b.heart_notes);
  const base = jaccard(a.base_notes, b.base_notes);
  return 0.2 * top + 0.35 * heart + 0.45 * base;
}

function performanceSim(a: Frag, b: Frag): number {
  const fields: (keyof Frag)[] = ['community_longevity', 'community_sillage', 'community_projection'];
  let total = 0, count = 0;
  for (const f of fields) {
    const va = a[f] as number | null, vb = b[f] as number | null;
    if (va == null || vb == null) continue;
    total += 1 - Math.abs(va - vb) / 5;  // both on 0..5 scale
    count++;
  }
  return count ? total / count : 0.5;    // unknown → neutral
}

function priceSim(a: Frag, b: Frag): number {
  if (a.price_tier == null || b.price_tier == null) return 0.5;
  return 1 - Math.abs(a.price_tier - b.price_tier) / 4;  // tiers 1..5
}

function similarity(a: Frag, b: Frag): number {
  return (
    0.35 * noteOverlap(a, b) +
    0.30 * jaccard(a.top_accords, b.top_accords) +
    0.15 * performanceSim(a, b) +
    0.10 * priceSim(a, b) +
    0.10 * (a.fragrance_family && a.fragrance_family === b.fragrance_family ? 1 : 0)
  );
}

async function fetchAllActive(): Promise<Frag[]> {
  const all: Frag[] = [];
  const COLS =
    'id,fragrance_family,top_notes,heart_notes,base_notes,top_accords,community_longevity,community_sillage,community_projection,price_tier,retail_msrp_usd_cents';
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

type SimilarRow = { fragrance_id: string; similar_id: string; similarity: number; rank: number };

async function bulkInsert<T extends object>(table: string, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`insert into ${table} failed at ${i}: ${error.message}`);
    console.log(`  ${table}: inserted ${Math.min(i + INSERT_CHUNK, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const all = await fetchAllActive();
  const withNotes = all.filter(hasNotes).length;
  console.log(
    `Computing similarity over ${all.length} fragrances (${all.length} with note pyramids, ` +
    `${all.length * all.length} pairs)...`,
  );

  const similarRows: SimilarRow[] = [];

  for (const a of all) {
    const scored: { id: string; sim: number }[] = [];
    for (const b of all) {
      if (a.id === b.id) continue;
      const sim = similarity(a, b);
      if (sim > SIMILAR_FLOOR) scored.push({ id: b.id, sim });
    }
    scored.sort((x, y) => y.sim - x.sim);
    const top = scored.slice(0, TOP_N_SIMILAR);

    top.forEach((s, idx) => {
      similarRows.push({
        fragrance_id: a.id,
        similar_id: s.id,
        similarity: Number(s.sim.toFixed(3)),
        rank: idx,
      });
    });
  }

  console.log(
    `Computed ${similarRows.length} similar rows ` +
    `(${withNotes} frags had notes to match on).`,
  );

  if (DRY_RUN) {
    console.log('DRY RUN — no writes. Sample similar pairs:');
    for (const s of similarRows.slice(0, 20)) {
      console.log(`  ${s.fragrance_id} ~ ${s.similar_id} (${(s.similarity * 100).toFixed(0)}%, rank ${s.rank})`);
    }
    return;
  }

  // ── Similars: stage → atomic swap ──
  console.log('\nStaging similars...');
  await supabase.from('fragrance_similars_staging').delete().neq('fragrance_id', '00000000-0000-0000-0000-000000000000');
  await bulkInsert('fragrance_similars_staging', similarRows);
  const { data: simSwapped, error: simErr } = await supabase.rpc('swap_similars');
  if (simErr) throw new Error(`swap_similars failed: ${simErr.message}`);
  console.log(`  ✓ swap_similars committed ${simSwapped} rows.`);

  console.log('\nDone. (Dupes are curated-only — see scripts/import-dupe-seeds.ts)');
}

main().catch((e) => { console.error(e); process.exit(1); });
