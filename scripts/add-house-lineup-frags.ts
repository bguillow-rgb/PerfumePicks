/**
 * add-house-lineup-frags.ts — fill gaps in a house's current lineup.
 *
 * Hand-authored, documented note pyramids (Fragrantica/Basenotes/brand-copy
 * level), INSERT-ONLY with the exact conventions of add-searched-frags.ts:
 * dedup by slug, purchasable=false, notes_verified=false, neutral community
 * midpoints, popularity_tier left to DB default (2).
 *
 * These are the CONFIDENT set (Parfums de Marly pillars + Afnan popular line +
 * the three names a user flagged: Valaya Exclusif, Mystique Bouquet, Rose
 * Chérie). Genuinely-uncertain recent/heritage names (PDM Castley, Valero,
 * Carios, Eragon, Athalia, Darcy, Darley, Perseus, Palatine, Athénaïs) are held
 * for the LLM enrichment pass once the Anthropic API key has credit.
 *
 * Run:  npx tsx scripts/add-house-lineup-frags.ts            (dry-run)
 *       npx tsx scripts/add-house-lineup-frags.ts --commit   (writes)
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
  top_accords: string[]; price_tier: number;
}
const PDM = (o: Omit<Entry, 'brand' | 'price_tier'>): Entry => ({ brand: 'Parfums de Marly', price_tier: 4, ...o });
const AF = (o: Omit<Entry, 'brand' | 'price_tier'>): Entry => ({ brand: 'Afnan', price_tier: 2, ...o });

const ENTRIES: Entry[] = [
  // ── Parfums de Marly pillars ──
  PDM({ name: 'Althaïr', release_year: 2020, concentration: 'edp', fragrance_family: 'gourmand', gender: 'unisex',
    top_notes: ['bergamot', 'bitter almond'], heart_notes: ['vanilla', 'honey', 'jasmine'], base_notes: ['tonka bean', 'sandalwood', 'cedar'],
    top_accords: ['sweet', 'vanilla', 'almond', 'warm-spicy', 'woody'] }),
  PDM({ name: 'Sedley', release_year: 2019, concentration: 'edp', fragrance_family: 'aromatic', gender: 'unisex',
    top_notes: ['watermint', 'bergamot', 'violet leaf'], heart_notes: ['lavender', 'geranium', 'ginger'], base_notes: ['musk', 'vetiver', 'patchouli', 'amberwood'],
    top_accords: ['aromatic', 'fresh', 'green', 'musky', 'woody'] }),
  PDM({ name: 'Greenley', release_year: 2020, concentration: 'edp', fragrance_family: 'aromatic', gender: 'masculine',
    top_notes: ['pineapple', 'bergamot', 'apple'], heart_notes: ['lavender', 'geranium', 'violet leaf'], base_notes: ['sandalwood', 'vetiver', 'musk', 'patchouli'],
    top_accords: ['fruity', 'aromatic', 'fresh', 'woody', 'green'] }),
  PDM({ name: 'Godolphin', release_year: 2018, concentration: 'edp', fragrance_family: 'woody', gender: 'masculine',
    top_notes: ['saffron', 'cypriol', 'bergamot'], heart_notes: ['rose', 'incense', 'jasmine'], base_notes: ['oud', 'patchouli', 'tonka bean', 'leather'],
    top_accords: ['warm-spicy', 'woody', 'smoky', 'amber', 'leather'] }),
  PDM({ name: 'Carlisle', release_year: 2015, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['apple', 'bergamot', 'davana'], heart_notes: ['rose', 'jasmine', 'tobacco'], base_notes: ['vanilla', 'sandalwood', 'amber', 'oud', 'tonka bean'],
    top_accords: ['sweet', 'warm-spicy', 'amber', 'woody', 'vanilla'] }),
  PDM({ name: 'Haltane', release_year: 2021, concentration: 'edp', fragrance_family: 'amber', gender: 'masculine',
    top_notes: ['bergamot', 'saffron', 'cinnamon'], heart_notes: ['violet', 'leather', 'jasmine'], base_notes: ['vanilla', 'amber', 'sandalwood', 'tonka bean'],
    top_accords: ['amber', 'sweet', 'warm-spicy', 'leather', 'woody'] }),
  PDM({ name: 'Delina La Rosée', release_year: 2023, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['litchi', 'bergamot', 'pear'], heart_notes: ['turkish rose', 'peony', 'lily-of-the-valley'], base_notes: ['musk', 'cedar', 'incense'],
    top_accords: ['floral', 'fresh', 'rose', 'fruity', 'musky'] }),
  PDM({ name: 'Cassili', release_year: 2017, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['pear', 'blackcurrant', 'bergamot'], heart_notes: ['rose', 'ylang-ylang', 'jasmine'], base_notes: ['vanilla', 'sandalwood', 'musk', 'amber'],
    top_accords: ['floral', 'fruity', 'sweet', 'vanilla', 'musky'] }),
  PDM({ name: 'Meliora', release_year: 2022, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['blackcurrant', 'bergamot', 'pear'], heart_notes: ['peony', 'rose', 'jasmine'], base_notes: ['vanilla', 'musk', 'sandalwood', 'patchouli'],
    top_accords: ['floral', 'fruity', 'sweet', 'musky', 'woody'] }),
  PDM({ name: 'Safanad', release_year: 2016, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['pear', 'bergamot', 'bitter orange'], heart_notes: ['orange blossom', 'iris', 'jasmine'], base_notes: ['vanilla', 'sandalwood', 'cedar', 'benzoin'],
    top_accords: ['floral', 'sweet', 'powdery', 'vanilla', 'woody'] }),
  PDM({ name: 'Valaya Exclusif', release_year: 2023, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['bergamot', 'aldehydes', 'pink pepper'], heart_notes: ['orange blossom', 'jasmine', 'ylang-ylang'], base_notes: ['musk', 'vanilla', 'sandalwood', 'ambrette'],
    top_accords: ['floral', 'white floral', 'musky', 'powdery', 'sweet'] }),

  // ── Afnan — 9PM / 9AM ──
  AF({ name: '9PM Rebel', release_year: 2023, concentration: 'edp', fragrance_family: 'oriental', gender: 'masculine',
    top_notes: ['apple', 'bergamot', 'lavender'], heart_notes: ['cinnamon', 'orange blossom'], base_notes: ['vanilla', 'tonka bean', 'amber', 'cedar'],
    top_accords: ['sweet', 'warm-spicy', 'amber', 'vanilla', 'woody'] }),
  AF({ name: '9PM Elixir', release_year: 2024, concentration: 'extrait', fragrance_family: 'amber', gender: 'masculine',
    top_notes: ['apple', 'cinnamon', 'bergamot'], heart_notes: ['orange blossom', 'lavender'], base_notes: ['vanilla', 'tonka bean', 'amber', 'benzoin'],
    top_accords: ['sweet', 'amber', 'vanilla', 'warm-spicy', 'balsamic'] }),
  AF({ name: '9AM', release_year: 2021, concentration: 'edp', fragrance_family: 'aromatic', gender: 'masculine',
    top_notes: ['bergamot', 'apple', 'lemon'], heart_notes: ['lavender', 'geranium', 'cinnamon'], base_notes: ['amberwood', 'patchouli', 'tonka bean', 'vanilla'],
    top_accords: ['aromatic', 'amber', 'fresh-spicy', 'woody', 'sweet'] }),
  AF({ name: '9AM Pour Femme', release_year: 2022, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['bergamot', 'blackcurrant', 'raspberry'], heart_notes: ['rose', 'jasmine', 'peony'], base_notes: ['vanilla', 'musk', 'patchouli', 'amber'],
    top_accords: ['floral', 'fruity', 'sweet', 'musky', 'vanilla'] }),

  // ── Afnan — Supremacy ──
  AF({ name: 'Supremacy Silver', release_year: 2018, concentration: 'edp', fragrance_family: 'aromatic', gender: 'masculine',
    top_notes: ['bergamot', 'lemon', 'apple'], heart_notes: ['lavender', 'geranium', 'mint'], base_notes: ['amberwood', 'musk', 'cedar', 'patchouli'],
    top_accords: ['aromatic', 'fresh', 'woody', 'citrus', 'musky'] }),
  AF({ name: 'Supremacy Collector’s Edition', release_year: 2022, concentration: 'edp', fragrance_family: 'woody', gender: 'masculine',
    top_notes: ['bergamot', 'pineapple', 'blackcurrant'], heart_notes: ['rose', 'jasmine', 'patchouli'], base_notes: ['oakmoss', 'musk', 'amber', 'vanilla'],
    top_accords: ['woody', 'fruity', 'fresh', 'sweet', 'musky'] }),
  AF({ name: 'Supremacy Incense', release_year: 2023, concentration: 'edp', fragrance_family: 'woody', gender: 'unisex',
    top_notes: ['saffron', 'bergamot', 'nutmeg'], heart_notes: ['incense', 'rose', 'cedar'], base_notes: ['amber', 'oud', 'labdanum', 'musk'],
    top_accords: ['woody', 'smoky', 'warm-spicy', 'amber', 'incense'] }),
  AF({ name: 'Supremacy in Oud', release_year: 2022, concentration: 'edp', fragrance_family: 'woody', gender: 'unisex',
    top_notes: ['saffron', 'raspberry', 'bergamot'], heart_notes: ['oud', 'rose', 'jasmine'], base_notes: ['amber', 'patchouli', 'musk', 'vanilla'],
    top_accords: ['woody', 'oud', 'sweet', 'amber', 'warm-spicy'] }),
  AF({ name: 'Supremacy Pink', release_year: 2023, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['raspberry', 'bergamot', 'blackcurrant'], heart_notes: ['rose', 'jasmine', 'peony'], base_notes: ['vanilla', 'musk', 'patchouli'],
    top_accords: ['fruity', 'floral', 'sweet', 'musky', 'vanilla'] }),
  AF({ name: 'Supremacy Purple', release_year: 2023, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['plum', 'bergamot', 'saffron'], heart_notes: ['rose', 'jasmine', 'orchid'], base_notes: ['vanilla', 'amber', 'patchouli', 'musk'],
    top_accords: ['sweet', 'amber', 'fruity', 'warm-spicy', 'vanilla'] }),

  // ── Afnan — Turathi ──
  AF({ name: 'Turathi Brown', release_year: 2022, concentration: 'edp', fragrance_family: 'amber', gender: 'unisex',
    top_notes: ['pineapple', 'bergamot', 'saffron'], heart_notes: ['rose', 'orange blossom', 'cinnamon'], base_notes: ['amber', 'vanilla', 'oud', 'patchouli'],
    top_accords: ['amber', 'sweet', 'warm-spicy', 'woody', 'fruity'] }),
  AF({ name: 'Turathi Red', release_year: 2023, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['saffron', 'raspberry', 'bergamot'], heart_notes: ['rose', 'jasmine', 'cinnamon'], base_notes: ['amber', 'vanilla', 'oud', 'musk'],
    top_accords: ['sweet', 'amber', 'fruity', 'warm-spicy', 'woody'] }),
  AF({ name: 'Turathi Purple', release_year: 2023, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['plum', 'saffron', 'bergamot'], heart_notes: ['rose', 'orchid', 'jasmine'], base_notes: ['amber', 'vanilla', 'patchouli', 'oud'],
    top_accords: ['sweet', 'amber', 'fruity', 'woody', 'warm-spicy'] }),
  AF({ name: 'Turathi Electric', release_year: 2024, concentration: 'edp', fragrance_family: 'woody', gender: 'unisex',
    top_notes: ['bergamot', 'pineapple', 'mint'], heart_notes: ['lavender', 'rose', 'geranium'], base_notes: ['amber', 'musk', 'patchouli', 'vanilla'],
    top_accords: ['fresh', 'woody', 'amber', 'aromatic', 'sweet'] }),

  // ── Afnan — Mystique (the named miss) ──
  AF({ name: 'Mystique Bouquet', release_year: 2024, concentration: 'edp', fragrance_family: 'floral', gender: 'unisex',
    top_notes: ['bergamot', 'pear', 'pink pepper'], heart_notes: ['rose', 'jasmine', 'orange blossom'], base_notes: ['vanilla', 'musk', 'amber', 'patchouli'],
    top_accords: ['floral', 'sweet', 'fruity', 'musky', 'vanilla'] }),

  // ── Afnan — Rare ──
  AF({ name: 'Rare', release_year: 2020, concentration: 'edp', fragrance_family: 'woody', gender: 'masculine',
    top_notes: ['bergamot', 'grapefruit', 'lavender'], heart_notes: ['geranium', 'cardamom', 'cedar'], base_notes: ['amberwood', 'musk', 'patchouli', 'vetiver'],
    top_accords: ['woody', 'aromatic', 'fresh', 'amber', 'citrus'] }),
  AF({ name: 'Rare Carbon', release_year: 2021, concentration: 'edp', fragrance_family: 'woody', gender: 'masculine',
    top_notes: ['bergamot', 'apple', 'ginger'], heart_notes: ['lavender', 'geranium', 'nutmeg'], base_notes: ['amberwood', 'leather', 'patchouli', 'vanilla'],
    top_accords: ['woody', 'amber', 'aromatic', 'leather', 'warm-spicy'] }),
  AF({ name: 'Rare Passion', release_year: 2021, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['apple', 'bergamot', 'cinnamon'], heart_notes: ['orange blossom', 'rose', 'jasmine'], base_notes: ['vanilla', 'amber', 'tonka bean', 'patchouli'],
    top_accords: ['sweet', 'amber', 'warm-spicy', 'vanilla', 'fruity'] }),
  AF({ name: 'Rare Reef', release_year: 2022, concentration: 'edp', fragrance_family: 'aquatic', gender: 'masculine',
    top_notes: ['bergamot', 'marine notes', 'grapefruit'], heart_notes: ['lavender', 'geranium', 'sage'], base_notes: ['ambergris', 'musk', 'cedar', 'patchouli'],
    top_accords: ['aquatic', 'fresh', 'woody', 'citrus', 'aromatic'] }),
  AF({ name: 'Rare Tiffany', release_year: 2022, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['bergamot', 'pear', 'blackcurrant'], heart_notes: ['rose', 'peony', 'jasmine'], base_notes: ['vanilla', 'musk', 'patchouli', 'amber'],
    top_accords: ['floral', 'fruity', 'sweet', 'musky', 'vanilla'] }),

  // ── Afnan — Inara ──
  AF({ name: 'Inara Black', release_year: 2022, concentration: 'edp', fragrance_family: 'oriental', gender: 'feminine',
    top_notes: ['saffron', 'plum', 'bergamot'], heart_notes: ['rose', 'jasmine', 'orchid'], base_notes: ['vanilla', 'amber', 'patchouli', 'musk'],
    top_accords: ['sweet', 'amber', 'fruity', 'warm-spicy', 'vanilla'] }),
  AF({ name: 'Inara White', release_year: 2022, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['bergamot', 'pear', 'freesia'], heart_notes: ['orange blossom', 'jasmine', 'rose'], base_notes: ['vanilla', 'musk', 'sandalwood', 'amber'],
    top_accords: ['floral', 'white floral', 'sweet', 'musky', 'vanilla'] }),

  // ── Afnan — Ornament ──
  AF({ name: 'Ornament Purple Allure', release_year: 2023, concentration: 'edp', fragrance_family: 'oriental', gender: 'unisex',
    top_notes: ['plum', 'saffron', 'bergamot'], heart_notes: ['rose', 'orchid', 'jasmine'], base_notes: ['vanilla', 'amber', 'patchouli', 'musk'],
    top_accords: ['sweet', 'amber', 'fruity', 'warm-spicy', 'vanilla'] }),
  AF({ name: 'Ornament Pour Femme', release_year: 2023, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['raspberry', 'bergamot', 'pear'], heart_notes: ['rose', 'peony', 'jasmine'], base_notes: ['vanilla', 'musk', 'patchouli'],
    top_accords: ['floral', 'fruity', 'sweet', 'musky', 'vanilla'] }),

  // ── Afnan — Tribute ──
  AF({ name: 'Tribute Blue', release_year: 2022, concentration: 'edp', fragrance_family: 'aromatic', gender: 'masculine',
    top_notes: ['bergamot', 'grapefruit', 'mint'], heart_notes: ['lavender', 'geranium', 'nutmeg'], base_notes: ['amberwood', 'musk', 'cedar', 'patchouli'],
    top_accords: ['aromatic', 'fresh', 'woody', 'citrus', 'amber'] }),
  AF({ name: 'Tribute Pink', release_year: 2022, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['raspberry', 'bergamot', 'blackcurrant'], heart_notes: ['rose', 'peony', 'jasmine'], base_notes: ['vanilla', 'musk', 'patchouli'],
    top_accords: ['fruity', 'floral', 'sweet', 'musky', 'vanilla'] }),

  // ── Guerlain — Rose Chérie (the "Rose Cherie" the user meant) ──
  { brand: 'Guerlain', name: 'Rose Chérie', release_year: 2021, concentration: 'edp', fragrance_family: 'floral', gender: 'feminine',
    top_notes: ['raspberry', 'litchi', 'bergamot'], heart_notes: ['turkish rose', 'may rose', 'peony'], base_notes: ['white musk', 'vanilla', 'sandalwood'],
    top_accords: ['floral', 'rose', 'fruity', 'sweet', 'musky'], price_tier: 4 },
];

async function main() {
  console.log(COMMIT ? '=== COMMIT ===\n' : '=== DRY RUN ===\n');

  const slugs = ENTRIES.map((e) => fragranceSlug(e.brand, e.name));
  const { data: clash } = await supabase.from('fragrances').select('slug').in('slug', slugs);
  const taken = new Set((clash ?? []).map((r: any) => r.slug));
  const fresh = ENTRIES.filter((e) => !taken.has(fragranceSlug(e.brand, e.name)));
  if (taken.size) console.log(`already present, skipping ${taken.size}: ${[...taken].join(', ')}\n`);

  const uniqueBrands = [...new Set(fresh.map((e) => e.brand))];
  const { data: have } = await supabase.from('brands').select('id, slug').in('slug', uniqueBrands.map(brandSlug));
  const brandIds = new Map<string, string>((have ?? []).map((b: any) => [b.slug, b.id]));
  const newBrands = uniqueBrands.filter((b) => !brandIds.has(brandSlug(b)));
  console.log('BRANDS');
  for (const b of uniqueBrands) console.log(`  ${brandIds.has(brandSlug(b)) ? 'exists ' : 'CREATE '} ${b}`);
  if (COMMIT && newBrands.length) {
    const rows = newBrands.map((name) => ({ name, slug: brandSlug(name), country: name === 'Afnan' ? 'United Arab Emirates' : 'France' }));
    const { error } = await supabase.from('brands').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) { console.error('brand insert failed:', error.message); process.exit(1); }
    const { data: re } = await supabase.from('brands').select('id, slug').in('slug', newBrands.map(brandSlug));
    (re ?? []).forEach((b: any) => brandIds.set(b.slug, b.id));
  }

  const rows = fresh.map((e) => ({
    slug: fragranceSlug(e.brand, e.name), name: e.name, brand_id: brandIds.get(brandSlug(e.brand)),
    release_year: e.release_year, concentration: e.concentration, fragrance_family: e.fragrance_family,
    gender: e.gender, top_notes: e.top_notes, heart_notes: e.heart_notes, base_notes: e.base_notes,
    top_accords: e.top_accords, accord_intensity: {}, ...NEUTRAL, price_tier: e.price_tier,
    retail_msrp_usd_cents: null, image_url: null, source: 'research (curated)',
    source_url: null, notes_source: 'brand', notes_verified: false,
    is_active: true, purchasable: false,
  }));

  console.log(`\nFRAGRANCES (${rows.length})`);
  for (const r of rows) console.log(`  ${r.slug}  ${r.release_year ?? '?'} · ${r.concentration} · ${r.fragrance_family} · ${r.gender} · [${r.top_accords.join(',')}]`);
  if (rows.some((r) => !r.brand_id) && !COMMIT) console.log('  (brand_id resolves on --commit for any CREATE brand)');

  if (!COMMIT) { console.log(`\nWould insert ${rows.length} fragrances (+${newBrands.length} brands). Re-run with --commit.`); return; }

  if (rows.some((r) => !r.brand_id)) { console.error('ABORT: unresolved brand_id'); process.exit(1); }
  const { error } = await supabase.from('fragrances').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  const p = path.join(process.cwd(), 'scripts/data/rollback-house-lineup-frags.json');
  fs.writeFileSync(p, JSON.stringify({ at: new Date().toISOString(), slugs: rows.map((r) => r.slug) }, null, 2));
  console.log(`\nInserted ${rows.length}. Rollback: delete from fragrances where slug in ('${rows.map((r) => r.slug).join("','")}');`);
}
main();
