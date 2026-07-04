// cj.js — CJ (Commission Junction) affiliate commissions for the KPI dashboard.
//
// Answers "is the affiliate program actually paying?" — sales + commission for
// THIS app only, isolated by CJ Website ID (Perfume Picks = 101759456), since
// the CJ publisher account is shared across the Picks family (Percolate, ITIN,
// etc. post into the same account).
//
// Clicks are NOT in CJ's commission API — those come from the durable Supabase
// affiliate_clicks ledger (see supabase.js fetchAffiliateClicks). CJ is the
// source of truth for the money side: sales that attributed and commission earned.
//
// Uses the CJ Commission Detail GraphQL API (developers.cj.com):
//   POST https://commissions.api.cj.com/query
//   Authorization: Bearer <CJ_PERSONAL_ACCESS_TOKEN>
//
// Env (all optional; module stays dark until the token is set):
//   CJ_PERSONAL_ACCESS_TOKEN  — generate at developers.cj.com → Authentication
//   CJ_PUBLISHER_CID          — CJ publisher/company id (default 7966973)
//   CJ_WEBSITE_ID             — this app's CJ website id (default 101759456)

'use strict';

const ENDPOINT = 'https://commissions.api.cj.com/query';
// CJ caps a single commission query at a 30-day event-date window.
const WINDOW_DAYS = 30;

function loadEnv() {
  return {
    token: process.env.CJ_PERSONAL_ACCESS_TOKEN || '',
    cid: process.env.CJ_PUBLISHER_CID || '7966973',
    websiteId: process.env.CJ_WEBSITE_ID || '101759456',
  };
}

function isConfigured(env) {
  return Boolean(env.token && env.cid);
}

function isoDaysAgo(days, now) {
  return new Date(now.getTime() - days * 86400_000).toISOString();
}

async function fetchAll(env, now = new Date()) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error:
        'CJ_PERSONAL_ACCESS_TOKEN missing — generate a token at developers.cj.com and add it (plus optional CJ_PUBLISHER_CID / CJ_WEBSITE_ID) to .env.local to enable affiliate revenue metrics',
    };
  }

  const since = isoDaysAgo(WINDOW_DAYS, now);
  const before = now.toISOString();

  // publisherCommissions returns one record per commissionable action. We roll
  // it up in JS: total sales/commission, and a per-advertiser split.
  const query = `{
    publisherCommissions(
      forPublishers: ["${env.cid}"]
      sinceEventDate: "${since}"
      beforeEventDate: "${before}"
    ) {
      count
      payloadComplete
      records {
        advertiserName
        websiteId
        actionType
        actionStatus
        saleAmountUsd
        pubCommissionAmountUsd
        eventDate
      }
    }
  }`;

  let json;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { configured: true, error: `CJ ${res.status}: ${body.slice(0, 200)}` };
    }
    json = await res.json();
  } catch (e) {
    return { configured: true, error: `CJ request failed: ${e.message}` };
  }

  if (json.errors && json.errors.length) {
    return { configured: true, error: `CJ GraphQL: ${json.errors[0].message}` };
  }

  const block = json.data?.publisherCommissions;
  const all = block?.records ?? [];
  // Isolate THIS app by CJ website id — the account is shared across apps.
  const mine = all.filter((r) => String(r.websiteId) === String(env.websiteId));

  const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
  const byAdvertiser = {};
  let salesUsd = 0;
  let commissionUsd = 0;
  for (const r of mine) {
    const adv = r.advertiserName || 'Unknown';
    const sale = num(r.saleAmountUsd);
    const comm = num(r.pubCommissionAmountUsd);
    salesUsd += sale;
    commissionUsd += comm;
    const a = (byAdvertiser[adv] ||= { actions: 0, salesUsd: 0, commissionUsd: 0 });
    a.actions += 1;
    a.salesUsd += sale;
    a.commissionUsd += comm;
  }

  return {
    configured: true,
    windowDays: WINDOW_DAYS,
    websiteId: env.websiteId,
    actions: mine.length, // commissionable actions (sales/leads) attributed to this app
    salesUsd,
    commissionUsd,
    byAdvertiser,
    payloadComplete: block?.payloadComplete !== false,
    note:
      mine.length === 0
        ? 'No attributed sales yet in the last 30d — clicks tracking (see affiliate_clicks ledger), waiting on first purchase.'
        : undefined,
  };
}

module.exports = { loadEnv, isConfigured, fetchAll };
