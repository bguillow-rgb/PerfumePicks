-- 015_user_streaks.sql
-- Gamification v1: multi-streak tracking for signed-in users.
--
-- Three streak types ship on day one: engagement (any app activity),
-- scan (confirmed cigar identification), quiz (completed quiz). Schema is
-- generic on `streak_type` so future types (humidor_add, journal_entry,
-- comped_smoke_of_day, etc.) slot in by expanding the CHECK — no table
-- changes required.
--
-- Security model:
--   - RLS allows read-your-own and nothing else.
--   - The only write path is the SECURITY DEFINER RPC `public.tick_streak`,
--     which bypasses RLS for the upsert. Clients cannot directly insert or
--     update streak rows.
--   - tick_streak computes "today" in the user's local timezone (passed as
--     an IANA TZ string) so travel + DST don't spuriously reset streaks.
--   - Clock-backward writes are rejected silently.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_type        text        NOT NULL,
  current_streak     integer     NOT NULL DEFAULT 0,
  best_streak        integer     NOT NULL DEFAULT 0,
  last_activity_date date,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, streak_type)
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_streaks_read_own" ON user_streaks;
CREATE POLICY "user_streaks_read_own"
  ON user_streaks FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policies. Direct writes are denied for
-- authenticated users; the RPC below is the sole write path.

CREATE OR REPLACE FUNCTION public.tick_streak(
  p_type text,
  p_tz   text DEFAULT 'UTC'
)
RETURNS TABLE (
  streak_type        text,
  current_streak     integer,
  best_streak        integer,
  did_increment      boolean,
  last_activity_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today   date;
  v_prev    date;
  v_cur     integer;
  v_best    integer;
  v_inc     boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'tick_streak requires an authenticated user';
  END IF;

  IF p_type NOT IN ('engagement', 'scan', 'quiz') THEN
    RAISE EXCEPTION 'unknown streak type: %', p_type;
  END IF;

  -- Fail-safe the timezone: bad IANA strings fall back to UTC rather than
  -- erroring the whole tick. A silently-correct streak is better than a
  -- lost one because a device reported "Etc/GMT-8:00" or similar.
  BEGIN
    v_today := (now() AT TIME ZONE p_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (now() AT TIME ZONE 'UTC')::date;
  END;

  SELECT us.last_activity_date, us.current_streak, us.best_streak
    INTO v_prev, v_cur, v_best
    FROM user_streaks us
   WHERE us.user_id = v_user_id AND us.streak_type = p_type;

  IF NOT FOUND THEN
    -- First-ever tick for this user+type combination.
    v_cur := 1;
    v_best := 1;
    v_inc := true;
  ELSIF v_prev IS NULL OR v_today > v_prev + 1 THEN
    -- Gap (or row existed without any activity date). Reset to 1.
    -- Flagged as did_increment = true so telemetry captures the reset,
    -- but the client detects current == 1 on an existing row and skips
    -- the toast — a reset should be silent, not celebratory.
    v_cur := 1;
    v_inc := true;
  ELSIF v_today = v_prev + 1 THEN
    -- Consecutive-day tick.
    v_cur := v_cur + 1;
    v_inc := true;
    IF v_cur > v_best THEN
      v_best := v_cur;
    END IF;
  ELSIF v_today = v_prev THEN
    -- Same-day re-tick — no-op.
    v_inc := false;
  ELSE
    -- v_today < v_prev: clock moved backward. Reject the write, echo
    -- existing state. User can't un-lose a streak via the clock.
    v_inc := false;
  END IF;

  IF v_inc THEN
    INSERT INTO user_streaks (user_id, streak_type, current_streak, best_streak, last_activity_date, updated_at)
    VALUES (v_user_id, p_type, v_cur, v_best, v_today, now())
    ON CONFLICT (user_id, streak_type)
    DO UPDATE SET current_streak = EXCLUDED.current_streak,
                  best_streak    = EXCLUDED.best_streak,
                  last_activity_date = EXCLUDED.last_activity_date,
                  updated_at = now();
  END IF;

  -- Always return current state (possibly unchanged), so the client
  -- doesn't need a separate SELECT to sync its cache post-tick.
  -- If we wrote, the activity date IS today; if we didn't, the cache
  -- stays anchored to the actual stored prev-date (or null on first call).
  RETURN QUERY
    SELECT
      p_type,
      v_cur,
      v_best,
      v_inc,
      CASE WHEN v_inc THEN v_today ELSE v_prev END;
END;
$$;

REVOKE ALL ON FUNCTION public.tick_streak(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tick_streak(text, text) TO authenticated;
