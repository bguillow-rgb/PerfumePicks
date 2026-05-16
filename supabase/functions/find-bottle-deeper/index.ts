// @ts-nocheck — runs in Supabase Edge Functions runtime (Deno).
// supabase/functions/find-bottle-deeper/index.ts
//
// "Find this fragrance" — deeper search after a no-match from /identify-bottle.
// Mirrors Pour Picks' find-bottle-deeper architecture:
//
//   1. Fuzzy catalog match with relaxed thresholds (we already failed the
//      strict ilike pass in identifyService, so retry with looser rules).
//   2. If catalog still doesn't yield a candidate, ask Claude to generate
//      plausible fragrance metadata from the AI's label read alone.
//      Returned with source: 'generated' so the client can label it
//      honestly and queue it to fragrance_submissions for moderation.
//
// Auth + rate-limit + quota all mirror /identify-bottle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOTAL_SCAN_LIMIT = 10;
const RATE_LIMIT_HOURLY = 30;
const RATE_LIMIT_DAILY = 100;

const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const GENERATE_PROMPT = `You are a perfume/fragrance identification expert. The user photographed a fragrance bottle, but our catalog has no exact match for what our vision system read from the label. Use the label read to assemble the most plausible fragrance metadata you can.

LABEL READ (from a previous Claude Vision pass):
- Brand: {{BRAND}}
- Name: {{NAME}}
- Concentration: {{CONCENTRATION}}
- Earlier confidence: {{CONFIDENCE}}
- Earlier reasoning: {{REASONING}}

If you recognize this as a real fragrance (even one not yet in our catalog), return its known metadata. If you don't recognize it but the naming is consistent with common fragrance conventions, infer reasonable values. Do NOT invent notes or accords — only include what you're confident about from your knowledge.

If the label read is too thin to identify anything (e.g., "some bottle with gold liquid"), respond with confidence ≤ 0.2 and explain what's missing.

Respond ONLY with valid JSON in this exact format:
{
  "brand": "the brand / perfume house name, or null",
  "name": "the fragrance name, or null",
  "concentration": "EDP, EDT, Extrait, Parfum, Cologne, or null",
  "fragrance_family": "floral, oriental, woody, fresh, citrus, gourmand, chypre, fougere, or null",
  "gender": "unisex, masculine, feminine, or null",
  "confidence": 0.7,
  "reasoning": "Brief explanation: did you recognize the fragrance, or are these inferred values?"
}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  brand?: string;
  name?: string;
  concentration?: string | null;
  confidence?: number;
  reasoning?: string;
  device_id?: string;
}

interface CandidateFragrance {
  brand: string;
  name: string;
  concentration: string | null;
  fragrance_family: string | null;
  gender: string | null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[.,!?;:()\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse(
        { error: "Identification temporarily unavailable" },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const body = (await req.json()) as RequestBody;
    const brand = (body.brand ?? "").trim();
    const name = (body.name ?? "").trim();
    const concentration = body.concentration
      ? body.concentration.trim()
      : null;
    const seedConfidence =
      typeof body.confidence === "number" ? body.confidence : 0;
    const reasoning = (body.reasoning ?? "").trim();
    const deviceId =
      typeof body.device_id === "string" ? body.device_id.trim() : "";

    if (!brand && !name) {
      return jsonResponse(
        { error: "A brand or fragrance name is required to search deeper." },
        400
      );
    }
    if (!deviceId) {
      return jsonResponse({ error: "Missing device_id" }, 400);
    }

    // ── Quota (shared with /identify-bottle) ──
    const { count: deviceScans } = await supabase
      .from("scan_images")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);
    if ((deviceScans ?? 0) >= TOTAL_SCAN_LIMIT) {
      return jsonResponse(
        {
          error:
            "You've hit the free-scan limit. Upgrade to Pro for unlimited scans.",
        },
        429
      );
    }

    // ── Rate limit ──
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();
    const [{ count: hourly }, { count: daily }] = await Promise.all([
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("scan_method", ["concierge", "describe", "find_deeper"])
        .gte("created_at", hourAgo),
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("scan_method", ["concierge", "describe", "find_deeper"])
        .gte("created_at", dayAgo),
    ]);
    if (
      (hourly ?? 0) >= RATE_LIMIT_HOURLY ||
      (daily ?? 0) >= RATE_LIMIT_DAILY
    ) {
      return jsonResponse(
        {
          error:
            "Too many scans in a short time — please wait a bit before trying again.",
        },
        429
      );
    }

    // ── 1. Loose catalog match ──
    const brandNorm = normalize(brand);
    const nameNorm = normalize(name);
    let catalogCandidate: CandidateFragrance | null = null;

    if (brandNorm) {
      const brandTokens = brandNorm
        .split(" ")
        .filter((t) => t.length >= 3);
      if (brandTokens.length > 0) {
        const orClause = brandTokens
          .map((t) => `name.ilike.%${t}%`)
          .join(",");
        // Search fragrances table; join brand via brand_id
        const { data: rows } = await supabase
          .from("fragrances")
          .select(
            "name, concentration, fragrance_family, gender, brands!inner(name)"
          )
          .or(
            brandTokens
              .map((t) => `brands.name.ilike.%${t}%`)
              .join(","),
            { referencedTable: "brands" }
          )
          .limit(40);

        if (rows && rows.length > 0) {
          const scored = rows.map((r: any) => {
            const rBrand = normalize(r.brands?.name);
            const rName = normalize(r.name);
            const brandOverlap =
              brandNorm && rBrand
                ? rBrand.includes(brandNorm) || brandNorm.includes(rBrand)
                  ? 1
                  : 0
                : 0;
            const nameOverlap =
              nameNorm && rName
                ? rName.includes(nameNorm) || nameNorm.includes(rName)
                  ? 1
                  : 0
                : 0;
            return { row: r, score: brandOverlap * 2 + nameOverlap };
          });
          scored.sort((a: any, b: any) => b.score - a.score);
          if (scored[0]?.score >= 1) {
            const r = scored[0].row;
            catalogCandidate = {
              brand: r.brands?.name ?? brand,
              name: r.name ?? "",
              concentration: r.concentration ?? null,
              fragrance_family: r.fragrance_family ?? null,
              gender: r.gender ?? null,
            };
          }
        }
      }
    }

    // Log this find_deeper call
    await supabase.from("scan_images").insert({
      user_id: user.id,
      device_id: deviceId,
      scan_method: "find_deeper",
    });

    if (catalogCandidate) {
      return jsonResponse(
        {
          candidate: catalogCandidate,
          source: "catalog",
          confidence: Math.max(seedConfidence, 0.6),
          reasoning:
            "Loose match against catalog on brand + fragrance name.",
        },
        200
      );
    }

    // ── 2. Generate a candidate from label read alone ──
    const prompt = GENERATE_PROMPT.replace("{{BRAND}}", brand || "(unknown)")
      .replace("{{NAME}}", name || "(unknown)")
      .replace("{{CONCENTRATION}}", concentration ?? "(none)")
      .replace("{{CONFIDENCE}}", seedConfidence.toFixed(2))
      .replace("{{REASONING}}", reasoning || "(none)");

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 500,
          messages: [
            { role: "user", content: [{ type: "text", text: prompt }] },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error(
        "Anthropic API error:",
        anthropicResponse.status,
        errorText
      );
      return jsonResponse(
        { error: "Deeper search temporarily unavailable" },
        502
      );
    }

    const apiResult = await anthropicResponse.json();
    const text = apiResult?.content?.[0]?.text;
    if (typeof text !== "string") {
      return jsonResponse({ error: "Unexpected response shape" }, 502);
    }

    let parsed: any;
    try {
      const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Could not parse Claude response:", text);
      return jsonResponse(
        { error: "Could not parse the deeper search result" },
        502
      );
    }

    const generated: CandidateFragrance = {
      brand:
        typeof parsed.brand === "string" ? parsed.brand : brand,
      name:
        typeof parsed.name === "string" ? parsed.name : name,
      concentration:
        typeof parsed.concentration === "string"
          ? parsed.concentration
          : null,
      fragrance_family:
        typeof parsed.fragrance_family === "string"
          ? parsed.fragrance_family
          : null,
      gender:
        typeof parsed.gender === "string" ? parsed.gender : null,
    };

    return jsonResponse(
      {
        candidate: generated,
        source: "generated",
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        reasoning:
          typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      },
      200
    );
  } catch (err) {
    console.error("find-bottle-deeper error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
