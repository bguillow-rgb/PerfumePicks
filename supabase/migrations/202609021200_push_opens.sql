-- 202609021200_push_opens.sql
-- Make "the user opened a push" a measurable event.
--
-- WHY: the 2026-09-02 retention read could not see the ONE behaviour the daily
-- SOTD push exists to cause. "Active day" is derived from database writes, and a
-- user who taps the push, reads their scent of the day and closes the app writes
-- NOTHING — so the push's whole effect was invisible, and every retention figure
-- was a floor rather than a count.
--
-- One row per user per day per source: the retention question is "did they come
-- back today", not "how many times did they tap". The unique constraint makes
-- repeat opens idempotent and keeps the table small, and the client relies on it
-- (it inserts and treats 23505 as success, exactly like enrich_requests).
--
-- opened_on is a DATE in the DEVICE's local day, sent by the client. The push is
-- scheduled against each user's local morning (daily-sotd-push resolves IANA tz),
-- so a UTC timestamp would smear an evening open in New York into the next day
-- and mis-bucket exactly the users the feature targets.

create table if not exists push_opens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  opened_on  date not null,
  -- 'daily_sotd' = the server push (the thing being measured); 'local_sotd' /
  -- 'local_wardrobe' = locally scheduled reminders; 'unknown' = older payloads
  -- with no source marker. Kept separate so local nudges can never be mistaken
  -- for evidence that the server push works.
  source     text not null default 'unknown',
  created_at timestamptz not null default now(),
  unique (user_id, opened_on, source)
);

create index if not exists push_opens_opened_idx on push_opens (opened_on desc);
create index if not exists push_opens_user_idx on push_opens (user_id);

comment on table push_opens is
  'One row per user per local day per push source. Exists so retention analysis can see push-driven returns, which otherwise write nothing to the database. Read by scripts/retention-report.mjs.';

-- RLS mirrors enrich_requests / catalog_requests: authenticated users INSERT
-- their own rows only; reads are service-role (analytics). INSERT-only means no
-- ON CONFLICT read path, so anonymous guests — who are most of the base — are
-- not rejected by the policy.
alter table push_opens enable row level security;

drop policy if exists push_opens_insert_own on push_opens;
create policy push_opens_insert_own on push_opens
  for insert to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
