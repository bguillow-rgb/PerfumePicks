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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { useQuizStore } from '@/src/stores/useQuizStore';
import { useScentPreferencesStore } from '@/src/stores/useScentPreferencesStore';
import { expandAvoidAccords } from '@/src/constants/accords';
import {
  useCatalogStore,
  getFragranceFromStore,
  type Fragrance,
} from '@/src/stores/useCatalogStore';
import { deriveTasteProfile, type TasteSignal, type DerivedTasteProfile } from './tasteProfile';
import { rank, type RecContext, type ScoredRec } from './score';
import { useTasteProfileStore } from '@/src/stores/useTasteProfileStore';
import { blendProfiles } from '@/src/features/dna/blend';
import { RECOMMENDATION_SIGNAL_WEIGHTS } from '@/src/features/dna/signals';
import { selectSmartSotd, sotdDaySeed } from './smartSotd';
import { useSotdHistoryStore } from '@/src/stores/useSotdHistoryStore';
import { useSmartSotdEnabled, useSotdWeatherEnabled } from './sotdFlag';
import { useDailyWeather } from '@/src/lib/weather';
import { getCurrentUser } from '@/src/stores/useAuthStore';
import { track, EVENTS } from '@/src/lib/observability';

// Cap candidates for scoring. Supabase max_rows must be set to ≥ this value
// in Project Settings → API. Raise to 10 000 in the dashboard to unlock full catalog.
const MAX_CANDIDATES = 3000;

/**
 * Weight each signal type. Wears outweigh wishlists outweigh single likes.
 * Single source of truth lives in features/dna/signals.ts so this path and the
 * useAppSync passive-profile path can never diverge again (was: love 1.5 here /
 * 2.5 there).
 */
const SIGNAL_WEIGHTS = RECOMMENDATION_SIGNAL_WEIGHTS;

function currentSeason(): RecContext['season'] {
  const m = new Date().getMonth(); // 0..11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

// P5-23: infer a plausible occasion from the current day + hour so the context
// feels alive even without a quiz answer. Quiz answer overrides this.
// Weekends never read as "office" — Sat/Sun daytime is casual, so the SOTD
// reason doesn't say "discreet enough for the office" on a Sunday.
function inferOccasionFromTime(hour: number, day: number): RecContext['occasion'] {
  const isWeekend = day === 0 || day === 6;
  if (hour >= 20 || hour < 3) return 'evening';
  if (isWeekend) return 'casual';
  if (hour >= 9 && hour < 17) return 'office';
  return 'casual';
}

function defaultContext(): RecContext {
  const now = new Date();
  const hour = now.getHours();
  return {
    season: currentSeason(),
    timeOfDay: hour,
    occasion: inferOccasionFromTime(hour, now.getDay()),
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
  // Resolve a fragrance by id. Defaults to the synchronous in-memory cache,
  // but callers can pass a resolver backed by an eager fetchMany so signals
  // aren't silently dropped when the catalog cache hasn't loaded that row yet
  // (the cause of "I swiped 40 times but my taste profile shows 1 signal").
  resolve: (id: string) => Fragrance | undefined = getFragranceFromStore,
): TasteSignal[] {
  const out: TasteSignal[] = [];
  for (const w of wears) {
    const f = resolve(w.fragrance_id);
    if (!f) continue;
    const weight = w.rating != null && w.rating >= 4
      ? SIGNAL_WEIGHTS.wear_high_rating
      : SIGNAL_WEIGHTS.wear_default;
    out.push({ fragrance: f, weight });
  }
  for (const i of wardrobeItems) {
    const f = resolve(i.fragrance_id);
    if (!f) continue;
    const w = (SIGNAL_WEIGHTS as any)[i.status] ?? 1;
    out.push({ fragrance: f, weight: w });
  }
  for (const sw of swipes) {
    const f = resolve(sw.fragrance_id);
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
  const prefAvoid = useScentPreferencesStore((s) => s.avoid);
  const prefBudget = useScentPreferencesStore((s) => s.budget);
  const prefOccasion = useScentPreferencesStore((s) => s.occasion);
  const prefSeason = useScentPreferencesStore((s) => s.season);
  const dna = useTasteProfileStore((s) => s.dna);

  // Compute effective context once, layering in stated Scent Preferences and
  // most-common recent-wear weather (P5-24) on top of the caller's ctx or the
  // time-of-day default.
  const effectiveCtx = useMemo<RecContext>(() => {
    const base = ctx ?? defaultContext();
    const result: RecContext = { ...base };

    // Scent Preferences pin season/occasion when the caller hasn't already
    // explicitly chosen them (the stated constraint beats the time-of-day guess).
    if (!ctx?.season && prefSeason) {
      result.season = prefSeason;
    }
    if (!ctx?.occasion && prefOccasion) {
      result.occasion = prefOccasion;
    }
    // Avoid list + spend ceiling become hard-ish scoring constraints.
    if (prefAvoid.length > 0) {
      result.avoidAccords = expandAvoidAccords(prefAvoid);
    }
    if (prefBudget != null) {
      result.maxPriceTier = prefBudget;
    }
    // Quiz discovery answer drives adventure mode (legacy signal; harmless when
    // unset now that the quiz is retired).
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
      prefSeason, prefOccasion, prefAvoid, prefBudget, answers.discovery, logs]);

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
    // M1 blend: fold the explicit Fragrance DNA over the passive profile,
    // weighted by DNA confidence. DNA absent → `result` verbatim (no regression).
    return blendProfiles(dna, result);
  }, [logs, items, swipesMap, answers.family, answers.price, answers.longevity, dna]);

  // Don't recommend fragrances the user already owns ("have") — they're in
  // your wardrobe, no need to surface them again. Wishlist items can still
  // surface (you might want to buy after seeing it praised).
  const owned = useMemo(
    () => new Set(items.filter((i) => i.status === 'have').map((i) => i.fragrance_id)),
    [items],
  );

  // Pull the top-popularity slice of the live catalog into local state.
  // useCatalogStore.fetchAllActive handles demo-mode fallback to MOCK_CATALOG.
  // The genders argument is omitted so the pool inherits the user's audience
  // preference (Settings -> Show me). It was hardcoded to ['feminine','unisex'],
  // which meant every recommendation in the app was drawn from the women's
  // shelf no matter who was asking.
  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);
  const catalogVersion = useCatalogStore((s) => s.version);
  const [catalogPool, setCatalogPool] = useState<Fragrance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchEnriched(8000, 0).then((rows) => {
      if (!cancelled) setCatalogPool(rows);
    });
    return () => { cancelled = true; };
  }, [fetchEnriched, catalogVersion]);

  const candidates = useMemo(
    () => catalogPool.filter((f) => !owned.has(f.id)),
    [catalogPool, owned],
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

/**
 * Lightweight hook: derives the user's taste profile from local signals only.
 * Does NOT fetch the catalog — safe to call on any screen without triggering
 * the full recommendation pipeline.
 */
export function useTasteProfile(): DerivedTasteProfile {
  const logs = useWearLogStore((s) => s.logs);
  const items = useWardrobeStore((s) => s.items);
  const swipesMap = useSwipeStore((s) => s.swipes);
  const answers = useQuizStore((s) => s.answers);
  const dna = useTasteProfileStore((s) => s.dna);
  const fetchMany = useCatalogStore((s) => s.fetchMany);

  // Eagerly fetch every fragrance referenced by wears/wardrobe/swipes that
  // isn't in the synchronous catalog cache yet. In production the cache is
  // populated lazily, so without this the swipe signals are silently dropped
  // (buildSignals' resolver returns undefined) and the taste profile collapses
  // to "1 signal collected" even after dozens of swipes.
  const [fetchedFragrances, setFetchedFragrances] = useState<Fragrance[]>([]);
  useEffect(() => {
    const ids = new Set<string>();
    logs.forEach((l) => ids.add(l.fragrance_id));
    items.forEach((i) => ids.add(i.fragrance_id));
    Object.values(swipesMap).forEach((x) => ids.add(x.fragrance_id));
    const missing = [...ids].filter((id) => !getFragranceFromStore(id));
    if (!missing.length) return;
    let cancelled = false;
    fetchMany(missing).then((rows) => {
      if (!cancelled) setFetchedFragrances(rows);
    });
    return () => { cancelled = true; };
  }, [logs, items, swipesMap, fetchMany]);

  return useMemo(() => {
    const fetchedMap = new Map<string, Fragrance>(fetchedFragrances.map((f) => [f.id, f]));
    const resolve = (id: string) => fetchedMap.get(id) ?? getFragranceFromStore(id);
    const wears = logs.map((l) => ({ fragrance_id: l.fragrance_id, rating: l.rating ?? null }));
    const itemsForProfile = items.map((i) => ({ fragrance_id: i.fragrance_id, status: i.status }));
    const swipes = Object.values(swipesMap).map((x) => ({ fragrance_id: x.fragrance_id, action: x.action }));
    const base = deriveTasteProfile(buildSignals(wears, itemsForProfile, swipes, resolve));

    const result = { ...base };
    if (answers.family) {
      result.preferred_families = {
        ...result.preferred_families,
        [answers.family]: (result.preferred_families[answers.family] ?? 0) + 1.5,
      };
      result.signal_count = result.signal_count + 1;
    }
    if (answers.price && result.avg_price_tier === null) result.avg_price_tier = Number(answers.price);
    if (answers.longevity && result.longevity_preference === null) result.longevity_preference = Number(answers.longevity);
    return blendProfiles(dna, result);
  }, [logs, items, swipesMap, fetchedFragrances, answers.family, answers.price, answers.longevity, dna]);
}

/**
 * "Icons" rail — top-quality fragrances by community scores.
 * Sorted by (compliment + versatility + office_safe) DESC as a proxy for
 * broadly beloved, well-regarded bottles. Honest label, honest data.
 */
export function useIcons(limit = 6): Fragrance[] {
  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);
  const catalogVersion = useCatalogStore((s) => s.version);
  const [rows, setRows] = useState<Fragrance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchEnriched(limit * 6, 0).then((r) => {
      if (cancelled) return;
      const sorted = [...r].sort((a, b) =>
        (b.compliment_score + b.versatility_score + b.office_safe_score) -
        (a.compliment_score + a.versatility_score + a.office_safe_score)
      );
      setRows(sorted.slice(0, limit));
    });
    return () => { cancelled = true; };
  }, [fetchEnriched, limit, catalogVersion]);
  return rows;
}

/**
 * "New Arrivals" rail — most recently released fragrances in the catalog.
 * Used as a fallback for Community SOTD when the feed has no entries yet,
 * so the rail looks meaningfully different from the Icons rail (which sorts
 * by quality/community scores, not recency).
 */
export function useNewArrivals(limit = 8): Fragrance[] {
  const fetchEnriched = useCatalogStore((s) => s.fetchEnriched);
  const catalogVersion = useCatalogStore((s) => s.version);
  const [rows, setRows] = useState<Fragrance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchEnriched(limit * 6, 0).then((r) => {
      if (cancelled) return;
      const sorted = [...r].sort((a, b) => b.release_year - a.release_year);
      // Deduplicate by name+brand — different SKUs of the same fragrance look identical
      const seen = new Set<string>();
      const deduped = sorted.filter((f) => {
        const key = `${f.brand}::${f.name}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setRows(deduped.slice(0, limit));
    });
    return () => { cancelled = true; };
  }, [fetchEnriched, limit, catalogVersion]);
  return rows;
}

export interface WardrobePick {
  fragrance: Fragrance;
  reason: string;
  lastWorn: string | null;
}

/**
 * "Your Wardrobe Picks" — re-ranks fragrances the user owns (status=have)
 * by today's taste score. Tiebreaker: items not worn in 30+ days surface
 * first to encourage rotation.
 */
export function useWardrobePicks(limit = 3): { picks: WardrobePick[]; loading: boolean } {
  const items = useWardrobeStore((s) => s.items);
  const logs = useWearLogStore((s) => s.logs);
  const swipesMap = useSwipeStore((s) => s.swipes);
  // Only the context constraints (season/occasion) bias the wardrobe carousel —
  // avoid/budget are acquisition constraints and must not bury bottles the user
  // already owns.
  const prefOccasion = useScentPreferencesStore((s) => s.occasion);
  const prefSeason = useScentPreferencesStore((s) => s.season);
  const fetchMany = useCatalogStore((s) => s.fetchMany);
  const dna = useTasteProfileStore((s) => s.dna);

  // Smart SOTD engine: DNA-first, day-stable. Remote-flag gated (default on),
  // with a hard try/catch fallback to the legacy ranking below.
  const smartEnabled = useSmartSotdEnabled();
  const weatherEnabled = useSotdWeatherEnabled();
  const weather = useDailyWeather(weatherEnabled);
  // Locked per (user, local day): stable within the day, rotates across days.
  const daySeed = useMemo(() => sotdDaySeed(getCurrentUser()?.id), []);
  // What we already showed on previous days — the signal the rotation actually
  // runs on, since wear logs are too sparse to differentiate anything.
  const shownHistory = useSotdHistoryStore((s) => s.shown);
  const recordShown = useSotdHistoryStore((s) => s.record);

  const ownedItems = useMemo(
    () => items.filter((i) => i.status === 'have'),
    [items],
  );

  // Eagerly fetch wardrobe fragrances that aren't in the catalog cache yet.
  // Without this, getFragranceFromStore returns undefined for items the user
  // added while offline or on a fresh device, so candidates is always empty
  // and the card shows "Building your picks" even with a full wardrobe.
  const [fetchedFragrances, setFetchedFragrances] = useState<Fragrance[]>([]);
  const [fetchDone, setFetchDone] = useState(false);
  useEffect(() => {
    const ids = ownedItems.map((i) => i.fragrance_id);
    if (!ids.length) { setFetchDone(true); return; }
    let cancelled = false;
    fetchMany(ids).then((rows) => {
      if (!cancelled) { setFetchedFragrances(rows); setFetchDone(true); }
    });
    return () => { cancelled = true; };
  }, [ownedItems, fetchMany]);

  const lastWornMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of logs) {
      const existing = map.get(log.fragrance_id);
      if (!existing || log.worn_on > existing) map.set(log.fragrance_id, log.worn_on);
    }
    return map;
  }, [logs]);

  const profile = useMemo(() => {
    const wears = logs.map((l) => ({ fragrance_id: l.fragrance_id, rating: l.rating ?? null }));
    const itemsForProfile = items.map((i) => ({ fragrance_id: i.fragrance_id, status: i.status }));
    const swipes = Object.values(swipesMap).map((x) => ({ fragrance_id: x.fragrance_id, action: x.action }));
    // DNA-first: blend the living Fragrance DNA into the passive taste profile so
    // the SOTD expresses the user's archetype, not a generic average.
    return blendProfiles(dna, deriveTasteProfile(buildSignals(wears, itemsForProfile, swipes)));
  }, [logs, items, swipesMap, dna]);

  const ctx = useMemo<RecContext>(() => {
    const base = defaultContext();
    if (prefSeason) base.season = prefSeason;
    if (prefOccasion) base.occasion = prefOccasion;
    if (weather) base.weather = weather;
    return base;
  }, [prefSeason, prefOccasion, weather]);

  // Pure: returns the picks plus whether the smart engine THREW and we fell back
  // to legacy (distinct from the kill switch being off, which isn't a failure).
  // Tracking happens in the effect below, never during render.
  const picksResult = useMemo<{ list: WardrobePick[]; fellBack: boolean }>(() => {
    // Build a lookup from freshly-fetched fragrances, fall back to sync cache.
    const fetchedMap = new Map<string, Fragrance>(fetchedFragrances.map((f) => [f.id, f]));
    const candidates = ownedItems
      .map((item) => fetchedMap.get(item.fragrance_id) ?? getFragranceFromStore(item.fragrance_id))
      .filter(Boolean) as Fragrance[];

    if (candidates.length === 0) return { list: [], fellBack: false };

    // Smart engine (DNA-first, day-stable). Any failure falls through to the
    // legacy ranking below, so the Today tab can never break on this path.
    // Only trust recency ("last worn / not in rotation") reasons when the user
    // genuinely logs wears. A handful of logs = a real habit; zero-to-few means
    // absence of a log tells us nothing, so recency language would be a guess.
    const hasWearSignal = logs.length >= 5;

    let fellBack = false;
    if (smartEnabled) {
      try {
        return {
          list: selectSmartSotd(
            candidates, profile, ctx, lastWornMap, daySeed, dna, limit, hasWearSignal, shownHistory,
          ),
          fellBack: false,
        };
      } catch (e) {
        if (__DEV__) console.warn('[sotd] smart engine failed, using legacy:', e);
        fellBack = true; // smart was ON but threw — a genuine fallback worth logging
      }
    }

    // ── Legacy fallback (unchanged) ──────────────────────────────────────
    const scored = rank(candidates, profile, ctx, candidates.length);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');

    const list = [...scored]
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 0.05) return scoreDiff;
        // Tiebreaker: items not worn recently float up
        const aStale = (lastWornMap.get(a.fragrance.id) ?? '1970-01-01') < thirtyDaysAgo;
        const bStale = (lastWornMap.get(b.fragrance.id) ?? '1970-01-01') < thirtyDaysAgo;
        if (aStale !== bStale) return aStale ? -1 : 1;
        return b.score - a.score;
      })
      .slice(0, limit)
      .map((r) => ({
        fragrance: r.fragrance,
        reason: r.reason,
        lastWorn: lastWornMap.get(r.fragrance.id) ?? null,
      }));
    return { list, fellBack };
    // shownHistory is a dep so a fresh day's history is picked up. Recording
    // today's pick re-runs this, but shownPenalty ignores today's own entry, so
    // the result is identical — the pick stays locked for the day, no loop.
  }, [ownedItems, fetchedFragrances, profile, ctx, lastWornMap, limit, smartEnabled, daySeed, dna, logs, shownHistory]);

  // Front-door observability (Mark Z P2): log a silent smart→legacy fallback once
  // per mount so the SOTD fallback rate is visible in prod. Fires only on a real
  // throw, not on the kill switch or the empty-wardrobe path.
  const fallbackLogged = useRef(false);
  useEffect(() => {
    if (picksResult.fellBack && !fallbackLogged.current) {
      fallbackLogged.current = true;
      track(EVENTS.SOTD_ENGINE_FALLBACK);
    }
  }, [picksResult.fellBack]);

  // Remember what we showed today so tomorrow can pick something else. This is
  // the whole rotation mechanism — it needs no action from the user, unlike the
  // wear log it used to (fruitlessly) depend on. The store is idempotent per day.
  const hero = picksResult.list[0]?.fragrance.id;
  useEffect(() => {
    if (!hero) return;
    const todayYmd = daySeed.split('|')[1];
    if (todayYmd) recordShown(hero, todayYmd);
  }, [hero, daySeed, recordShown]);

  return { picks: picksResult.list, loading: ownedItems.length > 0 && !fetchDone };
}
