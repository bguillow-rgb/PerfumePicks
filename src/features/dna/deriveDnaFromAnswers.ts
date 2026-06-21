/**
 * deriveDnaFromAnswers() — the S1b non-recognizer path.
 *
 * Users who tap "I'm new to fragrance" (or who hit the kill-switch fallback)
 * never recognize a tile, so we can't seed the DNA from picks. Instead we reuse
 * the cold-start SEED_QUESTIONS answers (family / occasion / price) to choose a
 * small set of representative eligible fragrances, treat them as synthetic
 * "want" seeds, and run them through the SAME `deriveFragranceDNA` orchestrator.
 *
 * Why route through the same orchestrator: the milestone plan (M5) requires the
 * question path to emit the **identical v2 envelope** as the picker path — same
 * shape, same archetype/trait/journey derivation — so every downstream surface
 * (reveal, My-DNA home, recs) is path-agnostic. Only the provenance differs:
 * `source: 'question_fallback'`, and the price answer is applied as an explicit
 * (hard) budget ceiling the way a real budget question should.
 */

import type { DnaCatalogFragrance, DnaPick } from './types';
import { deriveFragranceDNA, type DeriveDnaResult } from './deriveDna';

export interface SeedAnswers {
  family?: string;
  occasion?: string;
  price?: string;
}

/** Family answer id → catalog `fragrance_family` substrings that satisfy it. */
const FAMILY_KEYWORDS: Record<string, string[]> = {
  floral: ['floral', 'flower', 'rose', 'white floral'],
  oriental: ['oriental', 'amber', 'spicy', 'resin'],
  woody: ['wood', 'chypre', 'mossy', 'vetiver'],
  fresh: ['fresh', 'citrus', 'aromatic', 'aquatic', 'green', 'marine', 'fougere', 'fougère'],
  gourmand: ['gourmand', 'sweet', 'vanilla'],
};

/** Hard budget ceiling (in cents) implied by each price bracket; tier 4 = niche, no ceiling. */
const PRICE_BRACKET: Record<string, { targetTier: number; ceilingCents: number | null }> = {
  '1': { targetTier: 1, ceilingCents: 5000 },
  '2': { targetTier: 2, ceilingCents: 12000 },
  '3': { targetTier: 3, ceilingCents: 25000 },
  '4': { targetTier: 4, ceilingCents: null },
};

/** How many representative seeds to synthesize from the chosen family. */
const SEED_COUNT = 4;

const lc = (s: string) => s.toLowerCase().trim();

function popularity(f: DnaCatalogFragrance): number {
  // Recognizability first, then broadly-loved community signal as a tie-break.
  return (f.popularity_tier ?? 0) * 100 + (f.compliment_score ?? 0) + (f.versatility_score ?? 0);
}

/** Choose the representative seed fragrances for a family answer. */
function chooseSeeds(pool: DnaCatalogFragrance[], family?: string): DnaCatalogFragrance[] {
  const keywords = family ? FAMILY_KEYWORDS[family] : undefined;
  const matching = keywords
    ? pool.filter((f) => {
        const fam = lc(f.fragrance_family ?? '');
        return keywords.some((k) => fam.includes(k));
      })
    : [];

  // Fall back to the most recognizable bottles overall when the family yields
  // nothing (keeps the envelope real — never an empty-pick fallback DNA).
  const ranked = (matching.length ? matching : pool)
    .slice()
    .sort((a, b) => popularity(b) - popularity(a));

  return ranked.slice(0, SEED_COUNT);
}

export function deriveDnaFromAnswers(
  answers: SeedAnswers,
  pool: DnaCatalogFragrance[],
  opts?: { now?: () => string },
): DeriveDnaResult {
  const seeds = chooseSeeds(pool, answers.family);

  const picks: DnaPick[] = seeds.map((f, i) => ({
    fragrance: f,
    relation: 'want',
    favorite: i === 0,
  }));

  const result = deriveFragranceDNA({
    picks,
    referencePool: pool,
    answeredCount: 3,
    source: 'question_fallback',
    now: opts?.now,
  });

  // The budget question is an EXPLICIT answer → it sets a hard ceiling + target
  // tier (picks alone never set a ceiling; aggregate keeps ceilingCents null).
  const bracket = answers.price ? PRICE_BRACKET[answers.price] : undefined;
  if (bracket) {
    result.dna.price = {
      targetTier: bracket.targetTier,
      ceilingCents: bracket.ceilingCents,
    };
  }

  return result;
}
