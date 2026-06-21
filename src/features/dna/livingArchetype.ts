/**
 * Living archetype — the "lean → swap" mechanic (PRD §6.6).
 *
 * deriveArchetype only ever surfaces the #1 archetype. But taste drifts, and a
 * hard flip the instant a runner-up edges ahead would feel jumpy and arbitrary.
 * This layer adds deliberate hysteresis on top of the raw ranking:
 *
 *   1. The runner-up that is pulling ahead is exposed as a `challenger`, shown
 *      as a live "leaning toward X" indicator once it reaches LEAN_REVEAL_RATIO
 *      of the current archetype's score.
 *   2. The committed `primary` only swaps after the challenger has stayed ahead
 *      by SWAP_MARGIN for SWAP_COOLDOWN_DAYS — tracked via `leadSince`.
 *
 * This module is pure + deterministic (clock injected as `nowIso`). The store
 * persists `primary`/`challenger`/`leadSince` across recomputes; this function
 * advances that state one step. Covered by unit suite T-U9.
 */

import type { ArchetypeScore } from './archetype';
import { ARCHETYPE_COPY } from './revealCopy';
import { LEAN_REVEAL_RATIO, SWAP_MARGIN, SWAP_COOLDOWN_DAYS } from './signals';
import type { DnaArchetype } from './types';

const DAY_MS = 86_400_000;

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
 * @param prev     the persisted archetype state (primary + challenger + leadSince).
 * @param ranked   fresh `rankArchetypes(...)` output, strongest-first.
 * @param modifier fresh dominant-secondary-trait modifier for this recompute.
 * @param nowIso   injected clock.
 */
export function applyLivingArchetype(
  prev: DnaArchetype,
  ranked: ArchetypeScore[],
  modifier: string | null,
  nowIso: string,
): LivingArchetypeResult {
  let primary = prev.primary;
  let leadSince = prev.leadSince ?? null;
  let swapped = false;

  const challenger = topChallenger(ranked, primary);
  const currentScore = scoreOf(ranked, primary);

  if (challenger && currentScore > 0) {
    const ahead = challenger.score >= currentScore * (1 + SWAP_MARGIN);
    if (ahead) {
      // start (or keep) the swap clock
      if (leadSince == null) leadSince = nowIso;
      const heldDays = (Date.parse(nowIso) - Date.parse(leadSince)) / DAY_MS;
      if (heldDays >= SWAP_COOLDOWN_DAYS) {
        // commit the swap — the challenger has earned it
        primary = challenger.key;
        leadSince = null;
        swapped = true;
      }
    } else {
      // challenger fell back inside the margin → reset the clock
      leadSince = null;
    }
  } else {
    leadSince = null;
  }

  // recompute the surfaced challenger against the (possibly swapped) primary
  const surfaced = topChallenger(ranked, primary);

  const archetype: DnaArchetype = {
    primary,
    modifier,
    challenger: surfaced ? surfaced.key : null,
    leadSince,
  };
  // Persist the lean flag + the one-time shift nudge so the readout can render
  // purely from stored state (the raw scores are not persisted).
  archetype.leaning = isLeaning(archetype, ranked);
  archetype.pendingShift = swapped
    ? { from: prev.primary, to: primary }
    : (prev.pendingShift ?? null);

  return { archetype, swapped };
}

// ── Display helpers (consumed by M4 readout UI; pure, unit-testable now) ──────

/** clamp to [0,1]. */
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Should the "leaning toward X" line show? True once the challenger reaches
 * LEAN_REVEAL_RATIO of the current archetype's score.
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

/**
 * Progress of the swap clock in [0,1] — how close the challenger is to
 * committing. 0 when no clock is running, 1 at the cooldown threshold.
 */
export function swapProgress(archetype: DnaArchetype, now: number = Date.now()): number {
  if (!archetype.leadSince) return 0;
  const heldDays = (now - Date.parse(archetype.leadSince)) / DAY_MS;
  return clamp01(heldDays / SWAP_COOLDOWN_DAYS);
}
