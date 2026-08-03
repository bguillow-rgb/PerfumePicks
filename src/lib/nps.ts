/**
 * NPS gating — deliberately INDEPENDENT of the App Store review prompt.
 *
 * Apple forbids gating the native review prompt on a satisfaction check, so
 * this never routes a score to StoreReview. It's a private pulse: ask once,
 * re-ask at most every NPS_COOLDOWN_DAYS, only after the user has opened the
 * app enough to have an opinion and shown real engagement.
 *
 * SecureStore (keychain) keys survive reinstalls, so we don't re-pester on a
 * device restore.
 *
 * Ported from Pour Picks — same thresholds so scores stay comparable across
 * the Picks family in the shared feedback hub.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_OPENS = 'perfumepicks.nps.open_count';
const KEY_ASKED_AT = 'perfumepicks.nps.asked_at';
const OPEN_THRESHOLD = 5;
const NPS_COOLDOWN_DAYS = 90;

/**
 * Increment the open counter and decide whether to show NPS this launch.
 * Call once per app open. `hasEngaged` reflects genuine value received; pass a
 * FUNCTION when resolving it costs a query — it is only invoked after the cheap
 * open-count and cooldown gates have already passed. Same bar as the review
 * prompt: e.g. a wardrobe item or a logged wear.
 */
export async function shouldShowNps(
  hasEngaged: boolean | (() => boolean | Promise<boolean>)
): Promise<boolean> {
  // E2E escape hatch. The real gate needs 5 launches + engagement + a 90-day
  // cooldown, which no automated test can sit through, so the sheet would
  // otherwise be unreachable in Maestro. __DEV__-guarded so the branch is
  // stripped from release builds and cannot fire for a real user.
  if (__DEV__ && process.env.EXPO_PUBLIC_NPS_FORCE === '1') return true;

  let count = 0;
  try {
    const raw = await SecureStore.getItemAsync(KEY_OPENS);
    count = parseInt(raw ?? '0', 10) + 1;
    await SecureStore.setItemAsync(KEY_OPENS, String(count));
  } catch {
    return false;
  }

  if (count < OPEN_THRESHOLD) return false;

  try {
    const askedAt = await SecureStore.getItemAsync(KEY_ASKED_AT);
    if (askedAt) {
      const elapsedDays = (Date.now() - Number(askedAt)) / 86_400_000;
      if (elapsedDays < NPS_COOLDOWN_DAYS) return false;
    }
  } catch {
    return false;
  }

  // Resolved LAST and lazily: this is the only potentially expensive check
  // (a DB or provider read in some apps), and the prompt fires roughly once
  // per 90 days, so it must not run on every cold launch.
  const engaged = typeof hasEngaged === 'function' ? await hasEngaged() : hasEngaged;
  if (!engaged) return false;

  return true;
}

/** Record that we asked, so the cooldown starts now. */
export async function markNpsAsked(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_ASKED_AT, String(Date.now()));
  } catch {
    // Best-effort.
  }
}
