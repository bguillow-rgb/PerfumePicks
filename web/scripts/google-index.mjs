// Google Indexing API ping. Notifies Google to (re)crawl specific URLs ASAP —
// used to get each new daily article spidered the moment it deploys, instead of
// waiting for Google to rediscover it via the sitemap.
//
// IMPORTANT POLICY NOTE: Google officially scopes the Indexing API to pages with
// JobPosting or BroadcastEvent structured data. It works in practice for ordinary
// article URLs and many sites use it this way, but it is NOT a sanctioned use —
// Google may ignore, deprioritize, or rate-limit these submissions. The fully
// supported path for articles remains the sitemap (regenerated every build). Treat
// this as a best-effort accelerant, not a guarantee. Default quota is 200 URLs/day.
//
// Env-gated like the rest of the pipeline — does nothing until configured:
//   GOOGLE_INDEXING_SA_KEY  Google service-account JSON (raw or base64). Falls
//                           back to GSC_SA_KEY. The service account's email must
//                           be added as a VERIFIED OWNER of the Search Console
//                           property (use gsc-verify-sa.mjs), and the "Web Search
//                           Indexing API" must be enabled in its GCP project.
//
// Usage:
//   node scripts/google-index.mjs --article <slug>      # pings /articles/<slug>
//   node scripts/google-index.mjs /some/path /other     # pings explicit paths
//   node scripts/google-index.mjs https://host/full/url  # pings explicit full URLs
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SA_RAW = process.env.GOOGLE_INDEXING_SA_KEY || process.env.GSC_SA_KEY || '';
if (!SA_RAW.trim()) {
  console.log('google-index: no service-account key set — Google indexing not configured. Skipping.');
  process.exit(0);
}

// Derive the site origin from consts.ts so the script stays portable.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSTS = readFileSync(resolve(__dirname, '../src/consts.ts'), 'utf8');
const ORIGIN = (CONSTS.match(/url:\s*'(https?:\/\/[^'/]+)'/) || [])[1] || '';
if (!ORIGIN) {
  console.error('google-index: could not determine site origin from consts.ts.');
  process.exit(1);
}

// Build the URL list from argv. --article <slug> expands to the article URL;
// bare paths are resolved against the origin; full URLs pass through.
const args = process.argv.slice(2);
const urls = new Set();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--article') {
    const slug = args[++i];
    if (slug) urls.add(`${ORIGIN}/articles/${slug}`);
  } else if (a.startsWith('http://') || a.startsWith('https://')) {
    urls.add(a);
  } else if (a.startsWith('/')) {
    urls.add(`${ORIGIN}${a}`);
  } else {
    urls.add(`${ORIGIN}/${a}`);
  }
}

const urlList = [...urls];
if (!urlList.length) {
  console.log('google-index: no URLs to submit (pass --article <slug> or URLs/paths). Skipping.');
  process.exit(0);
}

let sa;
try {
  const json = SA_RAW.trim().startsWith('{') ? SA_RAW : Buffer.from(SA_RAW, 'base64').toString('utf8');
  sa = JSON.parse(json);
} catch {
  console.error('google-index: service-account key is not valid JSON (raw or base64).');
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
      scope: 'https://www.googleapis.com/auth/indexing',
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

const token = await getAccessToken();

let ok = 0;
let failed = 0;
for (const url of urlList) {
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  if (res.ok) {
    ok++;
    console.log(`google-index: URL_UPDATED  ${url}`);
  } else {
    failed++;
    const body = await res.text();
    console.error(`google-index: FAILED ${res.status}  ${url}\n  ${body.slice(0, 300)}`);
  }
}

console.log(`google-index: done — ${ok} submitted, ${failed} failed (of ${urlList.length}).`);
// Non-fatal: a Google indexing hiccup must not fail the daily content run.
process.exit(0);
