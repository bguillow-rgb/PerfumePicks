// @ts-nocheck — Supabase Edge Functions runtime (Deno).
// supabase/functions/mcp/ratelimit.js
//
// Durable rate guard, shared by all four MCP servers.
//
// History worth keeping: the original in-file limiter was per-isolate, in-memory,
// and allowed 60 calls/minute. On 2026-08-26 a client calling itself
// "PariscoAnalytics/1.0 - product-enrichment" pulled 690 search_fragrances calls out
// of Perfume Picks in 37 minutes — ~18.6/min, under that limit the whole time.
// Sustained extraction is an hourly-volume problem, so the hour windows are the real
// control and the counters live in Postgres (Edge invocations are stateless and
// multi-region, so in-memory counters fragment and reset).
//
// The first Postgres-backed version was then bypassed in the 2026-08-26 audit:
// `user-agent: claude-ai` through mcp.<domain> went 40/40 unblocked, because tier
// came from a spoofable header, assistant tier had no global cap, and every proxied
// request keyed to a Deno egress IP that rotates per request. Both holes are closed
// below: assistant tier now requires a proxy-verified request, and identity comes
// from the proxy rather than from x-forwarded-for when the proxy vouches for it.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PROXY_SECRET = Deno.env.get("MCP_PROXY_SECRET") ?? "";

const ASSISTANT_UA =
  /claude|anthropic|openai|chatgpt|mcp-remote|cursor|windsurf|copilot|perplexity|gemini/i;

/**
 * Who is calling, and may they be believed?
 *
 * `x-mcp-client-ip` is trusted only when `x-mcp-proxy-auth` matches the shared
 * secret, which only our Deno proxy holds and which the proxy strips from inbound
 * requests before setting. A caller hitting *.supabase.co directly can set both
 * headers all day and will simply fail the comparison, falling back to
 * x-forwarded-for (which Supabase's edge normalises).
 */
export function identify(req) {
  const hdr = (n) => req.header(n) ?? "";
  const viaProxy = PROXY_SECRET !== "" && hdr("x-mcp-proxy-auth") === PROXY_SECRET;
  const ip = viaProxy
    ? (hdr("x-mcp-client-ip").trim() || "unknown")
    : (hdr("x-forwarded-for").split(",")[0]?.trim() || "unknown");
  const ua = hdr("user-agent").slice(0, 80);
  // Advisory only. Since 2026-09-16 mcp_rate_guard ignores this and decides the
  // tier in SQL from the providers' published egress ranges (mcp_verified_ranges):
  // a User-Agent, even through the proxy, is not a credential.
  const tier = viaProxy && ASSISTANT_UA.test(ua) ? "assistant" : "default";
  return { ip, ua: ua || null, tier, viaProxy };
}

// Fails OPEN. A public read-only catalog should not go down because the counter is
// unreachable, and the per-isolate limiter still sits in front. Every failure logs
// MCP_RATE_GUARD_DOWN so an outage is greppable rather than silent — a control that
// disables itself without saying so is not a control.
export async function rateGuard(ip, tier) {
  const allow = (reason) => ({ allowed: true, reason, retry_after: 0 });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("MCP_RATE_GUARD_DOWN reason=unconfigured");
    return allow("guard-unconfigured");
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mcp_rate_guard`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_ip: ip, p_tier: tier }),
    });
    if (!res.ok) {
      console.error(`MCP_RATE_GUARD_DOWN reason=http_${res.status}`);
      return allow("guard-unavailable");
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      console.error("MCP_RATE_GUARD_DOWN reason=empty_result");
      return allow("guard-empty");
    }
    return row;
  } catch (e) {
    console.error(`MCP_RATE_GUARD_DOWN reason=exception detail=${e?.message ?? e}`);
    return allow("guard-error");
  }
}

export function tooManyRequests(retryAfter, reason) {
  const seconds = Math.max(1, Number(retryAfter) || 60);
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32029,
        message:
          `Rate limit exceeded (${reason}). This is a public catalog intended for ` +
          `interactive assistant use, not bulk extraction. Retry in ${seconds}s.`,
      },
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(seconds),
        "access-control-allow-origin": "*",
      },
    },
  );
}

// --- Record budget (layer 1 anti-extraction, 2026-09-16) ---------------------
//
// Call limits count requests, but a search can return many rows, so they could not
// stop someone walking the catalog. The budget counts DISTINCT records served per
// IP per UTC day (and globally for unverified traffic), which is what copying
// actually consumes. Real assistant conversations touch a handful of records.
// Thresholds and the verified-IP list live in SQL (mcp_limits,
// mcp_verified_ranges). Fails open, like rateGuard, and logs MCP_RECORD_GUARD_DOWN.

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function recordBudget(ip) {
  if (!SUPABASE_URL || !SERVICE_KEY) return { allowed: true, reason: "guard-unconfigured" };
  try {
    const rows = await rpc("mcp_record_budget", { p_ip: ip });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ?? { allowed: true, reason: "guard-empty" };
  } catch (e) {
    console.error(`MCP_RECORD_GUARD_DOWN op=check detail=${e?.message ?? e}`);
    return { allowed: true, reason: "guard-error" };
  }
}

export async function recordAdd(ip, ids) {
  if (!SUPABASE_URL || !SERVICE_KEY || !ids?.length) return;
  try {
    await rpc("mcp_record_add", { p_ip: ip, p_recs: ids.slice(0, 50) });
  } catch (e) {
    console.error(`MCP_RECORD_GUARD_DOWN op=add detail=${e?.message ?? e}`);
  }
}

/**
 * The catalog records a tool payload exposes: every object (to depth 3) that
 * carries a `slug`, or an `id` next to a `name`/`display`/`title`. The
 * attribution block has neither, so it is not counted.
 */
export function recordIds(payload) {
  const out = new Set();
  const walk = (v, depth) => {
    if (depth > 3 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const key = v.slug ?? ((v.name || v.display || v.title) ? v.id : undefined);
    if (typeof key === "string" || typeof key === "number") out.add(String(key));
    for (const [k, x] of Object.entries(v)) if (k !== "attribution") walk(x, depth + 1);
  };
  walk(payload, 0);
  return [...out];
}

export const RECORD_LIMIT_MESSAGE =
  "Daily record limit reached for this client. This is a public catalog for " +
  "interactive assistant use, not bulk extraction. Try again tomorrow (UTC).";
