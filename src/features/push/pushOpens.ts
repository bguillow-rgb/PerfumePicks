/**
 * Record that the user OPENED a push.
 *
 * WHY DURABLE AND NOT JUST ANALYTICS: the retention read derives "active day"
 * from database writes, and a user who taps the daily SOTD push, reads their
 * scent and closes the app writes nothing at all — so the one behaviour the
 * push exists to cause was invisible, and every retention number was a floor.
 * A PostHog event alone would not fix that: PostHog was wiped once (2026-07-03)
 * and scripts/retention-report.mjs reads Postgres. So this writes a row too.
 *
 * Day granularity, in the DEVICE's local day: the question is "did they come
 * back today", not "how many times did they tap", and the push is scheduled
 * against each user's local morning — a UTC date would push an evening open in
 * New York into the next day and mis-bucket exactly the users this targets.
 *
 * Same contract as requestCatalogAddition: RLS grants authenticated users
 * INSERT-only, so we PLAIN INSERT (never upsert, whose ON CONFLICT read path
 * RLS rejects for the anonymous guests who are most of the base). A repeat open
 * the same day trips the unique constraint (23505), which IS the intended
 * dedupe and counts as success. Best-effort — never block the tap.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

export type PushSource = 'daily_sotd' | 'local_sotd' | 'local_wardrobe' | 'unknown';

/** Local calendar day (YYYY-MM-DD). NOT toISOString(), which is UTC. */
function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordPushOpen(source: PushSource): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const user = await resolveCurrentUser();
    if (!user) return false;
    const { error } = await supabase
      .from('push_opens')
      .insert({ user_id: user.id, opened_on: localDay(), source });
    if (error && error.code !== '23505') {
      console.warn('[push] recordPushOpen failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[push] recordPushOpen threw:', (e as Error).message);
    return false;
  }
}

/** Attribute a notification payload to a source. */
export function sourceFromData(data: Record<string, unknown> | undefined): PushSource {
  if (String(data?.source ?? '') === 'daily_sotd') return 'daily_sotd';
  // Local reminders predate the source marker, so fall back to their screen
  // hint — a local nudge must never be counted as evidence the SERVER push
  // worked, which is the whole question this instrumentation exists to answer.
  const screen = String(data?.screen ?? '');
  if (screen === 'wardrobe') return 'local_wardrobe';
  if (screen === 'today') return 'local_sotd';
  return 'unknown';
}
