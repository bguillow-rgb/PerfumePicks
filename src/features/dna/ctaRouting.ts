/**
 * Trait-routed purchase CTA (M6 — the signature monetization, spec PM5 / v1.1 §A6).
 *
 * The first rec + fragrance detail show the SAME bottle with the SAME plain
 * reasons to everyone — the reasons stay monetization-blind. Only the CTA is
 * routed by the user's strongest *buyer* trait:
 *
 *   valueHunter  → Dupe Meter   ("spend less, smell similar")
 *   luxury       → Original      (buy the real thing)
 *   adventurous  → $6 Sample     (lowest-commitment try-before-buy)
 *
 * Pure + UI-free so it can be unit-tested and reused on both surfaces. The
 * routing reads `dna.traits.values`; if no routing trait scored, it defaults to
 * the lowest-commitment Sample (never a dead CTA).
 */

import type { TraitKey, TraitValues } from './types';
import { topTraits } from './revealCopy';

export type DnaCtaKind = 'dupe' | 'original' | 'sample';

export interface DnaCta {
  kind: DnaCtaKind;
  /** Button label. */
  label: string;
  /** One-line supporting hook under the label. */
  sub: string;
}

/**
 * Routing trait → CTA. Only the three *buyer* traits route; the other three
 * (collector/complimentSeeking/expressive) are taste traits and fall through to
 * the next-strongest routing trait, or the Sample default.
 */
const CTA_BY_TRAIT: Partial<Record<TraitKey, DnaCta>> = {
  valueHunter: { kind: 'dupe', label: 'Find the dupe', sub: 'Spend less, smell similar' },
  luxury: { kind: 'original', label: 'Get the original', sub: 'The real thing, no compromise' },
  adventurous: { kind: 'sample', label: 'Try a $6 sample', sub: 'Test it before you commit' },
};

/** The fallback when no routing trait scored — lowest commitment, never a dead CTA. */
export const DEFAULT_DNA_CTA: DnaCta = CTA_BY_TRAIT.adventurous!;

/** Look up the CTA copy for an explicit kind (used when an intent is carried in a route param). */
export function ctaForKind(kind: DnaCtaKind): DnaCta {
  switch (kind) {
    case 'dupe':
      return CTA_BY_TRAIT.valueHunter!;
    case 'original':
      return CTA_BY_TRAIT.luxury!;
    case 'sample':
      return CTA_BY_TRAIT.adventurous!;
  }
}

/**
 * Pick the CTA for a DNA from its trait values. Walks the user's traits
 * strongest-first; the first one that maps to a buyer route wins.
 */
export function routeDnaCta(values: TraitValues): DnaCta {
  for (const t of topTraits(values, 6)) {
    const cta = CTA_BY_TRAIT[t];
    if (cta) return cta;
  }
  return DEFAULT_DNA_CTA;
}
