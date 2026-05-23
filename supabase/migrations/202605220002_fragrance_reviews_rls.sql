-- 202605220002_fragrance_reviews_rls.sql

alter table fragrance_reviews enable row level security;

-- Public: read any review.
create policy "reviews_public_read"
  on fragrance_reviews for select
  using (true);

-- Owner: insert their own review.
create policy "reviews_owner_insert"
  on fragrance_reviews for insert
  with check (user_id = auth.uid());

-- Owner: update their own review.
create policy "reviews_owner_update"
  on fragrance_reviews for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owner: delete their own review.
create policy "reviews_owner_delete"
  on fragrance_reviews for delete
  using (user_id = auth.uid());
