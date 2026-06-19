/**
 * Fragrance DNA — contract v2 (the cross-app passport envelope).
 *
 * Reads on the specs:
 *   - perfume-picks-dna-spec-v1.md       (Part 4 — base taste envelope)
 *   - perfume-picks-dna-spec-v1.1-addendum.md (A1 — outcomes + traits + seeds/avoided + archetype)
 *   - perfume-picks-dna-spec-v1.2-addendum.md (B4 — journey + wardrobe blocks)
 *   - perfume-picks-dna-milestone-plan-v1.md  (M1 — pure derivation logic, ships dark)
 *
 * Design rules baked into the types:
 *   - The OUTER `version` is the envelope version. The trait AXIS LIST is versioned
 *     SEPARATELY, inside `traits.schema`, so axes can evolve without a contract
 *     migration (the "Mark Z footgun fix"). Freeze the envelope, not the axis list.
 *   - `traits` keys are frozen and IDENTICAL across every Timberline app. A trait may
 *     be `null` where an app cannot derive it, but the KEY always exists.
 *   - `outcomes` keys are per-category dialect (fragrance-specific here).
 *   - `journey` / `wardrobe` are derived/optional — absent until computed, never blocking
 *     the core DNA.
 */

export const FRAGRANCE_DNA_VERSION = 2 as const;

/** Versioned independently of the envelope so the axis list can grow safely. */
export const TRAIT_SCHEMA_VERSION = 'v1' as const;

export type DnaSource = 'picker' | 'question_fallback' | 'hybrid';

export type GenderLean = 'masculine' | 'feminine' | 'unisex';

export type SeedRelation = 'own' | 'want';

export interface DnaSeed {
  id: string;
  relation: SeedRelation;
  favorite: boolean;
}

export interface DnaGender {
  lean: GenderLean;
  /** Hard filter only ever set by an explicit fallback answer — never from picks. */
  hard: boolean;
}

export interface DnaPrice {
  /** Soft target tier (1..5). */
  targetTier: number;
  /** Hard ceiling, only from an explicit budget answer. */
  ceilingCents: number | null;
}

export interface DnaPerformance {
  /** 0..5 soft mean. */
  longevity: number;
  /** 0..5 soft mean. */
  projection: number;
}

/** Per-category dialect — the words a fragrance buyer actually uses. 0..1 each. */
export interface DnaOutcomes {
  compliments: number;
  officeSafe: number;
  smellsLuxe: number;
  versatile: number;
  dateNight: number;
  signature: number;
}

/** The six universal cross-app buyer-psychology axes. Frozen + identical everywhere. */
export type TraitKey =
  | 'luxury'
  | 'adventurous'
  | 'collector'
  | 'valueHunter'
  | 'complimentSeeking'
  | 'expressive';

export const TRAIT_KEYS: readonly TraitKey[] = [
  'luxury',
  'adventurous',
  'collector',
  'valueHunter',
  'complimentSeeking',
  'expressive',
] as const;

/** A trait value is 0..1, or `null` when an app cannot yet derive it. */
export type TraitValues = Record<TraitKey, number | null>;

export interface DnaTraits {
  /** Axis-list version, independent of the envelope version. */
  schema: string;
  values: TraitValues;
}

export type ArchetypeKey =
  | 'the_executive'
  | 'the_seducer'
  | 'the_crowd_pleaser'
  | 'the_connoisseur'
  | 'the_signature_wearer'
  | 'the_purist'
  | 'the_showstopper'
  | 'the_smart_shopper'
  | 'the_romantic'
  | 'the_explorer'
  | 'the_classicist'
  | 'the_rebel';

export interface DnaArchetype {
  primary: ArchetypeKey;
  /** Strongest secondary trait (snake_case key) — populated, no longer deferred. */
  modifier: string | null;
}

export type JourneySource = 'editorial' | 'cohort';

export interface DnaJourney {
  ladderId: string;
  /** 1-based position on the ladder. */
  stage: number;
  stageLabel: string;
  /** The next rung(s) — "what you'll discover next". Exemplar ids/keys. */
  nextLikely: string[];
  source: JourneySource;
}

export type WardrobeSlot = 'signature' | 'office' | 'date' | 'warm' | 'cold' | 'formal';

export const WARDROBE_SLOTS: readonly WardrobeSlot[] = [
  'signature',
  'office',
  'date',
  'warm',
  'cold',
  'formal',
] as const;

export interface DnaWardrobe {
  slots: Record<WardrobeSlot, boolean>;
  /** filledSlots / 6. */
  completion: number;
  /** Highest-value empty slot → drives the "complete your collection" sell. */
  biggestGap: WardrobeSlot | null;
}

/** The full v2 envelope. */
export interface FragranceDNA {
  version: typeof FRAGRANCE_DNA_VERSION;
  category: 'fragrance';
  source: DnaSource;

  // ── PRIMARY taste signal ──
  accords: Record<string, number>;
  families: Record<string, number>;
  likedNotes: Record<string, number>;
  dislikedNotes: Record<string, number>;
  performance: DnaPerformance;
  projectionCap: number | null;
  gender: DnaGender;
  season: Record<string, number>;
  price: DnaPrice;

  // ── buyer model ──
  outcomes: DnaOutcomes;
  traits: DnaTraits;
  archetype: DnaArchetype;

  // ── provenance ──
  seeds: DnaSeed[];
  avoided: string[];

  // ── predictive / diagnostic (optional) ──
  journey: DnaJourney | null;
  wardrobe: DnaWardrobe | null;

  // ── meta ──
  confidence: number;
  updatedAt: string;
}

/**
 * The structural subset of a catalog fragrance the DNA engine reads. Every
 * catalog `Fragrance` / `MockFragrance` satisfies this shape, so the engine
 * stays decoupled from the full catalog row and is trivially unit-testable.
 */
export interface DnaCatalogFragrance {
  id: string;
  fragrance_family: string;
  gender: GenderLean;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  accord_intensity: Record<string, number>;
  community_longevity: number;
  community_sillage: number;
  community_projection: number;
  compliment_score: number;
  versatility_score: number;
  office_safe_score: number;
  price_tier: number;
  retail_msrp_usd_cents: number;
  /** Added in M0 (DB). Optional here so mock rows without it still derive. */
  popularity_tier?: number;
  release_year?: number;
  dupe_of?: string | null;
}

/** One picker selection, resolved to its catalog fragrance + onboarding tags. */
export interface DnaPick {
  fragrance: DnaCatalogFragrance;
  relation: SeedRelation;
  favorite: boolean;
}
