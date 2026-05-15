-- RLS for fragrance_reviews.
-- Owner: full CRUD on own reviews.
-- Public: anyone can read all reviews.

alter table fragrance_reviews enable row level security;

create policy "reviews_select_all" on fragrance_reviews
  for select using (true);

create policy "reviews_insert_own" on fragrance_reviews
  for insert with check (auth.uid() = user_id);

create policy "reviews_update_own" on fragrance_reviews
  for update using (auth.uid() = user_id);

create policy "reviews_delete_own" on fragrance_reviews
  for delete using (auth.uid() = user_id);
