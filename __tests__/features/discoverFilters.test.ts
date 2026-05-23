import { filtersActive, EMPTY_FILTERS, DiscoverFilters } from '@/src/components/sheets/DiscoverFilterSheet';

describe('filtersActive()', () => {
  it('returns false for EMPTY_FILTERS', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
  });

  it('returns true when families array is non-empty', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, families: ['Floral'] };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns true when accords array is non-empty', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, accords: ['rose'] };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns true when priceTiers is non-empty', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, priceTiers: [3] };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns true when longevityMin is set', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, longevityMin: 6 };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns true when sillageMin is set', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, sillageMin: 4 };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns false when all fields are cleared', () => {
    const filters: DiscoverFilters = {
      families: [],
      accords: [],
      priceTiers: [],
      longevityMin: null,
      sillageMin: null,
    };
    expect(filtersActive(filters)).toBe(false);
  });

  it('returns true with multiple active fields', () => {
    const filters: DiscoverFilters = {
      families: ['Woody', 'Oriental'],
      accords: ['oud'],
      priceTiers: [4, 5],
      longevityMin: 7,
      sillageMin: null,
    };
    expect(filtersActive(filters)).toBe(true);
  });
});
