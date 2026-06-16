/**
 * audit-non-fragrance (read-only)
 *
 * The catalog leaks non-fragrance products (skincare serums, makeup, etc.)
 * because the name-keyword classifiers can't catch brand listings like
 * "Advanced Night Repair Synchronized Multi-Recovery Complex".
 *
 * Shopify's `product_type` IS the authoritative signal. This script:
 *   1. Fetches the full Perfumania products.json (handle → product_type).
 *   2. Reports the product_type distribution.
 *   3. Joins handles to active DB fragrances via the handle embedded in each
 *      perfumania `fragrance_retailer_links.url`, and flags any active
 *      fragrance whose product_type is NOT a fragrance type.
 *   4. Also runs an expanded skincare/makeup keyword scan over active names
 *      (catches non-Perfumania-sourced rows too).
 *
 * Writes NOTHING. Usage: npx tsx scripts/audit-non-fragrance.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BASE_URL = 'https://perfumania.com';

interface ShopifyProduct { title: string; handle: string; product_type: string; }

async function fetchFeed(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let page = 1;
  while (true) {
    const url = `${BASE_URL}/products.json?limit=250&page=${page}`;
    let products: ShopifyProduct[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.status === 503 || res.status === 429) { await new Promise(r => setTimeout(r, attempt * 3000)); continue; }
        if (!res.ok) break;
        products = ((await res.json()) as any).products ?? [];
        break;
      } catch { if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 2000)); }
    }
    if (!products.length) break;
    all.push(...products);
    page++;
    await new Promise(r => setTimeout(r, 600));
  }
  return all;
}

/**
 * Bucket a product_type string:
 *   'frag'       → genuine wearable fragrance (KEEP)
 *   'skincare'   → skincare/makeup/bath/accessory (DEFINITELY remove)
 *   'set'        → gift sets / bundles / miniatures (remove — not a single scent)
 *   'borderline' → body spray / scent / blank (judgment call)
 */
function bucketType(pt: string): 'frag' | 'skincare' | 'set' | 'borderline' {
  const t = (pt || '').toLowerCase().trim();
  // Genuine fragrance concentrations & types — oil & elixir ARE fragrances.
  if (/\b(fragrance|perfume|cologne|parfum|toilette|eau de|elixir|extrait|essence|^oil$|perfume oil)\b/.test(t) || t === 'oil') return 'frag';
  if (/(gift set|\bset\b|miniature|coffret|trio|piece)/.test(t)) return 'set';
  if (/(beauty|moisturi|body cream|body lotion|dusting powder|after shave|aftershave|concentrate|thermale|skin|makeup|cosmetic|accessor|lip balm|cream|lotion|serum|cleanser|toner|mask)/.test(t)) return 'skincare';
  if (t === '' || /(body spray|body mist|scent)/.test(t)) return 'borderline';
  return 'borderline';
}
function isFragranceType(pt: string): boolean { return bucketType(pt) === 'frag'; }

/** Expanded skincare / makeup / bath keyword scan (name-based fallback). */
const NON_FRAG_NAME = [
  /\bserum\b/i, /\bmoisturi[sz]/i, /\bnight\s+repair\b/i, /recovery\s+complex/i,
  /\bcleanser\b/i, /\btoner\b/i, /\bexfoliat/i, /\bpeel\b/i, /\bessence\b/i,
  /\bampoule\b/i, /\beye\s+cream\b/i, /\bface\s+cream\b/i, /\bday\s+cream\b/i,
  /\bnight\s+cream\b/i, /\bspf\s*\d/i, /\bsunscreen\b/i, /\bprimer\b/i,
  /\bfoundation\b/i, /\bmascara\b/i, /\blipstick\b/i, /\bconcealer\b/i,
  /\bblush\b/i, /\beyeshadow\b/i, /\bskin\s+care\b/i, /\bskincare\b/i,
  /\bcorrector\b/i, /\bretinol\b/i, /\bhyaluronic\b/i, /\bcollagen\b/i,
];
function looksNonFragByName(name: string): boolean { return NON_FRAG_NAME.some(re => re.test(name)); }

function extractHandle(url: string): string | null {
  // url like https://www.jdoqocy.com/click-...?url=<encoded perfumania url>
  try {
    const m = url.match(/[?&]url=([^&]+)/);
    const dest = m ? decodeURIComponent(m[1]) : url;
    const h = dest.match(/\/products\/([^/?#]+)/);
    return h ? h[1] : null;
  } catch { return null; }
}

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = []; let from = 0; const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  console.log('=== NON-FRAGRANCE CATALOG AUDIT (read-only) ===\n');

  console.log('Fetching Perfumania feed...');
  const feed = await fetchFeed();
  console.log(`Feed products: ${feed.length}\n`);

  // product_type distribution
  const typeCounts = new Map<string, number>();
  const handleType = new Map<string, string>();
  for (const p of feed) {
    const pt = (p.product_type || '(blank)').trim();
    typeCounts.set(pt, (typeCounts.get(pt) ?? 0) + 1);
    handleType.set(p.handle, p.product_type || '');
  }
  console.log('── Feed product_type distribution ──');
  for (const [t, c] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const frag = isFragranceType(t) ? 'FRAGRANCE' : 'non-frag ';
    console.log(`  ${frag}  ${String(c).padStart(5)}  ${t}`);
  }
  console.log('');

  // DB: active fragrances + brand names + perfumania links
  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const brandName = new Map(brands.map(b => [b.id, b.name]));
  const frags = await fetchAll<{ id: string; name: string; slug: string; brand_id: string }>(
    'fragrances', 'id, name, slug, brand_id', q => q.eq('is_active', true),
  );
  console.log(`Active fragrances in DB: ${frags.length}`);
  const fragById = new Map(frags.map(f => [f.id, f]));

  const links = await fetchAll<{ fragrance_id: string; url: string; retailer: string }>(
    'fragrance_retailer_links', 'fragrance_id, url, retailer',
    q => q.eq('retailer', 'perfumania'),
  );
  console.log(`Perfumania retailer links: ${links.length}\n`);

  // user-referenced set → never auto-deactivate
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach(r => r.fragrance_id && userRef.add(r.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }
  console.log(`Distinct fragrances referenced by users: ${userRef.size}\n`);

  // Bucket each active fragrance by feed product_type (if linked) and name scan.
  const skincare = new Map<string, { f: typeof frags[0]; pt: string }>();
  const sets = new Map<string, { f: typeof frags[0]; pt: string }>();
  const borderline = new Map<string, { f: typeof frags[0]; pt: string }>();
  const fragHandlePt = new Map<string, string>();
  for (const l of links) {
    const handle = extractHandle(l.url);
    if (!handle) continue;
    const pt = handleType.get(handle);
    if (pt === undefined) continue;
    fragHandlePt.set(l.fragrance_id, pt);
  }
  for (const f of frags) {
    const pt = fragHandlePt.get(f.id);
    if (pt !== undefined) {
      const b = bucketType(pt);
      if (b === 'skincare') skincare.set(f.id, { f, pt });
      else if (b === 'set') sets.set(f.id, { f, pt });
      else if (b === 'borderline') borderline.set(f.id, { f, pt });
      continue;
    }
    // No feed type → fall back to name scan for skincare/makeup terms.
    if (looksNonFragByName(f.name)) skincare.set(f.id, { f, pt: '(name-match)' });
  }
  // Name-scan also catches skincare even when feed type was missing/frag-ish.
  for (const f of frags) {
    if (skincare.has(f.id) || sets.has(f.id)) continue;
    if (looksNonFragByName(f.name)) skincare.set(f.id, { f, pt: fragHandlePt.get(f.id) ? `type="${fragHandlePt.get(f.id)}"+name` : '(name-match)' });
  }

  const tally = (m: Map<string, any>) => ({ total: m.size, held: [...m.keys()].filter(id => userRef.has(id)).length });
  const sk = tally(skincare), st = tally(sets), bl = tally(borderline);

  console.log('── Buckets (active rows) ──');
  console.log(`  A. Skincare/makeup/bath/accessory: ${sk.total}  (held by user: ${sk.held})  → RECOMMEND REMOVE`);
  console.log(`  B. Gift sets / bundles / minis:    ${st.total}  (held by user: ${st.held})  → RECOMMEND REMOVE`);
  console.log(`  C. Borderline (body spray/blank):  ${bl.total}  (held by user: ${bl.held})  → JUDGMENT CALL`);
  console.log('');

  const sample = (label: string, m: Map<string, { f: typeof frags[0]; pt: string }>, n = 25) => {
    console.log(`── ${label} (up to ${n}) ──`);
    let shown = 0;
    for (const { f, pt } of m.values()) {
      if (shown >= n) break;
      const bn = brandName.get(f.brand_id) ?? '?';
      const held = userRef.has(f.id) ? ' [HELD]' : '';
      console.log(`  ${bn} — "${f.name}"  (${pt})${held}`);
      shown++;
    }
    console.log('');
  };
  sample('A. Skincare/makeup', skincare);
  sample('B. Sets/bundles', sets);
  sample('C. Borderline', borderline);

  console.log('\n=== END AUDIT (read-only, no writes) ===');
}
main().catch(e => { console.error(e); process.exit(1); });
