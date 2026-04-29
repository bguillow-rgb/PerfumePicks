-- Perfume Picks — SOTD social layer + profiles table.
--
-- What this migration adds:
--   1. profiles          — one row per auth user; streak tracking + display fields.
--                          Replaces the AsyncStorage-only useProfileStore as the
--                          source of truth once Supabase auth is wired up.
--   2. wear_logs columns — is_public, photo_url, photo_uploaded_at,
--                          reaction_count, comment_count.
--                          wear_logs becomes the SOTD source of truth —
--                          no separate sotd_entries table needed.
--   3. follows           — social follow graph.
--   4. wear_log_reactions — emoji reactions on public wear log entries.
--
-- RLS policies for new tables/columns are in 004_sotd_rls.sql.

-- ------------------------------------------------------------------
-- 1. PROFILES
-- One row per auth.users record. Created automatically on first login
-- via a Supabase auth trigger (add that separately in the dashboard or
-- a separate trigger migration). Fields mirror useProfileStore plus the
-- streak / SOTD analytics fields that power the daily carousel and the
-- future Wrapped feature.
-- ------------------------------------------------------------------
create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text unique,
  display_name     text,
  bio              text,
  avatar_url       text,

  -- Streak tracking (updated by trigger on wear_logs insert — see below)
  current_streak   int not null default 0,
  longest_streak   int not null default 0,
  last_sotd_date   date,
  total_sotd_count int not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index profiles_username_idx on profiles (username);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

-- ------------------------------------------------------------------
-- 2. WEAR LOGS — add social + photo columns
-- All new columns are nullable / default-safe so existing rows are
-- unaffected and the app can deploy before the Supabase sync is wired.
-- ------------------------------------------------------------------
alter table wear_logs
  add column if not exists is_public          boolean     not null default false,
  add column if not exists photo_url          text,
  add column if not exists photo_uploaded_at  timestamptz,
  add column if not exists reaction_count     int         not null default 0,
  add column if not exists comment_count      int         not null default 0;

-- Community feed queries: public entries newest-first
create index if not exists wear_logs_public_date_idx
  on wear_logs (worn_on desc, created_at desc)
  where is_public = true;

-- Following feed + per-user public timeline
create index if not exists wear_logs_public_user_idx
  on wear_logs (user_id, worn_on desc)
  where is_public = true;

-- ------------------------------------------------------------------
-- 3. FOLLOWS
-- ------------------------------------------------------------------
create table if not exists follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references auth.users(id) on delete cascade,
  followee_id  uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),

  unique (follower_id, followee_id),
  constraint no_self_follow check (follower_id != followee_id)
);

create index follows_follower_idx on follows (follower_id);
create index follows_followee_idx on follows (followee_id);

-- ------------------------------------------------------------------
-- 4. WEAR LOG REACTIONS
-- One row per (user, wear_log, reaction_type). Toggle: delete the row
-- to un-react. reaction_count on wear_logs is kept in sync by the
-- trigger below.
-- ------------------------------------------------------------------
create table if not exists wear_log_reactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  wear_log_id   uuid not null references wear_logs(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('heart', 'fire', 'want_to_try', 'interesting')),
  created_at    timestamptz not null default now(),

  unique (user_id, wear_log_id, reaction_type)
);

create index wear_log_reactions_log_idx  on wear_log_reactions (wear_log_id);
create index wear_log_reactions_user_idx on wear_log_reactions (user_id);

-- ------------------------------------------------------------------
-- TRIGGER: keep wear_logs.reaction_count in sync
-- ------------------------------------------------------------------
create or replace function sync_reaction_count() returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update wear_logs set reaction_count = reaction_count + 1 where id = NEW.wear_log_id;
  elsif (TG_OP = 'DELETE') then
    update wear_logs set reaction_count = greatest(reaction_count - 1, 0) where id = OLD.wear_log_id;
  end if;
  return null;
end $$ language plpgsql;

create trigger wear_log_reactions_sync_count
  after insert or delete on wear_log_reactions
  for each row execute procedure sync_reaction_count();

-- ------------------------------------------------------------------
-- TRIGGER: update profiles streak + total_sotd_count on wear log insert
-- Fires only when is_public = true, but streak tracks all wears (public
-- or private) — private wears still count toward your personal streak.
-- ------------------------------------------------------------------
create or replace function update_sotd_streak() returns trigger as $$
declare
  v_last_date  date;
  v_streak     int;
  v_longest    int;
begin
  -- Fetch current streak state for this user
  select last_sotd_date, current_streak, longest_streak
    into v_last_date, v_streak, v_longest
    from profiles
   where id = NEW.user_id;

  -- If no profile row yet, create one (handles race condition before
  -- the auth trigger fires on first login).
  if not found then
    insert into profiles (id) values (NEW.user_id)
      on conflict (id) do nothing;
    v_last_date := null;
    v_streak    := 0;
    v_longest   := 0;
  end if;

  -- Skip if this wear is for a date already logged (backdated duplicate
  -- or same-day multi-fragrance entry — streak should only tick once).
  if v_last_date = NEW.worn_on then
    return new;
  end if;

  -- Extend streak if worn yesterday; reset to 1 if gap > 1 day.
  if v_last_date = NEW.worn_on - interval '1 day' then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  v_longest := greatest(v_streak, v_longest);

  update profiles
     set last_sotd_date   = NEW.worn_on,
         current_streak   = v_streak,
         longest_streak   = v_longest,
         total_sotd_count = total_sotd_count + 1,
         updated_at       = now()
   where id = NEW.user_id;

  return new;
end $$ language plpgsql;

create trigger wear_logs_update_streak
  after insert on wear_logs
  for each row execute procedure update_sotd_streak();
