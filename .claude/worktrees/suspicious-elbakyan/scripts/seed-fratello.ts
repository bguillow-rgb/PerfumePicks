/**
 * Wipes existing Fratello rows and reseeds the catalog using real images from
 * fratellocigar.com (used with permission from Fratello Cigars).
 *
 * Images are downloaded from fratellocigar.com and uploaded to the public
 * `cigar-images` bucket under the `fratello/` prefix so the app references
 * assets we own.
 *
 * Usage:
 *   npx tsx scripts/seed-fratello.ts           # dry run
 *   npx tsx scripts/seed-fratello.ts --commit  # wipe + reseed
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BRAND = 'Fratello';
const STORAGE_BUCKET = 'cigar-images';
const STORAGE_PREFIX = 'fratello';

type LineDef = {
  line: string;
  sourceImage: string;     // URL on fratellocigar.com
  imageSlug: string;       // storage path suffix (no extension)
  wrapper: string;
  binder: string;
  filler: string[];
  origin: string;
  strength: number; // 1-5
  body: number;     // 1-5
  priceTier: number; // 1-5 (fallback for price seeding)
  flavors: string[];
  description: string;
  vitolas: { vitola: string; size?: string }[];
};

const CATALOG: LineDef[] = [
  {
    line: 'Classico',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Classico.png',
    imageSlug: 'classico',
    wrapper: 'Nicaraguan Habano',
    binder: 'Ecuadorian',
    filler: ['Peruvian', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 3,
    flavors: ['leather', 'pepper', 'wood', 'toasted marshmallow', 'tea'],
    description: "Fratello's debut blend from 2013 — a medium-bodied multi-country selection with creamy leather, pepper, and toasted wood notes.",
    vitolas: [
      { vitola: 'Corona', size: '5½ x 46' },
      { vitola: 'Robusto', size: '5½ x 52' },
      { vitola: 'Toro', size: '6¼ x 54' },
      { vitola: 'Boxer', size: '6¼ x 52' },
      { vitola: 'Gordo', size: '6 x 60' }, // Timacle
    ],
  },
  {
    line: 'Bianco',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Bianco.png',
    imageSlug: 'bianco',
    wrapper: 'Mexican San Andrés Maduro',
    binder: 'Dominican',
    filler: ['USA', 'Nicaraguan', 'Peruvian'],
    origin: 'Nicaragua',
    strength: 3,
    body: 4,
    priceTier: 3,
    flavors: ['cocoa', 'earth', 'cream'],
    description: 'A smooth Mexican San Andrés maduro delivering rich cocoa, earth, and creamy tobacco from start to finish.',
    vitolas: [
      { vitola: 'Toro', size: '6 x 50' },     // Bianco II
      { vitola: 'Gordo', size: '5 x 56' },    // Bianco III
      { vitola: 'Churchill', size: '6½ x 54' }, // Bianco IV
      { vitola: 'Boxer', size: '6¼ x 52' },
    ],
  },
  {
    line: 'Oro',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Oro.png',
    imageSlug: 'oro',
    wrapper: 'Ecuadorian Connecticut',
    binder: 'African Cameroon',
    filler: ['Colombian', 'Dominican', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 3,
    flavors: ['cream', 'dried fruit', 'pepper', 'sweetness'],
    description: 'A mild-to-medium Connecticut-wrapped blend with creamy sweetness, dried fruit, and a gentle peppery finish.',
    vitolas: [
      { vitola: 'Corona', size: '5½ x 46' },
      { vitola: 'Robusto', size: '5 x 50' },
      { vitola: 'Toro', size: '6¼ x 54' },
      { vitola: 'Boxer', size: '6¼ x 52' },
      { vitola: 'Gordo', size: '6 x 60' },
    ],
  },
  {
    line: 'Fuoco Classico',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Classico-Fuoco.png',
    imageSlug: 'fuoco-classico',
    wrapper: 'Nicaraguan Habano',
    binder: 'Ecuadorian',
    filler: ['Peruvian', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 2,
    flavors: ['pepper', 'cedar', 'cream', 'wood'],
    description: 'A shorter pigtail-and-closed-foot format of the Classico blend designed for a concentrated 45-minute smoke.',
    vitolas: [{ vitola: 'Petit Robusto', size: '3½ x 50' }],
  },
  {
    line: 'Fuoco Oro',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Oro-Fuoco.png',
    imageSlug: 'fuoco-oro',
    wrapper: 'Ecuadorian Connecticut',
    binder: 'African Cameroon',
    filler: ['Colombian', 'Dominican', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 2,
    flavors: ['cream', 'dried fruit', 'sweetness'],
    description: 'Compact Connecticut-wrapped Fuoco — mild, creamy, and built for a 45-minute morning smoke.',
    vitolas: [{ vitola: 'Petit Robusto', size: '3½ x 50' }],
  },
  {
    line: 'Fuoco Bianco',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Bianco-Fuoco.png',
    imageSlug: 'fuoco-bianco',
    wrapper: 'Mexican San Andrés Maduro',
    binder: 'Dominican',
    filler: ['USA', 'Nicaraguan', 'Peruvian'],
    origin: 'Nicaragua',
    strength: 3,
    body: 4,
    priceTier: 2,
    flavors: ['cocoa', 'earth', 'cream'],
    description: 'A compact maduro Fuoco delivering the Bianco profile — cocoa, earth, and cream — in a quick smoke format.',
    vitolas: [{ vitola: 'Petit Robusto', size: '3½ x 50' }],
  },
  {
    line: 'Navetta',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Navetta.png',
    imageSlug: 'navetta',
    wrapper: 'Ecuadorian',
    binder: 'Dominican',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 4,
    body: 4,
    priceTier: 4,
    flavors: ['cocoa', 'leather', 'cedar', 'cherry', 'tea', 'black pepper'],
    description: "Fratello's most complex blend — aged three-year Nicaraguan tobaccos from a single farm, delivering dark cocoa, leather, and spice. Vitolas inspired by NASA space shuttles.",
    vitolas: [
      { vitola: 'Robusto', size: '5 x 50' },    // Discover
      { vitola: 'Toro', size: '6¼ x 52' },      // Atlantis
      { vitola: 'Toro', size: '6¼ x 54' },      // Endeavor
    ],
  },
  {
    line: 'Arlequin',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Arlequin.png',
    imageSlug: 'arlequin',
    wrapper: 'Mexican San Andrés',
    binder: 'Ecuadorian',
    filler: ['Peruvian', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 3,
    flavors: ['cinnamon', 'sweet', 'mediterranean spice', 'smooth'],
    description: 'Inspired by the 16th century Venetian carnival character — sweet cinnamon layers, Mediterranean spices, and a smooth finish.',
    vitolas: [
      { vitola: 'Corona', size: '5½ x 48' },
      { vitola: 'Robusto', size: '5½ x 52' },
      { vitola: 'Toro', size: '6¼ x 54' },
      { vitola: 'Gordo', size: '6 x 58' },
    ],
  },
  {
    line: 'Arlequin Connecticut',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Arlequin-CT.png',
    imageSlug: 'arlequin-ct',
    wrapper: 'Ecuadorian Connecticut',
    binder: 'Ecuadorian',
    filler: ['Peruvian', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 3,
    flavors: ['cream', 'earth', 'nuts', 'smooth'],
    description: 'Connecticut-wrapped Arlequin — mild-to-medium, smooth and balanced with nutty, earthy character.',
    vitolas: [
      { vitola: 'Robusto', size: '5½ x 52' },
      { vitola: 'Toro', size: '6¼ x 54' },
    ],
  },
  {
    line: 'The Texan',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Texan.png',
    imageSlug: 'texan',
    wrapper: 'HVA Ecuadorian',
    binder: 'Ecuadorian',
    filler: ['Dominican', 'Andullo', 'Nicaraguan', 'USA'],
    origin: 'Nicaragua',
    strength: 4,
    body: 4,
    priceTier: 3,
    flavors: ['nuts', 'cocoa', 'spice'],
    description: 'Fratello state exclusive — a large-format, ligero-forward blend balancing nutty cocoa with a spicy finish.',
    vitolas: [
      { vitola: 'A', size: '7⅛ x 58' },
      { vitola: 'Toro', size: '6 x 50' },
    ],
  },
  {
    line: 'Pocahontas',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2024/10/Fratello-Cigars-Pocahontas-Front.png',
    imageSlug: 'pocahontas',
    wrapper: 'Ecuadorian Habano',
    binder: 'Nicaraguan',
    filler: ['Dominican', 'Colombian', 'Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 3,
    flavors: ['nuts', 'cocoa', 'spice'],
    description: 'Virginia state exclusive commemorating Colonial tobacco heritage — nutty, cocoa-forward with a spicy profile.',
    vitolas: [{ vitola: 'Robusto', size: '5½ x 54' }],
  },
  {
    line: 'DMV Maduro',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/DMV-Maduro.png',
    imageSlug: 'dmv-maduro',
    wrapper: 'Maduro',
    binder: 'Undisclosed',
    filler: ['Undisclosed'],
    origin: 'Nicaragua',
    strength: 3,
    body: 4,
    priceTier: 3,
    flavors: ['cocoa', 'nuts', 'spice'],
    description: 'A tribute to DC, Maryland, and Virginia — where Fratello was born. Four undisclosed maduro blends in a sampler.',
    vitolas: [{ vitola: 'Toro', size: '6 x 50' }],
  },
  {
    line: 'Lunar Connecticut',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/07/1.png',
    imageSlug: 'lunar-connecticut',
    wrapper: 'Connecticut',
    binder: 'Mexican',
    filler: ['Dominican', 'Cameroon'],
    origin: 'Dominican Republic',
    strength: 3,
    body: 3,
    priceTier: 4,
    flavors: ['spice', 'leather', 'cedar'],
    description: 'Created with Intuitive Machines to commemorate the U.S. return to the moon. A luxurious Dominican puro with a Connecticut wrapper.',
    vitolas: [{ vitola: 'Toro', size: '6 x 50' }],
  },
  {
    line: 'Lunar Cameroon',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/07/2.png',
    imageSlug: 'lunar-cameroon',
    wrapper: 'Ecuadorian',
    binder: 'Cameroon',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 4,
    flavors: ['sweet', 'salty', 'silky', 'nuts'],
    description: "Lunar's Cameroon-binder variant — silky Ecuadorian wrapper with sweet-and-salty depth.",
    vitolas: [{ vitola: 'Toro', size: '6 x 50' }],
  },
  {
    line: 'Bianco Nero Riserva',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Bianco-Nero.png',
    imageSlug: 'bianco-nero',
    wrapper: 'Mexican San Andrés',
    binder: 'Indonesian',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 4,
    body: 4,
    priceTier: 4,
    flavors: ['cocoa', 'bold', 'smooth', 'dark'],
    description: 'A bold limited-edition reimagining of Bianco — box-pressed perfecto with medium-to-full intensity. Only 500 boxes produced.',
    vitolas: [{ vitola: 'Perfecto', size: '6 x 58' }],
  },
  {
    line: 'Sorella',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/02/Sorella.png',
    imageSlug: 'sorella',
    wrapper: 'Ecuadorian',
    binder: 'Indonesian',
    filler: ['Nicaraguan', 'Dominican'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 3,
    flavors: ['cream', 'fruity', 'pepper', 'roasted nuts'],
    description: 'Mild-to-medium with creamy, fruity character — subtle pepper and roasted nut richness.',
    vitolas: [{ vitola: 'Toro', size: '6 x 50' }],
  },
  {
    line: 'Camo Blue',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/03/Camo-Blue.png',
    imageSlug: 'camo-blue',
    wrapper: 'Maduro',
    binder: 'Nicaraguan',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 1,
    flavors: ['cocoa', 'earth', 'dark'],
    description: 'Value-line maduro — full flavor at a friendly price. Dark, earthy, cocoa-forward.',
    vitolas: [
      { vitola: 'Robusto', size: '5 x 50' },
      { vitola: 'Toro', size: '6 x 50' },
      { vitola: 'Gordo', size: '6 x 60' },
      { vitola: 'Churchill', size: '7 x 52' },
    ],
  },
  {
    line: 'Camo Rosso',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/03/Camo-Rosso.png',
    imageSlug: 'camo-rosso',
    wrapper: 'Habano',
    binder: 'Nicaraguan',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 1,
    flavors: ['spice', 'pepper', 'wood'],
    description: 'Habano-wrapped value cigar — spicy, peppery, satisfying for the daily smoker.',
    vitolas: [
      { vitola: 'Robusto', size: '5 x 50' },
      { vitola: 'Toro', size: '6 x 50' },
      { vitola: 'Gordo', size: '6 x 60' },
      { vitola: 'Churchill', size: '7 x 52' },
    ],
  },
  {
    line: 'Camo Verde',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/03/Camo-Verde.png',
    imageSlug: 'camo-verde',
    wrapper: 'Connecticut',
    binder: 'Nicaraguan',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 1,
    flavors: ['cream', 'nuts', 'smooth'],
    description: 'Connecticut-wrapped Camo — smooth, creamy, and mild. Approachable for beginners.',
    vitolas: [
      { vitola: 'Robusto', size: '5 x 50' },
      { vitola: 'Toro', size: '6 x 50' },
      { vitola: 'Gordo', size: '6 x 60' },
      { vitola: 'Churchill', size: '7 x 52' },
    ],
  },
  {
    line: 'Camo Sweet',
    sourceImage: 'https://fratellocigar.com/wp-content/uploads/2025/03/Camo-Sweet.png',
    imageSlug: 'camo-sweet',
    wrapper: 'Connecticut',
    binder: 'Nicaraguan',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 2,
    body: 2,
    priceTier: 1,
    flavors: ['sweet', 'vanilla', 'cream'],
    description: 'Sweet-tipped Camo — a friendly, sweetened intro to long-filler premiums.',
    vitolas: [
      { vitola: 'Robusto', size: '5 x 50' },
      { vitola: 'Toro', size: '6 x 50' },
      { vitola: 'Gordo', size: '6 x 60' },
      { vitola: 'Churchill', size: '7 x 52' },
    ],
  },
];

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed ${resp.status}: ${url}`);
  const contentType = resp.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const ab = await resp.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType, ext };
}

async function uploadImage(imageSlug: string, source: string): Promise<string> {
  const { buffer, contentType, ext } = await downloadImage(source);
  const path = `${STORAGE_PREFIX}/${imageSlug}.${ext}`;
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`upload failed for ${path}: ${error.message}`);
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  const commit = process.argv.includes('--commit');

  // Flatten catalog into row candidates
  const rows: Array<{
    line: string;
    imageSlug: string;
    sourceImage: string;
    brand: string;
    name: string;
    vitola: string;
    size: string | null;
    wrapper: string;
    binder: string;
    filler: string[];
    origin: string;
    strength: number;
    body: number;
    price_tier: number;
    flavors: string[];
    description: string;
  }> = [];

  for (const l of CATALOG) {
    for (const v of l.vitolas) {
      rows.push({
        line: l.line,
        imageSlug: l.imageSlug,
        sourceImage: l.sourceImage,
        brand: BRAND,
        name: `${l.line} ${v.vitola}`,
        vitola: v.vitola,
        size: v.size ?? null,
        wrapper: l.wrapper,
        binder: l.binder,
        filler: l.filler,
        origin: l.origin,
        strength: l.strength,
        body: l.body,
        price_tier: l.priceTier,
        flavors: l.flavors,
        description: l.description,
      });
    }
  }

  console.log(`Catalog: ${CATALOG.length} lines, ${rows.length} total rows.`);
  if (!commit) {
    console.log('\nDry run. Sample:');
    rows.slice(0, 5).forEach((r) => console.log(`  ${r.name} [${r.size}] wrap:${r.wrapper}`));
    console.log('\nRe-run with --commit to wipe + reseed.');
    return;
  }

  // 1. Upload images (dedup by imageSlug so each line's image is uploaded once)
  console.log('\n=== UPLOADING IMAGES ===');
  const imageUrlBySlug = new Map<string, string>();
  for (const l of CATALOG) {
    if (imageUrlBySlug.has(l.imageSlug)) continue;
    try {
      const url = await uploadImage(l.imageSlug, l.sourceImage);
      imageUrlBySlug.set(l.imageSlug, url);
      console.log(`  ${l.imageSlug} → ${url}`);
    } catch (e) {
      console.error(`  FAILED ${l.imageSlug}:`, (e as Error).message);
    }
  }

  // 2. Delete existing Fratello rows
  console.log('\n=== WIPING EXISTING FRATELLO ROWS ===');
  const { count: before } = await sb
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .eq('brand', BRAND);
  console.log(`  Existing: ${before}`);
  const { error: delErr } = await sb.from('cigars').delete().eq('brand', BRAND);
  if (delErr) throw new Error(`delete failed: ${delErr.message}`);
  console.log(`  Deleted.`);

  // 3. Insert new rows
  console.log('\n=== INSERTING NEW ROWS ===');
  const inserts = rows.map((r) => ({
    brand: r.brand,
    line: r.line,
    name: r.name,
    vitola: r.vitola,
    strength: r.strength,
    body: r.body,
    price_tier: r.price_tier,
    wrapper: r.wrapper,
    binder: r.binder,
    filler: r.filler,
    origin: r.origin,
    flavors: r.flavors,
    description: r.description,
    image_url: imageUrlBySlug.get(r.imageSlug) ?? null,
  }));
  const { error: insErr, count: insCount } = await sb
    .from('cigars')
    .insert(inserts, { count: 'exact' });
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);
  console.log(`  Inserted ${insCount} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
