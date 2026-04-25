/**
 * Maps scraped Cigars International product images to our cigars in Supabase.
 * Each cigar gets a unique real CI product image for its brand.
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // Load CI images
  const ciImagesPath = path.join(__dirname, 'data', 'ci-brand-images.json');
  const ciImages: Record<string, string[]> = JSON.parse(fs.readFileSync(ciImagesPath, 'utf-8'));

  console.log(`Loaded CI images: ${Object.keys(ciImages).length} brands`);

  // Load our cigars
  const { data: cigars, error } = await supabase
    .from('cigars')
    .select('id, brand, name')
    .order('brand, name');

  if (error || !cigars) {
    console.error('DB error:', error?.message);
    process.exit(1);
  }

  console.log(`Loaded ${cigars.length} cigars from database\n`);

  // Group our cigars by brand
  const byBrand: Record<string, typeof cigars> = {};
  for (const c of cigars) {
    if (!byBrand[c.brand]) byBrand[c.brand] = [];
    byBrand[c.brand].push(c);
  }

  let updated = 0;
  let noImages = 0;

  for (const [brand, brandCigars] of Object.entries(byBrand)) {
    // Find matching CI brand (fuzzy match on brand name)
    let ciKey = brand;
    if (!ciImages[ciKey]) {
      // Try partial matches
      const brandLower = brand.toLowerCase();
      ciKey = Object.keys(ciImages).find(k =>
        k.toLowerCase().includes(brandLower) || brandLower.includes(k.toLowerCase())
      ) || '';
    }

    const images = ciImages[ciKey] || [];

    if (images.length === 0) {
      console.log(`  ${brand}: NO CI images found`);
      noImages += brandCigars.length;
      continue;
    }

    // Distribute images across cigars in this brand
    // Each cigar gets a unique image (cycling if more cigars than images)
    for (let i = 0; i < brandCigars.length; i++) {
      const cigar = brandCigars[i];
      const imageUrl = images[i % images.length];

      const { error: updateErr } = await supabase
        .from('cigars')
        .update({ image_url: imageUrl })
        .eq('id', cigar.id);

      if (!updateErr) {
        updated++;
      }
    }

    console.log(`  ${brand}: ${brandCigars.length} cigars → ${images.length} CI images`);
  }

  console.log(`\nDone!`);
  console.log(`  Updated with CI images: ${updated}`);
  console.log(`  No CI images available: ${noImages}`);

  // Final count
  const { count } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%cigarsinternational%');
  console.log(`  Total with CI images: ${count}`);
}

main().catch(console.error);
