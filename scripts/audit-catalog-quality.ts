/**
 * audit-catalog-quality — read-only diagnostic of catalog data-quality defects
 * before canonicalization. Quantifies: HTML-entity pollution, duplicate rows,
 * non-fragrance SKU junk (after-shave / lotion / gift set / tester / mini),
 * and suspicious "brands". Writes nothing.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/audit-catalog-quality.ts
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const PAGE = 1000; const rows: T[] = [];
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(o, o + PAGE - 1);
    if (error) { console.error(table, error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...(data as T[])); if (data.length < PAGE) break;
  }
  return rows;
}

const ENTITY = /&(amp|#0?39|#x27|quot|#34|lt|gt|nbsp|reg|trade|eacute|egrave|deg|hellip|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/i;

// non-fragrance / non-standard SKU markers in the product name
const JUNK_NAME = /\b(after\s?shave|aftershave|deodorant|deo stick|body lotion|body cream|body milk|shower gel|bath|soap|hair mist|hair perfume|shampoo|gift set|set\b|coffret|tester|sample|vial|miniature|travel size|refill|roll-?on|pour on|talc|dusting powder|stick)\b/i;

(async () => {
  const brands = await fetchAll<{ id: string; name: string }>('brands', 'id, name');
  const frags = await fetchAll<{ id: string; name: string; slug: string; brand_id: string; is_active: boolean; retail_msrp_usd_cents: number | null }>(
    'fragrances', 'id, name, slug, brand_id, is_active, retail_msrp_usd_cents',
  );
  const brandById = new Map(brands.map((b) => [b.id, b.name]));

  console.log(`\n=== TOTALS ===`);
  console.log(`brands: ${brands.length}   fragrances: ${frags.length}   active: ${frags.filter(f=>f.is_active).length}`);

  // 1. HTML entities
  const entBrands = brands.filter((b) => ENTITY.test(b.name));
  const entFrags = frags.filter((f) => ENTITY.test(f.name) || ENTITY.test(f.slug));
  console.log(`\n=== HTML ENTITIES ===`);
  console.log(`brands w/ entities: ${entBrands.length}`, entBrands.slice(0, 15).map(b=>b.name));
  console.log(`fragrances w/ entities in name/slug: ${entFrags.length}`, entFrags.slice(0, 8).map(f=>f.name));

  // 2. Duplicate rows by (decoded brand | decoded name) — merge candidates
  const decode = (s: string) => s.replace(/&amp;/gi,'&').replace(/&#0?39;|&#x27;|&rsquo;/gi,"'").replace(/&quot;|&#34;/gi,'"').replace(/&nbsp;/gi,' ').trim();
  const norm = (s: string) => decode(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const groups = new Map<string, typeof frags>();
  for (const f of frags) {
    const k = `${norm(brandById.get(f.brand_id) ?? '')}|${norm(f.name)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }
  const dupeGroups = [...groups.entries()].filter(([, v]) => v.length > 1);
  const extraRows = dupeGroups.reduce((s, [, v]) => s + v.length - 1, 0);
  console.log(`\n=== DUPLICATE ROWS (same decoded brand+name) ===`);
  console.log(`duplicate groups: ${dupeGroups.length}   redundant rows: ${extraRows}`);
  console.log('samples:', dupeGroups.slice(0, 8).map(([k, v]) => `${k} x${v.length}`));

  // 3. Junk SKU names
  const junk = frags.filter((f) => JUNK_NAME.test(f.name));
  console.log(`\n=== NON-FRAGRANCE / NON-STANDARD SKU NAMES ===`);
  console.log(`matched: ${junk.length} (active: ${junk.filter(f=>f.is_active).length})`);
  console.log('samples:', junk.slice(0, 12).map(f=>f.name));

  // 4. Mini sizes (size_ml lives on retailer links) — hero link size per frag
  const links = await fetchAll<{ fragrance_id: string; size_ml: number | null }>('fragrance_retailer_links', 'fragrance_id, size_ml');
  const maxSize = new Map<string, number>();
  for (const l of links) { const s = l.size_ml ?? 0; if (s > (maxSize.get(l.fragrance_id) ?? 0)) maxSize.set(l.fragrance_id, s); }
  let miniOnly = 0, noSize = 0; const sizeHist: Record<string, number> = {};
  for (const f of frags) {
    const s = maxSize.get(f.id);
    if (s == null) { noSize++; continue; }
    if (s > 0 && s < 20) miniOnly++;
    const k = s === 0 ? '0/unknown' : s < 20 ? '<20' : s < 50 ? '20-49' : s < 90 ? '50-89' : '90+';
    sizeHist[k] = (sizeHist[k] ?? 0) + 1;
  }
  console.log(`\n=== SKU SIZE (largest retailer-link size per fragrance) ===`);
  console.log(`fragrances whose largest available size is a mini (<20ml): ${miniOnly}   no link size: ${noSize}`);
  console.log('size buckets:', JSON.stringify(sizeHist));

  // 5. Brand row-count distribution + suspicious brands
  const brandCounts = new Map<string, number>();
  for (const f of frags) { const n = brandById.get(f.brand_id) ?? '??'; brandCounts.set(n, (brandCounts.get(n)??0)+1); }
  const suspicious = brands.filter((b)=>/bundle|save|\bset\b|combo|pack|wholesale|assorted|gift/i.test(b.name));
  console.log(`\n=== BRANDS ===`);
  console.log(`total brands: ${brands.length}`);
  console.log('suspicious brand names:', suspicious.map(b=>`${b.name}(${brandCounts.get(b.name)??0})`));
  console.log('top 20 brands by row count:', [...brandCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n,c])=>`${n}:${c}`));
})();
