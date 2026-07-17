-- Push tokens: IANA timezone + dead-token handling.
--
-- Back-ported from Pour Picks' more mature push schema. Two fixes to the v1
-- push_tokens table (202607172200):
--
-- 1. IANA TZ. v1 stored tz_offset_minutes — the UTC offset at registration time.
--    That is WRONG across DST: a token registered in July at -240 (EDT) would be
--    pushed an hour off all winter (EST is -300). An IANA zone ('America/New_York')
--    + now() AT TIME ZONE resolves the offset for the actual send date, so 8am
--    local is really 8am year-round. tz is nullable and the edge function falls
--    back to tz_offset_minutes for rows not yet re-registered, so this is a safe
--    additive migration — existing rows heal on the client's next launch.
--
-- 2. invalid_at. When Expo reports a token is dead (DeviceNotRegistered — the app
--    was uninstalled), the send function stamps invalid_at so we stop pushing to
--    it. The function skips any row where invalid_at is set. Keeps the table clean
--    and avoids wasting sends on phones that are gone.

alter table push_tokens
  add column if not exists tz text,                 -- IANA, e.g. 'America/New_York'
  add column if not exists invalid_at timestamptz;  -- set on DeviceNotRegistered

-- Only ever send to live tokens; a partial index keeps that scan tiny.
create index if not exists push_tokens_live_idx
  on push_tokens (user_id) where invalid_at is null;

notify pgrst, 'reload schema';
