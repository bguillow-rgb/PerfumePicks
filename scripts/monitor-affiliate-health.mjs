/**
 * Affiliate health monitor — "so we always know it's working."
 *
 * The checkout-2.0 monitor (monitor-checkout-attribution.mjs) answers ONE narrow
 * question: does the cart-permalink flow still post a Perfumania commission?
 * This one is the broad, standing health check across EVERY affiliate network we
 * run, and it fires a POSITIVE heartbeat — so silence is never ambiguous.
 *
 * Networks (fragrance_retailer_links.retailer → network):
 *   CJ   : perfumania (advertiser 17277211), fragranceshop (16941446)  — site 101759456
 *   Awin : aromapassions (advertiser 34989)                            — publisher 2931103
 *
 * Three signals, none of which hammers a wrapper URL (a wrapper hit bills a
 * phantom click and hurts standing — see validate-retailer-links.ts):
 *
 *   1. LINK HEALTH   — reads link_status already written by the validator.
 *      Alerts if a network's dead-link ratio jumps (ETL broke / retailer
 *      re-slugged its catalog). Baseline stored in the state file; a >10pt jump
 *      or crossing 40% dead pages the founder.
 *   2. COMMISSIONS   — CJ Commission Detail API (our site only) + Awin Publisher
 *      API. A NEW posted commission on ANY network is good news → alert once
 *      ("it's working"). Awin is skipped gracefully until AWIN_API_TOKEN is set.
 *   3. CONVERSION    — affiliate_clicks ledger per network vs commissions. Pure
 *      readout in the heartbeat; the leak alarm lives in the checkout monitor.
 *
 * Heartbeat: at most once every 7 days, an "all green" summary so the founder
 * has a recurring positive confirmation, not alarm-only silence.
 *
 * Env (.env.local):  CJ_PERSONAL_ACCESS_TOKEN, SUPABASE_*  (required)
 *                    AWIN_API_TOKEN, AWIN_PUBLISHER_ID      (optional — unlocks Awin)
 *
 * Run manually:  node scripts/monitor-affiliate-health.mjs
 *                node scripts/monitor-affiliate-health.mjs --heartbeat   # force the summary text
 * Scheduled:     ~/Library/LaunchAgents/com.perfumepicks.affiliate-health.plist (every 12h)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PHONE = '+17165109313';
const STATE_FILE = path.join(os.homedir(), 'Library/Logs/perfume-affiliate-health.state.json');
const FORCE_HEARTBEAT = process.argv.includes('--heartbeat');

// network topology
const OUR_CJ_SITE = '101759456';                 // NOT the account id — see reference memory
const CJ_ADVERTISERS = { '17277211': 'perfumania', '16941446': 'fragranceshop' };
const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '2931103';
const NETWORK_OF = { perfumania: 'CJ', fragranceshop: 'CJ', aromapassions: 'Awin' };

// health thresholds
const DEAD_RATIO_CEILING = 0.40;   // absolute: >40% dead links on a network is a red flag
const DEAD_RATIO_JUMP = 0.10;      // relative: +10pt vs last run means something just broke
const HEARTBEAT_EVERY_MS = 7 * 864e5;

const CJ_TOKEN = process.env.CJ_PERSONAL_ACCESS_TOKEN;
const AWIN_TOKEN = process.env.AWIN_API_TOKEN;
const SB_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CJ_TOKEN || !SB_URL || !SB_KEY) {
  console.error('missing CJ_PERSONAL_ACCESS_TOKEN / SUPABASE env');
  process.exit(1);
}

const state = (() => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
})();
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

function imessage(text) {
  try {
    execFileSync('osascript', ['-'], {
      input: `on run\ntell application "Messages"\nset s to 1st service whose service type = iMessage\nsend ${JSON.stringify(text)} to buddy ${JSON.stringify(PHONE)} of s\nend tell\nend run`,
    });
    console.log('[imessage sent]', text.slice(0, 80));
  } catch (e) {
    console.error('[imessage] send failed:', e.message);
  }
}

const sb = async (qs) => {
  const r = await fetch(`${SB_URL}/rest/v1/${qs}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
};

// ── 1. LINK HEALTH (reads validator output — zero phantom clicks) ─────────────
async function linkHealth() {
  const rows = await sb('fragrance_retailer_links?select=retailer,link_status');
  const byNet = {}; // network → {total, dead}
  for (const r of rows) {
    const net = NETWORK_OF[r.retailer] || 'other';
    (byNet[net] ??= { total: 0, dead: 0 });
    byNet[net].total++;
    if (r.link_status === 'dead') byNet[net].dead++;
  }
  for (const n of Object.values(byNet)) n.ratio = n.total ? n.dead / n.total : 0;
  return byNet;
}

// ── 2a. CJ commissions (our site only) ────────────────────────────────────────
async function cjCommissions() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const before = new Date(Date.now() + 864e5).toISOString();
  const q = `{ publisherCommissions(forPublishers:["7966973"], sincePostingDate:"${since}", beforePostingDate:"${before}") {
    records { orderId postingDate advertiserName saleAmountUsd pubCommissionAmountUsd actionStatus websiteId } } }`;
  const r = await fetch('https://commissions.api.cj.com/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CJ_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  const all = j.data?.publisherCommissions?.records ?? [];
  return all.filter((c) => String(c.websiteId) === OUR_CJ_SITE); // exclude Percolate's site
}

// ── 2b. Awin commissions (optional — needs a Publisher API token) ─────────────
async function awinCommissions() {
  if (!AWIN_TOKEN) return { configured: false, records: [] };
  const startDate = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19);
  const endDate = new Date().toISOString().slice(0, 19);
  const u = `https://api.awin.com/publishers/${AWIN_PUBLISHER_ID}/transactions/?startDate=${startDate}&endDate=${endDate}&timezone=UTC&dateType=transaction`;
  try {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${AWIN_TOKEN}` } });
    if (!r.ok) return { configured: true, error: `HTTP ${r.status}`, records: [] };
    const j = await r.json();
    return { configured: true, records: Array.isArray(j) ? j : [] };
  } catch (e) {
    return { configured: true, error: e.message, records: [] };
  }
}

// ── 3. Conversion readout (clicks per network, 30d) ───────────────────────────
async function clicks30d() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const rows = await sb(`affiliate_clicks?select=network,retailer&created_at=gte.${since}`);
  const byNet = {};
  for (const r of rows) byNet[r.network || 'null'] = (byNet[r.network || 'null'] || 0) + 1;
  return { total: rows.length, byNet };
}

// ── run ───────────────────────────────────────────────────────────────────────
const health = await linkHealth();
const cj = await cjCommissions();
const awin = await awinCommissions();
const clk = await clicks30d();
const now = Date.now();

console.log(`[affiliate-health] ${new Date().toISOString()}`);
for (const [net, h] of Object.entries(health)) {
  console.log(`  ${net}: ${h.total} links, ${h.dead} dead (${(h.ratio * 100).toFixed(1)}%)`);
}
console.log(`  CJ commissions (our site, 30d): ${cj.length}`);
console.log(`  Awin: ${awin.configured ? (awin.error ? 'ERROR ' + awin.error : awin.records.length + ' txns') : 'not configured (no AWIN_API_TOKEN)'}`);
console.log(`  clicks 30d: ${clk.total} ${JSON.stringify(clk.byNet)}`);

// ── ALERT: link-health degradation ────────────────────────────────────────────
state.deadRatio ??= {};
for (const [net, h] of Object.entries(health)) {
  if (net === 'other') continue;
  const prev = state.deadRatio[net];
  const jumped = prev != null && h.ratio - prev >= DEAD_RATIO_JUMP;
  const overCeiling = h.ratio >= DEAD_RATIO_CEILING;
  const alertKey = `deadAlert_${net}`;
  if ((jumped || overCeiling) && !state[alertKey]) {
    imessage(
      `⚠️ Affiliate link health — ${net}: ${(h.ratio * 100).toFixed(0)}% of links now dead (${h.dead}/${h.total})` +
      (jumped ? `, up from ${(prev * 100).toFixed(0)}% last check` : '') +
      `. Likely an ETL break or the retailer re-slugged its catalog. Re-run validate-retailer-links + the ${net} ETL.`,
    );
    state[alertKey] = true;
  } else if (!jumped && !overCeiling) {
    state[alertKey] = false; // recovered → re-arm
  }
  state.deadRatio[net] = h.ratio;
}

// ── ALERT: a new commission posted anywhere (good news) ───────────────────────
const cjKey = (c) => `cj_${c.orderId}`;
const awinKey = (t) => `awin_${t.id || t.transactionId}`;
state.seenCommissions ??= [];
const seen = new Set(state.seenCommissions);
const freshCj = cj.filter((c) => !seen.has(cjKey(c)));
const freshAwin = (awin.records || []).filter((t) => !seen.has(awinKey(t)));
if (freshCj.length || freshAwin.length) {
  const lines = [
    ...freshCj.map((c) => `CJ/${c.advertiserName}: order ${c.orderId}, sale $${c.saleAmountUsd}, commission $${c.pubCommissionAmountUsd} (${c.actionStatus})`),
    ...freshAwin.map((t) => `Awin/${t.advertiserId}: sale $${t.saleAmount ?? t.amount}, commission $${t.commissionAmount}`),
  ];
  imessage(`✅ Affiliate commission posted — it's working:\n${lines.join('\n')}`);
  [...freshCj.map(cjKey), ...freshAwin.map(awinKey)].forEach((k) => seen.add(k));
  state.seenCommissions = [...seen];
}

// ── HEARTBEAT: weekly positive confirmation ───────────────────────────────────
const dueForHeartbeat = FORCE_HEARTBEAT || !state.lastHeartbeat || now - state.lastHeartbeat >= HEARTBEAT_EVERY_MS;
if (dueForHeartbeat) {
  const healthLine = Object.entries(health)
    .filter(([n]) => n !== 'other')
    .map(([n, h]) => `${n} ${((1 - h.ratio) * 100).toFixed(0)}% live`)
    .join(' · ');
  const commTotal = cj.length + (awin.records?.length || 0);
  const awinLine = awin.configured
    ? (awin.error ? `Awin API error (${awin.error})` : `Awin ${awin.records.length} txns`)
    : 'Awin not yet wired (add AWIN_API_TOKEN)';
  imessage(
    `📊 Affiliate weekly heartbeat — links: ${healthLine}. ` +
    `Clicks 30d: ${clk.total}. Commissions 30d: CJ ${cj.length} · ${awinLine}. ` +
    (commTotal === 0 ? 'Tracking verified healthy; no sales converted yet.' : 'Money is landing.'),
  );
  state.lastHeartbeat = now;
}

saveState();
