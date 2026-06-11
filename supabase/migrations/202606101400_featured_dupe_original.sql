-- Perfume Picks — featured dupe original (Home module fallback seed).
--
-- The Home "Budget Dupes" module is object-anchored: it leads with a specific
-- bottle the user wishlisted ('want') or owns ('have'). When the user has no
-- wardrobe item that actually has curated dupes, we still want the module to
-- show something compelling rather than vanish — so we fall back to the single
-- original that has the MOST curated dupes (and, as a tiebreak, the priciest,
-- for the biggest "smell rich for less" savings story).
--
-- Curated-only + buyable-dupe filters mirror get_dupe_count() exactly, so the
-- returned slug is guaranteed to yield rows from get_dupes(). Returns the slug
-- (text) or NULL when the catalog has no curated dupes at all.

create or replace function get_featured_dupe_original()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select o.slug
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  where o.is_active = true
    and d.is_active = true
    and d.purchasable = true
    and fd.source in ('seed', 'editorial')   -- curated only (see get_dupes note)
  group by o.id, o.slug, o.retail_msrp_usd_cents
  order by count(*) desc,
           coalesce(o.retail_msrp_usd_cents, 0) desc
  limit 1;
$$;

grant execute on function get_featured_dupe_original() to anon, authenticated;
comment on function get_featured_dupe_original() is
  'Slug of the original with the most curated, buyable dupes (tiebreak: priciest). Default seed for the Home Budget Dupes module when the user has no wardrobe item with dupes. NULL when no curated dupes exist.';
