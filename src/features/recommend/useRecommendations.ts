/**
 * Hook that wires the recommendation engine into screens.
 *
 * - Reads the user's swipe + wear-log signals from the local stores.
 * - Derives a taste profile (memoized).
 * - Scores the catalog against current context (season, weather, occasion).
 * - Returns top picks for each rail.
 *
 * Pure derivation — no network. Ready to swap to a Supabase RPC later.
 */

import { useMemo } from 'react';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { MOCK_CATALOG, getFragrance, type MockFragrance } from '@/src/mock/fragrances';
import { deriveTasteProfile, type TasteSignal } from './tasteProfile';
import { rank, type RecContext, type ScoredRec } from './score';

/** Weight each signal type. Wears outweigh wishlists outweigh single likes. */
const SIGNAL_WEIGHTS = {
  wear_high_rating: 3,
  wear_default: 1.5,
  have: 2,
  want: 1,
  tested: 0.5,
  sold_on: 2.5,
  swipe_like: 1,
  swipe_dislike: -1.5,
} as const;

function currentSeason(): RecContext['season'] {
  const m = new Date().getMonth(); // 0..11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

function defaultContext(): RecContext {
  return {
    season: currentSeason(),
    timeOfDay: new Date().getHours(),
    adventureMode: 'middle',
  };
}

/**
 * Build the user's taste signals from local store contents.
 * Pure data transformation — useMemo'd in the hook below.
 */
function buildSignals(
  wears: { fragrance_id: string; rating: number | null }[],
  wardrobeItems: { fragrance_id: string; status: string }[],
  swipes: { fragrance_id: string; action: string }[],
): TasteSignal[] {
  const out: TasteSignal[] = [];
  for (const w of wears) {
    const f = getFragrance(w.fragrance_id);
    if (!f) continue;
    const weight = w.rating != null && w.rating >= 4
      ? SIGNAL_WEIGHTS.wear_high_rating
      : SIGNAL_WEIGHTS.wear_default;
    out.push({ fragrance: f, weight });
  }
  for (const i of wardrobeItems) {
    const f = getFragrance(i.fragrance_id);
    if (!f) continue;
    const w = (SIGNAL_WEIGHTS as any)[i.status] ?? 1;
    out.push({ fragrance: f, weight: w });
  }
  for (const sw of swipes) {
    const f = getFragrance(sw.fragrance_id);
    if (!f) continue;
    if (sw.action === 'like')    out.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_like });
    if (sw.action === 'dislike') out.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_dislike });
  }
  return out;
}

export function useRecommendations(ctx?: RecContext) {
  // Subscribe to the RAW store fields (stable references — Zustand only
  // re-emits when the underlying array actually changes). Mapping/filtering
  // INSIDE the selector returns a new array every render → infinite re-
  // render loop ("Maximum update depth exceeded"). Done here in useMemo
  // instead.
  const logs = useWearLogStore((s) => s.logs);
  const items = useWardrobeStore((s) => s.items);
  const swipesMap = useSwipeStore((s) => s.swipes);

  // Likewise: don't compute defaultContext() in the param default — that
  // produces a fresh object reference every render and busts the useMemo
  // dependency comparison below. Compute once per render here, then re-
  // memoize on each value individually.
  const effectiveCtx = useMemo<RecContext>(
    () => ctx ?? defaultContext(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.season, ctx?.weather, ctx?.occasion, ctx?.timeOfDay, ctx?.adventureMode],
  );

  const profile = useMemo(() => {
    const wears = logs.map((l) => ({ fragrance_id: l.fragrance_id, rating: l.rating ?? null }));
    const itemsForProfile = items.map((i) => ({ fragrance_id: i.fragrance_id, status: i.status }));
    const swipes = Object.values(swipesMap).map((x) => ({ fragrance_id: x.fragrance_id, action: x.action }));
    return deriveTasteProfile(buildSignals(wears, itemsForProfile, swipes));
  }, [logs, items, swipesMap]);

  // Don't recommend fragrances the user already owns ("have") — they're in
  // your wardrobe, no need to surface them again. Wishlist items can still
  // surface (you might want to buy after seeing it praised).
  const owned = useMemo(
    () => new Set(items.filter((i) => i.status === 'have').map((i) => i.fragrance_id)),
    [items],
  );

  const candidates = useMemo(
    () => MOCK_CATALOG.filter((f) => !owned.has(f.id)),
    [owned],
  );

  const ranked: ScoredRec[] = useMemo(
    () => rank(candidates, profile, effectiveCtx, 24),
    [candidates, profile, effectiveCtx],
  );

  return useMemo(() => {
    const heroPick = ranked[0]?.fragrance;
    const heroReason = ranked[0]?.reason ?? '';
    const todaysEdit = ranked.slice(1, 4).map((r) => r.fragrance);
    const trending = ranked.slice(4, 12).map((r) => r.fragrance);
    return {
      heroPick,
      heroReason,
      todaysEdit,
      trending,
      profile,
      hasSignals: profile.signal_count > 0,
    };
  }, [ranked, profile]);
}

/** Get the user's recent additions (last 30 days from the catalog) — used
 *  for the "New Arrivals" rail. With a real catalog this reads off
 *  `fragrances.created_at`. With the mock catalog we just use newest-by-
 *  release-year as a proxy so the rail shows something relevant. */
export function useNewArrivals(limit = 6): MockFragrance[] {
  return useMemo(
    () =>
      [...MOCK_CATALOG]
        .sort((a, b) => b.release_year - a.release_year)
        .slice(0, limit),
    [],
  );
}
