-- 202605220004_review_helpful_votes_rls.sql

alter table review_helpful_votes enable row level security;

-- Public: read votes (for aggregate counts).
create policy "helpful_votes_public_read"
  on review_helpful_votes for select
  using (true);

-- Owner: insert their vote.
create policy "helpful_votes_owner_insert"
  on review_helpful_votes for insert
  with check (user_id = auth.uid());

-- Owner: update (change helpful ↔ not helpful).
create policy "helpful_votes_owner_update"
  on review_helpful_votes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owner: retract their vote.
create policy "helpful_votes_owner_delete"
  on review_helpful_votes for delete
  using (user_id = auth.uid());
