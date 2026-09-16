-- Listing attribution for MCP call logs (2026-09-16).
-- entry_point: which door a call came through. Remote calls record
-- "proxy:<host>" (mcp.<ourdomain>, used by Docker / MCP.Directory / OpenAI /
-- our /mcp pages) or "direct" (the raw *.supabase.co URL, published by the
-- official MCP registry and Smithery), plus "?src=<tag>" when the listing URL
-- carries one. The npm (stdio) package records "stdio:<launcher>".
-- Also caps referer/origin/result_count, which shipped without limits on a
-- table anon can write to.
alter table public.mcp_call_logs add column if not exists entry_point text;
alter table public.mcp_call_logs drop constraint if exists mcp_call_logs_entry_point_check;
alter table public.mcp_call_logs add constraint mcp_call_logs_entry_point_check
  check (entry_point is null or char_length(entry_point) <= 120);
alter table public.mcp_call_logs drop constraint if exists mcp_call_logs_referer_check;
alter table public.mcp_call_logs add constraint mcp_call_logs_referer_check
  check (referer is null or char_length(referer) <= 500);
alter table public.mcp_call_logs drop constraint if exists mcp_call_logs_origin_check;
alter table public.mcp_call_logs add constraint mcp_call_logs_origin_check
  check (origin is null or char_length(origin) <= 200);
alter table public.mcp_call_logs drop constraint if exists mcp_call_logs_result_count_check;
alter table public.mcp_call_logs add constraint mcp_call_logs_result_count_check
  check (result_count is null or (result_count >= 0 and result_count <= 100000));
