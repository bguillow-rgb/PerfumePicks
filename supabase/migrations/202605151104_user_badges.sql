-- User badges — awarded for streaks, milestones, achievements.
-- Service-role only insert (triggered server-side, not from client).

create table if not exists user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_key  text not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index user_badges_user_idx on user_badges (user_id);
