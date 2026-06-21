/**
 * deriveArchetype() — the human skin over the `traits` vector (V1.1 A3.1).
 *
 * ALL TWELVE primaries are implemented (the milestone plan overrides V1.2's
 * launch trim to 6 — the founder wants the full system; M5/UI can fold-in for
 * display later). Every user lands in exactly one. The engine scores each
 * archetype from the trait/outcome signature, picks the argmax as `primary`,
 * and the strongest secondary trait as `modifier`.
 */

import type {
  ArchetypeKey,
  DnaArchetype,
  DnaOutcomes,
  DnaPick,
  DnaTraits,
  TraitKey,
} from './types';
import { TRAIT_KEYS } from './types';
import { isLuxeFrag, isWarmFrag, weightedFraction } from './metrics';

interface Signals {
  t: Record<TraitKey, number>;
  o: DnaOutcomes;
  /** weighted fraction of picks that are floral. */
  floralFrac: number;
  /** weighted fraction of picks that are fresh/citrus/aquatic. */
  freshFrac: number;
  /** weighted fraction of picks that are luxe (oud/amber/leather). */
  luxeFrac: number;
}

// ↓ helper: CENTER a [0,1] signal on its neutral midpoint, so only a user's
// DEVIATION from neutral feeds the score. Null traits center to 0 (no signal).
// Without centering, signals that sit high for almost everyone (versatility /
// compliment / office-safe all average ~0.65, plus the recognizable-bottle
// picker biasing the popular/compliment traits upward) stack into a handful of
// scorers and collapse every user onto the same archetype (the "everyone is a
// crowd-pleaser" bug).
const v = (n: number | null): number => (n == null ? 0 : n - 0.5);
// "low" reading of an already-centered signal — just the negation.
const lo = (n: number): number => -n;

/**
 * Ordered so ties resolve deterministically (earlier wins). Each scorer is a
 * weighted sum of the archetype's signature from the A3.1 table.
 *
 * All inputs are CENTERED on 0 (see `v` and `buildSignals`): a perfectly neutral
 * user scores 0 everywhere and resolves to the first scorer by stable order;
 * real spread comes entirely from how each user deviates from neutral. The
 * trait-vs-pool relative scoring (see deriveTraits) sharpens those deviations.
 * We deliberately do NOT normalize the sums to means: doing so lets the
 * the_signature_wearer term swamp every small wardrobe, just trading one
 * degenerate winner for another.
 */
const SCORERS: { key: ArchetypeKey; score: (s: Signals) => number }[] = [
  {
    key: 'the_executive',
    // officeSafe↑ luxury↑ expressive↓ · woody/fresh
    score: (s) => s.o.officeSafe + s.t.luxury + lo(s.t.expressive) + 0.5 * s.freshFrac,
  },
  {
    key: 'the_seducer',
    // dateNight↑ expressive↑ complimentSeeking↑ · amber/oriental
    score: (s) => s.o.dateNight + s.t.expressive + s.t.complimentSeeking + 0.5 * s.luxeFrac,
  },
  {
    key: 'the_crowd_pleaser',
    // complimentSeeking↑ versatile↑ adventurous↓ · sweet/fresh
    score: (s) => s.t.complimentSeeking + s.o.versatile + lo(s.t.adventurous) + 0.5 * s.freshFrac,
  },
  {
    key: 'the_connoisseur',
    // collector↑ luxury↑ adventurous↑ · niche
    score: (s) => s.t.collector + s.t.luxury + s.t.adventurous + 0.5 * s.luxeFrac,
  },
  {
    key: 'the_signature_wearer',
    // signature↑ collector↓ (kept modest so it doesn't swamp every tight pick)
    score: (s) => 1.2 * s.o.signature + 0.4 * lo(s.t.collector),
  },
  {
    key: 'the_purist',
    // expressive↓ smellsLuxe↓ · musk/skin/clean
    score: (s) => lo(s.t.expressive) + lo(s.o.smellsLuxe) + 0.5 * lo(s.luxeFrac),
  },
  {
    key: 'the_showstopper',
    // expressive↑ projection(→expressive)↑ · gourmand/amber
    score: (s) => 1.5 * s.t.expressive + s.o.dateNight + 0.5 * s.luxeFrac,
  },
  {
    key: 'the_smart_shopper',
    // valueHunter↑ dupe-affinity(→valueHunter)↑
    score: (s) => 2 * s.t.valueHunter,
  },
  {
    key: 'the_romantic',
    // floral↑ intimate · soft femme/unisex lean
    score: (s) => 1.5 * s.floralFrac + lo(s.t.expressive) * 0.5 + s.t.complimentSeeking * 0.5,
  },
  {
    key: 'the_explorer',
    // adventurous↑ collector↑ · wide family spread
    score: (s) => s.t.adventurous + s.t.collector,
  },
  {
    key: 'the_classicist',
    // luxury↑ adventurous↓ · heritage icons
    score: (s) => s.t.luxury + lo(s.t.adventurous),
  },
  {
    key: 'the_rebel',
    // adventurous↑ officeSafe↓ expressive↑ · smoky/animalic/divisive
    score: (s) => s.t.adventurous + lo(s.o.officeSafe) + s.t.expressive,
  },
];

const FLORAL = ['floral', 'white floral', 'rose', 'jasmine'];

// center a raw [0,1] signal (fraction or outcome) on its neutral midpoint.
const cen = (n: number): number => n - 0.5;

function buildSignals(traits: DnaTraits, outcomes: DnaOutcomes, picks: DnaPick[]): Signals {
  const t = {} as Record<TraitKey, number>;
  for (const k of TRAIT_KEYS) t[k] = v(traits.values[k]);
  const lc = (s: string) => s.toLowerCase();
  const floralFrac = cen(weightedFraction(picks, (f) =>
    FLORAL.includes(lc(f.fragrance_family)) || f.top_accords.some((a) => FLORAL.includes(lc(a))),
  ));
  const freshFrac = cen(weightedFraction(picks, isWarmFrag));
  const luxeFrac = cen(weightedFraction(picks, isLuxeFrag));
  // outcomes are raw [0,1] reads of catalog columns → center them too, so an
  // always-high column (e.g. versatility ~0.65) contributes ~0, not a free boost.
  const o = {
    compliments: cen(outcomes.compliments),
    officeSafe: cen(outcomes.officeSafe),
    smellsLuxe: cen(outcomes.smellsLuxe),
    versatile: cen(outcomes.versatile),
    dateNight: cen(outcomes.dateNight),
    signature: cen(outcomes.signature),
  };
  return { t, o, floralFrac, freshFrac, luxeFrac };
}

export interface ArchetypeScore {
  key: ArchetypeKey;
  score: number;
}

/**
 * Score every archetype and return them sorted strongest-first. The sort is
 * STABLE on ties (preserves SCORERS order), so `rankArchetypes(...)[0].key`
 * equals the legacy argmax (which kept the earliest scorer on a tie) — this is
 * what makes the living-archetype layer a no-regression change. The runner-up
 * (`[1]`) feeds the §6.6 lean/swap mechanic.
 */
export function rankArchetypes(
  traits: DnaTraits,
  outcomes: DnaOutcomes,
  picks: DnaPick[],
): ArchetypeScore[] {
  const s = buildSignals(traits, outcomes, picks);
  return SCORERS.map(({ key, score }, i) => ({ key, score: score(s), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ key, score }) => ({ key, score }));
}

export function deriveArchetype(
  traits: DnaTraits,
  outcomes: DnaOutcomes,
  picks: DnaPick[],
): DnaArchetype {
  const ranked = rankArchetypes(traits, outcomes, picks);
  return { primary: ranked[0].key, modifier: dominantSecondaryTrait(traits) };
}

/** snake_case key of the second-strongest trait → the `modifier` (V1.1 A1 example). */
function dominantSecondaryTrait(traits: DnaTraits): string | null {
  const ranked = TRAIT_KEYS.map((k) => ({ k, val: traits.values[k] ?? 0 }))
    .sort((a, b) => b.val - a.val);
  if (ranked.length < 2 || ranked[1].val <= 0) return null;
  return toSnake(ranked[1].k);
}

function toSnake(k: TraitKey): string {
  return k.replace(/([A-Z])/g, '_$1').toLowerCase();
}
