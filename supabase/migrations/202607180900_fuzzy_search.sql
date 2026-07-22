-- Typo-tolerant catalog search — the fuzzy fallback.
--
-- PROBLEM (from real search_no_results telemetry): ~half of DNA-picker searches
-- returned nothing, and the misses were mostly bottles we HAVE:
--   "opim"             -> Opium (32 in catalog), one dropped letter, zero results
--   "love dont be shy" -> Kilian "love don t be shy" IS in the catalog, but the
--                         apostrophe became a space at import ("don t"), so the
--                         literal ilike '%love dont be shy%' never matched
--   "lataffa"/"latafa" -> Lattafa, transposed letters
--   "wahwa"            -> Wahwah, missing letter
-- Exact ilike has no tolerance for a single typo or a punctuation-spacing gap.
-- This is an activation leak: people seed their DNA by searching bottles they own.
--
-- FIX: a trigram-similarity fallback. pg_trgm + a name_normalized trigram index
-- already exist. When the client's exact search returns nothing, it calls this
-- RPC, which ranks by similarity(name_normalized, normalized query). Trigrams
-- treat "love dont be shy" vs "love don t be shy" as nearly identical (one space)
-- and "opim" vs "opium" as close, so both resolve.
--
-- Returns ids + score only; the client re-fetches full rows through its normal
-- select (which embeds the brand) and reorders by score. min_sim is a parameter
-- so the threshold can be tuned against real failed queries without a redeploy.

create or replace function fuzzy_fragrance_search(
  q       text,
  lim     int  default 20,
  min_sim real default 0.3
)
returns table (id uuid, sim real)
language sql
stable
as $$
  with nq as (select pp_normalize(q) as n)
  select f.id, similarity(f.name_normalized, nq.n) as sim
  from fragrances f, nq
  where f.is_active
    and (f.source is null or f.source <> 'aromapassions')  -- hide inspired-by dupes, same as keyword search
    and nq.n <> ''
    and f.name_normalized % nq.n                            -- trigram index-backed prefilter
    and similarity(f.name_normalized, nq.n) >= min_sim
  order by sim desc
  limit lim;
$$;

-- Readable by anyone (public catalog data); callable by the anon/auth client.
grant execute on function fuzzy_fragrance_search(text, int, real) to anon, authenticated;

notify pgrst, 'reload schema';
