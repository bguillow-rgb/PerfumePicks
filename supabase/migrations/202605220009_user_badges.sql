-- 202605220009_user_badges.sql
-- Achievement badges awarded by server-side logic, never by the client directly.

create table if not exists user_badges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  badge_key   text not null,
  awarded_at  timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index user_badges_user_idx on user_badges (user_id);

-- Badge keys used by the app (informational — enforced in application code):
--   streak_7    — 7-day streak
--   streak_30   — 30-day streak
--   streak_100  — 100-day streak
--   streak_365  — 365-day streak
--   collector_10  — 10 fragrances in wardrobe
--   collector_50  — 50 fragrances in wardrobe
--   first_wear    — first wear log
--   first_review  — first review written
