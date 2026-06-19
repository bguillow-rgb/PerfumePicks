/**
 * Fragrance Journey — the predictive layer (V1.2 B1).
 *
 * A ladder is an ordered taste progression from recognizable entry points to
 * aspirational end-points. At LAUNCH the ladders are EXPERT-AUTHORED, not learned
 * (`source: "editorial"`) — the honest cold-start: there is zero longitudinal
 * user data on day one. The captured pick-stream (V1.1 A8) later trains the
 * learned/cohort version, at which point `source` flips per-ladder to `"cohort"`.
 *
 * This module loads the ladders AS DATA and matches a DNA to its best-fit ladder
 * + stage. The rich editorial CONTENT (copy, real catalog ids) is authored in M8;
 * here the exemplars are representative keys sufficient for the dark logic + tests.
 */

import type { DnaJourney, FragranceDNA } from './types';

interface LadderStage {
  label: string;
  /** Families/accords that characterise this rung (lowercase). */
  signature: string[];
  /** Representative bottles surfaced as "what you'll discover next". */
  exemplars: string[];
}

export interface JourneyLadder {
  id: string;
  title: string;
  stages: LadderStage[];
}

/** ≈8 authored taste-progression ladders (V1.2 B1, illustrative examples). */
export const JOURNEY_LADDERS: readonly JourneyLadder[] = [
  {
    id: 'fresh_to_niche_woody',
    title: 'Fresh → Niche Woody',
    stages: [
      { label: 'Designer crowd-pleasers', signature: ['fresh', 'citrus', 'aquatic'], exemplars: ['Sauvage', 'Bleu de Chanel'] },
      { label: 'Luxury woody fragrances', signature: ['woody', 'fruity', 'smoky'], exemplars: ['Aventus'] },
      { label: 'Modern niche', signature: ['woody', 'incense', 'leather'], exemplars: ['Hacivat'] },
      { label: 'Aspirational niche', signature: ['woody', 'amber', 'oud'], exemplars: ['Imagination', 'Sedley'] },
    ],
  },
  {
    id: 'sweet_to_refined_amber',
    title: 'Sweet → Refined Amber',
    stages: [
      { label: 'Sweet designer gourmands', signature: ['sweet', 'gourmand', 'coffee'], exemplars: ['Black Opium', 'La Vie Est Belle'] },
      { label: 'Polished gourmands', signature: ['gourmand', 'fruity', 'floral'], exemplars: ['Good Girl'] },
      { label: 'Refined amber', signature: ['amber', 'vanilla', 'woody'], exemplars: ['MFK Grand Soir'] },
      { label: 'Niche amber', signature: ['amber', 'oud', 'saffron'], exemplars: ['BR540'] },
    ],
  },
  {
    id: 'clean_to_skin_niche',
    title: 'Clean → Skin Niche',
    stages: [
      { label: 'Clean designer', signature: ['fresh', 'aquatic', 'citrus'], exemplars: ['Light Blue', 'CK One'] },
      { label: 'Soft musky skin', signature: ['musk', 'floral', 'clean'], exemplars: ['Glossier You'] },
      { label: 'Molecular skin scent', signature: ['musk', 'woody'], exemplars: ['Molecule 01'] },
      { label: 'Niche minimalism', signature: ['musk', 'incense', 'woody'], exemplars: ['Le Labo', 'Escentric'] },
    ],
  },
  {
    id: 'designer_masc_to_prestige',
    title: 'Designer Masc → Prestige',
    stages: [
      { label: 'Designer masculines', signature: ['sweet', 'fresh', 'spicy'], exemplars: ['1 Million', 'Eros'] },
      { label: 'Prestige designer', signature: ['woody', 'iris', 'powdery'], exemplars: ['Dior Homme Intense'] },
      { label: 'Premium niche-adjacent', signature: ['woody', 'amber', 'spicy'], exemplars: ['PdM Layton'] },
      { label: 'Niche masculines', signature: ['oud', 'incense', 'leather'], exemplars: ['Nishane', 'Amouage'] },
    ],
  },
  {
    id: 'floral_to_refined_floral',
    title: 'Floral → Refined Floral',
    stages: [
      { label: 'Designer florals', signature: ['floral', 'fruity', 'sweet'], exemplars: ['Flowerbomb', "Daisy"] },
      { label: 'Elegant florals', signature: ['floral', 'powdery', 'musk'], exemplars: ['No.5'] },
      { label: 'Refined white floral', signature: ['white floral', 'jasmine', 'tuberose'], exemplars: ['Carnal Flower'] },
      { label: 'Niche floral', signature: ['floral', 'incense', 'amber'], exemplars: ['Portrait of a Lady'] },
    ],
  },
  {
    id: 'spicy_to_smoky_animalic',
    title: 'Spicy → Smoky / Animalic',
    stages: [
      { label: 'Spicy designer', signature: ['spicy', 'amber', 'woody'], exemplars: ['Spicebomb'] },
      { label: 'Bold orientals', signature: ['amber', 'tobacco', 'spicy'], exemplars: ['Tobacco Vanille'] },
      { label: 'Smoky niche', signature: ['smoky', 'incense', 'leather'], exemplars: ['Black Afgano'] },
      { label: 'Animalic niche', signature: ['animalic', 'oud', 'leather'], exemplars: ['Salome'] },
    ],
  },
  {
    id: 'citrus_to_summer_niche',
    title: 'Citrus → Summer Niche',
    stages: [
      { label: 'Citrus designer', signature: ['citrus', 'fresh', 'aromatic'], exemplars: ['Acqua di Gio'] },
      { label: 'Bright fougère', signature: ['aromatic', 'lavender', 'fresh'], exemplars: ['Boss Bottled'] },
      { label: 'Mediterranean niche', signature: ['citrus', 'neroli', 'woody'], exemplars: ['Neroli Portofino'] },
      { label: 'Niche citrus-woody', signature: ['citrus', 'vetiver', 'woody'], exemplars: ['Colonia'] },
    ],
  },
  {
    id: 'gourmand_to_niche_vanilla',
    title: 'Gourmand → Niche Vanilla',
    stages: [
      { label: 'Sweet gourmands', signature: ['sweet', 'gourmand', 'caramel'], exemplars: ['Pink Sugar'] },
      { label: 'Warm vanilla', signature: ['vanilla', 'amber', 'gourmand'], exemplars: ['Spiritueuse Double Vanille'] },
      { label: 'Refined vanilla', signature: ['vanilla', 'tobacco', 'woody'], exemplars: ['Tihota'] },
      { label: 'Niche vanilla', signature: ['vanilla', 'oud', 'amber'], exemplars: ['Vanille 44'] },
    ],
  },
] as const;

/** Look up an authored ladder by id (for rendering the full Journey view). */
export function getLadderById(id: string | null | undefined): JourneyLadder | null {
  if (!id) return null;
  return JOURNEY_LADDERS.find((l) => l.id === id) ?? null;
}

/** Overlap between a stage signature and the DNA's families+accords (0..N). */
function signatureFit(dna: FragranceDNA, signature: string[]): number {
  let fit = 0;
  for (const term of signature) {
    fit += dna.accords[term] ?? 0;
    fit += dna.families[term] ?? 0;
    // Partial family containment (e.g. "white floral" ↔ "floral").
    for (const fam of Object.keys(dna.families)) {
      if (fam !== term && (fam.includes(term) || term.includes(fam))) {
        fit += 0.5 * dna.families[fam];
      }
    }
  }
  return fit;
}

/** Best-fit ladder by total signature overlap across all rungs. */
function bestLadder(dna: FragranceDNA): JourneyLadder {
  let best = JOURNEY_LADDERS[0];
  let bestFit = -Infinity;
  for (const ladder of JOURNEY_LADDERS) {
    const fit = ladder.stages.reduce((sum, st) => sum + signatureFit(dna, st.signature), 0);
    if (fit > bestFit) {
      bestFit = fit;
      best = ladder;
    }
  }
  return best;
}

/**
 * Place the user on a stage from how "advanced" their DNA reads (luxury +
 * collector + adventurous push them up the ladder). 1-based, clamped to the
 * ladder length. The first non-current rung(s) become `nextLikely`.
 */
export function matchJourney(dna: FragranceDNA): DnaJourney {
  const ladder = bestLadder(dna);
  const t = dna.traits.values;
  const advancement =
    (t.luxury ?? 0.5) * 0.4 + (t.collector ?? 0.5) * 0.35 + (t.adventurous ?? 0.5) * 0.25;

  const n = ladder.stages.length;
  // Map 0..1 advancement onto stages 1..n.
  const stage = Math.max(1, Math.min(n, Math.round(advancement * (n - 1)) + 1));
  const current = ladder.stages[stage - 1];

  const next = ladder.stages[stage] ?? ladder.stages[stage - 1];
  const nextLikely = next.exemplars.slice();

  return {
    ladderId: ladder.id,
    stage,
    stageLabel: current.label,
    nextLikely,
    source: 'editorial',
  };
}
