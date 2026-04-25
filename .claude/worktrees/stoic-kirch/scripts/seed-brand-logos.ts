/**
 * Seed one logo per brand into the brand_logos table.
 *
 * Picks the best single image we can find for each brand, in priority order:
 *   1. Most-used existing cigars.image_url for that brand IF it's a CI product
 *      shot (cigarsinternational.com/product/iris/...) — whatever the
 *      catalog currently settles on is a good proxy for "the canonical image"
 *   2. First entry in scripts/data/ci-brand-images.json for the brand
 *   3. First item in scripts/data/ci-scraped-raw.json[brand] with an imageUrl
 *   4. First halfwheel entry for the brand with an image_url
 *   5. Skip (leave brand without a logo — CigarImage keeps the placeholder)
 *
 * Never picks a generic Unsplash URL — a reused stock photo is worse than
 * the placeholder for brand identity.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   EXPO_PUBLIC_SUPABASE_URL=https://....supabase.co \
 *   npx tsx scripts/seed-brand-logos.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY = new Set(process.argv.slice(2)).has('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env. Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function isUsable(url: string | null | undefined): boolean {
  if (!url) return false;
  // Never seed a generic Unsplash stock photo as a brand logo.
  if (url.includes('images.unsplash.com')) return false;
  return true;
}

async function mostUsedCigarImage(brand: string): Promise<string | null> {
  // PostgREST can't do GROUP BY, so pull all rows for the brand with an image
  // and tally on the client. Brands max out around 200 SKUs so the response
  // stays small.
  const { data, error } = await supabase
    .from('cigars')
    .select('image_url')
    .eq('brand', brand)
    .not('image_url', 'is', null);
  if (error || !data) return null;
  const counts = new Map<string, number>();
  for (const r of data) {
    const u = r.image_url as string | null;
    if (!isUsable(u)) continue;
    // Prefer CI product shots — they're the cleanest white-bg photos
    const weight = u!.includes('img.cigarsinternational.com/product') ? 10 : 1;
    counts.set(u!, (counts.get(u!) ?? 0) + weight);
  }
  if (counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [u, c] of counts) {
    if (c > bestCount) { best = u; bestCount = c; }
  }
  return best;
}

async function main() {
  console.log(`seed-brand-logos  ${DRY ? '[DRY-RUN]' : '[WRITE]'}`);

  // Load fallback sources
  const dataDir = path.join(__dirname, 'data');
  let ciBrandImages: Record<string, string[]> = {};
  let ciScraped: Record<string, Array<{ name: string; imageUrl: string }>> = {};
  let halfwheel: Array<{ brand?: string; image_url?: string }> = [];
  try {
    ciBrandImages = JSON.parse(fs.readFileSync(path.join(dataDir, 'ci-brand-images.json'), 'utf8'));
  } catch {}
  try {
    ciScraped = JSON.parse(fs.readFileSync(path.join(dataDir, 'ci-scraped-raw.json'), 'utf8'));
  } catch {}
  try {
    halfwheel = JSON.parse(fs.readFileSync(path.join(dataDir, 'halfwheel-raw.json'), 'utf8'));
  } catch {}

  // Index halfwheel by brand for O(1) lookup
  const hwByBrand = new Map<string, string>();
  for (const r of halfwheel) {
    if (!r.brand || !r.image_url || hwByBrand.has(r.brand)) continue;
    if (isUsable(r.image_url)) hwByBrand.set(r.brand, r.image_url);
  }

  // Distinct brands from DB
  const brandSet = new Set<string>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('cigars')
        .select('brand')
        .order('brand')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) if (r.brand) brandSet.add(r.brand.trim());
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  const brands = [...brandSet].sort();
  console.log(`Brands to seed: ${brands.length}`);

  const picks: Array<{ brand: string; logo: string; tier: 1 | 2 | 3 | 4 }> = [];
  const skipped: string[] = [];

  for (const brand of brands) {
    // Tier 1 — most-used existing cigars image for this brand
    const used = await mostUsedCigarImage(brand);
    if (used) { picks.push({ brand, logo: used, tier: 1 }); continue; }

    // Tier 2 — ci-brand-images.json
    const cbi = ciBrandImages[brand];
    if (Array.isArray(cbi)) {
      const first = cbi.find((u) => isUsable(u));
      if (first) { picks.push({ brand, logo: first, tier: 2 }); continue; }
    }

    // Tier 3 — ci-scraped-raw.json
    const csr = ciScraped[brand];
    if (Array.isArray(csr)) {
      const first = csr.find((p) => isUsable(p.imageUrl));
      if (first) { picks.push({ brand, logo: first.imageUrl, tier: 3 }); continue; }
    }

    // Tier 4 — halfwheel
    const hw = hwByBrand.get(brand);
    if (hw) { picks.push({ brand, logo: hw, tier: 4 }); continue; }

    skipped.push(brand);
  }

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of picks) tierCounts[p.tier]++;

  console.log(`\nLogos picked:  ${picks.length}`);
  console.log(`  tier 1 (existing cigar image): ${tierCounts[1]}`);
  console.log(`  tier 2 (ci-brand-images):      ${tierCounts[2]}`);
  console.log(`  tier 3 (ci-scraped-raw):       ${tierCounts[3]}`);
  console.log(`  tier 4 (halfwheel):            ${tierCounts[4]}`);
  console.log(`Brands skipped (no image in any source): ${skipped.length}`);
  if (skipped.length) {
    console.log(`  examples: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}`);
  }

  if (DRY) {
    console.log('\n(dry-run) no writes.');
    console.log('First 5 picks:');
    for (const p of picks.slice(0, 5)) {
      console.log(`  [tier ${p.tier}] ${p.brand} → ${p.logo.slice(0, 80)}`);
    }
    return;
  }

  // Upsert in batches (service key can write through RLS)
  const BATCH = 100;
  let written = 0;
  for (let i = 0; i < picks.length; i += BATCH) {
    const slice = picks.slice(i, i + BATCH);
    const { error } = await supabase.from('brand_logos').upsert(
      slice.map((p) => ({ brand: p.brand, logo_url: p.logo })),
      { onConflict: 'brand' },
    );
    if (error) {
      console.warn(`  batch ${i / BATCH + 1} failed: ${error.message}`);
    } else {
      written += slice.length;
    }
    process.stdout.write(`\r  written ${written}/${picks.length}  `);
  }
  console.log('\n\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
