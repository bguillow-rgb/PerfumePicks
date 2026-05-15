/**
 * claude-proxy — Edge Function that proxies Claude API calls.
 *
 * The Anthropic API key stays server-side. The client sends a structured
 * request (prompt type + context), and this function:
 *   1. Authenticates the caller via JWT
 *   2. Runs 5 cost guard checks (kill switch, total daily, per-user, per-IP, account-age)
 *   3. Calls Claude with the appropriate model
 *   4. Records usage in ai_usage
 *   5. Returns the response or a fallback string
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Model routing per the plan.
const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
} as const;

type PromptType = "why_this" | "bottle_scan" | "morning_pick";

interface RequestBody {
  type: PromptType;
  fragrance_context?: Record<string, unknown>;
  taste_profile?: Record<string, unknown>;
  image_base64?: string; // for bottle scan
  wear_history?: Record<string, unknown>[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── 1. Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResp(401, "Missing authorization");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return errorResp(401, "Invalid token");

    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);

    // ── 2. Cost guards ──

    // Guard 1: Kill switch
    const { data: killRow } = await admin
      .from("app_settings").select("value").eq("key", "ai_kill_switch").single();
    if (killRow?.value === "1") {
      return fallbackResp("AI features are temporarily paused.");
    }

    // Guard 2: Total daily budget
    const { data: totalRow } = await admin
      .from("app_settings").select("value").eq("key", "ai_daily_budget_usd_cents").single();
    const totalBudget = parseInt(totalRow?.value ?? "5000", 10);
    const { data: todayTotal } = await admin.rpc("sum_ai_cost_today");
    if ((todayTotal ?? 0) >= totalBudget) {
      return fallbackResp("Daily AI budget reached. Try again tomorrow.");
    }

    // Guard 3: Per-user daily budget
    const { data: perUserRow } = await admin
      .from("app_settings").select("value").eq("key", "ai_per_user_daily_cents").single();
    let perUserBudget = parseInt(perUserRow?.value ?? "100", 10);

    // Guard 4: Account-age throttle — <24h accounts get 10% of normal
    const accountAge = Date.now() - new Date(user.created_at).getTime();
    if (accountAge < 24 * 60 * 60 * 1000) {
      const { data: multRow } = await admin
        .from("app_settings").select("value").eq("key", "ai_new_account_multiplier").single();
      const mult = parseFloat(multRow?.value ?? "0.1");
      perUserBudget = Math.max(1, Math.round(perUserBudget * mult));
    }

    const { data: userUsage } = await admin
      .from("ai_usage").select("cost_usd_cents").eq("user_id", userId).eq("day", today).maybeSingle();
    if ((userUsage?.cost_usd_cents ?? 0) >= perUserBudget) {
      return fallbackResp("You've reached your daily AI limit.");
    }

    // Guard 5: Per-IP daily request cap
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = await hashString(clientIp);
    const { data: ipCapRow } = await admin
      .from("app_settings").select("value").eq("key", "ai_per_ip_daily_requests").single();
    const ipCap = parseInt(ipCapRow?.value ?? "200", 10);
    const { data: ipUsage } = await admin
      .from("ai_ip_rate_limits").select("request_count").eq("ip_hash", ipHash).eq("day", today).maybeSingle();
    if ((ipUsage?.request_count ?? 0) >= ipCap) {
      return fallbackResp("Too many requests from this network.");
    }

    // ── 3. Parse request + build prompt ──
    const body: RequestBody = await req.json();
    const { type } = body;

    if (!ANTHROPIC_API_KEY) {
      return fallbackResp("AI not configured yet.");
    }

    const model = type === "bottle_scan" ? MODELS.sonnet : MODELS.haiku;
    const { systemPrompt, userMessage, maxTokens } = buildPrompt(body);

    // ── 4. Call Claude ──
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("[claude-proxy] API error:", errText);
      return fallbackResp("AI temporarily unavailable.");
    }

    const result = await claudeResp.json();
    const text = result.content?.[0]?.text ?? "";
    const inputTokens = result.usage?.input_tokens ?? 0;
    const outputTokens = result.usage?.output_tokens ?? 0;

    // Rough cost estimate (Haiku: ~$0.25/MTok in, $1.25/MTok out; Sonnet: ~$3/MTok in, $15/MTok out)
    const costCents = type === "bottle_scan"
      ? Math.ceil((inputTokens * 0.3 + outputTokens * 1.5) / 1000)
      : Math.ceil((inputTokens * 0.025 + outputTokens * 0.125) / 1000);

    // ── 5. Record usage ──
    await admin.from("ai_usage").upsert({
      user_id: userId,
      day: today,
      tokens_in: inputTokens,
      tokens_out: outputTokens,
      cost_usd_cents: costCents,
      request_count: 1,
    }, {
      onConflict: "user_id,day",
    });
    // Increment instead of overwrite for existing rows
    await admin.rpc("increment_ai_usage", {
      p_user_id: userId,
      p_day: today,
      p_tokens_in: inputTokens,
      p_tokens_out: outputTokens,
      p_cost_cents: costCents,
    }).then(() => {}, () => {});

    // Record IP usage
    await admin.from("ai_ip_rate_limits").upsert({
      ip_hash: ipHash,
      day: today,
      request_count: 1,
    }, { onConflict: "ip_hash,day" });

    return new Response(JSON.stringify({ text, model, tokens: { input: inputTokens, output: outputTokens } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[claude-proxy] error:", err);
    return fallbackResp("Something went wrong.");
  }
});

// ── Helpers ──

function buildPrompt(body: RequestBody): { systemPrompt: string; userMessage: string; maxTokens: number } {
  switch (body.type) {
    case "why_this":
      return {
        systemPrompt: `You are a fragrance expert for the Perfume Picks app. Given a user's taste profile and a candidate fragrance, explain in 1-2 concise sentences why this fragrance was recommended. Be specific about notes, accords, or style matches. Sound knowledgeable but warm, like a trusted fragrance consultant.`,
        userMessage: `Taste profile: ${JSON.stringify(body.taste_profile ?? {})}\n\nRecommended fragrance: ${JSON.stringify(body.fragrance_context ?? {})}\n\nExplain why this fragrance matches this user's taste in 1-2 sentences.`,
        maxTokens: 150,
      };
    case "morning_pick":
      return {
        systemPrompt: `You are a fragrance stylist for the Perfume Picks app. Given a user's wardrobe, taste profile, recent wear history, and today's context (weather, day of week), suggest which fragrance to wear today and why in 2-3 sentences. Be specific and practical.`,
        userMessage: `Taste profile: ${JSON.stringify(body.taste_profile ?? {})}\nRecent wears: ${JSON.stringify(body.wear_history ?? [])}\nFragrance options: ${JSON.stringify(body.fragrance_context ?? {})}\n\nWhich fragrance should they wear today and why?`,
        maxTokens: 200,
      };
    case "bottle_scan":
      return {
        systemPrompt: `You are a fragrance identification expert. Given a photo of a perfume bottle, identify the fragrance name and brand. Return JSON: {"brand": "...", "name": "...", "confidence": 0.0-1.0}. If you can't identify it with >0.5 confidence, return {"brand": null, "name": null, "confidence": 0.0}.`,
        userMessage: body.image_base64
          ? [
              { type: "text", text: "Identify this perfume bottle:" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.image_base64 } },
            ] as any
          : "No image provided.",
        maxTokens: 100,
      };
    default:
      return {
        systemPrompt: "You are a helpful fragrance assistant.",
        userMessage: JSON.stringify(body),
        maxTokens: 200,
      };
  }
}

async function hashString(str: string): Promise<string> {
  const encoded = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function errorResp(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fallbackResp(fallbackMessage: string): Response {
  return new Response(JSON.stringify({ text: null, fallback: fallbackMessage }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
