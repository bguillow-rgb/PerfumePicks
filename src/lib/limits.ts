/**
 * Free-tier limits for Perfume Picks.
 *
 * These are UX-only guards — they prevent free users from exceeding caps in the
 * client and route them to the paywall. They are NOT security enforcement.
 * Real enforcement lives in Postgres RLS via `is_pro_user(uid)`.
 */

/** Max wardrobe items for free-tier users. Pro = unlimited. */
export const FREE_WARDROBE_CAP = 20;

/** Max swipes per day for free-tier users. Already enforced in useSwipeStore. */
export const FREE_DAILY_SWIPE_CAP = 10;

/** Pro-gated screens — used to drive paywall routing in the nav layer. */
export const PRO_GATED_ROUTES = [
  '/taste-profile',
  '/wrapped',
] as const;
