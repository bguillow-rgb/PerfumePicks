-- 019_pro_gate.sql
-- Adds server-side Pro gate columns to profiles and a security-definer
-- helper function used by Pro-only RLS policies.
--
-- Client-side useProStore is UX only. RLS uses is_pro_user(uid) as the real gate.

-- ── Schema ────────────────────────────────────────────────────────────────────

alter table profiles
  add column if not exists is_pro            boolean not null default false,
  add column if not exists pro_expires_at    timestamptz;

-- ── Helper function ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can call it without the caller needing direct
-- read access to profiles.

create or replace function is_pro_user(uid uuid)
  returns boolean
  language sql
  security definer
  stable
as $$
  select coalesce(
    (select is_pro and (pro_expires_at is null or pro_expires_at > now())
     from profiles
     where id = uid),
    false
  );
$$;

-- ── Service-role write policy for RC webhook ──────────────────────────────────
-- The RC webhook Edge Function uses the service role key; it bypasses RLS.
-- No extra policy needed — service role skips RLS by default.

-- ── Grant execute to authenticated role ───────────────────────────────────────
-- Lets RLS policies on other tables call is_pro_user(auth.uid()).
grant execute on function is_pro_user(uuid) to authenticated;
