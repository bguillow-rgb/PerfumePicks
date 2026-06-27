// sentry.js — Sentry events-stats + Release Health for Perfume Picks.
//
// Requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_ID.
// Gracefully skips if not configured.

'use strict';

function loadEnv() {
  return {
    token: process.env.SENTRY_AUTH_TOKEN || '',
    org: process.env.SENTRY_ORG || '',
    project: process.env.SENTRY_PROJECT || '',
    projectId: process.env.SENTRY_PROJECT_ID || '',
  };
}

function isConfigured(env) {
  return Boolean(env.token && env.org && env.projectId);
}

async function fetchUniqueIssues24h(env) {
  const url = `https://sentry.io/api/0/organizations/${env.org}/events-stats/?project=${encodeURIComponent(env.projectId)}&statsPeriod=24h&interval=1h&yAxis=count_unique%28issue%29&query=event.type%3Aerror`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    if (!res.ok) return { error: `${res.status}` };
    const json = await res.json();
    const total = (json.data ?? []).reduce(
      (sum, [, bucket]) => sum + (bucket?.[0]?.count ?? 0),
      0
    );
    return { uniqueIssues24h: total };
  } catch (e) {
    return { error: e.message ?? 'fetch failed' };
  }
}

async function fetchReleaseHealth(env) {
  if (!env.project) {
    return { error: 'SENTRY_PROJECT slug required for release health' };
  }
  const url = `https://sentry.io/api/0/organizations/${env.org}/sessions/?project=${encodeURIComponent(env.projectId)}&statsPeriod=24h&interval=1d&field=crash_free_rate%28session%29&field=crash_free_rate%28user%29`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.token}` },
    });
    if (!res.ok) {
      return { error: `${res.status} (release health may not be enabled)` };
    }
    const json = await res.json();
    const totals = json.groups?.[0]?.totals || {};
    return {
      crashFreeSessionsPct: totals['crash_free_rate(session)'] ?? null,
      crashFreeUsersPct: totals['crash_free_rate(user)'] ?? null,
    };
  } catch (e) {
    return { error: e.message ?? 'fetch failed' };
  }
}

async function fetchAll(env) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error: 'SENTRY_AUTH_TOKEN, SENTRY_ORG, or SENTRY_PROJECT_ID missing — add to .env.local to enable Sentry metrics',
    };
  }
  const [issues, health] = await Promise.all([
    fetchUniqueIssues24h(env),
    fetchReleaseHealth(env),
  ]);
  return { configured: true, ...issues, ...health };
}

module.exports = { loadEnv, isConfigured, fetchUniqueIssues24h, fetchReleaseHealth, fetchAll };
