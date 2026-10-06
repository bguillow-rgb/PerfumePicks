import { useCatalogStore } from '@/src/stores/useCatalogStore';

/**
 * Ordering invariants for the empty-result repair chain. The pure decisions are
 * covered in __tests__/features/search/queryRepair.test.ts; this file checks the
 * store wires them in the safe order against a recorded Supabase.
 */

const supabaseMock = require('@/lib/supabase');

function recorder(table: string, rows: any[], ors: string[]) {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    ilike: () => b, overlaps: () => b,
    or: (v: string) => { if (table === 'brands') ors.push(v); return b; },
    then: (resolve: (r: any) => void) => resolve({ data: rows, error: null }),
  };
  return b;
}

describe('useCatalogStore.search - repair chain', () => {
  const originalFrom = supabaseMock.supabase.from;
  const originalRpc = supabaseMock.supabase.rpc;
  let rpcCalls: string[];
  let brandOrs: string[];

  function wire(brandRows: any[]) {
    supabaseMock.supabase.from = (t: string) => recorder(t, t === 'brands' ? brandRows : [], brandOrs);
    supabaseMock.supabase.rpc = (name: string) => { rpcCalls.push(name); return Promise.resolve({ data: [], error: null }); };
  }

  beforeEach(() => {
    rpcCalls = [];
    brandOrs = [];
    useCatalogStore.setState({ cache: {}, fetching: new Set(), lastSearchRepair: null });
    supabaseMock.isSupabaseConfigured = true;
  });

  afterEach(() => {
    supabaseMock.isSupabaseConfigured = false;
    supabaseMock.supabase.from = originalFrom;
    supabaseMock.supabase.rpc = originalRpc;
  });

  it('never runs the loose brand-typo step when a real brand matched', async () => {
    wire([{ id: 'b1', name_normalized: 'hermes', aliases: null }]);
    await useCatalogStore.getState().search('hermes zzzz qqqq');
    expect(rpcCalls).toContain('fuzzy_fragrance_search');
    expect(rpcCalls).not.toContain('fuzzy_brand_search');
  });

  it('tries bottle-name fuzzy before brand-typo when no brand matched', async () => {
    wire([]);
    await useCatalogStore.getState().search('lataffa');
    expect(rpcCalls).toEqual(['fuzzy_fragrance_search', 'fuzzy_brand_search']);
    expect(useCatalogStore.getState().lastSearchRepair).toEqual({ q: 'lataffa', kind: 'none' });
  });

  it('keeps stop-words out of the brand lookup', async () => {
    wire([]);
    await useCatalogStore.getState().search('bath and body works');
    const filter = brandOrs.join(' ');
    expect(filter).toContain('*bath*');
    expect(filter).not.toContain('*and*');
  });
});
