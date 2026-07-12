// active-users.js — Honest daily active users (signed-in humans + guest visits).
//
// Cross-source (PostHog activity × Supabase auth), so it lives in its own module
// like retention would — NOT in posthog.js.
//
// Why this exists: PostHog person_id / distinct_id / $session_id all over-count
// ~2-3x because the app spawns ~3 anonymous ids per guest app-open and emits no
// stable $device_id, so the SDK can't collapse them.
//
// What we count instead:
//   • Signed-in users  — distinct NON-anonymous Supabase user ids active that
//     day (deduplicated real humans).
//   • Guest visits     — anonymous activity collapsed into sessions by a 30-min
//     inactivity gap, so the ~3-ids-in-one-second churn burst becomes ONE visit.
//     Guests are counted per-visit (no stable device id to dedupe returners).
//   total = signedIn + guestVisits.

'use strict';

// Own per-project fetch — does NOT reuse posthog.js hogql, whose multi-project
// combineResults keys rows by non-numeric columns and SUMS numeric ones. That
// would sum our raw unix timestamps together across projects and wreck guest
// clustering. So we query each project and concat raw rows here.
async function queryProject(env, projectId, query) {
  const host = env.host || 'https://us.posthog.com';
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${projectId} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).results ?? [];
}

const APP_NAMESPACE = 'com.bobguillow.perfumepicks';
const HISTORICAL_PROJECT_ID = '396959'; // pre-cutover Perfume events still land here
const OWNER_EMAIL = 'bobguillow@icloud.com';
const OWNER_ANON_PERSON_IDS = ['cae5b81a-558f-5ac0-a574-5febf21f6914'];
const OWNER_SUPABASE_ID = 'f4810587-d519-49d3-8121-d9fdd8239159';
const NS = `properties.$app_namespace = '${APP_NAMESPACE}'
  AND coalesce(person.properties.email, '') != '${OWNER_EMAIL}'
  AND distinct_id != '${OWNER_SUPABASE_ID}'
  AND toString(person_id) NOT IN (${OWNER_ANON_PERSON_IDS.map((id) => `'${id}'`).join(', ')})`;

const GUEST_GAP_SECONDS = 1800; // 30-min inactivity → new guest visit

// Instant signed-in activity signal, straight from Supabase — lag-free, unlike
// PostHog (which ingests 3-5 min late and made a live session read as 0 DAU,
// 2026-07-11). Perfume bumps last_login_date (DATE) on app open. We UNION this
// with PostHog activity: Supabase makes a fresh session show immediately, and
// PostHog backfills anything Supabase's column misses. Union is strictly safer
// than either alone — it can only remove false zeros, never add false actives
// (last_login_date never bumps from a server webhook, unlike updated_at).
const SIGNED_IN_ACTIVITY_COL = 'last_login_date';
const SIGNED_IN_COL_IS_DATE = true;
const NOTE =
  'Active users = distinct signed-in humans (non-anonymous Supabase ids) + guest visits (anonymous activity collapsed by 30-min gaps). Guests counted per-visit; person_id DAU over-counts these ~2-3x.';

// All NON-anonymous Supabase user ids (real, logged-in humans). Paginated.
async function fetchRealUserIds(supaUrl, supaKey) {
  const real = new Set();
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${supaUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    if (!res.ok) throw new Error(`admin/users ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const json = await res.json();
    const users = json.users || json;
    if (!Array.isArray(users) || users.length === 0) break;
    for (const u of users) if (!u.is_anonymous) real.add(u.id);
    if (users.length < 200) break;
  }
  return real;
}

// Per-day signed-in activity from Supabase (instant). Returns
// Map<'YYYY-MM-DD', Set<userId>>. Only real (non-anon) users have profiles,
// so every id here is a signed-in human. Never throws the report down: on
// failure the caller falls back to PostHog-only (with a logged reason).
async function fetchSupaActiveByDay(supaUrl, supaKey, days) {
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const col = SIGNED_IN_ACTIVITY_COL;
  const filter = SIGNED_IN_COL_IS_DATE ? `${col}=gte.${start}` : `${col}=gte.${start}T00:00:00Z`;
  const res = await fetch(`${supaUrl}/rest/v1/profiles?select=id,${col}&${filter}&limit=100000`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  if (!res.ok) throw new Error(`supa signed-in activity ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const byDay = new Map();
  for (const row of await res.json()) {
    const v = row[col];
    if (!v) continue;
    const day = String(v).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day).add(row.id);
  }
  return byDay;
}

// Pure aggregation — deterministic given (rows, realIds, supaActiveByDay).
//   rows: Array<[dateStr, distinct_id, unixSeconds]> (PostHog)
//   supaActiveByDay: Map<dateStr, Set<userId>> (Supabase, instant) — union'd
//   into the signed-in set so a live session counts before PostHog ingests it.
function computeActiveUsers(rows, realIds, supaActiveByDay = new Map()) {
  const byDay = new Map();
  // Seed each day's signed-in set with Supabase-instant activity first.
  for (const [day, ids] of supaActiveByDay) {
    const e = byDay.get(day) || { real: new Set(), guestTs: [] };
    for (const id of ids) e.real.add(id);
    byDay.set(day, e);
  }
  for (const [d, id, t] of rows) {
    const day = String(d);
    const e = byDay.get(day) || { real: new Set(), guestTs: [] };
    if (realIds.has(id)) e.real.add(id);
    else e.guestTs.push(Number(t));
    byDay.set(day, e);
  }
  return [...byDay.entries()]
    .map(([date, e]) => {
      e.guestTs.sort((a, b) => a - b);
      let guestVisits = e.guestTs.length ? 1 : 0;
      for (let i = 1; i < e.guestTs.length; i++) {
        if (e.guestTs[i] - e.guestTs[i - 1] > GUEST_GAP_SECONDS) guestVisits++;
      }
      const signedIn = e.real.size;
      return { date, signedIn, guestVisits, total: signedIn + guestVisits };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Honest window aggregates — replaces person_id WAU/MAU entirely.
//   signedIn: DISTINCT non-anonymous users active in the window (exact).
//   guestVisits: sum of per-day guest visits in the window. Explicitly VISITS,
//   not unique people — without a stable device id a 7d unique-guest count
//   would be a guess, and we don't print guesses.
function computeWindows(rows, realIds, todayStr, supaActiveByDay = new Map()) {
  const cutoff = (n) =>
    new Date(Date.parse(todayStr + 'T00:00:00Z') - (n - 1) * 86400000).toISOString().slice(0, 10);
  const c7 = cutoff(7);
  const c28 = cutoff(28);
  const signed7 = new Set(), signed28 = new Set();
  const guestByDay7 = new Map(), guestByDay28 = new Map();
  // Seed signed-in windows with Supabase-instant activity (union, lag-free).
  for (const [day, ids] of supaActiveByDay) {
    if (day < c28 || day > todayStr) continue;
    for (const id of ids) {
      signed28.add(id);
      if (day >= c7) signed7.add(id);
    }
  }
  for (const [d, id, t] of rows) {
    const day = String(d);
    if (day < c28 || day > todayStr) continue;
    if (realIds.has(id)) {
      signed28.add(id);
      if (day >= c7) signed7.add(id);
    } else {
      if (!guestByDay28.has(day)) guestByDay28.set(day, []);
      guestByDay28.get(day).push(Number(t));
      if (day >= c7) {
        if (!guestByDay7.has(day)) guestByDay7.set(day, []);
        guestByDay7.get(day).push(Number(t));
      }
    }
  }
  const visits = (byDay) => {
    let total = 0;
    for (const ts of byDay.values()) {
      ts.sort((a, b) => a - b);
      let v = ts.length ? 1 : 0;
      for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > GUEST_GAP_SECONDS) v++;
      total += v;
    }
    return total;
  };
  return {
    wauSignedIn: signed7.size,
    mauSignedIn: signed28.size,
    guestVisits7d: visits(guestByDay7),
    guestVisits28d: visits(guestByDay28),
  };
}

async function fetchActiveUsers(env, { days = 30 } = {}) {
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return { error: 'Supabase creds missing (active-users needs SUPABASE_SERVICE_ROLE_KEY)' };
  }

  let realIds;
  try {
    realIds = await fetchRealUserIds(supaUrl, supaKey);
  } catch (e) {
    return { error: `active-users real-id fetch failed: ${e.message}` };
  }

  // Explicit LIMIT — HogQL silently caps at 100 rows without one.
  const q = `
    SELECT toDate(timestamp) AS d, distinct_id, toUnixTimestamp(timestamp) AS t
    FROM events
    WHERE toDate(timestamp) >= toDate(now()) - ${days - 1}
      AND ${NS}
    ORDER BY t
    LIMIT 1000000`;

  // Union active + historical project (Perfume is mid-cutover). Concat raw rows.
  const projects = [String(env.project)];
  if (HISTORICAL_PROJECT_ID !== String(env.project)) projects.push(HISTORICAL_PROJECT_ID);

  let rows;
  try {
    rows = [];
    for (const p of projects) rows.push(...(await queryProject(env, p, q)));
  } catch (e) {
    return { error: e.message };
  }

  // Instant signed-in activity (non-fatal: fall back to PostHog-only on error).
  let supaActiveByDay = new Map();
  let supaActiveError = null;
  try {
    supaActiveByDay = await fetchSupaActiveByDay(supaUrl, supaKey, days);
  } catch (e) {
    supaActiveError = e.message;
  }

  // CRITICAL: keep only REAL (non-anon) users and drop the founder. Anonymous
  // guests also get a last_login_date, and without this filter they inflate
  // "signed-in" (they belong in guest visits, counted via PostHog). realIds is
  // the non-anon set from auth admin; it includes the founder, so exclude that
  // id explicitly — mirrors the PostHog NS exclusion. (Bug caught 2026-07-12:
  // Perfume MAU read 106 signed-in vs 35 installs; 90 of those were anon.)
  const OWNER_IDS = new Set([OWNER_SUPABASE_ID]);
  for (const [day, ids] of supaActiveByDay) {
    const kept = new Set();
    for (const id of ids) if (realIds.has(id) && !OWNER_IDS.has(id)) kept.add(id);
    if (kept.size) supaActiveByDay.set(day, kept);
    else supaActiveByDay.delete(day);
  }

  const daily = computeActiveUsers(rows, realIds, supaActiveByDay);
  const byDate = new Map(daily.map((r) => [r.date, r]));
  const dateStr = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  const today = byDate.get(dateStr(0)) || { signedIn: 0, guestVisits: 0, total: 0 };
  const yesterday = byDate.get(dateStr(1)) || { signedIn: 0, guestVisits: 0, total: 0 };
  const windows = computeWindows(rows, realIds, dateStr(0), supaActiveByDay);

  // Freshness heartbeat — PostHog is the laggy source, so surface its
  // last-event age. A '0 today' next to "PostHog last event 4m ago" reads as
  // real; next to "6h ago" it reads as a stalled pipeline. Makes any zero
  // self-diagnosing instead of a 10-minute investigation.
  let posthogLatestUnix = 0;
  for (const r of rows) {
    const n = Number(r[2]);
    if (n > posthogLatestUnix) posthogLatestUnix = n;
  }
  const freshness = {
    posthogLatestUnix: posthogLatestUnix || null,
    posthogAgeMin: posthogLatestUnix ? Math.round((Date.now() / 1000 - posthogLatestUnix) / 60) : null,
    signedInSource: `Supabase ${SIGNED_IN_ACTIVITY_COL} (instant) ∪ PostHog`,
    supaActiveError,
  };

  return { daily, today, yesterday, windows, denominatorNote: NOTE, freshness };
}

module.exports = { fetchActiveUsers, computeActiveUsers, computeWindows, NS };
