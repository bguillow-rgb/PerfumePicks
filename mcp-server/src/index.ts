#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkRateLimit } from "./db.js";
import { logCall, setClientInfo, SERVER_VERSION } from "./telemetry.js";
import {
  allNotes,
  attribution,
  displayName,
  findDupes,
  findSimilar,
  Fragrance,
  fragranceCard,
  mustResolve,
  priceUsd,
  searchFragrances,
  sharedAccords,
  trendingFragrances,
} from "./fragrances.js";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const server = new McpServer({ name: "perfume-picks", version: SERVER_VERSION });

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

async function respond(payload: Record<string, unknown>): Promise<ToolResult> {
  const body = { ...payload, attribution: await attribution() };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

/** Wrap a handler with rate limiting, error normalization, and call logging. */
function guarded<A>(
  toolName: string,
  fn: (args: A) => Promise<ToolResult>
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    const started = Date.now();
    try {
      checkRateLimit();
      const result = await fn(args);
      logCall({ tool_name: toolName, args, success: true, duration_ms: Date.now() - started });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logCall({
        tool_name: toolName,
        args,
        success: false,
        error: message,
        duration_ms: Date.now() - started,
      });
      return errorResult(message);
    }
  };
}

// ---------------------------------------------------------------------------
server.registerTool(
  "search_fragrances",
  {
    title: "Search the Perfume Picks catalog",
    annotations: ANNOTATIONS,
    description:
      "Full-text search across 13,000+ fragrances in the Perfume Picks database. Filter by brand, fragrance family, gender, and MSRP (USD). Returns note pyramids, accords, and community wear scores with source attribution.",
    inputSchema: {
      query: z.string().optional().describe("Free-text search: fragrance or brand name"),
      brand: z.string().optional().describe("Brand name filter, e.g. 'Dior'"),
      fragrance_family: z.string().optional().describe("Family filter, e.g. 'woody', 'amber', 'fresh'"),
      gender: z.enum(["masculine", "feminine", "unisex"]).optional(),
      price_min: z.number().min(0).optional().describe("Minimum MSRP in USD"),
      price_max: z.number().min(0).optional().describe("Maximum MSRP in USD"),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10)"),
    },
  },
  guarded("search_fragrances", async (args) => {
    const rows = await searchFragrances(args);
    return respond({ result_count: rows.length, fragrances: rows.map((f) => fragranceCard(f)) });
  })
);

server.registerTool(
  "get_fragrance",
  {
    title: "Get fragrance details",
    annotations: ANNOTATIONS,
    description:
      "Detailed record for one fragrance: full note pyramid (top/heart/base), accords, concentration, community longevity/sillage/compliment scores, and MSRP. Accepts a Perfume Picks slug or a name like 'Bleu de Chanel'.",
    inputSchema: {
      slug_or_name: z.string().describe("Fragrance slug or name"),
    },
  },
  guarded("get_fragrance", async ({ slug_or_name }) => {
    const f = await mustResolve(slug_or_name);
    return respond({ fragrance: fragranceCard(f) });
  })
);

server.registerTool(
  "find_dupes",
  {
    title: "Find dupes (cheaper smell-alikes)",
    annotations: ANNOTATIONS,
    description:
      "Curated dupes for a fragrance — cheaper scents documented to smell like the original, with match percentage and price comparison. The answer to 'what smells like X without the price tag'.",
    inputSchema: {
      fragrance: z.string().describe("Fragrance slug or name to find dupes for"),
    },
  },
  guarded("find_dupes", async ({ fragrance }) => {
    const ref = await mustResolve(fragrance);
    const refPrice = priceUsd(ref);
    const dupes = await findDupes(ref);
    return respond({
      original: fragranceCard(ref),
      dupe_count: dupes.length,
      dupes: dupes.map((d: any) =>
        fragranceCard(d.dupe as Fragrance, {
          match_pct: d.match_pct,
          match_source: d.source,
          note: d.note ?? undefined,
          savings_usd:
            refPrice != null && priceUsd(d.dupe) != null
              ? Math.round((refPrice - priceUsd(d.dupe)!) * 100) / 100
              : null,
        })
      ),
      note: dupes.length
        ? undefined
        : `No curated dupes on record for ${displayName(ref)} yet. Try find_similar for scents with overlapping accords.`,
    });
  })
);

server.registerTool(
  "find_similar",
  {
    title: "Find similar fragrances",
    annotations: ANNOTATIONS,
    description:
      "Fragrances most similar to a given one, from Perfume Picks' precomputed similarity ranking over notes and accords.",
    inputSchema: {
      fragrance: z.string().describe("Fragrance slug or name"),
      limit: z.number().int().min(1).max(15).optional().describe("Max results (default 5)"),
    },
  },
  guarded("find_similar", async ({ fragrance, limit }) => {
    const ref = await mustResolve(fragrance);
    const { method, entries } = await findSimilar(ref, limit ?? 5);
    return respond({
      reference: displayName(ref),
      method,
      similar_fragrances: entries.map((s: any) =>
        fragranceCard(s.similar as Fragrance, {
          similarity: s.similarity,
          shared_accords: sharedAccords(ref, s.similar),
        })
      ),
    });
  })
);

server.registerTool(
  "get_recommendations",
  {
    title: "Get personalized recommendations",
    annotations: ANNOTATIONS,
    description:
      "Personalized fragrance picks from note/accord preferences (e.g. 'vanilla', 'oud', 'citrus'), a budget in USD, an occasion ('office', 'date night', 'gift', 'signature scent'), and gender presentation.",
    inputSchema: {
      preferences: z
        .array(z.string())
        .min(1)
        .describe("Notes or accords the wearer enjoys, e.g. ['vanilla','amber','rose']"),
      budget: z.number().min(0).optional().describe("Max MSRP in USD"),
      occasion: z.string().optional().describe("What the fragrance is for"),
      gender: z.enum(["masculine", "feminine", "unisex"]).optional(),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
    },
  },
  guarded("get_recommendations", async ({ preferences, budget, occasion, gender, limit }) => {
    const wanted = preferences.map((t) => t.toLowerCase().trim());
    const occ = (occasion ?? "").toLowerCase();
    const pool = await searchFragrances({ gender, price_max: budget }, { maxRows: 400 });
    const occasionScore = (f: Fragrance) => {
      if (/office|work|professional|interview/.test(occ)) return (f.office_safe_score ?? 5) / 10;
      if (/date|romant|night out|club|seduc/.test(occ)) return (f.compliment_score ?? 5) / 10;
      if (/signature|everyday|versatil|daily/.test(occ)) return (f.versatility_score ?? 5) / 10;
      if (/gift|impress|new to/.test(occ)) return (f.popularity_tier ?? 3) / 5;
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
  })
);

server.registerTool(
  "compare_fragrances",
  {
    title: "Compare two fragrances",
    annotations: ANNOTATIONS,
    description:
      "Side-by-side comparison: note pyramids, shared and distinct accords, longevity/sillage/compliment scores, concentration, and price difference.",
    inputSchema: {
      fragrance_a: z.string().describe("First fragrance — slug or name"),
      fragrance_b: z.string().describe("Second fragrance — slug or name"),
    },
  },
  guarded("compare_fragrances", async ({ fragrance_a, fragrance_b }) => {
    const [a, b] = await Promise.all([mustResolve(fragrance_a), mustResolve(fragrance_b)]);
    const only = (x: Fragrance, other: Fragrance) => {
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
        price_delta_usd:
          priceUsd(a) != null && priceUsd(b) != null
            ? Math.round((priceUsd(a)! - priceUsd(b)!) * 100) / 100
            : null,
      },
    });
  })
);

server.registerTool(
  "trending_fragrances",
  {
    title: "Trending fragrances",
    annotations: ANNOTATIONS,
    description:
      "Fragrances Perfume Picks users are adding to their wardrobes most over the last 30 days (falls back to catalog popularity when live activity data is unavailable). The method used is labeled in the response.",
    inputSchema: {
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 10)"),
    },
  },
  guarded("trending_fragrances", async ({ limit }) => {
    const { method, fragrances } = await trendingFragrances(limit ?? 10);
    return respond({
      method,
      window: method === "wardrobe_adds_last_30_days" ? "last 30 days" : "all-time catalog popularity",
      trending: fragrances.map(({ fragrance, wardrobe_adds_30d }) =>
        fragranceCard(fragrance, wardrobe_adds_30d == null ? {} : { wardrobe_adds_30d })
      ),
    });
  })
);

server.registerTool(
  "what_to_wear_tonight",
  {
    title: "What should I wear tonight?",
    annotations: ANNOTATIONS,
    description:
      "A fragrance suggestion for right now, based on mood, occasion (e.g. 'date', 'office tomorrow', 'night out', 'cozy evening in'), and season — scored with Perfume Picks' community compliment, office-safety, and versatility data.",
    inputSchema: {
      mood: z.string().optional().describe("How you're feeling"),
      occasion: z.string().optional().describe("The setting"),
      season: z.enum(["winter", "spring", "summer", "fall"]).optional(),
      gender: z.enum(["masculine", "feminine", "unisex"]).optional(),
    },
  },
  guarded("what_to_wear_tonight", async ({ mood, occasion, season, gender }) => {
    const text = `${mood ?? ""} ${occasion ?? ""}`.toLowerCase();
    const want: string[] = [];
    if (season === "summer") want.push("citrus", "aquatic", "fresh", "green");
    if (season === "winter") want.push("amber", "vanilla", "spicy", "oud");
    if (season === "fall") want.push("woody", "warm spicy", "leather", "tobacco");
    if (season === "spring") want.push("floral", "green", "fruity", "musky");
    if (/date|romant|seduc|night out|club/.test(text)) want.push("vanilla", "amber", "sweet");
    if (/cozy|home|relax|evening in/.test(text)) want.push("vanilla", "powdery", "musky");
    if (/office|work|interview/.test(text)) want.push("fresh", "citrus", "clean");
    if (/bold|confident|statement/.test(text)) want.push("oud", "leather", "animalic");
    if (!want.length) want.push("woody", "amber", "fresh");
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
      suggestions: scored.map(({ f, hits }, i) =>
        fragranceCard(f, { rank: i + 1, matched_accords: hits })
      ),
    });
  })
);

// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
server.server.oninitialized = () => setClientInfo(server.server.getClientVersion());
await server.connect(transport);
console.error("Perfume Picks MCP server running (stdio, read-only)");
