/**
 * Recommendation scoring — implementation of spec § 5 + § 18.
 *
 * Inputs:
 *   - candidate fragrance (any from the catalog)
 *   - user's derived taste profile (from tasteProfile.ts)
 *   - context (season, occasion, weather, time of day)
 *
 * Output: a single 0..1 score + a human-readable "reason" string.
 *
 * The base weights (per spec):
 *   notes match    35%
 *   accords match  25%
 *   family         15%
 *   price          10%
 *   performance    10%
 *   context         5%
 *
 * Then bonus adjustments:
 *   liked notes      → boost
 *   disliked notes   → penalize
 *   exploration mode → diversity factor
 *
 * Pure function — easy to test.
 */

import type { MockFragrance } from '@/src/mock/fragrances';
import type { DerivedTasteProfile } from './tasteProfile';

export type AdventureMode = 'classic' | 'middle' | 'surprise';

export interface RecContext {
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  weather?: 'hot-humid' | 'hot-dry' | 'warm' | 'cool' | 'cold' | 'rainy';
  occasion?: 'office' | 'date' | 'casual' | 'evening' | 'formal' | 'workout' | 'travel';
  /** Hour 0..23 — used to hint mood (morning=fresh, evening=warm, etc.). */
  timeOfDay?: number;
  adventureMode?: AdventureMode;
}

export interface ScoredRec {
  fragrance: MockFragrance;
  score: number;            // 0..1
  reason: string;            // human-readable explanation
  tags: string[];           // ['office-safe','compliment-getter',...]
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function noteMatch(f: MockFragrance, profile: DerivedTasteProfile): number {
  // Score = sum of liked-note weights for notes present in this fragrance,
  // normalized by the total liked weight + a small denominator floor.
  const totalLikedWeight = sum(Object.values(profile.liked_notes));
  if (totalLikedWeight === 0) return 0.5;       // neutral when no signal
  let hits = 0;
  for (const n of [...f.top_notes, ...f.heart_notes, ...f.base_notes]) {
    const k = n.toLowerCase().trim();
    if (profile.liked_notes[k]) hits += profile.liked_notes[k];
    if (profile.disliked_notes[k]) hits -= profile.disliked_notes[k] * 1.4;  // dislikes hit harder
  }
  return clamp01(0.5 + hits / (totalLikedWeight * 1.4));
}

function accordMatch(f: MockFragrance, profile: DerivedTasteProfile): number {
  const totalAccordWeight = sum(Object.values(profile.preferred_accords).map((v) => Math.abs(v)));
  if (totalAccordWeight === 0) return 0.5;
  let hits = 0;
  for (const a of f.top_accords) {
    if (profile.preferred_accords[a]) {
      const intensity = f.accord_intensity[a] ?? 3;
      hits += profile.preferred_accords[a] * (intensity / 5);
    }
  }
  return clamp01(0.5 + hits / (totalAccordWeight * 1.4));
}

function familyMatch(f: MockFragrance, profile: DerivedTasteProfile): number {
  if (!f.fragrance_family) return 0.5;
  const total = sum(Object.values(profile.preferred_families).map((v) => Math.abs(v)));
  if (total === 0) return 0.5;
  const w = profile.preferred_families[f.fragrance_family] ?? 0;
  return clamp01(0.5 + w / (total * 1.2));
}

function priceMatch(f: MockFragrance, profile: DerivedTasteProfile): number {
  if (profile.avg_price_tier == null) return 0.5;
  const diff = Math.abs(f.price_tier - profile.avg_price_tier);
  return clamp01(1 - diff / 4);    // tiers 1..5 → max diff 4
}

function performanceMatch(f: MockFragrance, profile: DerivedTasteProfile): number {
  if (profile.longevity_preference == null) return 0.5;
  const diff = Math.abs(f.community_longevity - profile.longevity_preference);
  return clamp01(1 - diff / 5);
}

function contextMatch(f: MockFragrance, ctx: RecContext): number {
  let score = 0.5;
  let weightSum = 0;

  if (ctx.season) {
    weightSum += 1;
    const seasonalAccords: Record<string, string[]> = {
      summer: ['fresh','citrus','aquatic','green','floral'],
      spring: ['floral','green','citrus','rose','jasmine'],
      fall:   ['woody','spicy','warm-spicy','amber','tobacco'],
      winter: ['amber','vanilla','oud','sweet','woody','warm-spicy','gourmand'],
    };
    const want = seasonalAccords[ctx.season] ?? [];
    const overlap = f.top_accords.filter((a) => want.includes(a)).length;
    score += (overlap / Math.max(want.length, 1)) * 0.5;
  }
  if (ctx.weather) {
    weightSum += 1;
    if (ctx.weather === 'hot-humid' || ctx.weather === 'hot-dry') {
      // hot → fresh / citrus bonus, gourmand penalty
      const fresh = f.top_accords.some((a) => ['fresh','citrus','green','aquatic'].includes(a));
      const heavy = f.top_accords.some((a) => ['gourmand','sweet','vanilla'].includes(a));
      score += (fresh ? 0.4 : 0) + (heavy ? -0.2 : 0);
    } else if (ctx.weather === 'cold' || ctx.weather === 'cool') {
      const warm = f.top_accords.some((a) => ['amber','warm-spicy','vanilla','woody','sweet','oud'].includes(a));
      score += warm ? 0.4 : 0;
    }
  }
  if (ctx.occasion) {
    weightSum += 1;
    if (ctx.occasion === 'office') score += f.office_safe_score - 0.5;
    if (ctx.occasion === 'date') score += (f.compliment_score - 0.5) * 0.8;
    if (ctx.occasion === 'formal') score += f.compliment_score - 0.5;
    if (ctx.occasion === 'casual') score += (f.versatility_score - 0.5) * 0.6;
  }
  return clamp01(weightSum === 0 ? 0.5 : score);
}

function diversityFactor(mode: AdventureMode | undefined): number {
  // Multiplier on the random jitter that breaks score ties.
  switch (mode) {
    case 'classic':  return 0.0;
    case 'surprise': return 0.15;
    default:         return 0.05;
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// ──────────────────────────────────────────────────────────────────────
// Main scoring + ranking
// ──────────────────────────────────────────────────────────────────────

export function scoreFragrance(
  f: MockFragrance,
  profile: DerivedTasteProfile,
  ctx: RecContext = {},
): ScoredRec {
  const noteS    = noteMatch(f, profile);
  const accordS  = accordMatch(f, profile);
  const familyS  = familyMatch(f, profile);
  const priceS   = priceMatch(f, profile);
  const perfS    = performanceMatch(f, profile);
  const ctxS     = contextMatch(f, ctx);

  // Base weighted sum, per spec § 5.
  const base =
    0.35 * noteS +
    0.25 * accordS +
    0.15 * familyS +
    0.10 * priceS +
    0.10 * perfS +
    0.05 * ctxS;

  // Diversity jitter — breaks ties + drives the adventure-mode dial.
  const jitter = (Math.random() - 0.5) * diversityFactor(ctx.adventureMode);
  const score = clamp01(base + jitter);

  // Reason: pick the strongest signal that fired
  const reason = pickReason(f, ctx, { noteS, accordS, familyS, priceS, perfS, ctxS });

  // Tags — used to filter into rails ("office-safe", "compliment-getter")
  const tags: string[] = [];
  if (f.office_safe_score >= 0.75) tags.push('office-safe');
  if (f.compliment_score >= 0.85) tags.push('compliment-getter');
  if (f.versatility_score >= 0.85) tags.push('versatile');
  if (f.community_longevity >= 4.5) tags.push('beast-mode');
  if (f.community_sillage <= 3.0) tags.push('skin-scent');

  return { fragrance: f, score, reason, tags };
}

function pickReason(
  f: MockFragrance,
  ctx: RecContext,
  s: { noteS: number; accordS: number; familyS: number; priceS: number; perfS: number; ctxS: number },
): string {
  // Context-driven reasons take priority — they feel personal.
  if (ctx.weather === 'hot-humid' || ctx.weather === 'hot-dry') {
    if (s.ctxS > 0.7) return `fresh, lifted, easy in heat`;
  }
  if (ctx.weather === 'cold' || ctx.weather === 'cool') {
    if (s.ctxS > 0.7) return `warm and enveloping for cooler days`;
  }
  if (ctx.occasion === 'office' && f.office_safe_score >= 0.75) {
    return `discreet enough for the office`;
  }
  if (ctx.occasion === 'date' && f.compliment_score >= 0.85) {
    return `a compliment-getter for tonight`;
  }

  // Profile-driven reasons fall back next.
  const top = Math.max(s.accordS, s.noteS, s.familyS);
  if (top === s.accordS && s.accordS > 0.65) {
    return `tracks with the ${f.top_accords[0] ?? 'amber'} accord you've been favoriting`;
  }
  if (top === s.noteS && s.noteS > 0.65) {
    const topNote = f.top_notes[0] ?? 'rose';
    return `${topNote} sits at the top — a note you keep coming back to`;
  }
  if (top === s.familyS && s.familyS > 0.65) {
    return `firmly in your ${f.fragrance_family} wheelhouse`;
  }

  return `a thoughtful pick for today`;
}

export function rank(
  candidates: MockFragrance[],
  profile: DerivedTasteProfile,
  ctx: RecContext = {},
  limit = 10,
): ScoredRec[] {
  return candidates
    .map((f) => scoreFragrance(f, profile, ctx))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
