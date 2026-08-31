-- Revision 2 (Mark Z audit, 2026-08-26).
--
-- Change from revision 1: the assistant tier had NO global ceiling, on the theory
-- that one scraper should not be able to deny service to real ChatGPT users. In
-- practice that made "user-agent: claude-ai" an unlimited quota, because tier came
-- from a spoofable header. Tier is now proxy-gated in the Edge Function, and the
-- assistant tier gets its own global cap as defence in depth: no tier is uncapped.
--
-- The assistant global is set well above plausible real usage (nine genuine
-- assistant calls in the first thirteen days) so it bites an extractor long before
-- it bites a user.

create or replace function mcp_rate_guard(p_ip text, p_tier text)
returns table (allowed boolean, reason text, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_min    record;
  r_hour   record;
  r_global record;
  r_ceil   record;
  v_min_limit    integer;
  v_hour_limit   integer;
  v_global_key   text;
  v_global_limit integer;
begin
  if p_tier = 'assistant' then
    v_min_limit := 120; v_hour_limit := 1200;
    v_global_key := 'global:assistant'; v_global_limit := 6000;
  else
    v_min_limit := 20;  v_hour_limit := 120;
    v_global_key := 'global:default';   v_global_limit := 600;
  end if;

  -- Absolute per-IP ceiling, every tier.
  select * into r_ceil from mcp_rate_check('ceil:' || p_ip, 2000, 3600);
  if not r_ceil.allowed then
    return query select false, 'ip-hour-ceiling'::text, r_ceil.retry_after; return;
  end if;

  select * into r_min from mcp_rate_check('ip:' || p_ip || ':' || p_tier, v_min_limit, 60);
  if not r_min.allowed then
    return query select false, 'ip-per-minute'::text, r_min.retry_after; return;
  end if;

  select * into r_hour from mcp_rate_check('ip:' || p_ip || ':' || p_tier, v_hour_limit, 3600);
  if not r_hour.allowed then
    return query select false, 'ip-per-hour'::text, r_hour.retry_after; return;
  end if;

  select * into r_global from mcp_rate_check(v_global_key, v_global_limit, 3600);
  if not r_global.allowed then
    return query select false, 'global-' || p_tier || '-hour', r_global.retry_after; return;
  end if;

  return query select true, 'ok'::text, 0;
end;
$$;

revoke all on function mcp_rate_guard(text, text) from public, anon, authenticated;
