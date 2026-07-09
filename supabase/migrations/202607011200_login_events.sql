-- Perfume Picks — dedicated login-events log.
--
-- Until now "did the user come back on more than one day?" could only be
-- inferred from profiles.longest_login_streak (consecutive days only) or by
-- reconstructing activity timestamps across wardrobe/wear/dna/swipe tables.
-- Neither captures a plain app-open with no other action, and the streak
-- collapses two non-consecutive visits into "streak = 1". This table is the
-- ground truth: one row per (user, local calendar day) the app was opened.
--
-- Design mirrors the login-streak plumbing (202606101200_login_streak.sql):
--   • login_date is the client's LOCAL calendar date, same value already passed
--     to touch_login_streak(), so day boundaries match the device timezone.
--   • unique (user_id, login_date) → idempotent within a day. Repeated
--     foregrounds on the same day never inflate the count.
--   • Capture happens inside touch_login_streak() (below), the single choke
--     point the client already calls on every launch — so NO client change is
--     needed and every existing/ future login is recorded uniformly.
--   • user_id cascades on auth.users delete; the row carries no PII.
--
-- Additive + reversible: one new table + an augmented (not replaced-in-meaning)
-- RPC that now ALSO writes a login_events row on each new-day login.

create table if not exists login_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  login_date date not null,
  created_at timestamptz not null default now(),
  -- One row per user per local calendar day: the idempotency guarantee.
  unique (user_id, login_date)
);

create index if not exists login_events_user_idx on login_events (user_id, login_date desc);
create index if not exists login_events_date_idx on login_events (login_date desc);

comment on table login_events is
  'Ground-truth app-open log: one row per (user, local calendar day). Written by touch_login_streak() on each new-day login; powers accurate distinct-login-day / retention metrics that longest_login_streak (consecutive-only) cannot. No PII; user_id is for deletion-cascade.';

-- ------------------------------------------------------------------
-- Augment touch_login_streak() to also record the login event.
-- Faithful re-declaration of 202606101200_login_streak.sql with a single
-- added INSERT on the new-day path (after the same-day early return, so it
-- fires exactly once per distinct login day). on conflict do nothing keeps it
-- safe against races / offline retries.
-- ------------------------------------------------------------------
create or replace function touch_login_streak(p_local_date date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_last_date date;
  v_streak    int;
  v_longest   int;
begin
  if v_uid is null then
    raise exception 'touch_login_streak: no authenticated user';
  end if;

  select last_login_date, login_streak, longest_login_streak
    into v_last_date, v_streak, v_longest
    from profiles
   where id = v_uid;

  if not found then
    insert into profiles (id) values (v_uid)
      on conflict (id) do nothing;
    v_last_date := null;
    v_streak    := 0;
    v_longest   := 0;
  end if;

  -- Already counted today — no-op, return the existing streak unchanged.
  if v_last_date = p_local_date then
    return v_streak;
  end if;

  -- New login day → record the ground-truth event (idempotent per day).
  insert into login_events (user_id, login_date)
    values (v_uid, p_local_date)
    on conflict (user_id, login_date) do nothing;

  -- Opened yesterday → extend; any larger gap (or first ever open) → reset to 1.
  if v_last_date = p_local_date - interval '1 day' then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  v_longest := greatest(v_streak, v_longest);

  update profiles
     set last_login_date      = p_local_date,
         login_streak         = v_streak,
         longest_login_streak = v_longest,
         updated_at           = now()
   where id = v_uid;

  return v_streak;
end;
$$;

grant execute on function touch_login_streak(date) to authenticated;
