/**
 * Badge award logic — checks milestones after wear logs.
 * Calls service-role-only insert via RPC to avoid client RLS issues.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Alert } from '@/src/components/ui/StyledAlert';

const STREAK_THRESHOLDS = [
  { key: 'streak_7', threshold: 7, label: '7-Day Streak' },
  { key: 'streak_30', threshold: 30, label: '30-Day Streak' },
  { key: 'streak_100', threshold: 100, label: '100-Day Streak' },
  { key: 'streak_365', threshold: 365, label: '365-Day Streak' },
];

/**
 * Check if the user just earned a new badge. Call this after logging a wear.
 * Returns the badge key if one was awarded, null otherwise.
 */
export async function checkAndAwardBadges(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get current streak + existing badges
    const [profileRes, badgesRes, wearCountRes, reviewCountRes] = await Promise.all([
      supabase.from('profiles').select('current_streak').eq('id', user.id).maybeSingle(),
      supabase.from('user_badges').select('badge_key').eq('user_id', user.id),
      supabase.from('wear_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('fragrance_reviews').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    const streak = profileRes.data?.current_streak ?? 0;
    const existingBadges = new Set((badgesRes.data ?? []).map((b) => b.badge_key));
    const wearCount = wearCountRes.count ?? 0;
    const reviewCount = reviewCountRes.count ?? 0;

    // Check what badges to award
    const toAward: string[] = [];

    // First wear
    if (wearCount >= 1 && !existingBadges.has('first_wear')) {
      toAward.push('first_wear');
    }

    // First review
    if (reviewCount >= 1 && !existingBadges.has('first_review')) {
      toAward.push('first_review');
    }

    // Collector (10+ wardrobe items) — check via count
    // (We don't have wardrobe count here easily, skip for now)

    // Streak badges
    for (const { key, threshold } of STREAK_THRESHOLDS) {
      if (streak >= threshold && !existingBadges.has(key)) {
        toAward.push(key);
      }
    }

    if (toAward.length === 0) return null;

    // Award badges — use service-role via RPC since user_badges has no client insert policy
    for (const badgeKey of toAward) {
      await supabase.rpc('award_badge', { p_user_id: user.id, p_badge_key: badgeKey });
    }

    // Toast the most significant one
    const awarded = toAward[toAward.length - 1];
    const label = STREAK_THRESHOLDS.find((s) => s.key === awarded)?.label
      ?? (awarded === 'first_wear' ? 'First Wear!' : awarded === 'first_review' ? 'First Review!' : awarded);

    Alert.alert('Badge Earned!', `You just unlocked: ${label}`);
    return awarded;
  } catch (e) {
    console.warn('[badges] check failed:', e);
    return null;
  }
}
