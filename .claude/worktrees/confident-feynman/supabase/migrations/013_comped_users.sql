-- 013_comped_users.sql
-- Server-side comped-Pro allowlist.
--
-- Was previously an EXPO_PUBLIC_COMPED_EMAILS env var embedded in the shipped
-- JS bundle — so the owner/demo email addresses were readable by anyone who
-- decompiled the app. Move the list into a DB table that:
--
--   - RLS denies all client access (table is opaque to the app/client SDK)
--   - a SECURITY DEFINER function `is_current_user_comped()` does the lookup
--     against the authenticated user's email and returns a single boolean
--
-- The client calls the function and only ever learns "am I comped?" — the
-- list itself never leaves the database.
--
-- This migration creates empty infrastructure. The actual allowlist rows are
-- seeded manually via the Supabase SQL editor so no PII lands in source
-- control:
--
--   INSERT INTO comped_users (email) VALUES ('you@example.com');

CREATE TABLE IF NOT EXISTS comped_users (
  email text PRIMARY KEY,
  note  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lowercase-only policy enforced by a trigger so lookups are simple.
CREATE OR REPLACE FUNCTION comped_users_lowercase_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comped_users_lowercase_trigger ON comped_users;
CREATE TRIGGER comped_users_lowercase_trigger
  BEFORE INSERT OR UPDATE ON comped_users
  FOR EACH ROW EXECUTE FUNCTION comped_users_lowercase_email();

-- RLS on. No policies added — table is inaccessible to clients; only
-- SECURITY DEFINER functions can read it.
ALTER TABLE comped_users ENABLE ROW LEVEL SECURITY;

-- Function the client calls. Returns true iff the currently authenticated
-- user's email is in comped_users. SECURITY DEFINER so it can bypass RLS
-- for the read while the table itself stays locked.
CREATE OR REPLACE FUNCTION is_current_user_comped()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  hit boolean;
BEGIN
  SELECT lower(email) INTO user_email FROM auth.users WHERE id = auth.uid();
  IF user_email IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS (SELECT 1 FROM comped_users WHERE email = user_email) INTO hit;
  RETURN hit;
END;
$$;

-- Only authenticated users can call the function.
REVOKE ALL ON FUNCTION is_current_user_comped() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_current_user_comped() TO authenticated;
