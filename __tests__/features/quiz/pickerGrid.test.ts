/**
 * Picker grid + recognizability unit tests (DNA spec Part 6).
 * Single file: jest treats every `__tests__/*.ts` as a suite, so fixtures live
 * inline here alongside the cases that use them.
 */
import {
  resolvePopularityTier,
  isPickerEligible,
  DEFAULT_POPULARITY_TIER,
} from '@/src/features/quiz/popularity';
import {
  buildPickerGrid,
  buildPickerList,
  PICKER_GRID_SIZE,
  type PickerCandidate,
} from '@/src/features/quiz/pickerGrid';
import { MOCK_CATALOG } from '@/src/mock/fragrances';

// ── factory ────────────────────────────────────────────────────────────────
let n = 0;
function cand(over: Partial<PickerCandidate> = {}): PickerCandidate {
  n += 1;
  return {
    id: `c${n}`,
    brand: 'Generic House',
    name: `Frag ${n}`,
    image_url: 'https://img/x.jpg',
    fragrance_family: 'floral',
    gender: 'unisex',
    top_accords: ['woody'],
    community_projection: 3,
    compliment_score: 0.5,
    popularity_tier: 5,
    ...over,
  };
}

// ── popularity resolver ──────────────────────────────────────────────────────
describe('resolvePopularityTier', () => {
  it('prefers an explicit popularity_tier column', () => {
    expect(resolvePopularityTier(cand({ popularity_tier: 4 }))).toBe(4);
  });

  it('matches the seed list by brand + name when no column present', () => {
    expect(
      resolvePopularityTier({
        brand: 'Chanel',
        name: 'Bleu de Chanel Eau de Parfum',
        image_url: 'x',
        top_accords: ['woody'],
      }),
    ).toBe(5);
  });

  it('matches via concentration-stripped whole-token prefix', () => {
    expect(
      resolvePopularityTier({
        brand: 'Creed',
        name: 'Aventus 10th Anniversary',
        image_url: 'x',
        top_accords: ['fruity'],
      }),
    ).toBe(5);
  });

  it('defaults unmatched rows to tier 2 (catalog-only)', () => {
    expect(
      resolvePopularityTier({
        brand: 'Sucreabeille',
        name: 'Some Deep Cut',
        image_url: 'x',
        top_accords: ['gourmand'],
      }),
    ).toBe(DEFAULT_POPULARITY_TIER);
  });
});

describe('isPickerEligible', () => {
  it('rejects a tile with no image (recognition is the point)', () => {
    expect(isPickerEligible(cand({ image_url: '', popularity_tier: 5 }))).toBe(false);
  });
  it('rejects a tile with no accord data (nothing to aggregate)', () => {
    expect(isPickerEligible(cand({ top_accords: [], popularity_tier: 5 }))).toBe(false);
  });
  it('rejects an obscure tier-2 bottle even with image + accords', () => {
    expect(isPickerEligible(cand({ popularity_tier: 2 }))).toBe(false);
  });
  it('accepts a recognizable, imaged, accord-bearing tile', () => {
    expect(isPickerEligible(cand({ popularity_tier: 4 }))).toBe(true);
  });
});

// ── grid build ───────────────────────────────────────────────────────────────
function bigPool(count: number): PickerCandidate[] {
  const fams = ['floral', 'woody', 'amber', 'fresh'];
  const genders: PickerCandidate['gender'][] = ['feminine', 'masculine', 'unisex'];
  const out: PickerCandidate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      cand({
        id: `p${i}`,
        brand: `House ${i % 8}`,
        fragrance_family: fams[i % fams.length],
        gender: genders[i % genders.length],
        community_projection: (i % 5) + 0.5,
        popularity_tier: 4 + (i % 2), // 4 or 5
      }),
    );
  }
  return out;
}

describe('buildPickerGrid', () => {
  it('returns exactly 12 tiles from a large recognizable pool', () => {
    expect(buildPickerGrid(bigPool(60))).toHaveLength(PICKER_GRID_SIZE);
  });

  it('only includes tier >= 4 tiles for grid 1', () => {
    const pool = [...bigPool(40), cand({ id: 't3', popularity_tier: 3 })];
    const grid = buildPickerGrid(pool);
    expect(grid.every((c) => resolvePopularityTier(c) >= 4)).toBe(true);
    expect(grid.find((c) => c.id === 't3')).toBeUndefined();
  });

  it('excludes ineligible (imageless / accordless) tiles', () => {
    const pool = [
      ...bigPool(20),
      cand({ id: 'noimg', image_url: '', popularity_tier: 5 }),
      cand({ id: 'noacc', top_accords: [], popularity_tier: 5 }),
    ];
    const grid = buildPickerGrid(pool);
    expect(grid.find((c) => c.id === 'noimg' || c.id === 'noacc')).toBeUndefined();
  });

  it('is deterministic for a given pool + seed', () => {
    const pool = bigPool(50);
    const a = buildPickerGrid(pool, { rngSeed: 7 }).map((c) => c.id);
    const b = buildPickerGrid(pool, { rngSeed: 7 }).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('spreads coverage cells before doubling up', () => {
    // 12 distinct family×gender×projection cells available exactly once each.
    const pool = bigPool(60);
    const grid = buildPickerGrid(pool);
    const cells = new Set(
      grid.map((c) => `${c.fragrance_family}|${c.gender}|${Math.round(c.community_projection)}`),
    );
    // Greedy spread should touch many distinct cells, not pile into one.
    expect(cells.size).toBeGreaterThanOrEqual(8);
  });

  it('handles a pool smaller than the grid without crashing', () => {
    const grid = buildPickerGrid(bigPool(5));
    expect(grid).toHaveLength(5);
  });

  it('returns empty when nothing is recognizable', () => {
    const pool = [cand({ popularity_tier: 1 }), cand({ popularity_tier: 2 })];
    expect(buildPickerGrid(pool)).toHaveLength(0);
  });
});

// ── full lazy-scroll list ────────────────────────────────────────────────────
describe('buildPickerList', () => {
  it('returns the whole recognizable pool, not just one grid', () => {
    const list = buildPickerList(bigPool(60));
    expect(list.length).toBe(60);
    expect(list.length).toBeGreaterThan(PICKER_GRID_SIZE);
  });

  it('includes tier-3 bottles (floor is 3, not grid-1\'s 4)', () => {
    const list = buildPickerList([...bigPool(20), cand({ id: 't3', popularity_tier: 3 })]);
    expect(list.find((c) => c.id === 't3')).toBeDefined();
  });

  it('excludes obscure (tier <= 2) and ineligible tiles', () => {
    const list = buildPickerList([
      ...bigPool(20),
      cand({ id: 'lo', popularity_tier: 2 }),
      cand({ id: 'noimg', image_url: '', popularity_tier: 5 }),
    ]);
    expect(list.find((c) => c.id === 'lo' || c.id === 'noimg')).toBeUndefined();
  });

  it('leads with the most famous bottle', () => {
    const list = buildPickerList([
      ...bigPool(20),
      cand({ id: 'fame', popularity_tier: 5, compliment_score: 1 }),
    ]);
    expect(resolvePopularityTier(list[0])).toBe(5);
  });
});

// ── real-catalog integration: the sim reads MOCK_CATALOG ─────────────────────
describe('MOCK_CATALOG picker integration', () => {
  const pool = MOCK_CATALOG as unknown as PickerCandidate[];

  it('produces a full 12-tile grid 1 of recognizable, imaged, accord-bearing bottles', () => {
    const grid = buildPickerGrid(pool);
    expect(grid).toHaveLength(PICKER_GRID_SIZE);
    expect(grid.every((c) => resolvePopularityTier(c) >= 4)).toBe(true);
    expect(grid.every((c) => !!c.image_url && c.top_accords.length > 0)).toBe(true);
  });

  it('builds a full lazy-scroll list larger than one grid, leading famous', () => {
    const list = buildPickerList(pool);
    expect(list.length).toBeGreaterThan(PICKER_GRID_SIZE);
    expect(list.every((c) => !!c.image_url && c.top_accords.length > 0)).toBe(true);
    expect(resolvePopularityTier(list[0])).toBeGreaterThanOrEqual(4);
  });
});
