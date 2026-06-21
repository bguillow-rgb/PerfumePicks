/**
 * Living archetype — the "lean → swap" mechanic (PRD §6.6).
 *
 * deriveArchetype only ever surfaces the #1 archetype. This layer commits the
 * persisted `primary` and exposes the runner-up:
 *
 *   1. The runner-up pulling ahead is exposed as a `challenger`, shown as a live
 *      "leaning toward X" indicator once it reaches LEAN_REVEAL_RATIO of the
 *      current archetype's score.
 *   2. The committed `primary` swaps the moment the challenger clears SWAP_MARGIN
 *      — no time cooldown, so the archetype always tracks the user's picks. The
 *      margin is the sole anti-flap guard (see signals.ts).
 *
 * This module is pure + deterministic. The store persists `primary`/`challenger`
 * across recomputes; this function advances that state one step. Covered by unit
 * suite T-U9.
 */

import type { ArchetypeScore } from './archetype';
import { ARCHETYPE_COPY } from './revealCopy';
import { LEAN_REVEAL_RATIO, SWAP_MARGIN } from './signals';
import type { DnaArchetype } from './types';

/** The top-ranked archetype that is NOT `current`. */
function topChallenger(ranked: ArchetypeScore[], current: DnaArchetype['primary']): ArchetypeScore | null {
  for (const r of ranked) {
    if (r.key !== current) return r;
  }
  return null;
}

function scoreOf(ranked: ArchetypeScore[], key: DnaArchetype['primary']): number {
  return ranked.find((r) => r.key === key)?.score ?? 0;
}

export interface LivingArchetypeResult {
  archetype: DnaArchetype;
  /** True only on the single recompute where the committed primary changed. */
  swapped: boolean;
}

/**
 * Advance the living-archetype state by one recompute.
 *
 * @param prev     the persisted archetype state (primary + challenger).
 * @param ranked   fresh `rankArchetypes(...)` output, strongest-first.
 * @param modifier fresh dominant-secondary-trait modifier for this recompute.
 */
export function applyLivingArchetype(
  prev: DnaArchetype,
  ranked: ArchetypeScore[],
  modifier: string | null,
): LivingArchetypeResult {
  let primary = prev.primary;
  let swapped = false;

  const challenger = topChallenger(ranked, primary);
  const currentScore = scoreOf(ranked, primary);

  // Swap immediately once the challenger clears the margin — no cooldown clock.
  if (challenger && currentScore > 0 && challenger.score >= currentScore * (1 + SWAP_MARGIN)) {
    primary = challenger.key;
    swapped = true;
  }

  // recompute the surfaced challenger against the (possibly swapped) primary
  const surfaced = topChallenger(ranked, primary);

  const archetype: DnaArchetype = {
    primary,
    modifier,
    challenger: surfaced ? surfaced.key : null,
    leadSince: null,
  };
  // Persist the lean flag + the one-time shift nudge so the readout can render
  // purely from stored state (the raw scores are not persisted).
  archetype.leaning = isLeaning(archetype, ranked);
  archetype.pendingShift = swapped
    ? { from: prev.primary, to: primary }
    : (prev.pendingShift ?? null);

  return { archetype, swapped };
}

// ── Display helpers (consumed by the readout UI; pure, unit-testable) ─────────

/**
 * Should the "leaning toward X" line show? True once the challenger reaches
 * LEAN_REVEAL_RATIO of the current archetype's score (but hasn't yet cleared the
 * SWAP_MARGIN, at which point it would have swapped in).
 */
export function isLeaning(archetype: DnaArchetype, ranked: ArchetypeScore[]): boolean {
  if (!archetype.challenger) return false;
  const currentScore = scoreOf(ranked, archetype.primary);
  if (currentScore <= 0) return false;
  const challengerScore = scoreOf(ranked, archetype.challenger);
  return challengerScore / currentScore >= LEAN_REVEAL_RATIO;
}

/** Display name for the leaning challenger, or null when not leaning. */
export function leaningLabel(archetype: DnaArchetype, ranked: ArchetypeScore[]): string | null {
  if (!isLeaning(archetype, ranked) || !archetype.challenger) return null;
  return ARCHETYPE_COPY[archetype.challenger].name;
}
