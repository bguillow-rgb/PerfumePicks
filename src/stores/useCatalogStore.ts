import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { MOCK_CATALOG, type MockFragrance } from '@/src/mock/fragrances';

/**
 * Supabase-backed fragrance catalog store.
 *
 * In demo mode (no env vars), falls back to MOCK_CATALOG so the app
 * stays fully functional without credentials.
 *
 * The Fragrance type is intentionally compatible with MockFragrance so
 * the scoring engine (score.ts), recommendation hooks, and components
 * all work without changes. The only differences vs the DB schema are:
 *   - `brand` is a string (joined from brands table), not brand_id UUID
 *   - `similar_ids` is the client name (schema column: similar_fragrance_ids)
 *
 * Usage:
 *   const { getById, search, fetchById } = useCatalogStore.getState();
 *   const fragrance = getById(id) ?? await fetchById(id);
 */

export type Fragrance = MockFragrance;  // same shape, keeps all consumers working

interface CatalogState {
  /** In-memory cache: fragrance_id → Fragrance */
  cache: Record<string, Fragrance>;
  /** IDs currently being fetched (prevents duplicate in-flight requests) */
  fetching: Set<string>;

  /** Synchronous cache lookup. Returns undefined if not cached yet. */
  getById: (id: string) => Fragrance | undefined;

  /**
   * Async fetch by ID. Checks cache first, then hits Supabase.
   * Falls back to MOCK_CATALOG in demo mode.
   */
  fetchById: (id: string) => Promise<Fragrance | undefined>;

  /**
   * Full-text search against the catalog.
   * Uses pg_trgm index in production; filters MOCK_CATALOG in demo mode.
   * Returns up to `limit` results.
   * Optional `genders` filters to ['feminine','unisex'] etc. Defaults to all.
   */
  search: (query: string, limit?: number, genders?: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch multiple fragrances by ID array. Results are cached.
   */
  fetchMany: (ids: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch multiple fragrances by slug array. Results are cached.
   * Falls back to full MOCK_CATALOG in demo mode (slugs aren't in mock IDs).
   */
  fetchBySlugs: (slugs: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch all fragrances for a given brand name.
   * Optional genders filter. Falls back to MOCK_CATALOG in demo mode.
   */
  fetchByBrand: (brand: string, genders?: string[]) => Promise<Fragrance[]>;

  _addToCache: (items: Fragrance[]) => void;
}

function rowToFragrance(row: any): Fragrance {
  return {
    id:                   row.id,
    brand:                row.brands?.name ?? row.brand ?? '',
    name:                 row.name,
    concentration:        row.concentration,
    fragrance_family:     row.fragrance_family,
    gender:               row.gender,
    top_notes:            row.top_notes ?? [],
    heart_notes:          row.heart_notes ?? [],
    base_notes:           row.base_notes ?? [],
    top_accords:          row.top_accords ?? [],
    accord_intensity:     row.accord_intensity ?? {},
    community_longevity:  row.community_longevity ?? 3,
    community_sillage:    row.community_sillage ?? 3,
    community_projection: row.community_projection ?? 3,
    compliment_score:     row.compliment_score ?? 0.5,
    versatility_score:    row.versatility_score ?? 0.5,
    office_safe_score:    row.office_safe_score ?? 0.5,
    price_tier:           row.price_tier ?? 3,
    retail_msrp_usd_cents: row.retail_msrp_usd_cents ?? 0,
    image_url:            row.image_url ?? '',
    similar_ids:          row.similar_fragrance_ids ?? [],
    dupe_of:              row.dupe_of ?? null,
    release_year:         row.release_year ?? 2020,
  };
}

const FRAGRANCE_SELECT = '*, brands(name)';

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  cache: {},
  fetching: new Set(),

  _addToCache: (items) => {
    const patch: Record<string, Fragrance> = {};
    for (const f of items) patch[f.id] = f;
    set((s) => ({ cache: { ...s.cache, ...patch } }));
  },

  getById: (id) => {
    if (!isSupabaseConfigured) {
      return MOCK_CATALOG.find((f) => f.id === id);
    }
    return get().cache[id];
  },

  fetchById: async (id) => {
    if (!isSupabaseConfigured) {
      return MOCK_CATALOG.find((f) => f.id === id);
    }

    const cached = get().cache[id];
    if (cached) return cached;

    if (get().fetching.has(id)) {
      // Wait briefly then return from cache (another call is already in flight)
      await new Promise((r) => setTimeout(r, 300));
      return get().cache[id];
    }

    set((s) => ({ fetching: new Set([...s.fetching, id]) }));
    try {
      const { data, error } = await supabase
        .from('fragrances')
        .select(FRAGRANCE_SELECT)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) { console.warn('[catalog] fetchById error:', error.message); return undefined; }
      if (!data) return undefined;

      const fragrance = rowToFragrance(data);
      get()._addToCache([fragrance]);
      return fragrance;
    } finally {
      set((s) => {
        const next = new Set(s.fetching);
        next.delete(id);
        return { fetching: next };
      });
    }
  },

  search: async (query, limit = 20, genders) => {
    const q = query.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      let results = !q ? MOCK_CATALOG : MOCK_CATALOG.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        f.brand.toLowerCase().includes(q) ||
        f.top_notes.some((n) => n.toLowerCase().includes(q)) ||
        f.top_accords.some((a) => a.toLowerCase().includes(q)),
      );
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results.slice(0, limit);
    }

    if (!q) {
      let qb = supabase
        .from('fragrances')
        .select(FRAGRANCE_SELECT)
        .eq('is_active', true)
        .order('sotd_count', { ascending: false })
        .limit(limit);
      if (genders?.length) qb = qb.or(`gender.in.(${genders.join(',')}),gender.is.null`);
      const { data, error } = await qb;
      if (error || !data) return [];
      const results = data.map(rowToFragrance);
      get()._addToCache(results);
      return results;
    }

    // pg_trgm fuzzy search on name, then filter brand client-side for simplicity
    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .limit(limit);
    if (genders?.length) qb = qb.or(`gender.in.(${genders.join(',')}),gender.is.null`);
    const { data, error } = await qb;

    if (error) { console.warn('[catalog] search error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance);
    get()._addToCache(results);
    return results;
  },

  fetchMany: async (ids) => {
    if (!ids.length) return [];

    if (!isSupabaseConfigured) {
      return MOCK_CATALOG.filter((f) => ids.includes(f.id));
    }

    const cached = get().cache;
    const missing = ids.filter((id) => !cached[id]);

    if (missing.length > 0) {
      const { data, error } = await supabase
        .from('fragrances')
        .select(FRAGRANCE_SELECT)
        .in('id', missing)
        .eq('is_active', true);

      if (!error && data) get()._addToCache(data.map(rowToFragrance));
    }

    return ids.flatMap((id) => {
      const f = get().cache[id] ?? MOCK_CATALOG.find((m) => m.id === id);
      return f ? [f] : [];
    });
  },

  fetchBySlugs: async (slugs) => {
    if (!slugs.length) return [];

    if (!isSupabaseConfigured) {
      // Demo mode: return first N mock items as stand-ins
      return MOCK_CATALOG.slice(0, slugs.length);
    }

    const { data, error } = await supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .in('slug', slugs)
      .eq('is_active', true);

    if (error) { console.warn('[catalog] fetchBySlugs error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance);
    get()._addToCache(results);
    return results;
  },

  fetchByBrand: async (brand, genders) => {
    if (!isSupabaseConfigured) {
      let results = MOCK_CATALOG.filter((f) => f.brand === brand);
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results;
    }

    // First resolve brand_id from brands table
    const { data: brandRow } = await supabase
      .from('brands')
      .select('id')
      .eq('name', brand)
      .maybeSingle();

    if (!brandRow?.id) return [];

    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .eq('brand_id', brandRow.id)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(200);

    if (genders?.length) qb = qb.or(`gender.in.(${genders.join(',')}),gender.is.null`);

    const { data, error } = await qb;
    if (error) { console.warn('[catalog] fetchByBrand error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance);
    get()._addToCache(results);
    return results;
  },
}));

/**
 * Convenience: synchronous getFragrance() compatible with existing call sites.
 * Returns from cache (fast path) or falls back to mock catalog.
 * For async-safe fetching, use useCatalogStore.getState().fetchById(id).
 */
export function getFragranceFromStore(id: string): Fragrance | undefined {
  return useCatalogStore.getState().getById(id);
}
