#!/usr/bin/env node
// kpi-dashboard.js — Perfume Picks KPI dashboard.
//
// Usage:
//   node scripts/kpi-dashboard.js            # markdown (default)
//   node scripts/kpi-dashboard.js --ceo      # CEO format (recommended)
//   node scripts/kpi-dashboard.js --json     # machine-readable JSON
//
// Env vars (read from .env.local):
//   Required: EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   Optional: REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY
//             POSTHOG_PROJECT_ID + POSTHOG_PERSONAL_API_KEY
//             SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_ID
//   ASC creds: loaded from this file's .env.local OR Pour Picks .env.local
//              (same developer account — shared key)

'use strict';

const fs = require('fs');
const path = require('path');

// ── Load .env.local ────────────────────────────────────────────────────
(function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue; // shell wins
    const v = vRaw.replace(/^['"]|['"]$/g, '');
    process.env[k] = v;
  }
})();

const { standardWindows } = require('./kpi/windows');
const supabaseSource = require('./kpi/sources/supabase');
const posthogSource = require('./kpi/sources/posthog');
const activeUsersSource = require('./kpi/sources/active-users');
const rcSource = require('./kpi/sources/revenuecat');
const sentrySource = require('./kpi/sources/sentry');
const ascSource = require('./kpi/sources/app-store-connect');
const asaSource = require('./kpi/sources/apple-search-ads');
const cjSource = require('./kpi/sources/cj');
const drAdSpend = require('./kpi/dr-ad-spend');
const ceoFmt = require('./kpi/formatters/ceo');

function pickFormat(argv) {
  if (argv.includes('--json')) return 'json';
  if (argv.includes('--ceo')) return 'ceo';
  return 'ceo'; // default to CEO format (most useful for a pre-launch app)
}

async function main() {
  const format = pickFormat(process.argv.slice(2));
  const now = new Date();
  const windows = standardWindows(now);

  // ── Load env for every source ─────────────────────────────────────
  const envs = {
    supabase: supabaseSource.loadEnv(),
    posthog: posthogSource.loadEnv(),
    rc: rcSource.loadEnv(),
    sentry: sentrySource.loadEnv(),
    asc: ascSource.loadEnv(),
    asa: asaSource.loadEnv(),
    cj: cjSource.loadEnv(),
  };

  if (!envs.supabase.url || !envs.supabase.key) {
    process.stderr.write('[kpi-dashboard] FATAL: SUPABASE_URL or key missing. Cannot run.\n');
    process.exit(1);
  }

  // ── Retry helper ──────────────────────────────────────────────────
  async function withRetry(fn, fallback, maxAttempts = 3, baseDelayMs = 3000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (attempt === maxAttempts) return { ...fallback, error: e.message };
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }

  // ── Pull every source in parallel ────────────────────────────────
  const [supa, posthog, rc, sentry, asc, asa, cj] = await Promise.all([
    withRetry(() => supabaseSource.fetchAll(envs.supabase, windows), {}),
    withRetry(() => posthogSource.fetchAll(envs.posthog), { configured: true }),
    withRetry(() => rcSource.fetchOverview(envs.rc), { configured: true }),
    withRetry(() => sentrySource.fetchAll(envs.sentry), { configured: true }),
    withRetry(() => ascSource.fetchAll(envs.asc), { configured: true }),
    withRetry(() => asaSource.fetchAll(envs.asa), { mode: 'snapshot' }),
    withRetry(() => cjSource.fetchAll(envs.cj), { configured: true }),
  ]);

  // ── Active users — honest DAU (signed-in humans + guest visits) ────
  const activeUsers = posthogSource.isConfigured(envs.posthog)
    ? await activeUsersSource.fetchActiveUsers(envs.posthog, { days: 30 }).catch((e) => ({ error: e.message }))
    : { error: 'PostHog not configured' };

  // ── DR AD SPEND read on the Apple Search Ads account ───────────────
  const adSpend = drAdSpend.build(asa);

  // ── Health alerts (after supa resolves so signup counts are available) ──
  const healthAlerts = posthogSource.isConfigured(envs.posthog)
    ? await posthogSource.fetchHealthAlerts(envs.posthog, supa?.signups).catch((e) => [
        { level: 'warn', code: 'HEALTH_FETCH_ERROR', message: e.message, value: null },
      ])
    : [];

  // ── Source list footer ────────────────────────────────────────────
  const sources = [];
  if (supa && !supa.error) sources.push('Supabase');
  if (posthog?.configured && !posthog.error) sources.push('PostHog');
  if (rc?.configured && !rc.error) sources.push('RevenueCat');
  if (sentry?.configured && !sentry.error) sources.push('Sentry');
  if (asc?.configured && !asc.error) sources.push('App Store Connect');
  if (adSpend?.ok) sources.push(`Apple Search Ads (${adSpend.mode})`);
  if (cj?.configured && !cj.error) sources.push('CJ Affiliate');

  const data = { supa, posthog, activeUsers, rc, sentry, asc, asa, cj, adSpend, healthAlerts, sources, now };

  let output;
  if (format === 'json') {
    output = JSON.stringify(data, null, 2);
  } else {
    output = ceoFmt.render(data);
  }

  process.stdout.write(output + '\n');
}

main().catch((e) => {
  process.stderr.write(`[kpi-dashboard] FATAL: ${e.stack || e.message}\n`);
  process.exit(1);
});
