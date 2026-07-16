-- Perfume Picks — render clone_house dupes, and stop inventing savings numbers.
--
-- WHY
-- get_dupes() allow-listed source in ('seed','editorial') only. That was written
-- before the clone_house / community tiers existed (202606111200) and was never
-- widened, so of 334 rows in fragrance_dupes only 13 could ever render, on
-- exactly 10 originals out of a 13,100 catalog. The paywall's lead bullet
-- ("Find Cheaper Dupes Instantly") was backed by ten bottles.
--
-- clone_house is the right tier to render and always was. Per
-- scripts/import-clone-dupes.ts, it means: "a clone house formulated the product
-- TO BE a clone of one specific original and declares it, OR there is one
-- overwhelming/unambiguous consensus original", and the script header already
-- marks it "VERIFIED — renders in Budget Dupes". Spot-checked 2026-07-16: the
-- pairs are declared clones ("AromaPassions Noir Extreme (Inspired)" -> Tom Ford
-- Noir Extreme; Lattafa Khamrah -> Kilian Angels' Share). All 308 rows have a
-- purchasable, active dupe. This takes renderable originals 10 -> 305.
--
-- It does NOT weaken the curated-only rule the original header set out. algo
-- (accord-overlap) rows still never render as dupes: an inferred similarity is
-- not a clone, and 65% of notes_source is null / 22% llm-inferred, so scoring
-- accords into "dupe" claims would manufacture confident false ones. Accord
-- similarity belongs in get_similars(), under different wording.
--
-- THE PRICE BUG (would have shipped a fabricated number on 189 of 308 pairs)
-- price_delta_cents was coalesce(o.retail_msrp,0) - coalesce(d.retail_msrp,0).
-- 305 of 308 clone_house dupes have retail_msrp_usd_cents NULL: their real price
-- lives in fragrance_retailer_links (all 308 have a priced link). With a NULL
-- dupe price the expression returns the FULL original price as "savings" —
-- "Baccarat Rouge 540 (Inspired): save $220", implying the dupe is free.
-- Fixed by pricing the dupe from its cheapest in-stock retailer link, falling
-- back to msrp, and returning NULL (not a lie) when neither side has a price.
--
-- Also: the ranking case only knew 'editorial' and 'seed', so clone_house would
-- have tied with community. Ranked explicitly now.

drop function if exists get_dupes(text);

create function get_dupes(p_slug text)
returns table (
  id                     text,
  slug                   text,
  name                   text,
  brand_name             text,
  concentration          text,
  fragrance_family       text,
  gender                 text,
  top_notes              text[],
  heart_notes            text[],
  base_notes             text[],
  top_accords            text[],
  accord_intensity       jsonb,
  community_longevity    numeric,
  community_sillage      numeric,
  community_projection   numeric,
  compliment_score       numeric,
  versatility_score      numeric,
  office_safe_score      numeric,
  price_tier             int,
  retail_msrp_usd_cents  int,
  image_url              text,
  release_year           int,
  notes_verified         boolean,
  match_pct              int,
  price_delta_cents      int,
  source                 text,
  is_loose               boolean,
  locked                 boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with const as (
    -- FREE_DUPE_LIMIT: top-N revealed to non-Pro. 1 -> 0 on 2026-07-16.
    --
    -- At 1, free users got the row ranked FIRST, which is the CLOSEST match.
    -- 95% of originals have exactly one dupe, so "free" was the whole list, and
    -- on the rest Pro unlocked only the WORSE matches. We were giving away the
    -- answer and charging for the leftovers, which is a fair explanation for
    -- 5 paywall views and 0 sales.
    --
    -- At 0, get_dupes returns nothing to non-Pro. The detail screen still calls
    -- get_dupe_count() (ungated on purpose) so it can prove dupes EXIST and
    -- route to the paywall, without handing over which bottle it is. The dupe
    -- RELATIONSHIP is the proprietary part: you cannot derive "this $17 bottle
    -- is a clone of that $220 one" by browsing a catalog.
    select 0 as free_limit
  ),
  -- Real, buyable price per fragrance: cheapest in-stock affiliate link. This is
  -- the number the user actually pays, and for clone-house dupes it is the ONLY
  -- price that exists (their retail_msrp is null).
  live_price as (
    select fragrance_id, min(price_cents) as price_cents
    from fragrance_retailer_links
    where price_cents > 0
      and coalesce(in_stock, true)
      and coalesce(link_status, 'ok') <> 'dead'   -- 41 dead links must not set a price
    group by fragrance_id
  ),
  ranked as (
    select
      d.slug                                            as id,
      d.slug                                            as slug,
      d.name,
      b.name                                            as brand_name,
      d.concentration,
      d.fragrance_family,
      d.gender,
      d.top_notes, d.heart_notes, d.base_notes,
      d.top_accords, d.accord_intensity,
      d.community_longevity, d.community_sillage, d.community_projection,
      d.compliment_score, d.versatility_score, d.office_safe_score,
      d.price_tier, d.retail_msrp_usd_cents, d.image_url, d.release_year,
      d.notes_verified,
      fd.match_pct,
      -- Savings only when BOTH sides have a real price. Never coalesce a missing
      -- price to 0: that is what turned "no dupe price" into "save $220".
      case
        when coalesce(op.price_cents, o.retail_msrp_usd_cents) is not null
         and coalesce(dp.price_cents, d.retail_msrp_usd_cents) is not null
        then coalesce(op.price_cents, o.retail_msrp_usd_cents)
           - coalesce(dp.price_cents, d.retail_msrp_usd_cents)
      end                                               as price_delta_cents,
      fd.source,
      (fd.match_pct < 70)                               as is_loose,
      row_number() over (
        order by
          case fd.source
            when 'editorial'   then 0   -- founder-curated
            when 'seed'        then 1   -- founder-curated
            when 'clone_house' then 2   -- house declares it a clone of X
            when 'community'   then 3   -- crowd consensus, weaker
            else 4                      -- algo: never allow-listed below anyway
          end,
          fd.match_pct desc,
          coalesce(dp.price_cents, d.retail_msrp_usd_cents) asc nulls last
      ) as rn
    from fragrances o
    join fragrance_dupes fd on fd.original_id = o.id
    join fragrances d       on d.id = fd.dupe_id
    join brands b           on b.id = d.brand_id
    left join live_price op on op.fragrance_id = o.id
    left join live_price dp on dp.fragrance_id = d.id
    where o.slug = p_slug
      and d.is_active = true
      and d.purchasable = true
      -- DECLARED CLONES ONLY. A "dupe" is a deliberate clone of a SPECIFIC
      -- fragrance: either founder-curated, or a clone house that formulated and
      -- markets it as a clone of that original. Algorithmic accord-overlap
      -- matches produce confident FALSE claims (e.g. "Montale Starry Night is a
      -- dupe of J.Lo Enduring Glow") that destroy trust, so 'algo' is still
      -- excluded here on purpose. Accord similarity powers get_similars()
      -- instead, which must never use the word "dupe".
      and fd.source in ('seed', 'editorial', 'clone_house', 'community')
  )
  select
    r.id, r.slug, r.name, r.brand_name, r.concentration, r.fragrance_family, r.gender,
    r.top_notes, r.heart_notes, r.base_notes, r.top_accords, r.accord_intensity,
    r.community_longevity, r.community_sillage, r.community_projection,
    r.compliment_score, r.versatility_score, r.office_safe_score,
    r.price_tier, r.retail_msrp_usd_cents, r.image_url, r.release_year, r.notes_verified,
    r.match_pct, r.price_delta_cents, r.source, r.is_loose,
    false as locked
  from ranked r, const c
  -- Freemium gate: Pro sees all; non-Pro sees only the top free_limit rows.
  -- The withheld rows never leave the DB (can't be read off the wire).
  where is_pro_user(auth.uid()) or r.rn <= c.free_limit
  order by r.rn;
$$;

grant execute on function get_dupes(text) to anon, authenticated;
comment on function get_dupes(text) is
  'Freemium ranked dupes for an original (by slug). DECLARED clones only (seed/editorial/clone_house/community) — never algo, which would assert false clone claims; accord similarity belongs to get_similars(). price_delta_cents prices both sides from the cheapest in-stock affiliate link (falling back to msrp) and is NULL when either side has no price, so a missing dupe price can never render as "save $<full original price>".';

-- get_dupe_count() drives the locked-row teaser; keep its allow-list in step
-- with get_dupes or the "N more locked" number lies about what Pro unlocks.
drop function if exists get_dupe_count(text);

create function get_dupe_count(p_slug text)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  where o.slug = p_slug
    and d.is_active = true
    and d.purchasable = true
    and fd.source in ('seed', 'editorial', 'clone_house', 'community');
$$;

grant execute on function get_dupe_count(text) to anon, authenticated;
comment on function get_dupe_count(text) is
  'Total DECLARED dupes for an original, ignoring the freemium gate. Allow-list must match get_dupes().';
