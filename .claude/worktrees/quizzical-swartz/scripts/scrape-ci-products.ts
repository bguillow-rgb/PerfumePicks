/**
 * Cigars International product-detail scraper.
 *
 * Sibling to scripts/scrape-ci-puppeteer.ts (which only grabs images).
 * This version opens the product detail page and extracts the structured
 * spec block: wrapper / binder / filler / strength / size / country.
 * CI publishes a strength meter we can map to our 1-5 scale directly, which
 * lets us skip LLM enrichment for a big chunk of the new rows.
 *
 * Strategy:
 *   1. For each brand in BRANDS, run a search query and collect up to
 *      MAX_PER_BRAND product URLs.
 *   2. Visit each product URL, parse the spec section, capture the primary
 *      product image, write one JSON row per cigar to
 *      scripts/data/ci-products-raw.json.
 *
 * This intentionally targets the same BRAND list the image scraper uses so
 * the image-to-cigar mapping stays consistent.
 *
 * Usage:
 *   npx tsx scripts/scrape-ci-products.ts --brands "Padron,Arturo Fuente"
 *   npx tsx scripts/scrape-ci-products.ts --resume    # skip URLs already done
 *
 * Politeness: 1s delay between requests, shares the stockpicks-appears-to-be-
 * an-editorial-app user agent. Not abusive volume.
 */

import puppeteer, { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_PATH = path.join(__dirname, 'data', 'ci-products-raw.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const POLITE_DELAY_MS = 1000;
const MAX_PER_BRAND = 80;
const SEARCH_URL = (q: string) =>
  `https://www.cigarsinternational.com/shop/?q=${encodeURIComponent(q)}`;

const DEFAULT_BRANDS = [
  'Crowned Heads', 'Warped', 'Foundation', 'Dunbarton', 'RoMa Craft',
  'Aganorsa Leaf', 'Illusione', 'Espinosa', 'Tatuaje', 'Plasencia',
  'Padron', 'Arturo Fuente', 'Oliva', 'My Father', 'Davidoff', 'Camacho',
  'Drew Estate', 'Liga Privada', 'Undercrown', 'CAO', 'Perdomo',
  'Rocky Patel', 'Alec Bradley', 'AJ Fernandez', 'EP Carrillo',
  'Joya de Nicaragua', 'La Aroma de Cuba', 'La Gloria Cubana',
  'Macanudo', 'Montecristo', 'Romeo y Julieta', 'H. Upmann',
  'Ashton', 'Avo', 'Casa Magna', 'Gran Habano', 'Gurkha',
  'Cain', 'Herrera Estelí', 'Nat Sherman', 'Ferio Tego',
  'Kristoff', 'La Palina', 'Viaje', 'Sobremesa',
  'Black Label Trading', 'Fratello', 'HVC', 'Villiger',
  'La Flor Dominicana', 'Room 101', 'Asylum', 'Principle',
];

interface CIProductRow {
  source: 'cigarsinternational';
  source_url: string;
  title: string;
  brand: string | null;
  line: string | null;
  vitola: string | null;
  size: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  country: string | null;
  strength_raw: string | null;           // CI shows "Mild to Medium", etc.
  price_usd: number | null;
  image_url: string | null;
  description: string | null;
  scraped_at: string;
}

async function searchBrand(page: Page, brand: string): Promise<string[]> {
  const url = SEARCH_URL(brand);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
  } catch (e: any) {
    console.warn(`  search failed: ${e.message?.slice(0, 60)}`);
    return [];
  }
  const urls = await page.evaluate((max) => {
    const out: string[] = [];
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/cigars/"]').forEach((a) => {
      const href = a.href;
      if (!href.includes('/cigars/') || href.endsWith('/cigars/')) return;
      // CI product URLs look like /cigars/<brand-slug>/<product-slug>/<vitola-slug>/
      // Skip category links (only 2 path segments after /cigars/).
      const segs = href.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
      if (segs.length >= 3 && segs[0] === 'cigars') {
        out.push(href.split('#')[0].split('?')[0]);
      }
    });
    return Array.from(new Set(out)).slice(0, max);
  }, MAX_PER_BRAND);
  return urls;
}

async function extractProduct(page: Page, url: string): Promise<CIProductRow | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e: any) {
    console.warn(`  navigation failed: ${e.message?.slice(0, 60)}`);
    return null;
  }

  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() ?? '';

    // CI renders the spec block as a <dl> or a series of labeled rows.
    // Normalize by collecting every label:value pair in the product-info
    // container. We'll search with multiple candidate selectors.
    const specs: Record<string, string> = {};
    const blocks = document.querySelectorAll(
      '.product-specs, .product-info, .product-details, #product-specs, .specifications',
    );
    blocks.forEach((block) => {
      // <dl><dt>Label</dt><dd>Value</dd></dl>
      block.querySelectorAll('dt').forEach((dt) => {
        const dd = dt.nextElementSibling;
        if (!dd) return;
        const k = (dt.textContent ?? '').trim().toLowerCase().replace(/:$/, '');
        const v = (dd.textContent ?? '').trim();
        if (k && v) specs[k] = v;
      });
      // <li><strong>Label:</strong> Value</li>
      block.querySelectorAll('li, p, tr').forEach((el) => {
        const text = (el.textContent ?? '').trim();
        const colon = text.indexOf(':');
        if (colon <= 0 || colon > 30) return;
        const k = text.slice(0, colon).trim().toLowerCase();
        const v = text.slice(colon + 1).trim();
        if (k && v && !specs[k]) specs[k] = v;
      });
    });

    // Price — grab any visible .price or data-price attribute
    let priceText = document.querySelector<HTMLElement>(
      '[itemprop="price"], .price, .product-price',
    )?.textContent ?? '';
    if (!priceText) {
      const attr = document.querySelector('[data-price]')?.getAttribute('data-price');
      if (attr) priceText = attr;
    }

    // Product image — prefer high-res if available
    let image =
      document.querySelector<HTMLImageElement>('img.product-image, img[itemprop="image"]')?.src ??
      document.querySelector<HTMLImageElement>('img[src*="img.cigarsinternational.com"]')?.src ??
      null;
    if (image) image = image.split('?')[0];

    const description =
      document.querySelector('.product-description, [itemprop="description"]')?.textContent?.trim() ??
      null;

    return { title, specs, priceText, image, description };
  });

  if (!data.title) return null;

  const priceMatch = (data.priceText || '').match(/\$?([0-9]+(?:\.[0-9]+)?)/);
  const price = priceMatch ? parseFloat(priceMatch[1]) : null;

  const [brandGuess, ...rest] = data.title.split(/\s+/);
  const line = rest.join(' ').trim() || null;

  return {
    source: 'cigarsinternational',
    source_url: url,
    title: data.title,
    brand: brandGuess || null,
    line,
    vitola: data.specs['vitola'] ?? null,
    size: data.specs['size'] ?? data.specs['length x ring gauge'] ?? null,
    wrapper: data.specs['wrapper'] ?? null,
    binder: data.specs['binder'] ?? null,
    filler: (data.specs['filler'] ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
    country: data.specs['country'] ?? data.specs['origin'] ?? data.specs['from'] ?? null,
    strength_raw: data.specs['strength'] ?? null,
    price_usd: price,
    image_url: data.image,
    description: data.description,
    scraped_at: new Date().toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const brandsArg = args.indexOf('--brands');
  const resume = args.includes('--resume');
  const brands = brandsArg >= 0
    ? args[brandsArg + 1].split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_BRANDS;

  const existing: CIProductRow[] = resume && fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'))
    : [];
  const already = new Set(existing.map((r) => r.source_url));
  console.log(`resume=${resume} existing=${existing.length} brands=${brands.length}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 900 });

  const results: CIProductRow[] = [...existing];

  try {
    for (let b = 0; b < brands.length; b++) {
      const brand = brands[b];
      process.stdout.write(`\n[brand ${b + 1}/${brands.length}] ${brand}\n`);
      const productUrls = await searchBrand(page, brand);
      console.log(`  found ${productUrls.length} product URLs`);
      for (let i = 0; i < productUrls.length; i++) {
        const url = productUrls[i];
        if (already.has(url)) continue;
        const row = await extractProduct(page, url);
        if (row) {
          results.push(row);
          if (results.length % 20 === 0) {
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
          }
        }
        await sleep(POLITE_DELAY_MS);
      }
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
      console.log(`  total rows so far: ${results.length}`);
    }
    console.log(`wrote ${results.length} rows to ${OUTPUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
