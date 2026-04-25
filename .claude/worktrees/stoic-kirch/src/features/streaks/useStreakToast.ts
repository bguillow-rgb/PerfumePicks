// Orchestrator between tick_streak RPC, the Zustand cache, and the user-
// facing toast. Callers on activity emit sites (scan confirm, quiz
// results render, app foreground) invoke `recordActivity(type)` and
// forget — everything else is handled here.
//
// Responsibilities:
//   1. Fire tick_streak RPC via streaksService.
//   2. On success, update the Zustand cache so the profile surface
//      reflects the new state immediately.
//   3. Decide whether to toast. Rules:
//      - Only on true increments (did_increment === true)
//      - Never on resets (current_streak === 1 AND last_activity_date
//        existed previously — inferred from the prev-cached row)
//      - Priority suppression: scan > quiz > engagement. If a higher-
//        priority toast fired in the last 500ms, suppress this one.
//   4. Emit telemetry on BOTH tick and toast so we can see the gap.
//
// Intentionally not a React hook despite the `use` prefix — keeping it
// as a module function means activity emit sites can call it from any
// context (useEffect, handleConfirm, AppState listener) without hook-
// rule gymnastics. Named `useStreakToast` anyway to signal "this is the
// thing the UI reaches for when it wants streak UX" and mirror the
// file convention of other `use*` names in the codebase.

import { Toast } from '@/src/components/ui/Toast';
import { track } from '@/src/lib/observability/analytics';
import { EVENTS } from '@/src/lib/observability/events';
import { useStreakStore } from '@/src/stores/useStreakStore';
import { tickStreak, type StreakTickResult, type StreakType } from './streaksService';

// Priority ordering — higher index wins (scan beats engagement). Used to
// decide whether an incoming tick gets to toast when a recent higher
// priority has already claimed the UI.
const PRIORITY: Record<StreakType, number> = {
  engagement: 0,
  quiz: 1,
  scan: 2,
};

// Module-level suppression window. When we toast, we remember the type
// and timestamp; any tick that arrives in the next 500ms with lower or
// equal priority is silently suppressed. 500ms comfortably covers the
// sequential scan→engagement tick burst (engagement is invoked right
// after scan in app/identify/result.tsx).
let lastToastAt = 0;
let lastToastedPriority = -1;
const SUPPRESSION_WINDOW_MS = 500;

// Per-type client-side rate limiter. The server RPC is already idempotent
// (same-day ticks are no-ops) but we still pay the round-trip cost on
// every call — and AppState 'active' can fire multiple times during fast
// lock/unlock cycles on iOS, which otherwise each invoke recordActivity.
// 30s is long enough to collapse rapid-fire bursts but short enough that
// a transient RPC failure retries naturally on the user's next activity.
const DEBOUNCE_WINDOW_MS = 30_000;
const lastCalledAt: Record<StreakType, number> = {
  engagement: 0,
  quiz: 0,
  scan: 0,
};

function shouldSuppress(type: StreakType): boolean {
  const age = Date.now() - lastToastAt;
  if (age > SUPPRESSION_WINDOW_MS) return false;
  return PRIORITY[type] <= lastToastedPriority;
}

function markToasted(type: StreakType) {
  lastToastAt = Date.now();
  lastToastedPriority = PRIORITY[type];
}

// Copy builder — kept in one place so A/B copy tweaks are trivial.
// Milestones (3/7/14/30/60/100) get unique copy. Everything else uses
// a generic {N}-day template. Emoji is in-copy rather than an icon so
// it renders inside the pill instead of as a separate leading icon;
// the Toast component's iconName parameter is reserved for future
// non-streak toasts that benefit from a real Ionicon.
function toastCopyFor(type: StreakType, current: number): string {
  if (current === 1) {
    switch (type) {
      case 'scan':
        return '🔥 Scan streak started';
      case 'quiz':
        return '🔥 Quiz streak started';
      case 'engagement':
        return '🔥 Streak started — welcome back';
    }
  }
  if (current === 3) return `🔥 3-day ${labelFor(type)} streak`;
  if (current === 7) return '🔥 One week strong';
  if (current === 14) return '🔥 Two weeks — impressive';
  if (current === 30) return '🔥 30 days — serious dedication';
  if (current === 60) return '🔥 60 days — legendary';
  if (current === 100) return '💯 Triple digits!';
  return `🔥 ${current}-day ${labelFor(type)} streak`;
}

function labelFor(type: StreakType): string {
  switch (type) {
    case 'scan':
      return 'scan';
    case 'quiz':
      return 'quiz';
    case 'engagement':
      return 'engagement';
  }
}

/**
 * Fire-and-forget. Activity emit sites call this and move on — streaks
 * must never block the calling flow. If the RPC fails, we log to dev
 * console via streaksService and return silently; the UI + cache stay
 * as-is and the next tick attempts reconciliation.
 *
 * If the type is 'scan' or 'quiz', we additionally fire a follow-up
 * engagement tick so those activities count toward the catch-all
 * engagement streak without the caller having to know. Engagement's
 * toast is priority-suppressed by the scan/quiz toast that just ran.
 */
export async function recordActivity(type: StreakType): Promise<void> {
  // Rate-limit at entry (not resolution) so in-flight calls rate-limit
  // concurrent callers correctly.
  const now = Date.now();
  if (now - lastCalledAt[type] < DEBOUNCE_WINDOW_MS) return;
  lastCalledAt[type] = now;

  const result = await tickStreak(type);
  if (!result) return;
  applyResult(type, result);

  // Implicit engagement tick on scan/quiz — keeps the engagement streak
  // honest even if the user never lands on the home tab. Runs after the
  // primary tick finishes so the primary can own the toast slot. Also
  // rate-limited; a scan immediately after another scan (< 30s) skips
  // the duplicate engagement tick.
  if (type !== 'engagement') {
    const engNow = Date.now();
    if (engNow - lastCalledAt.engagement >= DEBOUNCE_WINDOW_MS) {
      lastCalledAt.engagement = engNow;
      const engResult = await tickStreak('engagement');
      if (engResult) applyResult('engagement', engResult);
    }
  }
}

function applyResult(type: StreakType, result: StreakTickResult) {
  const prevCache = useStreakStore.getState().streaks[type];
  const wasResetFromPrior =
    result.did_increment &&
    result.current_streak === 1 &&
    !!prevCache &&
    (prevCache.current_streak > 1 ||
      (prevCache.current_streak === 1 &&
        prevCache.last_activity_date !== result.last_activity_date));

  // Cache update first — even if we suppress the toast, the UI's stats
  // should reflect the new server truth.
  useStreakStore.getState().apply({
    streak_type: result.streak_type,
    current_streak: result.current_streak,
    best_streak: result.best_streak,
    last_activity_date: result.last_activity_date,
  });

  // Telemetry on every tick (including same-day no-ops — those still
  // tell us the user was active, even if we didn't write).
  track(EVENTS.STREAK_TICKED, {
    type,
    current: result.current_streak,
    best: result.best_streak,
    did_increment: result.did_increment,
    was_reset: wasResetFromPrior,
  });

  // Toast decision tree.
  if (!result.did_increment) return; // same-day no-op or clock-backward reject
  if (wasResetFromPrior) return; // silent reset
  if (shouldSuppress(type)) return; // lower priority clashed with a recent higher-priority toast

  const message = toastCopyFor(type, result.current_streak);
  Toast.show(message, { durationMs: result.current_streak >= 7 ? 3200 : 2400 });
  markToasted(type);
  track(EVENTS.STREAK_TOASTED, { type, current: result.current_streak });
}
