import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Flags:
//   --brands-from-db    Pull the brand list from cigars table instead of the
//                       hardcoded array below. Required to cover the 300+
//                       brands the original hardcoded list missed.
//   --only-missing      Restrict writes to cigars where image_url IS NULL.
//                       Default safety — nothing with a non-null URL ever
//                       gets overwritten. Protects against the mass-overwrite
//                       that clobbered 3000 rows on a prior run.
//   --include-unsplash  Combine with --only-missing to also treat the reused
//                       Unsplash stock URLs as eligible targets (still never
//                       overwrites genuine CI / Supabase-storage photos).
//   --dry-run           Scrape + match as usual but skip DB writes.
const args = new Set(process.argv.slice(2));
const BRANDS_FROM_DB = args.has('--brands-from-db');
const ONLY_MISSING = args.has('--only-missing');
const INCLUDE_UNSPLASH = args.has('--include-unsplash');
const DRY_RUN = args.has('--dry-run');

interface ScrapedProduct {
  name: string;
  imageUrl: string;
}

// Fallback brand list (small, hardcoded). Used only when --brands-from-db is
// absent. The real run always prefers DB-derived brands so we don't miss the
// 300+ brands this array never knew about.
const FALLBACK_BRANDS = [
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

async function loadBrandList(): Promise<string[]> {
  if (!BRANDS_FROM_DB) return FALLBACK_BRANDS;
  // Pull distinct brand values from the catalog — paginated just in case.
  const seen = new Set<string>();
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
    for (const r of data) if (r.brand) seen.add(r.brand.trim());
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const list = [...seen].sort();
  console.log(`Loaded ${list.length} brands from DB.`);
  return list;
}

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

// Stopwords dropped before token comparison. "cigar(s)" appear in nearly every
// CI product title and would otherwise inflate match scores spuriously.
const STOPWORDS = new Set([
  'cigar', 'cigars', 'the', 'and', 'of', 'a', 'an', 'for', 'pack', 'box',
  'single', 'sampler', 'maduro', 'natural', // wrapper colors — too generic
]);

function tokenize(s: string): string[] {
  return normalize(s).split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Score: number of non-stopword tokens from cigar.name (minus brand) that
// appear in scrapedName. Vitola token is required if cigar has a vitola.
// Returns 0 if the cigar can't plausibly be the scraped product.
function matchScore(
  cigarBrand: string,
  cigarName: string,
  cigarVitola: string | null,
  scrapedName: string,
): number {
  const brandTokens = new Set(tokenize(cigarBrand));
  const nameTokens = tokenize(cigarName).filter((t) => !brandTokens.has(t));
  const vitTokens = cigarVitola ? new Set(tokenize(cigarVitola)) : new Set<string>();
  const scrapedTokens = new Set(tokenize(scrapedName));

  // Exact substring short-circuit (full cigar name inside product title)
  const sn = normalize(scrapedName);
  if (sn.includes(normalize(cigarName))) return 999;

  // Require ≥2 non-brand cigar-name tokens in the product name
  let hits = 0;
  for (const t of nameTokens) if (scrapedTokens.has(t)) hits++;
  if (hits < 2) return 0;

  // If the cigar has a vitola, require at least one vitola token in the
  // product name — prevents matching the wrong SKU within a line.
  if (vitTokens.size > 0) {
    let vitHit = false;
    for (const vt of vitTokens) if (scrapedTokens.has(vt)) { vitHit = true; break; }
    if (!vitHit) return 0;
  }

  return hits;
}

function isGenericStock(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('images.unsplash.com');
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env. Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  console.log(
    `Flags: brands-from-db=${BRANDS_FROM_DB}  only-missing=${ONLY_MISSING}  dry-run=${DRY_RUN}\n`,
  );

  const brandList = await loadBrandList();

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  );
  await page.setViewport({ width: 1280, height: 800 });

  const allScraped: Record<string, ScrapedProduct[]> = {};
  let totalImages = 0;

  for (let i = 0; i < brandList.length; i++) {
    const brand = brandList[i];
    process.stdout.write(`[${i + 1}/${brandList.length}] ${brand}...`);
    const products = await scrapeSearch(page, brand + ' cigars');
    allScraped[brand] = products;
    totalImages += products.length;
    console.log(` ${products.length} images`);
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\nScraped ${totalImages} total product images across ${brandList.length} brands`);

  const scrapePath = path.join(__dirname, 'data', 'ci-scraped-raw.json');
  fs.writeFileSync(scrapePath, JSON.stringify(allScraped, null, 2));
  console.log(`Raw data saved to ${scrapePath}`);

  // Fetch cigars to map. Paginated because .select() caps at 1000 rows.
  console.log('\nFetching cigars from database...');
  const cigars: Array<{ id: string; brand: string; name: string; vitola: string | null; image_url: string | null }> = [];
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('cigars')
        .select('id, brand, name, vitola, image_url')
        .order('brand')
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('DB error:', error.message);
        await browser.close();
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      cigars.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const candidates = ONLY_MISSING
    ? cigars.filter((c) => !c.image_url || (INCLUDE_UNSPLASH && isGenericStock(c.image_url)))
    : cigars;
  console.log(
    `Mapping ${candidates.length} cigars` +
      (ONLY_MISSING ? ` (only-missing${INCLUDE_UNSPLASH ? ' +unsplash' : ''})` : '') +
      '\n',
  );

  let matched = 0;
  let unmatched = 0;

  for (const cigar of candidates) {
    const brandProducts = allScraped[cigar.brand] || [];
    if (brandProducts.length === 0) {
      unmatched++;
      continue;
    }

    let bestScore = 0;
    let bestImage = '';
    for (const p of brandProducts) {
      const score = matchScore(cigar.brand, cigar.name, cigar.vitola, p.name);
      if (score > bestScore) {
        bestScore = score;
        bestImage = p.imageUrl;
      }
    }

    // If nothing clears the threshold, leave it alone. A placeholder is
    // better than a wrong image — that was the original script's bug.
    if (!bestImage) {
      unmatched++;
      continue;
    }

    if (DRY_RUN) {
      matched++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('cigars')
      .update({ image_url: bestImage })
      .eq('id', cigar.id);

    if (!updateErr) matched++;
    else unmatched++;
  }

  console.log(`\nDone!${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`  Matched with CI images: ${matched}`);
  console.log(`  No qualifying CI match:  ${unmatched}`);

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
