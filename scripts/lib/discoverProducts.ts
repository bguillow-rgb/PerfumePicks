/**
 * Multi-strategy product URL discovery.
 *
 * Brand sites use very different patterns to expose their catalog. This
 * helper tries the cheapest method first (sitemap via curl), then escalates
 * to stealth-puppeteer sitemap fetch, then to homepage scraping. Returns
 * a deduplicated list of product URLs that match the brand's pattern.
 */

import * as https from 'https';
import { Page } from 'puppeteer';

interface DiscoverOptions {
  /** All sitemap URLs to try (in order). */
  sitemapUrls?: string[];
  /** Optional homepage URLs to scrape if sitemaps are empty/blocked. */
  homepageUrls?: string[];
  /** Pattern to filter URLs (e.g., /\/products\//). */
  productPattern: RegExp;
  /** Optional patterns to EXCLUDE (e.g. /\/(cart|checkout)/). */
  excludePattern?: RegExp;
  /** When using puppeteer, this Page is reused. */
  page?: Page;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function fetchText(url: string, timeout = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'user-agent': UA, accept: '*/*' }, timeout },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.on('data', (c) => (body += c.toString()));
        res.on('end', () => resolve(body));
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function parseSitemapLocs(xml: string): string[] {
  // Naive but reliable for well-formed sitemaps.
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Recursively follow sitemap-index entries up to a small depth. */
async function fetchSitemapWithIndex(url: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const xml = await fetchText(url);
  if (!xml) return [];
  const locs = parseSitemapLocs(xml);
  if (xml.includes('<sitemapindex')) {
    const inner: string[] = [];
    for (const child of locs) {
      inner.push(...(await fetchSitemapWithIndex(child, depth + 1)));
    }
    return inner;
  }
  return locs;
}

/** Same as above but using stealth puppeteer when curl gets a 403. */
async function fetchSitemapViaPuppeteer(page: Page, url: string): Promise<string[]> {
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    if (!res || res.status() >= 400) return [];
    const xml = await page.content();
    return parseSitemapLocs(xml);
  } catch {
    return [];
  }
}

async function scrapeHomepageProductLinks(page: Page, url: string, pattern: RegExp): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => window.scrollBy(0, 1500));
    await new Promise((r) => setTimeout(r, 1000));
    const hrefs = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('a[href]').forEach((a) => {
        out.push((a as HTMLAnchorElement).href);
      });
      return out;
    });
    return hrefs.filter((h) => pattern.test(h));
  } catch {
    return [];
  }
}

export async function discoverProductUrls(opts: DiscoverOptions): Promise<string[]> {
  const found = new Set<string>();
  const matches = (u: string) =>
    opts.productPattern.test(u) && (!opts.excludePattern || !opts.excludePattern.test(u));

  // 1. curl sitemaps
  for (const sm of opts.sitemapUrls ?? []) {
    const urls = await fetchSitemapWithIndex(sm);
    for (const u of urls) if (matches(u)) found.add(u);
  }

  // 2. stealth-puppeteer sitemaps when curl returned nothing
  if (found.size === 0 && opts.page && opts.sitemapUrls?.length) {
    for (const sm of opts.sitemapUrls) {
      const urls = await fetchSitemapViaPuppeteer(opts.page, sm);
      for (const u of urls) if (matches(u)) found.add(u);
      if (found.size > 0) break;
    }
  }

  // 3. fall back to scraping homepage(s) for product anchor hrefs
  if (found.size === 0 && opts.page && opts.homepageUrls?.length) {
    for (const hp of opts.homepageUrls) {
      const urls = await scrapeHomepageProductLinks(opts.page, hp, opts.productPattern);
      for (const u of urls) if (matches(u)) found.add(u);
    }
  }

  return Array.from(found);
}
