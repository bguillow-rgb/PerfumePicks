/**
 * deriveFragranceDNA() — orchestrates the picker → full v2 DNA envelope.
 *
 * This is the single entry point M2+ calls. It composes the pure sub-derivations
 * (aggregate → outcomes → traits → archetype → wardrobe → journey → confidence)
 * and is wrapped in a COMPUTE-FAILURE guard: if anything throws, it emits a dumb
 * fallback DNA (`source:"picker"`, `confidence:0.1`, generic identity) plus a
 * `dna_compute_failed` event — never blocking activation, never an infinite
 * spinner. (Milestone plan M1 build invariant.)
 */

import type {
  DnaCatalogFragrance,
  DnaPick,
  DnaSeed,
  DnaSource,
  FragranceDNA,
} from './types';
import { FRAGRANCE_DNA_VERSION, TRAIT_SCHEMA_VERSION } from './types';
import { aggregateFromFragrances } from './aggregate';
import { deriveOutcomes } from './outcomes';
import { deriveTraits } from './traits';
import {
  deriveArchetype,
  dominantSecondaryTrait,
  rankArchetypes,
  type ArchetypeScore,
} from './archetype';
import { deriveAxes } from './axes';
import { electArchetype } from './centroids';
import { isDnaV3ArchetypesEnabled } from './v3Flag';
import { deriveWardrobe } from './wardrobe';
import { matchJourney } from './journey';
import { computeConfidence } from './confidence';
import {
  buildDnaSignals,
  signalsToPools,
  type BuildSignalsInput,
} from './signals';

export interface DeriveDnaInput {
  picks: DnaPick[];
  /**
   * The candidate set the picks were chosen FROM (the onboarding picker pool).
   * When supplied, the differentiating traits are scored relative to this pool
   * so WHICH bottles the user picked actually moves their archetype (see
   * deriveTraits). Optional — absent on paths with no offered set.
   */
  referencePool?: DnaCatalogFragrance[];
  /** Fragrances explicitly marked "hard no". */
  avoided?: DnaCatalogFragrance[];
  /** Count of explicit fallback questions answered (feeds confidence). */
  answeredCount?: number;
  source?: DnaSource;
  /** Injectable clock for deterministic tests. */
  now?: () => string;
  /**
   * DNA V3 centroid election (`dna_v3_archetypes` flag). Defaults to the
   * remote-resolved flag cache (v3Flag.ts — false until explicitly enabled);
   * injectable for deterministic tests. Flag OFF → the legacy SCORERS election
   * runs byte-identical (no-regression contract).
   */
  v3Archetypes?: boolean;
}

export type DnaComputeEvent = 'dna_compute_failed';

export interface DeriveDnaResult {
  dna: FragranceDNA;
  /** Analytics events the caller should emit (e.g. on compute failure). */
  events: DnaComputeEvent[];
  /**
   * Full archetype ranking (strongest-first) for this derivation. Present on the
   * living path so the recompute orchestrator can drive the §6.6 lean/swap
   * mechanic (`applyLivingArchetype`); absent on the legacy/fallback paths.
   */
  archetypeScores?: ArchetypeScore[];
}

const isoNow = () => new Date().toISOString();

/**
 * V3 centroid election over the 14-axis user vector (axes.ts + centroids.ts).
 * Returns the archetype (with margin-driven "X with a Y lean" surfaced through
 * the existing challenger/leaning fields) plus the ranked scores for the
 * living lean/swap plumbing.
 */
function electV3(
  picks: DnaPick[],
  modifier: string | null,
): { archetype: FragranceDNA['archetype']; ranked: ArchetypeScore[] } {
  const election = electArchetype(deriveAxes(picks));
  const archetype: FragranceDNA['archetype'] = {
    primary: election.primary,
    modifier,
  };
  if (election.lean) {
    // Not decisive: honest "primary with a runnerUp lean" on the reveal.
    archetype.challenger = election.runnerUp;
    archetype.leaning = true;
  }
  return { archetype, ranked: election.ranked };
}

function seedsFromPicks(picks: DnaPick[], now: () => string = isoNow): DnaSeed[] {
  return picks.map((p) => ({
    id: p.fragrance.id,
    relation: p.relation,
    favorite: p.favorite,
    seededAt: p.seededAt ?? now(),
  }));
}

export function deriveFragranceDNA(input: DeriveDnaInput): DeriveDnaResult {
  const {
    picks,
    referencePool,
    avoided = [],
    answeredCount = 0,
    source = 'picker',
    now = isoNow,
    v3Archetypes = isDnaV3ArchetypesEnabled(),
  } = input;

  try {
    const agg = aggregateFromFragrances(picks, avoided);
    const outcomes = deriveOutcomes(picks);
    const traits = deriveTraits(picks, referencePool);
    const v3 = v3Archetypes ? electV3(picks, dominantSecondaryTrait(traits)) : null;
    const archetype = v3 ? v3.archetype : deriveArchetype(traits, outcomes, picks);

    const ownedFrags = picks.filter((p) => p.relation === 'own').map((p) => p.fragrance);
    const wardrobe = deriveWardrobe(ownedFrags);

    const confidence = computeConfidence({
      seedCount: picks.length,
      answeredCount,
      weights: agg.weights,
    });

    const dna: FragranceDNA = {
      version: FRAGRANCE_DNA_VERSION,
      category: 'fragrance',
      source,
      accords: agg.accords,
      families: agg.families,
      likedNotes: agg.likedNotes,
      dislikedNotes: agg.dislikedNotes,
      performance: agg.performance,
      projectionCap: null,
      gender: agg.gender,
      season: agg.season,
      price: agg.price,
      outcomes,
      traits,
      archetype,
      seeds: seedsFromPicks(picks, now),
      avoided: avoided.map((f) => f.id),
      journey: null,
      wardrobe,
      confidence,
      updatedAt: now(),
    };

    // Journey reads the assembled DNA (accords/families/traits).
    dna.journey = matchJourney(dna);

    // Legacy path returns the exact legacy shape (no extra keys) — the
    // no-regression contract. V3 additionally exposes its ranking.
    return v3 ? { dna, events: [], archetypeScores: v3.ranked } : { dna, events: [] };
  } catch {
    return { dna: fallbackDNA(picks, avoided, source, now), events: ['dna_compute_failed'] };
  }
}

/**
 * deriveLivingDNA() — the unified-pool entry point (PRD §7.2).
 *
 * Onboarding picks + swipes + wears + wardrobe collapse into ONE recency-weighted
 * pool, then run through the SAME sub-derivations as deriveFragranceDNA. A
 * seeds-only call (no behavioral signals, picks deliberate + fresh) reduces
 * exactly to deriveFragranceDNA — the no-regression guarantee (T-U4) holds by
 * construction, because each pooled pick's resolved `weight` equals
 * pickWeight(relation, favorite) and the OWNED set is the relation==='own' picks.
 */
export interface DeriveLivingDnaInput extends BuildSignalsInput {
  /** Explicit "hard no" fragrances (in addition to dislike swipes). */
  avoided?: DnaCatalogFragrance[];
  answeredCount?: number;
  source?: DnaSource;
  /** See DeriveDnaInput.v3Archetypes — defaults to the resolved flag cache. */
  v3Archetypes?: boolean;
}

export function deriveLivingDNA(input: DeriveLivingDnaInput): DeriveDnaResult {
  const {
    picks,
    avoided: explicitAvoided = [],
    answeredCount = 0,
    source = 'hybrid',
    now = isoNow,
    v3Archetypes = isDnaV3ArchetypesEnabled(),
  } = input;

  try {
    const signals = buildDnaSignals(input);
    const { pool, avoided: aversive, ownedFrags, signalCount } = signalsToPools(
      signals,
      Date.parse(now()),
    );
    const avoided = [...explicitAvoided, ...aversive];

    const agg = aggregateFromFragrances(pool, avoided);
    const outcomes = deriveOutcomes(pool);
    const traits = deriveTraits(pool);
    // V3: centroid election supplies both the fresh archetype AND the ranked
    // list the living lean/swap orchestrator (applyLivingArchetype) consumes.
    const v3 = v3Archetypes ? electV3(pool, dominantSecondaryTrait(traits)) : null;
    const archetypeScores = v3 ? v3.ranked : rankArchetypes(traits, outcomes, pool);
    const archetype = v3 ? v3.archetype : deriveArchetype(traits, outcomes, pool);
    const wardrobe = deriveWardrobe(ownedFrags);

    const confidence = computeConfidence({
      seedCount: signalCount,
      answeredCount,
      weights: agg.weights,
    });

    const dna: FragranceDNA = {
      version: FRAGRANCE_DNA_VERSION,
      category: 'fragrance',
      source,
      accords: agg.accords,
      families: agg.families,
      likedNotes: agg.likedNotes,
      dislikedNotes: agg.dislikedNotes,
      performance: agg.performance,
      projectionCap: null,
      gender: agg.gender,
      season: agg.season,
      price: agg.price,
      outcomes,
      traits,
      archetype,
      seeds: seedsFromPicks(picks, now),
      avoided: avoided.map((f) => f.id),
      journey: null,
      wardrobe,
      confidence,
      updatedAt: now(),
    };

    dna.journey = matchJourney(dna);

    return { dna, events: [], archetypeScores };
  } catch {
    return { dna: fallbackDNA(picks, explicitAvoided, source, now), events: ['dna_compute_failed'] };
  }
}

/**
 * The dumb fallback DNA: never blocks activation. Low confidence, generic
 * identity, but a structurally valid v2 envelope so downstream surfaces render.
 */
export function fallbackDNA(
  picks: DnaPick[],
  avoided: DnaCatalogFragrance[],
  source: DnaSource,
  now: () => string = isoNow,
): FragranceDNA {
  return {
    version: FRAGRANCE_DNA_VERSION,
    category: 'fragrance',
    source,
    accords: {},
    families: {},
    likedNotes: {},
    dislikedNotes: {},
    performance: { longevity: 0, projection: 0 },
    projectionCap: null,
    gender: { lean: 'unisex', hard: false },
    season: { summer: 0, winter: 0 },
    price: { targetTier: 3, ceilingCents: null },
    outcomes: {
      compliments: 0,
      officeSafe: 0,
      smellsLuxe: 0,
      versatile: 0,
      dateNight: 0,
      signature: 0,
    },
    traits: {
      schema: TRAIT_SCHEMA_VERSION,
      values: {
        luxury: null,
        adventurous: null,
        collector: null,
        valueHunter: null,
        complimentSeeking: null,
        expressive: null,
      },
    },
    archetype: { primary: 'the_explorer', modifier: null },
    seeds: seedsFromPicks(picks, now),
    avoided: avoided.map((f) => f.id),
    journey: null,
    wardrobe: null,
    confidence: 0.1,
    updatedAt: now(),
  };
}
