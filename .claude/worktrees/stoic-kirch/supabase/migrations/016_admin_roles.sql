-- 016_admin_roles.sql
-- Admin role mechanism + admin-only write policies.
--
-- Motivation:
-- Non-admin users suggest cigars via app/identify/result.tsx -> they land
-- in cigar_submissions for review. Admins need to approve/reject those
-- and also add cigars directly (seed gaps) from inside the app. The
-- existing RLS on `cigars` allows SELECT for everyone (set in 002) but
-- blocks INSERT/UPDATE/DELETE for every authenticated caller — only the
-- service-role key can currently write. We need an admin-only write
-- path that's safe against UI-bypassing REST calls.
--
-- Design choice — reuse comped_users instead of a new admin_users
-- table:
--   * Every admin naturally bypasses the free-scan quota (which
--     comped_users already implements), so a separate admin table
--     would duplicate that concept.
--   * Founders we've manually inserted already live in comped_users
--     with note='founder'/'owner' — they get is_admin=true by this
--     migration's UPDATE, no data migration required.
--   * Single source of truth for "trusted email addresses."
--
-- Service-role operations (scripts/upload-dtt-images.sh, edge
-- functions) bypass RLS entirely and continue to work unchanged.

------------------------------------------------------------------------
-- 1. Column + seed
------------------------------------------------------------------------

ALTER TABLE comped_users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Seed existing founder / owner rows as admins. Idempotent.
UPDATE comped_users
SET is_admin = true
WHERE note ILIKE '%founder%' OR note = 'owner';

------------------------------------------------------------------------
-- 2. is_current_user_admin() helper
------------------------------------------------------------------------
-- SECURITY DEFINER so RLS policies invoking this don't recursively
-- check RLS on comped_users. STABLE because the result is deterministic
-- within a statement (the same auth.uid() maps to the same email).

CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM comped_users cu
    JOIN auth.users u ON lower(u.email) = cu.email
    WHERE u.id = auth.uid()
      AND cu.is_admin = true
  );
$$;

-- Anonymous callers should not be able to probe admin state.
REVOKE ALL ON FUNCTION is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated;

------------------------------------------------------------------------
-- 3. Admin-only write policies on `cigars`
------------------------------------------------------------------------
-- Read policy ("cigars readable by all") already exists from 002. We
-- only add write paths here; the read path is untouched so unauth
-- browsing continues to work.

CREATE POLICY "admins can insert cigars"
  ON cigars FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());

CREATE POLICY "admins can update cigars"
  ON cigars FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

CREATE POLICY "admins can delete cigars"
  ON cigars FOR DELETE
  TO authenticated
  USING (is_current_user_admin());

------------------------------------------------------------------------
-- 4. Admin management policies on `comped_users`
------------------------------------------------------------------------
-- 013_comped_users.sql left comped_users RLS locked down (no policies
-- = no authenticated access). The Admin Invites UI needs admins to
-- read the list, add new rows, and flip is_admin on existing ones.
-- Non-admins still can't touch the table — their insert/read/update
-- attempts fail RLS.

CREATE POLICY "admins can read comped_users"
  ON comped_users FOR SELECT
  TO authenticated
  USING (is_current_user_admin());

CREATE POLICY "admins can insert comped_users"
  ON comped_users FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());

CREATE POLICY "admins can update comped_users"
  ON comped_users FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- Deliberately NOT adding a DELETE policy — removing an admin means
-- flipping is_admin=false, not deleting the comped row. Admins often
-- still need the comp (free-scan bypass) even after losing admin
-- powers.

------------------------------------------------------------------------
-- 5. Admin bypass policies on `cigar_submissions`
------------------------------------------------------------------------
-- 008_cigar_submissions.sql already has:
--   - "Users can insert own submissions" (any authenticated user)
--   - "Users can read own submissions" (auth.uid() = user_id)
-- We layer admin OR-branches on top. Postgres combines multiple
-- policies for the same command with OR, so a regular user still
-- reads only their own rows; an admin reads all rows.

CREATE POLICY "admins can read all cigar_submissions"
  ON cigar_submissions FOR SELECT
  TO authenticated
  USING (is_current_user_admin());

CREATE POLICY "admins can update any cigar_submission"
  ON cigar_submissions FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

------------------------------------------------------------------------
-- Verification queries (comment-only; run manually in Supabase SQL
-- editor after applying this migration):
--
--   SELECT is_current_user_admin();
--   -- expected: true for bguillow@gmail.com, false for other users
--
--   SELECT email, is_admin FROM comped_users ORDER BY created_at;
--   -- expected: existing founder rows flipped to is_admin=true
--
--   INSERT INTO cigars (brand, line, name, vitola, origin)
--   VALUES ('Test', 'Test', 'Test', 'Robusto', 'Nicaragua');
--   -- expected: success as admin, 403 RLS rejection as non-admin
------------------------------------------------------------------------
