-- Compliments log — when someone comments on what you're wearing.

create table if not exists compliments_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  fragrance_id   uuid not null references fragrances(id) on update cascade on delete restrict,
  what_was_said  text,
  context        text,       -- e.g. "at the office", "on a date"
  occurred_on    date,
  created_at     timestamptz not null default now()
);

create index compliments_log_user_idx on compliments_log (user_id);
create index compliments_log_fragrance_idx on compliments_log (fragrance_id);
