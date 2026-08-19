#!/usr/bin/env node
/**
 * monitor-fuzzy-search.mjs — Perfume Picks fuzzy-search health monitor.
 *
 * Runs every 30 minutes via launchd / scheduled-tasks. Guards the typo-tolerant
 * DNA-picker search (the `fuzzy_fragrance_search` RPC, migration 202607180900),
 * whose failure is an ACTIVATION LEAK: people seed their DNA by searching bottles
 * they own, and a single-letter typo ("opim" for Opium) that used to return zero
 * is exactly what the fuzzy fallback fixes. If the RPC silently breaks, those
 * searches go dark again and nobody sees an error.
 *
 * Why a synthetic canary instead of Pour Picks' telemetry approach:
 *   Perfume search volume is low and bursty — most 2-hour windows see zero
 *   searches — and `search_no_results` conflates "the catalog genuinely lacks
 *   this bottle" (unavoidable) with "the RPC broke" (what we watch). A telemetry
 *   rate on a handful of events would false-alarm on tiny samples (the same trap
 *   that fired a false alarm on Pour on 2026-07-11) or never fire at all. So the
 *   PRIMARY check actively probes the RPC over the anon REST path the app uses,
 *   with typos that CANNOT match via plain substring — every probe exercises the
 *   whole pipeline (pg_trgm index + pp_normalize + the function). Volume-
 *   independent, and immune to catalog-gap noise.
 *
 * Two checks:
 *   1. CANARY (primary) — call the RPC with known typos; each must resolve to the
 *      expected fragrance. Any HTTP error, timeout, zero-rows, or wrong-bottle
 *      result means the fuzzy pipeline is broken. Alerts.
 *   2. TELEMETRY BACKSTOP (secondary) — over the last 24h, if there are enough
 *      terminal search outcomes AND the no_results rate is far above the ~54%
 *      baseline, flag a possible real-world regression the canary missed.
 *      Deliberately conservative; usually there isn't enough volume to fire.
 *
 * Alerts via iMessage. Silent when everything is healthy (exit 0, no output).
 *
 * Run manually: node scripts/monitor-fuzzy-search.mjs
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_DIR = '/Users/bobguillow/PerfumePicks';
const ENV_FILE = resolve(PROJECT_DIR, '.env.local');
const PHONE = '+17165109313';
const HTTP_TIMEOUT_MS = 8000;

// ── Canary probes ───────────────────────────────────────────────────────────
// Each `q` is a typo that plain ILIKE cannot resolve — matching it REQUIRES the
// trigram machinery — and `expect` is a lowercase substring the correct bottle's
// name must contain. Verified against the live catalog 2026-07-23. If the catalog
// drops a probed bottle, that probe will legitimately fail; update the list here
// rather than lowering the bar (a probe that no longer resolves is telling you
// something real about the catalog).
const PROBES = [
  { q: 'opim', expect: 'opium' },            // dropped letter, Opium (YSL)
  { q: 'love dont be shy', expect: 'shy' },  // apostrophe→space normalization, Kilian
  { q: 'sauvag', expect: 'sauvage' },        // dropped letter, Sauvage (Dior)
  { q: 'aventis', expect: 'aventus' },       // substituted letter, Aventus (Creed)
];

// ── Telemetry backstop thresholds ───────────────────────────────────────────
const TELEMETRY_WINDOW_HOURS = 24;
// Baseline no_results rate is ~54% (14d, 2026-07). Only flag a sustained, clearly
// abnormal rate on a meaningful sample — 85% clears every historical day.
const NO_RESULTS_RATE_THRESHOLD = 0.85;
const MIN_TERMINAL_OUTCOMES = 15; // (no_results + picked) needed before we judge a rate

// ── Load env ────────────────────────────────────────────────────────────────
if (!existsSync(ENV_FILE)) {
  process.exit(0); // nothing to do during initial setup
}

const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const SB_URL = (env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SB_URL || !SB_ANON) {
  process.exit(0); // Supabase not configured — nothing to probe
}

const PH_KEY = env.POSTHOG_PERSONAL_API_KEY || '';
const PH_PROJECT = env.POSTHOG_PROJECT_ID || '';
const PH_HOST = (env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');

// ── HTTP helpers ────────────────────────────────────────────────────────────
function timeout() {
  return AbortSignal.timeout(HTTP_TIMEOUT_MS);
}

async function callRpc(q) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/fuzzy_fragrance_search`, {
    method: 'POST',
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${SB_ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q, lim: 5, min_sim: 0.3 }),
    signal: timeout(),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`RPC returned non-array: ${JSON.stringify(rows).slice(0, 120)}`);
  return rows;
}

async function fetchNames(ids) {
  if (ids.length === 0) return [];
  const list = ids.map((id) => `"${id}"`).join(',');
  const res = await fetch(
    `${SB_URL}/rest/v1/fragrances?id=in.(${list})&select=name`,
    { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` }, signal: timeout() },
  );
  if (!res.ok) throw new Error(`names HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r) => String(r.name ?? '')) : [];
}

async function hogql(query) {
  const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PH_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    signal: timeout(),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).results ?? [];
}

// ── iMessage alert ──────────────────────────────────────────────────────────
function sendAlert(message) {
  const script = `
on run argv
  set msg to item 1 of argv
  set phone to item 2 of argv
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy phone of targetService
    send msg to targetBuddy
  end tell
end run`;
  try {
    execSync('open -a Messages', { stdio: 'ignore' });
    execSync(`osascript - ${JSON.stringify(message)} ${JSON.stringify(PHONE)}`, {
      input: script,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  } catch (e) {
    process.stderr.write(`[monitor-fuzzy-search] iMessage send failed: ${e.message}\n`);
  }
}

// ── Check 1: synthetic canary ───────────────────────────────────────────────
async function runCanary() {
  const failures = [];
  for (const { q, expect } of PROBES) {
    try {
      const rows = await callRpc(q);
      if (rows.length === 0) {
        failures.push(`"${q}" → 0 rows (expected a match containing "${expect}")`);
        continue;
      }
      const names = await fetchNames(rows.map((r) => r.id).filter(Boolean));
      const hit = names.some((n) => n.toLowerCase().includes(expect));
      if (!hit) {
        failures.push(`"${q}" → wrong bottle(s) [${names.join(', ') || 'none'}], expected "${expect}"`);
      }
    } catch (e) {
      failures.push(`"${q}" → ${e.message}`);
    }
  }
  return failures;
}

// ── Check 2: telemetry backstop ─────────────────────────────────────────────
async function runTelemetryBackstop() {
  if (!PH_KEY || !PH_PROJECT) return null; // PostHog not configured — skip silently
  const rows = await hogql(`
    SELECT
      countIf(event = 'search_no_results')   AS no_results,
      countIf(event = 'search_result_picked') AS picked
    FROM events
    WHERE timestamp > now() - interval ${TELEMETRY_WINDOW_HOURS} hour
  `);
  const noResults = Number(rows[0]?.[0] ?? 0);
  const picked = Number(rows[0]?.[1] ?? 0);
  const total = noResults + picked;
  if (total < MIN_TERMINAL_OUTCOMES) return null; // not enough signal to judge
  const rate = noResults / total;
  if (rate < NO_RESULTS_RATE_THRESHOLD) return null;
  return { noResults, picked, total, rate };
}

// ── Main ────────────────────────────────────────────────────────────────────
try {
  const alerts = [];

  const canaryFailures = await runCanary();
  if (canaryFailures.length > 0) {
    const scope =
      canaryFailures.length === PROBES.length
        ? 'ALL probes failed — fuzzy_fragrance_search RPC is DOWN'
        : `${canaryFailures.length}/${PROBES.length} probes failed`;
    alerts.push(
      `🚨 Fuzzy search canary: ${scope}\n` +
        canaryFailures.map((f) => `  • ${f}`).join('\n') +
        `\nDNA-picker typo search is silently failing. Check the fuzzy_fragrance_search RPC + pg_trgm index (Supabase SQL editor). If a probe drifted with the catalog, update PROBES in the monitor.`,
    );
  }

  // Only bother with the backstop if PostHog is wired.
  let backstop = null;
  try {
    backstop = await runTelemetryBackstop();
  } catch (e) {
    process.stderr.write(`[monitor-fuzzy-search] telemetry backstop error (non-fatal): ${e.message}\n`);
  }
  if (backstop) {
    alerts.push(
      `⚠️ Sustained no-results rate: ${(backstop.rate * 100).toFixed(0)}% of ${backstop.total} DNA-picker searches found nothing in the last ${TELEMETRY_WINDOW_HOURS}h (baseline ~54%).\n` +
        `Canary may still be green — could be a real-query regression (min_sim too high?) or a burst of genuine catalog gaps. Check recent search_no_results queries in PostHog.`,
    );
  }

  if (alerts.length === 0) {
    process.exit(0); // healthy — silent
  }

  const now = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
  const msg = [`Perfume Picks — fuzzy-search monitor (${now} ET)`, '', ...alerts].join('\n');

  sendAlert(msg);
  process.stdout.write(`[monitor-fuzzy-search] Alert sent:\n${msg}\n`);
} catch (e) {
  process.stderr.write(`[monitor-fuzzy-search] Error: ${e.message}\n`);
  process.exit(1);
}
