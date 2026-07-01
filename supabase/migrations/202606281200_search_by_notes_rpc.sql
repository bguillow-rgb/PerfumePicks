-- RPC: multi-note AND search.
-- Returns slugs of active fragrances whose notes/accords contain EVERY
-- supplied term (case-insensitive substring match). Powers the Discover
-- search box when the user lists multiple notes, e.g. "coconut and musk".
--
-- Each term must appear in at least one of: top_notes, heart_notes,
-- base_notes, or top_accords. AND across terms = the bottle must carry
-- all of them. Mirrors the keyword-search exclusions (inactive rows and
-- AromaPassions inspired-by dupes are hidden).

create or replace function fragrances_matching_notes(
  note_terms text[],
  match_genders text[] default null,
  result_limit int default 200
)
returns table (slug text)
language sql stable security definer set search_path = public as $$
  select f.slug
  from fragrances f
  where f.is_active = true
    and (f.source is null or f.source <> 'aromapassions')
    and (match_genders is null or f.gender = any (match_genders))
    and (
      -- Every term must match at least one note/accord on this bottle.
      select bool_and(
        exists (
          select 1
          from unnest(
            coalesce(f.top_notes,   '{}'::text[]) ||
            coalesce(f.heart_notes, '{}'::text[]) ||
            coalesce(f.base_notes,  '{}'::text[]) ||
            coalesce(f.top_accords, '{}'::text[])
          ) as n(val)
          where n.val ilike '%' || term || '%'
        )
      )
      from unnest(note_terms) as t(term)
      where length(trim(term)) > 0
    )
  -- Purchasable bottles first, then most expensive → cheapest as you scroll.
  order by f.purchasable desc nulls last, f.retail_msrp_usd_cents desc nulls last
  limit result_limit;
$$;

grant execute on function fragrances_matching_notes(text[], text[], int) to anon, authenticated;

comment on function fragrances_matching_notes(text[], text[], int) is
  'Multi-note AND search: slugs of active fragrances whose notes/accords contain every supplied term (case-insensitive). Powers Discover multi-note search.';
