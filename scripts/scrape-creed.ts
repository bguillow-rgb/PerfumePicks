/**
 * Scrape the Creed Boutique fragrance category.
 *
 * Source: https://www.creedboutique.com/collections/womens-fragrances
 *         https://www.creedboutique.com/collections/mens-fragrances
 *         https://www.creedboutique.com/collections/unisex-fragrances
 *
 * Same shape as scrape-tomford.ts (CandidateFragrance[] output → merge step).
 *
 * Hazards:
 *   - Shopify-based, occasionally rate-limits; 1.5s polite delay.
 *   - Some PDPs use a different Notes structure (paragraph vs list).
 *   - Reviews/notes for older fragrances often live in PDF brochures —
 *     leave those fields null and let LLM enrichment fill from name/family.
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Page } from 'puppeteer';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'creed-raw.json');

const CATEGORY_URLS = [
  'https://www.creedboutique.com/collections/womens-fragrances',
  'https://www.creedboutique.com/collections/mens-fragrances',
  'https://www.creedboutique.com/collections/unisex-fragrances',
];
const POLITE_DELAY_MS = 1500;

function parsePriceCents(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}
function parseSizeMl(text: string | null): number | null {
  if (!text) return null;
  const m = text.toLowerCase().replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)\s*(?:ml|fl)/);
  return m ? parseFloat(m[1]) : null;
}

interface ProductLink { name: string; url: string; }

async function listProducts(page: Page, categoryUrl: string): Promise<ProductLink[]> {
  console.log(`  GET ${categoryUrl}`);
  await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 30_000 });
  return page.evaluate(() => {
    const out: { name: string; url: string }[] = [];
    document.querySelectorAll('a[href*="/products/"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      const name = (a.querySelector('[class*="title"], h3, h2')?.textContent ?? a.textContent ?? '').trim();
      if (name && name.length > 2 && !out.some((o) => o.url === href)) {
        out.push({ name, url: href });
      }
    });
    return out;
  });
}

async function scrapeProductPage(page: Page, link: ProductLink): Promise<CandidateFragrance | null> {
  try {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
  } catch { return null; }

  const data = await page.evaluate(() => {
    const name = document.querySelector('h1')?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    function notesUnder(label: string): string[] {
      const headings = Array.from(document.querySelectorAll('h2, h3, h4, p, strong'))
        .filter((el) => el.textContent?.trim().toLowerCase().includes(label.toLowerCase()));
      const out: string[] = [];
      for (const h of headings) {
        const next = h.parentElement?.nextElementSibling || h.nextElementSibling;
        const t = next?.textContent ?? '';
        for (const part of t.split(/[,;•\n]/)) {
          const trimmed = part.trim();
          if (trimmed.length > 1 && trimmed.length < 40) out.push(trimmed);
        }
      }
      return Array.from(new Set(out));
    }
    const variants: { size: string; price: string }[] = [];
    document.querySelectorAll('[class*="variant"], [data-product-variant]').forEach((v) => {
      const size = v.textContent?.trim() ?? '';
      const price = v.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
      if (size && price) variants.push({ size, price });
    });
    const img = document.querySelector('img[class*="product"], picture img') as HTMLImageElement | null;
    return {
      name,
      top: notesUnder('top notes'),
      heart: notesUnder('heart notes'),
      base: notesUnder('base notes'),
      variants,
      image: img?.src ?? null,
    };
  });

  if (!data.name) return null;
  const prices = data.variants.map((v) => ({
    retailer: 'creed-direct',
    size_ml: parseSizeMl(v.size) ?? 0,
    price_usd_cents: parsePriceCents(v.price) ?? 0,
    is_decant: false,
    url: link.url,
  })).filter((p) => p.size_ml > 0 && p.price_usd_cents > 0);
  const headline = prices.find((p) => p.size_ml === 75) ?? prices.find((p) => p.size_ml === 100) ?? prices[0];

  return {
    brand: 'Creed',
    name: data.name,
    release_year: null,
    concentration: 'edp' as Concentration,
    fragrance_family: null,
    gender: null,
    top_notes: data.top, heart_notes: data.heart, base_notes: data.base,
    top_accords: [], accord_intensity: {},
    community_longevity: null, community_sillage: null, community_projection: null,
    compliment_score: null, versatility_score: null, office_safe_score: null,
    price_tier: null,
    retail_msrp_usd_cents: headline?.price_usd_cents ?? null,
    prices,
    image_url: data.image,
    source: 'creed', source_url: link.url, sources: ['creed'],
  };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PerfumePicksBot/1.0');

  // Aggregate links across all category pages, dedupe.
  const seen = new Set<string>();
  const all: ProductLink[] = [];
  for (const url of CATEGORY_URLS) {
    for (const link of await listProducts(page, url)) {
      if (!seen.has(link.url)) { seen.add(link.url); all.push(link); }
    }
  }
  console.log(`Found ${all.length} unique Creed products`);

  const out: CandidateFragrance[] = [];
  for (const [i, link] of all.entries()) {
    process.stdout.write(`  [${i + 1}/${all.length}] ${link.name.slice(0, 60)}... `);
    try {
      const row = await scrapeProductPage(page, link);
      if (row) { out.push(row); process.stdout.write('ok\n'); }
      else process.stdout.write('skip\n');
    } catch (e) {
      process.stdout.write(`err: ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    if ((i + 1) % 10 === 0) fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances to ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
