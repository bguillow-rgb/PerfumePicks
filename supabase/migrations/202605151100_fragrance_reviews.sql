-- Fragrance reviews — community ratings + written reviews.
-- One review per user per fragrance (unique constraint).

create table if not exists fragrance_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  fragrance_id    uuid not null references fragrances(id) on update cascade on delete restrict,
  rating_overall  int not null check (rating_overall between 1 and 5),
  rating_longevity int check (rating_longevity between 1 and 5),
  rating_sillage  int check (rating_sillage between 1 and 5),
  rating_value    int check (rating_value between 1 and 5),
  body            text,
  helpful_count   int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, fragrance_id)
);

create index fragrance_reviews_fragrance_idx on fragrance_reviews (fragrance_id);
create index fragrance_reviews_user_idx on fragrance_reviews (user_id);
