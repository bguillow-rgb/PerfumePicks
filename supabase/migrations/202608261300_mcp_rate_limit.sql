-- MCP rate limiting: fixed-window counters, one row per (key, window-size, window).
-- Lives in Postgres rather than in-process because Edge Function invocations are
-- stateless and may run in several regions at once, so an in-memory counter would
-- reset constantly and undercount a distributed caller.

create table if not exists mcp_rate_limits (
  bucket_key   text primary key,
  count        integer     not null default 0,
  window_start timestamptz not null,
  expires_at   timestamptz not null
);

create index if not exists mcp_rate_limits_expires_idx on mcp_rate_limits (expires_at);

-- Only the service role touches this table, and service_role bypasses RLS. Enabling
-- RLS with no policies means anon/authenticated get nothing even if the table is
-- ever exposed through PostgREST.
alter table mcp_rate_limits enable row level security;

-- Atomically bump the counter for one window and report whether the caller is over.
-- The INSERT ... ON CONFLICT DO UPDATE is a single statement, so concurrent requests
-- serialise on the row rather than racing a read-then-write.
create or replace function mcp_rate_check(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now       timestamptz := now();
  v_epoch     bigint      := floor(extract(epoch from v_now));
  v_win_epoch bigint      := (v_epoch / p_window_seconds) * p_window_seconds;
  v_win_start timestamptz := to_timestamp(v_win_epoch);
  v_key       text        := p_key || '|' || p_window_seconds || '|' || v_win_epoch;
  v_count     integer;
begin
  insert into mcp_rate_limits as m (bucket_key, count, window_start, expires_at)
  values (v_key, 1, v_win_start, v_win_start + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket_key) do update set count = m.count + 1
  returning m.count into v_count;

  -- Opportunistic GC so the table cannot grow without bound. Cheap, and bounded by
  -- the expires_at index; runs on roughly 1% of calls.
  if random() < 0.01 then
    delete from mcp_rate_limits where expires_at < v_now;
  end if;

  return query select
    (v_count <= p_limit),
    v_count,
    (v_win_epoch + p_window_seconds - v_epoch)::integer;
end;
$$;

revoke all on function mcp_rate_check(text, integer, integer) from public, anon, authenticated;
-- One-round-trip rate guard. All limits live here so the four Edge Functions stay
-- identical and a threshold change is a SQL deploy, not four function deploys.
--
-- Tiers exist because real assistant traffic arrives from a handful of shared
-- egress IPs at OpenAI/Anthropic and is multi-tenant, so a per-IP limit tight
-- enough to stop a scraper would also throttle genuine users. Unknown clients get
-- the tight limit; known assistants get headroom.
--
-- The global bucket is what actually stops a determined scraper: per-IP limits are
-- evaded by rotating source IPs, and the first x-forwarded-for entry is
-- caller-controlled anyway. Capping *all* untiered traffic per hour bounds the
-- total extractable volume regardless of how many IPs or User-Agents are used.

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
  v_min_limit  integer;
  v_hour_limit integer;
begin
  if p_tier = 'assistant' then
    v_min_limit  := 120;
    v_hour_limit := 1200;
  else
    v_min_limit  := 20;
    v_hour_limit := 120;
  end if;

  -- Absolute per-IP ceiling, applied to every tier. A scraper that spoofs a known
  -- assistant User-Agent still cannot exceed this.
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

  -- Untiered traffic only. Assistants are exempt so one busy scraper cannot deny
  -- service to genuine ChatGPT/Claude users.
  if p_tier <> 'assistant' then
    select * into r_global from mcp_rate_check('global:default', 600, 3600);
    if not r_global.allowed then
      return query select false, 'global-untrusted-hour'::text, r_global.retry_after; return;
    end if;
  end if;

  return query select true, 'ok'::text, 0;
end;
$$;

revoke all on function mcp_rate_guard(text, text) from public, anon, authenticated;
