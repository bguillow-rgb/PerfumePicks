/**
 * Scrape the Tom Ford Beauty fragrance category.
 *
 * Source: https://www.tomfordbeauty.com/fragrance
 *
 * What we extract from the brand site:
 *   - brand (constant: "Tom Ford")
 *   - name
 *   - concentration (parsed from product subtitle / size variants)
 *   - top/heart/base notes (only when listed in the PDP "Notes" tab)
 *   - retail_msrp_usd_cents (50ml as the "headline" price)
 *   - prices[] (all advertised sizes — 30ml/50ml/100ml/250ml decant where present)
 *   - image_url (PDP hero shot)
 *   - source_url
 *
 * What we DO NOT extract (Fragrantica enrichment pass adds these later):
 *   - top_accords + accord_intensity
 *   - community_longevity / sillage / projection
 *   - similar_fragrance_ids (computed offline)
 *
 * Output: scripts/data/tomford-raw.json (CandidateFragrance[])
 *
 * Notes / hazards:
 *   - Tom Ford's site is JS-rendered, requires Puppeteer.
 *   - Their category page lazy-loads — we scroll to the bottom before scraping.
 *   - PDP DOM changes a few times a year. When this breaks, the most likely
 *     culprit is the selectors in `scrapeProductPage()` — fix those and the
 *     rest of the pipeline keeps working.
 *   - Use a polite delay between PDPs (1.2s default) to stay under the radar.
 *     Bob: do NOT remove this delay. Manufacturer sites will throttle/block
 *     and we'd lose access for the entire tranche.
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Page } from 'puppeteer';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'tomford-raw.json');

const CATEGORY_URL = 'https://www.tomfordbeauty.com/fragrance';
const POLITE_DELAY_MS = 1200;

function parseConcentration(text: string | null): Concentration | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('parfum') && !t.includes('eau de parfum')) return 'parfum';
  if (t.includes('eau de parfum') || t.includes('edp')) return 'edp';
  if (t.includes('eau de toilette') || t.includes('edt')) return 'edt';
  if (t.includes('cologne')) return 'cologne';
  if (t.includes('extrait')) return 'extrait';
  if (t.includes('oil')) return 'oil';
  return null;
}

function parsePriceCents(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

function parseSizeMl(text: string | null): number | null {
  if (!text) return null;
  const m = text.toLowerCase().replace(/[, ]/g, '').match(/(\d+(?:\.\d+)?)\s*ml/);
  return m ? parseFloat(m[1]) : null;
}

interface ProductLink { name: string; url: string; }

async function listProducts(page: Page): Promise<ProductLink[]> {
  console.log(`  GET ${CATEGORY_URL}`);
  await page.goto(CATEGORY_URL, { waitUntil: 'networkidle2', timeout: 30_000 });

  // Lazy-load: scroll to bottom in steps until height stops growing.
  await autoScroll(page);

  return page.evaluate(() => {
    const out: { name: string; url: string }[] = [];
    document.querySelectorAll('a[href*="/fragrance/"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      // Filter to product PDPs only (not category links)
      if (!/\/fragrance\/[a-z0-9-]+\/?$/i.test(new URL(href).pathname)) return;
      const name = a.textContent?.trim().replace(/\s+/g, ' ') ?? '';
      if (name && name.length > 2 && !out.some((o) => o.url === href)) {
        out.push({ name, url: href });
      }
    });
    return out;
  });
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 600;
      const interval = setInterval(() => {
        const before = document.body.scrollHeight;
        window.scrollBy(0, step);
        total += step;
        if (total > before) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
      // Failsafe
      setTimeout(() => { clearInterval(interval); resolve(); }, 8000);
    });
  });
}

async function scrapeProductPage(page: Page, link: ProductLink): Promise<CandidateFragrance | null> {
  try {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
  } catch {
    console.warn(`  skip ${link.name}: timeout`);
    return null;
  }

  const data = await page.evaluate(() => {
    const text = (sel: string) =>
      (document.querySelector(sel)?.textContent ?? '').trim().replace(/\s+/g, ' ');

    // Hero name
    const nameEl = document.querySelector('h1, [class*="product-name"], [class*="ProductName"]');
    const name = nameEl?.textContent?.trim().replace(/\s+/g, ' ') ?? '';

    // Subtitle / concentration line
    const subtitle = text('[class*="product-subtitle"], [class*="product-eyebrow"], [class*="ProductSubtitle"]');

    // Notes — TF lists in an accordion under "Notes", "Top Notes", etc.
    function notesUnder(label: string): string[] {
      const headings = Array.from(document.querySelectorAll('*')).filter(
        (el) => el.textContent?.trim().toLowerCase() === label.toLowerCase(),
      );
      const out: string[] = [];
      for (const h of headings) {
        const parent = h.parentElement;
        if (!parent) continue;
        const next = parent.nextElementSibling || parent.querySelector('p, ul, ol, div');
        const t = next?.textContent ?? '';
        for (const part of t.split(/[,;•\n]/)) {
          const trimmed = part.trim();
          if (trimmed.length > 1 && trimmed.length < 40) out.push(trimmed);
        }
      }
      return Array.from(new Set(out));
    }

    const sizeNodes = Array.from(document.querySelectorAll('[class*="size"], [data-size], [class*="Size"]'));
    const variants: { size: string; price: string }[] = [];
    for (const s of sizeNodes) {
      const size = s.getAttribute('data-size') || s.textContent?.trim() || '';
      const priceParent = s.closest('[class*="variant"], li, button') || s.parentElement;
      const price = priceParent?.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim() ?? '';
      if (size && price) variants.push({ size, price });
    }

    const img = document.querySelector('img[class*="product"], img[class*="Hero"], picture img') as HTMLImageElement | null;
    const image = img?.src ?? null;

    return {
      name,
      subtitle,
      top: notesUnder('Top Notes'),
      heart: notesUnder('Heart Notes'),
      base: notesUnder('Base Notes'),
      variants,
      image,
    };
  });

  if (!data.name) return null;

  const prices = data.variants
    .map((v) => ({
      retailer: 'tomford-direct',
      size_ml: parseSizeMl(v.size) ?? 0,
      price_usd_cents: parsePriceCents(v.price) ?? 0,
      is_decant: false,
      url: link.url,
    }))
    .filter((p) => p.size_ml > 0 && p.price_usd_cents > 0);

  // Headline MSRP = 50ml if available, else first listed size.
  const headline = prices.find((p) => p.size_ml === 50) ?? prices[0];

  return {
    brand: 'Tom Ford',
    name: data.name,
    release_year: null,
    concentration: parseConcentration(data.subtitle) ?? 'edp',
    fragrance_family: null,
    gender: null,
    top_notes: data.top,
    heart_notes: data.heart,
    base_notes: data.base,
    top_accords: [],
    accord_intensity: {},
    community_longevity: null,
    community_sillage: null,
    community_projection: null,
    compliment_score: null,
    versatility_score: null,
    office_safe_score: null,
    price_tier: null,                    // LLM enrichment fills from MSRP
    retail_msrp_usd_cents: headline?.price_usd_cents ?? null,
    prices,
    image_url: data.image,
    source: 'tomford',
    source_url: link.url,
    sources: ['tomford'],
  };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PerfumePicksBot/1.0');

  console.log('Listing Tom Ford products...');
  const links = await listProducts(page);
  console.log(`Found ${links.length} product links`);

  const out: CandidateFragrance[] = [];
  for (const [i, link] of links.entries()) {
    process.stdout.write(`  [${i + 1}/${links.length}] ${link.name.slice(0, 60)}... `);
    const row = await scrapeProductPage(page, link);
    if (row) {
      out.push(row);
      process.stdout.write(`ok (${row.top_notes.length}/${row.heart_notes.length}/${row.base_notes.length} notes, ${row.prices.length} sizes)\n`);
    } else {
      process.stdout.write(`skip\n`);
    }
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    // Flush every 10 — crash safety
    if ((i + 1) % 10 === 0) fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances to ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
