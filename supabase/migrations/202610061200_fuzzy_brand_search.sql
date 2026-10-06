-- Brand-typo repair for catalog search.
--
-- fuzzy_fragrance_search scores a query against bottle names (and brand+bottle
-- text) with similarity(), which compares WHOLE strings. A misspelled brand on
-- its own - "lataffa", "luis vutton" - scores low against "lattafa khamrah"
-- purely because of the length difference, so it never clears the threshold and
-- the user sees nothing, though Lattafa alone has 151 bottles in the catalog.
--
-- This scores the query against brand names only. Tested against the 34
-- distinct searches that returned nothing between 2026-08-01 and 2026-10-05:
-- the real brand typos scored 0.44-0.45 and every catalog-gap query (zara,
-- dossier, puma, noyz...) scored <= 0.30. The client calls this at 0.42.
--
-- word_similarity() over brand+bottle text was tested and rejected: it rescued
-- "lataffa" at 0.50 but scored "zara" -> "Oud Zarian" and "puma" -> "Pumpkin Pie"
-- at 0.60, so no threshold separated rescues from confident nonsense.
--
-- Additive: a new function, nothing existing changes, so builds that predate it
-- are unaffected.

create or replace function public.fuzzy_brand_search(
  q       text,
  min_sim real default 0.42
)
returns table (id uuid, sim real)
language sql
stable
set search_path = public
as $$
  with nq as (select pp_normalize(q) as n)
  select b.id, similarity(b.name_normalized, nq.n) as sim
  from brands b, nq
  where length(nq.n) >= 4                                   -- shorter is too ambiguous to call a brand
    and similarity(b.name_normalized, nq.n) >= min_sim
    and exists (                                            -- never route to a house with nothing to show
      select 1 from fragrances f
      where f.brand_id = b.id and f.is_active
        and (f.source is null or f.source <> 'aromapassions')
    )
  order by sim desc
  limit 3;
$$;

grant execute on function public.fuzzy_brand_search(text, real) to anon, authenticated;
notify pgrst, 'reload schema';
