import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: source .env.local && SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL npx tsx scripts/update-cigar-images.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// High-quality free Unsplash cigar photos — all are real cigar images
const CIGAR_IMAGES = [
  // Cigars in humidor / box
  'https://images.unsplash.com/photo-1694716438178-c6f34bddd64d?w=400&q=80',
  // Single cigar on wood with cutter
  'https://images.unsplash.com/photo-1537752609-53bd413e0aa0?w=400&q=80',
  // Cigar with band close up
  'https://images.unsplash.com/photo-1601821924561-8ee7078feb76?w=400&q=80',
  // Cigar on ashtray
  'https://images.unsplash.com/photo-1534175164374-ec4b5b62f990?w=400&q=80',
  // Premium cigar setup
  'https://images.unsplash.com/photo-1604784449129-be5d342e5af4?w=400&q=80',
  // Cigar with whiskey
  'https://images.unsplash.com/photo-1711662292644-8a37950481e1?w=400&q=80',
  // Dark moody cigar
  'https://images.unsplash.com/photo-1603824256092-2b191e88da7f?w=400&q=80',
  // Cigar smoke
  'https://images.unsplash.com/photo-1660236502653-f567247598cc?w=400&q=80',
  // Cuban style cigars
  'https://images.unsplash.com/photo-1585845191268-0c8a43c881dd?w=400&q=80',
  // Cigar collection
  'https://images.unsplash.com/photo-1651395226654-326603623f07?w=400&q=80',
  // Another cigar shot
  'https://images.unsplash.com/photo-1603292503665-11285eb9f4da?w=400&q=80',
  // Cigar with accessories
  'https://images.unsplash.com/photo-1603292503714-d151167aabe0?w=400&q=80',
];

// Map wrapper colors to image style preferences (darker wrappers get moodier images)
function getImageForCigar(index: number, strength: number): string {
  // Use strength to bias toward different images
  // Mild cigars get lighter/cleaner shots, full-bodied get darker/moodier
  const offset = Math.floor((strength - 1) / 2); // 0-2
  const imageIndex = (index + offset) % CIGAR_IMAGES.length;
  return CIGAR_IMAGES[imageIndex];
}

async function main() {
  // Fetch all cigars that don't have images (paginated)
  const cigars: { id: string; brand: string; name: string; strength: number }[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('cigars')
      .select('id, brand, name, strength')
      .is('image_url', null)
      .order('brand')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('Failed to fetch cigars:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    cigars.push(...data);
    from += PAGE;
    if (data.length < PAGE) break;
  }

  console.log(`Found ${cigars.length} cigars without images`);

  let updated = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < cigars.length; i += BATCH_SIZE) {
    const batch = cigars.slice(i, i + BATCH_SIZE);

    for (const cigar of batch) {
      const imageUrl = getImageForCigar(i + batch.indexOf(cigar), cigar.strength ?? 3);

      const { error: updateError } = await supabase
        .from('cigars')
        .update({ image_url: imageUrl })
        .eq('id', cigar.id);

      if (updateError) {
        console.error(`Failed to update ${cigar.brand} ${cigar.name}:`, updateError.message);
      } else {
        updated++;
      }
    }

    process.stdout.write(`\rUpdated: ${Math.min(i + BATCH_SIZE, cigars.length)}/${cigars.length}`);
  }

  console.log(`\n\nDone! Updated ${updated} cigars with images`);

  // Verify
  const { count } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .not('image_url', 'is', null);
  console.log(`Cigars with images: ${count}`);
}

main().catch(console.error);
