/**
 * smartSotd.ts — the Scent of the Day selector (DNA-first, day-stable).
 *
 * Pure functions, no hooks — trivially unit-testable and safe to wrap in a
 * try/catch fallback in the hook. The engine here differs from the legacy
 * `rank()` path in three ways that make the SOTD actually good:
 *
 *   1. DNA-first — the caller blends the living Fragrance DNA into the taste
 *      profile (blendProfiles) BEFORE scoring, so the pick expresses the user's
 *      archetype, not a generic average.
 *   2. Day-stable — no Math.random. A deterministic per-(bottle, day, user) seed
 *      breaks near-ties, so the pick is LOCKED for the whole day (kills the
 *      "changes on refresh" bug) AND rotates naturally across days (the seed
 *      changes at local midnight).
 *   3. Rotation-aware — scoreDailyCandidate folds in recencyModifier (never-worn
 *      +0.15, 30d overdue +0.10, worn <7d −0.15), so neglected bottles surface
 *      and just-worn ones sink.
 *
 * The reason line is DNA-voiced: it leads with the single strongest "why today"
 * signal (overdue rotation → weather → occasion → DNA wheelhouse → taste).
 */

import type { Fragrance } from '@/src/stores/useCatalogStore';
import type { DerivedTasteProfile } from './tasteProfile';
import type { FragranceDNA } from '@/src/features/dna/types';
import { ARCHETYPE_COPY } from '@/src/features/dna/revealCopy';
import { scoreDailyCandidate, recencyModifier, type RecContext } from './score';

export interface SotdPick {
  fragrance: Fragrance;
  reason: string;
  lastWorn: string | null;
}

/** Stable per-day identity for the seed: user + local calendar date. */
export function sotdDaySeed(userId: string | null | undefined, now: Date = new Date()): string {
  const localDate = now.toLocaleDateString('en-CA'); // YYYY-MM-DD, device tz
  return `${userId ?? 'guest'}|${localDate}`;
}

/** Deterministic FNV-1a hash → 32-bit unsigned int. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic tie-break perturbation in [-scale/2, +scale/2] for (bottle, day). */
export function seededJitter(fragranceId: string, daySeed: string, scale: number): number {
  const unit = hash32(`${fragranceId}|${daySeed}`) / 0xffffffff; // 0..1
  return (unit - 0.5) * scale;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

/** Whole days between two local YYYY-MM-DD strings (b - a). */
function daysBetweenYmd(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
}

/**
 * Demote bottles we ALREADY SHOWED on recent days, so the SOTD rotates.
 *
 * This is what actually produces variety. Wear-recency can't: nobody logs wears,
 * so every bottle reads "never worn", every bottle gets the same bonus, and the
 * ranking collapses to a static fit score that the ±0.02 jitter can't reorder —
 * the top-fitting bottle then wins every day forever (observed: same pick for a
 * week across a 37-bottle wardrobe). The app always knows what it displayed, so
 * that's the signal we rotate on.
 *
 * Sized to beat real fit-score gaps (jitter at 0.04 never could). Decays to zero
 * after a week, so a genuine favorite returns rather than being exiled.
 *
 * IMPORTANT: entries dated today (or later) are ignored. Today's pick is recorded
 * the moment it renders, and penalizing it would knock it off its own slot on the
 * next re-render — the SOTD must stay locked for the whole day.
 */
export function shownPenalty(
  fragranceId: string,
  shown: { fragranceId: string; date: string }[],
  todayYmd: string,
): number {
  let penalty = 0;
  for (const entry of shown) {
    if (entry.fragranceId !== fragranceId) continue;
    if (entry.date >= todayYmd) continue; // today/future — never penalize (day-stability)
    const days = daysBetweenYmd(entry.date, todayYmd);
    const p = days <= 1 ? -0.40 : days <= 2 ? -0.30 : days <= 4 ? -0.20 : days <= 7 ? -0.10 : 0;
    if (p < penalty) penalty = p; // most recent showing dominates
  }
  return penalty;
}

/**
 * DNA-voiced "why this, today" line. Leads with the strongest fresh signal.
 * Falls back to the base scoreFragrance reason so we never show nothing.
 */
export function sotdReason(
  f: Fragrance,
  ctx: RecContext,
  dna: FragranceDNA | null,
  lastWornIso: string | null,
  baseReason: string,
  hasWearSignal: boolean,
): string {
  const accords = f.top_accords ?? [];
  const name = dna && dna.confidence >= 0.4 ? ARCHETYPE_COPY[dna.archetype.primary]?.name : null;

  // 1. "Why today" — weather + occasion. Always true, never depends on whether
  //    the user logs wears.
  if ((ctx.weather === 'hot-humid' || ctx.weather === 'hot-dry') &&
      accords.some((a) => ['fresh', 'citrus', 'green', 'aquatic'].includes(a))) {
    return 'Warm out, and this holds up in the heat.';
  }
  if ((ctx.weather === 'cold' || ctx.weather === 'cool') &&
      accords.some((a) => ['amber', 'warm-spicy', 'vanilla', 'woody', 'sweet', 'oud'].includes(a))) {
    return 'Cool and grey. A warm one to sink into.';
  }
  if (ctx.occasion === 'office' && f.office_safe_score >= 0.75) return 'Office kind of day. Present without shouting.';
  if ((ctx.occasion === 'date' || ctx.occasion === 'evening') && f.compliment_score >= 0.85) {
    return 'Save this for tonight, it gets noticed.';
  }

  // 2. "Why this bottle" — the specific taste/DNA match. Also always true; comes
  //    from the accords/notes/family they actually favor, not from wear logs.
  const GENERIC = 'a thoughtful pick for today';
  if (baseReason && baseReason.toLowerCase() !== GENERIC) return baseReason;
  if (name) return `This one's peak ${name}.`;

  // 3. Rotation — LAST, and ONLY when the user genuinely logs wears. Without
  //    that, "you've never worn this" / "last worn X ago" is a guess (they may
  //    wear it constantly and just not log it), which reads as wrong and fake.
  if (hasWearSignal) {
    const gone = daysSince(lastWornIso);
    if (gone != null && gone >= 45) return `You logged this ${Math.floor(gone / 7)} weeks ago. Time to bring it back.`;
    if (gone == null) return 'Not in your recent rotation. Good day for it.';
  }

  // 4. Honest catch-all.
  return name ? `A good day for your ${name} side.` : 'A solid pick for today.';
}

/**
 * Select today's picks from the owned candidates. Deterministic for a given
 * (candidates, profile, ctx, daySeed) — stable within the day, rotates across
 * days. Returns hero-first; the caller renders picks[0] as SOTD and the rest as
 * alternates.
 */
export function selectSmartSotd(
  candidates: Fragrance[],
  profile: DerivedTasteProfile,
  ctx: RecContext,
  lastWornMap: Map<string, string>,
  daySeed: string,
  dna: FragranceDNA | null,
  limit: number,
  // Whether the user actually logs wears. Gates the recency ("last worn / not
  // in rotation") reasons so we never assert wear behavior we can't trust.
  hasWearSignal: boolean,
  // What this device already SHOWED as SOTD, by local day. This is what actually
  // makes the pick rotate (see shownPenalty). Defaults to empty = old behavior.
  shown: { fragranceId: string; date: string }[] = [],
): SotdPick[] {
  if (candidates.length === 0) return [];

  const JITTER = 0.04; // small: only reorders genuine near-ties, deterministically
  // daySeed is `${userId}|${YYYY-MM-DD}` — that local date is the rotation clock.
  const todayYmd = daySeed.split('|')[1] ?? '';

  const scored = candidates.map((f) => {
    const lastWorn = lastWornMap.get(f.id) ?? null;
    const base = scoreDailyCandidate(f, profile, ctx, lastWorn);
    const score = Math.max(
      0,
      Math.min(
        1,
        base.score + shownPenalty(f.id, shown, todayYmd) + seededJitter(f.id, daySeed, JITTER),
      ),
    );
    return { base, f, lastWorn, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ f, lastWorn, base }) => ({
    fragrance: f,
    reason: sotdReason(f, ctx, dna, lastWorn, base.reason, hasWearSignal),
    lastWorn,
  }));
}
