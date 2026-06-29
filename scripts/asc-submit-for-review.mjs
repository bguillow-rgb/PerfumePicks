#!/usr/bin/env node
/**
 * asc-submit-for-review.mjs
 *
 * Submits an already-uploaded build to App Store review via the App Store
 * Connect API, so we don't have to click through ASC by hand every release.
 *
 * What it does (in order):
 *   1. Resolve the build (by version + build number) for the app.
 *   2. Find or create the App Store version (e.g. 1.0.1, iOS).
 *   3. Attach the build to that version.
 *   4. Set the en-US "What's New" text.
 *   5. Create a review submission, add the version to it, and submit.
 *
 * Export compliance is NOT asked here because app.json sets
 * ITSAppUsesNonExemptEncryption=false, which Apple reads straight from the
 * binary. If that ever changes, the submit step will surface Apple's error.
 *
 * SAFETY: dry-run by default. It only performs read-only GETs and prints the
 * plan unless you pass --submit. The irreversible public step stays behind an
 * explicit flag on purpose.
 *
 * Required env (put in .env.local, never commit the .p8):
 *   ASC_KEY_ID        App Store Connect API key id (e.g. D9S2GHMJBM)
 *   ASC_ISSUER_ID     The issuer id from ASC > Users and Access > Integrations
 *   ASC_API_KEY_PATH  Path to the downloaded AuthKey_XXXX.p8 file
 *                     (or ASC_API_KEY_P8 with the key contents inline)
 *
 * Usage:
 *   node scripts/asc-submit-for-review.mjs                 # dry run
 *   node scripts/asc-submit-for-review.mjs --submit        # actually submit
 *   VERSION=1.0.1 BUILD_NUMBER=18 node scripts/asc-submit-for-review.mjs --submit
 */

import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- config -------------------------------------------------------------

const APP_ID = process.env.ASC_APP_ID || '6774184221'; // Perfume Picks
const VERSION = process.env.VERSION || '1.0.1';
const BUILD_NUMBER = process.env.BUILD_NUMBER || '18';
const LOCALE = process.env.ASC_LOCALE || 'en-US';
const RELEASE_TYPE = (process.env.ASC_RELEASE_TYPE || 'MANUAL').toUpperCase(); // MANUAL | AFTER_APPROVAL
const SUBMIT = process.argv.includes('--submit');

const WHATS_NEW =
  process.env.WHATS_NEW ||
  `Meet your Fragrance DNA. Pick a few bottles you love and we read the notes and accords behind them, then match you to scents built from the same stuff. You get an archetype that sums up your taste and a top match you can buy. It sharpens the more you use it.`;

const BASE = 'https://api.appstoreconnect.apple.com';

// ---- tiny .env.local loader (no dep) ------------------------------------

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvLocal();

// ---- jwt (ES256, no dep) ------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken() {
  const keyId = need('ASC_KEY_ID');
  const issuerId = need('ASC_ISSUER_ID');
  let pem = process.env.ASC_API_KEY_P8;
  if (!pem) {
    const keyPath = need('ASC_API_KEY_PATH');
    if (!existsSync(keyPath)) fail(`ASC_API_KEY_PATH points at a missing file: ${keyPath}`);
    pem = readFileSync(keyPath, 'utf8');
  }
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: pem,
    dsaEncoding: 'ieee-p1363', // JOSE raw r||s, not DER
  });
  return `${signingInput}.${b64url(signature)}`;
}

// ---- api helper ---------------------------------------------------------

let TOKEN = null;
async function api(method, path, body) {
  if (!TOKEN) TOKEN = makeToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join('; ') || text;
    fail(`${method} ${path} -> ${res.status}\n${detail}`);
  }
  return json;
}

// ---- helpers ------------------------------------------------------------

function need(k) {
  const v = process.env[k];
  if (!v) fail(`Missing required env var: ${k}`);
  return v;
}
function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
function log(msg) {
  console.log(msg);
}

// ---- steps --------------------------------------------------------------

async function resolveBuild() {
  const q = `/v1/builds?filter[app]=${APP_ID}&filter[version]=${BUILD_NUMBER}&filter[preReleaseVersion.version]=${VERSION}&limit=1`;
  const r = await api('GET', q);
  const build = r?.data?.[0];
  if (!build) fail(`No build found for ${VERSION} (${BUILD_NUMBER}) on app ${APP_ID}. Is it done uploading/processing?`);
  log(`• Build resolved: ${VERSION} (${BUILD_NUMBER}) id=${build.id} state=${build.attributes?.processingState}`);
  if (build.attributes?.processingState !== 'VALID') {
    log(`  ⚠ build processingState is ${build.attributes?.processingState}; Apple may still be processing it.`);
  }
  return build.id;
}

async function findOrCreateVersion() {
  const r = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${VERSION}&limit=1`);
  const existing = r?.data?.[0];
  if (existing) {
    log(`• App Store version ${VERSION} exists: id=${existing.id} state=${existing.attributes?.appStoreState}`);
    return existing.id;
  }
  if (!SUBMIT) {
    log(`• [dry-run] would CREATE App Store version ${VERSION} (iOS)`);
    return '<new-version-dry-run>';
  }
  const created = await api('POST', '/v1/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString: VERSION, releaseType: RELEASE_TYPE },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  log(`• Created App Store version ${VERSION}: id=${created.data.id}`);
  return created.data.id;
}

async function attachBuild(versionId, buildId) {
  if (!SUBMIT) {
    log(`• [dry-run] would attach build ${buildId} to version ${versionId}`);
    return;
  }
  await api('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: buildId },
  });
  log(`• Attached build to version.`);
}

async function setWhatsNew(versionId) {
  if (!SUBMIT) {
    log(`• [dry-run] would set "What's New" (${LOCALE}):\n    ${WHATS_NEW}`);
    return;
  }
  const r = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const loc = r?.data?.find((l) => l.attributes?.locale === LOCALE) || r?.data?.[0];
  if (!loc) fail(`No localization found on version ${versionId} to set whatsNew.`);
  await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { whatsNew: WHATS_NEW } },
  });
  log(`• Set "What's New" on ${loc.attributes?.locale}.`);
}

async function submitForReview(versionId) {
  if (!SUBMIT) {
    log(`• [dry-run] would create a review submission and submit version ${versionId}.`);
    return;
  }
  // Reuse an in-progress submission if one is open, else create one.
  let subId;
  const open = await api(
    'GET',
    `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_PROGRESS,UNRESOLVED_ISSUES&limit=1`,
  ).catch(() => null);
  if (open?.data?.[0]) {
    subId = open.data[0].id;
    log(`• Reusing existing review submission: ${subId}`);
  } else {
    const created = await api('POST', '/v1/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    subId = created.data.id;
    log(`• Created review submission: ${subId}`);
  }

  await api('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: subId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  });
  log(`• Added version ${versionId} to the submission.`);

  await api('PATCH', `/v1/reviewSubmissions/${subId}`, {
    data: { type: 'reviewSubmissions', id: subId, attributes: { submitted: true } },
  });
  log(`\n✓ Submitted for App Review. Release type: ${RELEASE_TYPE}.`);
  log(`  Track it: https://appstoreconnect.apple.com/apps/${APP_ID}/appstore`);
}

// ---- main ---------------------------------------------------------------

(async () => {
  log(`App Store Connect submit-for-review`);
  log(`  app=${APP_ID} version=${VERSION} build=${BUILD_NUMBER} locale=${LOCALE} release=${RELEASE_TYPE}`);
  log(SUBMIT ? `  MODE: LIVE (--submit)\n` : `  MODE: dry-run (pass --submit to actually submit)\n`);

  const buildId = await resolveBuild();
  const versionId = await findOrCreateVersion();
  await attachBuild(versionId, buildId);
  await setWhatsNew(versionId);
  await submitForReview(versionId);

  if (!SUBMIT) {
    log(`\nDry run complete. Nothing was changed. Re-run with --submit to go live.`);
  }
})().catch((e) => fail(e?.stack || String(e)));
