/**
 * Timberline Ventures — unified affiliate commission monitor.
 *
 * ONE CJ publisher account (7966973) and ONE Awin publisher account (2931103)
 * back every property. Both APIs return the whole account, so a commission is
 * attributed to a property by its CJ website-ID (PID) or Awin advertiser-ID.
 * This is the single source of "who earned what" across Perfume, Percolate, ITIN.
 *
 * Self-healing: any commission whose site/advertiser is NOT in the map below
 * lands in an UNMAPPED bucket and pages the founder with the exact ID to add —
 * so a new program (e.g. ITIN's CJ links, once live) can never be silently
 * misattributed or missed. Add the ID to PROPERTIES and the alert clears.
 *
 * Map from production links, Awin publisherUrl, and CJ Account → Promotional
 * Properties (7 active PIDs, verified 2026-07-22):
 *   Perfume Picks : CJ 101759456 (perfumania 17277211, fragranceshop 16941446); Awin 34989 (aromapassions)
 *   Percolate     : CJ 101804271 (Peet's 15735914, Fresh Roasted 15734720, …); Awin 81871/122368/35221/90529/59193/124374
 *   ITIN          : CJ 101772772 (Lending), 101772770 (Credit Card), 101772773 (Credit Score); Awin 66532 (Credit Karma)
 *   Pour Picks    : CJ 101804278; Awin n/a
 *   Under Dial    : CJ 101804275; Awin n/a
 * ITIN's CJ sites are provisioned but its live CTAs currently route to Awin +
 * lead forms, so no CJ commissions yet. Any commission from an unmapped
 * site/advertiser still fires the UNMAPPED alert with the exact ID to add.
 *
 * Env (~/PerfumePicks/.env.local — both tokens are org-wide, not perfume-only):
 *   CJ_PERSONAL_ACCESS_TOKEN   (required)
 *   AWIN_API_TOKEN             (required for the Awin half; skips gracefully if absent)
 *
 * Run:        node scripts/monitor-commissions-timberline.mjs
 *             node scripts/monitor-commissions-timberline.mjs --heartbeat   # force summary
 * Scheduled:  ~/Library/LaunchAgents/com.timberline.commissions.plist (every 6h)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PHONE = '+17165109313';
const STATE_FILE = path.join(os.homedir(), 'Library/Logs/timberline-commissions.state.json');
const FORCE_HEARTBEAT = process.argv.includes('--heartbeat');
const HEARTBEAT_EVERY_MS = 7 * 864e5;

const CJ_PUBLISHER = '7966973';
const AWIN_PUBLISHER = '2931103';

// property → the CJ website-IDs and Awin advertiser-IDs it owns.
// CJ PIDs verified 2026-07-22 from CJ Account → Promotional Properties (all Active).
const PROPERTIES = [
  {
    key: 'perfume', label: 'Perfume Picks',
    cjSites: ['101759456'],
    awinAdvertisers: ['34989'],
    urlHints: ['perfumepicks'],
  },
  {
    key: 'percolate', label: 'Percolate',
    cjSites: ['101804271'],
    awinAdvertisers: ['81871', '122368', '35221', '90529', '59193', '124374'],
    urlHints: ['percolate'],
  },
  {
    key: 'itin', label: 'ITIN',
    // 3 CJ properties (Lending / Credit Card / Credit Score), all Active. CJ links
    // are provisioned but the deployed CTAs currently route to Awin + lead forms,
    // so no CJ commissions yet — the map is ready the instant one earns.
    cjSites: ['101772772', '101772770', '101772773'],
    awinAdvertisers: ['66532'],
    urlHints: ['itinlending', 'itincreditcard', 'itincreditscore', 'itin'],
  },
  {
    key: 'pour', label: 'Pour Picks',
    cjSites: ['101804278'],
    awinAdvertisers: [],
    urlHints: ['pourpicks'],
  },
  {
    key: 'underdial', label: 'Under Dial',
    cjSites: ['101804275'],
    awinAdvertisers: [],
    urlHints: ['underdial'],
  },
];

const CJ_TOKEN = process.env.CJ_PERSONAL_ACCESS_TOKEN;
const AWIN_TOKEN = process.env.AWIN_API_TOKEN;
if (!CJ_TOKEN) { console.error('missing CJ_PERSONAL_ACCESS_TOKEN'); process.exit(1); }

const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } })();
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

function imessage(text) {
  try {
    execFileSync('osascript', ['-'], {
      input: `on run\ntell application "Messages"\nset s to 1st service whose service type = iMessage\nsend ${JSON.stringify(text)} to buddy ${JSON.stringify(PHONE)} of s\nend tell\nend run`,
    });
    console.log('[imessage sent]', text.slice(0, 90).replace(/\n/g, ' '));
  } catch (e) { console.error('[imessage] send failed:', e.message); }
}

// ── attribution ───────────────────────────────────────────────────────────────
const propByCjSite = (siteId) =>
  PROPERTIES.find((p) => p.cjSites.includes(String(siteId)));
const propByAwin = (advId, publisherUrl) => {
  const byAdv = PROPERTIES.find((p) => p.awinAdvertisers.includes(String(advId)));
  if (byAdv) return byAdv;
  const host = (publisherUrl || '').toLowerCase();
  return PROPERTIES.find((p) => p.urlHints.some((h) => host.includes(h))); // fallback hint
};

// ── CJ (all sites, 30d) ───────────────────────────────────────────────────────
async function cjCommissions() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const before = new Date(Date.now() + 864e5).toISOString();
  const q = `{ publisherCommissions(forPublishers:["${CJ_PUBLISHER}"], sincePostingDate:"${since}", beforePostingDate:"${before}") {
    records { orderId postingDate advertiserName saleAmountUsd pubCommissionAmountUsd actionStatus websiteId } } }`;
  const r = await fetch('https://commissions.api.cj.com/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CJ_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (j.errors) console.error('[cj] error:', JSON.stringify(j.errors));
  return (j.data?.publisherCommissions?.records ?? []).map((c) => ({
    network: 'CJ',
    id: `cj_${c.orderId}`,
    property: propByCjSite(c.websiteId),
    idHint: `CJ site ${c.websiteId}`,
    advertiser: c.advertiserName,
    sale: Number(c.saleAmountUsd) || 0,
    commission: Number(c.pubCommissionAmountUsd) || 0,
    status: c.actionStatus,
  }));
}

// ── Awin (all advertisers, 30d) ───────────────────────────────────────────────
async function awinCommissions() {
  if (!AWIN_TOKEN) return { configured: false, records: [] };
  const startDate = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19);
  const endDate = new Date().toISOString().slice(0, 19);
  const u = `https://api.awin.com/publishers/${AWIN_PUBLISHER}/transactions/?startDate=${startDate}&endDate=${endDate}&timezone=UTC&dateType=transaction`;
  try {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${AWIN_TOKEN}` } });
    if (!r.ok) return { configured: true, error: `HTTP ${r.status}`, records: [] };
    const raw = await r.json();
    const records = (Array.isArray(raw) ? raw : []).map((t) => ({
      network: 'Awin',
      id: `awin_${t.id}`,
      property: propByAwin(t.advertiserId, t.publisherUrl),
      idHint: `Awin adv ${t.advertiserId}${t.publisherUrl ? ` (${t.publisherUrl})` : ''}`,
      advertiser: String(t.advertiserId),
      sale: t.saleAmount?.amount ?? 0,
      commission: t.commissionAmount?.amount ?? 0,
      status: t.commissionStatus || 'unknown',
    }));
    return { configured: true, records };
  } catch (e) { return { configured: true, error: e.message, records: [] }; }
}

// ── run ───────────────────────────────────────────────────────────────────────
const cj = await cjCommissions();
const awin = await awinCommissions();
const all = [...cj, ...awin.records];
const now = Date.now();

// bucket per property (+ unmapped)
const buckets = new Map(PROPERTIES.map((p) => [p.key, { label: p.label, recs: [] }]));
const unmapped = [];
for (const r of all) {
  if (r.property) buckets.get(r.property.key).recs.push(r);
  else unmapped.push(r);
}
const money = (recs) => recs.reduce((s, r) => s + r.commission, 0);

console.log(`[timberline-commissions] ${new Date().toISOString()}`);
for (const [, b] of buckets) console.log(`  ${b.label}: ${b.recs.length} commissions, $${money(b.recs).toFixed(2)} (30d)`);
console.log(`  UNMAPPED: ${unmapped.length}`);
console.log(`  Awin: ${awin.configured ? (awin.error ? 'ERROR ' + awin.error : awin.records.length + ' txns') : 'not configured'}`);

// First run: seed the baseline silently so days-old commissions aren't announced
// as "new". The heartbeat below still reports the 30d totals. Unmapped IDs are
// still surfaced on the first run (a mapping gap is worth knowing immediately).
const firstRun = state.seen === undefined;
state.seen ??= [];
const seen = new Set(state.seen);
if (firstRun) all.forEach((r) => { if (r.property) seen.add(r.id); });

// ── ALERT: new commissions per property (dedup by network id) ─────────────────
const fresh = all.filter((r) => r.property && !seen.has(r.id));
if (fresh.length) {
  const byProp = {};
  for (const r of fresh) (byProp[r.property.label] ??= []).push(r);
  const lines = Object.entries(byProp).map(([label, recs]) =>
    `${label}: ${recs.map((r) => `$${r.commission.toFixed(2)} ${r.network}/${r.advertiser} (${r.status})`).join(', ')}`,
  );
  imessage(`💰 New affiliate commission(s):\n${lines.join('\n')}`);
  fresh.forEach((r) => seen.add(r.id));
}

// ── ALERT: unmapped commission (self-healing — tells you the ID to add) ────────
const freshUnmapped = unmapped.filter((r) => !seen.has(r.id));
if (freshUnmapped.length) {
  const lines = freshUnmapped.map((r) => `${r.idHint} — ${r.advertiser} $${r.commission.toFixed(2)}`);
  imessage(
    `⚠️ Unmapped commission (not assigned to any property):\n${lines.join('\n')}\n` +
    `Add the site/advertiser ID to PROPERTIES in monitor-commissions-timberline.mjs.`,
  );
  freshUnmapped.forEach((r) => seen.add(r.id));
}
state.seen = [...seen];

// ── HEARTBEAT: weekly per-property summary ────────────────────────────────────
const due = FORCE_HEARTBEAT || !state.lastHeartbeat || now - state.lastHeartbeat >= HEARTBEAT_EVERY_MS;
if (due) {
  const parts = [...buckets.values()].map((b) => `${b.label} $${money(b.recs).toFixed(2)} (${b.recs.length})`);
  const awinLine = awin.configured ? (awin.error ? ` · Awin API error ${awin.error}` : '') : ' · Awin not wired';
  const unmappedLine = unmapped.length ? ` · ${unmapped.length} UNMAPPED` : '';
  imessage(`📊 Affiliate commissions 30d — ${parts.join(' · ')}${unmappedLine}${awinLine}. (CJ pub 7966973 + Awin pub 2931103)`);
  state.lastHeartbeat = now;
}

saveState();
