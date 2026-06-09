-- Migration: Dupes/Similars foundation (M0)
-- Created: 2026-06-07
--
-- Fixes the load-bearing defects behind the Discovery/Dupes/Notes initiative:
--
--   1. The UUID-vs-slug mismatch + dangling-reference rot. Relations used to
--      live as `fragrances.similar_fragrance_ids uuid[]` (unenforceable, rots
--      on delete) and `fragrances.dupe_of uuid` (single dupe, server-truth
--      only). The app keys everything on `slug`, so those relations never
--      resolved client-side. We move BOTH dupes and similars into real
--      FK-constrained tables (ON DELETE CASCADE) and serve them through RPCs
--      that join UUID -> slug server-side. The old columns stay for one
--      release as a fallback, then get dropped.
--
--   2. Catalog completeness vs monetization. `cleanup-non-affiliate-frags.ts`
--      hard-deleted "orphan" fragrances (no affiliate link) — which is exactly
--      the marquee designer originals people want dupes OF. We add a
--      `purchasable` flag so we can keep originals visible (searchable, usable
--      as a dupe "original") without showing a buy button. Deletion is no
--      longer used for monetization filtering.
--
--   3. Notes provenance / trust. `notes_source` + `notes_verified` let the UI
--      show a "verified notes" signal and let the backfill distinguish
--      sourced notes from LLM-inferred accords.
--
-- Dupes are a freemium feature (founder decision): get_dupes() reveals the
-- top FREE_DUPE_LIMIT closest dupes to everyone (the "aha" that proves the
-- engine is real), and gates the rest behind is_pro_user() server-side. A
-- separate get_dupe_count() is public so the UI can render "unlock N more"
-- without leaking the gated rows. The free limit is a single constant in
-- get_dupes() so we can A/B it (1 -> 2 -> 3) from one place.

-- ────────────────────────────────────────────────────────────────────
-- 1. Fragrance columns: purchasable + notes provenance
-- ────────────────────────────────────────────────────────────────────

alter table fragrances
  add column if not exists purchasable    boolean not null default true,
  add column if not exists notes_source   text,
  add column if not exists notes_verified boolean not null default false;

-- Constrain notes_source to a known vocabulary so the trust flag can't be
-- corrupted by a free-text typo. Drop-then-add so re-runs stay idempotent.
alter table fragrances drop constraint if exists fragrances_notes_source_chk;
alter table fragrances add constraint fragrances_notes_source_chk
  check (notes_source is null or notes_source in
    ('fragrantica','parfumo','brand','llm-inferred','manual','community'));

create index if not exists fragrances_purchasable_idx on fragrances (purchasable);

comment on column fragrances.purchasable is
  'True iff we have a working affiliate buy path. False = visible/searchable (and usable as a dupe "original") but no buy button. Replaces the old hard-delete-of-orphans behavior.';
comment on column fragrances.notes_source is
  'Provenance of the note pyramid: fragrantica|parfumo|brand|llm-inferred|manual|community. Drives the "verified notes" trust signal.';
comment on column fragrances.notes_verified is
  'True iff the note pyramid was sourced (not LLM-guessed) and spot-checked. UI shows a verified badge when true.';

-- ────────────────────────────────────────────────────────────────────
-- 2. fragrance_dupes — relational, FK-constrained, bidirectional
-- ────────────────────────────────────────────────────────────────────
--
-- One row per (original -> dupe) pair. `source` precedence is
-- editorial > seed > algo: the precompute job ONLY ever clears/rewrites
-- source='algo' rows, so hand-curated seed/editorial pairs survive every run.

create table if not exists fragrance_dupes (
  id           uuid primary key default gen_random_uuid(),
  original_id  uuid not null references fragrances(id) on delete cascade,
  dupe_id      uuid not null references fragrances(id) on delete cascade,
  match_pct    int  not null check (match_pct between 0 and 100),
  source       text not null default 'algo' check (source in ('algo','seed','editorial')),
  note         text,                          -- editorial reason, e.g. "canonical BR540 clone"
  created_at   timestamptz not null default now(),
  unique (original_id, dupe_id),
  check (original_id <> dupe_id)
);

-- Both directions are queried: "dupes of X" (original_id) and
-- "what is X a dupe of" (dupe_id). UNIQUE gives us the original_id index;
-- add the reverse explicitly so it isn't a table scan.
create index if not exists fragrance_dupes_original_idx on fragrance_dupes (original_id);
create index if not exists fragrance_dupes_dupe_idx     on fragrance_dupes (dupe_id);

comment on table fragrance_dupes is
  'Original -> cheaper-dupe pairs. source precedence editorial>seed>algo; precompute only touches algo rows.';

-- ────────────────────────────────────────────────────────────────────
-- 3. fragrance_similars — replaces fragrances.similar_fragrance_ids uuid[]
-- ────────────────────────────────────────────────────────────────────

create table if not exists fragrance_similars (
  id            uuid primary key default gen_random_uuid(),
  fragrance_id  uuid not null references fragrances(id) on delete cascade,
  similar_id    uuid not null references fragrances(id) on delete cascade,
  similarity    numeric(4,3) not null check (similarity between 0 and 1),
  rank          int not null,
  created_at    timestamptz not null default now(),
  unique (fragrance_id, similar_id),
  check (fragrance_id <> similar_id)
);

create index if not exists fragrance_similars_frag_idx    on fragrance_similars (fragrance_id);
create index if not exists fragrance_similars_similar_idx on fragrance_similars (similar_id);

comment on table fragrance_similars is
  'Precomputed "smells like" relations. Replaces the unenforceable fragrances.similar_fragrance_ids uuid[]. Rows cascade-delete with either fragrance.';

-- ────────────────────────────────────────────────────────────────────
-- 4. RLS: catalog relations are public-read, service-role-write
-- ────────────────────────────────────────────────────────────────────

alter table fragrance_dupes    enable row level security;
alter table fragrance_similars enable row level security;

drop policy if exists fragrance_dupes_public_read on fragrance_dupes;
create policy fragrance_dupes_public_read on fragrance_dupes
  for select to anon, authenticated using (true);

drop policy if exists fragrance_similars_public_read on fragrance_similars;
create policy fragrance_similars_public_read on fragrance_similars
  for select to anon, authenticated using (true);

-- No insert/update/delete policies => writes are service-role-only (bypasses RLS).

-- ────────────────────────────────────────────────────────────────────
-- 5. get_dupes(p_slug) — freemium, joins UUID -> slug, computes savings live
-- ────────────────────────────────────────────────────────────────────
--
-- Returns app-ready rows keyed on slug (id = slug) so the client can map them
-- the same way as FRAGRANCE_SELECT rows. price_delta_cents is computed LIVE
-- from current MSRP (never stored — MSRP drifts).
--
-- Freemium gate (server-side, not bypassable): rows are ranked, then a
-- non-Pro caller gets only the top FREE_DUPE_LIMIT (the single closest dupe by
-- default). A Pro caller gets the full ranked set. The locked remainder never
-- leaves the database for non-Pro callers, so the gated rows can't be read off
-- the wire. Each returned row carries `locked` (always false here — locked rows
-- are simply withheld; the flag exists so a future "blurred row" treatment can
-- be added without another migration).

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
as $$
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
          case fd.source when 'editorial' then 0 when 'seed' then 1 else 2 end,
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
      -- CURATED ONLY. A "dupe" is a deliberate clone of a SPECIFIC fragrance —
      -- human community knowledge, not a similarity score. Algorithmic
      -- accord-overlap matches produce confident FALSE claims (e.g. "Montale
      -- Starry Night is a dupe of J.Lo Enduring Glow") that destroy trust.
      -- Note/accord similarity powers get_similars() instead. Only founder-
      -- curated seed/editorial pairs may render as "dupes".
      and fd.source in ('seed', 'editorial')
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
  'Freemium ranked dupes for an original (by slug). Returns slug-keyed rows + match_pct + live price_delta_cents + source + is_loose. Non-Pro callers get only the top FREE_DUPE_LIMIT rows (constant in-fn); Pro gets all. Use get_dupe_count() to compute how many remain locked.';

-- ────────────────────────────────────────────────────────────────────
-- 6. get_dupe_count(p_slug) — public, powers the Pro upsell teaser
-- ────────────────────────────────────────────────────────────────────

create or replace function get_dupe_count(p_slug text)
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
    and fd.source in ('seed', 'editorial');   -- curated only (see get_dupes note)
$$;

grant execute on function get_dupe_count(text) to anon, authenticated;
comment on function get_dupe_count(text) is
  'Public count of available dupes for an original (by slug). Lets the home/discover teaser show "N cheaper alternatives — unlock with Pro" without leaking the gated results.';

-- ────────────────────────────────────────────────────────────────────
-- 7. get_similars(p_slug) — public "Smells Like" rail, joins UUID -> slug
-- ────────────────────────────────────────────────────────────────────

create or replace function get_similars(p_slug text, p_limit int default 12)
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
  similarity             numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.slug as id, s.slug, s.name, b.name as brand_name,
    s.concentration, s.fragrance_family, s.gender,
    s.top_notes, s.heart_notes, s.base_notes,
    s.top_accords, s.accord_intensity,
    s.community_longevity, s.community_sillage, s.community_projection,
    s.compliment_score, s.versatility_score, s.office_safe_score,
    s.price_tier, s.retail_msrp_usd_cents, s.image_url, s.release_year,
    fs.similarity
  from fragrances o
  join fragrance_similars fs on fs.fragrance_id = o.id
  join fragrances s          on s.id = fs.similar_id
  join brands b              on b.id = s.brand_id
  where o.slug = p_slug
    and s.is_active = true
  order by fs.rank asc
  limit p_limit;
$$;

grant execute on function get_similars(text, int) to anon, authenticated;
comment on function get_similars(text, int) is
  'Public "Smells Like" rail for a fragrance (by slug). Replaces the broken client-side resolution of similar_fragrance_ids uuid[].';

-- ────────────────────────────────────────────────────────────────────
-- 8. Staging tables + atomic swap RPCs for similarity-precompute v2
-- ────────────────────────────────────────────────────────────────────
--
-- The precompute job computes relations in JS, bulk-inserts them into UNLOGGED
-- staging tables (chunked, fast), then calls a swap RPC that replaces the live
-- rows in a SINGLE transaction. This removes the old split-brain failure mode
-- (row-by-row UPDATE that left half the catalog stale on a crash) and
-- preserves hand-curated seed/editorial dupe pairs (only 'algo' rows are
-- swapped). Staging tables and swap RPCs are service-role only.

create unlogged table if not exists fragrance_dupes_staging (
  original_id uuid not null,
  dupe_id     uuid not null,
  match_pct   int  not null
);

create unlogged table if not exists fragrance_similars_staging (
  fragrance_id uuid not null,
  similar_id   uuid not null,
  similarity   numeric(4,3) not null,
  rank         int not null
);

-- Staging tables are service-role-only: enable RLS with no policies so they are
-- never reachable by anon/authenticated (service role bypasses RLS for the swap).
alter table fragrance_dupes_staging    enable row level security;
alter table fragrance_similars_staging enable row level security;

-- Swap algo dupes: clear only source='algo', re-insert from staging, and skip
-- any pair that already exists as seed/editorial (ON CONFLICT DO NOTHING).
create or replace function swap_algo_dupes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare inserted int;
begin
  delete from fragrance_dupes where source = 'algo';
  insert into fragrance_dupes (original_id, dupe_id, match_pct, source)
  select s.original_id, s.dupe_id, s.match_pct, 'algo'
  from fragrance_dupes_staging s
  -- guard against staging dupes / self-pairs
  where s.original_id <> s.dupe_id
  on conflict (original_id, dupe_id) do nothing;   -- seed/editorial wins
  get diagnostics inserted = row_count;
  truncate fragrance_dupes_staging;
  return inserted;
end;
$$;
revoke all on function swap_algo_dupes() from anon, authenticated;
comment on function swap_algo_dupes() is
  'Atomically replaces source=algo dupe rows from fragrance_dupes_staging, preserving seed/editorial pairs. Service-role only.';

-- Swap similars: fully algo data, replace wholesale in one transaction.
create or replace function swap_similars()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare inserted int;
begin
  truncate fragrance_similars;
  insert into fragrance_similars (fragrance_id, similar_id, similarity, rank)
  select s.fragrance_id, s.similar_id, s.similarity, s.rank
  from fragrance_similars_staging s
  where s.fragrance_id <> s.similar_id
  on conflict (fragrance_id, similar_id) do nothing;
  get diagnostics inserted = row_count;
  truncate fragrance_similars_staging;
  return inserted;
end;
$$;
revoke all on function swap_similars() from anon, authenticated;
comment on function swap_similars() is
  'Atomically replaces all fragrance_similars rows from fragrance_similars_staging. Service-role only.';
