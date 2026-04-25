import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ScrapedProduct {
  name: string;
  imageUrl: string;
}

// All brands from our DB
const BRANDS = [
  'AJ Fernandez', 'Acid', 'Aganorsa Leaf', 'Alec Bradley', 'Arturo Fuente',
  'Ashton', 'Avo', 'Bolivar', 'Brick House', 'CAO', 'Caldwell', 'Camacho',
  'Casa Magna', 'Crowned Heads', 'Davidoff', 'Diesel', 'Drew Estate',
  'Dunbarton Tobacco & Trust', 'EP Carrillo', 'Foundation Cigar Co',
  'Gran Habano', 'Gurkha', 'H. Upmann', 'HVC', 'Hoyo de Monterrey',
  'Illusione', 'Joya de Nicaragua', 'La Aroma de Cuba', 'La Gloria Cubana',
  'La Palina', 'Liga Privada', 'Macanudo', 'Montecristo', 'My Father',
  'Nub', 'Oliva', 'Padron', 'Perdomo', 'Plasencia', 'Punch',
  'Regius', 'Rocky Patel', 'RoMa Craft', 'Romeo y Julieta',
  'San Cristobal', 'Sobremesa', 'Tatuaje', 'Trinidad', 'Viaje',
  'Villiger', 'Warped',
];

async function scrapeSearch(page: puppeteer.Page, query: string): Promise<ScrapedProduct[]> {
  const url = `https://www.cigarsinternational.com/shop/?q=${encodeURIComponent(query)}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.waitForSelector('img[src*="img.cigarsinternational.com"]', { timeout: 8000 }).catch(() => {});

    const products = await page.evaluate(() => {
      const results: { name: string; imageUrl: string }[] = [];
      document.querySelectorAll('img[src*="img.cigarsinternational.com"]').forEach(img => {
        const src = (img as HTMLImageElement).src || '';
        if (src.includes('/p/') || src.includes('/product/') || src.includes('/l/')) {
          let name = (img as HTMLImageElement).alt || '';
          name = name.replace(/^Search Images - /, '').replace(/\s+/g, ' ').trim();
          if (name && name.length > 3) {
            const clean = src.split('?')[0];
            if (!results.some(r => r.name === name)) {
              results.push({ name, imageUrl: clean });
            }
          }
        }
      });
      return results;
    });

    return products;
  } catch (e: any) {
    console.warn(`  Failed: ${query} - ${e.message?.substring(0, 60)}`);
    return [];
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchScore(cigarBrand: string, cigarName: string, scrapedName: string): number {
  const cb = normalize(cigarBrand);
  const cn = normalize(cigarName);
  const sn = normalize(scrapedName);

  // Exact name match within scraped
  if (sn.includes(cn)) return 100;

  // Count word overlap
  const cigarWords = new Set(`${cb} ${cn}`.split(' ').filter(w => w.length > 2));
  const scrapedWords = sn.split(' ').filter(w => w.length > 2);
  let hits = 0;
  for (const w of scrapedWords) {
    if (cigarWords.has(w)) hits++;
  }
  return hits;
}

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  // Scrape all brands
  const allScraped: Record<string, ScrapedProduct[]> = {};
  let totalImages = 0;

  for (let i = 0; i < BRANDS.length; i++) {
    const brand = BRANDS[i];
    process.stdout.write(`[${i + 1}/${BRANDS.length}] ${brand}...`);

    const products = await scrapeSearch(page, brand + ' cigars');
    allScraped[brand] = products;
    totalImages += products.length;

    console.log(` ${products.length} images`);

    // Small delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\nScraped ${totalImages} total product images across ${BRANDS.length} brands`);

  // Save raw scrape data
  const scrapePath = path.join(__dirname, 'data', 'ci-scraped-raw.json');
  fs.writeFileSync(scrapePath, JSON.stringify(allScraped, null, 2));
  console.log(`Raw data saved to ${scrapePath}`);

  // Now fetch our cigars from DB and do the mapping
  console.log('\nFetching cigars from database...');
  const { data: cigars, error } = await supabase
    .from('cigars')
    .select('id, brand, name')
    .order('brand');

  if (error || !cigars) {
    console.error('DB error:', error?.message);
    await browser.close();
    process.exit(1);
  }

  console.log(`Mapping ${cigars.length} cigars to scraped images...\n`);

  let matched = 0;
  let unmatched = 0;

  for (const cigar of cigars) {
    const brandProducts = allScraped[cigar.brand] || [];

    if (brandProducts.length === 0) {
      unmatched++;
      continue;
    }

    // Find best match
    let bestScore = 0;
    let bestImage = '';

    for (const p of brandProducts) {
      const score = matchScore(cigar.brand, cigar.name, p.name);
      if (score > bestScore) {
        bestScore = score;
        bestImage = p.imageUrl;
      }
    }

    // Use best match, or first brand image as fallback
    const imageUrl = bestImage || brandProducts[0]?.imageUrl;

    if (imageUrl) {
      const { error: updateErr } = await supabase
        .from('cigars')
        .update({ image_url: imageUrl })
        .eq('id', cigar.id);

      if (!updateErr) matched++;
      else unmatched++;
    } else {
      unmatched++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Matched with CI images: ${matched}`);
  console.log(`  No CI match (keeping current): ${unmatched}`);

  // Verify
  const { count } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%cigarsinternational%');
  console.log(`  Total with CI images in DB: ${count}`);

  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
