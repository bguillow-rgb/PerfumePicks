/**
 * useDailyPicks — daily "what should I wear today?" carousel hook.
 *
 * Unlike useRecommendations (which scores the catalog to help the user
 * discover fragrances they don't own), this hook scores only the user's
 * owned wardrobe. Each slot in the returned carousel answers a distinct
 * question so the cards feel curated, not repetitive.
 *
 * Rails returned:
 *   todaysPick    — best overall scorer for the current season/time/weather
 *   forTheWeather — best context match on the weather axis specifically
 *   forTheVibe    — office-safe on weekdays; most versatile on weekends
 *   longOverdue   — highest scorer not worn in 30+ days (rotation reminder)
 *   neverTried    — highest scorer with zero wear log entries
 *
 * Scoring = scoreFragrance() (taste profile + context) + recencyModifier()
 * from score.ts. All computation is local — no network required.
 */

import { useMemo } from 'react';
import { useWardrobeStore } from '@/src/stores/useWardrobeStore';
import { useWearLogStore } from '@/src/stores/useWearLogStore';
import { useSwipeStore } from '@/src/stores/useSwipeStore';
import { getFragranceFromStore, type Fragrance as MockFragrance } from '@/src/stores/useCatalogStore';
import { deriveTasteProfile, type TasteSignal } from './tasteProfile';
import { scoreDailyCandidate, recencyModifier, type RecContext, type ScoredRec } from './score';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface DailyRail {
  fragrance: MockFragrance;
  score: number;
  reason: string;
  tags: string[];
  /** Human-readable label shown above the card in the carousel. */
  railLabel: string;
  /** Why this slot was chosen (distinct from the score reason). */
  railReason: string;
}

export interface DailyPicks {
  rails: DailyRail[];
  /** True once the user has enough wardrobe + signal data to produce picks. */
  hasData: boolean;
  /** Context that was used to generate picks (useful for debug/display). */
  ctx: RecContext;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function currentSeason(): RecContext['season'] {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

/** Proxy weather from season when no live weather data is available. */
function weatherFromSeason(season: RecContext['season']): RecContext['weather'] {
  switch (season) {
    case 'summer': return 'hot-dry';
    case 'winter': return 'cool';
    case 'spring': return 'warm';
    case 'fall':   return 'cool';
    default:       return 'warm';
  }
}

function isWeekend(): boolean {
  const day = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function buildSignals(
  wears: { fragrance_id: string; rating: number | null | undefined }[],
  wardrobeItems: { fragrance_id: string; status: string }[],
  swipes: { fragrance_id: string; action: string }[],
): TasteSignal[] {
  const out: TasteSignal[] = [];
  for (const w of wears) {
    const f = getFragranceFromStore(w.fragrance_id);
    if (!f) continue;
    const weight = w.rating != null && w.rating >= 4
      ? SIGNAL_WEIGHTS.wear_high_rating
      : SIGNAL_WEIGHTS.wear_default;
    out.push({ fragrance: f, weight });
  }
  for (const i of wardrobeItems) {
    const f = getFragranceFromStore(i.fragrance_id);
    if (!f) continue;
    const w = (SIGNAL_WEIGHTS as Record<string, number>)[i.status] ?? 1;
    out.push({ fragrance: f, weight: w });
  }
  for (const sw of swipes) {
    const f = getFragranceFromStore(sw.fragrance_id);
    if (!f) continue;
    if (sw.action === 'like')    out.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_like });
    if (sw.action === 'dislike') out.push({ fragrance: f, weight: SIGNAL_WEIGHTS.swipe_dislike });
  }
  return out;
}

/**
 * Pick the best candidate from a list, excluding any fragrance ids already
 * used in a previous rail. Returns undefined if nothing qualifies.
 */
function pickBest(
  scored: ScoredRec[],
  usedIds: Set<string>,
): ScoredRec | undefined {
  return scored.find((s) => !usedIds.has(s.fragrance.id));
}

// ─────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────

/**
 * @param weatherOverride  Pass live weather from a weather API when available.
 *                         Falls back to a season-derived proxy automatically.
 */
export function useDailyPicks(weatherOverride?: RecContext['weather']): DailyPicks {
  const logs    = useWearLogStore((s) => s.logs);
  const items   = useWardrobeStore((s) => s.items);
  const swipesMap = useSwipeStore((s) => s.swipes);

  // Build context once per render (stable values only — no new object each time)
  const season  = useMemo(() => currentSeason(), []);
  const weather = weatherOverride ?? weatherFromSeason(season);
  const weekend = useMemo(() => isWeekend(), []);

  const ctx = useMemo<RecContext>(() => ({
    season,
    weather,
    timeOfDay: new Date().getHours(),
    occasion: weekend ? 'casual' : 'office',
    adventureMode: 'middle',
  }), [season, weather, weekend]);

  // Owned fragrance ids → fragrance objects
  const ownedItems = useMemo(() => items.filter((i) => i.status === 'have'), [items]);

  const ownedFragrances = useMemo(
    () => ownedItems.flatMap((i) => {
      const f = getFragranceFromStore(i.fragrance_id);
      return f ? [f] : [];
    }),
    [ownedItems],
  );

  // Last-worn date per fragrance_id, from local wear log
  const lastWornByFragrance = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const log of logs) {
      const existing = map[log.fragrance_id];
      if (!existing || log.worn_on > existing) {
        map[log.fragrance_id] = log.worn_on;
      }
    }
    return map;
  }, [logs]);

  // Set of fragrance ids worn today — exclude from all rails
  const wornTodayIds = useMemo<Set<string>>(() => {
    const t = today();
    return new Set(logs.filter((l) => l.worn_on === t).map((l) => l.fragrance_id));
  }, [logs]);

  // Taste profile from all available signals
  const profile = useMemo(() => {
    const wears   = logs.map((l) => ({ fragrance_id: l.fragrance_id, rating: l.rating }));
    const wardrobe = items.map((i) => ({ fragrance_id: i.fragrance_id, status: i.status }));
    const swipes  = Object.values(swipesMap).map((x) => ({ fragrance_id: x.fragrance_id, action: x.action }));
    return deriveTasteProfile(buildSignals(wears, wardrobe, swipes));
  }, [logs, items, swipesMap]);

  // Score every owned fragrance (excluding worn today)
  const candidates = useMemo(
    () => ownedFragrances.filter((f) => !wornTodayIds.has(f.id)),
    [ownedFragrances, wornTodayIds],
  );

  // Full scored list — base score + recency modifier
  const allScored = useMemo(
    () =>
      candidates
        .map((f) => scoreDailyCandidate(f, profile, ctx, lastWornByFragrance[f.id] ?? null))
        .sort((a, b) => b.score - a.score),
    [candidates, profile, ctx, lastWornByFragrance],
  );

  // ── Rail 2: best weather match ──────────────────────────────────────
  // Re-score without the recency modifier, using only weather in context,
  // so a fragrance that's perfect for today's heat can win even if recent.
  const weatherCtx = useMemo<RecContext>(() => ({
    weather: ctx.weather,
    adventureMode: 'middle',
  }), [ctx.weather]);

  const weatherScored = useMemo(
    () =>
      candidates
        .map((f) => scoreDailyCandidate(f, profile, weatherCtx, lastWornByFragrance[f.id] ?? null))
        .sort((a, b) => b.score - a.score),
    [candidates, profile, weatherCtx, lastWornByFragrance],
  );

  // ── Rail 3: vibe (office on weekdays, versatile on weekends) ────────
  const vibeScored = useMemo(
    () =>
      [...candidates]
        .sort((a, b) =>
          weekend
            ? b.versatility_score - a.versatility_score
            : b.office_safe_score - a.office_safe_score,
        )
        .map((f) => scoreDailyCandidate(f, profile, ctx, lastWornByFragrance[f.id] ?? null)),
    [candidates, profile, ctx, lastWornByFragrance, weekend],
  );

  // ── Rail 4: long overdue (30+ days, or never worn) ──────────────────
  const overdueScored = useMemo(
    () =>
      allScored.filter((s) => {
        const last = lastWornByFragrance[s.fragrance.id];
        if (!last) return true; // never worn qualifies
        const days = Math.round(
          (Date.now() - new Date(last).getTime()) / 86_400_000,
        );
        return days >= 30;
      }),
    [allScored, lastWornByFragrance],
  );

  // ── Rail 5: never tried ─────────────────────────────────────────────
  const neverTriedScored = useMemo(
    () => allScored.filter((s) => !lastWornByFragrance[s.fragrance.id]),
    [allScored, lastWornByFragrance],
  );

  // ── Assemble rails, de-duping as we go ──────────────────────────────
  const rails = useMemo<DailyRail[]>(() => {
    const used = new Set<string>();
    const out: DailyRail[] = [];

    function push(
      pick: ScoredRec | undefined,
      label: string,
      railReason: string,
    ) {
      if (!pick) return;
      used.add(pick.fragrance.id);
      out.push({ ...pick, railLabel: label, railReason });
    }

    const slot1 = pickBest(allScored, used);
    push(slot1, 'Today\'s pick', `Best match for ${season} + ${weekend ? 'the weekend' : 'the workday'}`);

    const slot2 = pickBest(weatherScored, used);
    push(slot2, 'For the weather', `Suited to ${weather?.replace('-', ' ') ?? 'today\'s conditions'}`);

    const slot3 = pickBest(vibeScored, used);
    push(slot3, weekend ? 'Weekend vibe' : 'Office-ready', weekend ? 'Most versatile in your collection' : 'Discreet enough for the office');

    const slot4 = pickBest(overdueScored, used);
    push(slot4, 'Long overdue', 'You haven\'t reached for this one in a while');

    const slot5 = pickBest(neverTriedScored, used);
    push(slot5, 'Never tried', 'You own this but haven\'t worn it yet');

    return out;
  }, [allScored, weatherScored, vibeScored, overdueScored, neverTriedScored, season, weather, weekend]);

  const hasData = ownedFragrances.length > 0;

  return { rails, hasData, ctx };
}
