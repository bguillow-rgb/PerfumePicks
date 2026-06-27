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

// HEAD with Prefer: count=exact — cheapest way to count rows.
async function count(env, table, filterParts = []) {
  const filter = filterParts.filter(Boolean).join('&');
  const url = `${env.url}/rest/v1/${table}?select=id${filter ? `&${filter}` : ''}&limit=0`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const cr = res.headers.get('content-range') || '';
  const total = parseInt(cr.split('/')[1] || '0', 10);
  return Number.isNaN(total) ? 0 : total;
}

async function getRows(env, table, filterParts = [], limit = 10) {
  const filter = filterParts.filter(Boolean).join('&');
  const url = `${env.url}/rest/v1/${table}?select=*${filter ? `&${filter}` : ''}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
    },
  });
  if (!res.ok) return [];
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
async function fetchWardrobe(env, windows) {
  const t = TABLES.wardrobeItems;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  const [
    today, yesterday, sinceLaunchTotal,
    haveToday, wantToday, testedToday,
    haveSinceLaunch, wantSinceLaunch, testedSinceLaunch,
  ] = await Promise.all([
    count(env, t.name, dateFilter(t.timestampCol, windows.today)),
    count(env, t.name, dateFilter(t.timestampCol, windows.yesterday)),
    count(env, t.name, sl),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.have`]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.want`]),
    count(env, t.name, [...dateFilter(t.timestampCol, windows.today), `${t.statusCol}=eq.tested`]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.have`]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.want`]),
    count(env, t.name, [...sl, `${t.statusCol}=eq.tested`]),
  ]);
  return {
    today: { total: today, have: haveToday, want: wantToday, tested: testedToday },
    yesterday: { total: yesterday },
    sinceLaunch: { total: sinceLaunchTotal, have: haveSinceLaunch, want: wantSinceLaunch, tested: testedSinceLaunch },
  };
}

// Wear logs — the journal / SOTD feature
async function fetchWearLogs(env, windows) {
  const t = TABLES.wearLogs;
  const [today, yesterday, last7d, sinceLaunch] = await Promise.all([
    count(env, t.name, dateFilter(t.timestampCol, windows.today)),
    count(env, t.name, dateFilter(t.timestampCol, windows.yesterday)),
    count(env, t.name, dateFilter(t.timestampCol, windows.last7d)),
    count(env, t.name, dateFilter(t.timestampCol, windows.sinceLaunch)),
  ]);
  return { today, yesterday, last7d, sinceLaunch };
}

// Swipe feedback — Train My Nose
async function fetchSwipes(env, windows) {
  const t = TABLES.swipeFeedback;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  const [today, yesterday, sinceLaunch, likeSinceLaunch, dislikeSinceLaunch] = await Promise.all([
    count(env, t.name, dateFilter(t.timestampCol, windows.today)),
    count(env, t.name, dateFilter(t.timestampCol, windows.yesterday)),
    count(env, t.name, sl),
    count(env, t.name, [...sl, `${t.actionCol}=eq.like`]),
    count(env, t.name, [...sl, `${t.actionCol}=eq.dislike`]),
  ]);
  return { today, yesterday, sinceLaunch, likeSinceLaunch, dislikeSinceLaunch };
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
  const total = await count(env, TABLES.profiles.name, ['is_pro=eq.true']);
  return { total };
}

// DNA picker events — committed sessions (since launch)
async function fetchDnaPickerEvents(env, windows) {
  const t = TABLES.dnaPickerEvents;
  const sl = dateFilter(t.timestampCol, windows.sinceLaunch);
  // Count unique sessions (proxy: rows where kind='commit')
  const [commits, allEvents] = await Promise.all([
    count(env, t.name, [...sl, `${t.kindCol}=eq.commit`]),
    count(env, t.name, sl),
  ]);
  return { commits, allEvents };
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

// Convenience: pull every metric in one shot
async function fetchAll(env, windows) {
  const [
    signups, wardrobe, wearLogs, swipes, reviews,
    submissions, contentReports, proMirror, dnaPickerEvents,
    catalogSize, recentSignups,
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
  ]);
  return {
    signups, wardrobe, wearLogs, swipes, reviews,
    submissions, contentReports, proMirror, dnaPickerEvents,
    catalogSize, recentSignups,
  };
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
