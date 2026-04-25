/**
 * Compute similarity matrix and update fragrances.similar_fragrance_ids + dupe_of.
 *
 * Per spec § 6 Similarity Engine:
 *   similarity =
 *     (note_overlap         * 0.35) +
 *     (accord_overlap       * 0.30) +
 *     (performance_similarity * 0.15) +
 *     (price_similarity     * 0.10) +
 *     (family_match         * 0.10)
 *
 * Per spec § 7 Dupes Engine:
 *   if similarity > 0.75 AND price_diff > 30%:
 *     mark as dupe (the cheaper one is the dupe of the more expensive one)
 *
 * For ~2000 fragrances this is 2M pairs — runs in seconds in JS, <30s on a
 * laptop. No need for SQL/vector DB at this scale.
 *
 * Run after every insert tranche.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const TOP_N_SIMILAR = 12;          // store top 12 for the "Smells Like" rail
const DUPE_SIM_THRESHOLD = 0.75;
const DUPE_PRICE_DIFF_PCT = 0.30;

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

async function main() {
  const { data: rows, error } = await supabase
    .from('fragrances')
    .select('id,fragrance_family,top_notes,heart_notes,base_notes,top_accords,community_longevity,community_sillage,community_projection,price_tier,retail_msrp_usd_cents')
    .eq('is_active', true);
  if (error) throw error;
  const all = (rows ?? []) as Frag[];
  console.log(`Computing similarity over ${all.length} fragrances (${all.length * all.length} pairs)...`);

  const updates: { id: string; similar_fragrance_ids: string[]; dupe_of: string | null; dupe_confidence: number | null }[] = [];

  for (const a of all) {
    const scored: { id: string; sim: number; b: Frag }[] = [];
    for (const b of all) {
      if (a.id === b.id) continue;
      const sim = similarity(a, b);
      if (sim > 0.25) scored.push({ id: b.id, sim, b });
    }
    scored.sort((x, y) => y.sim - x.sim);
    const top = scored.slice(0, TOP_N_SIMILAR);

    // Dupe detection: among the top-similar, find one with sim > threshold
    // AND meaningfully cheaper than `a`. The DUPE points to the more expensive
    // "original" — i.e. dupe_of stores the OG, dupe_confidence stores similarity.
    let dupe_of: string | null = null;
    let dupe_confidence: number | null = null;
    if (a.retail_msrp_usd_cents != null) {
      for (const s of top) {
        if (s.sim < DUPE_SIM_THRESHOLD) break;          // sorted desc, can stop
        if (s.b.retail_msrp_usd_cents == null) continue;
        // a is cheaper than b by ≥ 30% → a is a dupe OF b
        if ((s.b.retail_msrp_usd_cents - a.retail_msrp_usd_cents) / s.b.retail_msrp_usd_cents >= DUPE_PRICE_DIFF_PCT) {
          dupe_of = s.b.id;
          dupe_confidence = Number(s.sim.toFixed(2));
          break;
        }
      }
    }

    updates.push({
      id: a.id,
      similar_fragrance_ids: top.map((s) => s.id),
      dupe_of,
      dupe_confidence,
    });
  }

  // Apply in chunks to avoid huge single requests
  const CHUNK = 100;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    for (const u of chunk) {
      const { error: upErr } = await supabase
        .from('fragrances')
        .update({
          similar_fragrance_ids: u.similar_fragrance_ids,
          dupe_of: u.dupe_of,
          dupe_confidence: u.dupe_confidence,
        })
        .eq('id', u.id);
      if (upErr) console.warn(`  update failed for ${u.id}:`, upErr.message);
    }
    console.log(`  updated [${Math.min(i + CHUNK, updates.length)}/${updates.length}]`);
  }
  console.log(`Done. ${updates.filter((u) => u.dupe_of).length} dupes detected.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
