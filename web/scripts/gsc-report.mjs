// Weekly Google Search Console diff. Compares the last full 7 days against the
// prior 7 days and reports the movers that matter: totals, biggest query
// gains/losses, CTR drops (likely AI Overview takeover), and new near-page-1
// queries.
//
// Env-gated like the rest of the pipeline — does nothing until configured:
//   GSC_SA_KEY   Google service-account JSON (raw or base64). The service
//                account's email must be added as a user on the GSC property.
//   GSC_PROPERTY GSC property, e.g. "sc-domain:perfumepicks.app" or
//                "https://perfumepicks.app/". Defaults to sc-domain:<host>.
//
// Usage:  GSC_SA_KEY=... node scripts/gsc-report.mjs
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SA_RAW = process.env.GSC_SA_KEY || '';
if (!SA_RAW.trim()) {
  console.log('gsc-report: GSC_SA_KEY not set — reporting not configured. Skipping.');
  process.exit(0);
}

// Derive the default property host from consts.ts so the script stays portable.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSTS = readFileSync(resolve(__dirname, '../src/consts.ts'), 'utf8');
const host = (CONSTS.match(/url:\s*'https?:\/\/([^'/]+)'/) || [])[1] || '';
const PROPERTY = process.env.GSC_PROPERTY || (host ? `sc-domain:${host}` : '');
if (!PROPERTY) {
  console.error('gsc-report: could not determine GSC property (set GSC_PROPERTY).');
  process.exit(1);
}

let sa;
try {
  const json = SA_RAW.trim().startsWith('{')
    ? SA_RAW
    : Buffer.from(SA_RAW, 'base64').toString('utf8');
  sa = JSON.parse(json);
} catch (e) {
  console.error('gsc-report: GSC_SA_KEY is not valid JSON (raw or base64).');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

const iso = (d) => d.toISOString().slice(0, 10);
function range(offsetDays) {
  // GSC data lags ~3 days; offsetDays shifts the 7-day window further back.
  const end = new Date();
  end.setDate(end.getDate() - 3 - offsetDays);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { startDate: iso(start), endDate: iso(end) };
}

async function query(token, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    PROPERTY
  )}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${await res.text()}`);
  return (await res.json()).rows || [];
}

function totals(rows) {
  let c = 0;
  let i = 0;
  for (const r of rows) {
    c += r.clicks;
    i += r.impressions;
  }
  const ctr = i ? ((c / i) * 100).toFixed(2) : '0.00';
  return `clicks ${c}  impr ${i}  CTR ${ctr}%`;
}

const main = async () => {
  const token = await getAccessToken();
  const cur = range(0);
  const prev = range(7);
  const dims = { dimensions: ['query'], rowLimit: 5000, type: 'web' };
  const [curRows, prevRows] = await Promise.all([
    query(token, { ...cur, ...dims }),
    query(token, { ...prev, ...dims }),
  ]);

  console.log(`\n=== GSC weekly report: ${PROPERTY} ===`);
  console.log(`current  ${cur.startDate} → ${cur.endDate}`);
  console.log(`previous ${prev.startDate} → ${prev.endDate}\n`);
  console.log(`Totals — current 7d:  ${totals(curRows)}`);
  console.log(`Totals — previous 7d: ${totals(prevRows)}`);

  const key = (r) => r.keys[0];
  const prevMap = new Map(prevRows.map((r) => [key(r), r]));
  const curMap = new Map(curRows.map((r) => [key(r), r]));
  const allKeys = new Set([...prevMap.keys(), ...curMap.keys()]);

  const movers = [];
  for (const q of allKeys) {
    const c = curMap.get(q) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const p = prevMap.get(q) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    movers.push({
      q,
      dImpr: c.impressions - p.impressions,
      curImpr: c.impressions,
      curCtr: c.ctr,
      prevCtr: p.ctr,
      curPos: c.position,
    });
  }

  const top = (arr, n = 10) => arr.slice(0, n);
  const section = (title, rows, fmt) => {
    console.log(`\n${title}`);
    if (!rows.length) return console.log('  (none)');
    for (const m of rows) console.log('  ' + fmt(m));
  };

  const gains = top([...movers].sort((a, b) => b.dImpr - a.dImpr).filter((x) => x.dImpr > 0));
  const losses = top([...movers].sort((a, b) => a.dImpr - b.dImpr).filter((x) => x.dImpr < 0));
  const ctrDrops = top(
    [...movers]
      .filter((x) => x.curImpr >= 50 && x.prevCtr - x.curCtr > 0.02)
      .sort((a, b) => b.prevCtr - b.curCtr - (a.prevCtr - a.curCtr))
  );
  const nearPage1 = top(
    [...movers].filter((x) => x.curPos > 0 && x.curPos <= 15 && x.curImpr >= 20).sort((a, b) => a.curPos - b.curPos)
  );

  section('Top impression GAINS:', gains, (x) => `+${x.dImpr} impr  ${x.q}`);
  section('Top impression LOSSES:', losses, (x) => `${x.dImpr} impr  ${x.q}`);
  section('CTR drops (possible AI Overview takeover):', ctrDrops, (x) =>
    `${(x.prevCtr * 100).toFixed(1)}% → ${(x.curCtr * 100).toFixed(1)}%  (${x.curImpr} impr)  ${x.q}`
  );
  section('Near page 1 (pos ≤ 15) — push these:', nearPage1, (x) =>
    `pos ${x.curPos.toFixed(1)}  ${x.curImpr} impr  ${x.q}`
  );
  console.log('\ngsc-report: done');
};

main().catch((e) => {
  console.error(`gsc-report: ${e.message}`);
  process.exit(1);
});
