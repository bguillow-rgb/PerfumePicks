// supabase/functions/delete-account/index.ts
// Deletes the calling user's data + auth row.
// Auth.admin.deleteUser requires the service role key, which only lives server-side here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify caller's JWT — only the user themselves can trigger account deletion.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = user.id;

    // 2. Delete user-owned rows. Best-effort — if any single delete fails we still
    // attempt the others so we don't leave the account in a half-deleted state.
    const tables = [
      "wardrobe_items",
      "wear_logs",
      "swipe_feedback",
      "quiz_results",
      "user_taste_profiles",
    ];
    await Promise.all(
      tables.map((t) =>
        admin.from(t).delete().eq("user_id", userId).then(
          () => null,
          () => null,
        )
      ),
    );
    await admin.from("profiles").delete().eq("id", userId).then(
      () => null,
      () => null,
    );

    // 3. Best-effort: clear user's storage objects (avatars, scan uploads, journal photos)
    const buckets = ["avatars"];
    for (const bucket of buckets) {
      try {
        const { data: files } = await admin.storage
          .from(bucket)
          .list(userId, { limit: 1000 });
        if (files && files.length > 0) {
          await admin.storage
            .from(bucket)
            .remove(files.map((f) => `${userId}/${f.name}`));
        }
      } catch {
        // Ignore — storage may not have any files for this user.
      }
    }

    // 4. Finally delete the auth.users row. This invalidates all refresh tokens.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("auth.admin.deleteUser failed:", deleteError);
      return new Response(
        JSON.stringify({ error: "Account deletion failed. Please contact support." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
