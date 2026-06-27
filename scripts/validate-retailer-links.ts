/**
 * Server-side affiliate link validator.
 *
 * Replaces the client-side probe removed from src/lib/affiliate.ts (commit
 * 2af9d22). Walks fragrance_retailer_links, checks whether each link's
 * *destination* product page still exists, and writes the result back to
 * link_status / last_checked_at / last_http_status. The app hides rows marked
 * 'dead' so a confirmed-404 link never ships as a Buy button.
 *
 * Two validation modes, picked per retailer:
 *
 *   A. Shopify catalog mode (perfumania, aromapassions). Their storefronts 429
 *      a per-URL probe after the first hit (per-IP abuse gate), so probing can't
 *      tell dead from alive. We instead fetch the retailer's public
 *      products.json once — the same endpoint the ETLs use, which does NOT
 *      rate-limit — and treat a link whose product handle is absent from the
 *      live catalog as dead. One catalog fetch, zero per-product hammering.
 *
 *   B. HTTP probe mode (everyone else, e.g. fragranceshop). Probe the
 *      DESTINATION product URL, never the affiliate click wrapper — wrappers
 *      (CJ anrdoezrs.net/click-…?url=…, Awin awin1.com/cread.php?…&ued=…) bill a
 *      phantom click on every hit and corrupt attribution. We decode the
 *      wrapper param and hit the real retailer page with a real browser UA.
 *
 * Classification (both modes):
 *   2xx / in catalog       → 'ok'      (recovers from 'dead' on re-run)
 *   404 / 410 / not in cat. → 'dead'   (hidden by the app)
 *   403/429/5xx/timeout/    → 'unknown' (inconclusive: bot-gate, rate-limit,
 *   catalog-fetch-failed                 transient — never marked dead)
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

const CONCURRENCY   = 8;      // simultaneous in-flight requests (across all hosts)
const PER_HOST_GAP  = 250;    // ms minimum spacing between hits to the SAME host
                              // (probe mode only; Shopify retailers use catalog mode)
const REQ_TIMEOUT   = 12_000; // ms per request before we give up (→ 'unknown')
const MAX_BACKOFF   = 8_000;  // ms cap on a 429/503 Retry-After wait
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Affiliate click-wrapper hosts and the query param that holds the real
// destination. We probe the DESTINATION, never the wrapper — hitting a wrapper
// bills a phantom click and corrupts attribution (CJ) or spend (Awin).
//   CJ   → anrdoezrs.net/click-…?url=…
//   Awin → awin1.com/cread.php?…&ued=…   (aromapassions)
const WRAPPER_PARAM: Record<string, string> = {
  'www.anrdoezrs.net': 'url', 'anrdoezrs.net': 'url',
  'www.dpbolvw.net':   'url', 'dpbolvw.net':   'url',
  'www.kqzyfj.com':    'url', 'kqzyfj.com':    'url',
  'www.tkqlhce.com':   'url', 'tkqlhce.com':   'url',
  'www.lduhtrp.net':   'url', 'lduhtrp.net':   'url',
  'www.jdoqocy.com':   'url', 'jdoqocy.com':   'url',
  'www.awin1.com':     'ued', 'awin1.com':     'ued',
};

// Shopify-backed retailers. Their storefronts 429 a per-URL probe after the
// first hit (per-IP abuse gate), so probing can't tell dead from alive. Instead
// we fetch the retailer's public products.json once (the same endpoint the ETLs
// use, which does NOT rate-limit) and treat a link whose product handle is
// absent from the live catalog as dead. retailer → storefront base URL.
const SHOPIFY_RETAILERS: Record<string, string> = {
  perfumania:    'https://perfumania.com',
  aromapassions: 'https://aromapassions.com',
};

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

  const param = WRAPPER_PARAM[u.hostname.toLowerCase()];
  if (param) {
    const dest = u.searchParams.get(param);
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

function retryAfterMs(res: Response): number {
  const h = res.headers.get('retry-after');
  if (h) {
    const secs = Number(h);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_BACKOFF);
  }
  return 2_000; // sensible default backoff when the host gives no hint
}

async function probe(dest: string): Promise<ProbeResult> {
  // HEAD first (cheap). Some stores reject HEAD (405/501/403) or lie about it —
  // fall back to GET before trusting the verdict.
  try {
    let res = await fetchWithTimeout(dest, 'HEAD');
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetchWithTimeout(dest, 'GET');
    }
    // Rate-limited / temporarily unavailable: back off once and retry with GET.
    // Without this, fast hosts like Shopify throttle us to 429 and every link
    // reads as 'unknown' — measuring our request rate, not link health.
    if (res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, retryAfterMs(res)));
      res = await fetchWithTimeout(dest, 'GET');
    }
    return { status: classify(res.status), httpStatus: res.status };
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

// ─── Shopify catalog mode ───────────────────────────────────────────────────

/** Extract the Shopify product handle from a `/products/{handle}` URL. */
function shopifyHandle(destUrl: string): string | null {
  try {
    const m = new URL(destUrl).pathname.match(/\/products\/([^/]+)/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Fetch every published product handle from a Shopify storefront. */
async function fetchShopifyHandles(baseUrl: string): Promise<Set<string>> {
  const handles = new Set<string>();
  let page = 1;
  while (true) {
    const url = `${baseUrl}/products.json?limit=250&page=${page}`;
    let products: Array<{ handle: string }> = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetchWithTimeout(url, 'GET');
        if (res.status === 503 || res.status === 429) {
          await new Promise((r) => setTimeout(r, attempt * 3000));
          continue;
        }
        if (!res.ok) return handles; // give up this host; caller treats as unknown
        const data = (await res.json()) as { products?: Array<{ handle: string }> };
        products = data.products ?? [];
        break;
      } catch {
        if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    if (!products.length) break;
    for (const p of products) handles.add(p.handle.toLowerCase());
    page++;
    await new Promise((r) => setTimeout(r, 600)); // polite, mirrors the ETLs
  }
  return handles;
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

  const counts: Record<LinkStatus, number> = { ok: 0, dead: 0, unknown: 0 };
  const newlyDead: Array<{ id: string; retailer: string; dest: string }> = [];
  const updates: Array<{ id: string; link_status: LinkStatus; last_http_status: number | null }> = [];

  function record(row: LinkRow, status: LinkStatus, httpStatus: number | null, dest: string): void {
    counts[status]++;
    if (status === 'dead') newlyDead.push({ id: row.id, retailer: row.retailer, dest });
    updates.push({ id: row.id, link_status: status, last_http_status: httpStatus });
  }

  // Split rows: Shopify retailers (catalog membership) vs everyone else (probe).
  const shopifyRows = rows.filter((r) => SHOPIFY_RETAILERS[r.retailer]);
  const probeRows   = rows.filter((r) => !SHOPIFY_RETAILERS[r.retailer]);

  // ── Shopify catalog mode ────────────────────────────────────────────────────
  const byRetailer = new Map<string, LinkRow[]>();
  for (const r of shopifyRows) {
    const list = byRetailer.get(r.retailer);
    if (list) list.push(r);
    else byRetailer.set(r.retailer, [r]);
  }
  for (const [retailer, group] of byRetailer) {
    const base = SHOPIFY_RETAILERS[retailer];
    console.log(`  [${retailer}] fetching live catalog…`);
    const handles = await fetchShopifyHandles(base);
    console.log(`  [${retailer}] ${handles.size} live handles | checking ${group.length} links`);
    // An empty catalog means the fetch failed — don't mark everything dead.
    if (handles.size === 0) {
      for (const row of group) record(row, 'unknown', null, destinationUrl(row.url) ?? '(unparseable)');
      continue;
    }
    for (const row of group) {
      const dest   = destinationUrl(row.url);
      const handle = dest ? shopifyHandle(dest) : null;
      if (!handle) record(row, 'dead', null, dest ?? '(unparseable)');
      else if (handles.has(handle)) record(row, 'ok', 200, dest!);
      else record(row, 'dead', 404, dest!);
    }
  }

  // ── HTTP probe mode (non-Shopify retailers) ─────────────────────────────────
  let done = 0;
  await runPool(probeRows, async (row) => {
    const dest = destinationUrl(row.url);
    if (!dest) {
      record(row, 'dead', null, '(unparseable)');
    } else {
      await paceHost(dest);
      const { status, httpStatus } = await probe(dest);
      record(row, status, httpStatus, dest);
    }
    done++;
    if (done % 100 === 0) {
      console.log(`  probe ${done}/${probeRows.length} | ok:${counts.ok} dead:${counts.dead} unknown:${counts.unknown}`);
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
