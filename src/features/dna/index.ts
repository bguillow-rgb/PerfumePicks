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
  swapProgress,
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
  SWAP_COOLDOWN_DAYS,
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
