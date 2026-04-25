/**
 * Halfwheel cigar-review scraper (v2 — uses /reviewlist/ master index).
 *
 * Halfwheel publishes a canonical master list at /reviewlist/ containing
 * every cigar review they've ever written as a single HTML <table>. Each row
 * has Name, Country, Factory, Reviewer, Date, Score, and the row's first
 * anchor links to the individual review page.
 *
 * Each review page renders the spec block as plain text paragraphs with
 * labels like "Cigar Reviewed:", "Country of Origin:", "Factory:", "Wrapper:",
 * "Binder:", "Filler:", "Size:", "Ring Gauge:", "Vitola:", "MSRP:".
 * There's no structured HTML; we match `Label: Value` line-by-line from the
 * article's innerText.
 *
 * Pipeline:
 *   1. Load /reviewlist/, extract the row-anchor hrefs and the Name/Country/
 *      Factory cells from each row. We keep the cell data because the review
 *      page's text-only spec block can be noisy.
 *   2. Visit each review URL, parse the innerText spec block, capture the
 *      first content image.
 *   3. Write rows to scripts/data/halfwheel-raw.json as we go (flush every
 *      10 rows so a crash mid-run doesn't lose progress).
 *
 * Politeness: 1.2s delay between page loads. Master index is ~3 MB with no
 * pagination; we load it exactly once.
 *
 * Legal posture:
 *   - Specs (wrapper/binder/factory/country) are factual and not protected
 *     by copyright — same posture Cigar Geeks and Cigar Scanner rely on.
 *   - Source URL is retained on every row so attribution is intact.
 *   - Brands can request takedown via the in-app flow — migration 010 flips
 *     cigars.image_status='takedown' and the app falls back to the
 *     placeholder + community-replacement affordance.
 *
 * Usage:
 *   npx tsx scripts/scrape-halfwheel.ts                    # full run, all rows
 *   npx tsx scripts/scrape-halfwheel.ts --limit 50         # smoke test 50 posts
 *   npx tsx scripts/scrape-halfwheel.ts --resume           # skip URLs in halfwheel-raw.json
 */

import puppeteer, { Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const INDEX_URL = 'https://halfwheel.com/reviewlist/';
const OUTPUT_PATH = path.join(__dirname, 'data', 'halfwheel-raw.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const POLITE_DELAY_MS = 1200;

interface IndexRow {
  url: string;
  name: string;
  country: string | null;
  factory: string | null;
  score: number | null;
}

interface HalfwheelRow {
  source: 'halfwheel';
  source_url: string;
  title: string;
  brand: string | null;
  line: string | null;
  vitola: string | null;
  size: string | null;
  ring_gauge: string | null;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  factory: string | null;
  country: string | null;
  price_usd: number | null;
  release_date: string | null;
  score: number | null;
  image_url: string | null;
  raw_specs: Record<string, string>;
  scraped_at: string;
}

/** Pull every row of the master /reviewlist/ table. */
async function harvestIndex(page: Page): Promise<IndexRow[]> {
  console.log(`loading index ${INDEX_URL}`);
  await page.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  // The review table is populated by DataTables after page load. Wait until
  // the tbody has at least 50 rows, or 10 s, whichever comes first.
  try {
    await page.waitForFunction(
      () => (document.querySelector('#tablepress-2')?.querySelectorAll('tr').length ?? 0) > 50,
      { timeout: 15000 },
    );
  } catch {
    console.warn('  #tablepress-2 rows never exceeded 50 — proceeding anyway');
  }
  await sleep(1200);

  const rows = await page.evaluate(() => {
    const out: { url: string; name: string; country: string | null; factory: string | null; score: number | null }[] = [];
    // Halfwheel uses TablePress/DataTables. The master review table is
    // specifically `#tablepress-2`; `document.querySelector('table')` would
    // return a Google Custom Search widget (which is also a <table>).
    const table = document.querySelector<HTMLTableElement>('#tablepress-2')
      ?? document.querySelector<HTMLTableElement>('table.tablepress')
      ?? Array.from(document.querySelectorAll<HTMLTableElement>('table'))
          .sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
    if (!table) return out;
    const trs = Array.from(table.querySelectorAll('tr'));
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('td')).map((c) => c.textContent?.trim() ?? '');
      if (cells.length < 4) continue;
      const anchor = tr.querySelector('a');
      const href = anchor?.getAttribute('href') ?? '';
      if (!href || !href.includes('halfwheel.com')) continue;
      const [name, country, factory, , , score] = cells;
      out.push({
        url: href.split('#')[0].split('?')[0],
        name: name || '',
        country: country || null,
        factory: factory || null,
        score: score && /^\d+$/.test(score) ? parseInt(score, 10) : null,
      });
    }
    return out;
  });

  console.log(`harvested ${rows.length} index rows`);
  return rows;
}

/** Parse spec labels from a single review post. */
async function extractPost(page: Page, idx: IndexRow): Promise<HalfwheelRow | null> {
  try {
    const resp = await page.goto(idx.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!resp || resp.status() !== 200) return null;
  } catch (e: any) {
    console.warn(`  navigation failed: ${e.message?.slice(0, 60)}`);
    return null;
  }

  const data = await page.evaluate(() => {
    const article = document.querySelector<HTMLElement>(
      'article, .entry-content, .post-content, main',
    );
    if (!article) return null;

    const title = document.querySelector('h1')?.textContent?.trim() ?? '';
    const text = article.innerText ?? '';

    // Walk innerText line-by-line. Spec lines match "Label: value" where label
    // is short and known.
    const KNOWN_LABELS = new Set([
      'cigar reviewed', 'cigar', 'name',
      'country of origin', 'country', 'factory',
      'wrapper', 'binder', 'filler',
      'size', 'length', 'ring gauge',
      'vitola', 'vitola name', 'shape',
      'msrp', 'price',
      'box count', 'packaging',
      'date released', 'release date', 'released',
      'number of cigars released', 'number of cigars smoked for review',
    ]);

    const specs: Record<string, string> = {};
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colon = trimmed.indexOf(':');
      if (colon <= 0 || colon > 50) continue;
      const label = trimmed.slice(0, colon).toLowerCase().trim();
      const value = trimmed.slice(colon + 1).trim();
      if (!value) continue;
      if (KNOWN_LABELS.has(label) && !specs[label]) specs[label] = value;
    }

    // Hero image — first content image above the spec block.
    const imgs = Array.from(article.querySelectorAll<HTMLImageElement>('img'));
    let heroUrl: string | null = null;
    for (const img of imgs) {
      const src = img.src || '';
      if (!src) continue;
      if (src.includes('gravatar') || src.includes('avatar')) continue;
      if (src.includes('adfyre') || src.includes('adbutler') || src.includes('servedby')) continue;
      if (img.width && img.width < 200 && img.height && img.height < 200) continue;
      heroUrl = src.split('?')[0];
      break;
    }

    return { title, specs, heroUrl };
  });

  if (!data || !data.title) return null;

  const specs = data.specs;

  const priceStr = specs['msrp'] ?? specs['price'] ?? '';
  const priceMatch = priceStr.match(/\$?([0-9]+(?:\.[0-9]+)?)/);
  const price = priceMatch ? parseFloat(priceMatch[1]) : null;

  // Best-effort brand extraction: trust the index row's Name column. The page
  // H1 is usually the same. If the name starts with a known multi-word brand
  // we can't disambiguate here — the merge step resolves this against the
  // existing catalog.
  const cleanTitle = (data.title || idx.name).trim();
  const [brandGuess, ...rest] = cleanTitle.split(/\s+/);

  return {
    source: 'halfwheel',
    source_url: idx.url,
    title: cleanTitle,
    brand: brandGuess || null,
    line: rest.join(' ').trim() || null,
    vitola: specs['vitola'] ?? specs['vitola name'] ?? specs['shape'] ?? null,
    size: specs['size'] ?? specs['length'] ?? null,
    ring_gauge: specs['ring gauge'] ?? null,
    wrapper: specs['wrapper'] ?? null,
    binder: specs['binder'] ?? null,
    filler: (specs['filler'] ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
    factory: specs['factory'] ?? idx.factory ?? null,
    country: specs['country of origin'] ?? specs['country'] ?? idx.country ?? null,
    price_usd: price,
    release_date: specs['date released'] ?? specs['release date'] ?? specs['released'] ?? null,
    score: idx.score,
    image_url: data.heroUrl,
    raw_specs: specs,
    scraped_at: new Date().toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
  const resume = args.includes('--resume');

  const existing: HalfwheelRow[] = resume && fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'))
    : [];
  const alreadyDone = new Set(existing.map((r) => r.source_url));
  console.log(`resume=${resume} existing=${existing.length}`);

  console.log('launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 900 });

  try {
    const index = await harvestIndex(page);
    const toDo = limit > 0 ? index.slice(0, limit) : index;
    console.log(`processing ${toDo.length} of ${index.length} rows`);

    const results: HalfwheelRow[] = [...existing];
    let processed = 0;
    let failed = 0;
    for (const row of toDo) {
      processed++;
      if (alreadyDone.has(row.url)) continue;
      process.stdout.write(`[${processed}/${toDo.length}] ${row.url}\n`);
      const out = await extractPost(page, row);
      if (out) {
        results.push(out);
        if (results.length % 10 === 0) {
          fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
        }
      } else {
        failed++;
        console.warn('  failed to parse');
      }
      await sleep(POLITE_DELAY_MS);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    console.log(`\ndone. total=${results.length} failed=${failed}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
