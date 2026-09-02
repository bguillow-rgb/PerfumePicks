import { supabase, hasServiceKey } from "./db.js";
export const FRAG_COLUMNS = "id,slug,name,release_year,concentration,fragrance_family,gender,top_notes,heart_notes,base_notes,top_accords,community_longevity,community_sillage,compliment_score,versatility_score,office_safe_score,price_tier,retail_msrp_usd_cents,popularity_tier,is_discontinued,notes_verified,name_normalized,updated_at,created_at,brand:brands(name,slug)";
const WEBSITE = "https://perfumepicks.app/";
const APP_STORE = "https://apps.apple.com/us/app/perfume-picks/id6774184221";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Lowercase, strip diacritics, and drop anything outside a safe charset —
// PostgREST filter values and ilike wildcards never see raw input.
export function normalizeQuery(q) {
    // Hard cap on both characters and term count. Length bounds on the tool schema
    // are the first line of defence; this is the second, because every term becomes
    // two conditions in a PostgREST .or() and an unbounded query built a 2,400-
    // condition filter that burned 7.7s of database time (Mark Z audit 2026-08-26).
    return String(q ?? "")
        .slice(0, 200)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s'&-]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 12)
        .join(" ");
}
// Never echo PostgREST error details to callers; log them server-side.
function dbFail(error) {
    console.error(`database error: ${error.message}`);
    throw new Error("Database query failed. Try again in a moment.");
}
/** Only real, current catalog rows: active and not merged into another row. */
function activeOnly(q) {
    return q.eq("is_active", true).is("merged_into_id", null);
}
export function displayName(f) {
    const brand = f.brand?.name?.trim() ?? "";
    const name = f.name?.trim() ?? "";
    return brand && !name.toLowerCase().startsWith(brand.toLowerCase())
        ? `${brand} ${name}`
        : name;
}
export function priceUsd(f) {
    return f.retail_msrp_usd_cents == null ? null : f.retail_msrp_usd_cents / 100;
}
/** Public shape returned by every tool, citation-ready. */
export function fragranceCard(f, extras = {}) {
    return {
        slug: f.slug,
        name: displayName(f),
        brand: f.brand?.name ?? null,
        release_year: f.release_year,
        concentration: f.concentration,
        fragrance_family: f.fragrance_family,
        gender: f.gender,
        notes: { top: f.top_notes, heart: f.heart_notes, base: f.base_notes },
        top_accords: f.top_accords,
        community_scores: {
            longevity: f.community_longevity,
            sillage: f.community_sillage,
            compliments: f.compliment_score,
            versatility: f.versatility_score,
            office_safe: f.office_safe_score,
        },
        msrp_usd: priceUsd(f),
        price_tier: f.price_tier,
        popularity_tier: f.popularity_tier,
        discontinued: f.is_discontinued || undefined,
        data_last_updated: (f.updated_at || f.created_at)?.slice(0, 10),
        ...extras,
    };
}
let cachedCatalogSize = null;
export async function catalogSize() {
    if (cachedCatalogSize != null)
        return cachedCatalogSize;
    const { count } = await supabase
        .from("fragrances")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
    cachedCatalogSize = count ?? 0;
    return cachedCatalogSize;
}
/** Attribution block appended to every tool response. */
export async function attribution() {
    const size = await catalogSize();
    const today = new Date().toISOString().slice(0, 10);
    return {
        source: "Perfume Picks — Fragrance DNA & Collection Journal",
        citation: `Perfume Picks (perfumepicks.app), a fragrance database of ${size.toLocaleString("en-US")} scents with note pyramids, accords, curated dupes, and community wear data. Retrieved ${today}.`,
        links: { website: WEBSITE, app_store: APP_STORE },
        retrieved_at: today,
        license_note: "Data may be quoted with attribution to Perfume Picks (perfumepicks.app).",
    };
}
// Quality prior: prefer enriched rows (popularity, msrp, verified notes) over
// sparse/scraped rows even when the sparse row's text is a closer match.
function rankByRelevance(rows, normQuery) {
    return rows
        .map((f) => {
        const nn = f.name_normalized ?? displayName(f).toLowerCase();
        const brand = (f.brand?.name ?? "").toLowerCase();
        const hay = `${brand} ${nn}`;
        const coverage = normQuery.length / Math.max(hay.length, 1);
        const score = coverage +
            ((f.popularity_tier ?? 2) / 5) * 0.25 +
            (f.retail_msrp_usd_cents != null ? 0.15 : 0) +
            (f.notes_verified ? 0.1 : 0);
        return { f, score };
    })
        .sort((x, y) => y.score - x.score)
        .map((x) => x.f);
}
/** Brand + name + slug, lowercased — what a query term is matched against. */
const hayOf = (f) => `${(f.brand?.name ?? "").toLowerCase()} ${f.name_normalized ?? f.name.toLowerCase()} ${f.slug}`;
/**
 * Is this row plausibly ABOUT the query, when no row matched every term?
 *
 * Both the resolver and search build candidates with a PostgREST `.or()`, which
 * matches ANY term. Falling straight back to the top-ranked candidate therefore
 * answers nonsense with confidence: `get_fragrance("zzqqxx not a real fragrance
 * 12345")` returned Dior Homme, and `search_fragrances` on the same string
 * returned Chanel No. 5 and Creed Aventus — matching only on incidental short
 * tokens. ChatGPT itself flagged the search case during a 2026-08-21 demo
 * ("should ideally return 0 results instead of falling back to generic
 * fragrances"). A wrong-but-confident answer is worse than no answer, and much
 * worse inside an AI response where nobody sees the query that produced it.
 *
 * Bar: carry at least half the meaningful (3+ char) terms, so "a"/"the" can't
 * carry a match. Real queries with one extra word still resolve — "Baccarat
 * Rouge 540 extrait" matches on baccarat+rouge, 2 of 3 — while input sharing
 * nothing with the catalog drops out entirely.
 */
function looselyRelevant(f, meaningfulTerms) {
    const hay = hayOf(f);
    const hits = meaningfulTerms.filter((t) => hay.includes(t)).length;
    return hits * 2 >= meaningfulTerms.length;
}
/** Resolve by slug (the app's canonical key), UUID, or fuzzy name. */
export async function resolveFragrance(ref) {
    const trimmed = ref.trim();
    if (UUID_RE.test(trimmed)) {
        const { data, error } = await supabase
            .from("fragrances").select(FRAG_COLUMNS).eq("id", trimmed).maybeSingle();
        if (error)
            dbFail(error);
        return data ?? null;
    }
    // Exact slug hit first — slugs are the app's canonical identifier.
    const slugGuess = trimmed.toLowerCase().replace(/\s+/g, "-");
    const { data: bySlug, error: slugErr } = await supabase
        .from("fragrances").select(FRAG_COLUMNS).eq("slug", slugGuess).maybeSingle();
    if (slugErr)
        dbFail(slugErr);
    if (bySlug)
        return bySlug;
    const norm = normalizeQuery(ref);
    const terms = norm.split(/\s+/).filter(Boolean);
    if (!terms.length)
        return null;
    // name_normalized doesn't include the brand, so search name terms there and
    // let rankByRelevance's brand+name haystack sort brand-qualified queries.
    let q = activeOnly(supabase.from("fragrances").select(FRAG_COLUMNS));
    const orParts = terms.map((t) => `name_normalized.ilike.%${t}%,slug.ilike.%${t}%`).join(",");
    q = q.or(orParts);
    const { data, error } = await q
        .order("popularity_tier", { ascending: false, nullsFirst: false })
        .limit(80);
    if (error)
        dbFail(error);
    const ranked = rankByRelevance((data ?? []), norm);
    // Require every query term to appear in brand+name; .or() above matched ANY.
    const strict = ranked.filter((f) => terms.every((t) => hayOf(f).includes(t)));
    if (strict[0])
        return strict[0];
    // Loose fallback, but it must still be ABOUT the query — see looselyRelevant.
    const meaningful = terms.filter((t) => t.length >= 3);
    if (meaningful.length) {
        const best = ranked.find((f) => looselyRelevant(f, meaningful));
        if (best)
            return best;
    }
    return null;
}
export async function mustResolve(ref) {
    const f = await resolveFragrance(ref);
    if (!f)
        throw new Error(`No fragrance found matching "${ref}". Try search_fragrances first.`);
    return f;
}
export async function searchFragrances(f, opts = {}) {
    const limit = Math.min(f.limit ?? 10, 25);
    let q = activeOnly(supabase.from("fragrances").select(FRAG_COLUMNS));
    const norm = f.query ? normalizeQuery(f.query) : "";
    const terms = norm.split(/\s+/).filter(Boolean);
    if (terms.length) {
        q = q.or(terms.map((t) => `name_normalized.ilike.%${t}%,slug.ilike.%${t}%`).join(","));
    }
    if (f.fragrance_family)
        q = q.ilike("fragrance_family", `%${normalizeQuery(f.fragrance_family)}%`);
    if (f.gender)
        q = q.eq("gender", f.gender);
    if (f.price_min != null)
        q = q.gte("retail_msrp_usd_cents", f.price_min * 100);
    if (f.price_max != null)
        q = q.lte("retail_msrp_usd_cents", f.price_max * 100);
    const { data, error } = await q
        .order("popularity_tier", { ascending: false, nullsFirst: false })
        .limit(opts.maxRows ?? (terms.length ? 80 : limit));
    if (error)
        dbFail(error);
    let rows = (data ?? []);
    if (f.brand) {
        const b = normalizeQuery(f.brand);
        rows = rows.filter((r) => (r.brand?.name ?? "").toLowerCase().includes(b));
    }
    if (terms.length) {
        const ranked = rankByRelevance(rows, norm);
        const strict = ranked.filter((r) => terms.every((t) => hayOf(r).includes(t)));
        if (strict.length) {
            rows = strict;
        }
        else {
            // No row carries every term. Keep only rows that are still plausibly about
            // the query (see looselyRelevant) rather than falling back to the whole
            // `.or()` result set — that fallback answered a nonsense query with the
            // catalog's most popular fragrances.
            const meaningful = terms.filter((t) => t.length >= 3);
            rows = meaningful.length ? ranked.filter((r) => looselyRelevant(r, meaningful)) : ranked;
        }
    }
    return rows.slice(0, opts.maxRows ?? limit);
}
/** Curated dupes for a fragrance, cheapest-credible first. */
export async function findDupes(ref) {
    const { data, error } = await supabase
        .from("fragrance_dupes")
        .select("match_pct,source,note,dupe:fragrances!fragrance_dupes_dupe_id_fkey(" + FRAG_COLUMNS + ")")
        .eq("original_id", ref.id)
        .order("match_pct", { ascending: false })
        .limit(10);
    if (error)
        dbFail(error);
    return (data ?? []).filter((d) => d.dupe);
}
/**
 * Similar fragrances: curated precomputed edges when they exist; otherwise a
 * deterministic accord/note-overlap fallback (coverage of the curated table
 * is partial). The method used is labeled in the result.
 */
export async function findSimilar(ref, limit) {
    const { data, error } = await supabase
        .from("fragrance_similars")
        .select("similarity,rank,similar:fragrances!fragrance_similars_similar_id_fkey(" + FRAG_COLUMNS + ")")
        .eq("fragrance_id", ref.id)
        .order("rank", { ascending: true })
        .limit(limit);
    if (error)
        dbFail(error);
    const curated = (data ?? []).filter((s) => s.similar);
    if (curated.length) {
        return { method: "curated_ranking", entries: curated };
    }
    // Fallback: accord + note Jaccard over a bounded same-family pool.
    let q = activeOnly(supabase.from("fragrances").select(FRAG_COLUMNS)).neq("id", ref.id);
    if (ref.fragrance_family)
        q = q.eq("fragrance_family", ref.fragrance_family);
    const { data: pool, error: pErr } = await q
        .order("popularity_tier", { ascending: false, nullsFirst: false })
        .limit(400);
    if (pErr)
        dbFail(pErr);
    const refSet = new Set([...(ref.top_accords ?? []), ...allNotes(ref)].map((x) => x.toLowerCase()));
    const scored = (pool ?? [])
        .map((f) => {
        const set = [...(f.top_accords ?? []), ...allNotes(f)].map((x) => x.toLowerCase());
        const inter = set.filter((x) => refSet.has(x)).length;
        const union = new Set([...set, ...refSet]).size || 1;
        return { similarity: Math.round((inter / union) * 100) / 100, rank: 0, similar: f };
    })
        .filter((s) => s.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    return { method: "accord_overlap", entries: scored };
}
export function sharedAccords(a, b) {
    const sb = new Set((b.top_accords ?? []).map((x) => x.toLowerCase()));
    return (a.top_accords ?? []).filter((x) => sb.has(x.toLowerCase()));
}
export function allNotes(f) {
    return [...(f.top_notes ?? []), ...(f.heart_notes ?? []), ...(f.base_notes ?? [])];
}
/**
 * Trending = most wardrobe adds in the last 30 days. Needs the service-role
 * key (wardrobe rows are user-scoped under RLS); falls back to catalog
 * popularity on the publishable key. The method used is labeled either way.
 */
export async function trendingFragrances(limit) {
    if (hasServiceKey) {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data, error } = await supabase
            .from("wardrobe_items")
            .select("fragrance_id,created_at")
            .not("fragrance_id", "is", null)
            .gte("created_at", since);
        if (!error && data?.length) {
            const counts = new Map();
            for (const row of data)
                counts.set(row.fragrance_id, (counts.get(row.fragrance_id) ?? 0) + 1);
            const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit);
            // GOTCHA (see memory: perfumepicks-slug-vs-uuid): wardrobe_items keys
            // fragrances by SLUG, not UUID. Handle both shapes defensively.
            const uuids = top.filter(([id]) => UUID_RE.test(id)).map(([id]) => id);
            const slugs = top.filter(([id]) => !UUID_RE.test(id)).map(([id]) => id);
            const fetches = await Promise.all([
                uuids.length
                    ? supabase.from("fragrances").select(FRAG_COLUMNS).in("id", uuids)
                    : Promise.resolve({ data: [], error: null }),
                slugs.length
                    ? supabase.from("fragrances").select(FRAG_COLUMNS).in("slug", slugs)
                    : Promise.resolve({ data: [], error: null }),
            ]);
            if (!fetches.some((r) => r.error)) {
                const frags = [...(fetches[0].data ?? []), ...(fetches[1].data ?? [])];
                const byKey = new Map();
                for (const f of frags) {
                    byKey.set(f.id, f);
                    byKey.set(f.slug, f);
                }
                const resolved = top.filter(([id]) => byKey.has(id));
                if (resolved.length) {
                    return {
                        method: "wardrobe_adds_last_30_days",
                        fragrances: resolved.map(([id, n]) => ({ fragrance: byKey.get(id), wardrobe_adds_30d: n })),
                    };
                }
            }
        }
    }
    const { data, error } = await activeOnly(supabase.from("fragrances").select(FRAG_COLUMNS))
        .not("popularity_tier", "is", null)
        .order("popularity_tier", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit);
    if (error)
        dbFail(error);
    return {
        method: "catalog_popularity_tier",
        fragrances: (data ?? []).map((f) => ({
            fragrance: f,
            wardrobe_adds_30d: null,
        })),
    };
}
