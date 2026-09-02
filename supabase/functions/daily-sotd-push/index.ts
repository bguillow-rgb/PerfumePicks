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
  updated_at?: string | null;
  /** Settings toggle. Optional: undefined until the migration adds the column. */
  sotd_enabled?: boolean | null;
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
/** Return claims so a failed send doesn't burn the user's push for the day. */
async function unclaim(supabase: any, items: { row: { user_id: string; last_pushed_on: string | null } }[]) {
  await Promise.all(items.map(({ row }) =>
    supabase.from("push_tokens").update({ last_pushed_on: row.last_pushed_on }).eq("user_id", row.user_id),
  )).catch((e: unknown) => console.error("[sotd-push] unclaim failed:", e));
}

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
    .select("*") // "*" not an explicit list: sotd_enabled may not exist yet
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

  let due: { row: TokenRow; archetype: string | null; localYmd: string }[] = [];
  for (const row of tokens) {
    const archetype = archetypeByUser.get(row.user_id) ?? null;
    const { hour, ymd } = localParts(nowUtcMs, row.tz, row.tz_offset_minutes ?? 0);

    if (!testUserId) {
      // Settings toggle, now server-side (the local 8am twin was retired). Read
      // defensively: before the migration lands the field is undefined, which
      // must mean "on" rather than silently muting everyone.
      if (row.sotd_enabled === false) continue;
      if (hour !== TARGET_HOUR) continue; // not their morning yet
      if (row.last_pushed_on === ymd) continue; // already pushed today (local)
    }
    due.push({ row, archetype, localYmd: ymd });
  }

  if (due.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "none due" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // ── ONE DEVICE, ONE PUSH ──────────────────────────────────────────────────
  // push_tokens is keyed on user_id, so signing a second account into the same
  // phone stores the SAME Expo device token on a second row. The send loop is
  // per-row, so that phone received one identical notification per account — a
  // device with three accounts got three copies every morning. Collapse to the
  // most recently registered row per token: the device belongs to whoever
  // signed in last. (A trigger keeps the table itself clean; this is the guard
  // that holds even if a stale row slips through.)
  {
    const best = new Map<string, typeof due[number]>();
    for (const d of due) {
      const prev = best.get(d.row.token);
      if (!prev || (d.row.updated_at ?? "") > (prev.row.updated_at ?? "")) best.set(d.row.token, d);
    }
    if (best.size !== due.length) {
      console.log(`[sotd-push] collapsed ${due.length} rows to ${best.size} devices`);
    }
    due = [...best.values()];
  }

  // ── CLAIM BEFORE SENDING (fixes duplicate pushes, 2026-09-02) ─────────────
  // The guard above READ last_pushed_on and the stamp below WROTE it only after
  // the Expo round-trip finished — a window of hundreds of ms. Any overlapping
  // invocation in that window read the same stale value and sent again, so a
  // user received the identical notification 3x at 08:00.
  //
  // Claiming first closes it: this UPDATE takes a row lock and only returns rows
  // it actually changed, so of N concurrent runs exactly one wins each user.
  // Idempotent no matter how many cron jobs are scheduled or how they overlap.
  //
  // Trade-off, deliberately chosen: a send that fails AFTER claiming would cost
  // that user today's push. Missing one is far better than spamming three, and
  // the total-failure path below un-claims so a transient Expo outage doesn't
  // silently skip everyone.
  let sendable = due;
  if (!testUserId) {
    const byYmd = new Map<string, string[]>();
    for (const d of due) {
      if (!byYmd.has(d.localYmd)) byYmd.set(d.localYmd, []);
      byYmd.get(d.localYmd)!.push(d.row.user_id);
    }
    const claimed = new Set<string>();
    for (const [ymd, userIds] of byYmd) {
      const { data, error } = await supabase
        .from("push_tokens")
        .update({ last_pushed_on: ymd })
        .in("user_id", userIds)
        .or(`last_pushed_on.is.null,last_pushed_on.neq.${ymd}`)
        .select("user_id");
      if (error) {
        console.error("[sotd-push] claim failed:", error.message);
        continue; // claim nothing rather than risk duplicates
      }
      for (const r of data ?? []) claimed.add(r.user_id);
    }
    sendable = due.filter((d) => claimed.has(d.row.user_id));
    if (sendable.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "already claimed by a concurrent run" }), {
        headers: { "content-type": "application/json" },
      });
    }
  }

  // Expo accepts up to 100 messages per request.
  const messages = sendable.map(({ row, archetype }) => {
    const { title, body } = messageFor(archetype);
    // data.source lets the app attribute an OPEN back to this push rather than
    // to a locally-scheduled reminder — without it every open is "unknown" and
    // the daily push cannot be measured separately from the local nudges.
    return {
      to: row.token,
      title,
      body,
      sound: "default",
      channelId: "default",
      data: { screen: "today", source: "daily_sotd" },
    };
  });

  let res: Response;
  try {
    res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    // Total failure: give the claims back so tomorrow's (or a retry's) run can
    // still reach these users, instead of silently burning their push.
    if (!testUserId) await unclaim(supabase, sendable);
    throw err;
  }
  if (!res.ok && !testUserId) await unclaim(supabase, sendable);
  const result = await res.json().catch(() => null);

  // Dead-token cleanup: Expo returns one ticket per message, in order. A ticket
  // with error 'DeviceNotRegistered' means the app was uninstalled — stamp
  // invalid_at so we never push to that token again (the query filters it out).
  const tickets: any[] = Array.isArray(result?.data) ? result.data : [];
  const deadUserIds = sendable
    .filter((_, i) => tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered")
    .map(({ row }) => row.user_id);
  if (deadUserIds.length > 0) {
    await supabase
      .from("push_tokens")
      .update({ invalid_at: new Date(nowUtcMs).toISOString() })
      .in("user_id", deadUserIds);
  }

  // NOTE: no post-send stamp here any more — the claim above already wrote
  // last_pushed_on. Stamping again after the round-trip is exactly what created
  // the duplicate-push race.

  return new Response(JSON.stringify({ sent: sendable.length, test: !!testUserId, expo: result }), {
    headers: { "content-type": "application/json" },
  });
});
