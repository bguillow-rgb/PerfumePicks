/**
 * Living DNA — the one weighted signal pool (PRD §7.1).
 *
 * Onboarding picks, swipes, wears, and wardrobe events are all the SAME kind of
 * input to ONE pool. Each signal's effective weight is:
 *
 *     base × deliberateFactor × recencyFactor
 *
 *   - base:            how much that kind of action means (picks via pickWeight,
 *                      behavioral kinds via BASE_WEIGHTS).
 *   - deliberateFactor: deliberate actions (picks, ⭐, love) keep full weight;
 *                      passive ones (left-swipes, default wears) are discounted
 *                      by 1/DELIBERATE_MULTIPLIER. Anchoring deliberate at 1.0
 *                      (rather than scaling it up) keeps a seeds-only pool
 *                      byte-identical to the legacy derivation → no regression.
 *   - recencyFactor:   exp(-ageDays / TAU). Newer signals weigh more; old ones
 *                      decay. A pick with no `seededAt` is treated as fresh.
 *
 * This module is pure + deterministic. The store/trigger wiring that feeds it
 * lands in M2; in M1 it is exercised only by deriveLivingDNA + unit tests.
 */

import type { DnaCatalogFragrance, DnaPick, SeedRelation } from './types';
import { pickWeight } from './metrics';

// ── Tunable constants (one place — PRD §10) ─────────────────────────────────

/** Deliberate signals outweigh passive ones by this ratio. */
export const DELIBERATE_MULTIPLIER = 1.5;
/** Recency half-life-ish: a month-old signal is worth ~1/e of a fresh one. */
export const RECENCY_TAU_DAYS = 30;

// ── Living-archetype "lean" mechanic (PRD §6.6) ─────────────────────────────
// deriveArchetype surfaces only the #1 archetype; the runner-up ("challenger")
// becomes a live "leaning" indicator before the committed archetype swaps.

/** Show the "leaning toward X" line once challenger/current ≥ this ratio. */
export const LEAN_REVEAL_RATIO = 0.85;
/**
 * Challenger must beat current by this margin to commit a swap. There is NO time
 * cooldown: the archetype swaps the moment this margin is cleared, so it always
 * tracks the user's picks. The margin alone is the anti-flap guard — to swap
 * back, the old archetype must itself clear the margin, creating a dead band that
 * stops ordinary noise from oscillating the identity.
 */
export const SWAP_MARGIN = 0.05;

/**
 * Master flag for the engine. OFF in M1 (engine ships dark); M2 flips it on when
 * recompute triggers + UI are wired. Kept here so there is one switch.
 */
export const LIVING_DNA_ENABLED = true;

// ── Single source of truth for behavioral weights (kills the divergence) ────
// useRecommendations had swipe_love=1.5/like=0.8; useAppSync had love=2.5/like=1.
// Both now import these. (PRD §7, T-U8.)

export const SWIPE_LOVE = 2.0;
export const SWIPE_LIKE = 0.8;
export const SWIPE_DISLIKE = -1.5;

export const WEAR_HIGH = 3.0;
export const WEAR_DEFAULT = 1.5;

export const WARDROBE_HAVE = 2.0;
export const WARDROBE_WANT = 1.0;
export const WARDROBE_TESTED = 0.5;
export const WARDROBE_SOLD_ON = 2.5;

/** Behavioral signal kinds (picks are handled via pickWeight, not this table). */
export type BehavioralKind =
  | 'swipe_love' | 'swipe_like' | 'swipe_dislike'
  | 'wear_high' | 'wear_default'
  | 'wardrobe_have' | 'wardrobe_want' | 'wardrobe_tested' | 'wardrobe_sold_on';

export type DnaSignalKind = 'pick' | BehavioralKind;

export const BASE_WEIGHTS: Record<BehavioralKind, number> = {
  swipe_love: SWIPE_LOVE,
  swipe_like: SWIPE_LIKE,
  swipe_dislike: SWIPE_DISLIKE,
  wear_high: WEAR_HIGH,
  wear_default: WEAR_DEFAULT,
  wardrobe_have: WARDROBE_HAVE,
  wardrobe_want: WARDROBE_WANT,
  wardrobe_tested: WARDROBE_TESTED,
  wardrobe_sold_on: WARDROBE_SOLD_ON,
};

/**
 * The shape the legacy recommendation path expects (`SIGNAL_WEIGHTS`). Re-built
 * from the same constants so the two consumers can never diverge again.
 */
export const RECOMMENDATION_SIGNAL_WEIGHTS = {
  wear_high_rating: WEAR_HIGH,
  wear_default: WEAR_DEFAULT,
  have: WARDROBE_HAVE,
  want: WARDROBE_WANT,
  tested: WARDROBE_TESTED,
  sold_on: WARDROBE_SOLD_ON,
  swipe_love: SWIPE_LOVE,
  swipe_like: SWIPE_LIKE,
  swipe_dislike: SWIPE_DISLIKE,
} as const;

// ── The signal + the math ───────────────────────────────────────────────────

export interface DnaSignal {
  fragrance: DnaCatalogFragrance;
  kind: DnaSignalKind;
  /** ISO timestamp — drives recency. For picks: seededAt ?? now. */
  ts: string;
  /** Deliberate (pick/⭐/love) vs passive (left-swipe/default wear). */
  deliberate: boolean;
  /** Counts toward the OWNED set used for wardrobe-slot derivation. */
  owned: boolean;
  /** For picks: own/want feeds modalGender + price parity. */
  relation: SeedRelation;
  /** For picks: ⭐ favorite multiplier (folded into pickWeight). */
  favorite: boolean;
}

function baseWeight(s: DnaSignal): number {
  return s.kind === 'pick' ? pickWeight(s.relation, s.favorite) : BASE_WEIGHTS[s.kind];
}

/** exp(-ageDays / TAU). 1.0 at age 0; ~0.10 at ~90 days with TAU=30. */
export function recencyFactor(ts: string, now: number = Date.now()): number {
  const ageDays = Math.max(0, (now - Date.parse(ts)) / 86_400_000);
  return Math.exp(-ageDays / RECENCY_TAU_DAYS);
}

/** base × deliberateFactor × recency. Negative for aversive kinds (dislike). */
export function effectiveWeight(s: DnaSignal, now: number = Date.now()): number {
  const deliberateFactor = s.deliberate ? 1 : 1 / DELIBERATE_MULTIPLIER;
  return baseWeight(s) * deliberateFactor * recencyFactor(s.ts, now);
}

// ── Building the pool from raw inputs ───────────────────────────────────────

export interface SwipeInput {
  fragrance: DnaCatalogFragrance;
  action: 'love' | 'like' | 'dislike' | 'skip';
  ts: string;
}
export interface WearInput {
  fragrance: DnaCatalogFragrance;
  /** ≥4 → high-intent wear. */
  rating?: number | null;
  ts: string;
}
export interface WardrobeInput {
  fragrance: DnaCatalogFragrance;
  status: 'have' | 'want' | 'tested' | 'sold_on';
  ts: string;
}

export interface BuildSignalsInput {
  picks: DnaPick[];
  swipes?: SwipeInput[];
  wears?: WearInput[];
  wardrobe?: WardrobeInput[];
  /** Injectable clock for deterministic tests. */
  now?: () => string;
}

const isoNow = () => new Date().toISOString();

/** Map every raw input into the unified signal list. `skip` carries no signal. */
export function buildDnaSignals(input: BuildSignalsInput): DnaSignal[] {
  const nowIso = (input.now ?? isoNow)();
  const out: DnaSignal[] = [];

  for (const p of input.picks) {
    out.push({
      fragrance: p.fragrance,
      kind: 'pick',
      ts: p.seededAt ?? nowIso,
      deliberate: true,
      owned: p.relation === 'own',
      relation: p.relation,
      favorite: p.favorite,
    });
  }

  for (const sw of input.swipes ?? []) {
    if (sw.action === 'skip') continue; // a neutral pass is not a signal
    const kind: BehavioralKind =
      sw.action === 'love' ? 'swipe_love' : sw.action === 'like' ? 'swipe_like' : 'swipe_dislike';
    out.push({
      fragrance: sw.fragrance,
      kind,
      ts: sw.ts,
      deliberate: sw.action === 'love', // a love is deliberate; like/dislike passive
      owned: false,
      relation: 'want',
      favorite: false,
    });
  }

  for (const w of input.wears ?? []) {
    const high = w.rating != null && w.rating >= 4;
    out.push({
      fragrance: w.fragrance,
      kind: high ? 'wear_high' : 'wear_default',
      ts: w.ts,
      deliberate: high, // a high-rated wear is deliberate intent
      owned: true,
      relation: 'own',
      favorite: false,
    });
  }

  for (const wd of input.wardrobe ?? []) {
    const kind = `wardrobe_${wd.status}` as BehavioralKind;
    const owned = wd.status === 'have' || wd.status === 'sold_on';
    out.push({
      fragrance: wd.fragrance,
      kind,
      ts: wd.ts,
      deliberate: owned, // owning/keeping is deliberate; want/tested softer
      owned,
      relation: owned ? 'own' : 'want',
      favorite: false,
    });
  }

  return out;
}

export interface LivingPools {
  /** Positive-weight signals as weighted picks for the existing pipeline. */
  pool: DnaPick[];
  /** Aversive signals (dislike) routed to the avoided channel. */
  avoided: DnaCatalogFragrance[];
  /** Genuinely-owned fragrances → wardrobe-slot derivation. */
  ownedFrags: DnaCatalogFragrance[];
  /** Count of contributing signals → confidence volume. */
  signalCount: number;
}

/**
 * Resolve every signal to its effective weight and split into the positive pool
 * (weighted picks) vs the aversive avoided list. Negative-weight signals would
 * otherwise poison the weighted-mean denominators, so they go to `avoided`
 * (which subtracts accords + seeds dislikedNotes — the existing recoil path).
 */
export function signalsToPools(signals: DnaSignal[], now: number = Date.now()): LivingPools {
  const pool: DnaPick[] = [];
  const avoided: DnaCatalogFragrance[] = [];
  const ownedFrags: DnaCatalogFragrance[] = [];

  for (const s of signals) {
    const w = effectiveWeight(s, now);
    if (w < 0) {
      avoided.push(s.fragrance);
      continue;
    }
    if (w === 0) continue;
    pool.push({ fragrance: s.fragrance, relation: s.relation, favorite: s.favorite, weight: w });
    if (s.owned) ownedFrags.push(s.fragrance);
  }

  return { pool, avoided, ownedFrags, signalCount: pool.length };
}
