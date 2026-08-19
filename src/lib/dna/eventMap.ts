/**
 * Timberline DNA Layer — Perfume-Picks-local → canonical event-name map (M1).
 *
 * The Tier-1 list defines app-agnostic canonical names shared across the
 * portfolio. Perfume Picks' own analytics seam (src/lib/observability/events.ts)
 * uses Perfume-local names. The wiring itself calls dnaTrackEvent() with the
 * canonical name directly at each call site (so payloads match the contract
 * exactly), but this explicit map exists so any future central `track()` tap
 * can resolve a Perfume-local name to its canonical equivalent without guessing.
 */

import { EVENTS } from '@/src/lib/observability/events';

import type { CanonicalEventName } from './types';

/**
 * Map from Perfume Picks `EVENTS` *values* to canonical Tier-1 names. Only
 * events with a real Tier-1 mapping appear; Perfume-local analytics that are
 * NOT Tier-1 (dupes, paywall, push, invite, announcements, …) are intentionally
 * absent — they resolve to `undefined` and are dropped by the DNA client.
 * Notes on the non-obvious rows:
 *
 *  - Perfume has NO PostHog events for the grid pick/unpick taps — the picker
 *    grid tap goes straight to the store (app/dna/index.tsx handleTap), so
 *    onboarding_pick_selected is emitted at the tap site directly and only
 *    SEARCH_RESULT_PICKED (the search-sourced pick) has a local name here.
 *  - QUIZ_COMPLETED → onboarding_completed covers the question-fallback path;
 *    the picker path commits without a dedicated local event (wired at
 *    startCompute directly).
 *  - WARDROBE_ITEM_ADDED/UPDATED/REMOVED → item_collection_updated (the
 *    payload's `action` field disambiguates add/status_change/remove). These
 *    three constants currently have NO live track() call site — the DNA wiring
 *    lives in useWardrobeStore.ts, the single choke point every UI path hits.
 *  - TRAIN_SWIPE_LOVE/LIKE → recommendation_accepted. TRAIN_SWIPE_PASS is
 *    deliberately UNMAPPED: a left swipe is a neutral 'skip' by design (see
 *    app/(tabs)/train.tsx), not a dismissal — mapping it would poison the
 *    profile with false negatives. No dislike affordance exists today, so
 *    explicit_dislike / recommendation_dismissed have no local mapping yet.
 *  - WEAR_LOGGED, FRAGRANCE_DETAIL_VIEWED also have no live track() call sites
 *    today; the DNA wiring emits at the action sites (LogWearSheet save,
 *    fragrance/[id].tsx mount).
 *  - AFFILIATE_OUTBOUND_CLICKED → affiliate_link_clicked — Perfume HAS a live
 *    affiliate surface (Pour doesn't), so this Tier-1 row is live here.
 */
export const PERFUME_TO_CANONICAL: Record<string, CanonicalEventName> = {
  [EVENTS.SEARCH_RESULT_PICKED]: 'onboarding_pick_selected',
  [EVENTS.QUIZ_COMPLETED]: 'onboarding_completed',
  [EVENTS.DNA_REVEAL_VIEWED]: 'dna_revealed',
  [EVENTS.WARDROBE_ITEM_ADDED]: 'item_collection_updated',
  [EVENTS.WARDROBE_ITEM_UPDATED]: 'item_collection_updated',
  [EVENTS.WARDROBE_ITEM_REMOVED]: 'item_collection_updated',
  [EVENTS.WEAR_LOGGED]: 'wear_logged',
  [EVENTS.TRAIN_SWIPE_LOVE]: 'recommendation_accepted',
  [EVENTS.TRAIN_SWIPE_LIKE]: 'recommendation_accepted',
  [EVENTS.FRAGRANCE_DETAIL_VIEWED]: 'product_detail_viewed',
  [EVENTS.AFFILIATE_OUTBOUND_CLICKED]: 'affiliate_link_clicked',
};

/** Resolve a Perfume-local name to its canonical Tier-1 name, or undefined. */
export function toCanonical(perfumeName: string): CanonicalEventName | undefined {
  return PERFUME_TO_CANONICAL[perfumeName];
}
