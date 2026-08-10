// feedback-hub.js — NPS from the shared Picks feedback hub.
//
// The `feedback` table is a cross-app inbox that lives in the POUR PICKS
// Supabase project, not this app's. Every Picks app inserts into it tagged with
// its own `app` value (see src/lib/feedbackHub.ts), and one poller on the
// founder's machine iMessages each row. NPS scores land there as kind='nps'
// with a 0-10 `rating`.
//
// Reading them back therefore needs the HUB's credentials, which are separate
// from this app's SUPABASE_* vars:
//   FEEDBACK_HUB_URL
//   FEEDBACK_HUB_SERVICE_ROLE_KEY
// Client RLS on that table is insert-only, so a service-role key is required to
// read. Gracefully skips when unset, same as every other optional source.
//
// Scoped to APP_TAG so another app's scores can never show up on this
// dashboard.

'use strict';

const APP_TAG = 'perfumepicks';

function loadEnv() {
  return {
    url: process.env.FEEDBACK_HUB_URL || '',
    key: process.env.FEEDBACK_HUB_SERVICE_ROLE_KEY || '',
  };
}

function isConfigured(env) {
  return Boolean(env.url && env.key);
}

// Standard NPS: promoters 9-10, passives 7-8, detractors 0-6.
function bucket(list) {
  const promoters = list.filter((r) => r.rating >= 9).length;
  const passives = list.filter((r) => r.rating >= 7 && r.rating <= 8).length;
  const detractors = list.filter((r) => r.rating <= 6).length;
  const n = list.length;
  return {
    n,
    promoters,
    passives,
    detractors,
    score: n > 0 ? Math.round(((promoters - detractors) / n) * 100) : null,
    avg: n > 0 ? list.reduce((s, r) => s + r.rating, 0) / n : null,
  };
}

async function fetchNps(env) {
  if (!isConfigured(env)) return { configured: false };

  const qs = [
    `app=eq.${APP_TAG}`,
    'kind=eq.nps',
    'rating=not.is.null',
    'select=rating,created_at,message',
    'order=created_at.desc',
    'limit=1000',
  ].join('&');

  try {
    const res = await fetch(`${env.url}/rest/v1/feedback?${qs}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) return { configured: true, error: `hub ${res.status}` };
    const rows = await res.json();
    if (!Array.isArray(rows)) return { configured: true, error: 'unexpected hub response' };

    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
    return {
      configured: true,
      lifetime: bucket(rows),
      last30d: bucket(rows.filter((r) => r.created_at >= cutoff30)),
      // The verbatim attached to a score is the reason behind the number —
      // higher signal than the number itself at these sample sizes.
      recentComments: rows
        .filter((r) => r.message && r.message.trim())
        .slice(0, 3)
        .map((r) => ({
          rating: r.rating,
          message: r.message.trim(),
          date: r.created_at.slice(0, 10),
        })),
      latestAt: rows[0]?.created_at ?? null,
    };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}

module.exports = { loadEnv, isConfigured, fetchNps, APP_TAG };
