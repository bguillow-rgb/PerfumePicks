// supabase/functions/redeem-promo/index.ts
// Redeems an influencer promo code and grants the caller N months of free Pro.
//
// Flipping profiles.is_pro / pro_expires_at requires the service role — it's the
// only writer allowed past the prevent_client_pro_writes trigger (see migration
// 202605150900_pro_gate_server_side). Same pattern as revenuecat-webhook and
// delete-account.
//
// Product rules:
//   * Broadcast codes: one code, many redemptions, capped by max_redemptions /
//     expires_at (both optional).
//   * A user may redeem a given code at most once (promo_redemptions PK).
//   * REJECT if the user already has active Pro ("only if not Pro").
//   * Grant: is_pro = true, pro_expires_at = now() + duration_months.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalize user input the same way codes are stored: trim + uppercase, and
// strip internal whitespace so "scent queen" matches "SCENTQUEEN".
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify the caller's JWT (anonymous guests have one too).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_authorization" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "invalid_token" }, 401);

    // Guests may not redeem — a code must attach to a real, recoverable account.
    // Anonymous sessions carry a valid JWT (so they'd otherwise pass), hence this
    // explicit check. The client also gates this, but never trust the client.
    if (user.is_anonymous) return json({ error: "sign_in_required" }, 403);

    const userId = user.id;

    // 2. Parse + normalize the code.
    let raw = "";
    try {
      const body = await req.json();
      raw = typeof body?.code === "string" ? body.code : "";
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const code = normalizeCode(raw);
    if (!code) return json({ error: "empty_code" }, 400);

    // 3. Look up the code.
    const { data: promo, error: promoErr } = await admin
      .from("promo_codes")
      .select("code, duration_months, max_redemptions, redeemed_count, active, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (promoErr) {
      console.error("[redeem-promo] promo lookup failed:", promoErr.message);
      return json({ error: "server_error" }, 500);
    }
    if (!promo || !promo.active) return json({ error: "invalid_code" }, 404);

    // 4. Expiry + cap checks.
    if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
      return json({ error: "expired" }, 410);
    }
    if (
      promo.max_redemptions != null &&
      promo.redeemed_count >= promo.max_redemptions
    ) {
      return json({ error: "code_exhausted" }, 409);
    }

    // 5. Already redeemed this code?
    const { data: existing } = await admin
      .from("promo_redemptions")
      .select("code")
      .eq("code", code)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) return json({ error: "already_redeemed" }, 409);

    // 6. Reject if the user already has active Pro ("only if not Pro"). Ensures
    //    a code isn't "wasted" on someone already covered by a trial/paid sub.
    const { data: profile } = await admin
      .from("profiles")
      .select("is_pro, pro_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const proActive = !!profile?.is_pro &&
      (profile.pro_expires_at == null ||
        new Date(profile.pro_expires_at).getTime() > Date.now());
    if (proActive) return json({ error: "already_pro" }, 409);

    // 7. Record the redemption FIRST — the (code, user_id) PK is the idempotency
    //    guard against a double-tap race. If it conflicts, they already redeemed.
    const { error: redeemErr } = await admin
      .from("promo_redemptions")
      .insert({ code, user_id: userId, duration_months: promo.duration_months });
    if (redeemErr) {
      // 23505 = unique_violation → a concurrent request already redeemed it.
      if ((redeemErr as { code?: string }).code === "23505") {
        return json({ error: "already_redeemed" }, 409);
      }
      console.error("[redeem-promo] redemption insert failed:", redeemErr.message);
      return json({ error: "server_error" }, 500);
    }

    // 8. Grant Pro. pro_expires_at = now + duration_months. Upsert so a guest
    //    without a profiles row yet still gets granted.
    const expires = new Date();
    expires.setMonth(expires.getMonth() + promo.duration_months);
    const proExpiresAt = expires.toISOString();

    const { error: grantErr } = await admin
      .from("profiles")
      .upsert(
        { id: userId, is_pro: true, pro_expires_at: proExpiresAt, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (grantErr) {
      // Roll back the redemption row so the user can retry rather than being
      // stuck "redeemed but not granted".
      await admin.from("promo_redemptions").delete()
        .eq("code", code).eq("user_id", userId);
      console.error("[redeem-promo] grant upsert failed:", grantErr.message);
      return json({ error: "server_error" }, 500);
    }

    // 9. Best-effort: bump the redemption counter (soft cap; race-tolerant).
    await admin
      .from("promo_codes")
      .update({ redeemed_count: promo.redeemed_count + 1 })
      .eq("code", code)
      .then(() => null, () => null);

    return json({
      ok: true,
      duration_months: promo.duration_months,
      pro_expires_at: proExpiresAt,
    });
  } catch (err) {
    console.error("[redeem-promo] error:", err);
    return json({ error: "server_error" }, 500);
  }
});
