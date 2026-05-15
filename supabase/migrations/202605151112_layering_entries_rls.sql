-- RLS for layering_entries. Owner-only on every operation.

alter table layering_entries enable row level security;

create policy "layering_select_own" on layering_entries
  for select using (auth.uid() = user_id);

create policy "layering_insert_own" on layering_entries
  for insert with check (auth.uid() = user_id);

create policy "layering_update_own" on layering_entries
  for update using (auth.uid() = user_id);

create policy "layering_delete_own" on layering_entries
  for delete using (auth.uid() = user_id);
