// Thin client for the `public.tick_streak` RPC + a table-read helper.
//
// The RPC is SECURITY DEFINER (migration 015) so direct writes to
// `user_streaks` are blocked — every increment has to route through here.
//
// Responsibilities of this file:
//   1. Normalize the device timezone into an IANA string.
//   2. Call the RPC and return a typed row.
//   3. Pull all streaks for a user (cache hydration on boot + sign-in).
//
// This file intentionally has NO side effects beyond the DB call. The
// companion hook `useStreakToast` owns toast + cache-update logic so that
// telemetry + UI concerns stay separate from the RPC surface.

import { supabase } from '@/lib/supabase';
import { captureException } from '@/src/lib/observability';
import { track } from '@/src/lib/observability/analytics';

export type StreakType = 'engagement' | 'scan' | 'quiz';

export interface StreakState {
  streak_type: StreakType;
  current_streak: number;
  best_streak: number;
  last_activity_date: string | null; // 'YYYY-MM-DD' in user's local TZ
}

export interface StreakTickResult extends StreakState {
  did_increment: boolean;
}

// Runtime validator for the tick_streak RPC response row. Protects
// against silent schema drift (rename, type change, a new enum value)
// without pulling in a validation library. If the server schema evolves
// and this starts rejecting valid rows, the Sentry report tells us
// *before* users see undefined-dereference crashes.
// Exported for unit-test visibility; no runtime consumer outside this
// file.
export function isValidTickRow(v: unknown): v is {
  streak_type: StreakType;
  current_streak: number;
  best_streak: number;
  did_increment: boolean;
  last_activity_date: string | null;
} {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    (r.streak_type === 'engagement' ||
      r.streak_type === 'scan' ||
      r.streak_type === 'quiz') &&
    typeof r.current_streak === 'number' &&
    typeof r.best_streak === 'number' &&
    typeof r.did_increment === 'boolean' &&
    (r.last_activity_date === null || typeof r.last_activity_date === 'string')
  );
}

// Resolve the user's IANA timezone string. Falls back to UTC if the JS
// runtime doesn't expose Intl.DateTimeFormat (rare but defensible).
function deviceTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Tick the streak of the given type for the authenticated user. Returns
 * the new server state plus whether this call actually incremented.
 * Returns null if the RPC failed (network, auth expiry, etc.) — callers
 * should treat a null return as "keep cache as-is, try again later."
 */
export async function tickStreak(type: StreakType): Promise<StreakTickResult | null> {
  // Build 14 instrumentation — user_streaks was empty across every
  // user in prod at Build 13 time, meaning every tickStreak call was
  // failing silently. Telemetry + Sentry wiring here gives us a paper
  // trail for every attempt, error, and unexpected shape so the next
  // build can root-cause from logs.
  const tz = deviceTz();
  track('STREAK_TICK_ATTEMPTED' as never, { type, tz });

  // Sanity-check session BEFORE the RPC so we can distinguish
  // "no auth" errors from "RPC-internal" errors in Sentry reports.
  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session?.user?.id;

  const { data, error } = await supabase.rpc('tick_streak', {
    p_type: type,
    p_tz: tz,
  });

  if (error) {
    // Sentry-report every error. Streaks never break the calling flow
    // (the caller ignores our null return), so reporting here is safe.
    captureException(error, {
      context: 'streaks.tick.rpcError',
      type,
      hasSession,
      errorCode: (error as any).code,
      errorHint: (error as any).hint,
      errorMessage: error.message,
    });
    track('STREAK_TICK_FAILED' as never, {
      type,
      phase: 'rpc_error',
      hasSession,
      error_message: error.message,
    });
    if (__DEV__) console.warn('[streaks] tick failed', type, error.message);
    return null;
  }

  // Supabase RPCs that RETURN TABLE come back as an array of rows.
  if (!Array.isArray(data) || data.length === 0) {
    captureException(new Error('tick_streak: empty response'), {
      context: 'streaks.tick.emptyResponse',
      type,
      hasSession,
      dataType: typeof data,
      dataJson: JSON.stringify(data),
    });
    track('STREAK_TICK_FAILED' as never, {
      type,
      phase: 'empty_response',
      hasSession,
    });
    return null;
  }

  const row = data[0];
  if (!isValidTickRow(row)) {
    captureException(new Error('tick_streak: unexpected row shape'), {
      context: 'streaks.tick.schema',
      type,
      hasSession,
      row,
    });
    track('STREAK_TICK_FAILED' as never, {
      type,
      phase: 'schema_rejection',
      hasSession,
    });
    if (__DEV__) console.warn('[streaks] unexpected RPC shape', row);
    return null;
  }

  track('STREAK_TICK_SUCCEEDED' as never, {
    type,
    current_streak: row.current_streak,
    did_increment: row.did_increment,
  });

  return {
    streak_type: row.streak_type,
    current_streak: row.current_streak,
    best_streak: row.best_streak,
    last_activity_date: row.last_activity_date,
    did_increment: row.did_increment,
  };
}

/**
 * Pull all streak rows for the authenticated user in one query. Called
 * from `_layout.tsx` on sign-in and on AppState 'active' transitions so
 * the profile surface hydrates without waiting for the next tick.
 *
 * Requires the user to be signed in; returns [] for guests.
 */
export async function pullAllStreaks(userId: string): Promise<StreakState[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_streaks')
    .select('streak_type, current_streak, best_streak, last_activity_date')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data as StreakState[];
}
