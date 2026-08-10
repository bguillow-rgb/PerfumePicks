// supabase.js — All Supabase queries for the Perfume Picks KPI dashboard.
//
// Every table/column name comes from ../schema.js.
// Every time window comes from ../windows.js.

'use strict';

const { TABLES } = require('../schema');

function loadEnv() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  const key = serviceRole || anon;
  return {
    url: url.replace(/\/$/, ''),
    key,
    hasServiceRole: Boolean(serviceRole),
  };
}

// Retry wrapper — Supabase intermittently 401s individual requests when the
// dashboard fires its burst of concurrent count() calls (auth-cache contention
// under load, seen 2026-07-09..11). Retry transient failures with backoff so a
// blip self-heals instead of surfacing a false outage. Real config errors (bad
// key) fail every attempt and surface after tries exhaust.
async function fetchWithRetry(url, opts, { tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || (res.status !== 401 && res.status !== 403 && res.status !== 429 && res.status < 500)) {
        return res;
      }
      lastErr = new Error(`${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1) * (i + 1)));
  }
  if (lastErr && /^\d+$/.test(lastErr.message)) return fetch(url, opts);
  throw lastErr;
}

// HEAD with Prefer: count=exact — cheapest way to count rows.
async function count(env, table, filterParts = []) {
  const filter = filterParts.filter(Boolean).join('&');
  const url = `${env.url}/rest/v1/${table}?select=id${filter ? `&${filter}` : ''}&limit=0`;
  const res = await fetchWithRetry(url, {
    method: 'HEAD',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  // A failed request MUST NOT read as "0 rows" — that lie ships a dashboard
  // full of confident zeros during an outage. Throw so the orchestrator marks
  // supa.error and the SUPABASE-FAILED banner fires instead of fake zeros.
  if (!res.ok) {
    throw new Error(`count(${table}) ${res.status}`);
  }
  const cr = res.headers.get('content-range') || '';
  const total = parseInt(cr.split('/')[1] || '0', 10);
  return Number.isNaN(total) ? 0 : total;
}

async function getRows(env, table, filterParts = [], limit = 10) {
  const filter = filterParts.filter(Boolean).join('&');
  const url = `${env.url}/rest/v1/${table}?select=*${filter ? `&${filter}` : ''}&limit=${limit}`;
  const res = await fetchWithRetry(url, {
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
    },
  });
  if (!res.ok) {
    throw new Error(`getRows(${table}) ${res.status}`);
  }
  return await res.json();
}

async function fetchAuthUsers(env, { perPage = 200 } = {}) {
  if (!env.hasServiceRole) return [];
  const url = `${env.url}/auth/v1/admin/users?per_page=${perPage}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.users || [];
}

function dateFilter(col, win) {
  return [
    `${col}=gte.${encodeURIComponent(win.startIso)}`,
    `${col}=lt.${encodeURIComponent(win.endIso)}`,
  ];
}

// ── KPI fetchers ───────────────────────────────────────────────────────

async function fetchSignups(env, windows) {
  const t = TABLES.profiles;
  const [today, yesterday, last7d, last28d, sinceLaunch] = await Promise.all([
    count(env, t.name, dateFilter(t.timestampCol, windows.today)),
    count(env, t.name, dateFilter(t.timestampCol, windows.yesterday)),
    count(env, t.name, dateFilter(t.timestampCol, windows.last7d)),
    count(env, t.name, dateFilter(t.timestampCol, windows.last28d)),
    count(env, t.name, dateFilter(t.timestampCol, windows.sinceLaunch)),
  ]);
  return { today, yesterday, last7d, last28d, sinceLaunch };
}

// Wardrobe items — "collection" (have) and "wishlist" (want)
// Founder account (Perfume's Supabase project — different uuid than Pour's).
const OWNER_USER_ID = 'f4810587-d519-49d3-8121-d9fdd8239159';

// PostgREST filter dropping founder rows from user-scoped tables.
//
// Audit 2026-07-14: the founder was inflating Supabase-sourced rows while the
// PostHog side already stripped him — swipe signals 66 (25 founder — 38%),
// wardrobe + wear logs lightly contaminated. Keeps user_id IS NULL rows (guest
// activity is real; a bare `not.in` evaluates NULL to NULL and drops them).
const NOT_FOUNDER = `or=(user_id.is.null,user_id.not.in.(${OWNER_USER_ID}))`;

// Distinct PEOPLE in a user-scoped table, founder excluded. The funnel needs
// people; row counts made a one-user feature look like traction.
async function distinctUsers(env, table, filterParts = []) {
  const rows = await getRows(env, table, [...filterParts, NOT_FOUNDER, 'select=user_id'], 10000);
  const users = new Set();
  for (const r of rows || []) {
    if (r.user_id && r.user_id !== OWNER_USER_ID) users.add(r.user_id);
  }
  return users.size;
}

async function fetchWardrobe(env, windows) {
  const t = TABLES.wardrobeItems;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  const [
    today, yesterday, sinceLaunchTotal,
    haveToday, wantToday, testedToday,
    haveSinceLaunch, wantSinceLaunch, testedSinceLaunch,
  ] = await Promise.all([
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.yesterday), NOT_FOUNDER]),
    count(env, t.name, [...sl, NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.have`, NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.want`, NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.tested`, NOT_FOUNDER]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.have`, NOT_FOUNDER]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.want`, NOT_FOUNDER]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.tested`, NOT_FOUNDER]),
  ]);
  // PEOPLE who added to their collection, for the funnel. The funnel used to
  // read posthog.wardrobe.added.users — an event the app has NEVER fired — so
  // it printed "Collection add: 0 (0%)" while 27 real people had added 64
  // fragrances. Read the real table instead (audit 2026-07-14).
  const [addedUsers, haveUsers] = await Promise.all([
    distinctUsers(env, t.name, sl),
    distinctUsers(env, t.name, [...sl, `${t.statusCol}=eq.have`]),
  ]);
  return {
    today: { total: today, have: haveToday, want: wantToday, tested: testedToday },
    yesterday: { total: yesterday },
    sinceLaunch: { total: sinceLaunchTotal, have: haveSinceLaunch, want: wantSinceLaunch, tested: testedSinceLaunch },
    addedUsers, // distinct people with ANY wardrobe item since launch
    haveUsers,  // distinct people with a status=have item (the collection step)
  };
}

// Wear logs — the journal / SOTD feature
async function fetchWearLogs(env, windows) {
  const t = TABLES.wearLogs;
  const [today, yesterday, last7d, sinceLaunch, loggedUsers] = await Promise.all([
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.yesterday), NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.last7d), NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.sinceLaunch), NOT_FOUNDER]),
    // PEOPLE, not rows — the funnel's "Wear logged" step printed 11 rows as if
    // it were 11 people when only 8 had logged a wear.
    distinctUsers(env, t.name, dateFilter(t.timestampCol, windows.sinceLaunch)),
  ]);
  return { today, yesterday, last7d, sinceLaunch, loggedUsers };
}

// Swipe feedback — Train My Nose
async function fetchSwipes(env, windows) {
  const t = TABLES.swipeFeedback;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  // Founder-excluded: 25 of 66 swipe signals since launch were the founder's
  // own testing (38%) before this filter (audit 2026-07-14).
  const [today, yesterday, sinceLaunch, likeSinceLaunch, dislikeSinceLaunch, swipedUsers] = await Promise.all([
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), NOT_FOUNDER]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.yesterday), NOT_FOUNDER]),
    count(env, t.name, [...sl, NOT_FOUNDER]),
    count(env, t.name, [...sl, `${t.actionCol}=eq.like`, NOT_FOUNDER]),
    count(env, t.name, [...sl, `${t.actionCol}=eq.dislike`, NOT_FOUNDER]),
    distinctUsers(env, t.name, sl),
  ]);
  return { today, yesterday, sinceLaunch, likeSinceLaunch, dislikeSinceLaunch, swipedUsers };
}

// Community reviews
async function fetchReviews(env, windows) {
  const t = TABLES.fragranceReviews;
  const [today, sinceLaunch] = await Promise.all([
    count(env, t.name, dateFilter(t.timestampCol, windows.today)),
    count(env, t.name, dateFilter(t.timestampCol, windows.sinceLaunch)),
  ]);
  return { today, sinceLaunch };
}

// Fragrance submissions (missing fragrance reports)
async function fetchSubmissions(env) {
  const t = TABLES.fragranceSubmissions;
  const [allTime, pending] = await Promise.all([
    count(env, t.name, []),
    count(env, t.name, [t.pendingFilter]),
  ]);
  return { allTime, pending };
}

// Content moderation queue
async function fetchContentReports(env) {
  const t = TABLES.contentReports;
  const [total, open] = await Promise.all([
    count(env, t.name, []),
    count(env, t.name, [t.pendingFilter]),
  ]);
  return { total, open };
}

// Pro mirror — profiles.is_pro
async function fetchProMirror(env) {
  // Founder-excluded like every other user metric. Audit 2026-08-10: the
  // digest reported "Pro subscribers (DB): 2" next to $0 RC / $0 Apple — one
  // row was the founder's own account, the other a day-one test grant. The
  // profiles table is keyed by `id` (not user_id), so NOT_FOUNDER doesn't
  // apply here.
  const total = await count(env, TABLES.profiles.name, [
    'is_pro=eq.true',
    `id=not.in.(${OWNER_USER_ID})`,
  ]);
  return { total };
}

// DNA picker events — committed sessions (since launch)
async function fetchDnaPickerEvents(env, windows) {
  const t = TABLES.dnaPickerEvents;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  // Count commit events, all events, and DISTINCT committing users.
  // commits counts events (a user can retake → multiple commits), so the
  // funnel must use distinct users to stay within the profile cohort.
  const [commits, allEvents, commitRows] = await Promise.all([
    count(env, t.name, [...sl, `${t.kindCol}=eq.commit`]),
    count(env, t.name, sl),
    getRows(env, t.name, [...sl, `${t.kindCol}=eq.commit`], 5000),
  ]);
  const committedUsers = new Set(commitRows.map((r) => r.user_id).filter(Boolean)).size;
  return { commits, allEvents, committedUsers };
}

// Catalog size
async function fetchCatalogSize(env) {
  const active = await count(env, TABLES.fragrances.name, ['is_active=eq.true']);
  const total = await count(env, TABLES.fragrances.name, []);
  return { active, total };
}

// Recent signups list (since launch only — pre-launch testers excluded)
async function fetchRecentSignups(env, { limit = 10, sinceIso = null } = {}) {
  const users = await fetchAuthUsers(env, { perPage: limit * 8 });
  const filtered = sinceIso
    ? users.filter((u) => u.created_at && u.created_at >= sinceIso)
    : users;
  const sorted = filtered
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
  return sorted.map((u) => {
    const provs = u.app_metadata?.providers || [];
    const provider = u.is_anonymous
      ? 'anonymous'
      : provs[0] || u.app_metadata?.provider || 'unknown';
    return {
      id: u.id,
      email: u.email || null,
      name: u.user_metadata?.full_name || null,
      provider,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
    };
  });
}

// Affiliate buy-link clicks — the durable, app-owned ledger (table
// affiliate_clicks). This REPLACES PostHog as the source of truth for click
// counts: PostHog got wiped 2026-07-03. Low volume, so fetch rows and roll up
// in JS. Owner (Bob) excluded here — see OWNER_USER_ID / NOT_FOUNDER above,
// which now apply that same exclusion to wardrobe, wear logs and swipes too
// (until the 2026-07-14 audit, this was the ONLY metric that stripped him).
async function fetchAffiliateClicks(env, windows) {
  const rows = await getRows(
    env,
    'affiliate_clicks',
    [`created_at=gte.${encodeURIComponent(windows.sinceLaunch.startIso)}`],
    2000,
  );
  const mine = rows.filter((r) => r.user_id !== OWNER_USER_ID);
  const todayStart = windows.today.startIso;
  const last7Start = windows.last7d.startIso;
  const byRetailer = {};
  const people = new Set();
  let today = 0;
  let last7d = 0;
  for (const r of mine) {
    byRetailer[r.retailer] = (byRetailer[r.retailer] || 0) + 1;
    if (r.user_id) people.add(r.user_id);
    if (r.created_at >= todayStart) today += 1;
    if (r.created_at >= last7Start) last7d += 1;
  }
  return {
    sinceLaunch: mine.length,
    people: people.size,
    today,
    last7d,
    byRetailer: Object.entries(byRetailer)
      .map(([retailer, clicks]) => ({ retailer, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
  };
}

// Convenience: pull every metric in one shot
async function fetchAll(env, windows) {
  // A genuine Supabase outage (count/getRows throw after per-request retries)
  // must surface as supa.error → the SUPABASE-FAILED banner, NOT as a silent
  // all-zeros dashboard. Catch here so the orchestrator gets {error} instead
  // of the withRetry fallback {} that would print confident zeros.
  try {
    const [
      signups, wardrobe, wearLogs, swipes, reviews,
      submissions, contentReports, proMirror, dnaPickerEvents,
      catalogSize, recentSignups, affiliateClicks,
    ] = await Promise.all([
      fetchSignups(env, windows),
      fetchWardrobe(env, windows),
      fetchWearLogs(env, windows),
      fetchSwipes(env, windows),
      fetchReviews(env, windows),
      fetchSubmissions(env),
      fetchContentReports(env),
      fetchProMirror(env),
      fetchDnaPickerEvents(env, windows),
      fetchCatalogSize(env),
      fetchRecentSignups(env, { limit: 10, sinceIso: windows.sinceLaunch.startIso }),
      fetchAffiliateClicks(env, windows).catch((e) => ({ error: e.message })),
    ]);
    return {
      signups, wardrobe, wearLogs, swipes, reviews,
      submissions, contentReports, proMirror, dnaPickerEvents,
      catalogSize, recentSignups, affiliateClicks,
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  loadEnv,
  count,
  fetchAuthUsers,
  fetchSignups,
  fetchWardrobe,
  fetchWearLogs,
  fetchSwipes,
  fetchReviews,
  fetchSubmissions,
  fetchContentReports,
  fetchProMirror,
  fetchDnaPickerEvents,
  fetchCatalogSize,
  fetchRecentSignups,
  fetchAll,
};
