/**
 * Insert enriched-candidates.json into Supabase.
 *
 * Idempotent: brands and fragrances are upserted by slug, prices are upserted
 * by (fragrance_id, retailer, size_ml, is_decant). Safe to re-run after
 * adding a new tranche or re-enriching.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (NEVER use the anon key here — RLS would block writes)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { CandidateFragrance, normalize } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const IN_PATH = path.join(DATA_DIR, 'enriched-candidates.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Brand alias map — normalizes variant names to canonical form.
const BRAND_ALIASES: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'brand-aliases.json'), 'utf-8'),
);
function canonicalBrand(raw: string): string {
  return BRAND_ALIASES[raw] ?? BRAND_ALIASES[raw.trim()] ?? raw.trim();
}

function brandSlug(name: string): string { return normalize(name).replace(/\s+/g, '-'); }
function fragranceSlug(brand: string, name: string): string {
  return `${normalize(brand)}-${normalize(name)}`.replace(/\s+/g, '-');
}

async function ensureBrand(name: string): Promise<string> {
  const canonical = canonicalBrand(name);
  const slug = brandSlug(canonical);
  const { data: existing } = await supabase
    .from('brands').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) return existing.id;
  const { data: inserted, error } = await supabase
    .from('brands')
    .insert({ name: canonical, slug })
    .select('id').single();
  if (error) throw error;
  return inserted.id;
}

async function upsertFragrance(brandId: string, r: CandidateFragrance): Promise<string> {
  const slug = fragranceSlug(r.brand, r.name);
  const payload = {
    brand_id: brandId,
    name: r.name,
    slug,
    release_year: r.release_year,
    concentration: r.concentration,
    fragrance_family: r.fragrance_family,
    gender: r.gender,
    top_notes: r.top_notes,
    heart_notes: r.heart_notes,
    base_notes: r.base_notes,
    top_accords: r.top_accords,
    accord_intensity: r.accord_intensity,
    community_longevity: r.community_longevity,
    community_sillage: r.community_sillage,
    community_projection: r.community_projection,
    compliment_score: r.compliment_score,
    versatility_score: r.versatility_score,
    office_safe_score: r.office_safe_score,
    price_tier: r.price_tier,
    retail_msrp_usd_cents: r.retail_msrp_usd_cents,
    image_url: r.image_url,
    source: r.source,
    source_url: r.source_url,
  };
  const { data, error } = await supabase
    .from('fragrances')
    .upsert(payload, { onConflict: 'slug' })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

async function upsertPrices(fragranceId: string, r: CandidateFragrance) {
  if (!r.prices?.length) return;
  const rows = r.prices.map((p) => ({
    fragrance_id: fragranceId,
    retailer: p.retailer,
    size_ml: p.size_ml,
    price_usd_cents: p.price_usd_cents,
    is_decant: p.is_decant,
    url: p.url ?? null,
    in_stock: p.in_stock ?? null,
  }));
  const { error } = await supabase
    .from('fragrance_prices')
    .upsert(rows, { onConflict: 'fragrance_id,retailer,size_ml,is_decant' });
  if (error) throw error;
}

async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`No input at ${IN_PATH}. Run enrich-catalog-llm.ts first.`);
    process.exit(1);
  }
  const rows: CandidateFragrance[] = JSON.parse(fs.readFileSync(IN_PATH, 'utf-8'));
  console.log(`Inserting ${rows.length} fragrances...`);

  const brandCache = new Map<string, string>();
  let okCount = 0, errCount = 0;

  for (const [i, r] of rows.entries()) {
    try {
      const cBrand = canonicalBrand(r.brand);
      let brandId = brandCache.get(cBrand);
      if (!brandId) {
        brandId = await ensureBrand(r.brand);
        brandCache.set(cBrand, brandId);
      }
      const fragId = await upsertFragrance(brandId, r);
      await upsertPrices(fragId, r);
      okCount++;
      if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${rows.length}] ok=${okCount} err=${errCount}`);
    } catch (e) {
      errCount++;
      console.warn(`  [${i + 1}] ${r.brand} - ${r.name}: ${(e as Error).message}`);
    }
  }
  console.log(`\nDone. ok=${okCount} err=${errCount} brands=${brandCache.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
