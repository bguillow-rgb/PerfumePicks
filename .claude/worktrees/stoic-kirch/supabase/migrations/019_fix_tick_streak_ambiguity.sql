-- 019_fix_tick_streak_ambiguity.sql
-- ROOT CAUSE FIX for the silent-failure bug in tick_streak.
--
-- The function was written with RETURNS TABLE (streak_type text,
-- current_streak integer, best_streak integer, did_increment boolean,
-- last_activity_date date). Those OUT parameters share names with
-- the columns on user_streaks. When the INSERT ... ON CONFLICT ...
-- DO UPDATE SET current_streak = EXCLUDED.current_streak executes,
-- plpgsql can't decide whether the unqualified "current_streak" on
-- the LHS of SET is an OUT parameter or the target column — under
-- the default plpgsql.variable_conflict=error setting, it raises:
--
--   ERROR  42702: column reference "streak_type" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a
--           table column.
--
-- Verified 2026-04-24 by calling the RPC with a real authenticated
-- user JWT — every invocation returned this error, which the client
-- was silently swallowing. `user_streaks` had zero rows across every
-- user in prod.
--
-- Fix: add `#variable_conflict use_column` at the top of the
-- function body. Tells plpgsql to resolve bare identifiers inside
-- SQL statements as table columns first, falling back to local
-- variables only when there's no matching column. Safe because the
-- function body already uses v_* prefix for local variables and
-- never intends to reference OUT parameters inside SQL statements
-- (they're only populated for the implicit return).

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
#variable_conflict use_column
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
    v_cur := 1;
    v_best := 1;
    v_inc := true;
  ELSIF v_prev IS NULL OR v_today > v_prev + 1 THEN
    v_cur := 1;
    v_inc := true;
  ELSIF v_today = v_prev + 1 THEN
    v_cur := v_cur + 1;
    v_inc := true;
    IF v_cur > v_best THEN
      v_best := v_cur;
    END IF;
  ELSIF v_today = v_prev THEN
    v_inc := false;
  ELSE
    v_inc := false;
  END IF;

  IF v_inc THEN
    INSERT INTO user_streaks (user_id, streak_type, current_streak, best_streak, last_activity_date, updated_at)
    VALUES (v_user_id, p_type, v_cur, v_best, v_today, now())
    ON CONFLICT (user_id, streak_type)
    DO UPDATE SET current_streak     = EXCLUDED.current_streak,
                  best_streak        = EXCLUDED.best_streak,
                  last_activity_date = EXCLUDED.last_activity_date,
                  updated_at         = now();
  END IF;

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
