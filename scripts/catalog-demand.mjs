/**
 * catalog-demand.mjs — the Phase 3 demand loop's read side.
 *
 * Turns "what do users want that we don't have" into a ranked add-list, by
 * unioning two signals:
 *   1. catalog_requests (Supabase) — EXPLICIT "Request it" taps. Strong intent,
 *      weighted 3x.
 *   2. search_no_results (PostHog)  — PASSIVE zero-result searches. Weighted 1x.
 *
 * Both are normalized (lower, accent-stripped, single-spaced) and merged by
 * normalized query, then a fuzzy check flags any term that WOULD now resolve
 * (so we don't chase bottles we've since added). Prints a prioritized list to
 * work with add-house-lineup-frags.ts / add-searched-frags.ts.
 *
 * Read-only. Run: node scripts/catalog-demand.mjs [--days 90]
 */
import { readFileSync } from 'fs';

const env = readFileSync(process.env.HOME + '/PerfumePicks/.env.local', 'utf8').split('\n');
for (const l of env) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY, PH_HOST = process.env.POSTHOG_HOST || 'https://us.posthog.com';
// Perfume's PostHog project only (496478 via env). A hardcoded second id here
// used to union POUR's project (396959), which mined bourbon zero-result
// searches into the perfume add-list.
const PH_PROJECTS = [process.env.POSTHOG_PROJECT_ID].filter(Boolean);
const DAYS = Number(process.argv[process.argv.indexOf('--days') + 1]) || 90;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function sb(path) { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : []; }
async function rpc(fn, body) { const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return r.ok ? r.json() : []; }
async function hogql(pid, q) {
  const r = await fetch(`${PH_HOST}/api/projects/${pid}/query/`, { method: 'POST', headers: { Authorization: `Bearer ${PH_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }) });
  return r.ok ? (await r.json()).results ?? [] : [];
}

async function main() {
  const demand = new Map(); // qn -> { qn, sample, explicit, passive, people }

  // 1. explicit catalog_requests (may not exist until the migration is run)
  const reqs = await sb(`catalog_requests?select=query,query_normalized,requested_by&created_at=gte.${new Date(Date.now() - DAYS * 864e5).toISOString()}`);
  for (const r of reqs) {
    const qn = r.query_normalized || norm(r.query);
    if (!qn) continue;
    const e = demand.get(qn) || { qn, sample: r.query, explicit: 0, passive: 0, people: new Set() };
    e.explicit++; if (r.requested_by) e.people.add(r.requested_by);
    demand.set(qn, e);
  }

  // 2. passive search_no_results (PostHog, both projects)
  const Q = `select properties.query as q, count() as n, count(distinct person_id) as p
    from events where event='search_no_results' and timestamp > now() - interval ${DAYS} day
    and properties.query is not null and properties.query != '' group by q`;
  for (const pid of PH_PROJECTS) for (const [q, n, p] of await hogql(pid, Q)) {
    const qn = norm(q); if (!qn) continue;
    const e = demand.get(qn) || { qn, sample: q, explicit: 0, passive: 0, people: new Set() };
    e.passive += Number(n); e.people.add(`ph:${qn}:${p}`); // people approx across sources
    demand.set(qn, e);
  }

  // 3. flag terms that WOULD now resolve (added since the miss) — skip those
  const rows = [...demand.values()];
  for (const e of rows) {
    const hits = await rpc('fuzzy_fragrance_search', { q: e.qn, lim: 1, min_sim: 0.42 });
    e.resolvesNow = Array.isArray(hits) && hits.length > 0;
  }

  const rank = (e) => e.explicit * 3 + e.passive;
  const open = rows.filter((e) => !e.resolvesNow).sort((a, b) => rank(b) - rank(a));
  const resolved = rows.filter((e) => e.resolvesNow);

  console.log(`\n=== CATALOG DEMAND (last ${DAYS}d) — ${open.length} open, ${resolved.length} now-resolved ===\n`);
  console.log('  score  explicit passive  query');
  for (const e of open) console.log(`  ${String(rank(e)).padStart(5)}  ${String(e.explicit).padStart(8)} ${String(e.passive).padStart(7)}  "${e.sample}"`);
  if (resolved.length) console.log(`\n  (${resolved.length} terms now resolve — already added: ${resolved.slice(0, 12).map((e) => `"${e.sample}"`).join(', ')}${resolved.length > 12 ? '…' : ''})`);
  console.log(`\nWork the top of the list into add-house-lineup-frags.ts / add-searched-frags.ts.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
