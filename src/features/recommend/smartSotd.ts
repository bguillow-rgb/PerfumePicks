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
): string {
  const gone = daysSince(lastWornIso);
  const accords = f.top_accords ?? [];

  // 1. Rotation / rediscovery — the most emotionally resonant "today" signal.
  if (gone == null) return "You've never worn this one — today's the day to try it.";
  if (gone >= 45) return `It's been over ${Math.floor(gone / 7)} weeks — time to bring this back into rotation.`;

  // 2. Weather.
  if ((ctx.weather === 'hot-humid' || ctx.weather === 'hot-dry') &&
      accords.some((a) => ['fresh', 'citrus', 'green', 'aquatic'].includes(a))) {
    return 'Warm out — this one stays fresh and easy in the heat.';
  }
  if ((ctx.weather === 'cold' || ctx.weather === 'cool') &&
      accords.some((a) => ['amber', 'warm-spicy', 'vanilla', 'woody', 'sweet', 'oud'].includes(a))) {
    return 'Cool and grey — a warm, enveloping day for this.';
  }

  // 3. Occasion.
  if (ctx.occasion === 'office' && f.office_safe_score >= 0.75) return 'Reads right for a workday — present, not loud.';
  if ((ctx.occasion === 'date' || ctx.occasion === 'evening') && f.compliment_score >= 0.85) {
    return 'A compliment-getter for tonight.';
  }

  // 4. DNA wheelhouse — spoken in the archetype's register when confident.
  const name = dna && dna.confidence >= 0.4 ? ARCHETYPE_COPY[dna.archetype.primary]?.name : null;
  if (name) return `Right in your ${name} wheelhouse.`;

  // 5. Fall back to the base taste reason.
  return baseReason;
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
): SotdPick[] {
  if (candidates.length === 0) return [];

  const JITTER = 0.04; // small: only reorders genuine near-ties, deterministically

  const scored = candidates.map((f) => {
    const lastWorn = lastWornMap.get(f.id) ?? null;
    const base = scoreDailyCandidate(f, profile, ctx, lastWorn);
    const score = Math.max(0, Math.min(1, base.score + seededJitter(f.id, daySeed, JITTER)));
    return { base, f, lastWorn, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ f, lastWorn, base }) => ({
    fragrance: f,
    reason: sotdReason(f, ctx, dna, lastWorn, base.reason),
    lastWorn,
  }));
}
