/**
 * computeConfidence() — the 0..1 "how well do we know you" score (spec Part 4/7).
 *
 * Reuses the Pour Picks model shape: confidence rises with signal VOLUME (picks
 * + answered questions), then with signal COVERAGE (distinct accords captured).
 * It drives the "still getting to know you" honesty of the first rec and the
 * DNA↔passive blend weight.
 *
 * Calibration targets (illustrative, tune in PM1):
 *   - 0 signals  → 0.1  (the fallback floor)
 *   - ~2 picks   → ~0.38
 *   - ~3 picks   → ~0.47
 * Monotonic in both volume and coverage; clamped to [0.1, 0.95].
 */

import { clamp } from './metrics';

export interface ConfidenceInput {
  seedCount: number;
  answeredCount: number;
  /** The aggregated accord map — distinct keys measure coverage breadth. */
  weights: Record<string, number>;
}

export const MIN_CONFIDENCE = 0.1;
export const MAX_CONFIDENCE = 0.95;

export function computeConfidence({
  seedCount,
  answeredCount,
  weights,
}: ConfidenceInput): number {
  const signalCount = Math.max(0, seedCount) + Math.max(0, answeredCount);
  if (signalCount === 0) return MIN_CONFIDENCE;

  // Diminishing-returns volume curve.
  const volume = 1 - Math.exp(-signalCount / 4); // ~0.39 @2, ~0.53 @3, ~0.71 @5
  const distinctAccords = Object.keys(weights ?? {}).length;
  const coverage = clamp(distinctAccords / 8, 0, 1);

  const raw = MIN_CONFIDENCE + 0.5 * volume + 0.15 * coverage;
  return clamp(raw, MIN_CONFIDENCE, MAX_CONFIDENCE);
}
