/**
 * Shared accord taxonomy used by:
 *   - Discover screen "By Accord" grid
 *   - Recommendation scoring (contextMatch seasonal weights)
 */

/** The 8 accords shown in the Discover grid. */
export const DISCOVER_ACCORDS = [
  'amber', 'rose', 'oud', 'vanilla', 'iris', 'leather', 'fruity', 'gourmand',
] as const;

export type DiscoverAccord = (typeof DISCOVER_ACCORDS)[number];

/** Per-season accord affinities used in the recommendation engine. */
export const SEASONAL_ACCORDS: Record<string, string[]> = {
  summer: ['fresh', 'citrus', 'aquatic', 'green', 'floral'],
  spring: ['floral', 'green', 'citrus', 'rose', 'powdery'],
  fall:   ['woody', 'spicy', 'warm-spicy', 'amber', 'tobacco'],
  winter: ['amber', 'vanilla', 'oud', 'sweet', 'woody', 'warm-spicy', 'gourmand'],
};
