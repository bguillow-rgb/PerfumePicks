/**
 * Durable record that a founder message actually reached someone.
 *
 * PostHog's `announcement_shown` is the behavioural signal; it is also the only
 * one we had, which made reach unfalsifiable — a dropped event (app killed
 * before flush, offline, analytics opt-out) is indistinguishable from a message
 * nobody saw. These writes are the auditable counterpart.
 *
 * Signed-in users only: the row is keyed on auth.uid() and RLS requires it, so a
 * guest viewing an 'all' message is counted by PostHog but not here. That makes
 * this a FLOOR on reach, which is the right direction for a number used to
 * judge whether a message landed.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveCurrentUser } from '@/src/stores/useAuthStore';

/**
 * Mark this announcement as shown to the current user. Idempotent: the PK is
 * (announcement_id, user_id) and the client only marks "seen" locally on
 * dismiss, so a force-quit re-shows the modal — 23505 here is the table doing
 * exactly its job, not an error.
 */
export async function recordAnnouncementShown(announcementId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const user = await resolveCurrentUser();
    if (!user?.id) return; // guest — PostHog still counts it
    const { error } = await supabase
      .from('announcement_impressions')
      .insert({ announcement_id: announcementId, user_id: user.id });
    if (error && error.code !== '23505') {
      console.warn('[announcements] impression write failed:', error.message);
    }
  } catch {
    // Never let measurement break the message.
  }
}

/**
 * Stamp the engagement half of the funnel onto the existing impression row, so
 * shown/dismissed/CTA are all server-side rather than split across two systems.
 */
export async function recordAnnouncementOutcome(
  announcementId: string,
  outcome: 'dismissed' | 'cta_tapped',
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const user = await resolveCurrentUser();
    if (!user?.id) return;
    const column = outcome === 'dismissed' ? 'dismissed_at' : 'cta_tapped_at';
    const { error } = await supabase
      .from('announcement_impressions')
      .update({ [column]: new Date().toISOString() })
      .eq('announcement_id', announcementId)
      .eq('user_id', user.id);
    if (error) console.warn('[announcements] outcome write failed:', error.message);
  } catch {
    // Non-blocking by design.
  }
}
