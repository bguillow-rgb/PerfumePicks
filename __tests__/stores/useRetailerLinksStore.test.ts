import { useRetailerLinksStore } from '@/src/stores/useRetailerLinksStore';

/**
 * The price pill and the buy link are built in one pass here, and they used to
 * disagree: `buyableBySlug` required link_status='ok', but `priceBySlug` took
 * every priced row "regardless of stock/status". A retailer delisting a product
 * therefore left a "from $X" pill pointing at nothing — 144 fragrances were in
 * that state on 2026-08-07, all from Aromapassions' 92 removed listings.
 */

// Records the query chain so we can assert the dead-link filter is applied.
// jest.mock factories may only reference vars prefixed with `mock`.
const mockCalls: string[] = [];
let mockRows: any[] = [];

function mockChain() {
  const self: any = {};
  for (const m of ['select', 'not', 'neq', 'eq', 'order']) {
    self[m] = (...args: unknown[]) => {
      mockCalls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      return self;
    };
  }
  self.range = (from: number) => Promise.resolve({ data: from === 0 ? mockRows : [], error: null });
  return self;
}

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => mockChain() },
}));

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  fragrances: { slug: 'aroma-x' },
  price_cents: 3900,
  url: 'https://www.awin1.com/cread.php?awinmid=34989&ued=https%3A%2F%2Faromapassions.com%2Fproducts%2Fa',
  retailer: 'aromapassions',
  in_stock: true,
  link_status: 'ok',
  checkout_url: null,
  ...over,
});

function resetStore() {
  useRetailerLinksStore.setState({
    priceBySlug: new Map(),
    buyableBySlug: new Map(),
    loaded: false,
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockRows = [];
  resetStore();
});

describe('useRetailerLinksStore.load', () => {
  it('asks the server to exclude confirmed-dead listings', async () => {
    mockRows = [row()];
    await useRetailerLinksStore.getState().load();

    expect(mockCalls).toContain('neq("link_status","dead")');
  });

  it('keeps price and buy link in agreement for a live row', async () => {
    mockRows = [row()];
    await useRetailerLinksStore.getState().load();

    const s = useRetailerLinksStore.getState();
    expect(s.getPrice('aroma-x')).toBe(3900);
    expect(s.getBuyable('aroma-x')?.priceCents).toBe(3900);
  });

  it('does not price a slug whose only row is dead', async () => {
    // Belt and braces: even if a dead row reaches the client (stale cache, a
    // filter regression), it must not produce a pill with nothing behind it.
    mockRows = [row({ link_status: 'dead' })];
    await useRetailerLinksStore.getState().load();

    const s = useRetailerLinksStore.getState();
    expect(s.getBuyable('aroma-x')).toBeNull();
    expect(s.getPrice('aroma-x')).toBeNull();
  });

  it('still prices on an inconclusive check — never hide on unknown', async () => {
    mockRows = [row({ link_status: 'unknown' })];
    await useRetailerLinksStore.getState().load();

    expect(useRetailerLinksStore.getState().getPrice('aroma-x')).toBe(3900);
  });

  it('takes the cheapest live row for the pill and the dearest for the link', async () => {
    mockRows = [
      row({ price_cents: 3900 }),
      row({ price_cents: 8900 }),
    ];
    await useRetailerLinksStore.getState().load();

    const s = useRetailerLinksStore.getState();
    expect(s.getPrice('aroma-x')).toBe(3900);
    expect(s.getBuyable('aroma-x')?.priceCents).toBe(8900);
  });

  it('leaves an out-of-stock row unbuyable', async () => {
    mockRows = [row({ in_stock: false })];
    await useRetailerLinksStore.getState().load();

    expect(useRetailerLinksStore.getState().getBuyable('aroma-x')).toBeNull();
  });
});
