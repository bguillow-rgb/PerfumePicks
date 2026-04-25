-- Perfume Picks v1 schema — LOCKED.
--
-- StickPicks shipped with 13 migrations because the data model wasn't fully
-- designed up front. This single migration encodes every field the spec calls
-- for. New columns may be added in later migrations only when a feature
-- explicitly requires them; do NOT split this into multiple files.
--
-- Conventions:
--   - All ids: uuid, default gen_random_uuid().
--   - All timestamps: timestamptz, default now().
--   - All text arrays: text[] (Postgres native array), not jsonb, so we get
--     GIN-index support for accord/note overlap queries.
--   - Numeric scores: numeric(3,2) in [0..1] unless documented otherwise.
--   - All user-owned tables: row-level security ON by default; policies in
--     002_rls_policies.sql.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";  -- fuzzy fragrance name search

-- ------------------------------------------------------------------
-- BRANDS
-- ------------------------------------------------------------------
create table if not exists brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  slug          text not null unique,
  country       text,
  founded_year  int,
  tier          text check (tier in ('niche','designer','indie','mass')),
  logo_url      text,
  website_url   text,
  created_at    timestamptz not null default now()
);

create index brands_slug_idx on brands (slug);
create index brands_tier_idx on brands (tier);

-- ------------------------------------------------------------------
-- FRAGRANCES (the catalog)
-- ------------------------------------------------------------------
create table if not exists fragrances (
  id                       uuid primary key default gen_random_uuid(),
  brand_id                 uuid not null references brands(id) on delete restrict,
  name                     text not null,
  slug                     text not null unique,
  release_year             int,

  concentration            text check (concentration in
                            ('parfum','edp','edt','cologne','extrait','oil','solid','mist')),

  fragrance_family         text,         -- e.g. 'oriental','floral','woody','fresh'
  gender                   text check (gender in ('feminine','masculine','unisex')),

  -- Notes pyramid
  top_notes                text[] not null default '{}',
  heart_notes              text[] not null default '{}',
  base_notes               text[] not null default '{}',

  -- Accord system (the differentiator)
  top_accords              text[] not null default '{}',
  accord_intensity         jsonb  not null default '{}'::jsonb,   -- { "woody": 5, "sweet": 3, ... }

  -- Performance (community-aggregated)
  community_longevity      numeric(3,2),                          -- 0..5
  community_sillage        numeric(3,2),                          -- 0..5
  community_projection     numeric(3,2),                          -- 0..5

  -- Derived scores (computed by enrichment LLM + reviewed)
  compliment_score         numeric(3,2),                          -- 0..1
  versatility_score        numeric(3,2),                          -- 0..1
  office_safe_score        numeric(3,2),                          -- 0..1

  -- Similarity (precomputed, references other fragrances)
  similar_fragrance_ids    uuid[] not null default '{}',

  -- Dupes
  dupe_of                  uuid references fragrances(id) on delete set null,
  dupe_confidence          numeric(3,2),                          -- 0..1

  -- Pricing tier (1=budget … 5=ultra-luxury)
  price_tier               int check (price_tier between 1 and 5),
  retail_msrp_usd_cents    int,                                   -- "headline" 50ml MSRP

  -- Imagery + sourcing provenance
  image_url                text,
  source                   text,                                  -- 'tomford-scrape','sephora-scrape','manual',...
  source_url               text,

  -- Lifecycle
  is_discontinued          boolean not null default false,
  is_active                boolean not null default true,         -- soft hide for moderation

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Search + filter indexes
create index fragrances_brand_idx       on fragrances (brand_id);
create index fragrances_slug_idx        on fragrances (slug);
create index fragrances_family_idx      on fragrances (fragrance_family);
create index fragrances_gender_idx      on fragrances (gender);
create index fragrances_price_tier_idx  on fragrances (price_tier);
create index fragrances_top_accords_idx on fragrances using gin (top_accords);
create index fragrances_top_notes_idx   on fragrances using gin (top_notes);
create index fragrances_heart_notes_idx on fragrances using gin (heart_notes);
create index fragrances_base_notes_idx  on fragrances using gin (base_notes);
create index fragrances_name_trgm_idx   on fragrances using gin (name gin_trgm_ops);

-- ------------------------------------------------------------------
-- RETAILER PRICING (mL-aware, multi-source)
-- One fragrance has many SKUs across retailers and sizes; mL-level pricing
-- powers the "buy full bottle vs decant" recommendation in the spec.
-- ------------------------------------------------------------------
create table if not exists fragrance_prices (
  id              uuid primary key default gen_random_uuid(),
  fragrance_id    uuid not null references fragrances(id) on delete cascade,
  retailer        text not null,                                   -- 'sephora','nordstrom','luckyscent','fragrancex','decantx'
  size_ml         numeric(6,2) not null,
  price_usd_cents int not null,
  is_decant       boolean not null default false,
  url             text,
  in_stock        boolean,
  scraped_at      timestamptz not null default now(),
  unique (fragrance_id, retailer, size_ml, is_decant)
);
create index fragrance_prices_frag_idx on fragrance_prices (fragrance_id);

-- ------------------------------------------------------------------
-- USER WARDROBE (collection)
-- ------------------------------------------------------------------
create table if not exists wardrobe_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  fragrance_id        uuid not null references fragrances(id) on delete cascade,
  status              text not null check (status in ('have','want','tested','sold_on')),
  unit_type           text check (unit_type in ('bottle','decant','sample')),
  size_ml             numeric(6,2),
  remaining_ml        numeric(6,2),
  reorder_threshold_ml numeric(6,2),
  purchase_price_cents int,
  purchase_date       date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, fragrance_id, unit_type, size_ml)
);
create index wardrobe_user_idx        on wardrobe_items (user_id);
create index wardrobe_user_status_idx on wardrobe_items (user_id, status);

-- ------------------------------------------------------------------
-- WEAR LOGS
-- ------------------------------------------------------------------
create table if not exists wear_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  fragrance_id        uuid not null references fragrances(id) on delete cascade,
  worn_on             date not null default current_date,
  occasion            text,                                       -- 'office','date','casual','evening','formal','workout','travel'
  weather             text,                                       -- 'hot-humid','hot-dry','warm','cool','cold','rainy'
  season              text,                                       -- 'spring','summer','fall','winter'
  mood                text,
  performance_longevity numeric(3,2),                             -- user-rated, 0..5
  performance_sillage   numeric(3,2),                             -- user-rated, 0..5
  performance_projection numeric(3,2),                            -- user-rated, 0..5
  rating              numeric(3,2),                               -- 0..5 stars
  would_wear_again    boolean,
  note                text,
  created_at          timestamptz not null default now()
);
create index wear_logs_user_idx     on wear_logs (user_id);
create index wear_logs_user_frag_idx on wear_logs (user_id, fragrance_id);
create index wear_logs_user_date_idx on wear_logs (user_id, worn_on desc);

-- ------------------------------------------------------------------
-- SWIPE FEEDBACK ("Train My Nose")
-- The keystone learning signal for the recommendation engine.
-- ------------------------------------------------------------------
create table if not exists swipe_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  fragrance_id uuid not null references fragrances(id) on delete cascade,
  action       text not null check (action in ('like','dislike','skip')),
  created_at   timestamptz not null default now(),
  unique (user_id, fragrance_id)
);
create index swipe_user_idx     on swipe_feedback (user_id);
create index swipe_user_act_idx on swipe_feedback (user_id, action);

-- ------------------------------------------------------------------
-- USER TASTE PROFILE
-- Materialized rollup of swipes + wear logs + quiz, recomputed on each
-- new signal. Stored, not derived on read, so home-screen recs are fast.
-- ------------------------------------------------------------------
create table if not exists user_taste_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  liked_notes          jsonb not null default '{}'::jsonb,        -- { "vanilla": 12, "rose": 8, ... } (counts/weights)
  disliked_notes       jsonb not null default '{}'::jsonb,
  preferred_accords    jsonb not null default '{}'::jsonb,
  preferred_families   jsonb not null default '{}'::jsonb,
  avg_price_tier       numeric(3,2),
  longevity_preference numeric(3,2),                              -- 0..5
  adventure_mode       text not null default 'middle' check (adventure_mode in ('classic','middle','surprise')),
  signal_count         int not null default 0,                    -- total swipes+logs that fed this profile
  last_updated         timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- QUIZ RESULTS (persisted for analytics + re-runs)
-- ------------------------------------------------------------------
create table if not exists quiz_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tier        text not null check (tier in ('free','pro')),
  answers     jsonb not null,                                     -- { "family": "oriental", "notes": ["vanilla","amber"], ... }
  created_at  timestamptz not null default now()
);
create index quiz_results_user_idx on quiz_results (user_id, created_at desc);

-- ------------------------------------------------------------------
-- USER SUBMISSIONS (missing fragrance reports)
-- StickPicks needed this in migration 008 — building it in day 1 here.
-- ------------------------------------------------------------------
create table if not exists fragrance_submissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  brand       text,
  name        text,
  notes       text,
  image_url   text,
  status      text not null default 'pending' check (status in ('pending','accepted','rejected','duplicate')),
  resolved_to uuid references fragrances(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- CONTENT REPORTS (moderation)
-- StickPicks needed this in migration 011 — building it in day 1 here.
-- ------------------------------------------------------------------
create table if not exists content_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('fragrance','brand','wear_log','submission')),
  target_id   uuid not null,
  reason      text not null,
  detail      text,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- COMPED USERS (Pro grants — friends/family/press)
-- StickPicks needed this in migration 013 — building it in day 1 here.
-- ------------------------------------------------------------------
create table if not exists comped_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end $$ language plpgsql;

create trigger fragrances_set_updated_at
  before update on fragrances
  for each row execute procedure set_updated_at();

create trigger wardrobe_set_updated_at
  before update on wardrobe_items
  for each row execute procedure set_updated_at();
