-- Migration 015: fragrance_retailer_links
-- Per-retailer affiliate link table. Clean product URLs stored here;
-- CJ links are pre-tagged (affiliate ID baked into the CJ tracking URL).
-- Amazon links get tag injected at click time by appendAffiliateTag().
-- DO NOT store affiliate tags directly in the url column.

create table if not exists fragrance_retailer_links (
  id                uuid        primary key default gen_random_uuid(),
  fragrance_id      uuid        not null references fragrances(id) on delete cascade,
  retailer          text        not null,
  url               text        not null,
  our_affiliate_tag text,                        -- audit only; never read by client for injection
  price_cents       numeric(8,2),                -- nullable: null = "check site for price"
  size_ml           numeric(6,2),                -- nullable: null = size unknown
  in_stock          boolean     not null default true,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- Prevent duplicate retailer row per fragrance
  unique (fragrance_id, retailer),

  -- Block any URL that already carries a generic affiliate tag param.
  -- CJ URLs carry publisher ID in path (dpbolvw.net/click-...), not as ?tag=
  -- so this constraint correctly allows them through.
  constraint url_no_raw_affiliate_tag check (url not like '%tag=%')
);

create index if not exists fragrance_retailer_links_fragrance_id_idx
  on fragrance_retailer_links(fragrance_id);

create index if not exists fragrance_retailer_links_retailer_idx
  on fragrance_retailer_links(retailer);
