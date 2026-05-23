-- 202605220008_compliments_log_rls.sql

alter table compliments_log enable row level security;

create policy "compliments_owner_all"
  on compliments_log for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
