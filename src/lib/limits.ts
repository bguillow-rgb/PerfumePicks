/**
 * Free-tier limits — single source of truth.
 *
 * These are CLIENT-SIDE UX gates only. They prevent a free user from
 * unintentionally hitting a paywall mid-action by showing the paywall
 * proactively. Real enforcement against bypass attempts (modded builds,
 * direct API calls) lives in Postgres via the `is_pro_user(uid)` RLS
 * predicate — see migration `20260515_pro_gate_server_side.sql`.
 *
 * Pattern: code that needs to gate a feature reads from FREE_LIMITS, not
 * from a per-screen hardcoded constant. When pricing tiers change we
 * change them here, not in 12 different files.
 */

export const FREE_LIMITS = {
  /** Max wardrobe entries on free tier. Pro = unlimited. */
  wardrobeItems: 20,
  /** Max Train swipes per local day on free tier. Pro = unlimited. */
  dailySwipes: 10,
  /** Free quiz has the basic question set. Pro unlocks the full 9. */
  quizQuestions: 3,
} as const;

/**
 * Which features require Pro. These are reference labels for UI gates
 * (paywall sheet copy, "Pro" badges on Profile rows). Server-side
 * enforcement attaches `is_pro_user(auth.uid())` to the relevant RPC
 * or RLS USING clause — never trust this enum alone.
 */
export const PRO_FEATURES = {
  TASTE_PROFILE_SCREEN:   'taste_profile_screen',
  PERFUME_WRAPPED:        'perfume_wrapped',
  WEATHER_MORNING_PUSH:   'weather_morning_push',
  AI_WHY_THIS:            'ai_why_this',
  COLLAB_FILTERING:       'collab_filtering',
  ADVANCED_ANALYTICS:     'advanced_analytics',
  UNLIMITED_WARDROBE:     'unlimited_wardrobe',
  UNLIMITED_SWIPES:       'unlimited_swipes',
  FULL_QUIZ:              'full_quiz',
  BOTTLE_SCAN:            'bottle_scan',
} as const;

export type ProFeatureKey = typeof PRO_FEATURES[keyof typeof PRO_FEATURES];
