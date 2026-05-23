-- 202605220010_user_badges_rls.sql

alter table user_badges enable row level security;

-- Owner: read their own badges.
create policy "badges_owner_read"
  on user_badges for select
  using (user_id = auth.uid());

-- Service-role (used by badge-award Edge Function / triggers) bypasses RLS.
-- No client insert/update/delete — badges are server-awarded only.
