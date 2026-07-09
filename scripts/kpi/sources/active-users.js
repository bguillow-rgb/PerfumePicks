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

// Pure aggregation — deterministic given (rows, realIds).
//   rows: Array<[dateStr, distinct_id, unixSeconds]>
function computeActiveUsers(rows, realIds) {
  const byDay = new Map();
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
function computeWindows(rows, realIds, todayStr) {
  const cutoff = (n) =>
    new Date(Date.parse(todayStr + 'T00:00:00Z') - (n - 1) * 86400000).toISOString().slice(0, 10);
  const c7 = cutoff(7);
  const c28 = cutoff(28);
  const signed7 = new Set(), signed28 = new Set();
  const guestByDay7 = new Map(), guestByDay28 = new Map();
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

  const daily = computeActiveUsers(rows, realIds);
  const byDate = new Map(daily.map((r) => [r.date, r]));
  const dateStr = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  const today = byDate.get(dateStr(0)) || { signedIn: 0, guestVisits: 0, total: 0 };
  const yesterday = byDate.get(dateStr(1)) || { signedIn: 0, guestVisits: 0, total: 0 };
  const windows = computeWindows(rows, realIds, dateStr(0));

  return { daily, today, yesterday, windows, denominatorNote: NOTE };
}

module.exports = { fetchActiveUsers, computeActiveUsers, computeWindows, NS };
