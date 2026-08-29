/**
 * monitor-edge-functions — alert when a function the APP CALLS is not deployed.
 *
 * WHY (2026-08-29 incident): claude-proxy and delete-account existed in the repo
 * but were never deployed to production. Every bottle scan POSTed ~850KB to a
 * 404 for 90 days — 20 Sentry errors across 8 users — and account deletion (an
 * App Store 5.1.1(v) requirement) 404'd the whole time. Nothing caught it,
 * because "the code is in the repo" and "the function is live" are different
 * facts and only one of them was ever checked.
 *
 * This closes that gap by comparing the two directly:
 *   1. grep the app source for supabase.functions.invoke('<name>')
 *   2. ask Supabase which functions are actually ACTIVE
 *   3. alert on anything invoked-but-not-deployed
 *
 * Also flags a deployed function that is missing a secret it reads at module
 * scope (Deno.env.get) — the second half of the same incident: claude-proxy was
 * deployed but inert because ANTHROPIC_API_KEY was unset.
 *
 * Read-only. Exit 1 when drift is found, so cron/CI can fail on it.
 * Run: node scripts/monitor-edge-functions.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECT_REF = 'jdkwlwyysgofljkobpmr';

// 1. what the app invokes
const invoked = new Set();
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|jsx)$/.test(e.name)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/functions\.invoke\(\s*['"`]([\w-]+)['"`]/g)) invoked.add(m[1]);
    for (const m of src.matchAll(/\/functions\/v1\/([\w-]+)/g)) invoked.add(m[1]);
  }
};
for (const d of ['src', 'app']) if (existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));

// 2. what is actually deployed
let deployed = new Map();
try {
  const out = execFileSync('npx', ['supabase', 'functions', 'list', '--project-ref', PROJECT_REF], { encoding: 'utf8' });
  const json = JSON.parse(out.slice(out.indexOf('{')));
  for (const f of json.functions ?? []) deployed.set(f.slug, f.status);
} catch (e) {
  console.error('[edge-monitor] could not list functions:', e.message);
  process.exit(2);
}

// 3. secrets that exist
let secrets = new Set();
try {
  const out = execFileSync('npx', ['supabase', 'secrets', 'list', '--project-ref', PROJECT_REF], { encoding: 'utf8' });
  for (const s of JSON.parse(out.slice(out.indexOf('{'))).secrets ?? []) secrets.add(s.name);
} catch { /* non-fatal — the deploy check is the primary signal */ }

const problems = [];
for (const fn of [...invoked].sort()) {
  const status = deployed.get(fn);
  if (!status) { problems.push(`MISSING: app invokes '${fn}' but it is NOT deployed (calls will 404)`); continue; }
  if (status !== 'ACTIVE') { problems.push(`INACTIVE: '${fn}' is deployed but status=${status}`); continue; }
  // deployed — does its source read a secret that is not set?
  const src = path.join(ROOT, 'supabase/functions', fn, 'index.ts');
  if (!existsSync(src)) continue;
  const body = readFileSync(src, 'utf8');
  for (const m of body.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) {
    const key = m[1];
    // Supabase injects these automatically; everything else must be set by us.
    if (['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'].includes(key)) continue;
    if (!secrets.has(key)) problems.push(`SECRET: '${fn}' reads ${key} but that secret is not set (function will run inert)`);
  }
}

console.log(`[edge-monitor] app invokes ${invoked.size}: ${[...invoked].sort().join(', ')}`);
console.log(`[edge-monitor] deployed ${deployed.size}: ${[...deployed.keys()].sort().join(', ')}`);
if (!problems.length) { console.log('[edge-monitor] ✅ no drift'); process.exit(0); }
console.log(`\n🚨 ${problems.length} problem(s):`);
problems.forEach((p) => console.log('  ' + p));
process.exit(1);
