/**
 * M2 BALANCE GATES — the never-again suite (MILESTONES-DNA-V3.md §M2,
 * FEATURE_ARCHETYPES_V2.md §4). Two gates, both the contract — tune CENTROIDS
 * (placement + weight masks), never the thresholds here (changing them
 * requires Bob):
 *
 *  1. REPLAY GATE — every real prod pick stream (fixtures/replay-picks.json,
 *     refreshed read-only) through the flag-ON election:
 *       ≥ 8 distinct labels elected, max single-label share ≤ 20%.
 *
 *  2. SIMULATION GATE — 10,000 synthetic pick-sets sampled from the REAL
 *     picker pool (fixtures/sim-pool.json: 112 dna_eligible bottles, plus a
 *     seeded full-catalog sample that only the labeled "search-enthusiast"
 *     persona draws from — the pool's adventurousness axis is ~constant 0 by
 *     design, so full-catalog picks are what exercise it, mirroring M4).
 *     Samplers: uniform-random sets (1–5 picks, favorite flips) + persona-
 *     biased samplers spanning the axis space. Seeded mulberry32 PRNG — no
 *     Math.random, byte-identical every run. Gate:
 *       every one of the 20 labels elected on 2–10% of sets,
 *       no label > 12%,
 *       median decisive margin ≥ V3_LEAN_MARGIN.
 *
 * Perf: per-bottle axis percentiles + per-persona affinities are precomputed
 * once; the 10k loop only aggregates + elects (CI target < 60s).
 */

import { deriveFragranceDNA } from '@/src/features/dna';
import { deriveAxes } from '@/src/features/dna/axes';
import { electArchetype, V3_ARCHETYPE_KEYS, V3_LEAN_MARGIN } from '@/src/features/dna/centroids';
import { CATALOG_AXES, type CatalogAxis } from '@/src/features/dna/axisNorms';
import { axisPercentileOf } from '@/src/features/dna/axisScore';
import type { ArchetypeKey, DnaCatalogFragrance, DnaPick } from '@/src/features/dna/types';
import replayFixture from './fixtures/replay-picks.json';
import simFixture from './fixtures/sim-pool.json';

const FIXED_NOW = () => '2026-07-09T00:00:00.000Z';

// ─────────────────────────────────────────────────────────────────────────────
// Gate 1 — replay (real prod pick streams, flag on)
// ─────────────────────────────────────────────────────────────────────────────

const REPLAY_MIN_DISTINCT = 8;
const REPLAY_MAX_SHARE = 0.2;

describe('M2 replay gate — real prod pick streams', () => {
  const catalog = replayFixture.catalog as unknown as Record<string, DnaCatalogFragrance>;

  it(`elects ≥${REPLAY_MIN_DISTINCT} distinct labels, max share ≤${REPLAY_MAX_SHARE * 100}%, over all ${replayFixture.streams.length} streams`, () => {
    expect(replayFixture.streams.length).toBeGreaterThan(0);

    const counts = new Map<ArchetypeKey, number>();
    let leans = 0;
    for (const s of replayFixture.streams) {
      const picks: DnaPick[] = s.picks
        .filter((p) => catalog[p.id])
        .map((p) => ({
          fragrance: catalog[p.id],
          relation: p.relation as DnaPick['relation'],
          favorite: p.favorite,
        }));
      expect(picks.length).toBeGreaterThan(0);

      const { dna, events } = deriveFragranceDNA({ picks, now: FIXED_NOW, v3Archetypes: true });
      expect(events).toEqual([]);
      counts.set(dna.archetype.primary, (counts.get(dna.archetype.primary) ?? 0) + 1);
      if (dna.archetype.leaning) leans++;
    }

    const total = replayFixture.streams.length;
    const distinct = counts.size;
    const maxShare = Math.max(...counts.values()) / total;
    if (distinct < REPLAY_MIN_DISTINCT || maxShare > REPLAY_MAX_SHARE) {
      throw new Error(
        `Replay gate FAILED: distinct=${distinct} (need ≥${REPLAY_MIN_DISTINCT}), maxShare=${(maxShare * 100).toFixed(1)}% (need ≤${REPLAY_MAX_SHARE * 100}%)\n${distributionTable(counts, total)}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nReplay distribution (${total} streams, ${distinct} distinct, max ${(maxShare * 100).toFixed(1)}%, ${leans} leans):\n${distributionTable(counts, total)}`,
    );
    expect(distinct).toBeGreaterThanOrEqual(REPLAY_MIN_DISTINCT);
    expect(maxShare).toBeLessThanOrEqual(REPLAY_MAX_SHARE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2 — simulation (10k synthetic pick-sets, seeded)
// ─────────────────────────────────────────────────────────────────────────────

const SIM_SETS = 10_000;
const SIM_MIN_SHARE = 0.02;
const SIM_MAX_SHARE = 0.1;
const SIM_HARD_CAP = 0.12;

/** Deterministic PRNG (repo rule: no Math.random in tests). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bottle = DnaCatalogFragrance & { id: string };

interface PersonaPrefs {
  /** Target + weight per CATALOG axis — biases which bottles get sampled. */
  prefs?: Partial<Record<CatalogAxis, { t: number; w: number }>>;
  /** Inclusive pick-count range (uniform within). */
  k: [number, number];
  /** Probability the strongest-affinity pick is marked ⭐ favorite. */
  favProb: number;
  /** 'catalog' → draws from the full-catalog sample (search picks, M4). */
  source?: 'pool' | 'catalog';
  /** Structural constraint on the sampled set. */
  structure?: 'distinct-families' | 'one-family';
  /** Share of the 10k sets this persona generates. */
  share: number;
}

/**
 * The sampler roster. The eleven personas named in the plan + uniform, plus
 * five axis-completion personas (presence high/low, greenness, luxury,
 * one-family loyalty) so the full 14-axis space is genuinely spanned — the
 * named list alone leaves presence/greenness/luxury/loyalty unexercised.
 * search-enthusiast is the labeled full-catalog persona (adventurousness
 * only varies there; the picker pool is all-popular by design).
 */
const PERSONAS: Record<string, PersonaPrefs> = {
  uniform: { k: [1, 5], favProb: 0.3, share: 0.2 },
  'warm-lover': { prefs: { warmth: { t: 0.92, w: 1 } }, k: [3, 5], favProb: 0.3, share: 0.047 },
  'sweet-tooth': { prefs: { sweetness: { t: 0.95, w: 1 } }, k: [3, 5], favProb: 0.3, share: 0.047 },
  // One family, quiet, fresh — the "tight set" of the minimalist signature.
  // Cross-family fresh sets read as HIGH family entropy (breadth), which is
  // the explorer/daybreaker corner, not this persona.
  'fresh-minimal': {
    prefs: { warmth: { t: 0.25, w: 1 }, presence: { t: 0.12, w: 1 } },
    k: [2, 3],
    favProb: 0.3,
    structure: 'one-family',
    share: 0.047,
  },
  floral: {
    prefs: { florality: { t: 0.92, w: 1 }, genderLean: { t: 0.9, w: 0.4 } },
    k: [3, 5],
    favProb: 0.3,
    share: 0.047,
  },
  'dark-smoky': { prefs: { darkness: { t: 0.95, w: 1 } }, k: [3, 5], favProb: 0.3, share: 0.047 },
  spicy: { prefs: { spice: { t: 0.95, w: 1 } }, k: [3, 5], favProb: 0.3, share: 0.047 },
  'value-hunter': {
    prefs: { value: { t: 0.85, w: 1 }, luxury: { t: 0.15, w: 0.6 } },
    k: [3, 5],
    favProb: 0.3,
    share: 0.047,
  },
  'loyalist-single-pick': { k: [1, 1], favProb: 1, share: 0.047 },
  'collector-breadth': {
    k: [5, 5],
    favProb: 0.2,
    structure: 'distinct-families',
    share: 0.04,
  },
  'era-old': { prefs: { era: { t: 0.03, w: 1 } }, k: [3, 4], favProb: 0.3, share: 0.047 },
  'era-new': { prefs: { era: { t: 0.95, w: 1 } }, k: [3, 4], favProb: 0.3, share: 0.047 },
  // Labeled: full-catalog search picks (M4) — the only sampler where
  // adventurousness varies; DO NOT point it at the pool.
  'search-enthusiast': {
    k: [3, 5],
    favProb: 0.3,
    source: 'catalog',
    share: 0.047,
  },
  // ── axis-completion personas ──
  'luxe-polished': {
    prefs: { luxury: { t: 0.92, w: 1 }, presence: { t: 0.6, w: 0.3 } },
    k: [3, 5],
    favProb: 0.3,
    share: 0.047,
  },
  'loud-presence': {
    prefs: { presence: { t: 0.97, w: 1 }, warmth: { t: 0.7, w: 0.3 } },
    k: [3, 5],
    favProb: 0.3,
    share: 0.025,
  },
  // Loud, broad, AND ⭐-anchored — the maximalist corner. The pool cannot
  // produce loud+distinct-family sets (loud bottles cluster in few families;
  // forcing family spread pulls in quiet ones), so the anchor favorite is
  // what separates this wardrobe from the explorer's unanchored variety.
  'more-is-more': {
    prefs: { presence: { t: 0.85, w: 1 } },
    k: [4, 5],
    favProb: 0.7,
    structure: 'distinct-families',
    share: 0.04,
  },
  'skin-scent': {
    prefs: {
      presence: { t: 0.25, w: 1 },
      florality: { t: 0.6, w: 0.5 },
      genderLean: { t: 0.85, w: 0.4 },
    },
    k: [3, 4],
    favProb: 0.3,
    share: 0.047,
  },
  'green-nature': { prefs: { greenness: { t: 0.92, w: 1 } }, k: [3, 5], favProb: 0.3, share: 0.047 },
  // 4–5 picks so the breadth/loyalty evidence-damping fully releases — a
  // 3-pick "signature wardrobe" still reads half-neutral by design.
  'one-family-loyalist': {
    k: [4, 5],
    favProb: 1,
    structure: 'one-family',
    share: 0.048,
  },
};

/** Per-bottle catalog-axis percentile vector, precomputed once. */
type PctVector = Partial<Record<CatalogAxis, number>>;

function pctVector(f: Bottle): PctVector {
  const v: PctVector = {};
  for (const axis of CATALOG_AXES) {
    const p = axisPercentileOf(axis, f);
    if (p != null) v[axis] = p;
  }
  return v;
}

/** Gaussian affinity of a bottle to a persona's axis targets (sampler bias only). */
function affinity(vec: PctVector, prefs: NonNullable<PersonaPrefs['prefs']>): number {
  const SIGMA2 = 2 * 0.13 * 0.13;
  let s = 0;
  for (const [axis, spec] of Object.entries(prefs) as [CatalogAxis, { t: number; w: number }][]) {
    const p = vec[axis] ?? 0.5;
    s += (spec.w * (p - spec.t) ** 2) / SIGMA2;
  }
  return Math.exp(-s);
}

/** Weighted sample of one index from `weights` (already filtered to available). */
function sampleIndex(weights: number[], rand: () => number): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) {
    return Math.floor(rand() * weights.length) % weights.length;
  }
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function distributionTable(
  counts: Map<ArchetypeKey, number>,
  total: number,
  order?: readonly ArchetypeKey[],
): string {
  const keys = order ?? [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return keys
    .map((k) => {
      const n = counts.get(k) ?? 0;
      return `  ${k.padEnd(24)} ${String(n).padStart(5)}  (${((n / total) * 100).toFixed(2)}%)`;
    })
    .join('\n');
}

describe('M2 simulation gate — 10k synthetic pick-sets, seeded', () => {
  const pool = Object.values(simFixture.pool) as unknown as Bottle[];
  const catalogSample = Object.values(simFixture.catalogSample) as unknown as Bottle[];

  it('fixture is the real pool + a full-catalog sample', () => {
    expect(pool.length).toBeGreaterThanOrEqual(100);
    expect(catalogSample.length).toBeGreaterThanOrEqual(300);
  });

  it(`every label on ${SIM_MIN_SHARE * 100}–${SIM_MAX_SHARE * 100}% of sets, none >${SIM_HARD_CAP * 100}%, median margin ≥ ${V3_LEAN_MARGIN}`, () => {
    const rand = mulberry32(20260709); // fixed seed — byte-identical every run

    // Precompute per-bottle percentile vectors + per-persona affinities once.
    const poolVecs = pool.map(pctVector);
    const catalogVecs = catalogSample.map(pctVector);
    const personaNames = Object.keys(PERSONAS);
    const personaAffinity = new Map<string, number[]>();
    for (const name of personaNames) {
      const p = PERSONAS[name];
      const vecs = p.source === 'catalog' ? catalogVecs : poolVecs;
      personaAffinity.set(
        name,
        p.prefs ? vecs.map((v) => affinity(v, p.prefs!)) : vecs.map(() => 1),
      );
    }

    // Deterministic set counts per persona (shares normalized to sum to 1).
    const shareTotal = personaNames.reduce((s, n) => s + PERSONAS[n].share, 0);
    const setCounts = personaNames.map((name, i) => ({
      name,
      n:
        i === personaNames.length - 1
          ? 0 // filled below so the total is exactly SIM_SETS
          : Math.round((PERSONAS[name].share / shareTotal) * SIM_SETS),
    }));
    const allocated = setCounts.reduce((s, c) => s + c.n, 0);
    setCounts[setCounts.length - 1].n = SIM_SETS - allocated;

    const counts = new Map<ArchetypeKey, number>();
    const margins: number[] = [];
    // persona → label counts + margins, for the failure report (who feeds whom).
    const personaCounts = new Map<string, Map<ArchetypeKey, number>>();
    const personaMargins = new Map<string, number[]>();
    const nearMissPairs = new Map<string, number>();

    for (const { name, n } of setCounts) {
      const persona = PERSONAS[name];
      const bottles = persona.source === 'catalog' ? catalogSample : pool;
      const baseAff = personaAffinity.get(name)!;

      for (let set = 0; set < n; set++) {
        const k =
          persona.k[0] + Math.floor(rand() * (persona.k[1] - persona.k[0] + 1));

        // Sample k bottles without replacement, honoring structure.
        const chosen: number[] = [];
        const usedFamilies = new Set<string>();
        let lockedFamily: string | null = null;
        for (let pick = 0; pick < k; pick++) {
          const avail: number[] = [];
          const weights: number[] = [];
          for (let i = 0; i < bottles.length; i++) {
            if (chosen.includes(i)) continue;
            const fam = (bottles[i].fragrance_family || 'unknown').toLowerCase();
            if (persona.structure === 'distinct-families' && usedFamilies.has(fam)) continue;
            if (persona.structure === 'one-family' && lockedFamily && fam !== lockedFamily)
              continue;
            avail.push(i);
            weights.push(baseAff[i]);
          }
          if (!avail.length) break;
          const idx = avail[sampleIndex(weights, rand)];
          chosen.push(idx);
          const fam = (bottles[idx].fragrance_family || 'unknown').toLowerCase();
          usedFamilies.add(fam);
          if (persona.structure === 'one-family' && !lockedFamily) lockedFamily = fam;
        }

        // Strongest-affinity pick gets the ⭐ when the flip fires.
        let favIdx = -1;
        if (rand() < persona.favProb) {
          favIdx = 0;
          for (let c = 1; c < chosen.length; c++) {
            if (baseAff[chosen[c]] > baseAff[chosen[favIdx]]) favIdx = c;
          }
        }

        const picks: DnaPick[] = chosen.map((i, c) => {
          const r = rand();
          return {
            fragrance: bottles[i],
            relation: r < 0.6 ? 'own' : r < 0.9 ? 'like' : 'want',
            favorite: c === favIdx,
          };
        });

        const election = electArchetype(deriveAxes(picks));
        counts.set(election.primary, (counts.get(election.primary) ?? 0) + 1);
        margins.push(election.margin);
        let pc = personaCounts.get(name);
        if (!pc) personaCounts.set(name, (pc = new Map()));
        pc.set(election.primary, (pc.get(election.primary) ?? 0) + 1);
        let pm = personaMargins.get(name);
        if (!pm) personaMargins.set(name, (pm = []));
        pm.push(election.margin);
        if (election.margin < V3_LEAN_MARGIN) {
          const pair = `${election.primary.replace(/^the_/, '')}↔${election.runnerUp.replace(/^the_/, '')}`;
          nearMissPairs.set(pair, (nearMissPairs.get(pair) ?? 0) + 1);
        }
      }
    }

    const shares = V3_ARCHETYPE_KEYS.map((k) => (counts.get(k) ?? 0) / SIM_SETS);
    const minShare = Math.min(...shares);
    const maxShare = Math.max(...shares);
    const med = median(margins);
    const decisiveFrac = margins.filter((m) => m >= V3_LEAN_MARGIN).length / margins.length;

    const report =
      `\nSimulation distribution (${SIM_SETS} sets):\n` +
      distributionTable(counts, SIM_SETS, V3_ARCHETYPE_KEYS) +
      `\n  min share ${(minShare * 100).toFixed(2)}% (need ≥${SIM_MIN_SHARE * 100}%)` +
      `\n  max share ${(maxShare * 100).toFixed(2)}% (need ≤${SIM_MAX_SHARE * 100}%)` +
      `\n  median margin ${med.toFixed(4)} (need ≥${V3_LEAN_MARGIN})` +
      `\n  decisive sets ${(decisiveFrac * 100).toFixed(1)}%`;

    if (minShare < SIM_MIN_SHARE || maxShare > SIM_MAX_SHARE || med < V3_LEAN_MARGIN) {
      const personaReport = [...personaCounts.entries()]
        .map(([persona, pc]) => {
          const top = [...pc.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, c]) => `${k.replace(/^the_/, '')}:${c}`)
            .join(' ');
          const med = median(personaMargins.get(persona)!);
          return `  ${persona.padEnd(22)} m̃=${med.toFixed(3)}  ${top}`;
        })
        .join('\n');
      const pairReport = [...nearMissPairs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([pair, n]) => `  ${pair.padEnd(36)} ${n}`)
        .join('\n');
      throw new Error(
        `Simulation gate FAILED:${report}\n\nPer-persona top-5 elections:\n${personaReport}\n\nTop indecisive boundaries (winner↔runnerUp, margin<lean):\n${pairReport}`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(report); // the distribution table feeds the milestone Log

    for (const share of shares) {
      expect(share).toBeGreaterThanOrEqual(SIM_MIN_SHARE);
      expect(share).toBeLessThanOrEqual(SIM_MAX_SHARE);
      expect(share).toBeLessThanOrEqual(SIM_HARD_CAP);
    }
    expect(med).toBeGreaterThanOrEqual(V3_LEAN_MARGIN);
  });
});
