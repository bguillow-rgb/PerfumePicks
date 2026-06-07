/**
 * Quick-take review helpers (PRD §7.7 / M3c).
 *
 * Pure, side-effect-free so the float-to-top ordering stays unit-testable.
 * A "quick take" is a pithy one-liner ("smells like warm vanilla & smoke")
 * and/or a set of one-tap descriptor tags. Reviews carrying a quick take are
 * surfaced above plain star-only reviews; ordering WITHIN each group is left
 * untouched (callers pre-sort by helpful_count).
 */

/** One-tap descriptors — "just say what it smells like." */
export const QUICK_TAGS = [
  'Compliment magnet',
  'Office-safe',
  'Smells expensive',
  'Too strong',
  'Long-lasting',
  'Short-lived',
  'Versatile',
  'Unique',
] as const;

/** Minimal shape needed to rank — any review with these fields qualifies. */
export interface QuickTakeLike {
  quick_take?: string | null;
  tags?: string[] | null;
}

/** True when a review has a quick-take line or at least one tag. */
export function hasQuickTake(r: QuickTakeLike): boolean {
  return !!(r.quick_take || (r.tags && r.tags.length > 0));
}

/**
 * Stable sort that floats quick-take reviews above plain ones, preserving the
 * caller's existing order within each group (e.g. helpful_count desc).
 */
export function sortReviewsByQuickTake<T extends QuickTakeLike>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(hasQuickTake(b)) - Number(hasQuickTake(a)));
}
