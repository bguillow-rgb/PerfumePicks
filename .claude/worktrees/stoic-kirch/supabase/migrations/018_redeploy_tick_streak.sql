-- 018_redeploy_tick_streak.sql
-- Re-deploy the tick_streak function to ensure prod matches the repo
-- definition in 015. Discovered 2026-04-24: user_streaks had zero rows
-- across every user ever — even bguillow@gmail.com had never gotten a
-- streak tick to stick. Hypothesis: an older-shape version of the
-- function was deployed before 015 was first pushed, and `CREATE OR
-- REPLACE` was skipped on subsequent `supabase db push` runs because
-- the migrations-table entry was already marked applied.
--
-- This migration is a no-op if the deployed function already matches.
-- Idempotent — safe to re-run.

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
    DO UPDATE SET current_streak = EXCLUDED.current_streak,
                  best_streak    = EXCLUDED.best_streak,
                  last_activity_date = EXCLUDED.last_activity_date,
                  updated_at = now();
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
