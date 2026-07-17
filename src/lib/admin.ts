/**
 * Founder gate. These two auth uids are the app owner's accounts (Google +
 * Apple). Used to reveal founder-only surfaces like the in-app announcement
 * composer. This is a UX gate only — the real enforcement is the founder-only
 * RLS write policy on the announcements table (202607172000_announcements.sql),
 * so a non-founder who reaches an admin screen still can't write anything.
 *
 * These are the PERFUME PICKS uids. They differ from Pour Picks (separate
 * Supabase project) — keep them in sync with the RLS policy, not with Pour Picks.
 */
export const FOUNDER_USER_IDS = [
  '5fb2b8cc-8ba1-4125-89be-ef5e1befd925', // bguillow@gmail.com (Google)
  'f4810587-d519-49d3-8121-d9fdd8239159', // bobguillow@icloud.com (Apple)
] as const;

export function isFounder(userId: string | null | undefined): boolean {
  return !!userId && (FOUNDER_USER_IDS as readonly string[]).includes(userId);
}
