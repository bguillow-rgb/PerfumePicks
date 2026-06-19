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
import { deriveArchetype } from './archetype';
import { deriveWardrobe } from './wardrobe';
import { matchJourney } from './journey';
import { computeConfidence } from './confidence';

export interface DeriveDnaInput {
  picks: DnaPick[];
  /** Fragrances explicitly marked "hard no". */
  avoided?: DnaCatalogFragrance[];
  /** Count of explicit fallback questions answered (feeds confidence). */
  answeredCount?: number;
  source?: DnaSource;
  /** Injectable clock for deterministic tests. */
  now?: () => string;
}

export type DnaComputeEvent = 'dna_compute_failed';

export interface DeriveDnaResult {
  dna: FragranceDNA;
  /** Analytics events the caller should emit (e.g. on compute failure). */
  events: DnaComputeEvent[];
}

const isoNow = () => new Date().toISOString();

function seedsFromPicks(picks: DnaPick[]): DnaSeed[] {
  return picks.map((p) => ({
    id: p.fragrance.id,
    relation: p.relation,
    favorite: p.favorite,
  }));
}

export function deriveFragranceDNA(input: DeriveDnaInput): DeriveDnaResult {
  const {
    picks,
    avoided = [],
    answeredCount = 0,
    source = 'picker',
    now = isoNow,
  } = input;

  try {
    const agg = aggregateFromFragrances(picks, avoided);
    const outcomes = deriveOutcomes(picks);
    const traits = deriveTraits(picks);
    const archetype = deriveArchetype(traits, outcomes, picks);

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
      seeds: seedsFromPicks(picks),
      avoided: avoided.map((f) => f.id),
      journey: null,
      wardrobe,
      confidence,
      updatedAt: now(),
    };

    // Journey reads the assembled DNA (accords/families/traits).
    dna.journey = matchJourney(dna);

    return { dna, events: [] };
  } catch {
    return { dna: fallbackDNA(picks, avoided, source, now), events: ['dna_compute_failed'] };
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
    seeds: seedsFromPicks(picks),
    avoided: avoided.map((f) => f.id),
    journey: null,
    wardrobe: null,
    confidence: 0.1,
    updatedAt: now(),
  };
}
