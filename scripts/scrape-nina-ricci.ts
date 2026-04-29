/**
 * Scrape Nina Ricci fragrances.
 * Source: https://www.ninaricci.com/en-ww/fragrance
 * PDPs: /en-ww/fragrance/product/{slug}
 * Notes: labeled with <strong> tags (Top Notes:, Heart Notes:, Base Notes:)
 * Uses Prismic CMS — data in page JSON or DOM.
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'frag-nina-ricci-raw.json');
const BASE = 'https://www.ninaricci.com';
const CATEGORY = `${BASE}/en-ww/fragrance`;
const POLITE_DELAY_MS = 2000;

function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/[,\s]/g, '').match(/[€$£]?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('window.__name = function(fn) { return fn; }');
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  console.log('Loading Nina Ricci category...');
  await page.goto(CATEGORY, { waitUntil: 'networkidle2', timeout: 40_000 });
  await new Promise(r => setTimeout(r, 5000));

  // Scroll down to trigger lazy-loaded product grid
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 2000));

  // Collect PDP links
  const pdpLinks: string[] = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('a[href*="/fragrance/product/"], a[href*="fragrance/product/"]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!out.includes(href)) out.push(href);
    });
    // Also from window.__PRISMIC_PREVIEWS__ or any JSON data
    const scripts = Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]'));
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent ?? '');
        const str = JSON.stringify(data);
        const matches = str.match(/\/en-ww\/fragrance\/product\/[a-z0-9-]+/g) ?? [];
        matches.forEach((m: string) => { if (!out.includes(m)) out.push(m); });
      } catch {}
    }
    // Try all scripts for Prismic data
    const allScripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const s of allScripts) {
      const text = s.textContent ?? '';
      if (text.includes('fragrance/product')) {
        const matches = text.match(/\/en-ww\/fragrance\/product\/[a-z0-9-]+/g) ?? [];
        matches.forEach((m: string) => { if (!out.includes(m)) out.push(m); });
      }
    }
    return out;
  });

  // Also try the sitemap for Nina Ricci
  let sitemapLinks: string[] = [];
  try {
    await page.goto(`${BASE}/sitemap.xml`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await new Promise(r => setTimeout(r, 2000));
    const sitemapContent = await page.content();
    const fragMatches = sitemapContent.match(/https:\/\/www\.ninaricci\.com\/en-ww\/fragrance\/product\/[a-z0-9-]+/g) ?? [];
    sitemapLinks = Array.from(new Set(fragMatches));
    console.log(`Sitemap found ${sitemapLinks.length} fragrance links`);
    // Go back to category page if sitemap had nothing
    if (!sitemapLinks.length) {
      await page.goto(CATEGORY, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch {}

  const links = Array.from(new Set([
    ...pdpLinks.map(u => u.startsWith('http') ? u : `${BASE}${u}`),
    ...sitemapLinks,
  ])).filter(u => u.includes('/fragrance/product/'));

  console.log(`Found ${links.length} Nina Ricci PDP links`);

  const out: CandidateFragrance[] = [];

  for (const [i, url] of links.entries()) {
    process.stdout.write(`  [${i + 1}/${links.length}] ${url.split('/').pop()?.slice(0, 55)}... `);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise(r => setTimeout(r, 2000));

      const data = await page.evaluate(() => {
        const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
        const name = clean(document.querySelector('h1')?.textContent ?? '');
        if (!name) return null;

        // Find notes from JSON-LD or Prismic data
        const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        let topNotes: string[] = [];
        let heartNotes: string[] = [];
        let baseNotes: string[] = [];
        let priceCents: number | null = null;

        for (const s of jsonLdScripts) {
          try {
            const d = JSON.parse(s.textContent ?? '');
            if (d.offers?.price) priceCents = Math.round(parseFloat(d.offers.price) * 100);
          } catch {}
        }

        // Extract from body text — look for "Bergamot - Pear" style notes after labels
        const bodyText = document.body.innerText;
        function notesAfterLabel(label: string): string[] {
          const re = new RegExp(`${label}[:\\s\\-–]+([^\\n]{3,100})`, 'i');
          const m = bodyText.match(re);
          if (!m) return [];
          return m[1].split(/[\-–,;]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 40);
        }

        topNotes = notesAfterLabel('top notes');
        heartNotes = notesAfterLabel('heart notes');
        baseNotes = notesAfterLabel('base notes');

        // Also try strong tags
        if (!topNotes.length) {
          const strongs = Array.from(document.querySelectorAll('strong'));
          for (const s of strongs) {
            const text = clean(s.textContent ?? '');
            const next = s.nextSibling?.textContent ?? s.parentElement?.textContent ?? '';
            if (text.toLowerCase().includes('top')) {
              topNotes = next.split(/[\-–,;]/).map((p: string) => p.trim()).filter((p: string) => p.length > 1 && p.length < 40);
            } else if (text.toLowerCase().includes('heart') || text.toLowerCase().includes('middle')) {
              heartNotes = next.split(/[\-–,;]/).map((p: string) => p.trim()).filter((p: string) => p.length > 1 && p.length < 40);
            } else if (text.toLowerCase().includes('base')) {
              baseNotes = next.split(/[\-–,;]/).map((p: string) => p.trim()).filter((p: string) => p.length > 1 && p.length < 40);
            }
          }
        }

        // Price
        if (!priceCents) {
          const priceEl = document.querySelector('[class*="price"], [data-price]');
          const pt = priceEl?.textContent?.replace(/[,\s]/g, '').match(/[€$£]?(\d+(?:\.\d{1,2})?)/);
          if (pt) priceCents = Math.round(parseFloat(pt[1]) * 100);
        }

        // Image
        const img = (document.querySelector('[class*="product"] img, .product-image img, picture img') as HTMLImageElement | null)?.src ?? null;

        // Concentration from name
        const nameLower = name.toLowerCase();
        const concentration = nameLower.includes('eau de parfum') ? 'edp'
          : nameLower.includes('eau de toilette') ? 'edt'
          : nameLower.includes('parfum') ? 'parfum'
          : nameLower.includes('cologne') ? 'cologne' : 'edp';

        return { name, topNotes, heartNotes, baseNotes, priceCents, img, concentration };
      });

      if (!data || !data.name) { process.stdout.write('skip\n'); continue; }

      const prices = data.priceCents ? [{
        retailer: 'ninaricci-direct',
        size_ml: 50,
        price_usd_cents: data.priceCents,
        is_decant: false,
        url,
      }] : [];

      out.push({
        brand: 'Nina Ricci',
        name: data.name,
        release_year: null,
        concentration: (data.concentration as Concentration) ?? 'edp',
        fragrance_family: null,
        gender: 'feminine',
        top_notes: data.topNotes,
        heart_notes: data.heartNotes,
        base_notes: data.baseNotes,
        top_accords: [], accord_intensity: {},
        community_longevity: null, community_sillage: null, community_projection: null,
        compliment_score: null, versatility_score: null, office_safe_score: null,
        price_tier: null,
        retail_msrp_usd_cents: data.priceCents,
        prices,
        image_url: data.img,
        source: 'ninaricci',
        source_url: url,
        sources: ['ninaricci'],
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
