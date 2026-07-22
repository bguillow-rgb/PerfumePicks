/**
 * add-searched-frags.ts — add real fragrances users SEARCHED FOR and got zero
 * results (from search_no_results telemetry), verified via research against
 * Fragrantica/Parfumo/retailer sources. Same conventions as
 * add-collection-frags.ts: INSERT-ONLY, dedup by slug, purchasable=false,
 * notes_verified=false, neutral community midpoints (no invented stats).
 *
 * Run: npx tsx scripts/add-searched-frags.ts [--commit]
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('missing env'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
const brandSlug = (n: string) => normalizeStr(n).replace(/\s+/g, '-');
const fragranceSlug = (b: string, n: string) =>
  `${normalizeStr(b).replace(/\s+/g, '-')}-${normalizeStr(n).replace(/\s+/g, '-')}`;

const NEUTRAL = {
  community_longevity: 3.0, community_sillage: 3.0, community_projection: 3.0,
  compliment_score: 0.5, versatility_score: 0.5, office_safe_score: 0.5,
};

interface Entry {
  brand: string; name: string; release_year: number | null;
  concentration: string; fragrance_family: string; gender: string;
  top_notes: string[]; heart_notes: string[]; base_notes: string[];
  top_accords: string[]; price_tier: number; notes_source: string; source_url: string;
}

const ENTRIES: Entry[] = [
  {
    brand: 'Rayhaan', name: 'Pacific', release_year: 2022,
    concentration: 'edp', fragrance_family: 'fresh', gender: 'masculine',
    top_notes: ['bergamot', 'lemon', 'tangerine', 'cardamom'],
    heart_notes: ['lavender', 'cypress'], base_notes: ['amber'],
    top_accords: ['citrus', 'fresh', 'aromatic', 'woody', 'amber'],
    price_tier: 2, notes_source: 'fragrantica',
    source_url: 'https://www.fragrantica.com/perfume/Rayhaan/Pacific-99293.html',
  },
  {
    brand: 'Rayhaan', name: 'Aquatica', release_year: null,
    concentration: 'edp', fragrance_family: 'aquatic', gender: 'masculine',
    top_notes: ['bergamot', 'lime', 'mandarin', 'coconut milk'],
    heart_notes: ['sugar cane', 'jasmine', 'gardenia', 'hibiscus'],
    base_notes: ['patchouli', 'musk', 'tonka bean', 'rum'],
    top_accords: ['aquatic', 'fresh', 'citrus', 'sweet', 'woody'],
    price_tier: 2, notes_source: 'fragrantica',
    source_url: 'https://www.fragrantica.com/perfume/Rayhaan/Aquatica.html',
  },
  {
    brand: 'Rayhaan', name: 'Bluetiful', release_year: 2023,
    concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['green notes', 'freesia', 'sage', 'mandarin orange'],
    heart_notes: ['carnation', 'lily', 'lily-of-the-valley', 'violet', 'rose', 'jasmine'],
    base_notes: ['musk', 'heliotrope', 'sandalwood', 'amber', 'patchouli'],
    top_accords: ['floral', 'aquatic', 'fresh', 'green', 'musky'],
    price_tier: 2, notes_source: 'fragrantica',
    source_url: 'https://www.fragrantica.com/perfume/Rayhaan/Bluetiful.html',
  },
  {
    brand: 'Rayhaan', name: 'Pretty in Pink', release_year: 2023,
    concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['blackcurrant bud', 'cassis'],
    heart_notes: ['rose', 'freesia'],
    base_notes: ['ambroxan', 'vanilla', 'patchouli'],
    top_accords: ['floral', 'rose', 'fruity', 'sweet', 'woody'],
    price_tier: 2, notes_source: 'fragrantica',
    source_url: 'https://www.parfumo.com/Perfumes/rayhaan/pretty-in-pink',
  },
  {
    brand: 'Maison Asrar', name: 'Vanilla Voyage', release_year: 2025,
    concentration: 'edp', fragrance_family: 'gourmand', gender: 'unisex',
    top_notes: ['caramel', 'butter'],
    heart_notes: ['honey', 'tonka', 'jasmine'],
    base_notes: ['vanilla', 'amber', 'musk'],
    top_accords: ['vanilla', 'gourmand', 'sweet', 'warm-spicy', 'amber'],
    price_tier: 2, notes_source: 'fragrantica',
    source_url: 'https://www.fragrantica.com/perfume/MAISON-ASRAR/Vanilla-Voyage-101562.html',
  },
  {
    brand: 'French Avenue', name: 'Frostbite', release_year: 2025,
    concentration: 'extrait', fragrance_family: 'woody', gender: 'unisex',
    top_notes: ['blueberry', 'mango', 'apple', 'bergamot', 'cardamom'],
    heart_notes: ['lavender', 'geranium', 'violet', 'jasmine', 'pink pepper', 'vetiver'],
    base_notes: ['ambergris', 'vanilla', 'amber', 'sandalwood', 'oakmoss', 'cedar', 'patchouli'],
    top_accords: ['woody', 'aromatic', 'fresh', 'fruity', 'amber', 'warm-spicy'],
    price_tier: 3, notes_source: 'fragrantica',
    source_url: 'https://www.fragrantica.com/perfume/Aromatix-X-French-Avenue/Frostbite-123532.html',
  },
];

async function main() {
  console.log(COMMIT ? '=== COMMIT ===\n' : '=== DRY RUN ===\n');

  const slugs = ENTRIES.map((e) => fragranceSlug(e.brand, e.name));
  const { data: clash } = await supabase.from('fragrances').select('slug').in('slug', slugs);
  const taken = new Set((clash ?? []).map((r: any) => r.slug));
  const fresh = ENTRIES.filter((e) => !taken.has(fragranceSlug(e.brand, e.name)));
  if (taken.size) console.log(`already present, skipping: ${[...taken].join(', ')}\n`);

  const uniqueBrands = [...new Set(fresh.map((e) => e.brand))];
  const newBrands = [];
  const { data: have } = await supabase.from('brands').select('slug').in('slug', uniqueBrands.map(brandSlug));
  const haveSet = new Set((have ?? []).map((b: any) => b.slug));
  for (const b of uniqueBrands) if (!haveSet.has(brandSlug(b))) newBrands.push(b);

  console.log('BRANDS');
  for (const b of uniqueBrands) console.log(`  ${haveSet.has(brandSlug(b)) ? 'exists ' : 'CREATE '} ${b}`);

  if (COMMIT && newBrands.length) {
    const rows = newBrands.map((name) => ({ name, slug: brandSlug(name), country: 'United Arab Emirates' }));
    const { error } = await supabase.from('brands').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) { console.error('brand insert failed:', error.message); process.exit(1); }
  }

  const brandIds = new Map<string, string>();
  const { data: allBrands } = await supabase.from('brands').select('id, slug').in('slug', uniqueBrands.map(brandSlug));
  for (const b of allBrands ?? []) brandIds.set((b as any).slug, (b as any).id);

  const rows = fresh.map((e) => ({
    slug: fragranceSlug(e.brand, e.name), name: e.name, brand_id: brandIds.get(brandSlug(e.brand)),
    release_year: e.release_year, concentration: e.concentration, fragrance_family: e.fragrance_family,
    gender: e.gender, top_notes: e.top_notes, heart_notes: e.heart_notes, base_notes: e.base_notes,
    top_accords: e.top_accords, accord_intensity: {}, ...NEUTRAL, price_tier: e.price_tier,
    retail_msrp_usd_cents: null, image_url: null, source: `research (${e.notes_source})`,
    source_url: e.source_url, notes_source: e.notes_source, notes_verified: false,
    is_active: true, purchasable: false,
  }));

  console.log('\nFRAGRANCES');
  for (const r of rows) console.log(`  ${r.slug}  ${r.release_year ?? '?'} · ${r.concentration} · ${r.fragrance_family} · ${r.gender} · [${r.top_accords.join(',')}]`);
  if (rows.some((r) => !r.brand_id)) { console.error('\nABORT: unresolved brand_id'); if (COMMIT) process.exit(1); }

  if (!COMMIT) { console.log(`\nWould insert ${rows.length} fragrances + ${newBrands.length} brands. Re-run with --commit.`); return; }

  const { error } = await supabase.from('fragrances').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  const p = path.join(process.cwd(), 'scripts/data/rollback-searched-frags.json');
  fs.writeFileSync(p, JSON.stringify({ at: new Date().toISOString(), slugs: rows.map((r) => r.slug) }, null, 2));
  console.log(`\nInserted ${rows.length}. Rollback: delete from fragrances where slug in ('${rows.map((r) => r.slug).join("','")}');`);
}
main();
