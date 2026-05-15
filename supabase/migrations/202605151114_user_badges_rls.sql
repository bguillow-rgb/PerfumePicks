-- RLS for user_badges.
-- Owner: select only (can see own badges).
-- Insert: service-role only (triggered by server-side logic).

alter table user_badges enable row level security;

create policy "badges_select_own" on user_badges
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies for authenticated users.
-- Badges are awarded by triggers and RPCs running as service role.
