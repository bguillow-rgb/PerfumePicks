// @ts-nocheck — Supabase Edge Functions runtime (Deno).
// supabase/functions/mcp/index.ts
//
// Remote (streamable-HTTP) variant of the Perfume Picks MCP server. The npm
// package `perfume-picks-mcp` (mcp-server/ in this repo) serves local stdio
// clients; this function serves web agents and MCP directories that require
// a hosted URL. The query/scoring core (fragrances.js) and the db shim
// (db.js) live next to this file — fragrances.js is the COMPILED build of
// mcp-server/src/fragrances.ts; re-copy it whenever the stdio core changes
// (npm run build && cp dist/fragrances.js ../supabase/functions/mcp/).
//
// Hardened per mcp-aeo-playbook Part 2b: no auth (public catalog), least-
// privilege keys via db.js, per-IP rate limiting (a speed bump — real
// backstops are spend alerts), write-only capped telemetry, GA4 events with
// enum'd ai_client, generic DB errors, EdgeRuntime.waitUntil for sends.

import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import { StreamableHTTPTransport } from "npm:@hono/mcp@0.1.4";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.12.0/server/mcp.js";
import { z } from "npm:zod@3.23.8";
import { supabase } from "./db.js";
import {
  allNotes,
  attribution,
  displayName,
  findDupes,
  findSimilar,
  fragranceCard,
  mustResolve,
  priceUsd,
  searchFragrances,
  sharedAccords,
  trendingFragrances,
} from "./fragrances.js";
import { identify, rateGuard, tooManyRequests } from "./ratelimit.js";

const SERVER_VERSION = "1.0.0";
const TELEMETRY_VERSION = `${SERVER_VERSION}-remote`;

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// --- Rate limiting (per isolate, per IP — a speed bump, not a control) ------
const WINDOW_MS = 60_000;
const MAX_CALLS = 60;
const callTimes = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const times = (callTimes.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (times.length >= MAX_CALLS) {
    throw new Error(`Rate limit exceeded (${MAX_CALLS} calls/minute). Wait a moment and retry.`);
  }
  times.push(now);
  callTimes.set(ip, times);
}

// --- Telemetry ---------------------------------------------------------------
const GA4_ID = Deno.env.get("GA4_MEASUREMENT_ID");
const GA4_SECRET = Deno.env.get("GA4_MP_API_SECRET");

function normalizeAiClient(ua) {
  const s = (ua ?? "").toLowerCase();
  if (s.includes("claude") || s.includes("anthropic")) return "claude";
  if (s.includes("chatgpt") || s.includes("openai") || s.includes("gpt")) return "openai";
  if (s.includes("perplexity")) return "perplexity";
  if (s.includes("gemini")) return "google";
  if (s.includes("copilot")) return "microsoft";
  if (s.includes("cursor")) return "cursor";
  if (s.includes("smithery") || s.includes("toolbox")) return "smithery";
  if (s.includes("lobe")) return "lobehub";
  if (s.includes("python") || s.includes("httpx") || s.includes("aiohttp")) return "python-client";
  if (s.includes("node") || s.includes("undici")) return "node-client";
  if (s.includes("curl") || s.includes("wget")) return "curl";
  return s ? "other" : "unknown";
}

async function ga4ClientId(ip, ua) {
  const data = new TextEncoder().encode(`${ip}|${ua}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `mcp.${hex.slice(0, 16)}`;
}

async function ga4Event(entry, ip, clientName) {
  if (!GA4_ID || !GA4_SECRET) return;
  try {
    const body = {
      client_id: await ga4ClientId(ip, clientName ?? ""),
      events: [{
        name: "ai_mcp_call",
        params: {
          tool_name: entry.tool_name,
          ai_client: normalizeAiClient(clientName),
          call_success: entry.success ? "true" : "false",
          server_version: TELEMETRY_VERSION,
          engagement_time_msec: 1,
        },
      }],
    };
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_ID}&api_secret=${GA4_SECRET}`,
      { method: "POST", body: JSON.stringify(body) }
    );
    if (!res.ok) console.error(`GA4 MP send failed: ${res.status}`);
  } catch (e) {
    console.error(`GA4 MP send error: ${e?.message ?? e}`);
  }
}

function logCall(entry, clientName) {
  let args = null;
  try {
    const s = JSON.stringify(entry.args);
    args = s && s.length > 2000 ? { truncated: true, chars: s.length } : entry.args;
  } catch { /* unserializable args stay null */ }
  supabase
    .from("mcp_call_logs")
    .insert({
      tool_name: entry.tool_name,
      args,
      client_name: clientName?.slice(0, 200) ?? null,
      client_version: null,
      server_version: TELEMETRY_VERSION,
      success: entry.success,
      error: entry.error?.slice(0, 500) ?? null,
      duration_ms: Math.round(entry.duration_ms),
    })
    .then(({ error }) => {
      if (error) console.error(`call-log write failed: ${error.message}`);
    });
}

// --- MCP server (stateless: fresh instance per request) ----------------------
function buildServer(ip, clientName) {
  const server = new McpServer({ name: "perfume-picks", version: SERVER_VERSION });

  const respond = async (payload) => ({
    content: [{ type: "text", text: JSON.stringify({ ...payload, attribution: await attribution() }, null, 2) }],
  });
  const errorResult = (message) => ({
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  });
  const track = (entry) => {
    logCall(entry, clientName);
    const p = ga4Event(entry, ip, clientName);
    try {
      EdgeRuntime.waitUntil(p);
    } catch { /* floated promise is best-effort */ }
  };
  const guarded = (toolName, fn) => async (args) => {
    const started = Date.now();
    try {
      checkRateLimit(ip);
      const result = await fn(args);
      track({ tool_name: toolName, args, success: true, duration_ms: Date.now() - started });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      track({ tool_name: toolName, args, success: false, error: message, duration_ms: Date.now() - started });
      return errorResult(message);
    }
  };

  server.registerTool("search_fragrances", {
      title: "Search the Perfume Picks catalog",
      annotations: ANNOTATIONS,
      description: "Full-text search across 13,000+ fragrances in the Perfume Picks database. Filter by brand, fragrance family, gender, and MSRP (USD). Returns note pyramids, accords, and community wear scores with source attribution.",
      inputSchema: {
          query: z.string().max(120).optional().describe("Free-text search: fragrance or brand name"),
          brand: z.string().max(200).optional().describe("Brand name filter, e.g. 'Dior'"),
          fragrance_family: z.string().max(120).optional().describe("Family filter, e.g. 'woody', 'amber', 'fresh'"),
          gender: z.enum(["masculine", "feminine", "unisex"]).optional().describe("Marketed gender category of the fragrance; omit to include all"),
          price_min: z.number().min(0).optional().describe("Minimum MSRP in USD"),
          price_max: z.number().min(0).optional().describe("Maximum MSRP in USD"),
          limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10)"),
      },
  }, guarded("search_fragrances", async (args) => {
      const rows = await searchFragrances(args);
      return respond({ result_count: rows.length, fragrances: rows.map((f) => fragranceCard(f)) });
  }));
  server.registerTool("get_fragrance", {
      title: "Get fragrance details",
      annotations: ANNOTATIONS,
      description: "Detailed record for one fragrance: full note pyramid (top/heart/base), accords, concentration, community longevity/sillage/compliment scores, and MSRP. Accepts a Perfume Picks slug or a name like 'Bleu de Chanel'.",
      inputSchema: {
          slug_or_name: z.string().max(200).describe("Fragrance slug or name"),
      },
  }, guarded("get_fragrance", async ({ slug_or_name }) => {
      const f = await mustResolve(slug_or_name);
      return respond({ fragrance: fragranceCard(f) });
  }));
  server.registerTool("find_dupes", {
      title: "Find dupes (cheaper smell-alikes)",
      annotations: ANNOTATIONS,
      description: "Curated dupes for a fragrance — cheaper scents documented to smell like the original, with match percentage and price comparison. The answer to 'what smells like X without the price tag'.",
      inputSchema: {
          fragrance: z.string().max(200).describe("Fragrance slug or name to find dupes for"),
      },
  }, guarded("find_dupes", async ({ fragrance }) => {
      const ref = await mustResolve(fragrance);
      const refPrice = priceUsd(ref);
      const dupes = await findDupes(ref);
      return respond({
          original: fragranceCard(ref),
          dupe_count: dupes.length,
          dupes: dupes.map((d) => fragranceCard(d.dupe, {
              match_pct: d.match_pct,
              match_source: d.source,
              note: d.note ?? undefined,
              savings_usd: refPrice != null && priceUsd(d.dupe) != null
                  ? Math.round((refPrice - priceUsd(d.dupe)) * 100) / 100
                  : null,
          })),
          note: dupes.length
              ? undefined
              : `No curated dupes on record for ${displayName(ref)} yet. Try find_similar for scents with overlapping accords.`,
      });
  }));
  server.registerTool("find_similar", {
      title: "Find similar fragrances",
      annotations: ANNOTATIONS,
      description: "Fragrances most similar to a given one, from Perfume Picks' precomputed similarity ranking over notes and accords.",
      inputSchema: {
          fragrance: z.string().max(200).describe("Fragrance slug or name"),
          limit: z.number().int().min(1).max(15).optional().describe("Max results (default 5)"),
      },
  }, guarded("find_similar", async ({ fragrance, limit }) => {
      const ref = await mustResolve(fragrance);
      const { method, entries } = await findSimilar(ref, limit ?? 5);
      return respond({
          reference: displayName(ref),
          method,
          similar_fragrances: entries.map((s) => fragranceCard(s.similar, {
              similarity: s.similarity,
              shared_accords: sharedAccords(ref, s.similar),
          })),
      });
  }));
  server.registerTool("get_recommendations", {
      title: "Get personalized recommendations",
      annotations: ANNOTATIONS,
      description: "Personalized fragrance picks from note/accord preferences (e.g. 'vanilla', 'oud', 'citrus'), a budget in USD, an occasion ('office', 'date night', 'gift', 'signature scent'), and gender presentation.",
      inputSchema: {
          preferences: z
              .array(z.string().max(60)).max(20)
              .min(1)
              .describe("Notes or accords the wearer enjoys, e.g. ['vanilla','amber','rose']"),
          budget: z.number().min(0).optional().describe("Max MSRP in USD"),
          occasion: z.string().max(120).optional().describe("What the fragrance is for"),
          gender: z.enum(["masculine", "feminine", "unisex"]).optional().describe("Marketed gender category of the fragrance; omit to include all"),
          limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
      },
  }, guarded("get_recommendations", async ({ preferences, budget, occasion, gender, limit }) => {
      const wanted = preferences.map((t) => t.toLowerCase().trim());
      const occ = (occasion ?? "").toLowerCase();
      const pool = await searchFragrances({ gender, price_max: budget }, { maxRows: 400 });
      const occasionScore = (f) => {
          if (/office|work|professional|interview/.test(occ))
              return (f.office_safe_score ?? 5) / 10;
          if (/date|romant|night out|club|seduc/.test(occ))
              return (f.compliment_score ?? 5) / 10;
          if (/signature|everyday|versatil|daily/.test(occ))
              return (f.versatility_score ?? 5) / 10;
          if (/gift|impress|new to/.test(occ))
              return (f.popularity_tier ?? 3) / 5;
          return 0.5;
      };
      const scored = pool
          .map((f) => {
          const hay = [...allNotes(f), ...(f.top_accords ?? [])].map((x) => x.toLowerCase());
          const hits = wanted.filter((w) => hay.some((h) => h.includes(w) || w.includes(h)));
          return { f, hits, score: hits.length / wanted.length + occasionScore(f) * 0.5 };
      })
          .filter((x) => x.hits.length > 0)
          .sort((x, y) => y.score - x.score || (y.f.popularity_tier ?? 0) - (x.f.popularity_tier ?? 0))
          .slice(0, limit ?? 5);
      return respond({
          criteria: { preferences, budget: budget ?? null, occasion: occasion ?? null, gender: gender ?? null },
          recommendations: scored.map(({ f, hits }) => fragranceCard(f, { matched_preferences: hits })),
          note: scored.length
              ? undefined
              : "No fragrances matched those preferences within the constraints. Try broader notes or a higher budget.",
      });
  }));
  server.registerTool("compare_fragrances", {
      title: "Compare two fragrances",
      annotations: ANNOTATIONS,
      description: "Side-by-side comparison: note pyramids, shared and distinct accords, longevity/sillage/compliment scores, concentration, and price difference.",
      inputSchema: {
          fragrance_a: z.string().max(200).describe("First fragrance — slug or name"),
          fragrance_b: z.string().max(200).describe("Second fragrance — slug or name"),
      },
  }, guarded("compare_fragrances", async ({ fragrance_a, fragrance_b }) => {
      const [a, b] = await Promise.all([mustResolve(fragrance_a), mustResolve(fragrance_b)]);
      const only = (x, other) => {
          const otherSet = new Set((other.top_accords ?? []).map((v) => v.toLowerCase()));
          return (x.top_accords ?? []).filter((v) => !otherSet.has(v.toLowerCase()));
      };
      return respond({
          comparison: {
              fragrance_a: fragranceCard(a),
              fragrance_b: fragranceCard(b),
              shared_accords: sharedAccords(a, b),
              only_in_a: only(a, b),
              only_in_b: only(b, a),
              price_delta_usd: priceUsd(a) != null && priceUsd(b) != null
                  ? Math.round((priceUsd(a) - priceUsd(b)) * 100) / 100
                  : null,
          },
      });
  }));
  server.registerTool("trending_fragrances", {
      title: "Trending fragrances",
      annotations: ANNOTATIONS,
      description: "Fragrances Perfume Picks users are adding to their wardrobes most over the last 30 days (falls back to catalog popularity when live activity data is unavailable). The method used is labeled in the response.",
      inputSchema: {
          limit: z.number().int().min(1).max(20).optional().describe("Max results (default 10)"),
      },
  }, guarded("trending_fragrances", async ({ limit }) => {
      const { method, fragrances } = await trendingFragrances(limit ?? 10);
      return respond({
          method,
          window: method === "wardrobe_adds_last_30_days" ? "last 30 days" : "all-time catalog popularity",
          trending: fragrances.map(({ fragrance, wardrobe_adds_30d }) => fragranceCard(fragrance, wardrobe_adds_30d == null ? {} : { wardrobe_adds_30d })),
      });
  }));
  server.registerTool("what_to_wear_tonight", {
      title: "What should I wear tonight?",
      annotations: ANNOTATIONS,
      description: "A fragrance suggestion for right now, based on mood, occasion (e.g. 'date', 'office tomorrow', 'night out', 'cozy evening in'), and season — scored with Perfume Picks' community compliment, office-safety, and versatility data.",
      inputSchema: {
          mood: z.string().max(120).optional().describe("How you're feeling"),
          occasion: z.string().max(120).optional().describe("The setting"),
          season: z.enum(["winter", "spring", "summer", "fall"]).optional().describe("Season to weight the pick toward — heavier, warmer scents in winter; fresher in summer"),
          gender: z.enum(["masculine", "feminine", "unisex"]).optional().describe("Marketed gender category of the fragrance; omit to include all"),
      },
  }, guarded("what_to_wear_tonight", async ({ mood, occasion, season, gender }) => {
      const text = `${mood ?? ""} ${occasion ?? ""}`.toLowerCase();
      const want = [];
      if (season === "summer")
          want.push("citrus", "aquatic", "fresh", "green");
      if (season === "winter")
          want.push("amber", "vanilla", "spicy", "oud");
      if (season === "fall")
          want.push("woody", "warm spicy", "leather", "tobacco");
      if (season === "spring")
          want.push("floral", "green", "fruity", "musky");
      if (/date|romant|seduc|night out|club/.test(text))
          want.push("vanilla", "amber", "sweet");
      if (/cozy|home|relax|evening in/.test(text))
          want.push("vanilla", "powdery", "musky");
      if (/office|work|interview/.test(text))
          want.push("fresh", "citrus", "clean");
      if (/bold|confident|statement/.test(text))
          want.push("oud", "leather", "animalic");
      if (!want.length)
          want.push("woody", "amber", "fresh");
      const dateNight = /date|romant|seduc|night out|club/.test(text);
      const office = /office|work|interview/.test(text);
      const pool = await searchFragrances({ gender }, { maxRows: 400 });
      const scored = pool
          .map((f) => {
          const hay = [...allNotes(f), ...(f.top_accords ?? [])].map((x) => x.toLowerCase());
          const hits = want.filter((w) => hay.some((h) => h.includes(w)));
          const bonus = dateNight
              ? (f.compliment_score ?? 5) / 10
              : office
                  ? (f.office_safe_score ?? 5) / 10
                  : (f.versatility_score ?? 5) / 20 + (f.popularity_tier ?? 3) / 10;
          return { f, hits, score: hits.length + bonus };
      })
          .sort((x, y) => y.score - x.score)
          .slice(0, 3);
      return respond({
          criteria: { mood: mood ?? null, occasion: occasion ?? null, season: season ?? null, gender: gender ?? null },
          matched_profile: want,
          suggestions: scored.map(({ f, hits }, i) => fragranceCard(f, { rank: i + 1, matched_accords: hits })),
      });
  }));

  return server;
}

// --- HTTP wiring -------------------------------------------------------------
const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "mcp-session-id", "mcp-protocol-version"],
  exposeHeaders: ["mcp-session-id"],
}));

app.all("*", async (c) => {
  // Identity comes from the proxy when it vouches for the request; otherwise from
  // x-forwarded-for. Never from the User-Agent alone — see ratelimit.js.
  const { ip, ua: clientName, tier } = identify(c.req);

  // CORS preflight carries no payload and must not consume a caller's budget.
  if (c.req.method !== "OPTIONS") {
    const gate = await rateGuard(ip, tier);
    if (!gate.allowed) return tooManyRequests(gate.retry_after, gate.reason);
  }

  const server = buildServer(ip, clientName);
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

Deno.serve(app.fetch);
