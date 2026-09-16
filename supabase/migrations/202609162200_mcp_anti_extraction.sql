-- MCP anti-extraction, layer 1 (2026-09-16).
--
-- Call-count limits alone could not stop catalog copying: 120 calls/hr per IP at up
-- to 25 results each is ~3,000 records an hour, and the "assistant" tier (10x the
-- quota) could be claimed by anyone sending a Claude/ChatGPT User-Agent through
-- mcp.<domain>. This adds:
--   * assistant tier ONLY for IPs in the providers' published egress ranges
--     (mcp_verified_ranges), decided here in SQL; the caller's tier claim is ignored
--   * daily call caps per IP and globally for unverified traffic
--   * a distinct-record budget per IP per day, and globally per day for unverified
--     traffic (mcp_record_hits), which is what actually bounds extraction
-- Thresholds live in mcp_limits so tuning is one UPDATE.

create table if not exists public.mcp_verified_ranges (
  cidr       cidr primary key,
  source     text not null,
  fetched_at timestamptz not null default now()
);
create table if not exists public.mcp_limits (
  key   text primary key,
  value integer not null check (value >= 0),
  note  text
);
create table if not exists public.mcp_record_hits (
  bucket text not null check (char_length(bucket) <= 80),
  day    date not null default ((now() at time zone 'utc')::date),
  rec    text not null check (char_length(rec) <= 200),
  primary key (bucket, day, rec)
);
alter table public.mcp_verified_ranges enable row level security;
alter table public.mcp_limits          enable row level security;
alter table public.mcp_record_hits     enable row level security;
revoke all on public.mcp_verified_ranges, public.mcp_limits, public.mcp_record_hits from anon, authenticated;

insert into public.mcp_limits (key, value, note) values
  ('ip_min_default',              20,   'calls per IP per minute, unverified'),
  ('ip_hour_default',            120,   'calls per IP per hour, unverified'),
  ('ip_day_default',             300,   'calls per IP per UTC day, unverified'),
  ('global_hour_default',        600,   'calls per hour, all unverified traffic'),
  ('global_day_default',        3000,   'calls per UTC day, all unverified traffic'),
  ('ip_min_assistant',           120,   'calls per IP per minute, verified provider IP'),
  ('ip_hour_assistant',         1200,   'calls per IP per hour, verified provider IP'),
  ('ip_day_assistant',         10000,   'calls per IP per UTC day, verified provider IP'),
  ('global_hour_assistant',     6000,   'calls per hour, all verified provider traffic'),
  ('ip_hour_ceiling',           2000,   'absolute calls per IP per hour, any tier'),
  ('records_ip_day_default',     150,   'distinct records served per IP per UTC day, unverified'),
  ('records_ip_day_assistant',  3000,   'distinct records served per IP per UTC day, verified'),
  ('records_global_day_default', 2000,  'distinct records served per UTC day, all unverified traffic')
on conflict (key) do nothing;

create or replace function public.mcp_limit(p_key text, p_default integer)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select value from mcp_limits where key = p_key), p_default)
$$;

create or replace function public.mcp_is_verified_assistant(p_ip text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v inet;
begin
  begin
    v := p_ip::inet;
  exception when others then
    return false;
  end;
  return exists (select 1 from mcp_verified_ranges where v <<= cidr);
end;
$$;

-- Same signature as before so deployed Edge Functions keep working. p_tier is now
-- ignored: tier comes from the verified-range check, never from the caller.
create or replace function public.mcp_rate_guard(p_ip text, p_tier text)
returns table(allowed boolean, reason text, retry_after integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text := case when mcp_is_verified_assistant(p_ip) then 'assistant' else 'default' end;
  r record;
begin
  select * into r from mcp_rate_check('ceil:' || p_ip, mcp_limit('ip_hour_ceiling', 2000), 3600);
  if not r.allowed then return query select false, 'ip-hour-ceiling'::text, r.retry_after; return; end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_min_' || v_tier, 20), 60);
  if not r.allowed then return query select false, 'ip-per-minute'::text, r.retry_after; return; end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_hour_' || v_tier, 120), 3600);
  if not r.allowed then return query select false, 'ip-per-hour'::text, r.retry_after; return; end if;

  select * into r from mcp_rate_check('ip:' || p_ip || ':' || v_tier, mcp_limit('ip_day_' || v_tier, 300), 86400);
  if not r.allowed then return query select false, 'ip-per-day'::text, r.retry_after; return; end if;

  select * into r from mcp_rate_check('global:' || v_tier, mcp_limit('global_hour_' || v_tier, 600), 3600);
  if not r.allowed then return query select false, ('global-' || v_tier || '-hour')::text, r.retry_after; return; end if;

  if v_tier = 'default' then
    select * into r from mcp_rate_check('global:default', mcp_limit('global_day_default', 3000), 86400);
    if not r.allowed then return query select false, 'global-default-day'::text, r.retry_after; return; end if;
  end if;

  return query select true, ('ok:' || v_tier)::text, 0;
end;
$$;

-- Checked before a tool runs. Fails closed only on the budget itself; the Edge
-- Function fails open if this call errors.
create or replace function public.mcp_record_budget(p_ip text)
returns table(allowed boolean, reason text, used integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_day  date := (now() at time zone 'utc')::date;
  v_tier text := case when mcp_is_verified_assistant(p_ip) then 'assistant' else 'default' end;
  v_used integer;
  v_glob integer;
begin
  select count(*) into v_used from mcp_record_hits where bucket = 'ip:' || p_ip and day = v_day;
  if v_used >= mcp_limit('records_ip_day_' || v_tier, 150) then
    return query select false, 'records-ip-day'::text, v_used; return;
  end if;
  if v_tier = 'default' then
    select count(*) into v_glob from mcp_record_hits where bucket = 'global:default' and day = v_day;
    if v_glob >= mcp_limit('records_global_day_default', 2000) then
      return query select false, 'records-global-day'::text, v_glob; return;
    end if;
  end if;
  return query select true, ('ok:' || v_tier)::text, v_used;
end;
$$;

-- Called after a tool returns, with the ids/slugs it served.
create or replace function public.mcp_record_add(p_ip text, p_recs text[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_day  date := (now() at time zone 'utc')::date;
  v_recs text[] := (select coalesce(array_agg(distinct left(x, 200)), '{}')
                      from unnest(coalesce(p_recs, '{}')) as x where x is not null and x <> '');
begin
  if cardinality(v_recs) = 0 then return; end if;
  insert into mcp_record_hits (bucket, day, rec)
    select 'ip:' || left(p_ip, 60), v_day, x from unnest(v_recs[1:50]) as x
  on conflict do nothing;
  if not mcp_is_verified_assistant(p_ip) then
    insert into mcp_record_hits (bucket, day, rec)
      select 'global:default', v_day, x from unnest(v_recs[1:50]) as x
    on conflict do nothing;
  end if;
  if random() < 0.01 then
    delete from mcp_record_hits where day < v_day - 2;
  end if;
end;
$$;

revoke all on function public.mcp_limit(text, integer), public.mcp_is_verified_assistant(text),
  public.mcp_record_budget(text), public.mcp_record_add(text, text[]), public.mcp_rate_guard(text, text)
  from public, anon, authenticated;
grant execute on function public.mcp_limit(text, integer), public.mcp_is_verified_assistant(text),
  public.mcp_record_budget(text), public.mcp_record_add(text, text[]), public.mcp_rate_guard(text, text)
  to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'purge-mcp-record-hits') then
    perform cron.schedule('purge-mcp-record-hits', '41 5 * * *',
      $c$delete from public.mcp_record_hits where day < ((now() at time zone 'utc')::date - 2)$c$);
  end if;
end $$;

-- Per-project sizing of the global daily record budget (catalog-relative).
update public.mcp_limits set value = 2000 where key = 'records_global_day_default';

-- mcp_verified_ranges is seeded and refreshed by
-- dna-layer/planning/mcp-proxy/refresh-verified-ranges.py (OpenAI updates its lists).
