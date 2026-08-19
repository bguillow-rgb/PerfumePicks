-- Brand-aware fuzzy fallback.
--
-- The exact keyword search (client, useCatalogStore) is already brand-aware: it
-- detects which query tokens name a brand, strips them, and searches the rest
-- against the fragrance name within that brand. So "afnan mystique" resolves.
--
-- The FUZZY fallback (fuzzy_fragrance_search, 202607180900) was NOT: it ranked
-- purely on similarity(name_normalized, query). So a TYPO'd brand-prefixed query
-- ("afnan mystiqe", "pdm valaa") fell through both — exact can't substring-match
-- the typo, and fuzzy scored the brand word as noise against the fragrance name.
--
-- FIX: rank on the GREATER of two similarities —
--   (a) name only            — preserves single-word typos ("opim"→Opium); the
--                              brand words must NOT dilute these, so name-only
--                              stays a first-class signal.
--   (b) "brand name + name"  — lets a brand-prefixed query match the whole blob.
-- greatest() means (b) can only ever ADD matches, never lower an existing (a)
-- score, so nothing that resolved before can regress.
--
-- The name_normalized trigram index still backs the (a) prefilter; the (b) term
-- is computed. This RPC only runs as a fallback when exact returns zero (low
-- volume — see monitor-fuzzy-search), so the extra scan is negligible.

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
  select f.id,
         greatest(
           similarity(f.name_normalized, nq.n),
           similarity(pp_normalize(coalesce(b.name, '') || ' ' || f.name), nq.n)
         ) as sim
  from fragrances f
  left join brands b on b.id = f.brand_id, nq
  where f.is_active
    and (f.source is null or f.source <> 'aromapassions')  -- hide inspired-by dupes
    and nq.n <> ''
    and (
      f.name_normalized % nq.n                                        -- index-backed
      or pp_normalize(coalesce(b.name, '') || ' ' || f.name) % nq.n   -- brand+name
    )
    and greatest(
          similarity(f.name_normalized, nq.n),
          similarity(pp_normalize(coalesce(b.name, '') || ' ' || f.name), nq.n)
        ) >= min_sim
  order by sim desc
  limit lim;
$$;

grant execute on function fuzzy_fragrance_search(text, int, real) to anon, authenticated;

notify pgrst, 'reload schema';
