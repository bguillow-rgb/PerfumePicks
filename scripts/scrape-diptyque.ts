/**
 * Scrape Diptyque fragrances.
 * Source: https://www.diptyqueparis.com/en_us/c/fragrances-all.html
 *
 * Site uses Nuxt SSR — product data is in window.__NUXT__ JSON.
 * PDPs: /en_us/p/{slug}.html
 * Notes: "ingredients" field (flat list, not top/heart/base split).
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'frag-diptyque-raw.json');
const BASE = 'https://www.diptyqueparis.com';
const CATEGORY = `${BASE}/en_us/c/fragrances-all.html`;
const POLITE_DELAY_MS = 2000;

function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/[,\s]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('window.__name = function(fn) { return fn; }');
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  // Get all PDP links from category page
  console.log('Loading Diptyque category...');
  await page.goto(CATEGORY, { waitUntil: 'networkidle2', timeout: 40_000 });
  await new Promise(r => setTimeout(r, 3000));

  // Try extracting from window.__NUXT__ first, fall back to link scraping
  const pdpUrls: string[] = await page.evaluate(() => {
    const nuxt = (window as any).__NUXT__;
    const urls: string[] = [];
    if (nuxt) {
      // Try to find product URLs in NUXT state
      const str = JSON.stringify(nuxt);
      const matches = str.match(/\/en_us\/p\/[^"]+\.html/g) || [];
      matches.forEach((u: string) => { if (!urls.includes(u)) urls.push(u); });
    }
    // Also collect from DOM links
    document.querySelectorAll('a[href*="/en_us/p/"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!urls.includes(href)) urls.push(href);
    });
    return urls;
  });

  // Normalize to full URLs — only keep actual fragrance PDPs
  const FRAG_KEYWORDS = ['eau-de-parfum', 'eau-de-toilette', 'parfum', 'cologne', 'eau-rose', 'fleur', 'essence', 'extrait', 'elixir', 'scent'];
  const EXCLUDE_KEYWORDS = ['candle', 'set-of', 'body-lotion', 'soap', 'shower', 'gift-set', 'diffuser', 'refill', 'pre-composed'];
  const links = Array.from(new Set(
    pdpUrls.map(u => u.startsWith('http') ? u : `${BASE}${u}`)
  )).filter(u => {
    if (!u.includes('/en_us/p/') || !u.endsWith('.html')) return false;
    const slug = u.split('/').pop() ?? '';
    if (EXCLUDE_KEYWORDS.some(kw => slug.includes(kw))) return false;
    return FRAG_KEYWORDS.some(kw => slug.includes(kw)) || slug.length < 60;
  });

  console.log(`Found ${links.length} Diptyque PDP links`);

  const out: CandidateFragrance[] = [];

  for (const [i, url] of links.entries()) {
    process.stdout.write(`  [${i + 1}/${links.length}] ${url.split('/').pop()?.slice(0, 55)}... `);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise(r => setTimeout(r, 2000));

      const data = await page.evaluate(() => {
        const nuxt = (window as any).__NUXT__;
        let name = '';
        let ingredients: string[] = [];
        let price: number | null = null;
        let sizeMl: number | null = null;
        let img: string | null = null;

        if (nuxt) {
          // Walk the NUXT state to find product data
          const str = JSON.stringify(nuxt);

          // Extract name from h1 as fallback
          name = (document.querySelector('h1') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? '';

          // Try to find product object in NUXT state
          const findInObj = (obj: any, depth = 0): any => {
            if (depth > 8 || !obj || typeof obj !== 'object') return null;
            if (obj.name && obj.sku && (obj.ingredients || obj.description)) return obj;
            for (const v of Object.values(obj)) {
              const found = findInObj(v, depth + 1);
              if (found) return found;
            }
            return null;
          };

          try {
            const product = findInObj(nuxt);
            if (product) {
              name = product.name || name;
              const rawIngredients = product.ingredients || product.pdp_short_description || '';
              if (typeof rawIngredients === 'string') {
                ingredients = rawIngredients.split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 40);
              }
              price = product.price ? Math.round(product.price * 100) : null;
            }
          } catch {}
        }

        // Fallback: get name from h1
        if (!name) {
          name = (document.querySelector('h1') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
        }

        // Fallback: get notes from body text
        if (!ingredients.length) {
          const body = document.body.innerText;
          const m = body.match(/(?:notes?|ingredients?)[:\s]+([^\n\.]{10,200})/i);
          if (m) ingredients = m[1].split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 40);
        }

        // Get price from page
        if (!price) {
          const priceEl = document.querySelector('[class*="price"], [itemprop="price"]');
          const pt = priceEl?.textContent?.replace(/[,\s]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
          if (pt) price = Math.round(parseFloat(pt[1]) * 100);
        }

        // Get size
        const sizeEl = document.querySelector('[class*="size"], [class*="volume"]');
        const sizeText = sizeEl?.textContent ?? '';
        const sizeMlMatch = sizeText.match(/(\d+)\s*ml/i);
        sizeMl = sizeMlMatch ? parseInt(sizeMlMatch[1]) : null;

        // Image
        img = (document.querySelector('[class*="product"] img, picture img') as HTMLImageElement | null)?.src ?? null;

        // Concentration from name
        const nameLower = name.toLowerCase();
        const concentration = nameLower.includes('eau de parfum') ? 'edp'
          : nameLower.includes('eau de toilette') ? 'edt'
          : nameLower.includes('parfum') ? 'parfum'
          : nameLower.includes('cologne') ? 'cologne' : null;

        return { name, ingredients, price, sizeMl, img, concentration };
      });

      if (!data.name) { process.stdout.write('skip\n'); continue; }

      const prices = data.sizeMl && data.price ? [{
        retailer: 'diptyque-direct',
        size_ml: data.sizeMl,
        price_usd_cents: data.price,
        is_decant: false,
        url,
      }] : [];

      out.push({
        brand: 'Diptyque',
        name: data.name,
        release_year: null,
        concentration: (data.concentration as Concentration) ?? 'edp',
        fragrance_family: null,
        gender: 'unisex',
        top_notes: data.ingredients,
        heart_notes: [],
        base_notes: [],
        top_accords: [], accord_intensity: {},
        community_longevity: null, community_sillage: null, community_projection: null,
        compliment_score: null, versatility_score: null, office_safe_score: null,
        price_tier: null,
        retail_msrp_usd_cents: data.price,
        prices,
        image_url: data.img,
        source: 'diptyque',
        source_url: url,
        sources: ['diptyque'],
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
