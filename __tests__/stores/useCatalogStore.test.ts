import { useCatalogStore } from '@/src/stores/useCatalogStore';
import { useCustomFragranceStore } from '@/src/stores/useCustomFragranceStore';
import { MOCK_CATALOG } from '@/src/mock/fragrances';

// Tests run in demo mode (the mocked lib/supabase reports
// isSupabaseConfigured: false), so the catalog resolves against MOCK_CATALOG.

const expoCrypto = require('expo-crypto');

beforeEach(() => {
  expoCrypto.__resetCounter();
  useCatalogStore.setState({ cache: {}, fetching: new Set() });
  useCustomFragranceStore.setState({ items: {} });
});

describe('useCatalogStore — search (M3a mood/note search)', () => {
  it('matches by note name, not just brand/name', async () => {
    // "pink pepper" appears only in note lists, never in any name/brand.
    const results = await useCatalogStore.getState().search('pink pepper', 50);
    expect(results.length).toBeGreaterThan(0);
    for (const f of results) {
      const inNameBrand =
        f.name.toLowerCase().includes('pink pepper') ||
        f.brand.toLowerCase().includes('pink pepper');
      const inNotes = f.top_notes.some((n) => n.toLowerCase().includes('pink pepper'));
      expect(inNameBrand || inNotes).toBe(true);
    }
    // At least one result matched purely via notes (proves note search works).
    expect(
      results.some(
        (f) =>
          !f.name.toLowerCase().includes('pink pepper') &&
          f.top_notes.some((n) => n.toLowerCase().includes('pink pepper')),
      ),
    ).toBe(true);
  });

  it('matches by accord (mood search)', async () => {
    const results = await useCatalogStore.getState().search('powdery', 50);
    expect(results.length).toBeGreaterThan(0);
    for (const f of results) {
      const matches =
        f.name.toLowerCase().includes('powdery') ||
        f.brand.toLowerCase().includes('powdery') ||
        f.top_notes.some((n) => n.toLowerCase().includes('powdery')) ||
        f.top_accords.some((a) => a.toLowerCase().includes('powdery'));
      expect(matches).toBe(true);
    }
  });

  it('respects the limit argument', async () => {
    const results = await useCatalogStore.getState().search('a', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('filters by gender when provided', async () => {
    const results = await useCatalogStore.getState().search('', 100, ['feminine']);
    expect(results.length).toBeGreaterThan(0);
    for (const f of results) expect(f.gender).toBe('feminine');
  });

  it('returns catalog entries for an empty query', async () => {
    const results = await useCatalogStore.getState().search('', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns empty for a query that matches nothing', async () => {
    const results = await useCatalogStore.getState().search('zzz-no-such-scent-qwerty', 10);
    expect(results).toEqual([]);
  });
});

describe('useCatalogStore — accent-insensitive search', () => {
  // Accents used to make bottles unreachable: the brand is stored "Hermès" and
  // "Lancôme", so a user typing the natural spelling got zero results.
  it.each([
    ['hermes', 'Hermès'],
    ['lancome', 'Lancôme'],
    ['regime des fleurs', 'Régime des Fleurs'],
    ['initio parfums prives', 'INITIO Parfums Privés'],
  ])('finds the %s brand when the query drops the accent', async (query, brand) => {
    const results = await useCatalogStore.getState().search(query, 50);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((f) => f.brand === brand)).toBe(true);
  });

  it('still finds the brand when the query keeps the accent', async () => {
    const results = await useCatalogStore.getState().search('Hermès', 50);
    expect(results.some((f) => f.brand === 'Hermès')).toBe(true);
  });

  it('matches an accented fragrance name typed without accents', async () => {
    const results = await useCatalogStore.getState().search('tubereuse astrale', 50);
    expect(results.some((f) => f.name === 'Tubéreuse Astrale')).toBe(true);
  });

  it('ranks the accented exact match above its longer siblings', async () => {
    // nameRelevance compares against the normalized name; if it did not, every
    // accented bottle would score "brand-only" and sort behind the also-rans.
    const results = await useCatalogStore.getState().search('sacre coeur', 20);
    expect(results[0]?.name).toBe('SACRÉ COEUR');
  });
});

describe('useCatalogStore — custom fragrance fallback (M4a)', () => {
  it('getById resolves an on-device custom fragrance', () => {
    const custom = useCustomFragranceStore.getState().add({ name: 'My Bottle' });
    const found = useCatalogStore.getState().getById(custom.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(custom.id);
    expect(found?.name).toBe('My Bottle');
  });

  it('fetchById resolves an on-device custom fragrance', async () => {
    const custom = useCustomFragranceStore.getState().add({ name: 'Async Bottle' });
    const found = await useCatalogStore.getState().fetchById(custom.id);
    expect(found?.id).toBe(custom.id);
  });

  it('getById returns undefined for an unknown custom id (no crash — the bug fix)', () => {
    expect(useCatalogStore.getState().getById('custom-does-not-exist')).toBeUndefined();
  });

  it('still resolves a real catalog slug', () => {
    const slug = MOCK_CATALOG[0].id;
    expect(useCatalogStore.getState().getById(slug)?.id).toBe(slug);
  });
});

describe('useCatalogStore — dupes gate in demo mode (M0/M1)', () => {
  it('fetchDupes returns [] without a backend', async () => {
    expect(await useCatalogStore.getState().fetchDupes('any-slug')).toEqual([]);
  });

  it('fetchDupeCount returns 0 without a backend', async () => {
    expect(await useCatalogStore.getState().fetchDupeCount('any-slug')).toBe(0);
  });

  it('fetchSimilars returns [] without a backend', async () => {
    expect(await useCatalogStore.getState().fetchSimilars('any-slug')).toEqual([]);
  });

  it('fetchDupes returns [] for an empty slug', async () => {
    expect(await useCatalogStore.getState().fetchDupes('')).toEqual([]);
  });
});
