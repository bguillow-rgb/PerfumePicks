// revenuecat.js — RevenueCat v2 metrics overview for Perfume Picks.
//
// Uses REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY.
// If these aren't set (they may not be yet for a pre-launch app), the module
// gracefully returns configured=false with an explanation.
//
// SANDBOX: RC metrics include sandbox and can't be filtered reliably via API.
// ASC proceeds are the production-only ground truth for revenue.

'use strict';

function loadEnv() {
  return {
    project: process.env.REVENUECAT_PROJECT_ID || '',
    secret: process.env.REVENUECAT_SECRET_KEY || '',
  };
}

function isConfigured(env) {
  return Boolean(env.project && env.secret);
}

async function fetchOverview(env) {
  if (!isConfigured(env)) {
    return {
      configured: false,
      error: 'REVENUECAT_PROJECT_ID or REVENUECAT_SECRET_KEY missing — add to .env.local to enable RevenueCat metrics',
    };
  }
  const url = `https://api.revenuecat.com/v2/projects/${env.project}/metrics/overview`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.secret}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { configured: true, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    const json = await res.json();
    const metrics = Object.fromEntries(
      (json.metrics || []).map((m) => [m.id, m])
    );
    return {
      configured: true,
      activeSubscriptions: metrics.active_subscriptions?.value ?? null,
      activeTrials: metrics.active_trials?.value ?? null,
      activeUsers: metrics.active_users?.value ?? null,
      mrr: metrics.mrr?.value ?? null,
      revenue28d: metrics.revenue?.value ?? null,
      newCustomers28d: metrics.new_customers?.value ?? null,
      raw: metrics,
      sandboxNote: 'RC metrics include sandbox; ASC proceeds are production-only ground truth.',
    };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}

module.exports = {
  loadEnv,
  isConfigured,
  fetchOverview,
};
