-- 202606181501_dna_picker_events_rls.sql
-- Owner-only access to the pick-stream. A user can write/read ONLY their own
-- rows; the cohort-training job reads in aggregate via the service role (which
-- bypasses RLS), so no broad read policy is exposed to clients.

alter table dna_picker_events enable row level security;

create policy "dna_picker_events_owner_all"
  on dna_picker_events for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
