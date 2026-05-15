-- Fragrance retailer links — affiliate "Buy from" surface.
-- Populated by ETL (service-role only), read by the client.

create table if not exists fragrance_retailer_links (
  id                uuid primary key default gen_random_uuid(),
  fragrance_id      uuid not null references fragrances(id) on update cascade on delete cascade,
  retailer          text not null,
  url               text not null,
  our_affiliate_tag text,
  price_cents       int,
  last_seen_at      timestamptz
);

create index retailer_links_fragrance_idx on fragrance_retailer_links (fragrance_id);
