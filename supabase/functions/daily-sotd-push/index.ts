// supabase/functions/daily-sotd-push/index.ts
//
// The server re-engagement engine. The app only ever had a LOCAL 8am notification
// (on-device), which can't reach a lapsed user — 93% of users never returned for
// a second day and nothing could pull them back. This function, run hourly by
// pg_cron, sends each user their "Scent of the Day is ready" push at ~8am LOCAL
// time (using the device tz offset captured in push_tokens), personalized with
// their Fragrance DNA archetype.
//
// The push's job is to drive the OPEN — the exact bottle pick is computed
// client-side on launch (smartSotd.ts). We don't recompute the pick server-side
// here; that's a later refinement once the loop is proven.
//
// Invocation:
//   Cron  → POST with no body: sends to everyone whose LOCAL hour is TARGET_HOUR
//           and who hasn't been pushed today (their local date).
//   Test  → POST { "test_user_id": "<uuid>" }: sends only to that user, ignoring
//           the hour/dedup gates. Use this to fire a push to your own device
//           before turning the cron on.
//
// Deploy: supabase functions deploy daily-sotd-push
// Secrets used: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Local hour we aim to deliver at (8am). tz_offset_minutes on each token converts
// UTC → local. Running hourly means each user is caught in the one run where their
// local hour equals this.
const TARGET_HOUR = 8;

// archetype key → display name. Mirrors ARCHETYPE_COPY in
// src/features/dna/revealCopy.ts — keep in sync if archetypes change.
const ARCHETYPE_NAME: Record<string, string> = {
  the_executive: "The Executive",
  the_seducer: "The Seducer",
  the_crowd_pleaser: "The Crowd-Pleaser",
  the_connoisseur: "The Connoisseur",
  the_signature_wearer: "The Signature Wearer",
  the_purist: "The Purist",
  the_showstopper: "The Showstopper",
  the_smart_shopper: "The Smart Shopper",
  the_romantic: "The Romantic",
  the_explorer: "The Explorer",
  the_classicist: "The Classicist",
  the_rebel: "The Rebel",
  the_gourmand: "The Gourmand",
  the_minimalist: "The Minimalist",
  the_naturalist: "The Naturalist",
  the_trendsetter: "The Trendsetter",
  the_old_soul: "The Old Soul",
  the_maximalist: "The Maximalist",
  the_night_owl: "The Night Owl",
  the_spice_trader: "The Spice Trader",
  the_daybreaker: "The Daybreaker",
  the_soft_focus: "The Soft Focus",
};

interface TokenRow {
  user_id: string;
  token: string;
  tz: string | null;
  tz_offset_minutes: number;
  last_pushed_on: string | null;
}

/**
 * user-local hour + YYYY-MM-DD. Prefers the IANA zone (correct across DST via
 * Intl, which Deno supports); falls back to the fixed minute-offset for rows not
 * yet re-registered with a tz.
 */
function localParts(nowUtcMs: number, tz: string | null, tzOffsetMin: number): { hour: number; ymd: string } {
  if (tz) {
    try {
      const now = new Date(nowUtcMs);
      const hour = Number(
        new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now),
      ) % 24;
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      return { hour, ymd };
    } catch {
      /* bad tz string — fall through to offset */
    }
  }
  const local = new Date(nowUtcMs + tzOffsetMin * 60_000);
  return { hour: local.getUTCHours(), ymd: local.toISOString().slice(0, 10) };
}

/** Push copy from the archetype. Generic-but-personal; the pick is shown on open. */
function messageFor(archetypeKey: string | null): { title: string; body: string } {
  const name = archetypeKey ? ARCHETYPE_NAME[archetypeKey] : null;
  return name
    ? { title: `${name}, your scent for today 🌸`, body: "Open to see what fits the day ahead." }
    : { title: "Your Scent of the Day is ready 🌸", body: "Open to see what fits the day ahead." };
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowUtcMs = Date.now();

  let testUserId: string | null = null;
  try {
    const body = await req.json();
    testUserId = body?.test_user_id ?? null;
  } catch {
    /* no body — cron invocation */
  }

  // Pull LIVE tokens only (skip ones marked dead by a prior DeviceNotRegistered).
  // Service role bypasses RLS.
  let query = supabase
    .from("push_tokens")
    .select("user_id, token, tz, tz_offset_minutes, last_pushed_on")
    .is("invalid_at", null);
  if (testUserId) query = query.eq("user_id", testUserId);
  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  const tokens = (data ?? []) as TokenRow[];

  // Archetype comes from user_taste_profiles, fetched separately: push_tokens and
  // user_taste_profiles both FK to auth.users but not to each other, so PostgREST
  // can't embed one from the other. Map by user_id in code.
  const archetypeByUser = new Map<string, string | null>();
  if (tokens.length > 0) {
    const { data: tp } = await supabase
      .from("user_taste_profiles")
      .select("user_id, dna")
      .in("user_id", tokens.map((t) => t.user_id));
    for (const r of (tp ?? []) as any[]) {
      archetypeByUser.set(r.user_id, r.dna?.archetype?.primary ?? null);
    }
  }

  const due: { row: TokenRow; archetype: string | null; localYmd: string; sendId: string }[] = [];
  for (const row of tokens) {
    const archetype = archetypeByUser.get(row.user_id) ?? null;
    const { hour, ymd } = localParts(nowUtcMs, row.tz, row.tz_offset_minutes ?? 0);

    if (!testUserId) {
      if (hour !== TARGET_HOUR) continue; // not their morning yet
      if (row.last_pushed_on === ymd) continue; // already pushed today (local)
    }
    // send_id ties this specific push to its ledger row so the app can report
    // the open back against it (mark_notification_opened). Generated here so it
    // can be embedded in the push payload before we send.
    due.push({ row, archetype, localYmd: ymd, sendId: crypto.randomUUID() });
  }

  if (due.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "none due" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Expo accepts up to 100 messages per request.
  const messages = due.map(({ row, archetype, sendId }) => {
    const { title, body } = messageFor(archetype);
    // data.send_id lets the app attribute the open; campaign mirrors the ledger.
    return {
      to: row.token,
      title,
      body,
      sound: "default",
      channelId: "default",
      data: { send_id: sendId, campaign: "daily_sotd" },
    };
  });

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);

  // Dead-token cleanup: Expo returns one ticket per message, in order. A ticket
  // with error 'DeviceNotRegistered' means the app was uninstalled — stamp
  // invalid_at so we never push to that token again (the query filters it out).
  const tickets: any[] = Array.isArray(result?.data) ? result.data : [];
  const deadUserIds = due
    .filter((_, i) => tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered")
    .map(({ row }) => row.user_id);
  if (deadUserIds.length > 0) {
    await supabase
      .from("push_tokens")
      .update({ invalid_at: new Date(nowUtcMs).toISOString() })
      .in("user_id", deadUserIds);
  }

  // Mark everyone we just sent to as pushed for their local day (skip in test so
  // a test send doesn't suppress the real morning push).
  if (!testUserId) {
    await Promise.all(
      due.map(({ row, localYmd }) =>
        supabase.from("push_tokens").update({ last_pushed_on: localYmd }).eq("user_id", row.user_id),
      ),
    );
  }

  // Analytics ledger (mirrors Pour's notification_sends): one row per send so we
  // can report sent + opened per campaign. Best-effort and wrapped — a ledger
  // failure must NEVER affect the actual push that already went out. Upsert with
  // ignoreDuplicates so a same-day double-send can't error the whole batch.
  try {
    const deadSet = new Set(deadUserIds);
    const ledgerRows = due.map(({ row, localYmd, sendId }) => ({
      id: sendId,
      campaign_key: "daily_sotd",
      user_id: row.user_id,
      send_day: localYmd,
      status: deadSet.has(row.user_id) ? "invalid_token" : "sent",
    }));
    await supabase
      .from("notification_sends")
      .upsert(ledgerRows, { onConflict: "campaign_key,user_id,send_day", ignoreDuplicates: true });
  } catch (e) {
    console.error("[daily-sotd-push] notification_sends ledger write failed (non-fatal):", e);
  }

  return new Response(JSON.stringify({ sent: due.length, test: !!testUserId, expo: result }), {
    headers: { "content-type": "application/json" },
  });
});
