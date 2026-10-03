// @ts-nocheck — Supabase Edge Functions runtime (Deno).
// supabase/functions/mcp/tracking.js
//
// Tracked outbound links for MCP responses, shared by all four servers (copy,
// don't fork — same convention as calllog.js). Added 2026-10-03 for the Claude
// directory / ChatGPT plugin launch: an assistant shows our links, and we need
// to know who clicked through, what they did, and whether they converted.
//
// Each tool call gets a short ref. Website links carry UTM tags
//   utm_source=<claude|chatgpt|cursor|other|test>  utm_medium=ai_plugin
//   utm_campaign=<tool name>  utm_content=<ref>
// so GA4 attributes the visit and its key events to the assistant and tool, and
// mcp_call_logs.click_ref joins a visit back to the exact question asked.
// App Store links carry Apple campaign tags (pt/ct) only when
// APPLE_PROVIDER_TOKEN is set as a function secret; without it they stay plain.
//
// The source comes from the self-reported User-Agent, so it is spoofable.
// Our own test traffic uses "timberline-audit" and is tagged "test".

export function newRef() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export function aiSource(ua) {
  const s = (ua || "").toLowerCase();
  if (s.includes("timberline-audit")) return "test";
  if (/claude|anthropic/.test(s)) return "claude";
  if (/openai|chatgpt/.test(s)) return "chatgpt";
  if (s.includes("cursor")) return "cursor";
  return "other";
}

function tagWeb(url, { source, tool, ref }) {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "ai_plugin");
    u.searchParams.set("utm_campaign", tool || "unknown");
    u.searchParams.set("utm_content", ref);
    return u.toString();
  } catch {
    return url;
  }
}

function tagAppStore(url, { source, tool }) {
  const pt = Deno.env.get("APPLE_PROVIDER_TOKEN");
  if (!pt) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("pt", pt);
    u.searchParams.set("ct", `ai-${source}-${tool || "x"}`.slice(0, 40));
    u.searchParams.set("mt", "8");
    return u.toString();
  } catch {
    return url;
  }
}

/** Tag the attribution links object ({ website, app_store }) for one call. */
export function tagLinks(links, ctx) {
  if (!links || typeof links !== "object") return links;
  const out = { ...links };
  if (out.website) out.website = tagWeb(out.website, ctx);
  if (out.app_store) out.app_store = tagAppStore(out.app_store, ctx);
  return out;
}

export { tagWeb };
