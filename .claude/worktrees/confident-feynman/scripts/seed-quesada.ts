/**
 * Seeds Quesada-branded cigars into the DB with real product images sourced
 * from the archived official quesadacigars.com (via Wayback Machine). Used
 * with permission from Quesada Cigars since their current site is offline.
 *
 * Images are downloaded from archive.org's raw-image endpoint and uploaded
 * to our public `cigar-images` bucket under the `quesada/` prefix.
 *
 * Usage:
 *   npx tsx scripts/seed-quesada.ts           # dry run
 *   npx tsx scripts/seed-quesada.ts --commit  # wipe + reseed
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BRAND = 'Quesada';
const STORAGE_BUCKET = 'cigar-images';
const STORAGE_PREFIX = 'quesada';
const ARCHIVE_PREFIX = 'https://web.archive.org/web/20250105114440im_/';

type VitolaDef = { vitola: string; size: string; image?: string };
type LineDef = {
  line: string;
  imageSlug: string;
  mainImage: string; // Line/packaging shot
  wrapper: string;
  binder: string;
  filler: string[];
  origin: string;
  strength: number;
  body: number;
  priceTier: number;
  flavors: string[];
  description: string;
  vitolas: VitolaDef[];
};

const CATALOG: LineDef[] = [
  {
    line: 'Reserva Privada',
    imageSlug: 'reserva-privada',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/06/ReservaPrivada.jpg',
    wrapper: 'Ecuadorian Connecticut',
    binder: 'Dominican San Vicente (1997)',
    filler: ['Dominican', 'Pennsylvania Ligero'],
    origin: 'Dominican Republic',
    strength: 3,
    body: 3,
    priceTier: 4,
    flavors: ['cream', 'cedar', 'nuts', 'earth', 'mild spice'],
    description: 'A creamy, complex medium-bodied Connecticut built around an exceedingly rare 1997 Dominican San Vicente binder — the last crop harvested before the passing of Manuel Quesada Sr.',
    vitolas: [
      { vitola: 'Robusto', size: '4¾ x 52', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRP-ROBUSTO-4-3-4-X-52.png' },
      { vitola: 'Toro', size: '5⅝ x 54', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRP-TORO-5-5-8-X-54.png' },
      { vitola: 'Toro Gordo', size: '6½ x 56', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRP-TORO-GORDO-6-1.5-X-56.png' },
    ],
  },
  {
    line: 'Reserva Privada Oscuro',
    imageSlug: 'reserva-privada-oscuro',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/06/ReservaPrivadaOscuro.jpg',
    wrapper: 'Connecticut Broadleaf',
    binder: 'Dominican 1997 Criollo',
    filler: ['Dominican', 'Pennsylvania Ligero'],
    origin: 'Dominican Republic',
    strength: 4,
    body: 4,
    priceTier: 4,
    flavors: ['cocoa', 'espresso', 'earth', 'pepper', 'leather'],
    description: 'The broadleaf-wrapped sibling to Reserva Privada — rich cocoa, espresso, and earth with a peppery backbone. Built on the legendary 1997 Criollo binder.',
    vitolas: [
      { vitola: 'Robusto', size: '4¾ x 52', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRPO-ROBUSTO-4-3-4-X-52.png' },
      { vitola: 'Toro', size: '5⅝ x 54', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRPO-TORO-5-5-8-X-54.png' },
    ],
  },
  {
    line: 'Reserva Privada Barber Pole',
    imageSlug: 'reserva-privada-barberpole',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/06/ReservaPrivadaBArberpole.jpg',
    wrapper: 'Connecticut + Habano Barber Pole',
    binder: 'Dominican 1997 Criollo',
    filler: ['Dominican', 'Pennsylvania Ligero'],
    origin: 'Dominican Republic',
    strength: 3,
    body: 3,
    priceTier: 4,
    flavors: ['cream', 'cedar', 'sweetness', 'pepper', 'complexity'],
    description: 'A rare barber pole of Connecticut and Habano, marrying the two Reserva Privada profiles in a single cigar. Layered sweetness, spice, and remarkable balance.',
    vitolas: [
      { vitola: 'Robusto', size: '4¾ x 52', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRPB-ROBUSTO-4-3-4-X-52.png' },
      { vitola: 'Toro', size: '5⅝ x 54', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QRPB-TORO-5-5-8-X-54.png' },
    ],
  },
  {
    line: 'Oktoberfest',
    imageSlug: 'oktoberfest',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2019/06/QOKTOBERFEST2019.jpg',
    wrapper: 'Mexican San Andrés',
    binder: 'Dominican',
    filler: ['Dominican'],
    origin: 'Dominican Republic',
    strength: 4,
    body: 4,
    priceTier: 3,
    flavors: ['dark cocoa', 'coffee', 'earth', 'pepper', 'malt'],
    description: 'A dark, oily Dominican puro with a Mexican San Andrés wrapper — blended specifically to pair with Märzen-style Oktoberfest beer. Rich, malty, and earthy.',
    vitolas: [
      { vitola: 'Perfecto', size: '5 x 38/58/44', image: 'https://quesadacigars.com/wp-content/uploads/2019/07/QOD-Kuguel-5x38_58_44.png' },
      { vitola: 'Belicoso', size: '5½ x 52', image: 'https://quesadacigars.com/wp-content/uploads/2019/07/QOD-BAVARIAN-5-1-2-X-52.png' },
      { vitola: 'Toro', size: '6 x 49', image: 'https://quesadacigars.com/wp-content/uploads/2019/07/QOD-Kaiser-Ludwig-6-x-49.png' },
      { vitola: 'Toro', size: '6 x 52', image: 'https://quesadacigars.com/wp-content/uploads/2019/07/QOD-DAS-BOOT-6-X-52.png' },
      { vitola: 'Gordo', size: '6 x 65', image: 'https://quesadacigars.com/wp-content/uploads/2019/07/QOD-UBER-6-X-65.png' },
    ],
  },
  {
    line: 'Tributo',
    imageSlug: 'tributo',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/06/QTributo.jpg',
    wrapper: 'Ecuadorian Hybrid (Habano 2000, Corojo, Vuelta Arriba, Sumatra)',
    binder: 'Dominican Habano Ligero',
    filler: ['Dominican', 'Nicaraguan Ligero'],
    origin: 'Dominican Republic',
    strength: 4,
    body: 4,
    priceTier: 3,
    flavors: ['earth', 'coffee', 'pepper', 'leather', 'nuts', 'sweet finish'],
    description: 'A full-bodied Quesada family tribute to those they have lost — each vitola named for a family member. Complex earth, coffee, leather, with a long sweet finish.',
    vitolas: [
      { vitola: 'Petit Corona', size: '4¼ x 40', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QT-ALVARITO-4-1-4-X-40.png' },
      { vitola: 'Robusto', size: '5 x 50', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QT-JULIO-5-X-50.png' },
      { vitola: 'Torpedo', size: '6 x 52', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/ALVARO-6-X-52-TORPEDO.png' },
      { vitola: 'Gordo', size: '6½ x 60', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QT-MANOLIN-6-1-2-X-60.png' },
    ],
  },
  {
    line: 'Selección España',
    imageSlug: 'seleccion-espana',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/06/QuesadaEspania.jpg',
    wrapper: 'Ecuadorian Arapiraca',
    binder: 'Dominican',
    filler: ['Dominican', 'Connecticut Broadleaf', 'Nicaraguan'],
    origin: 'Dominican Republic',
    strength: 3,
    body: 4,
    priceTier: 3,
    flavors: ['cedar', 'pepper', 'tea', 'earth', 'complexity'],
    description: 'A Cubanesque medium-to-full profile — cedar, pepper, and tea notes with tremendous balance. Blended for European tastes with smaller, traditional vitolas.',
    vitolas: [
      { vitola: 'Short Robusto', size: '4 x 50', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QE-SHORT-ROBUSTO-4-X-50.png' },
      { vitola: 'Robusto', size: '5 x 52', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QE-ROBUSTO-5-X-52.png' },
      { vitola: 'Corona', size: '5½ x 42', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QE-CORONA-5-1-2-X-42.png' },
    ],
  },
  {
    line: 'Keg',
    imageSlug: 'keg',
    mainImage: 'https://quesadacigars.com/wp-content/uploads/2018/07/HolidayKEG.jpg',
    wrapper: 'Nicaraguan Habano',
    binder: 'Nicaraguan',
    filler: ['Nicaraguan'],
    origin: 'Nicaragua',
    strength: 3,
    body: 3,
    priceTier: 3,
    flavors: ['cedar', 'pepper', 'cocoa', 'coffee'],
    description: 'A Nicaraguan-made holiday release from Quesada — balanced medium-bodied blend with cedar, pepper, and cocoa notes.',
    vitolas: [
      { vitola: 'Toro', size: '6 x 50', image: 'https://quesadacigars.com/wp-content/uploads/2018/06/QK-HOLIDAY-KEG-TORO-6-X-50.png' },
    ],
  },
];

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const archiveUrl = ARCHIVE_PREFIX + url;
  const resp = await fetch(archiveUrl);
  if (!resp.ok) throw new Error(`download failed ${resp.status}: ${archiveUrl}`);
  const contentType = resp.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const ab = await resp.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType, ext };
}

async function uploadImage(slug: string, source: string): Promise<string> {
  const { buffer, contentType, ext } = await downloadImage(source);
  const path = `${STORAGE_PREFIX}/${slug}.${ext}`;
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`upload failed for ${path}: ${error.message}`);
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  const commit = process.argv.includes('--commit');

  let totalRows = 0;
  for (const l of CATALOG) totalRows += l.vitolas.length;
  console.log(`Catalog: ${CATALOG.length} lines, ${totalRows} rows.`);

  if (!commit) {
    console.log('\nLines:');
    for (const l of CATALOG) {
      console.log(`  ${l.line} (${l.vitolas.length} vitolas, wrap: ${l.wrapper})`);
    }
    console.log('\nRe-run with --commit to wipe + reseed.');
    return;
  }

  // 1. Upload images (per-vitola where available, plus the main line shot as a backstop)
  console.log('\n=== UPLOADING IMAGES ===');
  // Backstop per-line image (used if a vitola has no specific shot)
  const lineImageByLine = new Map<string, string>();
  for (const l of CATALOG) {
    try {
      const url = await uploadImage(l.imageSlug, l.mainImage);
      lineImageByLine.set(l.line, url);
      console.log(`  LINE ${l.line} → ${url}`);
    } catch (e) {
      console.error(`  FAILED line ${l.line}:`, (e as Error).message);
    }
  }
  // Per-vitola images
  const vitolaImageByKey = new Map<string, string>();
  for (const l of CATALOG) {
    for (let i = 0; i < l.vitolas.length; i++) {
      const v = l.vitolas[i];
      if (!v.image) continue;
      const slug = `${l.imageSlug}-${v.vitola.toLowerCase().replace(/\s+/g, '-')}-${i}`;
      try {
        const url = await uploadImage(slug, v.image);
        vitolaImageByKey.set(`${l.line}|${i}`, url);
        console.log(`  VIT  ${l.line} ${v.vitola} → ${url}`);
      } catch (e) {
        console.error(`  FAILED vitola ${l.line} ${v.vitola}:`, (e as Error).message);
      }
    }
  }

  // 2. Delete existing Quesada rows
  console.log('\n=== WIPING EXISTING QUESADA ROWS ===');
  const { count: before } = await sb
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .eq('brand', BRAND);
  console.log(`  Existing: ${before}`);
  const { error: delErr } = await sb.from('cigars').delete().eq('brand', BRAND);
  if (delErr) throw new Error(`delete failed: ${delErr.message}`);
  console.log('  Deleted.');

  // 3. Insert new rows
  console.log('\n=== INSERTING NEW ROWS ===');
  const inserts: any[] = [];
  for (const l of CATALOG) {
    for (let i = 0; i < l.vitolas.length; i++) {
      const v = l.vitolas[i];
      const vitolaImg = vitolaImageByKey.get(`${l.line}|${i}`);
      const lineImg = lineImageByLine.get(l.line);
      inserts.push({
        brand: BRAND,
        line: l.line,
        name: `${l.line} ${v.vitola}`,
        vitola: v.vitola,
        strength: l.strength,
        body: l.body,
        price_tier: l.priceTier,
        wrapper: l.wrapper,
        binder: l.binder,
        filler: l.filler,
        origin: l.origin,
        flavors: l.flavors,
        description: l.description,
        image_url: vitolaImg ?? lineImg ?? null,
      });
    }
  }
  const { error: insErr, count: insCount } = await sb
    .from('cigars')
    .insert(inserts, { count: 'exact' });
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);
  console.log(`  Inserted ${insCount} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
