/**
 * Wardrobe-slot assignment + gap analysis (V1.2 B2/B3).
 *
 * The six canonical "roles" a complete collection fills. Slot membership is
 * derived from columns the catalog already has. The diagnosis reads the user's
 * OWNED wardrobe against the six slots → names empty slots as the gap and a
 * 0..1 completion score. Thin at onboarding, compounds as the user logs wears.
 */

import type {
  DnaCatalogFragrance,
  DnaWardrobe,
  WardrobeSlot,
} from './types';
import { WARDROBE_SLOTS } from './types';
import { isColdFrag, isEveningFrag, isWarmFrag } from './metrics';

/** Which slots a single fragrance can fill (a frag can fill more than one). */
export function assignSlots(f: DnaCatalogFragrance): WardrobeSlot[] {
  const slots: WardrobeSlot[] = [];

  // Signature: high-versatility, high-wear everyday "you" scent.
  if (f.versatility_score >= 0.6) slots.push('signature');

  // Office / daily: safe, close-projecting.
  if (f.office_safe_score >= 0.6) slots.push('office');

  // Date / evening: seductive, projecting, after-dark.
  if (isEveningFrag(f) && f.community_projection >= 3) slots.push('date');

  // Warm-weather: summer / fresh / citrus / aquatic.
  if (isWarmFrag(f)) slots.push('warm');

  // Cold-weather: gourmand / amber / spicy / cozy.
  if (isColdFrag(f)) slots.push('cold');

  // Formal / special: refined, elevated, low-loud.
  if (f.price_tier >= 4 && f.community_projection <= 3) slots.push('formal');

  return slots;
}

/**
 * Importance order for the "biggest gap" — the highest-value empty slot drives
 * the "complete your collection" sell. A versatile signature + a date scent are
 * the slots people most feel the lack of.
 */
const GAP_PRIORITY: readonly WardrobeSlot[] = [
  'signature',
  'date',
  'office',
  'cold',
  'warm',
  'formal',
];

/** Derive the wardrobe block from the user's OWNED fragrances. */
export function deriveWardrobe(owned: DnaCatalogFragrance[]): DnaWardrobe {
  const slots: Record<WardrobeSlot, boolean> = {
    signature: false,
    office: false,
    date: false,
    warm: false,
    cold: false,
    formal: false,
  };

  for (const f of owned) {
    for (const slot of assignSlots(f)) slots[slot] = true;
  }

  const filled = WARDROBE_SLOTS.filter((s) => slots[s]).length;
  const completion = filled / WARDROBE_SLOTS.length;
  const biggestGap = GAP_PRIORITY.find((s) => !slots[s]) ?? null;

  return { slots, completion, biggestGap };
}
