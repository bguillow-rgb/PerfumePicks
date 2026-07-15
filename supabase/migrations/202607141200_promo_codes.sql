-- Migration: promo codes (influencer "enter code XYZ, get N months free" campaigns)
-- Created: 2026-07-14
--
-- Model (per product decision):
--   * MANY per-influencer codes, enabled over time via INSERT. A single code is
--     broadcast by one influencer and redeemable by their whole audience (a
--     shared code), optionally capped by max_redemptions and/or expires_at.
--   * A given user can redeem a given code at most once (promo_redemptions PK).
--   * A code is REJECTED if the user already has active Pro (enforced in the
--     redeem-promo Edge Function, not here).
--
-- The GRANT itself (flipping profiles.is_pro / pro_expires_at) is done by the
-- `redeem-promo` Edge Function with the service role — the ONLY writer allowed
-- past the prevent_client_pro_writes trigger (see 202605150900_pro_gate_server_side).
-- These tables are RLS-locked: no client policies, so PostgREST denies all
-- anon/authenticated access. Only the service role (Edge Function) touches them.

-- ────────────────────────────────────────────────────────────────────
-- 1. promo_codes — one row per campaign code
-- ────────────────────────────────────────────────────────────────────

create table if not exists promo_codes (
  code             text primary key,               -- store NORMALIZED (upper, trimmed), e.g. 'SCENTQUEEN'
  label            text,                            -- human note: which influencer/campaign this is
  duration_months  integer not null default 3 check (duration_months > 0 and duration_months <= 24),
  max_redemptions  integer check (max_redemptions is null or max_redemptions > 0), -- null = unlimited
  redeemed_count   integer not null default 0,
  active           boolean not null default true,   -- kill switch without deleting the row
  expires_at       timestamptz,                     -- campaign end; null = no expiry
  created_at       timestamptz not null default now()
);

comment on table promo_codes is
  'Influencer promo codes. Broadcast (shared) codes: one code, many redemptions, capped by max_redemptions/expires_at. Rows added manually as campaigns launch. Read/written ONLY by the redeem-promo Edge Function (service role).';
comment on column promo_codes.code is
  'Primary key. Stored normalized (uppercased + trimmed). The Edge Function normalizes user input the same way before lookup.';
comment on column promo_codes.max_redemptions is
  'Soft cap on total redemptions. NULL = unlimited. Enforced in the Edge Function; redeemed_count is incremented per successful grant.';

-- ────────────────────────────────────────────────────────────────────
-- 2. promo_redemptions — who redeemed what (idempotency + audit)
-- ────────────────────────────────────────────────────────────────────

create table if not exists promo_redemptions (
  code           text not null references promo_codes(code) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  redeemed_at    timestamptz not null default now(),
  duration_months integer not null,                -- snapshot of what was granted (code may change later)
  primary key (code, user_id)                      -- one redemption of a given code per user
);

comment on table promo_redemptions is
  'One row per (code, user) redemption. PK guards against double-redeeming the same code. Written ONLY by the redeem-promo Edge Function (service role).';

create index if not exists promo_redemptions_user_idx on promo_redemptions (user_id);

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS: lock both tables to service-role only
-- ────────────────────────────────────────────────────────────────────
-- Enable RLS with NO policies → PostgREST denies every anon/authenticated
-- request. The service-role key used by the Edge Function bypasses RLS, so the
-- function can still read/write freely. This keeps the code list unenumerable
-- by clients (no brute-forcing valid codes via the REST API).

alter table promo_codes       enable row level security;
alter table promo_redemptions enable row level security;

-- ────────────────────────────────────────────────────────────────────
-- 4. Seed helper (commented) — how to add a code as campaigns launch
-- ────────────────────────────────────────────────────────────────────
-- Run in the SQL editor when an influencer goes live. ALWAYS uppercase the code.
--
--   insert into promo_codes (code, label, duration_months, max_redemptions, expires_at)
--   values ('SCENTQUEEN', 'IG @scentqueen · Jul 2026', 3, 500, '2026-09-01T00:00:00Z');
--
-- Unlimited, no expiry:
--   insert into promo_codes (code, label) values ('LAUNCH3', 'Generic launch code');
--
-- Disable a code (kill switch):
--   update promo_codes set active = false where code = 'SCENTQUEEN';
