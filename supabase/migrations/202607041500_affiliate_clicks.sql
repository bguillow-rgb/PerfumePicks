-- affiliate_clicks — durable, app-owned ledger of every affiliate buy-link tap.
--
-- WHY THIS EXISTS:
--   Affiliate CLICK counts previously lived only in PostHog
--   (affiliate_outbound_clicked). PostHog project 496478 was wiped 2026-07-03 and
--   every pre-July-3 click was lost. CJ and Awin expose *money* (sales/commission)
--   via API, but CJ does NOT expose clicks via API (clicks are UI-only), so the
--   network cannot be the click source of truth either. The only durable, queryable
--   home for click counts is a table we own. This is it.
--
--   PostHog stays as a secondary signal; this table is the source of truth.
--
-- SCOPE: shared across the Picks family via the `app` column ('perfumepicks',
-- 'pourpicks', ...). `network` is derived client-side from the outbound URL.

create table if not exists public.affiliate_clicks (
  click_id       uuid primary key default gen_random_uuid(),
  app            text not null,                                  -- 'perfumepicks' | 'pourpicks' | ...
  user_id        uuid references auth.users(id) on delete set null,
  network        text not null,                                  -- 'cj' | 'awin' | 'direct'
  advertiser_id  text,                                           -- optional; server-enriched later
  retailer       text not null,                                  -- 'fragranceshop' | 'perfumania' | ...
  product_id     text,                                           -- fragrance_id / slug
  source_screen  text,
  price_cents    integer,
  created_at     timestamptz not null default now()
);

create index if not exists affiliate_clicks_created_idx
  on public.affiliate_clicks (created_at);
create index if not exists affiliate_clicks_app_net_idx
  on public.affiliate_clicks (app, network, retailer, created_at);
create index if not exists affiliate_clicks_user_idx
  on public.affiliate_clicks (user_id);

alter table public.affiliate_clicks enable row level security;

-- Signed-in users (including anonymous-auth sessions, which is how most taps
-- happen) may insert their OWN click rows only. No select/update/delete for
-- users — reporting reads exclusively via the service role (KPI dashboard).
drop policy if exists affiliate_clicks_insert_own on public.affiliate_clicks;
create policy affiliate_clicks_insert_own
  on public.affiliate_clicks
  for insert
  to authenticated
  with check (auth.uid() = user_id);
