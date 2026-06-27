/**
 * Server-side affiliate link validator.
 *
 * Replaces the client-side probe removed from src/lib/affiliate.ts (commit
 * 2af9d22). Walks fragrance_retailer_links, checks whether each link's
 * *destination* product page still exists, and writes the result back to
 * link_status / last_checked_at / last_http_status. The app hides rows marked
 * 'dead' so a confirmed-404 link never ships as a Buy button.
 *
 * Why this is safe where the client probe was not:
 *   1. It probes the DESTINATION product URL, never the CJ click wrapper. CJ
 *      wrappers (anrdoezrs.net/click-…?url=…) carry a cjevent on every hit, so
 *      fetching them registers phantom clicks and corrupts attribution. We
 *      decode the ?url= param and hit the real retailer page instead.
 *   2. It runs once (cron), server-side, with a real browser user-agent — so a
 *      retailer's Cloudflare bot-gate is far less likely to false-positive, and
 *      when it DOES (403 / 429 / 503 / timeout) we record 'unknown', never
 *      'dead'. Only an unambiguous 404 / 410 marks a link dead.
 *
 * Classification:
 *   2xx            → 'ok'      (link recovers to ok on re-run if it was dead)
 *   404 / 410      → 'dead'    (hidden by the app)
 *   403/429/5xx/   → 'unknown' (inconclusive: bot-gate, rate-limit, transient)
 *   timeout/error
 *
 * Required env (.env.local):
 *   SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/validate-retailer-links.ts                 # check everything
 *   npx tsx scripts/validate-retailer-links.ts --stale-days 7  # only rows not checked in 7d
 *   npx tsx scripts/validate-retailer-links.ts --retailer fragranceshop
 *   npx tsx scripts/validate-retailer-links.ts --limit 200
 *   npx tsx scripts/validate-retailer-links.ts --dry-run       # report, write nothing
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ─── Env / client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ─── Tunables ───────────────────────────────────────────────────────────────

const CONCURRENCY   = 8;      // simultaneous in-flight requests
const PER_HOST_GAP  = 400;    // ms minimum spacing between hits to the same host
const REQ_TIMEOUT   = 12_000; // ms per request before we give up (→ 'unknown')
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// CJ click-wrapper hosts whose ?url= param holds the real destination.
const CJ_HOSTS = new Set([
  'www.anrdoezrs.net', 'anrdoezrs.net',
  'www.dpbolvw.net',   'dpbolvw.net',
  'www.kqzyfj.com',    'kqzyfj.com',
  'www.tkqlhce.com',   'tkqlhce.com',
  'www.lduhtrp.net',   'lduhtrp.net',
  'www.jdoqocy.com',   'jdoqocy.com',
]);

type LinkStatus = 'ok' | 'dead' | 'unknown';

interface LinkRow { id: string; retailer: string; url: string; }

// ─── CLI args ───────────────────────────────────────────────────────────────

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const DRY_RUN    = process.argv.includes('--dry-run');
const STALE_DAYS = argVal('--stale-days') ? Number(argVal('--stale-days')) : null;
const RETAILER   = argVal('--retailer') ?? null;
const LIMIT      = argVal('--limit') ? Number(argVal('--limit')) : null;

// ─── Destination extraction ─────────────────────────────────────────────────

/**
 * Resolve the real product page to probe. For a CJ click wrapper, that's the
 * decoded ?url= param — NEVER the wrapper itself (probing the wrapper bills a
 * phantom CJ click). For a non-CJ link, the stored URL is already the
 * destination. Returns null if we can't parse a usable destination.
 */
function destinationUrl(stored: string): string | null {
  let u: URL;
  try { u = new URL(stored); } catch { return null; }

  if (CJ_HOSTS.has(u.hostname.toLowerCase())) {
    const dest = u.searchParams.get('url');
    if (!dest) return null;
    try {
      const d = new URL(dest); // decoded by URLSearchParams
      if (d.protocol !== 'http:' && d.protocol !== 'https:') return null;
      return d.toString();
    } catch {
      return null;
    }
  }
  return u.toString();
}

// ─── HTTP probe ─────────────────────────────────────────────────────────────

interface ProbeResult { status: LinkStatus; httpStatus: number | null; }

function classify(httpStatus: number): LinkStatus {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  if (httpStatus === 404 || httpStatus === 410) return 'dead';
  // 403 bot-gate, 429 rate-limit, 5xx transient, 3xx that didn't resolve, etc.
  return 'unknown';
}

async function fetchWithTimeout(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probe(dest: string): Promise<ProbeResult> {
  // HEAD first (cheap). Some stores reject HEAD (405/501) or lie about it —
  // fall back to a GET in that case before trusting the verdict.
  try {
    const head = await fetchWithTimeout(dest, 'HEAD');
    if (head.status === 405 || head.status === 501 || head.status === 403) {
      const get = await fetchWithTimeout(dest, 'GET');
      return { status: classify(get.status), httpStatus: get.status };
    }
    return { status: classify(head.status), httpStatus: head.status };
  } catch {
    // Network error / timeout / aborted → inconclusive, never dead.
    return { status: 'unknown', httpStatus: null };
  }
}

// ─── Per-host pacing + bounded concurrency ──────────────────────────────────

const lastHitByHost = new Map<string, number>();

async function paceHost(dest: string): Promise<void> {
  let host = '';
  try { host = new URL(dest).hostname; } catch { return; }
  const now  = Date.now();
  const last = lastHitByHost.get(host) ?? 0;
  const wait = Math.max(0, last + PER_HOST_GAP - now);
  lastHitByHost.set(host, now + wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Run `worker` over `items` with at most `CONCURRENCY` in flight. */
async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ─── Fetch candidate rows ───────────────────────────────────────────────────

async function fetchRows(db: SupabaseClient): Promise<LinkRow[]> {
  const PAGE = 1000;
  const rows: LinkRow[] = [];
  let offset = 0;

  const staleCutoff =
    STALE_DAYS != null
      ? new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString()
      : null;

  while (true) {
    let q = db
      .from('fragrance_retailer_links')
      .select('id, retailer, url')
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .range(offset, offset + PAGE - 1);

    if (RETAILER) q = q.eq('retailer', RETAILER);
    if (staleCutoff) q = q.or(`last_checked_at.is.null,last_checked_at.lt.${staleCutoff}`);

    const { data, error } = await q;
    if (error) throw new Error(`row fetch failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as LinkRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
    if (LIMIT && rows.length >= LIMIT) break;
  }

  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `Validating retailer links` +
    (RETAILER ? ` | retailer=${RETAILER}` : '') +
    (STALE_DAYS != null ? ` | stale>${STALE_DAYS}d` : '') +
    (LIMIT ? ` | limit=${LIMIT}` : '') +
    (DRY_RUN ? ` | DRY RUN` : ''),
  );

  const rows = await fetchRows(supabase);
  console.log(`Rows to check: ${rows.length}`);
  if (!rows.length) return;

  const counts: Record<LinkStatus | 'skipped', number> = { ok: 0, dead: 0, unknown: 0, skipped: 0 };
  const newlyDead: Array<{ id: string; retailer: string; dest: string }> = [];
  const updates: Array<{ id: string; link_status: LinkStatus; last_http_status: number | null }> = [];
  let done = 0;

  await runPool(rows, async (row) => {
    const dest = destinationUrl(row.url);
    if (!dest) {
      // Unparseable stored URL — record as dead, it can never open.
      counts.dead++;
      newlyDead.push({ id: row.id, retailer: row.retailer, dest: '(unparseable)' });
      updates.push({ id: row.id, link_status: 'dead', last_http_status: null });
    } else {
      await paceHost(dest);
      const { status, httpStatus } = await probe(dest);
      counts[status]++;
      if (status === 'dead') newlyDead.push({ id: row.id, retailer: row.retailer, dest });
      updates.push({ id: row.id, link_status: status, last_http_status: httpStatus });
    }

    done++;
    if (done % 100 === 0) {
      console.log(`  ${done}/${rows.length} | ok:${counts.ok} dead:${counts.dead} unknown:${counts.unknown}`);
    }
  });

  // ── Persist ────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n[dry-run] no writes performed.');
  } else {
    const checkedAt = new Date().toISOString();
    const BATCH = 200;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const slice = updates.slice(i, i + BATCH);
      // Per-row UPDATE (not upsert) so we never touch url/price/fragrance_id.
      const results = await Promise.all(
        slice.map((u) =>
          supabase
            .from('fragrance_retailer_links')
            .update({
              link_status:      u.link_status,
              last_http_status: u.last_http_status,
              last_checked_at:  checkedAt,
            })
            .eq('id', u.id),
        ),
      );
      for (const r of results) {
        if (r.error) console.warn(`  update failed: ${r.error.message}`);
        else written++;
      }
      console.log(`  wrote ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
    console.log(`Rows updated: ${written}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log(
    `\nDone. ok:${counts.ok} | dead:${counts.dead} | unknown:${counts.unknown}` +
    `  (total ${rows.length})`,
  );
  if (newlyDead.length) {
    console.log(`\nDead links (${newlyDead.length}):`);
    for (const d of newlyDead.slice(0, 50)) {
      console.log(`  [${d.retailer}] ${d.id} → ${d.dest}`);
    }
    if (newlyDead.length > 50) console.log(`  …and ${newlyDead.length - 50} more`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
