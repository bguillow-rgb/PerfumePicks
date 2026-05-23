import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { MOCK_CATALOG, type MockFragrance } from '@/src/mock/fragrances';

/**
 * Supabase-backed fragrance catalog store.
 *
 * In demo mode (no env vars), falls back to MOCK_CATALOG so the app
 * stays fully functional without credentials.
 *
 * In production (Supabase configured), fragrances are loaded from the
 * `fragrances` table populated by the CJ/FragranceShop ETL. Real product
 * images, descriptions, and affiliate buy links come from that feed.
 *
 * App-level fragrance ID = `slug` (unique, human-readable, stable across
 * both MOCK_CATALOG and Supabase). UUID is Supabase-internal only.
 */

export type Fragrance = MockFragrance;  // same shape, keeps all consumers working

interface CatalogState {
  /** In-memory cache: slug → Fragrance */
  cache: Record<string, Fragrance>;
  /**
   * Flat array view of the cache.
   * Demo mode: MOCK_CATALOG. Production: populated lazily as searches run.
   */
  items: Fragrance[];
  /** IDs currently being fetched (prevents duplicate in-flight requests) */
  fetching: Set<string>;

  /** Synchronous cache lookup. Returns undefined if not cached yet. */
  getById: (id: string) => Fragrance | undefined;

  /**
   * Async fetch by ID (slug). Checks cache first, then hits Supabase.
   * Falls back to MOCK_CATALOG in demo mode.
   */
  fetchById: (id: string) => Promise<Fragrance | undefined>;

  /**
   * Full-text search against the catalog.
   * Uses Supabase ilike in production; filters MOCK_CATALOG in demo mode.
   * Returns up to `limit` results.
   * Optional `genders` filters to ['feminine','unisex'] etc. Defaults to all.
   */
  search: (query: string, limit?: number, genders?: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch multiple fragrances by ID (slug) array. Results are cached.
   */
  fetchMany: (ids: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch multiple fragrances by slug array. Results are cached.
   */
  fetchBySlugs: (slugs: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch all fragrances for a given brand name.
   * Optional genders filter.
   */
  fetchByBrand: (brand: string, genders?: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch up to `limit` active fragrances, ordered by name.
   * Convenience for Discover, Train stack builder, quiz results, layering picker.
   */
  fetchAllActive: (limit?: number) => Promise<Fragrance[]>;

  _addToCache: (items: Fragrance[]) => void;
}

function rowToFragrance(row: any): Fragrance {
  return {
    // Use slug as the app-level ID — stable, human-readable, shared with MOCK_CATALOG
    id:                   row.slug ?? row.id,
    brand:                row.brands?.name ?? row.brand ?? '',
    name:                 row.name,
    concentration:        row.concentration ?? 'edp',
    fragrance_family:     row.fragrance_family ?? 'floral',
    gender:               row.gender ?? 'unisex',
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

const FRAGRANCE_SELECT = 'id, slug, name, concentration, fragrance_family, gender, top_notes, heart_notes, base_notes, top_accords, accord_intensity, community_longevity, community_sillage, community_projection, compliment_score, versatility_score, office_safe_score, price_tier, retail_msrp_usd_cents, image_url, similar_fragrance_ids, dupe_of, release_year, brands(name)';

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  cache: {},
  // Demo mode seeds from MOCK_CATALOG immediately.
  // Production mode starts empty — populated lazily as searches/fetches run.
  items: isSupabaseConfigured ? [] : MOCK_CATALOG,
  fetching: new Set(),

  _addToCache: (newItems) => {
    const patch: Record<string, Fragrance> = {};
    for (const f of newItems) patch[f.id] = f;
    set((s) => {
      const cache = { ...s.cache, ...patch };
      if (!isSupabaseConfigured) {
        // Demo: MOCK_CATALOG is base; Supabase entries supplement
        const extra = Object.values(cache).filter((f) => !MOCK_CATALOG.some((m) => m.id === f.id));
        return { cache, items: [...MOCK_CATALOG, ...extra] };
      }
      return { cache, items: Object.values(cache) };
    });
  },

  getById: (id) => {
    const cached = get().cache[id];
    if (cached) return cached;
    if (!isSupabaseConfigured) return MOCK_CATALOG.find((f) => f.id === id);
    return undefined;
  },

  fetchById: async (id) => {
    // Demo mode: check mock catalog
    if (!isSupabaseConfigured) {
      return MOCK_CATALOG.find((f) => f.id === id);
    }

    const cached = get().cache[id];
    if (cached) return cached;

    if (get().fetching.has(id)) {
      await new Promise((r) => setTimeout(r, 300));
      return get().cache[id];
    }

    set((s) => ({ fetching: new Set([...s.fetching, id]) }));
    try {
      const { data, error } = await supabase
        .from('fragrances')
        .select(FRAGRANCE_SELECT)
        .eq('slug', id)
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

    // Production: query Supabase
    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(limit);

    if (q) {
      qb = qb.ilike('name', `%${q}%`);
    }
    if (genders?.length) {
      qb = qb.in('gender', genders);
    }

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
        .in('slug', missing)
        .eq('is_active', true);

      if (!error && data) get()._addToCache(data.map(rowToFragrance));
    }

    return ids.flatMap((id) => {
      const f = get().cache[id];
      return f ? [f] : [];
    });
  },

  fetchBySlugs: async (slugs) => {
    if (!slugs.length) return [];

    if (!isSupabaseConfigured) {
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

  fetchAllActive: async (limit = 200) => {
    return get().search('', limit);
  },

  fetchByBrand: async (brand, genders) => {
    if (!isSupabaseConfigured) {
      let results = MOCK_CATALOG.filter((f) => f.brand === brand);
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results;
    }

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

    if (genders?.length) qb = qb.in('gender', genders);

    const { data, error } = await qb;
    if (error) { console.warn('[catalog] fetchByBrand error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance);
    get()._addToCache(results);
    return results;
  },
}));

/**
 * Convenience: synchronous getFragrance() compatible with existing call sites.
 */
export function getFragranceFromStore(id: string): Fragrance | undefined {
  return useCatalogStore.getState().getById(id);
}
