/**
 * Free-tier limits for Perfume Picks.
 *
 * These are UX-only guards — they prevent free users from exceeding caps in the
 * client and route them to the paywall. They are NOT security enforcement.
 * Real enforcement lives in Postgres RLS via `is_pro_user(uid)`.
 */

/**
 * Max wardrobe items for free-tier users. Pro = unlimited. Adding the 6th item
 * returns WARDROBE_CAP_HIT from useWardrobeStore.add(), and the caller
 * (AddToWardrobeSheet / scan.tsx) routes to the paywall.
 *
 * 20 -> 5 on 2026-07-16. At 20 the cap was pure decoration: the largest real
 * collection in the entire user base was 5 items, so NOBODY could ever reach it
 * and the paywall's "Unlimited Wardrobe" bullet sold a benefit no user needed.
 * 5 sits exactly at the top of observed behavior, so the users who are actually
 * collecting now meet the gate on their next add.
 */
export const FREE_WARDROBE_CAP = 5;

// NOTE: the daily swipe cap is FREE_DAILY_SWIPE_LIMIT in src/stores/useSwipeStore.ts
// — that is the value the Train screen and tab badge actually enforce. A second
// FREE_DAILY_SWIPE_CAP constant used to live here, unimported by anything, and
// the two silently disagreed. Removed 2026-07-16; keep one source of truth.

/** Pro-gated screens — used to drive paywall routing in the nav layer. */
export const PRO_GATED_ROUTES = [
  '/taste-profile',
  '/wrapped',
] as const;
