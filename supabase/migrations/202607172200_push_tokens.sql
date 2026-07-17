-- Push tokens — the missing infra that made 93% of users unreachable.
--
-- The app had ONLY a local, on-device 8am notification (expo Notifications.
-- scheduleNotificationAsync). A local notification can't reach a user who lapsed,
-- and nothing stored a push token, so there was no way to send anyone anything
-- server-side. This table + the daily-sotd-push edge function are the server
-- re-engagement engine: a real morning "your Scent of the Day is ready" push.
--
-- One row per user (latest device wins for MVP — multi-device fan-out is a later
-- concern). tz_offset_minutes is the device's offset from UTC (e.g. ET = -300),
-- captured at registration, so the edge function can send at ~8am LOCAL rather
-- than blasting everyone at one UTC hour (which would wake West-coast users at 5am).

create table if not exists push_tokens (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  token             text not null,               -- Expo push token (ExponentPushToken[...])
  platform          text not null default 'ios',
  tz_offset_minutes int  not null default 0,      -- device offset from UTC in minutes
  last_pushed_on    date,                          -- user-local date of the last SOTD push (dedup)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table push_tokens enable row level security;

-- A user owns exactly their own row. The edge function reads with the service
-- role, which bypasses RLS, so no broad read policy is needed here.
drop policy if exists push_tokens_owner_select on push_tokens;
create policy push_tokens_owner_select on push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists push_tokens_owner_upsert on push_tokens;
create policy push_tokens_owner_upsert on push_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists push_tokens_owner_update on push_tokens;
create policy push_tokens_owner_update on push_tokens
  for update using (auth.uid() = user_id);

drop policy if exists push_tokens_owner_delete on push_tokens;
create policy push_tokens_owner_delete on push_tokens
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
