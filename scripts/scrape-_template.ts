/**
 * SCRAPER TEMPLATE — copy to scripts/scrape-{brand}.ts and customize.
 *
 * Each brand site has its own DOM, so each scraper is a small bespoke script.
 * The OUTPUT shape is shared (CandidateFragrance from ./types) so the rest
 * of the pipeline (merge → enrich → insert → similarity) doesn't care which
 * brand it came from.
 *
 * Steps to fork this for a new brand:
 *   1. Set BRAND, CATEGORY_URL, OUT_PATH constants below.
 *   2. Update listProducts() to extract PDP links from the brand's category page.
 *   3. Update scrapeProductPage() selectors to grab name, notes, sizes, prices.
 *   4. Test on 5 PDPs before letting it loose on the full catalog.
 *
 * Conventions:
 *   - Always set sources: [BRAND_ID] so merge can prioritize properly.
 *   - Leave fields you can't reliably extract as null/[] — DO NOT guess.
 *     Fragrantica enrichment + LLM enrichment will fill them later.
 *   - Always honor a polite delay between requests (≥ 1000ms).
 *   - Always flush partial output every 10 PDPs (crash safety).
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Page } from 'puppeteer';
import { CandidateFragrance } from './types';

// ──────────────────────────────────────────────────────────────
// CONFIG — change these per brand
// ──────────────────────────────────────────────────────────────
const BRAND = 'Brand Name';
const BRAND_ID = 'brandid';                                // matches "source" field in CandidateFragrance
const CATEGORY_URL = 'https://www.example.com/fragrances';
const POLITE_DELAY_MS = 1200;
const OUT_PATH = path.join(__dirname, 'data', `${BRAND_ID}-raw.json`);

// ──────────────────────────────────────────────────────────────

interface ProductLink { name: string; url: string; }

async function listProducts(page: Page): Promise<ProductLink[]> {
  await page.goto(CATEGORY_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
  // TODO: customize for the brand's category-page DOM.
  return page.evaluate(() => {
    const out: { name: string; url: string }[] = [];
    document.querySelectorAll('a[href*="/fragrance"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      const name = a.textContent?.trim() ?? '';
      if (name && !out.some((o) => o.url === href)) out.push({ name, url: href });
    });
    return out;
  });
}

async function scrapeProductPage(page: Page, link: ProductLink): Promise<CandidateFragrance | null> {
  await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });

  // TODO: customize the selectors for this brand's PDP DOM.
  const data = await page.evaluate(() => {
    const name = document.querySelector('h1')?.textContent?.trim() ?? '';
    const image = (document.querySelector('img.product') as HTMLImageElement | null)?.src ?? null;
    return { name, image };
  });

  if (!data.name) return null;

  return {
    brand: BRAND,
    name: data.name,
    release_year: null,
    concentration: null,
    fragrance_family: null,
    gender: null,
    top_notes: [],
    heart_notes: [],
    base_notes: [],
    top_accords: [],
    accord_intensity: {},
    community_longevity: null,
    community_sillage: null,
    community_projection: null,
    compliment_score: null,
    versatility_score: null,
    office_safe_score: null,
    price_tier: null,
    retail_msrp_usd_cents: null,
    prices: [],
    image_url: data.image,
    source: BRAND_ID,
    source_url: link.url,
    sources: [BRAND_ID],
  };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PerfumePicksBot/1.0');

  console.log(`Listing ${BRAND} products...`);
  const links = await listProducts(page);
  console.log(`Found ${links.length} product links`);

  const out: CandidateFragrance[] = [];
  for (const [i, link] of links.entries()) {
    process.stdout.write(`  [${i + 1}/${links.length}] ${link.name.slice(0, 60)}... `);
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
