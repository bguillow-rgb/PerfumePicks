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

// 'like' = a pure taste signal: the user is drawn to the scent but neither owns
// it nor wants to buy it. It feeds the DNA at full weight (pickWeight treats any
// non-'want' relation as 1.0) but is deliberately NOT seeded into the wardrobe.
export type SeedRelation = 'own' | 'want' | 'like';

export interface DnaSeed {
  id: string;
  relation: SeedRelation;
  favorite: boolean;
  /**
   * ISO timestamp the seed entered the pool. Drives recency decay in the Living
   * DNA engine (newer signals weigh more). Optional for back-compat: legacy DNAs
   * persisted before this field are backfilled at read/migration time; a missing
   * value is treated as "fresh" (no decay) so old DNAs never silently decay.
   */
  seededAt?: string;
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

/** A committed archetype change, surfaced once as the "You've shifted" nudge. */
export interface ArchetypeShift {
  from: ArchetypeKey;
  to: ArchetypeKey;
}

export interface DnaArchetype {
  primary: ArchetypeKey;
  /** Strongest secondary trait (snake_case key) — populated, no longer deferred. */
  modifier: string | null;
  /**
   * Living-archetype "lean" (PRD §6.6). The runner-up archetype currently
   * pulling ahead, surfaced as a "leaning toward X" indicator before a swap
   * commits. Optional so a fresh derivation (no prior state) stays byte-identical
   * to the legacy archetype — preserves the T-U4 no-regression guarantee.
   */
  challenger?: ArchetypeKey | null;
  /** ISO timestamp the challenger first pulled ahead by SWAP_MARGIN; null when not leading. */
  leadSince?: string | null;
  /**
   * True once the `challenger` has crossed LEAN_REVEAL_RATIO of the primary's
   * score — the persisted signal the readout uses to show "leaning toward X"
   * without re-deriving the ranking (the raw scores aren't persisted).
   */
  leaning?: boolean;
  /**
   * Set on the single recompute where the committed `primary` swapped. Drives the
   * one-time "You've shifted" nudge; cleared by `acknowledgeArchetypeShift` once
   * the user has seen it. Carried forward across non-swap recomputes so an
   * unacknowledged nudge is never silently wiped.
   */
  pendingShift?: ArchetypeShift | null;
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
  /**
   * Pre-resolved effective weight. When set (Living DNA pool), the derivation
   * helpers use it verbatim instead of `pickWeight(relation, favorite)`. Absent
   * for plain onboarding picks → legacy weighting path is byte-identical.
   */
  weight?: number;
  /** ISO timestamp this pick entered the pool (recency anchor). */
  seededAt?: string;
}
