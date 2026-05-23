// supabase/functions/revenuecat-webhook/index.ts
//
// Handles RevenueCat server-side webhook events and syncs Pro status to
// profiles.is_pro + profiles.pro_expires_at.
//
// Webhook setup (RevenueCat dashboard):
//   Dashboard → Project → Integrations → Webhooks → Add endpoint
//   URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
//   Auth header: Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// Events we care about:
//   INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE → is_pro = true
//   CANCELLATION, EXPIRATION, BILLING_ISSUE   → check expiry
//   SUBSCRIBER_ALIAS                          → ignore

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Set this in Supabase Edge Function secrets to match the RC webhook auth header value.
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

const PRO_ENTITLEMENT = "pro";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify webhook secret (RevenueCat sends it as the Authorization header value).
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event) {
    return new Response(JSON.stringify({ error: "Missing event" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = event.type as string | undefined;
  // app_user_id is the Supabase user UUID we passed to RC.identifyUser(userId).
  const appUserId = event.app_user_id as string | undefined;

  if (!appUserId) {
    // Anonymous or unidentified user — nothing to sync.
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Check if the pro entitlement is currently active in the event payload.
  const entitlements = event.entitlement_ids as string[] | undefined ?? [];
  const proActive = entitlements.includes(PRO_ENTITLEMENT);

  // Derive expiry from the subscription end date if present.
  const expirationAtMs = event.expiration_at_ms as number | undefined;
  const proExpiresAt = expirationAtMs
    ? new Date(expirationAtMs).toISOString()
    : null;

  let isPro = false;
  let expires: string | null = null;

  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      isPro = true;
      expires = proExpiresAt;
      break;

    case "CANCELLATION":
      // Cancelled but may still have time remaining.
      isPro = proActive;
      expires = proExpiresAt;
      break;

    case "EXPIRATION":
    case "BILLING_ISSUE":
      isPro = false;
      expires = proExpiresAt;
      break;

    default:
      // SUBSCRIBER_ALIAS, TEST, etc. — ignore.
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }

  const { error } = await admin
    .from("profiles")
    .upsert(
      { id: appUserId, is_pro: isPro, pro_expires_at: expires, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (error) {
    console.error("[revenuecat-webhook] upsert failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, is_pro: isPro }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
