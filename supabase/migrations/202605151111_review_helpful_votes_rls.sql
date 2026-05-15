-- RLS for review_helpful_votes.
-- Owner: read/write own votes.
-- Public: select for aggregate counts via the denormalized helpful_count.

alter table review_helpful_votes enable row level security;

create policy "votes_select_all" on review_helpful_votes
  for select using (true);

create policy "votes_insert_own" on review_helpful_votes
  for insert with check (auth.uid() = user_id);

create policy "votes_update_own" on review_helpful_votes
  for update using (auth.uid() = user_id);

create policy "votes_delete_own" on review_helpful_votes
  for delete using (auth.uid() = user_id);
