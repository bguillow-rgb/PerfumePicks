/**
 * retention-report — is the daily SOTD push bringing people back?
 *
 * WHY THIS EXISTS: the 2026-09-01 cohort read found 89% of users gone within 2
 * days, only 6% alive past a week, and — the surprise — that building a wardrobe
 * did NOT predict return (37% / 37% / 28% for 0 / 1-2 / 3+ bottles). Neither did
 * signing in (39% vs 35%). Ten weekly cohorts showed no trend. The app delivers
 * a one-time payoff (your Fragrance DNA) and has no reason to exist on day two.
 * The daily SOTD push is the first real attempt at a reason, so it needs to be
 * measured properly rather than eyeballed.
 *
 * THE MEASUREMENT PROBLEM: users who grant push permission are self-selected —
 * they were already more interested. A naive "push users retain better" is
 * therefore almost guaranteed to be true and almost meaningless.
 *
 * So the primary read here is WITHIN-USER: for each person who registered a
 * token, compare their own activity rate in the window BEFORE they had it with
 * the window AFTER. Each user is their own control, which cancels the selection
 * effect. The between-user comparison is printed too, clearly labelled as
 * confounded, because it is the number people will ask for.
 *
 * "Active day" = a day with any DB write (DNA event, wardrobe, wear, swipe,
 * affiliate tap, taste recompute, login-date touch). Pure browsing that writes
 * nothing is invisible, so every number here is a FLOOR, not a census.
 *
 * Read-only. Run weekly:  node scripts/retention-report.mjs [--days 60]
 */
import { readFileSync } from 'fs';

const env = readFileSync(process.env.HOME + '/PerfumePicks/.env.local', 'utf8').split('\n');
for (const l of env) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
const SB = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const OWNER = 'f4810587-d519-49d3-8121-d9fdd8239159';  // founder — excluded from every user metric
const LAUNCH = '2026-06-25';
const DAYS = Number(process.argv[process.argv.indexOf('--days') + 1]) || 60;

const day = (t) => (t ? String(t).slice(0, 10) : null);
const dnum = (d) => Date.parse(d + 'T00:00:00Z') / 864e5;
async function page(p) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const r = await fetch(`${SB}/rest/v1/${p}&limit=1000&offset=${i}`, { headers: H });
    if (!r.ok) return out;
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) break;
    out.push(...d); if (d.length < 1000) break;
  }
  return out;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n=== PERFUME PICKS RETENTION — ${today} ===`);
  console.log(`cohort: signups since ${LAUNCH}, founder excluded. "Active day" = a day with any DB write (a FLOOR).\n`);

  const profiles = (await page('profiles?select=id,created_at,last_login_date'))
    .filter((p) => p.id !== OWNER && day(p.created_at) >= LAUNCH);
  const U = new Map(profiles.map((p) => [p.id, { created: day(p.created_at), days: new Set([day(p.created_at)]) }]));
  const touch = (u, d) => { const c = U.get(u); if (c && d) c.days.add(d); };
  for (const t of ['dna_picker_events', 'wardrobe_items', 'wear_logs', 'swipe_feedback', 'affiliate_clicks'])
    for (const r of await page(`${t}?select=user_id,created_at`)) touch(r.user_id, day(r.created_at));
  for (const r of await page('user_taste_profiles?select=user_id,last_updated')) touch(r.user_id, day(r.last_updated));
  for (const p of profiles) if (p.last_login_date) touch(p.id, day(p.last_login_date));

  // push tokens (first registration per user)
  const tok = new Map();
  for (const r of await page('push_tokens?select=user_id,created_at,invalid_at,last_pushed_on')) {
    const d = day(r.created_at);
    const cur = tok.get(r.user_id);
    if (!cur || d < cur.since) tok.set(r.user_id, { since: d, invalid: !!r.invalid_at, lastPushed: r.last_pushed_on });
  }

  const all = [...U.entries()].map(([id, c]) => ({ id, ...c, tok: tok.get(id) ?? null }));
  const withTok = all.filter((u) => u.tok), without = all.filter((u) => !u.tok);
  console.log('COVERAGE');
  console.log(`  users in cohort            : ${all.length}`);
  console.log(`  with a push token          : ${withTok.length}  (${(withTok.length / all.length * 100).toFixed(0)}%)`);
  console.log(`  tokens marked dead         : ${withTok.filter((u) => u.tok.invalid).length}`);
  const pushedRecently = withTok.filter((u) => u.tok.lastPushed && dnum(today) - dnum(u.tok.lastPushed) <= 1).length;
  console.log(`  pushed in the last 24h     : ${pushedRecently}`);

  // ── PRIMARY: within-user before/after ──────────────────────────────────────
  // Each user is their own control, so the "push users were keener anyway"
  // selection effect cancels. Only users with real observable time on BOTH sides
  // count — otherwise the comparison is against an empty window.
  console.log('\nWITHIN-USER — activity rate before vs after their own token (PRIMARY)');
  const MIN_WIN = 3;
  const rows = [];
  for (const u of withTok) {
    const t = dnum(u.tok.since), c = dnum(u.created), now = dnum(today);
    const preLen = t - c, postLen = now - t;
    if (preLen < MIN_WIN || postLen < MIN_WIN) continue;
    const ds = [...u.days].map(dnum);
    const pre = ds.filter((d) => d >= c && d < t).length / preLen;
    const post = ds.filter((d) => d >= t).length / postLen;
    rows.push({ pre, post });
  }
  if (rows.length < 5) {
    console.log(`  not enough users with >=${MIN_WIN} observable days on BOTH sides yet (have ${rows.length}).`);
    console.log('  This is the number that will answer the question — re-run weekly until it passes ~20.');
  } else {
    const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
    const up = rows.filter((r) => r.post > r.pre).length;
    console.log(`  users measured             : ${rows.length}`);
    console.log(`  active-days/day BEFORE     : ${mean('pre').toFixed(3)}`);
    console.log(`  active-days/day AFTER      : ${mean('post').toFixed(3)}`);
    const lift = mean('pre') > 0 ? ((mean('post') / mean('pre') - 1) * 100).toFixed(0) : 'n/a';
    console.log(`  change                     : ${lift}%`);
    console.log(`  users who got MORE active  : ${up}/${rows.length} (${(up / rows.length * 100).toFixed(0)}%)`);
    console.log('  NOTE: a token is registered when the user opens the app, so the day');
    console.log('  itself is active by construction — the AFTER window starts that day.');
  }

  // ── SECONDARY: between-user (confounded) ───────────────────────────────────
  console.log('\nBETWEEN-USER — token vs no token (CONFOUNDED: push-granters self-select)');
  const seg = (s) => {
    const ret = s.filter((u) => u.days.size >= 2).length;
    const span = s.map((u) => { const d = [...u.days].map(dnum).sort((a, b) => a - b); return d[d.length - 1] - d[0]; });
    return { n: s.length, ret, pct: s.length ? (ret / s.length * 100).toFixed(0) : '-', avgSpan: s.length ? (span.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : '-' };
  };
  console.log('  segment        users  returned   rate   avg days alive');
  for (const [l, s] of [['with token', withTok], ['no token', without]]) {
    const x = seg(s);
    console.log(`  ${l.padEnd(13)} ${String(x.n).padStart(5)}  ${String(x.ret).padStart(8)}  ${String(x.pct + '%').padStart(5)}   ${x.avgSpan}`);
  }

  // ── Trend: weekly signup cohorts, so a real change shows up over time ──────
  console.log('\nWEEKLY SIGNUP COHORTS — watch this for a step change after the push');
  const wk = (d) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); };
  const byWk = {};
  for (const u of all) (byWk[wk(u.created)] ??= []).push(u);
  console.log('  week of      signups  returned   rate   w/ token');
  for (const w of Object.keys(byWk).sort().slice(-DAYS / 7 - 1)) {
    const s = byWk[w], r = s.filter((u) => u.days.size >= 2).length, t = s.filter((u) => u.tok).length;
    console.log(`  ${w}   ${String(s.length).padStart(5)}  ${String(r).padStart(8)}  ${String((r / s.length * 100).toFixed(0) + '%').padStart(5)}   ${t}`);
  }
  console.log('\nRe-run weekly. The WITHIN-USER block is the one that answers "did the push work".\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
