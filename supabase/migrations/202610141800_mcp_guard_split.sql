-- MCP guard split + refusal logging + denylist (2026-10-14).
--
-- Why: mcp_rate_guard runs on EVERY http request, so connect/tools-list/SSE probes
-- (~99% of traffic: 47 tool calls against ~3,250 requests on Perfume 2026-10-14) were
-- filling the GLOBAL daily budget. Once it tripped, every unverified client was refused
-- for the rest of the UTC day, including legitimate non-provider clients (Smithery
-- gateway, Cursor, custom clients), while nothing was actually being copied (records
-- served were 1-7% of budget). Refusals were also invisible: only executed tool calls
-- reach mcp_call_logs.
--
-- Now: per-IP limits still apply to every request (mcp_rate_guard). The global budget
-- and the record budget apply only to real tool calls (mcp_tool_guard, called from
-- guarded()). Every refusal is recorded in mcp_blocks.

create table if not exists public.mcp_blocks (
  id         bigint generated always as identity primary key,
  ip         text not null check (char_length(ip) <= 60),
  ua         text check (ua is null or char_length(ua) <= 200),
  tier       text not null check (char_length(tier) <= 20),
  scope      text not null check (char_length(scope) <= 20),   -- 'request' | 'tool'
  reason     text not null check (char_length(reason) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists mcp_blocks_created_idx on public.mcp_blocks (created_at desc);
alter table public.mcp_blocks enable row level security;

create table if not exists public.mcp_denylist (
  cidr    cidr primary key,
  note    text,
  added_at timestamptz not null default now()
);
alter table public.mcp_denylist enable row level security;
revoke all on public.mcp_blocks, public.mcp_denylist from anon, authenticated;

create or replace function public.mcp_is_denied(p_ip text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v inet;
begin
  begin v := p_ip::inet; exception when others then return false; end;
  return exists (select 1 from mcp_denylist where v <<= cidr);
end;
$$;

create or replace function public.mcp_log_block(p_ip text, p_ua text, p_tier text, p_scope text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into mcp_blocks (ip, ua, tier, scope, reason)
  values (left(p_ip, 60), left(p_ua, 200), p_tier, p_scope, p_reason);
  if random() < 0.01 then
    delete from mcp_blocks where created_at < now() - interval '30 days';
  end if;
end;
$$;

-- Per-REQUEST guard. Per-IP limits only; the global budget moved to mcp_tool_guard.
-- p_tier is still ignored (tier comes from the verified-range check).
create or replace function public.mcp_rate_guard(p_ip text, p_tier text, p_ua text default null)
returns table(allowed boolean, reason text, retry_after integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text := case when mcp_is_verified_assistant(p_ip) then 'assistant' else 'default' end;
  r record;
begin
  if mcp_is_denied(p_ip) then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'request', 'denylist');
    return query select false, 'denylist'::text, 86400; return;
  end if;

  select * into r from mcp_rate_check('ceil:' || p_ip, mcp_limit('ip_hour_ceiling', 2000), 3600);
  if not r.allowed then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'request', 'ip-hour-ceiling');
    return query select false, 'ip-hour-ceiling'::text, r.retry_after; return;
  end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_min_' || v_tier, 20), 60);
  if not r.allowed then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'request', 'ip-per-minute');
    return query select false, 'ip-per-minute'::text, r.retry_after; return;
  end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_hour_' || v_tier, 120), 3600);
  if not r.allowed then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'request', 'ip-per-hour');
    return query select false, 'ip-per-hour'::text, r.retry_after; return;
  end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_day_' || v_tier, 300), 86400);
  if not r.allowed then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'request', 'ip-per-day');
    return query select false, 'ip-per-day'::text, r.retry_after; return;
  end if;

  return query select true, ('ok:' || v_tier)::text, 0;
end;
$$;

-- Per-TOOL-CALL guard: the global call budget (unverified traffic only) plus the
-- distinct-record budget. Called from guarded() before the tool runs.
create or replace function public.mcp_tool_guard(p_ip text, p_ua text default null)
returns table(allowed boolean, reason text, retry_after integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text := case when mcp_is_verified_assistant(p_ip) then 'assistant' else 'default' end;
  v_day  date := (now() at time zone 'utc')::date;
  r record;
  v_used integer;
  v_glob integer;
begin
  if mcp_is_denied(p_ip) then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'tool', 'denylist');
    return query select false, 'denylist'::text, 86400; return;
  end if;

  select * into r from mcp_rate_check('tools:global:' || v_tier, mcp_limit('global_hour_' || v_tier, 600), 3600);
  if not r.allowed then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'tool', 'global-' || v_tier || '-hour');
    return query select false, ('global-' || v_tier || '-hour')::text, r.retry_after; return;
  end if;

  if v_tier = 'default' then
    select * into r from mcp_rate_check('tools:global:default', mcp_limit('global_day_default', 3000), 86400);
    if not r.allowed then
      perform mcp_log_block(p_ip, p_ua, v_tier, 'tool', 'global-default-day');
      return query select false, 'global-default-day'::text, r.retry_after; return;
    end if;
  end if;

  select count(*) into v_used from mcp_record_hits where bucket = 'ip:' || p_ip and day = v_day;
  if v_used >= mcp_limit('records_ip_day_' || v_tier, 150) then
    perform mcp_log_block(p_ip, p_ua, v_tier, 'tool', 'records-ip-day');
    return query select false, 'records-ip-day'::text, 86400; return;
  end if;

  if v_tier = 'default' then
    select count(*) into v_glob from mcp_record_hits where bucket = 'global:default' and day = v_day;
    if v_glob >= mcp_limit('records_global_day_default', 2000) then
      perform mcp_log_block(p_ip, p_ua, v_tier, 'tool', 'records-global-day');
      return query select false, 'records-global-day'::text, 86400; return;
    end if;
  end if;

  return query select true, ('ok:' || v_tier)::text, 0;
end;
$$;

revoke all on function public.mcp_is_denied(text), public.mcp_log_block(text,text,text,text,text),
  public.mcp_tool_guard(text,text), public.mcp_rate_guard(text,text,text) from public, anon, authenticated;
grant execute on function public.mcp_is_denied(text), public.mcp_log_block(text,text,text,text,text),
  public.mcp_tool_guard(text,text), public.mcp_rate_guard(text,text,text) to service_role;

-- Scraper attempting ~2,000 requests/day/server while already capped at 300 (2026-10-14).
insert into public.mcp_denylist (cidr, note) values
  ('34.247.142.193/32', 'AWS eu-west-1; 2,016 req/day/server on 2026-10-14 while blocked at the per-IP day cap')
on conflict (cidr) do nothing;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'purge-mcp-blocks') then
    perform cron.schedule('purge-mcp-blocks', '47 5 * * *',
      $c$delete from public.mcp_blocks where created_at < now() - interval '30 days'$c$);
  end if;
end $$;
