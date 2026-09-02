// apple-search-ads.js — Apple Search Ads (ASA) account state for the
// DR AD SPEND analysis block in the Perfume Picks KPI dashboard.
//
// ASA's Campaign Management API is a SEPARATE surface from App Store
// Connect: different credentials, different OAuth2 client-credentials flow.
//
// IMPORTANT: the Bob Guillow Apple Ads org is SHARED across every Picks app
// (Perfume, Pour, etc.). The API returns every campaign in the org, so this
// module filters to Perfume Picks' adamId (ASA_ADAM_ID, default 6774184221)
// and computes totals from those campaigns only — never the org grand totals.
//
// Two modes, in priority order:
//   1. LIVE  — if ASA_CLIENT_ID / ASA_TEAM_ID / ASA_KEY_ID / ASA_PRIVATE_KEY
//              (or _PATH) are present, mint a client-secret JWT (ES256),
//              exchange it for an OAuth2 access token, and pull campaigns,
//              ad groups, search terms, and negatives over the last 12 weeks.
//   2. SNAPSHOT — otherwise (or on any live failure) read the hand-maintained
//              snapshot at scripts/kpi/data/asa-snapshot.json so DR AD SPEND's
//              verdict still renders.
//
// Either way fetchAll() returns the same shape (account / campaigns /
// adGroups / searchTerms / negativeKeywords / brandTerm), so the analysis
// module (dr-ad-spend.js) is agnostic to the source.
//
// To enable LIVE mode, in Apple Ads → Account Settings → API:
//   1. Create an API certificate (downloads an EC private key .pem).
//   2. Note the clientId, teamId, keyId from the certificate detail.
// Then add to .env.local:
//   ASA_CLIENT_ID=...        (SEARCHADS.<uuid>)
//   ASA_TEAM_ID=...          (SEARCHADS.<uuid>, same prefix family)
//   ASA_KEY_ID=...           (the certificate key id)
//   ASA_ORG_ID=...           (numeric orgId; auto-discovered via /acls if omitted)
//   ASA_ADAM_ID=...          (App Store app id; default 6774184221 = Perfume Picks)
//   ASA_PRIVATE_KEY_PATH=/abs/path/to/asa_private_key.pem   (or ASA_PRIVATE_KEY inline)

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'asa-snapshot.json');
const TOKEN_CACHE_PATH = path.join(
  process.env.HOME || '/tmp',
  '.cache',
  'perfume-picks',
  'asa-token.json'
);

const TOKEN_URL = 'https://appleid.apple.com/auth/oauth2/token';
const API_BASE = 'https://api.searchads.apple.com/api/v5';
const BRAND_TERM = 'perfume picks';
const DEFAULT_ADAM_ID = '6774184221'; // Perfume Picks (com.bobguillow.perfumepicks)

function loadEnv() {
  return {
    clientId: process.env.ASA_CLIENT_ID || '',
    teamId: process.env.ASA_TEAM_ID || '',
    keyId: process.env.ASA_KEY_ID || '',
    orgId: process.env.ASA_ORG_ID || '',
    adamId: String(process.env.ASA_ADAM_ID || DEFAULT_ADAM_ID),
    privateKey: (function () {
      if (process.env.ASA_PRIVATE_KEY) return process.env.ASA_PRIVATE_KEY;
      const p = process.env.ASA_PRIVATE_KEY_PATH;
      if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      return '';
    })(),
  };
}

function isConfigured(env) {
  return Boolean(env.clientId && env.teamId && env.keyId && env.privateKey);
}

// ── Snapshot fallback ─────────────────────────────────────────────────
function loadSnapshot(extra = {}) {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
      return { ...raw, mode: 'snapshot', ...extra };
    }
  } catch (e) {
    return { error: `snapshot parse failed: ${e.message}`, mode: 'snapshot', ...extra };
  }
  return { error: 'no ASA snapshot file', mode: 'snapshot', ...extra };
}

// ── OAuth2 client-secret JWT (ES256) ──────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mintClientSecret(env) {
  const header = { alg: 'ES256', kid: env.keyId };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: env.clientId,
    aud: 'https://appleid.apple.com',
    iss: env.teamId,
    iat: now,
    exp: now + 60 * 60, // Apple caps client secret at ~6 months; 1h is plenty
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: env.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64url(sig)}`;
}

function loadTokenCache() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf8'));
    }
  } catch {}
  return {};
}

function saveTokenCache(obj) {
  try {
    fs.mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(obj));
  } catch {}
}

async function getAccessToken(env) {
  const cache = loadTokenCache();
  // Reuse if >2min of life left and same client.
  if (cache.accessToken && cache.expiresAt && cache.clientId === env.clientId &&
      cache.expiresAt - Date.now() > 120000) {
    return cache.accessToken;
  }
  const clientSecret = mintClientSecret(env);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.clientId,
    client_secret: clientSecret,
    scope: 'searchadsorg',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Host: 'appleid.apple.com' },
    body,
  });
  if (!res.ok) {
    throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const json = await res.json();
  const accessToken = json.access_token;
  const ttl = (json.expires_in || 3600) * 1000;
  saveTokenCache({ accessToken, expiresAt: Date.now() + ttl, clientId: env.clientId });
  return accessToken;
}

// ── API helpers (X-AP-Context carries the orgId) ──────────────────────
function ctxHeaders(token, orgId) {
  return {
    Authorization: `Bearer ${token}`,
    'X-AP-Context': `orgId=${orgId}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function apiGet(token, orgId, pathName) {
  const res = await fetch(`${API_BASE}${pathName}`, { headers: ctxHeaders(token, orgId) });
  if (!res.ok) throw new Error(`GET ${pathName} ${res.status}: ${(await res.text()).slice(0, 140)}`);
  return res.json();
}

async function apiPost(token, orgId, pathName, payload) {
  const res = await fetch(`${API_BASE}${pathName}`, {
    method: 'POST',
    headers: ctxHeaders(token, orgId),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${pathName} ${res.status}: ${(await res.text()).slice(0, 140)}`);
  return res.json();
}

async function discoverOrgId(token) {
  // /acls lists the orgs this API user can manage. Use the first.
  const res = await fetch(`${API_BASE}/acls`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`acls ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const json = await res.json();
  const org = (json.data || [])[0];
  if (!org?.orgId) throw new Error('no orgId in /acls');
  return String(org.orgId);
}

function reportWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 84); // 12 weeks
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startTime: fmt(start), endTime: fmt(end), label: 'Last 12 weeks' };
}

function spendOf(row) {
  const t = row.total || row.granularity || {};
  return Number(t.localSpend?.amount ?? t.localSpend ?? 0) || 0;
}
function installsOf(row) {
  const t = row.total || row.granularity || {};
  return Number(t.totalInstalls ?? t.installs ?? 0) || 0;
}
function cpa(spend, installs) {
  return installs > 0 ? spend / installs : null;
}

// ── Live pull — assembles the snapshot-shaped object ──────────────────
async function fetchLive(env) {
  const token = await getAccessToken(env);
  const orgId = env.orgId || (await discoverOrgId(token));
  const win = reportWindow();

  // Campaign management list first — this carries adamId + status, and lets us
  // scope everything to Perfume Picks in a shared org.
  const campList = await apiGet(token, orgId, '/campaigns?limit=1000');
  const mineById = {};   // campaignId -> { status, currency }
  let currency = 'USD';
  for (const c of campList.data || []) {
    if (String(c.adamId) !== env.adamId) continue; // scope to this app
    mineById[String(c.id)] = {
      status: c.status || c.servingStatus || 'UNKNOWN',
    };
    if (c.budgetAmount?.currency) currency = c.budgetAmount.currency;
  }
  const myCampIds = new Set(Object.keys(mineById));

  const baseSelector = {
    selector: {
      orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
      pagination: { offset: 0, limit: 1000 },
    },
    startTime: win.startTime,
    endTime: win.endTime,
    timeZone: 'UTC',
    returnRowTotals: true,
    returnRecordsWithNoMetrics: true,
  };

  // Campaign-level report — filter rows to this app's campaigns.
  const campReport = await apiPost(token, orgId, '/reports/campaigns', baseSelector);
  const campRows = (campReport.data?.reportingDataResponse?.row || []).filter(
    (r) => myCampIds.has(String((r.metadata || {}).campaignId))
  );

  const campaigns = [];
  const searchTermsAll = [];
  const negativesAll = [];
  const brandTerms = new Set();
  let anyEnabledBrandKeyword = false;

  for (const row of campRows) {
    const meta = row.metadata || {};
    const id = String(meta.campaignId);
    const cSpend = spendOf(row);
    const cInstalls = installsOf(row);

    // Ad group report for this campaign.
    let adGroups = [];
    try {
      const agReport = await apiPost(token, orgId, `/reports/campaigns/${id}/adgroups`, baseSelector);
      const agRows = agReport.data?.reportingDataResponse?.row || [];
      // Ad group settings (status + automatedKeywordsOptIn = Search Match).
      const agList = await apiGet(token, orgId, `/campaigns/${id}/adgroups?limit=1000`);
      const agInfoById = {};
      for (const ag of agList.data || []) {
        agInfoById[String(ag.id)] = {
          status: ag.status || ag.servingStatus || 'UNKNOWN',
          searchMatch: Boolean(ag.automatedKeywordsOptIn),
          cpaGoal: ag.cpaGoal && ag.cpaGoal.amount != null ? Number(ag.cpaGoal.amount) : null,
        };
      }
      adGroups = agRows.map((r) => {
        const m = r.metadata || {};
        const info = agInfoById[String(m.adGroupId)] || {};
        const s = spendOf(r);
        const i = installsOf(r);
        return {
          name: m.adGroupName || `#${m.adGroupId}`,
          status: info.status || 'UNKNOWN',
          matchType: info.searchMatch ? 'SEARCH_MATCH' : 'EXACT',
          spend: s,
          installs: i,
          cpa: cpa(s, i),
          cpaGoal: info.cpaGoal ?? null,
        };
      });
    } catch {
      adGroups = [];
    }

    // Search terms (for junk detection). NOTE: this report REJECTS the shared
    // baseSelector — `timeZone` and `returnRecordsWithNoMetrics: true` each
    // 400 on the searchterms dimension (verified live 2026-07-09; the old call
    // silently failed in this try/catch forever). Minimal body only.
    try {
      const stReport = await apiPost(token, orgId, `/reports/campaigns/${id}/searchterms`, {
        startTime: win.startTime,
        endTime: win.endTime,
        returnRowTotals: true,
        returnRecordsWithNoMetrics: false,
        selector: {
          orderBy: [{ field: 'impressions', sortOrder: 'DESCENDING' }],
          pagination: { offset: 0, limit: 1000 },
        },
      });
      const stRows = stReport.data?.reportingDataResponse?.row || [];
      for (const r of stRows) {
        const m = r.metadata || {};
        const text = m.searchTermText || m.searchTerm || '';
        if (!text) continue;
        searchTermsAll.push({ text, spend: spendOf(r), installs: installsOf(r) });
      }
    } catch {}

    // Negative keywords.
    try {
      const negList = await apiGet(token, orgId, `/campaigns/${id}/negativekeywords?limit=1000`);
      for (const n of negList.data || []) {
        if (n.text) negativesAll.push({ text: n.text });
      }
    } catch {}

    // Brand defense — any ENABLED targeting keyword containing the brand
    // term. The campaign-level find endpoint takes the Selector object as the
    // body DIRECTLY — wrapping it in {selector:{...}} 400s with
    // UNRECOGNIZED_PROPERTY (verified live 2026-07-09; the old wrapped call
    // silently failed here forever, producing a false "brand undefended"
    // DEFEND-BRAND finding).
    try {
      const kwFind = await apiPost(token, orgId, `/campaigns/${id}/adgroups/targetingkeywords/find`, {
        pagination: { offset: 0, limit: 1000 },
      });
      for (const kw of kwFind.data || []) {
        if ((kw.text || '').toLowerCase().includes(BRAND_TERM)) {
          brandTerms.add(kw.text);
          if ((kw.status || 'ACTIVE') !== 'PAUSED') anyEnabledBrandKeyword = true;
        }
      }
    } catch {}

    campaigns.push({
      id,
      name: meta.campaignName || `#${id}`,
      status: mineById[id]?.status || 'UNKNOWN',
      spend: cSpend,
      installs: cInstalls,
      cpa: cpa(cSpend, cInstalls),
      adGroups,
    });
  }

  // Totals are summed from THIS app's campaigns only — never org grand totals,
  // which include every other Picks app in the shared org.
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalInstalls = campaigns.reduce((s, c) => s + c.installs, 0);

  // Keep only meaningful / junk search terms to bound size: spend > 0.
  const stAgg = new Map();
  for (const t of searchTermsAll) {
    const key = (t.text || '').toLowerCase();
    if (!key) continue;
    const cur = stAgg.get(key) || { text: t.text, spend: 0, installs: 0 };
    cur.spend += t.spend || 0;
    cur.installs += t.installs || 0;
    stAgg.set(key, cur);
  }
  const searchTerms = [...stAgg.values()]
    .filter((t) => t.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 25);

  return {
    mode: 'live',
    capturedAt: new Date().toISOString().slice(0, 10),
    source: 'asa-campaign-management-api-v5',
    currency,
    dateRange: win.label,
    account: {
      spend: totalSpend,
      installs: totalInstalls,
      cpa: cpa(totalSpend, totalInstalls),
      targetCpa: null, // not exposed at account level; campaign-level goals vary
    },
    campaigns,
    searchTerms,
    negativeKeywords: negativesAll,
    brandTerm: {
      present: brandTerms.size > 0,
      enabled: anyEnabledBrandKeyword,
      terms: [...brandTerms],
    },
    brandTermDefended: anyEnabledBrandKeyword,
  };
}

// fetchAll never throws — one source down can't take out the digest.
async function fetchAll(env) {
  if (isConfigured(env)) {
    try {
      const live = await fetchLive(env);
      live.configured = true;
      return live;
    } catch (e) {
      // Fall back to snapshot, but record why live failed so it surfaces.
      return loadSnapshot({ configured: true, liveError: e.message });
    }
  }
  return loadSnapshot({ configured: false });
}

module.exports = { loadEnv, isConfigured, fetchAll };
