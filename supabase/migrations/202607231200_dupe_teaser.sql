-- Dupe teaser aggregate — the savings-anchored hook for the freemium gate.
--
-- get_dupes() returns ZERO rows to non-Pro on purpose (free_limit = 0): the dupe
-- RELATIONSHIP (which cheap bottle clones which expensive one) is the paid
-- product and must never leave the DB for a free user. But the SAVINGS and the
-- MATCH QUALITY are not identifying — "there's a 92% match that saves you $247"
-- tells you nothing about WHICH bottle it is. Surfacing those two numbers turns
-- the locked footer from a generic "N dupes — unlock" into a concrete
-- "save up to $247 on a 92% match — unlock to see which bottles", which is the
-- tension that should actually convert.
--
-- Like get_dupe_count(), this is intentionally UNGATED (no is_pro_user check):
-- it returns only non-identifying aggregates. The source allow-list MUST stay in
-- sync with get_dupes() so the teaser never advertises a dupe get_dupes wouldn't
-- return.

create or replace function get_dupe_teaser(p_slug text)
returns table (dupe_count int, best_match_pct int, max_savings_cents int)
language sql
stable
set search_path = public
as $$
  with live_price as (
    select fragrance_id, min(price_cents) as price_cents
    from fragrance_retailer_links
    where price_cents > 0
      and coalesce(in_stock, true)
      and coalesce(link_status, 'ok') <> 'dead'
    group by fragrance_id
  ),
  ranked as (
    select
      fd.match_pct,
      -- Same savings rule as get_dupes: only when BOTH sides have a real price;
      -- never coalesce a missing price to 0 (that produced phantom "$220 saved").
      case
        when coalesce(op.price_cents, o.retail_msrp_usd_cents) is not null
         and coalesce(dp.price_cents, d.retail_msrp_usd_cents) is not null
        then coalesce(op.price_cents, o.retail_msrp_usd_cents)
           - coalesce(dp.price_cents, d.retail_msrp_usd_cents)
      end as price_delta_cents
    from fragrances o
    join fragrance_dupes fd on fd.original_id = o.id
    join fragrances d       on d.id = fd.dupe_id
    left join live_price op on op.fragrance_id = o.id
    left join live_price dp on dp.fragrance_id = d.id
    where o.slug = p_slug
      and d.is_active = true
      and d.purchasable = true
      -- DECLARED CLONES ONLY — must match get_dupes()'s allow-list exactly.
      and fd.source in ('seed', 'editorial', 'clone_house', 'community')
  )
  select
    count(*)::int                                                    as dupe_count,
    max(match_pct)::int                                              as best_match_pct,
    (max(price_delta_cents) filter (where price_delta_cents > 0))::int as max_savings_cents
  from ranked;
$$;

grant execute on function get_dupe_teaser(text) to anon, authenticated;

comment on function get_dupe_teaser(text) is
  'Non-identifying teaser aggregate for the freemium dupe gate: count, best match %, and max $ savings across an original''s DECLARED dupes — WITHOUT revealing which bottles (the paid relationship). Powers the savings-anchored locked footer. Source allow-list must stay in sync with get_dupes().';
