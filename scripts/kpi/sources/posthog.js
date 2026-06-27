// posthog.js — PostHog HogQL queries for the Perfume Picks KPI dashboard.
//
// Event names come from ../schema.js EVENTS. PostHog is the source of
// truth for "what users did" (analytics events).

'use strict';

const { EVENTS, APP_NAMESPACE } = require('../schema');

function loadEnv() {
  return {
    key: process.env.POSTHOG_PERSONAL_API_KEY || '',
    project: process.env.POSTHOG_PROJECT_ID || '',
    host: (
      process.env.POSTHOG_HOST ||
      process.env.EXPO_PUBLIC_POSTHOG_HOST ||
      'https://us.posthog.com'
    ).replace(/\/$/, ''),
  };
}

function isConfigured(env) {
  return Boolean(env.key && env.project);
}

async function hogql(env, query) {
  const url = `${env.host}/api/projects/${env.project}/query/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostHog ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.results ?? [];
}

// HogQL date helpers
const TODAY = `toDate(now())`;
const YESTERDAY = `toDate(now()) - interval 1 day`;

// App namespace filter — ensures queries are scoped to Perfume Picks only
// in case the PostHog project is ever shared with other Picks apps.
const NS = `properties.$app_namespace = '${APP_NAMESPACE}'`;

// ── Activity (DAU/WAU/MAU) ────────────────────────────────────────────
async function fetchActivity(env) {
  const [dauToday, dauYest, wau, mau, dauByDay] = await Promise.all([
    hogql(env, `SELECT count(DISTINCT person_id) FROM events WHERE toDate(timestamp) = ${TODAY} AND ${NS}`),
    hogql(env, `SELECT count(DISTINCT person_id) FROM events WHERE toDate(timestamp) = ${YESTERDAY} AND ${NS}`),
    hogql(env, `SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - interval 7 day AND ${NS}`),
    hogql(env, `SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - interval 28 day AND ${NS}`),
    hogql(env, `
      SELECT toDate(timestamp) AS d, count(DISTINCT person_id) AS dau
      FROM events WHERE timestamp >= now() - interval 30 day AND ${NS}
      GROUP BY d ORDER BY d DESC LIMIT 30
    `),
  ]);
  return {
    dauToday: dauToday[0]?.[0] ?? 0,
    dauYesterday: dauYest[0]?.[0] ?? 0,
    wau: wau[0]?.[0] ?? 0,
    mau: mau[0]?.[0] ?? 0,
    dauByDay: dauByDay.map(([d, n]) => ({ date: String(d), dau: n })),
  };
}

// ── Top events today ──────────────────────────────────────────────────
async function fetchTopEvents(env, { limit = 10 } = {}) {
  const r = await hogql(env, `
    SELECT event, count() AS c
    FROM events
    WHERE toDate(timestamp) = ${TODAY} AND ${NS}
    GROUP BY event ORDER BY c DESC LIMIT ${limit}
  `);
  return r.map(([name, c]) => ({ name, count: c }));
}

// ── Funnel: Quiz ───────────────────────────────────────────────────────
async function fetchQuizFunnel(env) {
  const r = await hogql(env, `
    SELECT event, count() AS n, count(DISTINCT distinct_id) AS u
    FROM events
    WHERE ${NS}
      AND event IN ('${EVENTS.QUIZ_STARTED}', '${EVENTS.QUIZ_COMPLETED}', '${EVENTS.QUIZ_RESULT_VIEWED}')
    GROUP BY event
  `);
  const byEvent = Object.fromEntries(r.map(([e, n, u]) => [e, { events: n, users: u }]));
  const started = byEvent[EVENTS.QUIZ_STARTED] || { events: 0, users: 0 };
  const completed = byEvent[EVENTS.QUIZ_COMPLETED] || { events: 0, users: 0 };
  const resultViewed = byEvent[EVENTS.QUIZ_RESULT_VIEWED] || { events: 0, users: 0 };
  return {
    started, completed, resultViewed,
    completionPct: started.users > 0 ? completed.users / started.users : 0,
  };
}

// ── Funnel: Wardrobe (collection adds) ───────────────────────────────
async function fetchWardrobeFunnel(env) {
  const r = await hogql(env, `
    SELECT event, count() AS n, count(DISTINCT distinct_id) AS u
    FROM events
    WHERE ${NS}
      AND event IN (
        '${EVENTS.WARDROBE_ITEM_ADDED}',
        '${EVENTS.WARDROBE_ITEM_UPDATED}',
        '${EVENTS.WARDROBE_ITEM_REMOVED}',
        '${EVENTS.WARDROBE_CAP_HIT}'
      )
    GROUP BY event
  `);
  const byEvent = Object.fromEntries(r.map(([e, n, u]) => [e, { events: n, users: u }]));
  return {
    added:   byEvent[EVENTS.WARDROBE_ITEM_ADDED]   || { events: 0, users: 0 },
    updated: byEvent[EVENTS.WARDROBE_ITEM_UPDATED] || { events: 0, users: 0 },
    removed: byEvent[EVENTS.WARDROBE_ITEM_REMOVED] || { events: 0, users: 0 },
    capHit:  byEvent[EVENTS.WARDROBE_CAP_HIT]      || { events: 0, users: 0 },
  };
}

// ── Funnel: DNA reveal ────────────────────────────────────────────────
async function fetchDnaFunnel(env) {
  const r = await hogql(env, `
    SELECT event, count() AS n, count(DISTINCT distinct_id) AS u
    FROM events
    WHERE ${NS}
      AND event IN (
        '${EVENTS.DNA_REVEAL_VIEWED}',
        '${EVENTS.DNA_REVEAL_SHARED}',
        '${EVENTS.DNA_FIRST_REC_VIEWED}',
        '${EVENTS.DNA_FIRST_REC_REROLL}',
        '${EVENTS.DNA_SKIP_TO_APP}',
        '${EVENTS.DNA_CTA_TAPPED}',
        '${EVENTS.DNA_COMPUTE_FAILED}'
      )
    GROUP BY event
  `);
  const byEvent = Object.fromEntries(r.map(([e, n, u]) => [e, { events: n, users: u }]));
  const revealed    = byEvent[EVENTS.DNA_REVEAL_VIEWED]   || { events: 0, users: 0 };
  const shared      = byEvent[EVENTS.DNA_REVEAL_SHARED]   || { events: 0, users: 0 };
  const firstRec    = byEvent[EVENTS.DNA_FIRST_REC_VIEWED]|| { events: 0, users: 0 };
  const rerolled    = byEvent[EVENTS.DNA_FIRST_REC_REROLL]|| { events: 0, users: 0 };
  const skippedToApp= byEvent[EVENTS.DNA_SKIP_TO_APP]    || { events: 0, users: 0 };
  const ctaTapped   = byEvent[EVENTS.DNA_CTA_TAPPED]      || { events: 0, users: 0 };
  const failed      = byEvent[EVENTS.DNA_COMPUTE_FAILED]  || { events: 0, users: 0 };
  return {
    revealed, shared, firstRec, rerolled, skippedToApp, ctaTapped, failed,
    shareRate: revealed.users > 0 ? shared.users / revealed.users : 0,
  };
}

// ── Funnel: Monetization ──────────────────────────────────────────────
async function fetchMonetizationFunnel(env) {
  const r = await hogql(env, `
    SELECT event, count() AS n, count(DISTINCT distinct_id) AS u
    FROM events
    WHERE ${NS}
      AND event IN (
        '${EVENTS.PAYWALL_VIEWED}',
        '${EVENTS.PRO_PURCHASE_STARTED}',
        '${EVENTS.PRO_PURCHASE_COMPLETED}',
        '${EVENTS.PRO_PURCHASE_FAILED}'
      )
    GROUP BY event
  `);
  const byEvent = Object.fromEntries(r.map(([e, n, u]) => [e, { events: n, users: u }]));
  const viewed    = byEvent[EVENTS.PAYWALL_VIEWED]         || { events: 0, users: 0 };
  const started   = byEvent[EVENTS.PRO_PURCHASE_STARTED]   || { events: 0, users: 0 };
  const completed = byEvent[EVENTS.PRO_PURCHASE_COMPLETED] || { events: 0, users: 0 };
  const failed    = byEvent[EVENTS.PRO_PURCHASE_FAILED]    || { events: 0, users: 0 };
  return {
    viewed, started, completed, failed,
    viewToStartPct: viewed.users > 0 ? started.users / viewed.users : 0,
    startToCompletePct: started.users > 0 ? completed.users / started.users : 0,
  };
}

// ── Discovery events ──────────────────────────────────────────────────
async function fetchDiscovery(env) {
  const r = await hogql(env, `
    SELECT event, count() AS n, count(DISTINCT distinct_id) AS u
    FROM events
    WHERE ${NS}
      AND event IN (
        '${EVENTS.DISCOVER_SEARCH_QUERY}',
        '${EVENTS.DISCOVER_BRAND_OPENED}',
        '${EVENTS.DISCOVER_ACCORD_TAPPED}',
        '${EVENTS.FRAGRANCE_DETAIL_VIEWED}',
        '${EVENTS.AFFILIATE_OUTBOUND_CLICKED}'
      )
    GROUP BY event
  `);
  const byEvent = Object.fromEntries(r.map(([e, n, u]) => [e, { events: n, users: u }]));
  return {
    searches:        byEvent[EVENTS.DISCOVER_SEARCH_QUERY]     || { events: 0, users: 0 },
    brandOpens:      byEvent[EVENTS.DISCOVER_BRAND_OPENED]     || { events: 0, users: 0 },
    accordTaps:      byEvent[EVENTS.DISCOVER_ACCORD_TAPPED]    || { events: 0, users: 0 },
    detailViews:     byEvent[EVENTS.FRAGRANCE_DETAIL_VIEWED]   || { events: 0, users: 0 },
    affiliateClicks: byEvent[EVENTS.AFFILIATE_OUTBOUND_CLICKED]|| { events: 0, users: 0 },
  };
}

// ── Health alerts ─────────────────────────────────────────────────────
async function fetchHealthAlerts(env, supaSignups) {
  const alerts = [];

  // Signup check (pre-launch: warn if signups exist but app is in review,
  // they may be TestFlight beta users)
  if (supaSignups !== undefined) {
    const allTime = supaSignups?.allTime ?? 0;
    if (allTime > 0) {
      alerts.push({
        level: 'warn',
        code: 'PRE_LAUNCH_SIGNUPS',
        message: `${allTime} profile rows exist while app is in review — these are TestFlight beta users.`,
        value: allTime,
      });
    }
  }

  // Failure event check
  try {
    const rows = await hogql(env, `
      SELECT
        event,
        countIf(timestamp >= now() - interval 7 day) AS last7,
        countIf(timestamp >= now() - interval 14 day AND timestamp < now() - interval 7 day) AS prior7
      FROM events
      WHERE timestamp >= now() - interval 14 day
        AND ${NS}
        AND event IN (
          'sync_write_failed',
          'dna_compute_failed',
          'pro_purchase_failed',
          'affiliate_link_failed',
          'feedback_failed'
        )
      GROUP BY event
      HAVING last7 > 0
      ORDER BY last7 DESC
    `);

    for (const [event, last7, prior7] of rows) {
      const spiked = prior7 === 0 ? last7 > 0 : (last7 / prior7) > 2;
      if (spiked || last7 >= 3) {
        alerts.push({
          level: last7 >= 5 ? 'error' : 'warn',
          code: 'FAILURE_SPIKE',
          message: `${event}: ${last7} in last 7d${prior7 > 0 ? ` (${prior7} prior 7d)` : ' (new)'}`,
          value: last7,
        });
      }
    }
  } catch (e) {
    alerts.push({ level: 'warn', code: 'HEALTH_QUERY_FAILED', message: `Could not fetch failure events: ${e.message}`, value: null });
  }

  return alerts;
}

async function fetchAll(env) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error: 'POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing — set these env vars to enable PostHog metrics',
    };
  }
  try {
    const [activity, topEvents, quiz, wardrobe, dna, monetization, discovery] = await Promise.all([
      fetchActivity(env),
      fetchTopEvents(env, { limit: 10 }),
      fetchQuizFunnel(env),
      fetchWardrobeFunnel(env),
      fetchDnaFunnel(env),
      fetchMonetizationFunnel(env),
      fetchDiscovery(env),
    ]);
    return {
      configured: true,
      activity, topEvents, quiz, wardrobe, dna, monetization, discovery,
    };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}

module.exports = {
  loadEnv,
  isConfigured,
  hogql,
  fetchActivity,
  fetchTopEvents,
  fetchQuizFunnel,
  fetchWardrobeFunnel,
  fetchDnaFunnel,
  fetchMonetizationFunnel,
  fetchDiscovery,
  fetchHealthAlerts,
  fetchAll,
};
