-- 202608131500_mcp_call_logs.sql
--
-- Write-only telemetry drop box for the public Perfume Picks MCP server
-- (mcp-server/). Measures the "AI calls (MCP)" channel: which tools AI
-- assistants invoke, how often, and from which clients.
--
-- Ships HARDENED from day one (Pour Picks' 058 + 059 combined; see
-- mcp-aeo-playbook Part 2b): anon may INSERT (the public clients log through
-- the publishable key) but every column is capped at the database, nothing
-- is readable without the service role, and rows purge at 90 days.
-- Rows are spoofable in CONTENT — reports built on this table label the
-- numbers as unauthenticated telemetry.

create table if not exists mcp_call_logs (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null check (char_length(tool_name) <= 64),
  args jsonb check (args is null or pg_column_size(args) <= 4096),
  client_name text check (client_name is null or char_length(client_name) <= 200),
  client_version text check (client_version is null or char_length(client_version) <= 64),
  server_version text check (server_version is null or char_length(server_version) <= 32),
  success boolean not null default true,
  error text check (error is null or char_length(error) <= 600),
  duration_ms integer check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 600000)),
  created_at timestamptz default now()
);

create index if not exists idx_mcp_call_logs_created on mcp_call_logs (created_at);
create index if not exists idx_mcp_call_logs_tool on mcp_call_logs (tool_name);

alter table mcp_call_logs enable row level security;

drop policy if exists "MCP clients can log calls" on mcp_call_logs;
create policy "MCP clients can log calls"
  on mcp_call_logs for insert
  to anon, authenticated
  with check (true);

-- 90-day retention purge
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge-mcp-call-logs') then
    perform cron.schedule(
      'purge-mcp-call-logs',
      '23 5 * * *',
      'DELETE FROM mcp_call_logs WHERE created_at < now() - interval ''90 days'''
    );
  end if;
end $$;
