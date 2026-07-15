import { useCatalogStore } from '@/src/stores/useCatalogStore';

/**
 * The rest of the catalog tests run in demo mode against MOCK_CATALOG, which
 * never exercises the Supabase query the real app runs. This file flips
 * isSupabaseConfigured on and records the PostgREST filters the store builds.
 *
 * What it locks down: search must normalize the query and match it against the
 * `name_normalized` mirror column, never the raw `name`. Matching raw `name`
 * with ilike is case-insensitive but not accent-insensitive, which is what made
 * 147 Hermès and 125 Lancôme bottles unreachable by their natural spelling.
 */

const supabaseMock = require('@/lib/supabase');

type Filter = { op: string; column: string; value: unknown };

/** Records every filter applied, and resolves to `rows` when awaited. */
function makeQueryRecorder(table: string, rows: any[], calls: Record<string, Filter[]>) {
  const record = (op: string, column: string, value: unknown) => {
    (calls[table] ??= []).push({ op, column, value });
  };
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    or: (v: string) => { record('or', '', v); return builder; },
    ilike: (column: string, value: string) => { record('ilike', column, value); return builder; },
    overlaps: (column: string, value: unknown) => { record('overlaps', column, value); return builder; },
    // PostgREST builders are thenables, not promises — awaiting one runs it.
    then: (resolve: (r: any) => void) => resolve({ data: rows, error: null }),
  };
  return builder;
}

describe('useCatalogStore — search against Supabase (production path)', () => {
  let calls: Record<string, Filter[]>;
  const originalFrom = supabaseMock.supabase.from;

  beforeEach(() => {
    calls = {};
    useCatalogStore.setState({ cache: {}, fetching: new Set() });
    supabaseMock.isSupabaseConfigured = true;
    supabaseMock.supabase.from = (table: string) =>
      makeQueryRecorder(table, table === 'brands' ? [{ id: 'brand-uuid', name_normalized: 'hermes' }] : [], calls);
  });

  afterEach(() => {
    supabaseMock.isSupabaseConfigured = false;
    supabaseMock.supabase.from = originalFrom;
  });

  const ilikes = (table: string) => (calls[table] ?? []).filter((c) => c.op === 'ilike');

  it('matches fragrance names against name_normalized, not the raw name', async () => {
    await useCatalogStore.getState().search('meteore');
    const cols = ilikes('fragrances').map((c) => c.column);
    expect(cols).toContain('name_normalized');
    expect(cols).not.toContain('name');
  });

  it('strips accents from the query before it reaches Postgres', async () => {
    // The user typed the accented spelling; the DB mirror column is accentless,
    // so the query has to be normalized on the way out or it matches nothing.
    await useCatalogStore.getState().search('Météore');
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%meteore%');
  });

  it('normalizes an unaccented query identically (both spellings hit one filter)', async () => {
    await useCatalogStore.getState().search('METEORE');
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%meteore%');
  });

  it('looks brands up by name_normalized so "hermes" resolves "Hermès"', async () => {
    await useCatalogStore.getState().search('hermes terre');
    const brandOr = (calls['brands'] ?? []).find((c) => c.op === 'or');
    expect(brandOr?.value).toContain('name_normalized.ilike.*hermes*');
    expect(brandOr?.value).not.toContain('name.ilike');
  });

  it('strips the brand token from the leftover name filter', async () => {
    // "hermes" is explained by the matched brand (name_normalized "hermes"), so
    // only "terre" should narrow the name within that brand.
    await useCatalogStore.getState().search('hermes terre');
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%terre%');
  });

  it('consumes short words that belong to the brand name ("jo malone")', async () => {
    // Regression: the brand matcher used to ignore tokens under 3 chars, so "jo"
    // survived into the leftover filter and the store searched Jo Malone for a
    // bottle literally called "jo" — 0 results for a plain brand search.
    supabaseMock.supabase.from = (table: string) =>
      makeQueryRecorder(table, table === 'brands'
        ? [{ id: 'b1', name_normalized: 'jo malone', aliases: ['jm'] }] : [], calls);
    await useCatalogStore.getState().search('jo malone');
    // Whole query is the brand → nothing left to narrow by → no name filter.
    expect(ilikes('fragrances').map((c) => c.value)).not.toContain('%jo%');
  });

  it('keeps a short word that is NOT part of the brand ("bleu de chanel")', async () => {
    // The guard-rail on the fix above: Chanel's name has no "de", so "de" must
    // stay in the bottle filter or "Bleu de Chanel" stops resolving.
    supabaseMock.supabase.from = (table: string) =>
      makeQueryRecorder(table, table === 'brands'
        ? [{ id: 'b2', name_normalized: 'chanel', aliases: [] }] : [], calls);
    await useCatalogStore.getState().search('bleu de chanel');
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%bleu de%');
  });

  it('resolves a brand by alias and consumes it ("pdm galloway")', async () => {
    supabaseMock.supabase.from = (table: string) =>
      makeQueryRecorder(table, table === 'brands'
        ? [{ id: 'b3', name_normalized: 'parfums de marly', aliases: ['pdm'] }] : [], calls);
    await useCatalogStore.getState().search('pdm galloway');
    // The alias lookup must see every token, including short ones.
    const ov = (calls['brands'] ?? []).find((c) => c.op === 'overlaps');
    expect(ov?.column).toBe('aliases');
    expect(ov?.value).toEqual(['pdm', 'galloway']);
    // "pdm" IS the brand, so only "galloway" narrows the bottle.
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%galloway%');
  });

  it('passes 1-2 char tokens to the alias lookup ("lv meteore")', async () => {
    // brandTokens drops <3 chars to keep "le" from matching half the brand table,
    // but aliases match exactly, so "lv" must still reach the alias query — it is
    // precisely the kind of token users type.
    supabaseMock.supabase.from = (table: string) =>
      makeQueryRecorder(table, table === 'brands'
        ? [{ id: 'b4', name_normalized: 'louis vuitton', aliases: ['lv'] }] : [], calls);
    await useCatalogStore.getState().search('lv meteore');
    const ov = (calls['brands'] ?? []).find((c) => c.op === 'overlaps');
    expect(ov?.value).toEqual(['lv', 'meteore']);
    expect(ilikes('fragrances').map((c) => c.value)).toContain('%meteore%');
  });
});
