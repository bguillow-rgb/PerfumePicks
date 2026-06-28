// app-store-connect.js — App Store Connect Sales & Trends for Perfume Picks.
//
// Hardcodes the Perfume Picks App ID (6774184221).
// Loads ASC credentials from the shared developer account:
//   - First checks PerfumePicks/.env.local
//   - Falls back to Pour Picks/.env.local (same developer account)
//
// Cache lives at ~/.cache/perfume-picks/asc-daily.json

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PP_APP_ID = '6774184221';
const PP_APP_SKU = 'perfumepicks';

function loadEnv() {
  // ASC creds are shared across the developer account — prefer PP env.local,
  // fall back to Pour Picks which has the confirmed-working key.
  const ppEnvPath = path.join(__dirname, '..', '..', '..', '.env.local');
  const pourPicksEnvPath = path.join(
    process.env.HOME || '/Users/bobguillow',
    'Projects', 'pour-picks', '.env.local'
  );

  function readEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const out = {};
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      out[k] = vRaw.replace(/^['"]|['"]$/g, '');
    }
    return out;
  }

  // Merge: PP env takes priority, then Pour Picks env, then process.env
  const ppEnv = readEnvFile(ppEnvPath);
  const pourPicksEnv = readEnvFile(pourPicksEnvPath);

  function get(key) {
    return process.env[key] || ppEnv[key] || pourPicksEnv[key] || '';
  }

  return {
    keyId: get('ASC_KEY_ID'),
    issuerId: get('ASC_ISSUER_ID'),
    vendorNumber: get('ASC_VENDOR_NUMBER'),
    privateKey: (function () {
      if (process.env.ASC_PRIVATE_KEY) return process.env.ASC_PRIVATE_KEY;
      const p = get('ASC_PRIVATE_KEY_PATH');
      if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      return '';
    })(),
    // The vendor SALES report is account-wide (shared with Pour Picks). We MUST
    // filter to Perfume Picks: appId matches download rows (Apple Identifier),
    // appSku matches IAP rows (Parent Identifier). Without this the dashboard
    // reports the whole developer account's installs + proceeds.
    appId: PP_APP_ID,
    appSku: PP_APP_SKU,
  };
}

function isConfigured(env) {
  return Boolean(env.keyId && env.issuerId && env.privateKey && env.vendorNumber);
}

// ── JWT mint (ES256, IEEE P1363 raw signature) ────────────────────────
function mintJwt(env) {
  const header = { alg: 'ES256', kid: env.keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: env.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const sigB64 = sig
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${sigB64}`;
}

// ── TSV parser ────────────────────────────────────────────────────────
// The vendor SALES report is account-wide. Pass appId + appSku to scope totals
// to a single app:
//   - download rows → "Apple Identifier" column == numeric appId
//   - IAP rows      → "Parent Identifier" column == app SKU
//     (IAP rows carry the IAP's own Apple Identifier, not the parent app's)
// If both are omitted the parser sums every row (legacy account-wide behavior).
function parseSalesTsv(tsv, appId, appSku) {
  const lines = tsv.split('\n').filter(Boolean);
  if (lines.length < 2) {
    return { installs: 0, updates: 0, iapUnits: 0, proceeds: 0, currency: 'USD' };
  }
  const header = lines[0].split('\t');
  const col = (n) => header.indexOf(n);
  const idxType = col('Product Type Identifier');
  const idxUnits = col('Units');
  const idxProceeds = col('Developer Proceeds');
  const idxCurrency = col('Currency of Proceeds');
  const idxAppleId = col('Apple Identifier');
  const idxParent = col('Parent Identifier');
  const wantAppId = appId ? String(appId) : '';
  let installs = 0, updates = 0, iapUnits = 0, proceeds = 0;
  let currency = 'USD';
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    // Scope to this app only.
    if (wantAppId || appSku) {
      const rowAppleId = (cols[idxAppleId] || '').trim();
      const rowParent = (cols[idxParent] || '').trim();
      const isThisApp =
        (wantAppId && rowAppleId === wantAppId) ||
        (appSku && rowParent === appSku);
      if (!isThisApp) continue;
    }
    const type = (cols[idxType] || '').trim();
    const units = parseInt(cols[idxUnits] || '0', 10) || 0;
    const prc = parseFloat(cols[idxProceeds] || '0') || 0;
    if (cols[idxCurrency]) currency = cols[idxCurrency];
    if (type === '1' || type === '1F' || type === '1T' || type === 'F1') installs += units;
    else if (type.startsWith('7')) updates += units;
    else if (type.startsWith('IA')) iapUnits += units;
    proceeds += prc * units;
  }
  return { installs, updates, iapUnits, proceeds, currency };
}

// ── Cache ──────────────────────────────────────────────────────────────
// v2: per-app filtered totals. v1 cached account-wide sums (Pour Picks + every
// other app on the shared vendor account) — incompatible, so a new filename
// forces a clean re-fetch with the appId/appSku filter applied.
const CACHE_PATH = path.join(
  process.env.HOME || '/tmp',
  '.cache', 'perfume-picks', 'asc-daily-v2.json'
);

const ACQSOURCES_CACHE_PATH = path.join(
  process.env.HOME || '/tmp',
  '.cache', 'perfume-picks', 'asc-acq-sources.json'
);

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {}
  return {};
}

function saveCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch {}
}

// ── Fetch a single daily report ───────────────────────────────────────
async function fetchDailyReport(env, jwt, date) {
  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[reportDate]=${date}&filter[vendorNumber]=${env.vendorNumber}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/a-gzip',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ASC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tsv = zlib.gunzipSync(buf).toString('utf8');
  return parseSalesTsv(tsv, env.appId, env.appSku);
}

// How far back a cached "absent" day stays eligible for re-fetch. Apple can
// publish a daily report a few days late; past this window reports are stable.
const ABSENT_RECHECK_DAYS = 45;

// ── Lifetime totals ────────────────────────────────────────────────────
async function fetchLifetime(env, jwt) {
  const cache = loadCache();
  const today = new Date();
  let consecutive404 = 0;
  let totalInstalls = 0;
  let totalProceeds = 0;
  let mostRecentReportDate = null;
  let latestReport = null;

  for (let i = 1; i < 365 && consecutive404 < 14; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    let row = cache[dateStr];
    // A cached "absent" within the recheck window may have been a transient
    // 404 — Apple backfills late reports. Re-fetch recent absent days; trust
    // absent only once the report is old enough to be immutable.
    const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86400000;
    const recent = ageDays <= ABSENT_RECHECK_DAYS;
    const staleAbsent = row && row.absent && recent;
    // The consecutive-404 guard exists to detect walking PAST the start of the
    // app's history (pre-launch days never have reports). A run of 404s at the
    // RECENT end just means "Apple hasn't published yet" — it must NOT terminate
    // the walk, or a multi-day publishing lag zeroes out lifetime totals.
    if (!row || staleAbsent) {
      const r = await fetchDailyReport(env, jwt, dateStr);
      if (r === null) {
        cache[dateStr] = { absent: true };
        if (!recent) consecutive404++;
        continue;
      }
      row = r;
      cache[dateStr] = row;
      consecutive404 = 0;
    } else if (row.absent) {
      if (!recent) consecutive404++;
      continue;
    } else {
      consecutive404 = 0;
    }

    if (!latestReport && !row.absent) {
      latestReport = { date: dateStr, ...row };
    }
    totalInstalls += row.installs || 0;
    totalProceeds += row.proceeds || 0;
    mostRecentReportDate = mostRecentReportDate || dateStr;
  }

  saveCache(cache);

  return {
    latestReport,
    lifetimeInstalls: totalInstalls,
    lifetimeProceeds: totalProceeds,
    mostRecentReportDate,
  };
}

// ── Acquisition Sources ────────────────────────────────────────────────
function loadAcqCache() {
  try {
    if (fs.existsSync(ACQSOURCES_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(ACQSOURCES_CACHE_PATH, 'utf8'));
    }
  } catch {}
  return {};
}

function saveAcqCache(obj) {
  try {
    fs.mkdirSync(path.dirname(ACQSOURCES_CACHE_PATH), { recursive: true });
    fs.writeFileSync(ACQSOURCES_CACHE_PATH, JSON.stringify(obj));
  } catch {}
}

async function fetchAcquisitionSources(env, jwt, appId) {
  if (!appId) return { error: 'ASC_APP_ID missing' };

  const cache = loadAcqCache();
  const nowMs = Date.now();
  const FRESH_MS = 25 * 60 * 60 * 1000;

  if (cache.data && cache.fetchedAt && (nowMs - cache.fetchedAt) < FRESH_MS) {
    return { sources: cache.data, note: `cached ${new Date(cache.fetchedAt).toISOString().slice(0, 10)}` };
  }

  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  try {
    if (cache.requestId) {
      const reportsRes = await fetch(
        `https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/${cache.requestId}/reports`,
        { headers }
      );
      if (reportsRes.ok) {
        const reportsJson = await reportsRes.json();
        const report = (reportsJson.data || []).find(
          (r) => r.attributes?.category === 'COMMERCE' &&
                 r.attributes?.name?.includes('App Downloads')
        );
        if (report) {
          const instRes = await fetch(
            `https://api.appstoreconnect.apple.com/v1/analyticsReports/${report.id}/instances?limit=5`,
            { headers }
          );
          if (instRes.ok) {
            const instJson = await instRes.json();
            const instances = instJson.data || [];
            const instance = instances.find((i) => i.attributes?.granularity === 'DAILY') || instances[0];
            if (instance) {
              const segRes = await fetch(
                `https://api.appstoreconnect.apple.com/v1/analyticsReportInstances/${instance.id}/segments`,
                { headers }
              );
              if (segRes.ok) {
                const segJson = await segRes.json();
                const downloadUrl = segJson.data?.[0]?.attributes?.url;
                if (downloadUrl) {
                  const dlRes = await fetch(downloadUrl);
                  if (dlRes.ok) {
                    const buf = Buffer.from(await dlRes.arrayBuffer());
                    const raw = zlib.gunzipSync(buf).toString('utf8');
                    const parsed = parseAcquisitionTsv(raw);
                    cache.data = parsed;
                    cache.fetchedAt = nowMs;
                    delete cache.requestId;
                    saveAcqCache(cache);
                    return { sources: parsed };
                  }
                }
              }
            }
          }
        }
      }
      if (cache.data) {
        return { sources: cache.data, note: `pending refresh (requested ${new Date(cache.requestedAt).toISOString().slice(0, 16)})` };
      }
      return { pending: true, note: `report requested ${new Date(cache.requestedAt || nowMs).toISOString().slice(0, 16)}, not ready yet` };
    }

    const createRes = await fetch('https://api.appstoreconnect.apple.com/v1/analyticsReportRequests', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'analyticsReportRequests',
          attributes: { accessType: 'ONE_TIME_SNAPSHOT' },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      }),
    });

    if (!createRes.ok) {
      if (createRes.status === 403) {
        return { error: `API key lacks Analytics Reports permission.` };
      }
      if (createRes.status === 409) {
        try {
          const listRes = await fetch(
            `https://api.appstoreconnect.apple.com/v1/analyticsReportRequests?filter[app]=${appId}&limit=5`,
            { headers }
          );
          if (listRes.ok) {
            const listJson = await listRes.json();
            const existing = (listJson.data || []).find(
              (r) => r.attributes?.accessType === 'ONE_TIME_SNAPSHOT'
            );
            if (existing?.id) {
              cache.requestId = existing.id;
              cache.requestedAt = nowMs;
              saveAcqCache(cache);
              if (cache.data) {
                return { sources: cache.data, note: `pending refresh (recovered existing request)` };
              }
              return { pending: true, note: `existing report request in progress` };
            }
          }
        } catch {}
        if (cache.data) return { sources: cache.data, note: 'pending refresh' };
        return { pending: true, note: 'existing request in progress, will retry' };
      }
      const body = await createRes.text();
      return { error: `create request ${createRes.status}: ${body.slice(0, 150)}` };
    }

    const createJson = await createRes.json();
    const requestId = createJson.data?.id;
    if (!requestId) return { error: 'no requestId returned from ASC' };

    cache.requestId = requestId;
    cache.requestedAt = nowMs;
    saveAcqCache(cache);

    if (cache.data) {
      return { sources: cache.data, note: 'refresh requested, returning stale data' };
    }
    return { pending: true, note: 'report requested, will be ready within a few hours' };

  } catch (e) {
    return { error: e.message };
  }
}

function parseAcquisitionTsv(tsv) {
  const lines = tsv.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split('\t').map((h) => h.trim());
  const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const idxSource = col('Source Type');
  const idxDownloadType = col('Download Type');
  const idxCounts = col('Counts');

  const bySource = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const downloadType = (cols[idxDownloadType] || '').trim();
    if (downloadType !== 'First-time download') continue;
    const source = (cols[idxSource] || '').trim();
    if (!source) continue;
    if (!bySource[source]) bySource[source] = { source, installs: 0 };
    bySource[source].installs += parseInt(cols[idxCounts] || '0', 10) || 0;
  }

  return Object.values(bySource)
    .sort((a, b) => b.installs - a.installs)
    .map((s) => ({ ...s, impressions: null, pageViews: null, conversionRate: null }));
}

// ── Customer reviews ──────────────────────────────────────────────────
async function fetchCustomerReviews(env, jwt, appId) {
  if (!appId) return { error: 'appId missing' };
  const url = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/customerReviews?limit=20&sort=-createdDate`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      return { error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = await res.json();
    const reviews = (json.data || []).map((r) => ({
      id: r.id,
      rating: r.attributes?.rating ?? null,
      title: r.attributes?.title ?? '',
      body: r.attributes?.body ?? '',
      reviewerNickname: r.attributes?.reviewerNickname ?? '',
      createdDate: r.attributes?.createdDate ?? '',
      territory: r.attributes?.territory ?? '',
    }));
    const ratings = reviews.map((r) => r.rating).filter((n) => n != null);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const recent7d = reviews.filter(
      (r) => r.createdDate && new Date(r.createdDate).getTime() > sevenDaysAgo
    );
    return {
      totalReviews: reviews.length,
      avgRating,
      oneStarCount: ratings.filter((r) => r === 1).length,
      fiveStarCount: ratings.filter((r) => r === 5).length,
      recent7dCount: recent7d.length,
      recent7d: recent7d.slice(0, 3),
      mostRecent: reviews.slice(0, 5),
    };
  } catch (e) {
    return { error: e.message ?? 'fetch failed' };
  }
}

async function fetchAll(env) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error: 'ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, or ASC_VENDOR_NUMBER missing',
    };
  }
  try {
    const jwt = mintJwt(env);
    const appId = env.appId || PP_APP_ID;
    const [lifetime, reviews, acquisitionSources] = await Promise.all([
      fetchLifetime(env, jwt),
      fetchCustomerReviews(env, jwt, appId),
      fetchAcquisitionSources(env, jwt, appId),
    ]);
    return { configured: true, ...lifetime, reviews, acquisitionSources };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}

module.exports = {
  loadEnv,
  isConfigured,
  mintJwt,
  parseSalesTsv,
  parseAcquisitionTsv,
  fetchDailyReport,
  fetchLifetime,
  fetchCustomerReviews,
  fetchAcquisitionSources,
  fetchAll,
  PP_APP_ID,
};
