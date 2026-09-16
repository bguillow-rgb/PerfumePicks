// @ts-nocheck — Supabase Edge Functions runtime (Deno).
// supabase/functions/mcp/calllog.js
//
// Listing attribution for mcp_call_logs, shared by all four MCP servers
// (copy, don't fork — same convention as ratelimit.js).
//
// Why this exists (2026-09-16): for four weeks referer, origin and result_count
// were NULL on every row because logCall never wrote them, so the first genuine
// external clients could not be traced to a listing. Writing referer/origin
// back is not enough on its own: server-side assistants (Claude, ChatGPT) send
// neither header — they are browser headers. The signal that does separate
// listings is which URL the caller used:
//   proxy:<host>  mcp.<ourdomain> — Docker catalog, MCP.Directory, OpenAI,
//                 our /mcp pages, awesome-mcp-servers
//   direct        the raw *.supabase.co URL — official MCP registry, Smithery,
//                 Glama (they published it before the own-hostname move)
// plus "?src=<tag>" when a listing URL carries one, so a future listing can be
// tagged without code changes.

const clip = (s, n) => (s ? String(s).slice(0, n) : null);

/** Per-request logging context. `who` is the result of ratelimit.identify(). */
export function requestContext(c, who, host) {
  let src = "";
  try {
    const raw = new URL(c.req.url).searchParams.get("src") ?? "";
    src = raw.replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
  } catch { /* malformed URL: no tag */ }
  const door = who.viaProxy ? `proxy:${host}` : "direct";
  return {
    clientName: who.ua,
    referer: clip(c.req.header("referer"), 500),
    origin: clip(c.req.header("origin"), 200),
    entryPoint: src ? `${door}?src=${src}` : door,
  };
}

/**
 * How many results a tool returned, read from the payload the tool built:
 * an explicit result_count wins; otherwise the length of the first top-level
 * array; otherwise 1 for a single record. Errors are logged as null.
 */
export function countResults(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (Number.isInteger(payload.result_count)) return payload.result_count;
  for (const v of Object.values(payload)) {
    if (Array.isArray(v)) return v.length;
  }
  return 1;
}

/** The row written to mcp_call_logs. */
export function logRow(entry, ctx, serverVersion) {
  let args = null;
  try {
    const s = JSON.stringify(entry.args);
    args = s && s.length > 2000 ? { truncated: true, chars: s.length } : entry.args;
  } catch { /* unserializable args stay null */ }
  return {
    tool_name: entry.tool_name,
    args,
    client_name: clip(ctx.clientName, 200),
    // The remote transport is stateless: clientInfo arrives only on the
    // `initialize` request, never on the separate tools/call request, so it
    // cannot be known here. The npm (stdio) package does record it.
    client_version: null,
    server_version: serverVersion,
    success: entry.success,
    error: clip(entry.error, 500),
    duration_ms: Math.round(entry.duration_ms),
    result_count: entry.success && Number.isInteger(entry.result_count) ? entry.result_count : null,
    referer: ctx.referer,
    origin: ctx.origin,
    entry_point: ctx.entryPoint,
  };
}
