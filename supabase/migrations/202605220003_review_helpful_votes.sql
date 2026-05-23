-- 202605220003_review_helpful_votes.sql
-- Thumbs up/down votes on fragrance_reviews.
-- Denormalized helpful_count on fragrance_reviews is maintained by triggers.

create table if not exists review_helpful_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  review_id  uuid not null references fragrance_reviews(id) on delete cascade,
  value      boolean not null,   -- true = helpful, false = not helpful
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);

create index review_helpful_votes_review_idx on review_helpful_votes (review_id);

-- Maintain the denormalized helpful_count on fragrance_reviews.
create or replace function update_review_helpful_count()
  returns trigger language plpgsql as $$
begin
  update fragrance_reviews
  set helpful_count = (
    select count(*) from review_helpful_votes
    where review_id = coalesce(new.review_id, old.review_id)
      and value = true
  )
  where id = coalesce(new.review_id, old.review_id);
  return null;
end;
$$;

create trigger review_helpful_votes_after_change
  after insert or update or delete on review_helpful_votes
  for each row execute function update_review_helpful_count();
