-- Perfume Picks — two-tier dupe model: VERIFIED (Budget Dupes) + COMMUNITY.
--
-- Until now fragrance_dupes.source was ('algo','seed','editorial') and get_dupes
-- rendered only ('seed','editorial') — hand-curated truth. We're scaling dupe
-- coverage to all costly bottles using clone-house data, split into two clearly
-- separated product features with different trust levels:
--
--   VERIFIED  (rendered as "Budget Dupes")
--     • editorial / seed  — founder-curated, as before
--     • clone_house       — a clone house formulated the product TO BE a clone
--       of a specific original and declares it (or there is one overwhelming,
--       unambiguous consensus original). Treated as ground truth.
--
--   COMMUNITY (rendered as "Community Dupes", explicitly labelled as opinion)
--     • community         — crowd consensus (Reddit / Fragrantica "smells like",
--       or a clone house's ambiguous/contested mapping). Shown ONLY when there
--       is no verified dupe for the original, and always with an "unverified —
--       what the community says" disclaimer in the UI.
--
-- 'algo' stays in the enum (the precompute swap path still references it) but is
-- never rendered by any RPC — accord-overlap alone produces confident false
-- dupe claims, which is exactly why dupes are curated/declared only.

-- ------------------------------------------------------------------
-- 1. Widen the source vocabulary
-- ------------------------------------------------------------------
alter table fragrance_dupes drop constraint if exists fragrance_dupes_source_check;
alter table fragrance_dupes
  add constraint fragrance_dupes_source_check
  check (source in ('algo', 'seed', 'editorial', 'clone_house', 'community'));

comment on table fragrance_dupes is
  'Original -> cheaper-dupe pairs. Trust tiers: VERIFIED = editorial>seed>clone_house (rendered as Budget Dupes); COMMUNITY = community (rendered separately as Community Dupes, opinion-only, shown only when no verified dupe exists). algo is never rendered.';

-- Precompute safety: swap_algo_dupes() must keep clearing ONLY source='algo' so
-- curated + clone_house + community rows survive every run. It already filters on
-- source='algo' (202606071200), so no change needed — asserted here for the record.

-- ------------------------------------------------------------------
-- 2. Repoint VERIFIED dupes to include clone_house
-- get_dupes / get_dupe_count are the "Budget Dupes" surface. Add clone_house to
-- the rendered set and to the ranking precedence (editorial > seed > clone_house).
-- ------------------------------------------------------------------
create or replace function get_dupes(p_slug text)
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
as $get_dupes$
  with const as (
    select 1 as free_limit               -- FREE_DUPE_LIMIT: top-N revealed to non-Pro (A/B here)
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
      (coalesce(o.retail_msrp_usd_cents,0) - coalesce(d.retail_msrp_usd_cents,0)) as price_delta_cents,
      fd.source,
      (fd.match_pct < 70)                               as is_loose,
      row_number() over (
        order by
          case fd.source
            when 'editorial'   then 0
            when 'seed'        then 1
            when 'clone_house' then 2
            else 3
          end,
          fd.match_pct desc,
          (coalesce(o.retail_msrp_usd_cents,0) - coalesce(d.retail_msrp_usd_cents,0)) desc
      ) as rn
    from fragrances o
    join fragrance_dupes fd on fd.original_id = o.id
    join fragrances d       on d.id = fd.dupe_id
    join brands b           on b.id = d.brand_id
    where o.slug = p_slug
      and d.is_active = true
      and d.purchasable = true
      -- VERIFIED tier only. clone_house = a clone house declared/consensus-cloned
      -- THIS specific original (ground truth); editorial/seed = founder-curated.
      -- community + algo are excluded here — community renders in get_community_dupes,
      -- algo never renders (accord overlap produces confident false dupe claims).
      and fd.source in ('seed', 'editorial', 'clone_house')
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
  where is_pro_user(auth.uid()) or r.rn <= c.free_limit
  order by r.rn
$get_dupes$;

grant execute on function get_dupes(text) to anon, authenticated;
comment on function get_dupes(text) is
  'VERIFIED ("Budget Dupes") ranked dupes for an original (by slug). source in editorial>seed>clone_house. Freemium: non-Pro gets top FREE_DUPE_LIMIT, Pro all. Use get_dupe_count() for the locked count. Community-tier dupes live in get_community_dupes().';

create or replace function get_dupe_count(p_slug text)
returns int
language sql
security definer
stable
set search_path = public
as $get_dupe_count$
  select count(*)::int
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  where o.slug = p_slug
    and d.is_active = true
    and d.purchasable = true
    and fd.source in ('seed', 'editorial', 'clone_house')   -- VERIFIED only
$get_dupe_count$;

grant execute on function get_dupe_count(text) to anon, authenticated;
comment on function get_dupe_count(text) is
  'Public count of VERIFIED dupes (Budget Dupes) for an original. Powers the Pro upsell teaser without leaking gated rows.';

-- get_featured_dupe_original() (202606101400) selects the Home seed from the most-
-- duped original. Keep it consistent with the VERIFIED tier so the Home Budget
-- Dupes module never seeds off a community-only original.
create or replace function get_featured_dupe_original()
returns text
language sql
security definer
stable
set search_path = public
as $get_featured$
  select o.slug
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  where o.is_active = true
    and d.is_active = true
    and d.purchasable = true
    and fd.source in ('seed', 'editorial', 'clone_house')   -- VERIFIED only
  group by o.id, o.slug, o.retail_msrp_usd_cents
  order by count(*) desc,
           coalesce(o.retail_msrp_usd_cents, 0) desc
  limit 1
$get_featured$;

grant execute on function get_featured_dupe_original() to anon, authenticated;

-- ------------------------------------------------------------------
-- 3. COMMUNITY dupes — separate surface, opinion-only
-- get_community_dupes mirrors get_dupes' row shape so the client can reuse the
-- DupeList mapping, but reads ONLY source='community'. No freemium gate: the
-- community list is a goodwill / coverage feature, fully visible. The UI labels
-- it explicitly as unverified community opinion.
-- ------------------------------------------------------------------
create or replace function get_community_dupes(p_slug text, p_limit int default 12)
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
as $get_community$
  select
    d.slug as id, d.slug as slug, d.name, b.name as brand_name,
    d.concentration, d.fragrance_family, d.gender,
    d.top_notes, d.heart_notes, d.base_notes,
    d.top_accords, d.accord_intensity,
    d.community_longevity, d.community_sillage, d.community_projection,
    d.compliment_score, d.versatility_score, d.office_safe_score,
    d.price_tier, d.retail_msrp_usd_cents, d.image_url, d.release_year,
    d.notes_verified,
    fd.match_pct,
    (coalesce(o.retail_msrp_usd_cents,0) - coalesce(d.retail_msrp_usd_cents,0)) as price_delta_cents,
    fd.source,
    (fd.match_pct < 70) as is_loose,
    false as locked
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  join brands b           on b.id = d.brand_id
  where o.slug = p_slug
    and d.is_active = true
    and d.purchasable = true
    and fd.source = 'community'
  order by fd.match_pct desc,
           (coalesce(o.retail_msrp_usd_cents,0) - coalesce(d.retail_msrp_usd_cents,0)) desc
  limit p_limit
$get_community$;

grant execute on function get_community_dupes(text, int) to anon, authenticated;
comment on function get_community_dupes(text, int) is
  'COMMUNITY ("Community Dupes") matches for an original (by slug). source=community only — crowd consensus, NOT verified. Fully visible (no freemium gate). UI must label these as unverified community opinion. Show only when get_dupe_count()=0.';

create or replace function get_community_dupe_count(p_slug text)
returns int
language sql
security definer
stable
set search_path = public
as $get_community_count$
  select count(*)::int
  from fragrances o
  join fragrance_dupes fd on fd.original_id = o.id
  join fragrances d       on d.id = fd.dupe_id
  where o.slug = p_slug
    and d.is_active = true
    and d.purchasable = true
    and fd.source = 'community'
$get_community_count$;

grant execute on function get_community_dupe_count(text) to anon, authenticated;
comment on function get_community_dupe_count(text) is
  'Public count of COMMUNITY-tier dupes for an original. Lets the UI decide whether to render the Community Dupes section.';
