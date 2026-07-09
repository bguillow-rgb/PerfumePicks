/**
 * Fragrance DNA — M1 pure derivation engine (ships dark, no UI).
 *
 * Public surface for M2+ to consume. Everything here is pure, client-side, and
 * unit-tested. UI/routing arrives in later milestones.
 */

export * from './types';
export { aggregateFromFragrances } from './aggregate';
export type { AggregateResult } from './aggregate';
export { deriveOutcomes } from './outcomes';
export { deriveTraits } from './traits';
export { deriveArchetype, rankArchetypes } from './archetype';
export type { ArchetypeScore } from './archetype';
export {
  applyLivingArchetype,
  isLeaning,
  leaningLabel,
} from './livingArchetype';
export type { LivingArchetypeResult } from './livingArchetype';
export {
  scoreFragranceDNA,
  rankWithRelaxation,
} from './score';
export type { DnaScore, RankedDnaRec, RankResult } from './score';
export { assignSlots, deriveWardrobe } from './wardrobe';
export { JOURNEY_LADDERS, matchJourney, getLadderById } from './journey';
export type { JourneyLadder } from './journey';
export {
  computeConfidence,
  MIN_CONFIDENCE,
  MAX_CONFIDENCE,
} from './confidence';
export type { ConfidenceInput } from './confidence';
export { blendProfiles, dnaToTasteProfile } from './blend';
export { deriveFragranceDNA, fallbackDNA, deriveLivingDNA } from './deriveDna';
export type {
  DeriveDnaInput,
  DeriveDnaResult,
  DnaComputeEvent,
  DeriveLivingDnaInput,
} from './deriveDna';
export {
  buildDnaSignals,
  signalsToPools,
  effectiveWeight,
  recencyFactor,
  BASE_WEIGHTS,
  RECOMMENDATION_SIGNAL_WEIGHTS,
  DELIBERATE_MULTIPLIER,
  RECENCY_TAU_DAYS,
  LIVING_DNA_ENABLED,
  LEAN_REVEAL_RATIO,
  SWAP_MARGIN,
} from './signals';
export type {
  DnaSignal,
  DnaSignalKind,
  BehavioralKind,
  BuildSignalsInput,
  LivingPools,
  SwipeInput,
  WearInput,
  WardrobeInput,
} from './signals';
export { deriveDnaFromAnswers } from './deriveDnaFromAnswers';
export type { SeedAnswers } from './deriveDnaFromAnswers';
// ── DNA V3 (M1): catalog-normalized axes + centroid election ──
export { CATALOG_AXES, USER_RELATIVE_AXES, axisPercentile, AXIS_NORMS } from './axisNorms';
export type { CatalogAxis, UserRelativeAxis, DnaAxis, AxisNorm } from './axisNorms';
export { rawAxisScore, axisPercentileOf, accordWeights } from './axisScore';
export { deriveAxes, familyEntropyBreadth, loyaltyRaw } from './axes';
export type { UserAxisVector } from './axes';
export {
  CENTROIDS,
  V3_ARCHETYPE_KEYS,
  V3_LEAN_MARGIN,
  centroidDistance,
  electArchetype,
} from './centroids';
export type { V3ArchetypeKey, CentroidProfile, V3Election } from './centroids';
export { isDnaV3ArchetypesEnabled, setDnaV3ArchetypesEnabled } from './v3Flag';
