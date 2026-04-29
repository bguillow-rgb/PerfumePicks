/**
 * Scrape Carolina Herrera fragrances.
 * Source: https://www.carolinaherrera.com/us/en/fragrances/
 *
 * Site is server-rendered with lazy-load "View more" pagination.
 * PDPs: /us/en/p-fragrance/{slug}
 * Notes: structured as "Top notes:", "Heart notes:", "Base notes:" in collapsible sections.
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'frag-carolina-herrera-raw.json');
const BASE = 'https://www.carolinaherrera.com';
const CATEGORIES = [
  `${BASE}/us/en/fragrances/for-her/?start=0&sz=100`,
  `${BASE}/us/en/fragrances/for-him/?start=0&sz=100`,
  `${BASE}/us/en/fragrances/?start=0&sz=100`,
];
const POLITE_DELAY_MS = 1500;

function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[,\s]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}
function parseSizeMl(text: string | null | undefined): number | null {
  if (!text) return null;
  const lo = text.toLowerCase().replace(/\s/g, '');
  // Handle fl oz → ml
  const oz = lo.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|oz)/);
  if (oz) return Math.round(parseFloat(oz[1]) * 29.5735);
  const ml = lo.match(/(\d+(?:\.\d+)?)\s*ml/);
  if (ml) return parseFloat(ml[1]);
  return null;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('window.__name = function(fn) { return fn; }');
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  // Collect PDP links across all category pages
  const seen = new Set<string>();
  const allLinks: { name: string; url: string }[] = [];
  for (const catUrl of CATEGORIES) {
    console.log(`Loading: ${catUrl}`);
    await page.goto(catUrl, { waitUntil: 'networkidle2', timeout: 40_000 });
    await new Promise(r => setTimeout(r, 2000));
    const batch: { name: string; url: string }[] = await page.evaluate(() => {
      const out: { name: string; url: string }[] = [];
      document.querySelectorAll('a[href*="/p-fragrance/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        const name = (a.querySelector('.product-name, h2, h3') as HTMLElement | null)?.innerText?.trim()
          ?? a.textContent?.trim() ?? '';
        if (name && name.length > 1) out.push({ name, url: href });
      });
      return out;
    });
    for (const l of batch) {
      if (!seen.has(l.url)) { seen.add(l.url); allLinks.push(l); }
    }
  }

  // Filter out gift sets, body care, non-fragrance
  const fragranceLinks = allLinks.filter(l =>
    !l.url.includes('gift-set') && !l.url.includes('giftset') &&
    !l.name.toLowerCase().includes('gift set') && !l.name.toLowerCase().includes('gift sets') &&
    !l.name.toLowerCase().includes('body lotion') && !l.name.toLowerCase().includes('body wash') &&
    !l.name.toLowerCase().includes('body cream') && !l.name.toLowerCase().includes('sunglasses')
  );
  console.log(`Found ${fragranceLinks.length} fragrance PDPs (from ${allLinks.length} total links)`);

  const out: CandidateFragrance[] = [];

  for (const [i, link] of fragranceLinks.entries()) {
    process.stdout.write(`  [${i + 1}/${fragranceLinks.length}] ${link.name.slice(0, 55)}... `);
    try {
      await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
      await new Promise(r => setTimeout(r, 1000));

      const data = await page.evaluate(() => {
        const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
        const name = clean(document.querySelector('h1, .product-name')?.textContent ?? '');

        // Parse notes from text containing "Top notes:" / "Heart notes:" / "Base notes:"
        const bodyText = document.body.innerText;
        function notesAfter(label: string): string[] {
          const re = new RegExp(label + '[:\\s]+([^\\n]+)', 'i');
          const m = bodyText.match(re);
          if (!m) return [];
          return m[1].split(/[,&]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 40);
        }

        // Also try DOM-based approach
        function domNotes(label: string): string[] {
          const els = Array.from(document.querySelectorAll('*')).filter(
            el => el.children.length === 0 && el.textContent?.toLowerCase().includes(label.toLowerCase())
          );
          for (const el of els) {
            const text = el.textContent ?? '';
            const after = text.substring(text.toLowerCase().indexOf(label.toLowerCase()) + label.length);
            const parts = after.replace(/^[:\s]+/, '').split(/[,&]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 40);
            if (parts.length > 0) return parts;
          }
          return [];
        }

        const top = notesAfter('top notes').length ? notesAfter('top notes') : domNotes('top notes');
        const heart = notesAfter('heart notes').length ? notesAfter('heart notes') : domNotes('heart notes');
        const base = notesAfter('base notes').length ? notesAfter('base notes') : domNotes('base notes');

        // Gender
        const bodyLower = bodyText.toLowerCase();
        let gender: string | null = null;
        if (bodyLower.includes('for her') || bodyLower.includes('women')) gender = 'feminine';
        else if (bodyLower.includes('for him') || bodyLower.includes('for men')) gender = 'masculine';

        // Prices/sizes
        const variants: { size: string; price: string }[] = [];
        document.querySelectorAll('[class*="size-value"], [class*="swatch"], .size-option').forEach((el) => {
          const size = el.textContent?.trim() ?? '';
          if (size && /\d/.test(size)) variants.push({ size, price: '' });
        });
        // Try structured price elements
        const priceText = document.querySelector('[class*="product-price"], [itemprop="price"]')?.textContent?.trim() ?? '';

        const img = (document.querySelector('img[class*="product-image"], picture img, .product-image img') as HTMLImageElement | null)?.src ?? null;

        return { name, top, heart, base, gender, variants, priceText, img };
      });

      if (!data.name) { process.stdout.write('skip\n'); continue; }

      const prices = data.variants
        .map(v => ({
          retailer: 'carolinaherrera-direct',
          size_ml: parseSizeMl(v.size) ?? 0,
          price_usd_cents: parsePriceCents(v.price || data.priceText) ?? 0,
          is_decant: false,
          url: link.url,
        }))
        .filter(p => p.size_ml > 0);

      out.push({
        brand: 'Carolina Herrera',
        name: data.name,
        release_year: null,
        concentration: 'edp' as Concentration,
        fragrance_family: null,
        gender: (data.gender as 'feminine' | 'masculine' | 'unisex' | null) ?? null,
        top_notes: data.top,
        heart_notes: data.heart,
        base_notes: data.base,
        top_accords: [], accord_intensity: {},
        community_longevity: null, community_sillage: null, community_projection: null,
        compliment_score: null, versatility_score: null, office_safe_score: null,
        price_tier: null,
        retail_msrp_usd_cents: parsePriceCents(data.priceText),
        prices,
        image_url: data.img,
        source: 'carolinaherrera',
        source_url: link.url,
        sources: ['carolinaherrera'],
      });
      process.stdout.write('ok\n');
    } catch (e) {
      process.stdout.write(`err: ${(e as Error).message.slice(0, 60)}\n`);
    }
    await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
    if ((i + 1) % 10 === 0) fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  }

  await browser.close();
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances → ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
