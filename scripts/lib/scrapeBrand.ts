/**
 * Shared brand scraper runner.
 *
 * The per-source DOM is genuinely different on each site, so each per-brand
 * scraper supplies its own `extractFromPage` and `categoryUrls`. The runner
 * handles everything else: browser launch, polite delays, link dedupe,
 * crash-safe partial flushes, output formatting.
 *
 * Usage (per-brand file):
 *
 *   await runBrandScraper({
 *     brand: 'Le Labo',
 *     sourceId: 'lelabo',
 *     categoryUrls: ['https://lelabofragrances.com/eaux-de-parfum.html'],
 *     extractFromPage: (page, link) => page.evaluate(() => { ... }),
 *   });
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Page } from 'puppeteer';
import { CandidateFragrance, Concentration } from '../types';

export interface ProductLink { name: string; url: string; }

/** A "thin" PDP shape — what extractFromPage returns. The runner converts
 *  it into a full CandidateFragrance. */
export interface ScrapedPdp {
  name: string;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  prices: { retailer: string; size_ml: number; price_usd_cents: number; is_decant: boolean; url?: string }[];
  image_url: string | null;
  /** Optional concentration; defaults to 'edp' when absent. */
  concentration?: Concentration | null;
  /** Optional gender hint. */
  gender?: 'feminine' | 'masculine' | 'unisex' | null;
  /** Headline size in mL — the runner uses this size's price as retail_msrp. */
  headline_size_ml?: number;
}

export interface BrandScraperConfig {
  brand: string;
  sourceId: string;                          // e.g. 'lelabo'
  categoryUrls: string[];
  /** PDP link discovery — defaults to any /products/ or /fragrance/ anchor. */
  listProducts?: (page: Page, categoryUrl: string) => Promise<ProductLink[]>;
  /** Per-PDP extractor. Required. */
  extractFromPage: (page: Page, link: ProductLink) => Promise<ScrapedPdp | null>;
  politeDelayMs?: number;
  outDir?: string;                           // default scripts/data
}

async function defaultListProducts(page: Page, categoryUrl: string): Promise<ProductLink[]> {
  await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 30_000 });
  return page.evaluate(() => {
    const out: { name: string; url: string }[] = [];
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!/\/(products|fragrance|fragrances|product)\//i.test(href)) return;
      const name = (a.querySelector('[class*="title"], h1, h2, h3')?.textContent ?? a.textContent ?? '').trim();
      if (name && name.length > 2 && !out.some((o) => o.url === href)) {
        out.push({ name, url: href });
      }
    });
    return out;
  });
}

export async function runBrandScraper(cfg: BrandScraperConfig): Promise<CandidateFragrance[]> {
  const outDir = cfg.outDir ?? path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${cfg.sourceId}-raw.json`);
  const delay = cfg.politeDelayMs ?? 1500;
  const lister = cfg.listProducts ?? defaultListProducts;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PerfumePicksBot/1.0',
  );

  // Discover links across every category, dedupe by URL.
  const seen = new Set<string>();
  const links: ProductLink[] = [];
  for (const url of cfg.categoryUrls) {
    console.log(`  category: ${url}`);
    for (const link of await lister(page, url)) {
      if (!seen.has(link.url)) {
        seen.add(link.url);
        links.push(link);
      }
    }
  }
  console.log(`Found ${links.length} ${cfg.brand} products`);

  const out: CandidateFragrance[] = [];
  for (const [i, link] of links.entries()) {
    process.stdout.write(`  [${i + 1}/${links.length}] ${link.name.slice(0, 60)}... `);
    try {
      const pdp = await cfg.extractFromPage(page, link);
      if (pdp && pdp.name) {
        const headlineSize = pdp.headline_size_ml ?? 50;
        const headline = pdp.prices.find((p) => p.size_ml === headlineSize) ?? pdp.prices[0];
        out.push({
          brand: cfg.brand,
          name: pdp.name,
          release_year: null,
          concentration: pdp.concentration ?? 'edp',
          fragrance_family: null,
          gender: pdp.gender ?? null,
          top_notes: pdp.top_notes,
          heart_notes: pdp.heart_notes,
          base_notes: pdp.base_notes,
          top_accords: [],
          accord_intensity: {},
          community_longevity: null,
          community_sillage: null,
          community_projection: null,
          compliment_score: null,
          versatility_score: null,
          office_safe_score: null,
          price_tier: null,
          retail_msrp_usd_cents: headline?.price_usd_cents ?? null,
          prices: pdp.prices,
          image_url: pdp.image_url,
          source: cfg.sourceId,
          source_url: link.url,
          sources: [cfg.sourceId],
        });
        process.stdout.write('ok\n');
      } else {
        process.stdout.write('skip\n');
      }
    } catch (e) {
      process.stdout.write(`err: ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, delay));
    if ((i + 1) % 10 === 0) fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  }

  await browser.close();
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances to ${outPath}`);
  return out;
}

/** Common helpers exported for per-brand extractors. */
export function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}
export function parseSizeMl(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.toLowerCase().replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)\s*(?:ml|fl)/);
  return m ? parseFloat(m[1]) : null;
}
