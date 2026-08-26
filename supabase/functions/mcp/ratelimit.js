// @ts-nocheck — Supabase Edge Functions runtime (Deno).
// supabase/functions/mcp/ratelimit.js
//
// Durable rate guard, shared by all four MCP servers.
//
// Why this exists: the in-file limiter above it is per-isolate and in-memory, so
// its counters fragment across concurrent isolates and reset when one is recycled.
// It also allowed 60 calls/minute, and on 2026-08-26 a client identifying itself as
// "PariscoAnalytics/1.0 - product-enrichment" pulled 690 search_fragrances calls out
// of Perfume Picks in 37 minutes — roughly 18.6/minute, comfortably under that limit
// the entire time. Sustained extraction is an hourly-volume problem, not a
// per-second burst problem, so the real controls here are the hour windows.
//
// All thresholds live in the SQL function mcp_rate_guard so a change is one SQL
// deploy rather than four Edge Function deploys.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Known multi-tenant assistant clients. These arrive from a small set of shared
// egress IPs carrying many different end users, so they get the roomier tier.
// This is User-Agent matching and therefore spoofable — the absolute per-IP
// ceiling inside mcp_rate_guard is the backstop for a caller that lies here.
const ASSISTANT_UA =
  /claude|anthropic|openai|chatgpt|mcp-remote|cursor|windsurf|copilot|perplexity|gemini/i;

export function clientTier(userAgent) {
  return ASSISTANT_UA.test(userAgent ?? "") ? "assistant" : "default";
}

// Fails OPEN. If the counter is unreachable we serve the request rather than take a
// public read-only catalog offline over a database blip; the per-isolate limiter is
// still in front of it. Every failure is logged so a guard outage is visible rather
// than silently disabling enforcement.
export async function rateGuard(ip, tier) {
  const allow = (reason) => ({ allowed: true, reason, retry_after: 0 });
  if (!SUPABASE_URL || !SERVICE_KEY) return allow("guard-unconfigured");
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
      console.error(`rate guard unavailable: HTTP ${res.status}`);
      return allow("guard-unavailable");
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ?? allow("guard-empty");
  } catch (e) {
    console.error(`rate guard error: ${e?.message ?? e}`);
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
