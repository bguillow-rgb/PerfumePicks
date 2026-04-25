// supabase/functions/identify-cigar/index.ts
// Edge Function that proxies cigar identification requests to Claude Vision API.
// Keeps the Anthropic API key server-side — never shipped in the app binary.
//
// Also enforces:
//   - Free-scan quota per durable device_id (so re-signin-as-Guest can't reset it)
//   - Per-user hourly + daily rate limits to prevent cost blowout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Must mirror the client constants in useScanCount.ts.
const TOTAL_SCAN_LIMIT = 10;
const RATE_LIMIT_HOURLY = 30;
const RATE_LIMIT_DAILY = 100;

const IDENTIFY_PROMPT = `You are a cigar identification expert. You may receive ONE OR MORE photos of the same cigar, taken from different rotation angles while the user rotates it. Use ALL of them together.

STRATEGY when multiple images are given:
- Read every fragment of text visible on the band across all frames.
- Cigar bands wrap around the cigar, so words are often split between frames (e.g. frame 1 shows "PADRÓN", frame 2 shows "1964", frame 3 shows "ANNIVERSARY EXCLUSIVO"). Reconstruct the full band text.
- Cross-reference logos, typography, and colors across frames for consistency.
- A confident ID from multiple angles beats a single-frame guess.

FOCUS on the band text, logo, typography, and colors. The band is the primary signal for brand and line.

IMPORTANT distinctions:
- "brand" = the maker (e.g., "Oliva", "Padron", "Arturo Fuente")
- "line" = the specific product line (e.g., "Serie V Melanio", "1964 Anniversary", "Hemingway")
- "vitola" = the size/shape (e.g., "Robusto", "Toro", "Torpedo"). NEVER put a vitola in the "line" field.

You usually CANNOT determine vitola from a close-up band photo. Only fill in vitola if you see a clear size indicator on the band or packaging. Otherwise, set vitola to null.

Respond ONLY with valid JSON in this exact format:
{
  "brand": "the brand name",
  "line": "the specific cigar line/name, WITHOUT vitola",
  "vitola": "the size if and ONLY if clearly determinable, else null",
  "confidence": 0.85,
  "reasoning": "Brief explanation of how you identified it across the frames"
}

If you cannot identify the cigar, respond with:
{
  "brand": null,
  "line": null,
  "vitola": null,
  "confidence": 0,
  "reasoning": "Explanation of why identification failed"
}`;

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
  imageBase64?: string;
  mediaType?: string;
  device_id?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    let images: ImagePayload[] = [];
    if (Array.isArray(body.images) && body.images.length > 0) {
      images = body.images;
    } else if (body.imageBase64) {
      images = [{ base64: body.imageBase64, mediaType: body.mediaType }];
    }

    if (images.length === 0) {
      return jsonResponse({ error: "At least one image is required" }, 400);
    }
    if (images.length > 8) {
      return jsonResponse({ error: "Too many frames (max 8)" }, 400);
    }

    // --- Free-scan quota enforcement (device-scoped, not user-scoped) ---
    const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
    if (!deviceId) {
      return jsonResponse({ error: "Missing device_id" }, 400);
    }

    const { count: deviceScans } = await supabase
      .from("scan_images")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId);

    if ((deviceScans ?? 0) >= TOTAL_SCAN_LIMIT) {
      return jsonResponse(
        { error: "You've hit the free-scan limit. Upgrade to Pro for unlimited scans." },
        429
      );
    }

    // --- Per-user rate limit (abuse prevention) ---
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [{ count: hourly }, { count: daily }] = await Promise.all([
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("scan_method", "concierge")
        .gte("created_at", hourAgo),
      supabase
        .from("scan_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("scan_method", "concierge")
        .gte("created_at", dayAgo),
    ]);

    if ((hourly ?? 0) >= RATE_LIMIT_HOURLY || (daily ?? 0) >= RATE_LIMIT_DAILY) {
      return jsonResponse(
        { error: "Too many scans in a short time — please wait a bit before trying again." },
        429
      );
    }

    const imageContent = images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType || "image/jpeg",
        data: img.base64,
      },
    }));

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
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                { type: "text", text: IDENTIFY_PROMPT },
              ],
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errorText);
      const clientMessage =
        anthropicResponse.status === 429
          ? "Scanner is busy, please try again in a moment"
          : "Cigar identification temporarily unavailable";
      return jsonResponse({ error: clientMessage }, 502);
    }

    const apiResult = await anthropicResponse.json();
    return jsonResponse(apiResult, 200);
  } catch (err: any) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
