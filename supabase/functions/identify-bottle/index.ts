// @ts-nocheck — runs in Supabase Edge Functions runtime (Deno).
// supabase/functions/identify-bottle/index.ts
//
// Dedicated fragrance-bottle identification Edge Function.
// Mirrors Pour Picks' identify-bottle architecture:
//   - Two modes: 'scan' (image) and 'describe' (text-only fallback)
//   - Fragrance-tuned prompts (brand/name/concentration instead of distillery/expression/variant)
//   - Multi-frame support (up to 8 images)
//   - Label-reader fallback when primary prompt returns low confidence
//   - Device-scoped free-scan quota + per-user rate limits
//   - Pro/comped user bypass
//
// Keeps the Anthropic API key server-side — never shipped in the app binary.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Must mirror the client constants in src/hooks/useScanCount.ts.
const TOTAL_SCAN_LIMIT = 10;
const RATE_LIMIT_HOURLY = 30;
const RATE_LIMIT_DAILY = 100;

const ANTHROPIC_MODEL = "claude-sonnet-4-6";

// ── Prompts ──

const IDENTIFY_PROMPT = `You are a perfume/fragrance bottle identification expert. You may receive ONE OR MORE photos of the same bottle, taken from different angles (front label, back label, cap, box). Use ALL of them together.

STRATEGY when multiple images are given:
- Read every fragment of text visible across all frames (front, back, cap, box).
- Cross-reference the brand wordmark, the fragrance name, concentration type (EDP, EDT, Extrait, Cologne), size, and any limited-edition or flanker markers across frames.
- Multi-angle reading beats a single front-label guess.

FOCUS on the prominent brand wordmark/logo and the fragrance name on the bottle or box.

IMPORTANT distinctions:
- "brand" = the perfume house / designer (e.g., "Chanel", "Tom Ford", "Maison Francis Kurkdjian", "Creed")
- "name" = the specific fragrance (e.g., "Bleu de Chanel", "Lost Cherry", "Baccarat Rouge 540", "Aventus")
- "concentration" = the strength/type if visible (e.g., "Eau de Parfum", "Eau de Toilette", "Extrait de Parfum", "Parfum", "Cologne"). ONLY include if clearly readable on the label.

You usually CAN read the brand and fragrance name confidently from a clear front label. The concentration may or may not be visible — if you cannot see clear text, set "concentration" to null. Do NOT invent or guess.

CONFIDENCE GUIDANCE — tie your "confidence" score to the readability of the photo, not just your semantic certainty about the brand:
  - 0.85-1.0: Label fully visible, sharp focus, even light, brand wordmark and fragrance name clearly readable.
  - 0.6-0.84: Label mostly visible but with some glare, partial occlusion, slight blur, or only one of brand/name confidently legible.
  - 0.4-0.59: Significant glare, very low light, or you're inferring more than reading.
  - 0.2-0.39: You can barely make out anything; you're guessing from bottle shape and color.
  - 0.0-0.19: You have no usable signal.

A clear bottle you've never seen before should still get high confidence — confidence is about what you READ, not whether you know the brand.

Respond ONLY with valid JSON in this exact format:
{
  "brand": "the brand / perfume house name",
  "name": "the fragrance name, WITHOUT concentration suffix",
  "concentration": "the concentration type if clearly readable, else null",
  "confidence": 0.85,
  "reasoning": "Brief explanation of how you identified it across the frames"
}

If you cannot identify the bottle, respond with:
{
  "brand": null,
  "name": null,
  "concentration": null,
  "confidence": 0,
  "reasoning": "Explanation of why identification failed"
}`;

const DESCRIBE_PROMPT = `You are a perfume/fragrance identification expert. The user could not get a usable photo of the bottle, so they have described it in their own words. Use the description to identify the fragrance.

DESCRIPTION:
"""
{{DESCRIPTION}}
"""

The description may include the brand/house, fragrance name, notes they remember (vanilla, oud, rose), bottle shape or color, where they bought it, or comparisons to other fragrances. Read it carefully and infer the most likely match.

IMPORTANT distinctions:
- "brand" = the perfume house / designer (e.g., "Dior", "Tom Ford", "Byredo")
- "name" = the specific fragrance (e.g., "Sauvage", "Tobacco Vanille", "Gypsy Water")
- "concentration" = the type if mentioned (e.g., "EDP", "EDT", "Extrait")

Be honest about confidence. If the description is too vague (e.g., "it smelled like flowers in a pink bottle"), respond with confidence ≤ 0.3 and explain what you'd need to identify it.

Respond ONLY with valid JSON in this exact format:
{
  "brand": "the brand / perfume house name, or null if unidentifiable",
  "name": "the fragrance name, WITHOUT concentration, or null",
  "concentration": "the concentration if mentioned, else null",
  "confidence": 0.85,
  "reasoning": "Brief explanation of how you identified it from the description"
}`;

const LABEL_READER_PROMPT = `You are an OCR-style label reader for perfume and fragrance bottles. You receive ONE OR MORE photos of the same container. Read what is literally printed on the label/bottle/box — DO NOT try to identify what fragrance it is from prior knowledge if the label doesn't say.

YOUR JOB: Return what the label says. Brand name on the bottle, fragrance name on the bottle, and the concentration/type.

CONCENTRATION RULES:
- Set "concentration" based ONLY on what is printed. If the label says "Eau de Parfum" → "Eau de Parfum". If it says "EDT" → "Eau de Toilette".
- Common concentrations: Eau de Parfum (EDP), Eau de Toilette (EDT), Extrait de Parfum, Parfum, Eau de Cologne, Eau Fraîche.
- null when no concentration text is visible on the label.

Respond ONLY with valid JSON:
{
  "brand": "the brand name as printed on the bottle/box, or null",
  "name": "the fragrance name as printed, or null",
  "concentration": "the concentration as printed, or null",
  "confidence": 0.0-1.0,
  "reasoning": "Brief — what you read off the label"
}

CONFIDENCE GUIDANCE — about what you READ, not what you know about the brand:
  - 0.85-1.0: Label fully visible, sharp, every relevant word legible.
  - 0.6-0.84: Label visible with some glare/partial occlusion.
  - 0.4-0.59: Heavy glare or partial label — you're inferring more than reading.
  - <0.4: You can barely make anything out. Reject.

If confidence < 0.4 OR name is empty, the client will treat this as "no identification."`;

// ── Types ──

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ImagePayload {
  base64: string;
  mediaType?: string;
}

interface RequestBody {
  images?: ImagePayload[];
  device_id?: string;
  mode?: "scan" | "describe";
  description?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "Identification temporarily unavailable" }, 503);
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
    const mode = body.mode === "describe" ? "describe" : "scan";

    let images: ImagePayload[] = [];
    let description = "";

    if (mode === "describe") {
      description =
        typeof body.description === "string" ? body.description.trim() : "";
      if (!description) {
        return jsonResponse({ error: "Description is required" }, 400);
      }
      if (description.length > 1000) {
        return jsonResponse(
          { error: "Description too long (max 1000 characters)" },
          400
        );
      }
    } else {
      if (Array.isArray(body.images) && body.images.length > 0) {
        images = body.images;
      }
      if (images.length === 0) {
        return jsonResponse({ error: "At least one image is required" }, 400);
      }
      if (images.length > 8) {
        return jsonResponse({ error: "Too many frames (max 8)" }, 400);
      }
    }

    // ── Free-scan quota (device-scoped) ──
    const deviceId =
      typeof body.device_id === "string" ? body.device_id.trim() : "";
    if (!deviceId) {
      return jsonResponse({ error: "Missing device_id" }, 400);
    }

    // Pro bypass: profiles.is_pro
    let isProBypass = false;
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.is_pro === true) {
      isProBypass = true;
    }

    if (!isProBypass) {
      const { count: deviceScans } = await supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("device_id", deviceId)
        .eq("refunded", false);

      if ((deviceScans ?? 0) >= TOTAL_SCAN_LIMIT) {
        return jsonResponse(
          {
            error:
              "You've hit the free-scan limit. Upgrade to Pro for unlimited scans.",
          },
          429
        );
      }
    }

    // ── Per-user rate limit ──
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [{ count: hourly }, { count: daily }] = await Promise.all([
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("scan_method", ["concierge", "describe"])
        .gte("created_at", hourAgo),
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("scan_method", ["concierge", "describe"])
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

    // ── Build Claude message ──
    const messageContent =
      mode === "describe"
        ? [
            {
              type: "text" as const,
              text: DESCRIBE_PROMPT.replace("{{DESCRIPTION}}", description),
            },
          ]
        : [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType || "image/jpeg",
                data: img.base64,
              },
            })),
            { type: "text" as const, text: IDENTIFY_PROMPT },
          ];

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
          messages: [{ role: "user", content: messageContent }],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errorText);
      const clientMessage =
        anthropicResponse.status === 429
          ? "Scanner is busy, please try again in a moment"
          : "Fragrance identification temporarily unavailable";
      return jsonResponse({ error: clientMessage }, 502);
    }

    const apiResult = await anthropicResponse.json();

    // ── Label-reader fallback ──
    // When the fragrance prompt returns low confidence and we have images,
    // run a second pass with the generic label-reader prompt.
    let labelReader: unknown = null;
    if (mode === "scan") {
      try {
        const fragranceFailed = primaryResultLooksEmpty(apiResult);
        if (fragranceFailed) {
          labelReader = await runLabelReader(images, ANTHROPIC_API_KEY);
        }
      } catch (e) {
        console.error("Label-reader fallback failed:", e);
      }
    }

    if (labelReader) {
      return jsonResponse({ ...apiResult, label_reader: labelReader }, 200);
    }
    return jsonResponse(apiResult, 200);
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ── Helpers ──

function primaryResultLooksEmpty(apiResult: unknown): boolean {
  try {
    const textContent =
      (apiResult as { content?: { type: string; text?: string }[] })?.content?.find(
        (c) => c.type === "text"
      )?.text ?? "{}";
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const brand =
      typeof parsed.brand === "string" ? parsed.brand.trim() : "";
    return confidence < 0.5 || brand.length === 0;
  } catch {
    return true;
  }
}

async function runLabelReader(
  images: ImagePayload[],
  apiKey: string
): Promise<unknown> {
  const content = [
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType || "image/jpeg",
        data: img.base64,
      },
    })),
    { type: "text" as const, text: LABEL_READER_PROMPT },
  ];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Label-reader Anthropic call failed:", res.status, text);
    return null;
  }
  return await res.json();
}
