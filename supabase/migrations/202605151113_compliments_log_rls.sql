-- RLS for compliments_log. Owner-only on every operation.

alter table compliments_log enable row level security;

create policy "compliments_select_own" on compliments_log
  for select using (auth.uid() = user_id);

create policy "compliments_insert_own" on compliments_log
  for insert with check (auth.uid() = user_id);

create policy "compliments_update_own" on compliments_log
  for update using (auth.uid() = user_id);

create policy "compliments_delete_own" on compliments_log
  for delete using (auth.uid() = user_id);
