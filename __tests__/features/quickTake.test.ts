import {
  hasQuickTake,
  sortReviewsByQuickTake,
  QUICK_TAGS,
} from '@/src/features/reviews/quickTake';

// M3c — Quick-take reviews (PRD §7.7). Reviews with a "smells like" line or
// tags float above plain reviews; order within each group is preserved.

describe('hasQuickTake()', () => {
  it('is true when quick_take is a non-empty string', () => {
    expect(hasQuickTake({ quick_take: 'warm vanilla & smoke' })).toBe(true);
  });

  it('is true when tags is a non-empty array', () => {
    expect(hasQuickTake({ tags: ['Office-safe'] })).toBe(true);
  });

  it('is false when quick_take is empty/null and no tags', () => {
    expect(hasQuickTake({ quick_take: '', tags: [] })).toBe(false);
    expect(hasQuickTake({ quick_take: null, tags: null })).toBe(false);
    expect(hasQuickTake({})).toBe(false);
  });
});

describe('sortReviewsByQuickTake()', () => {
  it('floats quick-take reviews above plain ones', () => {
    const rows = [
      { id: 'plain1' },
      { id: 'take1', quick_take: 'fresh citrus' },
      { id: 'plain2' },
      { id: 'tagged1', tags: ['Unique'] },
    ];
    const sorted = sortReviewsByQuickTake(rows);
    const ids = sorted.map((r) => r.id);
    // The two with takes come first (in original relative order), plains last.
    expect(ids.slice(0, 2)).toEqual(['take1', 'tagged1']);
    expect(ids.slice(2)).toEqual(['plain1', 'plain2']);
  });

  it('preserves original order within the quick-take group', () => {
    const rows = [
      { id: 'a', quick_take: 'one', helpful_count: 9 },
      { id: 'b', quick_take: 'two', helpful_count: 3 },
      { id: 'c', quick_take: 'three', helpful_count: 1 },
    ];
    expect(sortReviewsByQuickTake(rows).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves original order within the plain group', () => {
    const rows: { id: string; quick_take?: string | null }[] = [
      { id: 'x' }, { id: 'y' }, { id: 'z' },
    ];
    expect(sortReviewsByQuickTake(rows).map((r) => r.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not mutate the input array', () => {
    const rows = [{ id: 'plain' }, { id: 'take', quick_take: 'hi' }];
    const copy = [...rows];
    sortReviewsByQuickTake(rows);
    expect(rows).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(sortReviewsByQuickTake([])).toEqual([]);
  });
});

describe('QUICK_TAGS', () => {
  it('exposes the one-tap descriptor set', () => {
    expect(QUICK_TAGS).toContain('Compliment magnet');
    expect(QUICK_TAGS).toContain('Office-safe');
    expect(QUICK_TAGS.length).toBeGreaterThan(0);
  });
});
