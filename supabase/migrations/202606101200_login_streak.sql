-- Perfume Picks — login streak (Path A).
--
-- Adds a SECOND, independent streak that tracks consecutive days the user
-- *opened the app*, distinct from the existing wear streak (profiles.current_streak,
-- driven by the wear_logs insert trigger). The wear streak keeps powering badges
-- + Wrapped; this login streak powers the Home greeting pill, because "I opened
-- the app N days running" is what users expect a visible streak to mean.
--
-- The client calls touch_login_streak() on every foreground/launch, passing its
-- LOCAL calendar date (new Date().toLocaleDateString('en-CA')) so the
-- midnight-rollover boundary matches the device's timezone — same approach the
-- wear streak uses with wear_logs.worn_on.

-- ------------------------------------------------------------------
-- 1. COLUMNS — login streak state on profiles
-- ------------------------------------------------------------------
alter table profiles
  add column if not exists login_streak         int not null default 0,
  add column if not exists longest_login_streak int not null default 0,
  add column if not exists last_login_date      date;

-- ------------------------------------------------------------------
-- 2. RPC — touch_login_streak(p_local_date)
-- Security definer so it can upsert the caller's own profile row regardless
-- of the profiles RLS update policy. Operates ONLY on auth.uid(), so a user
-- can never advance another user's streak. Idempotent within a calendar day
-- (guarded by the same-day early return), so repeated app foregrounds on the
-- same day don't inflate the count. Returns the resulting login_streak.
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

  -- Fetch current login-streak state for this user.
  select last_login_date, login_streak, longest_login_streak
    into v_last_date, v_streak, v_longest
    from profiles
   where id = v_uid;

  -- No profile row yet (auth trigger hasn't fired) — create a bare one.
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
