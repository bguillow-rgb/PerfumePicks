/**
 * Soft-deactivates SKINCARE / MAKEUP / BATH / ACCESSORY rows that leaked into
 * the fragrance catalog (e.g. "Advanced Night Repair", facial cleansers, serums,
 * moisturizers). These are unambiguously NOT wearable fragrances.
 *
 * Authoritative signal: Perfumania Shopify `product_type` (joined to the DB via
 * the handle embedded in each perfumania retailer-link URL), plus a conservative
 * skincare/makeup name keyword scan for rows missing a feed type.
 *
 * Safety contract (mirrors deactivate-junk-listings.ts):
 *   - SOFT delete only (is_active=false). Reversible; no FK cascade.
 *   - ONLY "Bucket A" skincare/makeup/bath/accessory. Does NOT touch:
 *       · "Gift Set"-typed rows (mostly real fragrances sold as a set SKU)
 *       · "Body Spray" / blank-typed rows (wearable body-spray fragrances)
 *   - NEVER touches a fragrance referenced by a user (wardrobe/wear/swipe/
 *     review/compliment) — those are HELD and printed.
 *   - Idempotent.
 *
 * Run:  npx tsx scripts/deactivate-non-fragrance.ts          (dry-run, default)
 *       npx tsx scripts/deactivate-non-fragrance.ts --apply  (writes)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
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

/** A genuine wearable-fragrance product type — trust it, never name-scan over it. */
function isFragranceType(pt: string): boolean {
  const t = (pt || '').toLowerCase().trim();
  return /\b(fragrance|perfume|cologne|parfum|toilette|eau de|elixir|extrait|essence)\b/.test(t) || t === 'oil';
}

/** True only for skincare/makeup/bath/accessory product types — Bucket A. */
function isSkincareType(pt: string): boolean {
  const t = (pt || '').toLowerCase().trim();
  if (!t) return false;
  if (isFragranceType(t)) return false;
  return /(beauty|moisturi|body cream|body lotion|dusting powder|after\s*shave|aftershave|concentrate|thermale|skin|makeup|cosmetic|accessor|lip balm|\bcream\b|\blotion\b|serum|cleanser|toner|\bmask\b|deodorant)/.test(t);
}

/** Conservative skincare/makeup name scan for rows with no feed type. */
// NOTE: deliberately excludes ambiguous fragrance-name words like "blush"
// (Good Girl Blush, My Burberry Blush) and "essence" (Essence de Parfum).
const NON_FRAG_NAME = [
  /\bserum\b/i, /\bmoisturi[sz]/i, /\bnight\s+repair\b/i, /recovery\s+complex/i,
  /\bcleanser\b/i, /\btoner\b/i, /\bexfoliat/i, /\bface\s+peel\b/i,
  /\bampoule\b/i, /\beye\s+cream\b/i, /\bface\s+cream\b/i, /\bday\s+cream\b/i,
  /\bnight\s+cream\b/i, /\bspf\s*\d/i, /\bsunscreen\b/i,
  /\bmascara\b/i, /\blipstick\b/i, /\bconcealer\b/i,
  /\beyeshadow\b/i, /\bskin\s*care\b/i,
  /\bretinol\b/i, /\bhyaluronic\b/i, /\bcollagen\b/i,
  /facial\s+(treatment|cleanser|mask)/i, /\bbody\s+(lotion|wash|scrub|butter|souffl)/i,
];
function looksSkincareName(name: string): boolean { return NON_FRAG_NAME.some(re => re.test(name)); }

function extractHandle(url: string): string | null {
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
  console.log(`Mode: ${APPLY ? 'APPLY (writing is_active=false)' : 'DRY-RUN (no writes)'}\n`);

  const feed = await fetchFeed();
  const handleType = new Map<string, string>();
  for (const p of feed) handleType.set(p.handle, p.product_type || '');
  console.log(`Feed products: ${feed.length}`);

  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const brandName = new Map(brands.map(b => [b.id, b.name]));
  const frags = await fetchAll<{ id: string; name: string; slug: string; brand_id: string }>(
    'fragrances', 'id, name, slug, brand_id', q => q.eq('is_active', true),
  );
  console.log(`Active fragrances: ${frags.length}`);

  const links = await fetchAll<{ fragrance_id: string; url: string }>(
    'fragrance_retailer_links', 'fragrance_id, url', q => q.eq('retailer', 'perfumania'),
  );
  const fragPt = new Map<string, string>();
  for (const l of links) {
    const h = extractHandle(l.url);
    if (h && handleType.has(h)) fragPt.set(l.fragrance_id, handleType.get(h)!);
  }

  // user-reference set → HOLD
  const refTables = ['wardrobe_items', 'wear_logs', 'swipe_feedback', 'fragrance_reviews', 'compliments_log'];
  const userRef = new Set<string>();
  for (const t of refTables) {
    try {
      const rows = await fetchAll<{ fragrance_id: string }>(t, 'fragrance_id');
      rows.forEach(r => r.fragrance_id && userRef.add(r.fragrance_id));
    } catch (e) { console.warn(`  (skip ${t}: ${(e as Error).message})`); }
  }

  const candidates = frags.filter(f => {
    const pt = fragPt.get(f.id);
    if (pt !== undefined) {
      if (isSkincareType(pt)) return true;
      if (isFragranceType(pt)) return false;   // trust feed fragrance type; never name-scan over it
      // borderline/blank feed type → fall through to the name scan
    }
    return looksSkincareName(f.name);
  });
  const held = candidates.filter(f => userRef.has(f.id));
  const toDeactivate = candidates.filter(f => !userRef.has(f.id));

  console.log(`\nSkincare/makeup candidates: ${candidates.length}`);
  console.log(`HELD (user-referenced):     ${held.length}  → NOT touched`);
  console.log(`To deactivate:              ${toDeactivate.length}\n`);
  held.forEach(f => console.log(`  HELD: "${f.name}" [${f.slug}]`));

  console.log('── Sample to deactivate (up to 30) ──');
  toDeactivate.slice(0, 30).forEach(f => {
    const bn = brandName.get(f.brand_id) ?? '?';
    console.log(`  ${bn} — "${f.name}"  (${fragPt.get(f.id) ?? 'name-match'})`);
  });

  if (!toDeactivate.length) { console.log('\nNothing to deactivate.'); return; }
  if (!APPLY) { console.log('\nDry-run only. Re-run with --apply to write.'); return; }

  const ids = toDeactivate.map(f => f.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await sb.from('fragrances').update({ is_active: false }).in('id', chunk);
    if (error) throw new Error(`deactivate failed: ${error.message}`);
    done += chunk.length;
    console.log(`  deactivated ${done}/${ids.length}`);
  }
  console.log(`\n✓ Deactivated ${done} non-fragrance rows (soft, reversible).`);
}
main().catch(e => { console.error(e); process.exit(1); });
