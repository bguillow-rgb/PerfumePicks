import { filtersActive, EMPTY_FILTERS, DiscoverFilters } from '@/src/components/sheets/DiscoverFilterSheet';

describe('filtersActive()', () => {
  it('returns false for EMPTY_FILTERS', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
  });

  it('returns true when genders array is non-empty', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, genders: ['feminine'] };
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

  it('returns true when yearMin is set', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, yearMin: 2010 };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns true when yearMax is set', () => {
    const filters: DiscoverFilters = { ...EMPTY_FILTERS, yearMax: 2020 };
    expect(filtersActive(filters)).toBe(true);
  });

  it('returns false when all fields are cleared', () => {
    const filters: DiscoverFilters = {
      genders: [],
      accords: [],
      priceTiers: [],
      yearMin: null,
      yearMax: null,
    };
    expect(filtersActive(filters)).toBe(false);
  });

  it('returns true with multiple active fields', () => {
    const filters: DiscoverFilters = {
      genders: ['unisex', 'feminine'],
      accords: ['oud'],
      priceTiers: [4, 5],
      yearMin: 2010,
      yearMax: 2020,
    };
    expect(filtersActive(filters)).toBe(true);
  });
});
