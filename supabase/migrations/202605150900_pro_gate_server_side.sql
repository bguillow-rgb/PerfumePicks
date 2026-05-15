-- Migration: server-side Pro gate (Mark Z P0)
-- Created: 2026-05-15
--
-- Client-side `useProStore.isPro` is UX-only and trivially bypassed by a
-- modded build. Real enforcement lives here: a Postgres function that
-- reads from `profiles.is_pro` and `profiles.pro_expires_at`, attached
-- to every Pro-only RPC + RLS policy.
--
-- The RC → Postgres flip itself (a webhook + Edge Function that updates
-- profiles.is_pro on subscription events) is a SEPARATE deliverable —
-- deferred until there are real RC subscriptions to test against. For
-- now is_pro is updatable by the service role only (no public RLS).

-- ────────────────────────────────────────────────────────────────────
-- 1. Add Pro columns to profiles
-- ────────────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists is_pro          boolean not null default false,
  add column if not exists pro_expires_at  timestamptz;

comment on column profiles.is_pro is
  'True iff the user has an active Pro subscription. Flipped by the RC webhook handler (Edge Function), not by the client. Read via is_pro_user(uid).';
comment on column profiles.pro_expires_at is
  'When the current Pro entitlement expires. NULL means lifetime / no entitlement. is_pro_user() checks pro_expires_at IS NULL OR pro_expires_at > now().';

-- ────────────────────────────────────────────────────────────────────
-- 2. is_pro_user(uid) — the single source of truth for Pro checks
-- ────────────────────────────────────────────────────────────────────
--
-- Attach this to every Pro-only RLS policy and RPC. Examples:
--
--   -- on a Pro-only RPC:
--   create function get_year_in_review(target_user uuid, year int)
--   returns jsonb language sql security definer as $$
--     select jsonb_build_object(...)
--     from wear_logs ...
--     where auth.uid() = target_user
--       and is_pro_user(auth.uid())
--   $$;
--
--   -- on a Pro-only RLS read policy (collab filtering, etc):
--   create policy "pro_only_select" on some_table
--     for select using (auth.uid() = user_id and is_pro_user(auth.uid()));
--
-- SECURITY DEFINER so the function can read profiles even when the caller's
-- RLS would otherwise hide their own row (it won't here, since profiles
-- has owner-select RLS, but the pattern is safer for future readers).

create or replace function is_pro_user(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select p.is_pro
        and (p.pro_expires_at is null or p.pro_expires_at > now())
      from profiles p
      where p.id = uid
    ),
    false
  );
$$;

comment on function is_pro_user(uuid) is
  'Single source of truth for Pro entitlement checks. Returns true iff profiles.is_pro = true AND (pro_expires_at is null or > now()). Use in RLS and SECURITY DEFINER RPCs. Never trust the client-side useProStore alone.';

-- Grant execute to the auth roles so RLS policies can call it.
grant execute on function is_pro_user(uuid) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS: profiles.is_pro is service-role-only writable
-- ────────────────────────────────────────────────────────────────────
--
-- Owners can SELECT their own row (existing policy from migration 002).
-- We explicitly DO NOT grant any UPDATE policy that allows is_pro to
-- be changed by an authenticated user — so even if a profile-row UPDATE
-- policy exists for other columns, is_pro can only be flipped via the
-- service-role client (i.e. the RC webhook Edge Function).
--
-- Defense in depth: a trigger that reverts any non-service-role UPDATE
-- to is_pro / pro_expires_at. Even if someone misconfigures RLS later
-- and exposes these columns, the trigger refuses the change.

create or replace function prevent_client_pro_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role has no auth.uid() — service writes pass through unchanged.
  if auth.uid() is null then return new; end if;

  -- For any authenticated client: refuse changes to Pro fields.
  if new.is_pro is distinct from old.is_pro
     or new.pro_expires_at is distinct from old.pro_expires_at then
    raise exception 'profiles.is_pro and pro_expires_at are read-only from the client. Pro state is flipped by the RC webhook (service role).';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_client_pro_writes on profiles;
create trigger profiles_prevent_client_pro_writes
  before update on profiles
  for each row execute function prevent_client_pro_writes();

-- ────────────────────────────────────────────────────────────────────
-- 4. Helper: my_pro_status() — convenience for the app
-- ────────────────────────────────────────────────────────────────────
--
-- The client useProStore reads this on session change to verify the
-- server agrees with RevenueCat. If they disagree, the app locks Pro
-- features and logs to Sentry — matches the Mark Z P0 spec.

create or replace function my_pro_status()
returns table (is_pro boolean, pro_expires_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(p.is_pro, false)                                    as is_pro,
    case when p.is_pro and (p.pro_expires_at is null or p.pro_expires_at > now())
         then p.pro_expires_at else null
    end                                                          as pro_expires_at
  from profiles p
  where p.id = auth.uid();
$$;

grant execute on function my_pro_status() to authenticated;
comment on function my_pro_status() is
  'Returns the current authenticated user''s Pro status. Used by the client to verify server agrees with RevenueCat. Returns (false, null) if no profile row yet.';
