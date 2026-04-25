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

const IDENTIFY_PROMPT_BASE = `You are a cigar identification expert. You may receive ONE OR MORE photos of the same cigar, taken from different rotation angles while the user rotates it. Use ALL of them together.

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

Return a ranked list of up to 3 candidate identifications — your strongest guess first, then plausible alternatives. If you are highly confident, one candidate is fine; you are not required to invent alternatives when none exist.

Respond ONLY with valid JSON in this exact format:
{
  "candidates": [
    {
      "brand": "the brand name",
      "line": "the specific cigar line/name, WITHOUT vitola",
      "vitola": "the size if and ONLY if clearly determinable, else null",
      "confidence": 0.91,
      "reasoning": "Brief explanation of how you identified it across the frames"
    }
  ],
  "overall_reasoning": "One-sentence cross-frame summary. Keep it short."
}

If you cannot identify the cigar at all, respond with:
{
  "candidates": [],
  "overall_reasoning": "Explanation of why identification failed"
}`;

const ENHANCE_PREFIX = `This is a retry of a previously-low-confidence capture of the same cigar. Be more aggressive reading subtle, low-contrast, or partially-obscured text; favor careful OCR over visual similarity; only propose a candidate if you can actually read band text supporting it.

`;

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
  // Client sets this on the "Enhance and retry" path so the prompt leans
  // harder on OCR and suppresses visual-similarity guesses.
  enhance?: boolean;
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

    // --- Comped / Pro bypass check ---
    // is_current_user_comped() uses auth.uid() which isn't populated when
    // we call it from the service-role client here — instead we look up
    // the user's email directly in comped_users (trigger lowercases all
    // emails at write time, so the equality check is safe). The table's
    // RLS doesn't apply to the service-role client.
    //
    // TODO: when RevenueCat entitlement webhook lands, add a second
    // bypass path here that reads a `pro_entitlements` table, so paid
    // Pro subscribers also skip the free-tier quota on the server side.
    let isComped = false;
    if (user.email) {
      const { data: compedRow } = await supabase
        .from("comped_users")
        .select("email")
        .eq("email", user.email.toLowerCase())
        .maybeSingle();
      isComped = !!compedRow;
    }

    // --- Free-scan quota enforcement (device-scoped, not user-scoped) ---
    // Skipped entirely for comped users. The rate-limit check below still
    // runs for them so an abusive token can't DoS the Anthropic bill.
    const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
    if (!deviceId) {
      return jsonResponse({ error: "Missing device_id" }, 400);
    }

    if (!isComped) {
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
    }

    // --- Per-user rate limit (abuse prevention) ---
    // Applied to everyone including comped/Pro users. A compromised token
    // should never blow up cost regardless of entitlement.
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

    // Enhance hint flips the prompt to an OCR-biased variant without changing
    // anything else about the request shape. Back-compat with older clients
    // is automatic — they just don't send the flag.
    const promptText = body.enhance
      ? ENHANCE_PREFIX + IDENTIFY_PROMPT_BASE
      : IDENTIFY_PROMPT_BASE;

    const requestStartedAt = Date.now();
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
          // Sonnet 4.6 — materially stronger at fine-grained OCR and
          // brand-logo recognition than the prior 4.0-20250514 generation.
          model: "claude-sonnet-4-6",
          // Ranked top-3 + per-candidate reasoning needs more headroom than
          // the single-candidate schema required. 1500 is generous; a
          // typical response lands well under.
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                { type: "text", text: promptText },
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

    // Cheap structured log so PostHog/Supabase can alert on cost outliers
    // later. One line per successful scan, zero schema changes. `usage`
    // field is present on every Messages-API response.
    const usage = (apiResult as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage ?? {};
    console.log(
      "identify-cigar usage:",
      JSON.stringify({
        input_tokens: usage.input_tokens ?? null,
        output_tokens: usage.output_tokens ?? null,
        image_count: images.length,
        latency_ms: Date.now() - requestStartedAt,
        enhance: body.enhance === true,
      }),
    );

    return jsonResponse(apiResult, 200);
  } catch (err: any) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
