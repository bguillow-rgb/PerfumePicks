import {
  useCustomFragranceStore,
  isCustomFragranceId,
  CUSTOM_ID_PREFIX,
} from '@/src/stores/useCustomFragranceStore';

// M4a — User-added ("custom") fragrances (PRD §7.8). On-device only; persisted
// so a custom bottle survives a cold start (the bug being fixed).

const expoCrypto = require('expo-crypto');

beforeEach(() => {
  expoCrypto.__resetCounter();
  useCustomFragranceStore.setState({ items: {} });
});

describe('isCustomFragranceId()', () => {
  it('is true for custom-prefixed ids', () => {
    expect(isCustomFragranceId(`${CUSTOM_ID_PREFIX}sauvage-abc123`)).toBe(true);
  });

  it('is false for catalog slugs', () => {
    expect(isCustomFragranceId('dior-sauvage-edp')).toBe(false);
    expect(isCustomFragranceId('')).toBe(false);
  });
});

describe('useCustomFragranceStore', () => {
  describe('add()', () => {
    it('returns a Fragrance with a custom-prefixed id', () => {
      const frag = useCustomFragranceStore.getState().add({ name: 'My Niche Bottle' });
      expect(isCustomFragranceId(frag.id)).toBe(true);
      expect(frag.id.startsWith(CUSTOM_ID_PREFIX)).toBe(true);
    });

    it('slugifies the name into the id', () => {
      const frag = useCustomFragranceStore.getState().add({ name: "Angel's Trumpet!!" });
      // non-alphanumerics collapse to hyphens; trailing/leading stripped
      expect(frag.id).toContain('angel-s-trumpet');
    });

    it('stores the item keyed by its id', () => {
      const frag = useCustomFragranceStore.getState().add({ name: 'Test Scent' });
      expect(useCustomFragranceStore.getState().items[frag.id]).toEqual(frag);
    });

    it('trims name and brand, defaulting brand to Unknown', () => {
      const frag = useCustomFragranceStore.getState().add({ name: '  Spaced Name  ' });
      expect(frag.name).toBe('Spaced Name');
      expect(frag.brand).toBe('Unknown');
    });

    it('uses provided brand/image/concentration/gender/year', () => {
      const frag = useCustomFragranceStore.getState().add({
        name: 'Custom One',
        brand: 'My House',
        image_url: 'file:///photo.jpg',
        concentration: 'parfum',
        gender: 'masculine',
        release_year: 1999,
      });
      expect(frag.brand).toBe('My House');
      expect(frag.image_url).toBe('file:///photo.jpg');
      expect(frag.concentration).toBe('parfum');
      expect(frag.gender).toBe('masculine');
      expect(frag.release_year).toBe(1999);
    });

    it('fills neutral defaults for unspecified fields', () => {
      const frag = useCustomFragranceStore.getState().add({ name: 'Bare' });
      expect(frag.concentration).toBe('edp');
      expect(frag.gender).toBe('unisex');
      expect(frag.top_notes).toEqual([]);
      expect(frag.heart_notes).toEqual([]);
      expect(frag.base_notes).toEqual([]);
      expect(frag.top_accords).toEqual([]);
      expect(frag.community_longevity).toBe(3);
      expect(frag.price_tier).toBe(3);
      expect(frag.retail_msrp_usd_cents).toBe(0);
      expect(frag.dupe_of).toBeNull();
      expect(frag.image_url).toBe('');
    });

    it('produces unique ids for same-named adds', () => {
      // The shared crypto mock's first 8 chars are constant; feed distinct
      // UUIDs so this exercises real-world uniqueness (id = slug + uuid[0..8]).
      expoCrypto.randomUUID
        .mockReturnValueOnce('aaaaaaaa-0000')
        .mockReturnValueOnce('bbbbbbbb-1111');
      const a = useCustomFragranceStore.getState().add({ name: 'Same Name' });
      const b = useCustomFragranceStore.getState().add({ name: 'Same Name' });
      expect(a.id).not.toBe(b.id);
      expect(Object.keys(useCustomFragranceStore.getState().items)).toHaveLength(2);
    });
  });

  describe('getById()', () => {
    it('returns the stored fragrance', () => {
      const frag = useCustomFragranceStore.getState().add({ name: 'Findable' });
      expect(useCustomFragranceStore.getState().getById(frag.id)).toEqual(frag);
    });

    it('returns undefined for an unknown id', () => {
      expect(useCustomFragranceStore.getState().getById('custom-nope')).toBeUndefined();
    });
  });

  describe('all()', () => {
    it('returns every stored custom fragrance', () => {
      useCustomFragranceStore.getState().add({ name: 'One' });
      useCustomFragranceStore.getState().add({ name: 'Two' });
      expect(useCustomFragranceStore.getState().all()).toHaveLength(2);
    });
  });

  describe('remove()', () => {
    it('deletes by id without touching others', () => {
      const a = useCustomFragranceStore.getState().add({ name: 'Keep' });
      const b = useCustomFragranceStore.getState().add({ name: 'Drop' });
      useCustomFragranceStore.getState().remove(b.id);
      expect(useCustomFragranceStore.getState().getById(b.id)).toBeUndefined();
      expect(useCustomFragranceStore.getState().getById(a.id)).toBeDefined();
    });
  });
});
