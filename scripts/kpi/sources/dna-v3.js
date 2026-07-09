// dna-v3.js — DNA V3 archetype + picker-search KPIs (M5).
//
// The prod mirror of the CI balance gates (M2): elected-archetype distribution
// from user_taste_profiles, plus V3 search-pick adoption and the enrich-queue
// demand signal. Everything degrades gracefully pre-rollout (flag off, zero
// search events) — sections render "awaiting rollout", never throw.
//
// Reads: Supabase (user_taste_profiles.dna->archetype, app_settings flag row,
// dna_picker_events, enrich_requests + fragrances name join — enrich_requests
// is service-role-read-only by design) and PostHog (search_* events).
//
// NOTE on margin/lean: the election margin is NOT persisted (raw centroid
// distances never leave the engine — see src/features/dna/types.ts). What IS
// persisted per profile: archetype.primary, .modifier, and the living-lean
// signal (.challenger + .leaning). So this panel reports the distribution +
// lean counts and says so, rather than faking a margin histogram.

'use strict';

const { TABLES, EVENTS, LAUNCH_DATE } = require('../schema');
const posthogSource = require('./posthog');

// Same owner exclusion as every other Supabase metric (see sources/supabase.js).
const OWNER_USER_ID = 'f4810587-d519-49d3-8121-d9fdd8239159';

// ── V3 roster classification ───────────────────────────────────────────
// Mirrors src/features/dna/types.ts ArchetypeKey. 'legacy-only' keys can only
// have been elected by the legacy SCORERS path (crowd_pleaser is retired,
// rebel is legacy-only); 'v3-new' keys can only come from the centroid engine.
const V3_KEPT = [
  'the_executive', 'the_seducer', 'the_connoisseur', 'the_signature_wearer',
  'the_purist', 'the_showstopper', 'the_smart_shopper', 'the_romantic',
  'the_explorer', 'the_classicist',
];
const V3_NEW = [
  'the_gourmand', 'the_minimalist', 'the_naturalist', 'the_trendsetter',
  'the_old_soul', 'the_maximalist', 'the_night_owl', 'the_spice_trader',
  'the_daybreaker', 'the_soft_focus',
];

function classifyLabel(key) {
  if (V3_NEW.includes(key)) return 'v3-new';
  if (V3_KEPT.includes(key)) return 'kept';
  return 'legacy-only';
}

// ── Supabase REST helpers (custom selects; getRows in supabase.js is select=*) ──
async function restGet(env, pathAndQuery) {
  const res = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  });
  if (!res.ok) throw new Error(`${pathAndQuery.split('?')[0]} ${res.status}`);
  return await res.json();
}

async function restCount(env, table, filterParts = []) {
  const filter = filterParts.filter(Boolean).join('&');
  const res = await fetch(
    `${env.url}/rest/v1/${table}?select=id${filter ? `&${filter}` : ''}&limit=0`,
    {
      method: 'HEAD',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    },
  );
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1] || '0', 10);
  return Number.isNaN(total) ? 0 : total;
}

// ── Rollups (pure — unit-tested) ───────────────────────────────────────

/**
 * rows: [{ user_id, archetype: { primary, modifier, challenger?, leaning? } }]
 * Owner excluded to match every other dashboard metric.
 */
function rollupArchetypes(rows, { ownerId = OWNER_USER_ID } = {}) {
  const mine = (rows || []).filter(
    (r) => r.user_id !== ownerId && r.archetype && r.archetype.primary,
  );
  const byLabel = {};
  const byModifier = {};
  const byChallenger = {};
  let leans = 0;
  for (const r of mine) {
    const a = r.archetype;
    byLabel[a.primary] = (byLabel[a.primary] || 0) + 1;
    if (a.modifier) byModifier[a.modifier] = (byModifier[a.modifier] || 0) + 1;
    if (a.leaning && a.challenger) {
      leans += 1;
      byChallenger[a.challenger] = (byChallenger[a.challenger] || 0) + 1;
    }
  }
  const total = mine.length;
  const labels = Object.entries(byLabel)
    .map(([key, count]) => ({
      key,
      count,
      share: total > 0 ? count / total : 0,
      roster: classifyLabel(key),
    }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
  return {
    total,
    labels,
    distinct: labels.length,
    maxShare: labels[0] || null,
    modifiers: Object.entries(byModifier)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1)),
    leans: {
      count: leans,
      byChallenger: Object.entries(byChallenger)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1)),
    },
  };
}

/**
 * PostHog rows: [[event, outcome, n, u, n7]] grouped by (event, outcome).
 * totalPicks = grid+search picks since launch (dna_picker_events kind pick|favorite).
 * search_result_picked outcome 'docked'|'promoted' both count as search picks.
 */
function rollupSearch(rows, totalPicks) {
  const zero = { events: 0, users: 0, events7d: 0 };
  const sum = (acc, [, , n, u, n7]) => ({
    events: acc.events + n,
    users: acc.users + u,
    events7d: acc.events7d + n7,
  });
  const of = (event, outcome = null) =>
    (rows || [])
      .filter(([e, o]) => e === event && (outcome === null || o === outcome))
      .reduce(sum, zero);
  const opened = of(EVENTS.SEARCH_OPENED);
  const docked = of(EVENTS.SEARCH_RESULT_PICKED, 'docked');
  const promoted = of(EVENTS.SEARCH_RESULT_PICKED, 'promoted');
  const searchPicks = docked.events + promoted.events;
  return {
    opened,
    picked: of(EVENTS.SEARCH_RESULT_PICKED),
    docked,
    promoted,
    noResults: of(EVENTS.SEARCH_NO_RESULTS),
    enrichRequested: of(EVENTS.SEARCH_ENRICH_REQUESTED),
    searchPicks,
    totalPicks: totalPicks || 0,
    searchShare: totalPicks > 0 ? searchPicks / totalPicks : null,
    awaitingRollout: searchPicks === 0 && opened.events === 0,
  };
}

// ── Fetchers ───────────────────────────────────────────────────────────

async function fetchFlag(env) {
  const t = TABLES.appSettings;
  const rows = await restGet(env, `${t.name}?select=value&${t.keyCol}=eq.dna_v3_archetypes`);
  const raw = rows.length > 0 ? String(rows[0].value) : null;
  return {
    present: rows.length > 0,
    raw,
    enabled: raw === 'true' || raw === '1', // mirrors v3Flag.ts truthy check
  };
}

async function fetchArchetypeDistribution(env) {
  const t = TABLES.userTasteProfiles;
  // Alias the jsonb path so we pull ONLY the archetype envelope, not full DNA.
  const rows = await restGet(
    env,
    `${t.name}?select=user_id,archetype:dna->archetype&limit=5000`,
  );
  return rollupArchetypes(rows);
}

async function fetchTotalPicks(env, windows) {
  const t = TABLES.dnaPickerEvents;
  return await restCount(env, t.name, [
    `${t.timestampCol}=gte.${encodeURIComponent(windows.sinceLaunch.startIso)}`,
    `${t.kindCol}=in.(pick,favorite)`,
  ]);
}

async function fetchSearchAdoption(envPosthog, totalPicks) {
  if (!posthogSource.isConfigured(envPosthog)) {
    return { configured: false, ...rollupSearch([], totalPicks) };
  }
  const names = [
    EVENTS.SEARCH_OPENED, EVENTS.SEARCH_RESULT_PICKED,
    EVENTS.SEARCH_NO_RESULTS, EVENTS.SEARCH_ENRICH_REQUESTED,
  ].map((e) => `'${e}'`).join(', ');
  const rows = await posthogSource.hogql(envPosthog, `
    SELECT event,
      coalesce(toString(properties.outcome), '') AS outcome,
      count() AS n, count(DISTINCT person_id) AS u,
      countIf(timestamp >= now() - interval 7 day) AS n7
    FROM events
    WHERE ${posthogSource.NS} AND event IN (${names})
      AND toDate(timestamp) >= toDate('${LAUNCH_DATE}')
    GROUP BY event, outcome
  `);
  return { configured: true, ...rollupSearch(rows, totalPicks) };
}

// Enrich-on-demand queue: top-requested bottles, names joined from the catalog
// by SLUG (enrich_requests.fragrance_id is the app-level slug — never the
// fragrances uuid; see 202607091400_enrich_requests.sql).
async function fetchEnrichQueue(env, { top = 5 } = {}) {
  const t = TABLES.enrichRequests;
  if (!env.hasServiceRole) {
    return { total: 0, requesters: 0, top: [], error: 'service role required (RLS: no client reads)' };
  }
  const rows = await restGet(
    env,
    `${t.name}?select=fragrance_id,requested_by&limit=2000`,
  );
  const bySlug = {};
  const requesters = new Set();
  for (const r of rows) {
    bySlug[r.fragrance_id] = (bySlug[r.fragrance_id] || 0) + 1;
    if (r.requested_by) requesters.add(r.requested_by);
  }
  const topSlugs = Object.entries(bySlug)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
  let nameBySlug = {};
  if (topSlugs.length > 0) {
    try {
      const slugList = topSlugs.map(([s]) => `"${s}"`).join(',');
      const frags = await restGet(
        env,
        `${TABLES.fragrances.name}?select=slug,name,brand&slug=in.(${encodeURIComponent(slugList)})`,
      );
      nameBySlug = Object.fromEntries(frags.map((f) => [f.slug, `${f.brand} ${f.name}`]));
    } catch { /* names stay as slugs */ }
  }
  return {
    total: rows.length,
    requesters: requesters.size,
    top: topSlugs.map(([slug, requests]) => ({
      slug,
      label: nameBySlug[slug] || slug,
      requests,
    })),
  };
}

// Convenience: the whole V3 panel in one shot. Each leg fails soft so a single
// bad read never blanks the panel.
async function fetchAll(envs, windows) {
  const soft = (p, fallback) => p.catch((e) => ({ ...fallback, error: e.message }));
  const [flag, archetypes, totalPicks, enrichQueue] = await Promise.all([
    soft(fetchFlag(envs.supabase), { present: false, raw: null, enabled: false }),
    soft(fetchArchetypeDistribution(envs.supabase), { total: 0, labels: [] }),
    fetchTotalPicks(envs.supabase, windows).catch(() => 0),
    soft(fetchEnrichQueue(envs.supabase), { total: 0, top: [] }),
  ]);
  const search = await soft(
    fetchSearchAdoption(envs.posthog, totalPicks),
    { configured: false, ...rollupSearch([], totalPicks) },
  );
  return { flag, archetypes, search, enrichQueue };
}

module.exports = {
  OWNER_USER_ID,
  V3_KEPT,
  V3_NEW,
  classifyLabel,
  rollupArchetypes,
  rollupSearch,
  fetchFlag,
  fetchArchetypeDistribution,
  fetchTotalPicks,
  fetchSearchAdoption,
  fetchEnrichQueue,
  fetchAll,
};
