/**
 * add-collection-frags.ts — one-off: add 7 fragrances the owner has in their
 * collection that were genuinely missing from the catalog.
 *
 * Mirrors scripts/import-originals-no-affiliate.ts conventions:
 *   • INSERT-ONLY. onConflict(slug) ignoreDuplicates=true → never overwrites.
 *   • purchasable=false — none of these houses are in the FragranceShop /
 *     Perfumania / AromaPassions feeds, so there is no affiliate link to attach.
 *   • notes_verified=false — notes are sourced, not human-verified in-app.
 *
 * DATA PROVENANCE (deliberate, not invented):
 *   • Notes/year/concentration for PDM Galloway, PDM Oajan, Sospiro Dolce Sonata
 *     and SHL 777 Panthea were read off each house's OWN site → notes_source='brand'.
 *   • The three Louis Vuitton entries could not be read from louisvuitton.com
 *     (HTTP 403 to automated fetch); notes are consistent across Fragrantica /
 *     Parfumo / Basenotes / Selfridges → notes_source='fragrantica'.
 *   • community_* / *_score are set to the scorer's NEUTRAL midpoints, not
 *     guesses at real community data. score.ts computes `office_safe_score - 0.5`
 *     etc., so 0.5 (and 3.0 on the 0-5 scales) means "no signal": zero bonus,
 *     zero penalty. NULL would collapse to a permanent -0.5 penalty and bury
 *     these bottles at the bottom of the owner's own SOTD forever.
 *   • retail_msrp_usd_cents is NULL for the LV trio — reseller prices were the
 *     only figures available and they are not official.
 *   • accord_intensity={} — score.ts does `f.accord_intensity[a] ?? 3`, so an
 *     empty object correctly defaults every accord to neutral 3.
 *
 * Run:  npx tsx <this> [--commit]
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

// Neutral "no community signal" defaults — see PROVENANCE above.
const NEUTRAL = {
  community_longevity: 3.0,
  community_sillage: 3.0,
  community_projection: 3.0,
  compliment_score: 0.5,
  versatility_score: 0.5,
  office_safe_score: 0.5,
};

interface Entry {
  brand: string; name: string; release_year: number;
  concentration: string; fragrance_family: string; gender: string;
  top_notes: string[]; heart_notes: string[]; base_notes: string[];
  top_accords: string[]; price_tier: number;
  retail_msrp_usd_cents: number | null;
  notes_source: string; source: string; source_url: string;
}

const ENTRIES: Entry[] = [
  {
    brand: 'Parfums de Marly', name: 'Galloway', release_year: 2014,
    concentration: 'edp', fragrance_family: 'fresh', gender: 'unisex',
    top_notes: ['lemon', 'pepper', 'elemi'],
    heart_notes: ['cardamom', 'iris'],
    base_notes: ['musk', 'ambroxan', 'cypriol'],
    top_accords: ['citrus', 'fresh-spicy', 'woody', 'musky', 'amber'],
    price_tier: 5, retail_msrp_usd_cents: 29000,
    notes_source: 'brand', source: 'brand (parfums-de-marly.com)',
    source_url: 'https://us.parfums-de-marly.com/products/galloway',
  },
  {
    brand: 'Parfums de Marly', name: 'Oajan', release_year: 2013,
    concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['honey', 'cinnamon', 'osmanthus'],
    heart_notes: ['amber', 'labdanum', 'benzoin'],
    base_notes: ['vanilla', 'tonka bean', 'patchouli', 'davana'],
    top_accords: ['warm-spicy', 'sweet', 'amber', 'honey', 'vanilla'],
    price_tier: 5, retail_msrp_usd_cents: 40000,
    notes_source: 'brand', source: 'brand (parfums-de-marly.com)',
    source_url: 'https://us.parfums-de-marly.com/products/oajan',
  },
  {
    brand: 'Sospiro Perfumes', name: 'Dolce Sonata', release_year: 2024,
    concentration: 'edp', fragrance_family: 'floral', gender: 'unisex',
    top_notes: ['apricot', 'raspberry', 'lime', 'sweet orange', 'bergamot'],
    heart_notes: ['osmanthus', 'lily of the valley', 'jasmine', 'incense', 'rose petals'],
    base_notes: ['incense', 'patchouli', 'musk', 'face powder', 'cotton candy'],
    top_accords: ['fruity', 'floral', 'sweet', 'powdery', 'musky'],
    price_tier: 5, retail_msrp_usd_cents: 32600,
    notes_source: 'brand', source: 'brand (sospirointernational.com)',
    source_url: 'https://sospirointernational.com/products/dolce-sonata',
  },
  {
    brand: 'Stéphane Humbert Lucas 777', name: 'Panthea', release_year: 2017,
    concentration: 'edp', fragrance_family: 'floral', gender: 'unisex',
    top_notes: ['bergamot', 'pink pepper', 'white tea'],
    heart_notes: ['iris', 'jasmine', 'violet'],
    base_notes: ['white musk', 'tonka bean', 'sandalwood'],
    top_accords: ['floral', 'powdery', 'iris', 'musky', 'woody'],
    price_tier: 4, retail_msrp_usd_cents: 20500,
    notes_source: 'brand', source: 'brand (stephanehumbertlucas.com)',
    source_url: 'https://stephanehumbertlucas.com/products/panthea',
  },
  {
    brand: 'Louis Vuitton', name: 'Météore', release_year: 2020,
    concentration: 'edp', fragrance_family: 'fresh', gender: 'masculine',
    top_notes: ['mandarin orange', 'sicilian orange', 'bergamot'],
    heart_notes: ['neroli', 'nutmeg', 'pink pepper', 'black pepper', 'cardamom'],
    base_notes: ['vetiver'],
    top_accords: ['citrus', 'fresh-spicy', 'aromatic', 'woody'],
    price_tier: 4, retail_msrp_usd_cents: null,
    notes_source: 'fragrantica', source: 'fragrantica (LV site 403)',
    source_url: 'https://www.fragrantica.com/perfume/Louis-Vuitton/Meteore-62251.html',
  },
  {
    brand: 'Louis Vuitton', name: 'City of Stars', release_year: 2022,
    concentration: 'edp', fragrance_family: 'fresh', gender: 'unisex',
    top_notes: ['blood orange', 'lime', 'blood mandarin', 'lemon', 'bergamot'],
    heart_notes: ['tiare flower'],
    base_notes: ['musk', 'sandalwood'],
    top_accords: ['citrus', 'fresh', 'floral', 'powdery', 'musky'],
    price_tier: 4, retail_msrp_usd_cents: null,
    notes_source: 'fragrantica', source: 'fragrantica (LV site 403)',
    source_url: 'https://www.fragrantica.com/perfume/Louis-Vuitton/City-Of-Stars-73344.html',
  },
  {
    brand: 'Louis Vuitton', name: 'Imagination', release_year: 2021,
    concentration: 'edp', fragrance_family: 'oriental', gender: 'masculine',
    top_notes: ['citron', 'bergamot', 'sicilian orange'],
    heart_notes: ['neroli', 'ginger', 'cinnamon'],
    base_notes: ['black tea', 'ambroxan', 'guaiac wood', 'olibanum'],
    top_accords: ['citrus', 'warm-spicy', 'aromatic', 'woody', 'amber'],
    price_tier: 4, retail_msrp_usd_cents: null,
    notes_source: 'fragrantica', source: 'fragrantica (LV site 403)',
    source_url: 'https://www.fragrantica.com/perfume/Louis-Vuitton/Imagination-67370.html',
  },
];

async function main() {
  console.log(COMMIT ? '=== COMMIT ===\n' : '=== DRY RUN (no writes) ===\n');

  // 1. Guard: never touch a slug that already exists.
  const slugs = ENTRIES.map((e) => fragranceSlug(e.brand, e.name));
  const { data: clash } = await supabase.from('fragrances').select('slug').in('slug', slugs);
  const taken = new Set((clash ?? []).map((r: any) => r.slug));
  const fresh = ENTRIES.filter((e) => !taken.has(fragranceSlug(e.brand, e.name)));
  if (taken.size) console.log(`already present, skipping: ${[...taken].join(', ')}\n`);

  // 2. Ensure brands (Sospiro + SHL 777 are new; PDM + LV already exist).
  const uniqueBrands = [...new Set(fresh.map((e) => e.brand))];
  const { data: haveBrands } = await supabase.from('brands').select('id, slug, name')
    .in('slug', uniqueBrands.map(brandSlug));
  const have = new Map((haveBrands ?? []).map((b: any) => [b.slug, b]));
  const newBrands = uniqueBrands.filter((b) => !have.has(brandSlug(b)));

  console.log('BRANDS');
  for (const b of uniqueBrands) {
    const ex = have.get(brandSlug(b));
    console.log(`  ${ex ? 'exists ' : 'CREATE '} ${b}  (${brandSlug(b)})`);
  }

  if (COMMIT && newBrands.length) {
    const rows = newBrands.map((name) => ({
      name, slug: brandSlug(name),
      country: name.startsWith('Sospiro') ? 'Italy' : 'France',
    }));
    const { error } = await supabase.from('brands').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) { console.error('brand insert failed:', error.message); process.exit(1); }
  }

  const brandIds = new Map<string, string>();
  const { data: allBrands } = await supabase.from('brands').select('id, slug')
    .in('slug', uniqueBrands.map(brandSlug));
  for (const b of allBrands ?? []) brandIds.set((b as any).slug, (b as any).id);

  // 3. Build rows.
  const rows = fresh.map((e) => {
    const brand_id = brandIds.get(brandSlug(e.brand));
    return {
      slug: fragranceSlug(e.brand, e.name),
      name: e.name,
      brand_id,
      release_year: e.release_year,
      concentration: e.concentration,
      fragrance_family: e.fragrance_family,
      gender: e.gender,
      top_notes: e.top_notes,
      heart_notes: e.heart_notes,
      base_notes: e.base_notes,
      top_accords: e.top_accords,
      accord_intensity: {},
      ...NEUTRAL,
      price_tier: e.price_tier,
      retail_msrp_usd_cents: e.retail_msrp_usd_cents,
      image_url: null,
      source: e.source,
      source_url: e.source_url,
      notes_source: e.notes_source,
      notes_verified: false,
      is_active: true,
      purchasable: false,
    };
  });

  console.log('\nFRAGRANCES');
  for (const r of rows) {
    const msrp = r.retail_msrp_usd_cents ? `$${(r.retail_msrp_usd_cents / 100).toFixed(2)}` : '(no msrp)';
    console.log(`  ${r.slug}`);
    console.log(`      ${r.release_year} · ${r.concentration} · ${r.fragrance_family} · ${r.gender} · tier ${r.price_tier} · ${msrp} · notes:${r.notes_source}`);
    console.log(`      accords: ${r.top_accords.join(', ')}`);
    console.log(`      notes:   ${r.top_notes.join('/')} → ${r.heart_notes.join('/')} → ${r.base_notes.join('/')}`);
  }
  if (rows.some((r) => !r.brand_id)) {
    console.error('\nABORT: unresolved brand_id (run --commit to create brands first)');
    if (COMMIT) process.exit(1);
  }

  if (!COMMIT) {
    console.log(`\nWould insert ${rows.length} fragrances + ${newBrands.length} brands. Re-run with --commit.`);
    return;
  }

  const { error } = await supabase.from('fragrances').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) { console.error('insert failed:', error.message); process.exit(1); }

  const manifest = { at: new Date().toISOString(), brands: newBrands.map(brandSlug), slugs: rows.map((r) => r.slug) };
  const p = path.join(process.cwd(), 'scripts/data/rollback-collection-frags.json');
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
  console.log(`\nInserted ${rows.length}. Manifest: ${p}`);
  console.log(`Rollback: delete from fragrances where slug in ('${rows.map((r) => r.slug).join("','")}');`);
}

main();
