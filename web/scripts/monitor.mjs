#!/usr/bin/env node
// Live-site health monitor. No Search Console / analytics login required.
// Checks, against the production site:
//   1. Sitemap index + child sitemaps are reachable and parse.
//   2. Every URL in the sitemap returns HTTP 200 (catches deploy/index/404 rot).
//   3. TLS certificate is valid and not expiring soon.
//   4. Key pages carry JSON-LD structured data (Organization / Article / FAQ).
//   5. canonical present on a sampled page.
// Exits non-zero on any failure so a CI run (and its notification) goes red.
//
// Usage: node scripts/monitor.mjs --url https://perfumepicks.app
//        node scripts/monitor.mjs            (defaults to SITE_URL env or below)

import tls from 'node:tls';

const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const SITE = (urlArg || process.env.SITE_URL || 'https://perfumepicks.app').replace(/\/$/, '');
const CERT_WARN_DAYS = Number(process.env.CERT_WARN_DAYS || 21);
const MAX_CONCURRENCY = 8;
const UA = 'PerfumePicks-Monitor/1.0 (+health-check)';

const fails = [];
const warns = [];
const ok = (m) => console.log(`  \u2713 ${m}`);
const fail = (m) => { fails.push(m); console.log(`  \u2717 ${m}`); };
const warn = (m) => { warns.push(m); console.log(`  ! ${m}`); };

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  const body = await res.text();
  return { status: res.status, body, url: res.url };
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
}

// 1 + 2: sitemap + URL reachability ----------------------------------------
async function checkSitemapAndUrls() {
  console.log('\n[sitemap + url reachability]');
  let indexXml;
  try {
    const r = await fetchText(`${SITE}/sitemap-index.xml`);
    if (r.status !== 200) return fail(`sitemap-index.xml returned ${r.status}`);
    indexXml = r.body;
    ok('sitemap-index.xml reachable');
  } catch (e) {
    return fail(`sitemap-index.xml fetch error: ${e.message}`);
  }

  const childSitemaps = extractLocs(indexXml).filter((u) => u.endsWith('.xml'));
  const urls = new Set();
  for (const sm of childSitemaps) {
    try {
      const r = await fetchText(sm);
      if (r.status !== 200) { fail(`child sitemap ${sm} returned ${r.status}`); continue; }
      extractLocs(r.body).forEach((u) => urls.add(u));
    } catch (e) {
      fail(`child sitemap ${sm} fetch error: ${e.message}`);
    }
  }
  const list = [...urls];
  ok(`${list.length} URLs discovered across ${childSitemaps.length} sitemap(s)`);

  let checked = 0;
  let i = 0;
  let retried = 0;

  // A single transient blip is not an outage. Static hosts shed the occasional
  // request (503/429) under load, and because the live apps poll hourly that was
  // turning ~2.5% of runs red for URLs that were never actually down — a
  // different URL each time, all of them serving 200 on a direct check. Retry
  // transients with linear backoff and only fail a URL if it stays bad. Hard
  // errors (404/410/500-with-a-body-that-persists) still fail on the first pass
  // through the retries, so real rot is still caught within the same run.
  const TRANSIENT_ATTEMPTS = 3;
  const RETRY_BASE_MS = 1500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isTransient = (status) => status === 408 || status === 429 || status >= 500;

  async function probe(url) {
    let last = null;
    for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'manual' });
        if (!isTransient(res.status)) {
          return { status: res.status, location: res.headers.get('location'), attempts: attempt };
        }
        last = { status: res.status, location: res.headers.get('location') };
      } catch (e) {
        last = { error: e.message };
      }
      if (attempt < TRANSIENT_ATTEMPTS) {
        retried++;
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
    return { ...last, attempts: TRANSIENT_ATTEMPTS, exhausted: true };
  }

  async function worker() {
    while (i < list.length) {
      const url = list[i++];
      const r = await probe(url);
      const suffix = r.exhausted ? ` (persisted across ${r.attempts} attempts)` : '';
      if (r.error) {
        fail(`${url} -> fetch error: ${r.error}${suffix}`);
      } else if (r.status >= 300 && r.status < 400) {
        warn(`${url} -> redirect ${r.status} (${r.location || '?'})`);
      } else if (r.status !== 200) {
        fail(`${url} -> HTTP ${r.status}${suffix}`);
      }
      checked++;
    }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));
  ok(`checked ${checked} URLs${retried ? ` (${retried} transient retr${retried === 1 ? 'y' : 'ies'} absorbed)` : ''}`);
  return list;
}

// 3: TLS cert expiry --------------------------------------------------------
function checkCert() {
  console.log('\n[tls certificate]');
  const host = new URL(SITE).hostname;
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) { fail('could not read certificate'); socket.end(); return resolve(); }
      const days = Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000);
      if (days < 0) fail(`certificate EXPIRED ${-days} day(s) ago`);
      else if (days <= CERT_WARN_DAYS) warn(`certificate expires in ${days} day(s)`);
      else ok(`certificate valid for ${days} more day(s)`);
      socket.end();
      resolve();
    });
    socket.on('error', (e) => { fail(`tls error: ${e.message}`); resolve(); });
    socket.on('timeout', () => { fail('tls connection timed out'); socket.destroy(); resolve(); });
  });
}

// 4 + 5: schema + canonical on key pages -----------------------------------
async function checkSchema() {
  console.log('\n[structured data + head tags]');
  const keyPaths = ['/', '/about', '/articles'];
  for (const p of keyPaths) {
    const url = `${SITE}${p === '/' ? '' : p}`;
    try {
      const { status, body } = await fetchText(url);
      if (status !== 200) { fail(`${url} returned ${status}`); continue; }
      const blocks = [...body.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
      if (blocks.length === 0) { fail(`${url} has no JSON-LD`); continue; }
      let bad = 0;
      const types = [];
      for (const b of blocks) {
        try {
          const json = JSON.parse(b[1].trim());
          const collect = (o) => { if (o && o['@type']) types.push([].concat(o['@type']).join(',')); };
          if (Array.isArray(json)) json.forEach(collect);
          else if (json['@graph']) json['@graph'].forEach(collect);
          else collect(json);
        } catch { bad++; }
      }
      if (bad) fail(`${url} has ${bad} invalid JSON-LD block(s)`);
      else ok(`${url} JSON-LD ok [${[...new Set(types)].join(', ')}]`);
      if (!body.includes('rel="canonical"')) warn(`${url} missing canonical`);
    } catch (e) {
      fail(`${url} fetch error: ${e.message}`);
    }
  }
}

// run -----------------------------------------------------------------------
console.log(`Monitoring ${SITE}`);
await checkSitemapAndUrls();
await checkCert();
await checkSchema();

console.log(`\n${'='.repeat(48)}`);
console.log(`Result: ${fails.length} failure(s), ${warns.length} warning(s)`);
if (fails.length) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('All checks passed.');
