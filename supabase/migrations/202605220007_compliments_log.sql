-- 202605220007_compliments_log.sql
-- User records compliments received while wearing a fragrance.

create table if not exists compliments_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  fragrance_id    uuid not null references fragrances(id) on update cascade on delete restrict,
  what_was_said   text,
  context         text,
  occurred_on     date not null default current_date,
  created_at      timestamptz not null default now()
);

create index compliments_log_user_idx    on compliments_log (user_id);
create index compliments_log_frag_idx    on compliments_log (fragrance_id);
