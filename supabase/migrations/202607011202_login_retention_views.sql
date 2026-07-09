-- 202607011202_login_retention_views.sql
-- Retention analytics on top of login_events (202607011200_login_events.sql).
--
-- login_events is the ground-truth "app opened on (user, local calendar day)"
-- log. These views turn that raw log into the two questions we actually ask:
--   1. How engaged is each user?      → user_login_retention (per-user rollup)
--   2. Do new users come back?        → login_retention_cohorts (D1/D7/D30)
--
-- All views are security_invoker so RLS on login_events still applies: a normal
-- authenticated client sees only its OWN row; the service role (analytics jobs)
-- bypasses RLS and sees everyone. No new grants beyond that are exposed.
--
-- Read-only + additive: only creates views. Drops nothing, writes no data.

-- ------------------------------------------------------------------
-- 1. Per-user rollup: distinct login days, span, recency.
-- One row per user who has ever opened the app.
-- ------------------------------------------------------------------
create or replace view user_login_retention
with (security_invoker = true) as
select
  user_id,
  count(*)                             as distinct_login_days,
  min(login_date)                      as first_login_date,
  max(login_date)                      as last_login_date,
  (max(login_date) - min(login_date))  as day_span,            -- calendar days first→last
  (count(*) > 1)                       as returned_after_first, -- opened on >1 distinct day
  (max(login_date) >= current_date - 6) as active_last_7d
from login_events
group by user_id;

comment on view user_login_retention is
  'Per-user login rollup from login_events: distinct_login_days, first/last login, day_span, returned_after_first (>1 day), active_last_7d. security_invoker → RLS-scoped per caller.';

-- ------------------------------------------------------------------
-- 2. Cohort retention: for each signup-day cohort (by first login),
-- what share of users returned on day N after their first login.
-- D1 = came back the next day or later within 1 day window, etc.
-- Uses the classic "returned within N days of first login" definition.
-- ------------------------------------------------------------------
create or replace view login_retention_cohorts
with (security_invoker = true) as
with firsts as (
  select user_id, min(login_date) as cohort_date
  from login_events
  group by user_id
),
paired as (
  select
    f.cohort_date,
    f.user_id,
    e.login_date - f.cohort_date as day_offset
  from firsts f
  join login_events e on e.user_id = f.user_id
)
select
  cohort_date,
  count(distinct user_id)                                                  as cohort_size,
  count(distinct user_id) filter (where day_offset >= 1)                   as returned_d1_plus,
  count(distinct user_id) filter (where day_offset between 1 and 7)        as returned_d1_7,
  count(distinct user_id) filter (where day_offset between 1 and 30)       as returned_d1_30,
  round(
    100.0 * count(distinct user_id) filter (where day_offset between 1 and 7)
    / nullif(count(distinct user_id), 0), 1)                              as d7_return_pct,
  round(
    100.0 * count(distinct user_id) filter (where day_offset between 1 and 30)
    / nullif(count(distinct user_id), 0), 1)                              as d30_return_pct
from paired
group by cohort_date
order by cohort_date;

comment on view login_retention_cohorts is
  'Cohort retention from login_events, grouped by first-login date: cohort_size and share returning within 1/7/30 days of first login (d7_return_pct, d30_return_pct). security_invoker → RLS-scoped.';
