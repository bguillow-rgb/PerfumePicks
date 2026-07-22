import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { normalizeSearchText } from '@/src/lib/normalizeText';
import { MOCK_CATALOG, type MockFragrance } from '@/src/mock/fragrances';
import { useCustomFragranceStore, isCustomFragranceId } from '@/src/stores/useCustomFragranceStore';

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

/** A dupe result: a full Fragrance plus the relationship metadata from get_dupes(). */
export type DupeResult = Fragrance & {
  match_pct: number;
  /**
   * Cheapest in-stock price of the original MINUS the dupe (positive = savings).
   * NULL when either side has no real price — do NOT render a number then.
   * Migration 202607161200 stopped coalescing a missing price to 0: 305 of 308
   * clone-house dupes have retail_msrp NULL (their price lives in
   * fragrance_retailer_links), so the old coalesce returned the FULL original
   * price as "savings" — "Baccarat Rouge 540 (Inspired): save $220", implying
   * the dupe was free, on 189 of 308 pairs.
   */
  price_delta_cents: number | null;
  /**
   * Who asserts this is a clone. get_dupes only ever returns DECLARED sources;
   * 'algo' is excluded server-side (accord overlap makes confident false clone
   * claims). clone_house = the house formulated it as a clone of one original
   * and says so; community = crowd consensus, weaker.
   */
  dupe_source: 'seed' | 'editorial' | 'clone_house' | 'community';
  is_loose: boolean;             // match_pct < 70 → label "Loose match", hide the %
  locked: boolean;              // reserved for a future blurred-row treatment; today locked rows are withheld server-side
};

/** A "Smells Like" result: a full Fragrance plus its similarity score. */
export type SimilarResult = Fragrance & { similarity: number };

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
   * Multi-note AND search. Returns fragrances whose notes/accords contain
   * EVERY term in `terms` (case-insensitive substring). Powers the Discover
   * box when the user lists multiple notes, e.g. ['coconut','musk'].
   * Uses the fragrances_matching_notes RPC in production; filters
   * MOCK_CATALOG in demo mode.
   */
  searchByNotes: (terms: string[], limit?: number, genders?: string[]) => Promise<Fragrance[]>;

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
  fetchAllActive: (limit?: number, genders?: string[]) => Promise<Fragrance[]>;

  /**
   * Fetch a page of enriched fragrances (top_accords non-empty) for the Train deck.
   * Supports pagination via offset. Results are cached.
   */
  fetchEnriched: (limit?: number, offset?: number, genders?: string[]) => Promise<Fragrance[]>;

  /**
   * Pro-gated ranked dupes for an original (by slug). Resolves UUID->slug
   * server-side via the get_dupes() RPC. Non-Pro callers get the top
   * FREE_DUPE_LIMIT rows (the rest are withheld in Postgres, not the client).
   * Use fetchDupeCount() to compute how many remain locked.
   */
  fetchDupes: (slug: string) => Promise<DupeResult[]>;

  /** Public count of dupes available for an original — powers the Pro upsell teaser. */
  fetchDupeCount: (slug: string) => Promise<number>;

  /**
   * COMMUNITY-tier dupes for an original (source='community') via get_community_dupes.
   * Opinion-only crowd consensus, fully visible (no freemium gate). The UI must
   * label these as unverified and only show them when fetchDupeCount() === 0.
   */
  fetchCommunityDupes: (slug: string, limit?: number) => Promise<DupeResult[]>;

  /** Public count of community-tier dupes — lets the UI decide whether to render the section. */
  fetchCommunityDupeCount: (slug: string) => Promise<number>;

  /**
   * Slug of the original with the most curated dupes (tiebreak: priciest).
   * Default seed for the Home Budget Dupes module when the user has no wardrobe
   * item with dupes. Null when the catalog has no curated dupes.
   */
  fetchFeaturedDupeOriginal: () => Promise<string | null>;

  /** Public "Smells Like" rail for a fragrance (by slug), via the get_similars() RPC. */
  fetchSimilars: (slug: string, limit?: number) => Promise<SimilarResult[]>;

  /**
   * Candidate pool for the Fragrance DNA picker grid — recognizable, imaged,
   * accord-bearing bottles. Demo mode returns the eligible slice of MOCK_CATALOG
   * (the picker logic resolves popularity from the seed list). Production selects
   * rows at/above the reshuffle fame floor; falls back to enriched on any error.
   */
  fetchPickerCandidates: (minTier?: number) => Promise<Fragrance[]>;

  _addToCache: (items: Fragrance[]) => void;
}

/** Strip bundles, gift-sets, and tester units — not real purchasable products. */
function isBundle(f: Fragrance): boolean {
  if (f.brand === 'BUNDLE & SAVE') return true;
  const nameLower = f.name.toLowerCase();
  return nameLower.includes('tester') || nameLower.includes(' set ') ||
    nameLower.startsWith('set ') || nameLower.endsWith(' set');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How well a fragrance NAME matches the query — higher is more relevant.
 *   5 exact ("Sauvage")  4 prefix ("Sauvage Elixir")  3 whole-word ("Eau Sauvage")
 *   2 substring          1 brand-only (name doesn't contain the query at all)
 * Pure-alphabetical ordering buried flagships (Dior Sauvage 6th, Creed Aventus 3rd);
 * this lifts the exact/closest name to the top.
 *
 * `q` arrives normalized, so the name must be normalized too — otherwise every
 * accented bottle scores 1 ("meteore" is not a substring of "Météore") and sinks
 * below the unaccented also-rans.
 */
/**
 * Trigram-similar catalog search, used only when the exact search finds nothing.
 * Calls the fuzzy_fragrance_search RPC (202607180900) for similar name ids, then
 * re-fetches full rows through the normal select so they carry the brand + shape.
 * Returns [] on any error — a failed fallback just means the same empty result.
 */
async function fuzzySearchFallback(
  q: string,
  limit: number,
  genders?: string[],
): Promise<Fragrance[]> {
  try {
    const { data: ids, error } = await supabase.rpc('fuzzy_fragrance_search', {
      q,
      lim: Math.max(limit * 2, 20),
    });
    if (error || !ids || ids.length === 0) return [];

    // Preserve the RPC's similarity order when we re-fetch by id.
    const order = new Map<string, number>((ids as { id: string }[]).map((r, i) => [r.id, i]));
    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .in('id', [...order.keys()]);
    if (genders?.length) qb = qb.in('gender', genders);
    const { data } = await qb;

    return (data ?? [])
      .map(rowToFragrance)
      .filter((f) => !isBundle(f))
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function nameRelevance(name: string, q: string): number {
  const n = normalizeSearchText(name);
  if (n === q) return 5;
  if (n.startsWith(q)) return 4;
  if (new RegExp(`\\b${escapeRegex(q)}\\b`).test(n)) return 3;
  if (n.includes(q)) return 2;
  return 1;
}

/**
 * Rank search results by: name relevance, then buyable first (real products with a
 * buy button), then shortest name (the flagship carries the fewest extra words —
 * "Sauvage" vs "Orchidee Sauvage"), then alphabetical as a stable tiebreak.
 */
function compareSearchRelevance(a: Fragrance, b: Fragrance, q: string): number {
  const ra = nameRelevance(a.name, q);
  const rb = nameRelevance(b.name, q);
  if (ra !== rb) return rb - ra;
  const pa = (a as any).purchasable ? 1 : 0;
  const pb = (b as any).purchasable ? 1 : 0;
  if (pa !== pb) return pb - pa;
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name.localeCompare(b.name);
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
    // Did the DB actually have performance data, or are the 3.0s above defaults?
    has_community_data:   (row.community_longevity ?? row.community_sillage ?? row.community_projection) != null,
    compliment_score:     row.compliment_score ?? 0.5,
    versatility_score:    row.versatility_score ?? 0.5,
    office_safe_score:    row.office_safe_score ?? 0.5,
    price_tier:           row.price_tier ?? 3,
    retail_msrp_usd_cents: row.retail_msrp_usd_cents ?? 0,
    image_url:            row.image_url ?? '',
    similar_ids:          row.similar_fragrance_ids ?? [],
    dupe_of:              row.dupe_of ?? null,
    release_year:         row.release_year ?? 2020,
    purchasable:          row.purchasable ?? false,
  } as Fragrance;
}

const FRAGRANCE_SELECT = 'id, slug, name, concentration, fragrance_family, gender, top_notes, heart_notes, base_notes, top_accords, accord_intensity, community_longevity, community_sillage, community_projection, compliment_score, versatility_score, office_safe_score, price_tier, retail_msrp_usd_cents, image_url, similar_fragrance_ids, dupe_of, release_year, purchasable, brands(name)';

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
    // User-added bottles live on-device, not in the catalog or Supabase.
    if (isCustomFragranceId(id)) return useCustomFragranceStore.getState().getById(id);
    if (!isSupabaseConfigured) return MOCK_CATALOG.find((f) => f.id === id);
    return undefined;
  },

  fetchById: async (id) => {
    // User-added bottles live on-device, not in the catalog or Supabase.
    if (isCustomFragranceId(id)) return useCustomFragranceStore.getState().getById(id);

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
    // Normalized, not just lowercased: `ilike` is case-insensitive but not
    // accent-insensitive, so "hermes" has to be matched against a normalized
    // mirror of the name ("Hermès" → "hermes") on both sides. Typing the accent
    // still works — "Hermès" normalizes to the same "hermes".
    const q = normalizeSearchText(query);

    if (!isSupabaseConfigured) {
      const norm = normalizeSearchText;
      let results = !q ? MOCK_CATALOG : MOCK_CATALOG.filter((f) =>
        norm(f.name).includes(q) ||
        norm(f.brand).includes(q) ||
        f.top_notes.some((n) => norm(n).includes(q)) ||
        f.top_accords.some((a) => norm(a).includes(q)),
      );
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results.filter((f) => !isBundle(f)).slice(0, limit);
    }

    // Production: query Supabase
    if (q) {
      // Brand + name combined search. Matching the whole query against the
      // fragrance name OR the brand name independently fails for the most
      // natural input — "burberry goddess" — because the bottle is stored as
      // name "Goddess" under brand "Burberry", so neither column contains the
      // full string. Fix: detect which tokens name a brand, strip them, and
      // match the remaining tokens against the fragrance name *within* those
      // brands.
      const tokens = q.split(/\s+/).filter(Boolean);
      // Normalization already reduced tokens to [a-z0-9]; this stays as a guard
      // because they get interpolated into a PostgREST .or() string, which is
      // parsed structurally (raw commas/parens/dots would break it). Require
      // >=3 chars so stop-words like "le"/"no" don't match half the brand table.
      const brandTokens = tokens
        .map((t) => t.replace(/[^a-z0-9]/gi, ''))
        .filter((t) => t.length >= 3);

      // Every token, including the 1-2 char ones brandTokens drops. Aliases are
      // matched exactly, so short tokens are safe here — and necessary: the
      // initialisms users actually type ("lv", "tf") are exactly the ones the
      // >=3 guard would throw away before the lookup ever saw them.
      const aliasTokens = tokens.map((t) => t.replace(/[^a-z0-9]/gi, '')).filter(Boolean);

      type BrandRow = { id: string; name_normalized: string; aliases: string[] | null };
      let matchedBrands: BrandRow[] = [];
      {
        // Two lookups rather than one .or(): PostgREST parses .or() structurally,
        // and an array-containment term ("aliases.cs.{a,b}") carries commas that
        // would break that parse. .overlaps() keeps it a first-class filter.
        const byName = brandTokens.length > 0
          ? supabase.from('brands').select('id, name_normalized, aliases')
              .or(brandTokens.map((t) => `name_normalized.ilike.*${t}*`).join(','))
          : Promise.resolve({ data: [] as any[] });
        const byAlias = aliasTokens.length > 0
          ? supabase.from('brands').select('id, name_normalized, aliases')
              .overlaps('aliases', aliasTokens)
          : Promise.resolve({ data: [] as any[] });

        const [nameRes, aliasRes] = await Promise.all([byName, byAlias]);
        const dedupe = new Map<string, BrandRow>();
        for (const r of [...(nameRes.data ?? []), ...(aliasRes.data ?? [])]) {
          dedupe.set((r as BrandRow).id, r as BrandRow);
        }
        matchedBrands = [...dedupe.values()];
      }
      const brandIds = [...new Set(matchedBrands.map((b) => b.id))];

      // Tokens "explained" by a matched brand name → not part of the bottle name.
      //
      // NO length guard here, unlike brandTokens above. The >=3 rule belongs on
      // the brand LOOKUP (so "le" doesn't match half the brand table), but applying
      // it to consumption meant short words inside a brand's own name were never
      // recognised as part of it: "parfums de marly layton" kept "de", leaving
      // nameRemainder "de layton" and searching for a bottle literally called
      // "de layton" — zero results for the most natural query there is. Same for
      // "le labo santal 33", "jo malone wood sage", "acqua di parma colonia";
      // 80 of 757 brands carry a <3-char word.
      //
      // Safe because a token is only consumed when it actually occurs in a brand
      // name that already matched: "bleu de chanel" keeps its "de" (Chanel's name
      // doesn't contain "de"), so the remainder stays "bleu de".
      const consumed = new Set<string>();
      for (const b of matchedBrands) {
        const bn = b.name_normalized ?? '';
        // Exact for aliases, substring for the name: "pdm" IS the brand, so it
        // must be consumed too or it survives into nameRemainder and we search
        // Parfums de Marly for a bottle called "pdm" — the same class of bug the
        // short-word fix above addresses.
        const al = new Set(b.aliases ?? []);
        for (const t of tokens) if (al.has(t) || bn.includes(t)) consumed.add(t);
      }
      const nameRemainder = tokens.filter((t) => !consumed.has(t)).join(' ').trim();

      // Over-fetch a candidate pool, then rank client-side (see compareSearchRelevance).
      // Alphabetical truncation in Postgres could otherwise cut the flagship before
      // ranking — e.g. "Sauvage" among many "*-sauvage" names sorts late.
      const fetchLimit = Math.max(limit * 4, 60);

      // 1) Fragrance-name match on the full query (handles names that literally
      //    contain the whole string, and pure-name queries with no brand token).
      let nameQb = supabase
        .from('fragrances')
        .select(FRAGRANCE_SELECT)
        .eq('is_active', true)
        // Hide AromaPassions inspired-by dupes from keyword search — they surface
        // only via Budget Dupes, never alongside the original they clone. NULL-safe.
        .or('source.is.null,source.neq.aromapassions')
        .ilike('name_normalized', `%${q}%`)
        .order('name', { ascending: true })
        .limit(fetchLimit);
      if (genders?.length) nameQb = nameQb.in('gender', genders);

      // 2) Within matched brands, narrow by the leftover name tokens — or return
      //    the whole brand when the query was brand-only (nameRemainder empty).
      const namePromise = nameQb;
      const brandPromise = brandIds.length > 0
        ? (() => {
            let bqb = supabase
              .from('fragrances')
              .select(FRAGRANCE_SELECT)
              .eq('is_active', true)
              .or('source.is.null,source.neq.aromapassions')
              .in('brand_id', brandIds)
              .order('purchasable', { ascending: false })
              .order('name', { ascending: true })
              .limit(fetchLimit);
            if (nameRemainder) bqb = bqb.ilike('name_normalized', `%${nameRemainder}%`);
            if (genders?.length) bqb = bqb.in('gender', genders);
            return bqb;
          })()
        : Promise.resolve({ data: [] as any[], error: null });

      const [nameRes, brandRes] = await Promise.all([namePromise, brandPromise]);
      if (nameRes.error) console.warn('[catalog] search name error:', nameRes.error.message);
      if (brandRes.error) console.warn('[catalog] search brand error:', brandRes.error?.message);

      const seen = new Set<string>();
      const merged: Fragrance[] = [];
      for (const row of [...(nameRes.data ?? []), ...(brandRes.data ?? [])]) {
        const slug = row.slug ?? row.id;
        if (!seen.has(slug)) { seen.add(slug); merged.push(rowToFragrance(row)); }
      }
      merged.sort((a, b) => compareSearchRelevance(a, b, q));
      const results = merged.filter((f) => !isBundle(f)).slice(0, limit);

      // Fuzzy fallback: exact ilike has no typo tolerance, so a single dropped or
      // transposed letter ("opim"->Opium) or a punctuation-spacing gap ("love dont
      // be shy"->"love don t be shy") returns nothing even though we HAVE the
      // bottle. When the exact path finds nothing, ask Postgres for trigram-similar
      // names and re-fetch those rows through the normal select (so they carry the
      // brand + full shape). Only on the empty path, so good exact results are
      // never diluted by fuzzy noise.
      if (results.length === 0) {
        const fuzzy = await fuzzySearchFallback(q, limit, genders);
        if (fuzzy.length > 0) {
          get()._addToCache(fuzzy);
          return fuzzy;
        }
      }

      get()._addToCache(results);
      return results;
    }

    // No query — fetch all active (default browse list). Dupes stay out of here too.
    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .eq('is_active', true)
      .or('source.is.null,source.neq.aromapassions')
      .order('name', { ascending: true })
      .limit(limit);
    if (genders?.length) qb = qb.in('gender', genders);

    const { data, error } = await qb;
    if (error) { console.warn('[catalog] search error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance).filter((f) => !isBundle(f));
    get()._addToCache(results);
    return results;
  },

  searchByNotes: async (terms, limit = 200, genders) => {
    const cleaned = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (cleaned.length === 0) return [];

    if (!isSupabaseConfigured) {
      // Demo: AND-match each term against any note/accord on the bottle.
      const hay = (f: Fragrance) =>
        [...f.top_notes, ...f.heart_notes, ...f.base_notes, ...f.top_accords].map((s) => s.toLowerCase());
      let results = MOCK_CATALOG.filter((f) => {
        const fields = hay(f);
        return cleaned.every((term) => fields.some((v) => v.includes(term)));
      });
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results.filter((f) => !isBundle(f)).slice(0, limit);
    }

    const { data, error } = await supabase.rpc('fragrances_matching_notes', {
      note_terms: cleaned,
      match_genders: genders ?? null,
      result_limit: limit,
    });
    if (error) { console.warn('[catalog] searchByNotes error:', error.message); return []; }
    const slugs = (data ?? []).map((r: any) => r.slug as string);
    if (slugs.length === 0) return [];
    const rows = await get().fetchMany(slugs);
    return rows.filter((f) => !isBundle(f));
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

  fetchAllActive: async (limit = 200, genders?) => {
    return get().search('', limit, genders);
  },

  fetchEnriched: async (limit = 500, offset = 0, genders?) => {
    if (!isSupabaseConfigured) {
      let results = MOCK_CATALOG.filter((f) => f.top_accords.length > 0);
      if (genders?.length) results = results.filter((f) => genders.includes(f.gender));
      return results.filter((f) => !isBundle(f)).slice(offset, offset + limit);
    }

    let qb = supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT)
      .eq('is_active', true)
      .neq('top_accords', '{}')
      // Soft sort: buyable bottles first (affiliate-linked), unbuyable tail after.
      // Stable secondary order on id keeps .range() pagination consistent across
      // pages — buyable rows fill the early pages, the unbuyable tail follows.
      .order('purchasable', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (genders?.length) qb = qb.in('gender', genders);

    const { data, error } = await qb;
    if (error) { console.warn('[catalog] fetchEnriched error:', error.message); return []; }
    const results = (data ?? []).map(rowToFragrance).filter((f) => !isBundle(f));
    get()._addToCache(results);
    return results;
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

  fetchDupes: async (slug) => {
    if (!isSupabaseConfigured || !slug) return [];
    const { data, error } = await supabase.rpc('get_dupes', { p_slug: slug });
    if (error) { console.warn('[catalog] fetchDupes error:', error.message); return []; }
    const results = ((data ?? []) as any[]).map((r) => ({
      ...rowToFragrance({ ...r, brands: { name: r.brand_name } }),
      match_pct: r.match_pct,
      price_delta_cents: r.price_delta_cents,
      dupe_source: r.source,
      is_loose: r.is_loose,
      locked: r.locked ?? false,
    })) as DupeResult[];
    get()._addToCache(results);
    return results;
  },

  fetchDupeCount: async (slug) => {
    if (!isSupabaseConfigured || !slug) return 0;
    const { data, error } = await supabase.rpc('get_dupe_count', { p_slug: slug });
    if (error) { console.warn('[catalog] fetchDupeCount error:', error.message); return 0; }
    return (data as number) ?? 0;
  },

  fetchFeaturedDupeOriginal: async () => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase.rpc('get_featured_dupe_original');
    if (error) { console.warn('[catalog] fetchFeaturedDupeOriginal error:', error.message); return null; }
    return (data as string) ?? null;
  },

  fetchCommunityDupes: async (slug, limit = 12) => {
    if (!isSupabaseConfigured || !slug) return [];
    const { data, error } = await supabase.rpc('get_community_dupes', { p_slug: slug, p_limit: limit });
    if (error) { console.warn('[catalog] fetchCommunityDupes error:', error.message); return []; }
    const results = ((data ?? []) as any[]).map((r) => ({
      ...rowToFragrance({ ...r, brands: { name: r.brand_name } }),
      match_pct: r.match_pct,
      price_delta_cents: r.price_delta_cents,
      dupe_source: r.source,
      is_loose: r.is_loose,
      locked: r.locked ?? false,
    })) as DupeResult[];
    get()._addToCache(results);
    return results;
  },

  fetchCommunityDupeCount: async (slug) => {
    if (!isSupabaseConfigured || !slug) return 0;
    const { data, error } = await supabase.rpc('get_community_dupe_count', { p_slug: slug });
    if (error) { console.warn('[catalog] fetchCommunityDupeCount error:', error.message); return 0; }
    return (data as number) ?? 0;
  },

  fetchSimilars: async (slug, limit = 12) => {
    if (!isSupabaseConfigured || !slug) return [];
    const { data, error } = await supabase.rpc('get_similars', { p_slug: slug, p_limit: limit });
    if (error) { console.warn('[catalog] fetchSimilars error:', error.message); return []; }
    const results = ((data ?? []) as any[]).map((r) => ({
      ...rowToFragrance({ ...r, brands: { name: r.brand_name } }),
      similarity: r.similarity,
    })) as SimilarResult[];
    get()._addToCache(results);
    return results;
  },

  fetchPickerCandidates: async (minTier = 3) => {
    if (!isSupabaseConfigured) {
      // Picker logic (popularity resolver) handles tier; here we only ensure a
      // displayable image + real accords so a tile can render and aggregate.
      return MOCK_CATALOG.filter(
        (f) => !!f.image_url && f.top_accords.length > 0 && !isBundle(f),
      );
    }
    // Production: fetch an enriched + imaged pool, ORDERED by recognizability so
    // the famous anchors are guaranteed to be in the page. This matters: the
    // catalog is ~9k enriched rows but only ~100 are recognizable (tier >= 3), so
    // an UNORDERED `limit` returns an arbitrary slice that contains only a handful
    // of famous bottles — which starved the tier-4 grid to 3-4 tiles. Ordering by
    // popularity_tier desc (nulls last) puts the recognizable pool at the top of
    // the page; the grid's client-side resolver still does the final tier gating,
    // so this stays correct even in an env where the column is unpopulated (the
    // order becomes a no-op and we fall back to the broad seed-list match). If the
    // column doesn't exist the select errors and we fall back to plain enriched.
    void minTier;
    const { data, error } = await supabase
      .from('fragrances')
      .select(FRAGRANCE_SELECT + ', popularity_tier')
      .eq('is_active', true)
      .neq('top_accords', '{}')
      .not('image_url', 'is', null)
      .order('popularity_tier', { ascending: false, nullsFirst: false })
      .limit(600);
    if (error) {
      console.warn('[catalog] fetchPickerCandidates error, falling back to enriched:', error.message);
      return get().fetchEnriched(600);
    }
    const results = ((data ?? []) as any[])
      .map((row) => ({ ...rowToFragrance(row), popularity_tier: row.popularity_tier }) as Fragrance)
      .filter((f) => !!f.image_url && !isBundle(f));
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
