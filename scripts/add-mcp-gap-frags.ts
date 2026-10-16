/**
 * add-mcp-gap-frags.ts — add real fragrances that assistants asked the MCP
 * server for and the catalog did not have (mcp_call_logs where result_count=0,
 * October 2026). Same conventions as add-searched-frags.ts: INSERT-ONLY, dedup
 * by slug, purchasable=false, notes_verified=false, neutral community midpoints
 * (no invented stats).
 *
 * Two differences from add-searched-frags.ts:
 *  - country is per brand, not hardcoded to the UAE.
 *  - where a source gives a flat note list with no top/heart/base positions
 *    (Luckyscent does this), the three arrays are left EMPTY rather than
 *    guessing a pyramid. top_accords still carries the sourced character.
 *
 * Run: npx tsx scripts/add-mcp-gap-frags.ts [--commit]
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

/** Brands that do not exist yet, and where they are from. */
const BRAND_COUNTRY: Record<string, string> = {
  'Comme des Garçons': 'Japan',
  "L'Artisan Parfumeur": 'France',
  'Al Wataniah': 'United Arab Emirates',
};

interface Entry {
  brand: string; name: string; release_year: number | null;
  concentration: string; fragrance_family: string; gender: string;
  top_notes: string[]; heart_notes: string[]; base_notes: string[];
  top_accords: string[]; price_tier: number;
  /** Must be one of fragrances_notes_source_chk: brand | manual | fragrantica | parfumo | llm-inferred | community. */
  notes_source: 'brand' | 'manual';
  /** The actual page the notes were read off; recorded in `source`. */
  origin: string; source_url: string;
}

const ENTRIES: Entry[] = [
  // --- Acqua di Parma Blu Mediterraneo: the whole line was missing. ---
  {
    brand: 'Acqua di Parma', name: 'Blu Mediterraneo Fico di Amalfi', release_year: 2006,
    concentration: 'edt', fragrance_family: 'woody', gender: 'unisex',
    top_notes: ['citron', 'bergamot', 'grapefruit', 'lemon'],
    heart_notes: ['fig nectar', 'pink pepper', 'jasmine petals'],
    base_notes: ['fig wood', 'cedarwood', 'benzoin'],
    top_accords: ['fig', 'citrus', 'green', 'woody', 'fresh'],
    price_tier: 3, notes_source: 'manual', origin: 'dillards',
    source_url: 'https://www.dillards.com/p/acqua-di-parma-blu-mediterraneo-fico-di-amalfi-eau-de-toilette/519448230',
  },
  {
    brand: 'Acqua di Parma', name: 'Blu Mediterraneo Arancia di Capri', release_year: null,
    concentration: 'edt', fragrance_family: 'citrus', gender: 'unisex',
    top_notes: ['italian sweet orange', 'italian mandarin', 'italian lemon'],
    heart_notes: ['petitgrain', 'cardamom'],
    base_notes: ['caramel', 'musk'],
    top_accords: ['citrus', 'fresh', 'musky', 'sweet', 'aromatic'],
    price_tier: 3, notes_source: 'brand', origin: 'acquadiparma.com',
    source_url: 'https://www.acquadiparma.com/default/en/arancia-di-capri/ADP57026-30ML.html',
  },
  {
    brand: 'Acqua di Parma', name: 'Blu Mediterraneo Mirto di Panarea', release_year: null,
    concentration: 'edt', fragrance_family: 'aquatic', gender: 'unisex',
    top_notes: ['myrtle', 'basil', 'italian lemon', 'italian bergamot'],
    heart_notes: ['marine breeze', 'jasmine absolute', 'damask rose absolute'],
    base_notes: ['lentisk absolute', 'juniper', 'virginian cedarwood', 'amber'],
    top_accords: ['aromatic', 'aquatic', 'citrus', 'green', 'woody'],
    price_tier: 3, notes_source: 'manual', origin: 'dillards',
    source_url: 'https://www.dillards.com/p/acqua-di-parma-blu-mediterraneo-mirto-di-panarea-eau-de-toilette/519448236',
  },

  // --- Louis Vuitton Les Colognes. LV publishes three "key notes", in order. ---
  {
    brand: 'Louis Vuitton', name: 'California Dream', release_year: 2020,
    concentration: 'edp', fragrance_family: 'citrus', gender: 'unisex',
    top_notes: ['mandarin'],
    heart_notes: ['ambrette seeds'],
    base_notes: ['benzoin'],
    top_accords: ['citrus', 'amber', 'musky', 'sweet', 'vanilla'],
    price_tier: 5, notes_source: 'brand', origin: 'louisvuitton.com',
    source_url: 'https://us.louisvuitton.com/eng-us/products/california-dream-nvprod7340003v/LP0483',
  },

  {
    // Not in the original batch: found on 2026-10-16 re-testing the backlog
    // against the fixed search. Louis Vuitton publishes "key notes" here with
    // no stated order, unlike California Dream, so the pyramid stays empty.
    // Release year omitted: 2018 appears on one secondary site and nowhere the
    // house states it.
    brand: 'Louis Vuitton', name: 'Ombre Nomade', release_year: null,
    concentration: 'edp', fragrance_family: 'woody', gender: 'unisex',
    top_notes: [], heart_notes: [], base_notes: [],
    top_accords: ['oud', 'woody', 'smoky', 'incense', 'amber', 'fruity'],
    price_tier: 5, notes_source: 'brand', origin: 'louisvuitton.com',
    source_url: 'https://us.louisvuitton.com/eng-us/products/ombre-nomade-nvprod990245v/LP0096',
  },

  // --- Flat note lists: Luckyscent states the notes but not their positions,
  //     so the pyramid stays empty rather than invented. ---
  {
    brand: 'Comme des Garçons', name: 'Series 3 Incense: Avignon', release_year: 2002,
    concentration: 'edt', fragrance_family: 'woody', gender: 'unisex',
    top_notes: [], heart_notes: [], base_notes: [],
    top_accords: ['incense', 'smoky', 'resinous', 'woody', 'vanilla'],
    price_tier: 3, notes_source: 'manual', origin: 'luckyscent',
    source_url: 'https://www.luckyscent.com/products/avignon-by-comme-des-garcons-incense',
  },
  {
    brand: "L'Artisan Parfumeur", name: 'Premier Figuier Extrême', release_year: 2004,
    concentration: 'edp', fragrance_family: 'green', gender: 'unisex',
    top_notes: [], heart_notes: [], base_notes: [],
    top_accords: ['fig', 'green', 'milky', 'woody', 'coconut'],
    price_tier: 4, notes_source: 'manual', origin: 'luckyscent',
    source_url: 'https://www.luckyscent.com/products/premier-figuier-extreme',
  },

  // --- Middle-eastern house, and the one whose name the searcher misspelled. ---
  {
    brand: 'Al Wataniah', name: 'Sabah Al Ward', release_year: null,
    concentration: 'edp', fragrance_family: 'gourmand', gender: 'feminine',
    top_notes: ['orange', 'pink pepper'],
    heart_notes: ['cacao', 'orange blossom', 'jasmine'],
    base_notes: ['vanilla', 'tonka bean', 'patchouli'],
    top_accords: ['gourmand', 'sweet', 'cacao', 'vanilla', 'floral'],
    price_tier: 1, notes_source: 'manual', origin: 'notino',
    source_url: 'https://www.notino.fr/al-wataniah/sabah-al-ward-eau-de-parfum-mixte/',
  },
  {
    // Searched as "Suspiro Vibrato" — the house is Sospiro, already in the catalog.
    brand: 'Sospiro Perfumes', name: 'Vibrato', release_year: 2022,
    concentration: 'edp', fragrance_family: 'floral', gender: 'unisex',
    top_notes: ['magnolia', 'jasmine', 'bergamot', 'grapefruit'],
    heart_notes: ['ginger'],
    base_notes: ['cedarwood', 'amber', 'musk', 'patchouli', 'orris'],
    top_accords: ['floral', 'citrus', 'powdery', 'woody', 'amber'],
    price_tier: 5, notes_source: 'manual', origin: 'luckyscent',
    source_url: 'https://www.luckyscent.com/products/vibrato-by-sospiro',
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
  const { data: have } = await supabase.from('brands').select('slug').in('slug', uniqueBrands.map(brandSlug));
  const haveSet = new Set((have ?? []).map((b: any) => b.slug));
  const newBrands = uniqueBrands.filter((b) => !haveSet.has(brandSlug(b)));

  console.log('BRANDS');
  for (const b of uniqueBrands) {
    const mark = haveSet.has(brandSlug(b)) ? 'exists ' : 'CREATE ';
    console.log(`  ${mark} ${b}${mark === 'CREATE ' ? `  (${BRAND_COUNTRY[b] ?? '??'})` : ''}`);
  }
  const missingCountry = newBrands.filter((b) => !BRAND_COUNTRY[b]);
  if (missingCountry.length) {
    console.error(`\nABORT: no country for new brand(s): ${missingCountry.join(', ')}`);
    process.exit(1);
  }

  if (COMMIT && newBrands.length) {
    const rows = newBrands.map((name) => ({ name, slug: brandSlug(name), country: BRAND_COUNTRY[name] }));
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
    retail_msrp_usd_cents: null, image_url: null, source: `research (${e.origin})`,
    source_url: e.source_url, notes_source: e.notes_source, notes_verified: false,
    is_active: true, purchasable: false,
  }));

  console.log('\nFRAGRANCES');
  for (const r of rows) {
    const pyramid = r.top_notes.length ? `${r.top_notes.length}/${r.heart_notes.length}/${r.base_notes.length} notes` : 'NO PYRAMID (accords only)';
    console.log(`  ${r.slug}`);
    console.log(`      ${r.release_year ?? 'year?'} · ${r.concentration} · ${r.fragrance_family} · ${r.gender} · tier ${r.price_tier} · ${pyramid}`);
  }
  // On a dry run the new brands do not exist yet, so an unresolved id is
  // expected; only a --commit run may not proceed with one.
  if (rows.some((r) => !r.brand_id)) {
    console.error(`\n${COMMIT ? 'ABORT' : 'note'}: unresolved brand_id for ${rows.filter((r) => !r.brand_id).length} row(s)`);
    if (COMMIT) process.exit(1);
  }

  if (!COMMIT) { console.log(`\nWould insert ${rows.length} fragrances + ${newBrands.length} brands. Re-run with --commit.`); return; }

  const { error } = await supabase.from('fragrances').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  const p = path.join(process.cwd(), 'scripts/data/rollback-mcp-gap-frags.json');
  fs.writeFileSync(p, JSON.stringify({ at: new Date().toISOString(), slugs: rows.map((r) => r.slug) }, null, 2));
  console.log(`\nInserted ${rows.length}. Rollback: delete from fragrances where slug in ('${rows.map((r) => r.slug).join("','")}');`);
}
main();
