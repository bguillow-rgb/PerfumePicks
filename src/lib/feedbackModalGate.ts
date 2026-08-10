/**
 * In-memory, single-session lock so only ONE prompt-style modal can claim the
 * screen at a time. Prevents the "two sheets stack on cold launch" failure.
 * Resets naturally on app restart — that is fine, the per-feature persistent
 * gates (NPS asked-at) handle cross-session frequency.
 *
 * Ported from Pour Picks (src/lib/feedbackModalGate.ts).
 */

let active = false;

/** Try to claim the slot. Returns false if something already holds it. */
export function claimFeedbackModal(): boolean {
  if (active) return false;
  active = true;
  return true;
}

export function releaseFeedbackModal(): void {
  active = false;
}
