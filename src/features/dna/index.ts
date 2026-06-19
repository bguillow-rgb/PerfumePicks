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
export { deriveArchetype } from './archetype';
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
export { deriveFragranceDNA, fallbackDNA } from './deriveDna';
export type {
  DeriveDnaInput,
  DeriveDnaResult,
  DnaComputeEvent,
} from './deriveDna';
export { deriveDnaFromAnswers } from './deriveDnaFromAnswers';
export type { SeedAnswers } from './deriveDnaFromAnswers';
