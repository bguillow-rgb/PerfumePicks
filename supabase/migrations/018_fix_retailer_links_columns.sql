-- Migration 018: Add missing columns and unique constraint to fragrance_retailer_links.
-- These were applied manually via ALTER TABLE during ETL bring-up (2026-05-22).
-- This migration documents them so fresh environments build correctly.

alter table fragrance_retailer_links
  add column if not exists our_affiliate_tag text,
  add column if not exists price_cents       numeric(8,2),
  add column if not exists size_ml           numeric(6,2),
  add column if not exists in_stock          boolean not null default true,
  add column if not exists last_seen_at      timestamptz not null default now();

-- Required for upsert onConflict: 'fragrance_id,retailer'
alter table fragrance_retailer_links
  add constraint if not exists fragrance_retailer_links_fragrance_id_retailer_key
  unique (fragrance_id, retailer);
