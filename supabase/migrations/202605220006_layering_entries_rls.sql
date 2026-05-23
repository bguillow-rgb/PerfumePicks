-- 202605220006_layering_entries_rls.sql

alter table layering_entries enable row level security;

create policy "layering_owner_all"
  on layering_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
