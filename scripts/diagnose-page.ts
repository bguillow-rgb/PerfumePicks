/**
 * Diagnostic harness — load a URL with stealth puppeteer, dump the
 * rendered DOM + a sampled selector report so we can write real selectors
 * against actual markup instead of guessing.
 *
 * Usage:
 *   npx tsx scripts/diagnose-page.ts <url> [outFile]
 *
 * Output:
 *   - {outFile}.html      — full rendered HTML
 *   - {outFile}.report.txt — counts of common selector candidates
 *
 * Default outFile = scripts/data/diagnose-{hostname}.html
 */

import * as fs from 'fs';
import * as path from 'path';
import { launchStealth, gotoAndHydrate } from './lib/stealthBrowser';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: tsx scripts/diagnose-page.ts <url> [outFile]');
    process.exit(1);
  }
  const hostname = new URL(url).hostname.replace(/[^a-z0-9]+/gi, '-');
  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outBase = process.argv[3] ?? path.join(outDir, `diagnose-${hostname}`);

  console.log(`Loading ${url} with stealth puppeteer...`);
  const browser = await launchStealth();
  const page = await browser.newPage();
  await gotoAndHydrate(page, url, { graceMs: 4000 });

  const html = await page.content();
  fs.writeFileSync(`${outBase}.html`, html);
  console.log(`  wrote ${outBase}.html (${html.length} chars)`);

  // Selector candidate counts — quick way to find which patterns match.
  const counts = await page.evaluate(() => {
    const candidates = [
      'a[href]',
      'a[href*="/products/"]',
      'a[href*="/product/"]',
      'a[href*="/fragrance/"]',
      'a[href*="/p/"]',
      'a[class*="product"]',
      'a[class*="card"]',
      'a[class*="tile"]',
      'a[data-product]',
      'a[data-product-id]',
      'div[class*="product-card"]',
      'div[class*="product-tile"]',
      'div[class*="ProductCard"]',
      'div[class*="ProductTile"]',
      'article[class*="product"]',
      'li[class*="product"]',
      'h1', 'h2', 'h3',
      'img[class*="product"]',
      'img[class*="hero"]',
      'picture img',
      '[class*="price"]',
      '[data-price]',
    ];
    const out: Record<string, number> = {};
    for (const sel of candidates) {
      try {
        out[sel] = document.querySelectorAll(sel).length;
      } catch {
        out[sel] = -1;
      }
    }
    // Also: sample the first 5 anchors with an href containing a likely
    // product URL pattern, so we can eyeball link shapes.
    const sampleHrefs: string[] = [];
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (/\/(product|fragrance|p)\/|-\d+\.html/i.test(href) && sampleHrefs.length < 12) {
        sampleHrefs.push(href);
      }
    });
    return { counts: out, sampleHrefs, title: document.title };
  });

  const report = [
    `URL: ${url}`,
    `Title: ${counts.title}`,
    ``,
    `=== Selector counts ===`,
    ...Object.entries(counts.counts).map(([k, v]) => `  ${k.padEnd(40)} ${v}`),
    ``,
    `=== Sample product-ish hrefs ===`,
    ...counts.sampleHrefs.map((h) => `  ${h}`),
  ].join('\n');

  fs.writeFileSync(`${outBase}.report.txt`, report);
  console.log(`  wrote ${outBase}.report.txt`);
  console.log('\n' + report.split('\n').slice(0, 30).join('\n'));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
