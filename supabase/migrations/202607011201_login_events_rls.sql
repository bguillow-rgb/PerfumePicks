-- 202607011201_login_events_rls.sql
-- Owner-only access to the login log. A user can read ONLY their own login
-- days; writes flow exclusively through touch_login_streak() (security definer),
-- and retention/analytics jobs read in aggregate via the service role (which
-- bypasses RLS), so no broad read policy is exposed to clients.

alter table login_events enable row level security;

create policy "login_events_owner_all"
  on login_events for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
