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

/**
 * Avoid groups for the Scent Preferences layer. Each user-facing group expands
 * to the raw `top_accords` strings the catalog actually carries, so the rec
 * engine can penalise any candidate whose accords intersect an avoided group.
 *
 * Curated to buckets with real DB coverage (counts measured against the live
 * `top_accords` column): sweet 2506, vanilla 1373, gourmand 534, leather 487,
 * oud 290, tobacco 148 — so an avoid selection genuinely filters the catalog
 * rather than acting on sparse/defaulted data.
 */
export const AVOID_GROUPS = [
  { id: 'sweet',   label: 'Sweet',           accords: ['sweet', 'gourmand', 'caramel'] },
  { id: 'vanilla', label: 'Vanilla',         accords: ['vanilla'] },
  { id: 'oud',     label: 'Oud',             accords: ['oud'] },
  { id: 'leather', label: 'Leather',         accords: ['leather'] },
  { id: 'tobacco', label: 'Tobacco',         accords: ['tobacco'] },
  { id: 'smoky',   label: 'Smoke & incense', accords: ['smoky', 'incense'] },
  { id: 'spicy',   label: 'Heavy spice',     accords: ['warm-spicy', 'spicy'] },
  { id: 'aquatic', label: 'Aquatic',         accords: ['aquatic', 'marine', 'ozonic'] },
] as const;

export type AvoidGroupId = (typeof AVOID_GROUPS)[number]['id'];

/** Expand selected avoid-group ids → the flat set of raw accords to penalise. */
export function expandAvoidAccords(groupIds: string[]): string[] {
  const out = new Set<string>();
  for (const g of AVOID_GROUPS) {
    if (groupIds.includes(g.id)) for (const a of g.accords) out.add(a);
  }
  return [...out];
}

/** Per-season accord affinities used in the recommendation engine. */
export const SEASONAL_ACCORDS: Record<string, string[]> = {
  summer: ['fresh', 'citrus', 'aquatic', 'green', 'floral'],
  spring: ['floral', 'green', 'citrus', 'rose', 'powdery'],
  fall:   ['woody', 'spicy', 'warm-spicy', 'amber', 'tobacco'],
  winter: ['amber', 'vanilla', 'oud', 'sweet', 'woody', 'warm-spicy', 'gourmand'],
};
