// Google Site Verification API helper — makes the Indexing API service account a
// VERIFIED OWNER of this site's Search Console property without the (now removed)
// "Add an owner" delegated-owner UI.
//
// Background: the Indexing API only accepts URL submissions from a service account
// that is a *verified owner* of a property covering the URL. Google deleted the
// delegated-owner ("Add an owner") control from Search Console for properties that
// are auto-verified via a Domain (DNS) parent, so a service account can no longer
// be delegated through the UI. The supported workaround is to have the service
// account verify ownership *itself* via the Site Verification API:
//   1. token  — ask the API for a FILE-method token, write it to public/<token>.html
//   2. (deploy so https://<host>/<token>.html is live)
//   3. verify — poll for the live file, then call webResource.insert → the service
//               account becomes a standalone verified owner of the SITE property.
// The token file is permanent (like the IndexNow key file) and keeps the service
// account verified. Re-running `token` returns the same token for this SA+site.
//
// Prereqs: the "Site Verification API" must be ENABLED in the service account's GCP
// project (separate from the Web Search Indexing API), and GOOGLE_INDEXING_SA_KEY
// (service-account JSON, raw or base64; falls back to GSC_SA_KEY) must be set.
//
// Usage:
//   node scripts/gsc-verify-sa.mjs token     # writes public/<token>.html, prints it
//   node scripts/gsc-verify-sa.mjs verify    # waits for the live file, then verifies
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const cmd = process.argv[2];
if (cmd !== 'token' && cmd !== 'verify') {
  console.error('gsc-verify-sa: usage: node scripts/gsc-verify-sa.mjs <token|verify>');
  process.exit(1);
}

const SA_RAW = process.env.GOOGLE_INDEXING_SA_KEY || process.env.GSC_SA_KEY || '';
if (!SA_RAW.trim()) {
  console.log('gsc-verify-sa: no service-account key set — nothing to do. Skipping.');
  process.exit(0);
}

// Derive the site origin from consts.ts so this stays portable (same trick as
// google-index.mjs).
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSTS = readFileSync(resolve(__dirname, '../src/consts.ts'), 'utf8');
const ORIGIN = (CONSTS.match(/url:\s*'(https?:\/\/[^'/]+)'/) || [])[1] || '';
if (!ORIGIN) {
  console.error('gsc-verify-sa: could not determine site origin from consts.ts.');
  process.exit(1);
}
// The Site Verification "SITE" identifier is the URL-prefix property URL.
const SITE = `${ORIGIN}/`;

let sa;
try {
  const json = SA_RAW.trim().startsWith('{') ? SA_RAW : Buffer.from(SA_RAW, 'base64').toString('utf8');
  sa = JSON.parse(json);
} catch {
  console.error('gsc-verify-sa: service-account key is not valid JSON (raw or base64).');
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
      scope: 'https://www.googleapis.com/auth/siteverification',
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

// FILE-method token for this SA + site. Stable across calls.
async function getFileToken(accessToken) {
  const res = await fetch('https://www.googleapis.com/siteVerification/v1/token', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      verificationMethod: 'FILE',
      site: { type: 'SITE', identifier: SITE },
    }),
  });
  if (!res.ok) throw new Error(`getToken ${res.status}: ${await res.text()}`);
  const { token } = await res.json(); // e.g. "google<hex>.html"
  if (!token) throw new Error('getToken returned no token');
  return token;
}

const accessToken = await getAccessToken();
const token = await getFileToken(accessToken);
const fileContent = `google-site-verification: ${token}`;
const publicPath = resolve(__dirname, '../public', token);

if (cmd === 'token') {
  writeFileSync(publicPath, fileContent + '\n');
  console.log(`gsc-verify-sa: wrote public/${token}`);
  console.log(`gsc-verify-sa: deploy, then run "verify" to complete ownership for ${SITE}`);
  // Surface the filename to the workflow so later steps can reference it.
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `token_file=${token}\n`, { flag: 'a' });
  }
  process.exit(0);
}

// cmd === 'verify': make sure the file is live, then insert the webResource.
const liveUrl = `${ORIGIN}/${token}`;
let live = false;
for (let i = 1; i <= 20; i++) {
  try {
    const r = await fetch(liveUrl, { cache: 'no-store' });
    const body = r.ok ? (await r.text()).trim() : '';
    if (r.ok && body.includes(token)) {
      live = true;
      console.log(`gsc-verify-sa: token file live at ${liveUrl} (attempt ${i}).`);
      break;
    }
    console.log(`gsc-verify-sa: ${liveUrl} not ready yet (attempt ${i}/20, status ${r.status}) — waiting…`);
  } catch (e) {
    console.log(`gsc-verify-sa: fetch error on attempt ${i}/20 (${e.message}) — waiting…`);
  }
  await new Promise((res) => setTimeout(res, 15000));
}
if (!live) {
  console.error(`gsc-verify-sa: token file never went live at ${liveUrl}. Deploy it, then re-run verify.`);
  process.exit(1);
}

const res = await fetch(
  'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=FILE',
  {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ site: { type: 'SITE', identifier: SITE } }),
  }
);
const text = await res.text();
if (!res.ok) {
  console.error(`gsc-verify-sa: webResource.insert FAILED ${res.status}\n  ${text.slice(0, 400)}`);
  process.exit(1);
}
console.log(`gsc-verify-sa: VERIFIED — service account is now an owner of ${SITE}`);
console.log(`  ${text.slice(0, 400)}`);
process.exit(0);
