/**
 * Reveal copy — the human skin over the engine output, authored for M3's THE
 * REVEAL + first-rec surfaces. The M1 engine returns keys (archetype, traits,
 * journey stage); this file turns them into the lines a person actually reads.
 *
 * Kept separate from the engine so copy can be tuned without touching scoring,
 * and so the reveal UI imports ZERO derivation logic.
 */

import type { ArchetypeKey, TraitKey, DnaJourney } from './types';

export interface ArchetypeCopy {
  name: string;
  /** The confident "this is you" line shown under the name. */
  identity: string;
  /**
   * Visual direction — the launch content artifact paired with the copy.
   * `icon` is an Ionicons glyph used as the reveal emblem; `tint` is the
   * archetype's signature hue (emblem ring + accent). Distinct per archetype
   * so the twelve reveals feel individually authored, not templated.
   */
  visual: { icon: string; tint: string };
}

/** All twelve — every user lands in exactly one (engine guarantees argmax). */
export const ARCHETYPE_COPY: Record<ArchetypeKey, ArchetypeCopy> = {
  the_executive: {
    name: 'The Executive',
    identity: 'You wear scent like a well-cut suit. Polished and deliberate, never trying too hard.',
    visual: { icon: 'briefcase', tint: '#2B3A55' },
  },
  the_seducer: {
    name: 'The Seducer',
    identity: 'Your taste runs warm and magnetic. These are the fragrances made to be noticed up close.',
    visual: { icon: 'flame', tint: '#8E2C4E' },
  },
  // LEGACY ONLY — no longer elected by the scorer (see archetype.ts). Kept so DNA
  // already persisted as the_crowd_pleaser still renders until it re-derives.
  the_crowd_pleaser: {
    name: 'The Crowd-Pleaser',
    identity: 'You go for the scents everyone loves. Easy to wear, and always a safe bet.',
    visual: { icon: 'happy', tint: '#D08A3E' },
  },
  the_connoisseur: {
    name: 'The Connoisseur',
    identity: 'You chase the unusual and the refined. Depth over hype, every time.',
    visual: { icon: 'diamond', tint: '#3C6E5B' },
  },
  the_signature_wearer: {
    name: 'The Signature Wearer',
    identity: 'You know what you love and you own it. One scent, unmistakably yours.',
    visual: { icon: 'bookmark', tint: '#5B4B8A' },
  },
  the_purist: {
    name: 'The Purist',
    identity: 'You like it clean and quiet. Skin-close scents that whisper instead of shout.',
    visual: { icon: 'water', tint: '#5E8CA8' },
  },
  the_showstopper: {
    name: 'The Showstopper',
    identity: 'You wear scent loud and proud. Bold and rich, impossible to ignore.',
    visual: { icon: 'sparkles', tint: '#B3742E' },
  },
  the_smart_shopper: {
    name: 'The Smart Shopper',
    identity: 'You love a great scent and a great deal. Quality without the markup.',
    visual: { icon: 'pricetag', tint: '#3E7C59' },
  },
  the_romantic: {
    name: 'The Romantic',
    identity: "You're drawn to soft, pretty florals. Tender and dreamy, heart on your sleeve.",
    visual: { icon: 'flower', tint: '#B95C86' },
  },
  the_explorer: {
    name: 'The Explorer',
    identity: "You're always sampling something new. Variety is the whole point.",
    visual: { icon: 'compass', tint: '#2F7E8C' },
  },
  the_classicist: {
    name: 'The Classicist',
    identity: 'You trust the icons. Timeless and proven, beautifully made.',
    visual: { icon: 'ribbon', tint: '#6B5640' },
  },
  the_rebel: {
    name: 'The Rebel',
    identity: 'You like scents that divide the room. Smoky and daring, unapologetically you.',
    visual: { icon: 'thunderstorm', tint: '#4A4458' },
  },
};

/** Shown in place of the identity line when confidence is low (few/weak signals). */
export const LOW_CONFIDENCE_IDENTITY =
  "Here's a first read on your taste. It sharpens fast as you use the app.";

/** Short chip labels for the six cross-app traits. */
export const TRAIT_CHIP_LABEL: Record<TraitKey, string> = {
  luxury: 'Luxury-led',
  adventurous: 'Adventurous',
  collector: 'Collector',
  valueHunter: 'Value-savvy',
  complimentSeeking: 'Compliment-driven',
  expressive: 'Expressive',
};

/**
 * One forward-looking journey line, cold-start softened ("tend to" — never a
 * promise, since the ladders are editorial on day one). Returns null when no
 * journey could be derived (fallback DNA).
 */
export function journeyLine(journey: DnaJourney | null): string | null {
  if (!journey) return null;
  const next = journey.nextLikely?.[0];
  const stage = journey.stageLabel?.toLowerCase();
  if (!stage) return null;
  if (!next) {
    return `You're settling into ${stage}, a great place to go deeper.`;
  }
  return `You're at ${stage}. People at your stage tend to explore ${next} next.`;
}

/** Cycling micro-teasers shown as compute cover on the "Reading your palate" beat. */
export const READING_TEASERS: readonly string[] = [
  'Reading your palate…',
  'Mapping your accords…',
  'Finding your archetype…',
  'Lining up your first match…',
] as const;

/** The 2–3 strongest derivable traits, snake-free, for the reveal chips. */
export function topTraits(
  values: Record<TraitKey, number | null>,
  count = 3,
): TraitKey[] {
  return (Object.keys(values) as TraitKey[])
    .map((k) => ({ k, v: values[k] }))
    .filter((x): x is { k: TraitKey; v: number } => x.v != null && x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, count)
    .map((x) => x.k);
}
