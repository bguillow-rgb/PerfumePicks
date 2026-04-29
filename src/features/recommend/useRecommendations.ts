/**
 * Hook that wires the recommendation engine into screens.
 *
 * - Reads the user's swipe + wear-log signals from the local stores.
 * - Derives a taste profile (memoized).
 * - Scores the catalog against current context (season, weather, occasion).
 * - Returns top picks for each rail.
 *
 * Pure derivation — no network. Ready to swap to a Supabase RPC later.
 *
 * ── Supabase RPC migration path ──────────────────────────────────────────
 * When the backend is ready, replace the `rank(candidates, …)` call with:
 *
 *   const { data } = await supabase.rpc('rank_fragrances', {
 *     p_user_id:   currentUser.id,
 *     p_season:    ctx.season,
 *     p_occasion:  ctx.occasion,
 *     p_limit:     24,
 *   });
 *
 * The RPC mirrors the weights in score.ts — maintained in
 *   supabase/functions/rank_fragrances/index.ts
 * and seeded by the client-side profile via a periodic upsert to
 *   public.user_taste_profiles (user_id, derived_at, profile_json).
 *
 * Until then, the client-side `rank()` in score.ts is the source of truth.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { MOCK_CATALOG, getFragrance, type MockFragrance } from '@/src/mock/fragrances';
import { deriveTasteProfile, type TasteSignal } from './tasteProfile';
import { rank, type RecContext, type ScoredRec } from './score';

// Cap candidates to avoid O(n²) scoring blowup when the catalog grows.
// 200 is safe at ~50 fragrances today; revisit if catalog exceeds 500.
const MAX_CANDIDATES = 200;

/** Weight each signal type. Wears outweigh wishlists outweigh single likes. */
const SIGNAL_WEIGHTS = {
  wear_high_rating: 3,
  wear_default: 1.5,
  have: 2,
  want: 1,
  tested: 0.5,
  sold_on: 2.5,
  swipe_love: 1.5,   // right swipe — strong positive signal
  swipe_like: 0.8,   // down swipe — soft positive signal
  swipe_dislike: -1.5,
} as const;

function currentSeason(): RecContext['season'] {
  const m = new Date().getMonth(); // 0..11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

// P5-23: infer a plausible occasion from the current hour so the context
// feels alive even without a quiz answer. Quiz answer overrides this.
function inferOccasionFromTime(hour: number): RecContext['occasion'] {
  if (hour >= 9 && hour < 17) return 'office';
  if (hour >= 20 || hour < 3) return 'evening';
  return 'casual';
}

function defaultContext(): RecContext {
  const hour = new Date().getHours();
  return {
    season: currentSeason(),
    timeOfDay: hour,
    occasion: inferOccasionFromTime(hour),
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
    if (sw.action === 'love')    out.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_love });
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
  const answers = useQuizStore((s) => s.answers);

  // Compute effective context once, layering in quiz answers (P5-22/P5-23)
  // and most-common recent-wear weather (P5-24) on top of the caller's ctx
  // or the time-of-day default.
  const effectiveCtx = useMemo<RecContext>(() => {
    const base = ctx ?? defaultContext();
    const result: RecContext = { ...base };

    // P5-22 + P5-23: quiz answers override the defaults when the caller
    // hasn't already pinned season/occasion explicitly.
    if (!ctx?.season && answers.season) {
      result.season = answers.season as RecContext['season'];
    }
    if (!ctx?.occasion && answers.occasion) {
      result.occasion = answers.occasion as RecContext['occasion'];
    }
    // Quiz discovery answer drives adventure mode.
    if (!ctx?.adventureMode && answers.discovery) {
      const map: Record<string, RecContext['adventureMode']> = {
        classic: 'classic',
        curated: 'middle',
        wild: 'surprise',
      };
      result.adventureMode = map[answers.discovery] ?? 'middle';
    }

    // P5-24: aggregate the most common weather from the last 20 wear logs
    // so the engine knows what conditions the user actually wears fragrances in.
    if (!ctx?.weather) {
      const freq: Record<string, number> = {};
      for (const l of logs.slice(0, 20)) {
        if (l.weather) freq[l.weather] = (freq[l.weather] ?? 0) + 1;
      }
      const entries = Object.entries(freq);
      if (entries.length > 0) {
        result.weather = entries.sort((a, b) => b[1] - a[1])[0][0] as RecContext['weather'];
      }
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.season, ctx?.weather, ctx?.occasion, ctx?.timeOfDay, ctx?.adventureMode,
      answers.season, answers.occasion, answers.discovery, logs]);

  const profile = useMemo(() => {
    const wears = logs.map((l) => ({ fragrance_id: l.fragrance_id, rating: l.rating ?? null }));
    const itemsForProfile = items.map((i) => ({ fragrance_id: i.fragrance_id, status: i.status }));
    const swipes = Object.values(swipesMap).map((x) => ({ fragrance_id: x.fragrance_id, action: x.action }));
    const base = deriveTasteProfile(buildSignals(wears, itemsForProfile, swipes));

    // P5-22: blend quiz answers in as soft priors — they only nudge when
    // behavioral signals are sparse, so returning users aren't over-pinned.
    const result = { ...base };
    if (answers.family) {
      // Weight 1.5 (≈ "have") so quiz intent influences but doesn't dominate.
      result.preferred_families = {
        ...result.preferred_families,
        [answers.family]: (result.preferred_families[answers.family] ?? 0) + 1.5,
      };
      result.signal_count = result.signal_count + 1;
    }
    if (answers.price && result.avg_price_tier === null) {
      result.avg_price_tier = Number(answers.price);
    }
    if (answers.longevity && result.longevity_preference === null) {
      result.longevity_preference = Number(answers.longevity);
    }
    return result;
  }, [logs, items, swipesMap, answers.family, answers.price, answers.longevity]);

  // Don't recommend fragrances the user already owns ("have") — they're in
  // your wardrobe, no need to surface them again. Wishlist items can still
  // surface (you might want to buy after seeing it praised).
  const owned = useMemo(
    () => new Set(items.filter((i) => i.status === 'have').map((i) => i.fragrance_id)),
    [items],
  );

  const candidates = useMemo(
    () => MOCK_CATALOG.filter((f) => !owned.has(f.id)).slice(0, MAX_CANDIDATES),
    [owned],
  );

  const ranked: ScoredRec[] = useMemo(
    () => rank(candidates, profile, effectiveCtx, 24),
    [candidates, profile, effectiveCtx],
  );

  // P5-25: recently down-swiped ("like") fragrances get a +0.15 SOTD hero
  // boost so they surface as scent-of-the-day suggestions. Only applies to
  // the hero slot — topPicks (rec/results) keeps the unmodified ranking.
  const recentLikeSet = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    const cutoff = threshold.toISOString();
    return new Set(
      Object.values(swipesMap)
        .filter((s) => s.action === 'like' && s.created_at > cutoff)
        .map((s) => s.fragrance_id),
    );
  }, [swipesMap]);

  return useMemo(() => {
    // Re-rank for the SOTD hero slot only, boosting recently liked picks.
    const sotdRanked = recentLikeSet.size > 0
      ? [...ranked].sort((a, b) => {
          const aBoost = recentLikeSet.has(a.fragrance.id) ? 0.15 : 0;
          const bBoost = recentLikeSet.has(b.fragrance.id) ? 0.15 : 0;
          return (b.score + bBoost) - (a.score + aBoost);
        })
      : ranked;

    const heroPick = sotdRanked[0]?.fragrance;
    const heroReason = sotdRanked[0]?.reason ?? '';
    const todaysEdit = sotdRanked.slice(1, 4).map((r) => r.fragrance);
    const trending = ranked.slice(4, 12).map((r) => r.fragrance);
    return {
      heroPick,
      heroReason,
      todaysEdit,
      trending,
      topPicks: ranked.slice(0, 12),   // full scored list for the rec results screen
      profile,
      hasSignals: profile.signal_count > 0,
    };
  }, [ranked, recentLikeSet, profile]);
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
    [limit],
  );
}
