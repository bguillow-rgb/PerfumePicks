// ga4.js — GA4 Data API queries for the marketing site (perfumepicks.app,
// measurement id G-KTWQSNVMNW). Covers the web legs of the invite funnel:
// /i landing page_views and invite_store_cta_tap events.
//
// Auth: Google service account via a JWT-signed token exchange (no SDK dep).
// Env vars (.env.local):
//   GA4_PROPERTY_ID              — NUMERIC property id (Admin → Property settings),
//                                  NOT the G-KTWQSNVMNW measurement id.
//   GA4_SERVICE_ACCOUNT_KEY_PATH — path to a service-account JSON key with
//                                  Viewer access on the GA4 property.
//                                  (GOOGLE_APPLICATION_CREDENTIALS also works.)

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { LAUNCH_DATE } = require('../schema');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function loadEnv() {
  return {
    propertyId: process.env.GA4_PROPERTY_ID || '',
    keyPath:
      process.env.GA4_SERVICE_ACCOUNT_KEY_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '',
  };
}

function isConfigured(env) {
  return Boolean(env.propertyId && env.keyPath && fs.existsSync(env.keyPath));
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// Service-account JWT → access token (standard Google OAuth2 JWT bearer flow).
async function getAccessToken(env) {
  const key = JSON.parse(fs.readFileSync(env.keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`GA4 token exchange failed ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return (await res.json()).access_token;
}

async function runReport(env, token, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${env.propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 runReport failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return await res.json();
}

// With two dateRanges GA4 adds a dateRange dimension per row
// (date_range_0 = since launch, date_range_1 = last 7d). Sum the requested
// metric per range.
function sumByRange(report) {
  const out = { sinceLaunch: 0, last7d: 0 };
  for (const row of report.rows || []) {
    const dims = (row.dimensionValues || []).map((d) => d.value);
    const val = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;
    if (dims.includes('date_range_1')) out.last7d += val;
    else out.sinceLaunch += val;
  }
  return out;
}

// ── Invite landing legs: /i page_views + invite_store_cta_tap ─────────
async function fetchInviteLanding(env, now = new Date()) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error: 'GA4 not configured — add GA4_PROPERTY_ID (numeric) + GA4_SERVICE_ACCOUNT_KEY_PATH to .env.local',
    };
  }
  const token = await getAccessToken(env);
  const today = now.toISOString().slice(0, 10);
  const dateRanges = [
    { startDate: LAUNCH_DATE, endDate: today },   // date_range_0
    { startDate: '7daysAgo', endDate: today },    // date_range_1
  ];

  const [pageViews, ctaTaps] = await Promise.all([
    runReport(env, token, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      // pagePath drops the ?a=&r= query, so the landing is exactly /i (or /i/).
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          inListFilter: { values: ['/i', '/i/'] },
        },
      },
    }),
    runReport(env, token, {
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: 'invite_store_cta_tap' },
        },
      },
    }),
  ]);

  return {
    configured: true,
    landingViews: sumByRange(pageViews),
    storeCtaTaps: sumByRange(ctaTaps),
  };
}

module.exports = {
  loadEnv,
  isConfigured,
  fetchInviteLanding,
};
