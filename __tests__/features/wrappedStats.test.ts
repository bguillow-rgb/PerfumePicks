import {
  computeWrappedStats,
  seasonForMonth,
  topKey,
} from '@/src/features/wrapped/wrappedStats';
import type { WearLog } from '@/src/stores/useWearLogStore';
import type { WardrobeItem } from '@/src/stores/useWardrobeStore';

// M3b — Perfume Wrapped. Pure stat math over a rolling trailing-12-months
// window. `now` is injected for deterministic windows.

const NOW = new Date('2026-06-07T12:00:00Z');

function log(fragrance_id: string, worn_on: string, extra: Partial<WearLog> = {}): WearLog {
  return {
    id: `${fragrance_id}-${worn_on}`,
    fragrance_id,
    worn_on,
    created_at: `${worn_on}T00:00:00Z`,
    ...extra,
  };
}

function have(fragrance_id: string): WardrobeItem {
  return {
    id: `w-${fragrance_id}`,
    fragrance_id,
    status: 'have',
    unit_type: 'bottle',
    size_ml: 50,
    remaining_ml: 50,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as WardrobeItem;
}

describe('seasonForMonth()', () => {
  it('maps months to meteorological seasons (0-indexed)', () => {
    expect(seasonForMonth(0)).toBe('Winter');  // Jan
    expect(seasonForMonth(1)).toBe('Winter');  // Feb
    expect(seasonForMonth(11)).toBe('Winter'); // Dec
    expect(seasonForMonth(2)).toBe('Spring');  // Mar
    expect(seasonForMonth(4)).toBe('Spring');  // May
    expect(seasonForMonth(5)).toBe('Summer');  // Jun
    expect(seasonForMonth(7)).toBe('Summer');  // Aug
    expect(seasonForMonth(8)).toBe('Fall');    // Sep
    expect(seasonForMonth(10)).toBe('Fall');   // Nov
  });
});

describe('topKey()', () => {
  it('returns the highest-count key', () => {
    expect(topKey({ a: 1, b: 5, c: 3 })).toBe('b');
  });
  it('returns null for an empty map', () => {
    expect(topKey({})).toBeNull();
  });
  it('returns null when all counts are zero', () => {
    expect(topKey({ a: 0, b: 0 })).toBeNull();
  });
  it('keeps the first key on a tie', () => {
    expect(topKey({ a: 2, b: 2 })).toBe('a');
  });
});

describe('computeWrappedStats()', () => {
  const noBrand = () => undefined;

  it('returns zeroed stats for an empty log', () => {
    const s = computeWrappedStats([], [], noBrand, NOW);
    expect(s.totalWears).toBe(0);
    expect(s.uniqueFragrances).toBe(0);
    expect(s.topFragranceId).toBeNull();
    expect(s.topFragranceCount).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.pctCollectionWorn).toBeNull();
    expect(s.seasonal).toEqual({ Winter: 0, Spring: 0, Summer: 0, Fall: 0 });
  });

  it('excludes wears older than the trailing 12 months', () => {
    const logs = [
      log('a', '2026-05-01'), // in window
      log('a', '2024-01-01'), // way out of window
      log('b', '2025-06-08'), // exactly one day inside the cutoff
      log('c', '2025-06-06'), // one day before the cutoff (2025-06-07) → excluded
    ];
    const s = computeWrappedStats(logs, [], noBrand, NOW);
    expect(s.totalWears).toBe(2);
    expect(s.uniqueFragrances).toBe(2); // a and b
  });

  it('counts the top fragrance and its wear count', () => {
    const logs = [
      log('a', '2026-01-01'),
      log('a', '2026-01-02'),
      log('a', '2026-01-03'),
      log('b', '2026-02-01'),
    ];
    const s = computeWrappedStats(logs, [], noBrand, NOW);
    expect(s.topFragranceId).toBe('a');
    expect(s.topFragranceCount).toBe(3);
    expect(s.totalWears).toBe(4);
    expect(s.uniqueFragrances).toBe(2);
  });

  it('resolves the most-worn brand via getBrand', () => {
    const brandOf = (id: string) => (id === 'a' ? 'Dior' : 'Chanel');
    const logs = [
      log('a', '2026-01-01'),
      log('a', '2026-01-02'),
      log('b', '2026-01-03'),
    ];
    const s = computeWrappedStats(logs, [], brandOf, NOW);
    expect(s.topBrand).toBe('Dior');
  });

  it('picks the top occasion', () => {
    const logs = [
      log('a', '2026-01-01', { occasion: 'office' }),
      log('a', '2026-01-02', { occasion: 'office' }),
      log('b', '2026-01-03', { occasion: 'date' }),
    ];
    const s = computeWrappedStats(logs, [], () => undefined, NOW);
    expect(s.topOccasion).toBe('office');
  });

  it('buckets wears by season', () => {
    const logs = [
      log('a', '2026-01-15'), // Winter
      log('a', '2026-04-15'), // Spring
      log('a', '2026-06-15'), // Summer
      log('a', '2025-09-15'), // Fall (within window)
      log('a', '2025-12-15'), // Winter (within window)
    ];
    const s = computeWrappedStats(logs, [], () => undefined, NOW);
    expect(s.seasonal.Winter).toBe(2);
    expect(s.seasonal.Spring).toBe(1);
    expect(s.seasonal.Summer).toBe(1);
    expect(s.seasonal.Fall).toBe(1);
  });

  it('computes the longest consecutive-day streak', () => {
    const logs = [
      log('a', '2026-03-01'),
      log('a', '2026-03-02'),
      log('a', '2026-03-03'), // 3-day run
      log('b', '2026-03-10'), // gap
      log('b', '2026-03-11'), // 2-day run
    ];
    const s = computeWrappedStats(logs, [], () => undefined, NOW);
    expect(s.longestStreak).toBe(3);
  });

  it('treats multiple wears on the same day as one streak day', () => {
    const logs = [
      log('a', '2026-03-01'),
      log('b', '2026-03-01'),
      log('c', '2026-03-01'),
    ];
    const s = computeWrappedStats(logs, [], () => undefined, NOW);
    expect(s.longestStreak).toBe(1);
    expect(s.totalWears).toBe(3);
  });

  it('computes % of the "have" collection worn', () => {
    const wardrobe = [have('a'), have('b'), have('c'), have('d')];
    const logs = [log('a', '2026-05-01'), log('b', '2026-05-02')];
    const s = computeWrappedStats(logs, wardrobe, () => undefined, NOW);
    expect(s.pctCollectionWorn).toBe(50); // 2 of 4 have-items worn
  });

  it('ignores non-have wardrobe items in the collection %', () => {
    const wardrobe = [
      have('a'),
      { ...have('b'), status: 'want' } as WardrobeItem,
    ];
    const logs = [log('a', '2026-05-01')];
    const s = computeWrappedStats(logs, wardrobe, () => undefined, NOW);
    expect(s.pctCollectionWorn).toBe(100); // 1 of 1 have-items worn
  });

  it('returns null collection % when no have-items exist', () => {
    const logs = [log('a', '2026-05-01')];
    const s = computeWrappedStats(logs, [], () => undefined, NOW);
    expect(s.pctCollectionWorn).toBeNull();
  });
});
