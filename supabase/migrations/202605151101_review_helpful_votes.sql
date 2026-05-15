-- Review helpful votes — one vote per user per review.
-- Trigger maintains denormalized helpful_count on fragrance_reviews.

create table if not exists review_helpful_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  review_id  uuid not null references fragrance_reviews(id) on delete cascade,
  value      boolean not null,  -- true = helpful, false = not helpful
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);

-- Trigger: update helpful_count on fragrance_reviews after insert/delete.
create or replace function update_review_helpful_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update fragrance_reviews
      set helpful_count = helpful_count + (case when NEW.value then 1 else -1 end)
      where id = NEW.review_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update fragrance_reviews
      set helpful_count = helpful_count - (case when OLD.value then 1 else -1 end)
      where id = OLD.review_id;
    return OLD;
  elsif TG_OP = 'UPDATE' then
    -- value flipped: undo old, apply new
    update fragrance_reviews
      set helpful_count = helpful_count
        - (case when OLD.value then 1 else -1 end)
        + (case when NEW.value then 1 else -1 end)
      where id = NEW.review_id;
    return NEW;
  end if;
  return null;
end;
$$;

create trigger review_helpful_votes_trigger
  after insert or update or delete on review_helpful_votes
  for each row execute function update_review_helpful_count();
