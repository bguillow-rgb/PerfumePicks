/**
 * Fragrantica scraper — primary catalog source.
 *
 * Why Fragrantica vs brand-direct sites:
 *   - One DOM (Vue-rendered, structured) to learn vs. one per brand.
 *   - Notes pyramid + main accords + community longevity/sillage/projection
 *     all in structured markup.
 *   - Covers every brand we care about (no per-brand bot games).
 *
 * Pipeline:
 *   1. For each designer slug, fetch /designers/{slug}.html → list PDP URLs.
 *   2. For each PDP, extract: name, brand, year, family, top/heart/base
 *      notes, top accords (with intensity), longevity, sillage, projection,
 *      gender, image_url.
 *   3. Output one CandidateFragrance[] file per brand.
 *
 * Hazards:
 *   - Fragrantica responds slowly under load; 2.5s polite delay.
 *   - Some PDPs return cached "wrong" titles via Cloudflare; we double-check
 *     by reading the rendered <h1> + canonical URL.
 *   - Voting bars for accords use width:%% inline styles — parse those.
 */

import * as fs from 'fs';
import * as path from 'path';
import { launchStealth, gotoAndHydrate, withFreshPage } from './lib/stealthBrowser';
import { CandidateFragrance, Concentration } from './types';

const POLITE_DELAY_MS = 5000;
const DATA_DIR = path.join(__dirname, 'data');

// Designer slug map — Fragrantica's URL slug for each brand we care about.
// Add more here to expand; safe order is most-important first.
const BRANDS: { brand: string; slug: string }[] = [
  { brand: 'Maison Francis Kurkdjian', slug: 'Maison-Francis-Kurkdjian' },
  { brand: 'Tom Ford',                 slug: 'Tom-Ford' },
  { brand: 'Creed',                    slug: 'Creed' },
  { brand: 'Le Labo',                  slug: 'Le-Labo' },
  { brand: 'Byredo',                   slug: 'Byredo' },   // brand-direct only; Fragrantica index returns 0
  { brand: 'Jo Malone London',         slug: 'Jo-Malone-London' },
  { brand: 'Diptyque',                 slug: 'Diptyque' },
  { brand: 'Serge Lutens',             slug: 'Serge-Lutens' },
  { brand: 'Frederic Malle',           slug: 'Frederic-Malle' },
  { brand: 'Goutal',                   slug: 'Goutal' },
  { brand: 'Atelier Cologne',          slug: 'Atelier-Cologne' },
  { brand: 'Juliette Has a Gun',       slug: 'Juliette-Has-a-Gun' },
  { brand: 'Amouage',                  slug: 'Amouage' },
  { brand: 'Kilian',                   slug: 'By-Kilian' },
  { brand: 'Chanel',                   slug: 'Chanel' },
  { brand: 'Dior',                     slug: 'Christian-Dior' },
  { brand: 'Yves Saint Laurent',       slug: 'Yves-Saint-Laurent' },
  { brand: 'Guerlain',                 slug: 'Guerlain' },
  { brand: 'Hermès',                   slug: 'Hermes' },
  { brand: 'Maison Margiela',          slug: 'Maison-Martin-Margiela' },
  { brand: 'Lancôme',                  slug: 'Lancome' },
  { brand: 'Parfums de Marly',         slug: 'Parfums-de-Marly' },
  { brand: 'Viktor & Rolf',            slug: 'Viktor-Rolf' },
  { brand: 'Prada',                    slug: 'Prada' },
  { brand: 'Valentino',                slug: 'Valentino' },
  { brand: 'Dolce & Gabbana',          slug: 'Dolce-Gabbana' },
  // Session 3 — mass prestige volume brands
  { brand: 'Giorgio Armani',           slug: 'Giorgio-Armani' },
  { brand: 'Givenchy',                 slug: 'Givenchy' },
  { brand: 'Mugler',                   slug: 'Mugler' },
  { brand: 'Carolina Herrera',         slug: 'Carolina-Herrera' },
  { brand: 'Narciso Rodriguez',        slug: 'Narciso-Rodriguez' },
  { brand: 'Bvlgari',                  slug: 'Bvlgari' },
  { brand: 'Cartier',                  slug: 'Cartier' },
  { brand: 'Issey Miyake',             slug: 'Issey-Miyake' },
  { brand: 'Jean Paul Gaultier',       slug: 'Jean-Paul-Gaultier' },
  { brand: 'Marc Jacobs',              slug: 'Marc-Jacobs' },
  { brand: 'Nina Ricci',               slug: 'Nina-Ricci' },
  { brand: 'Chloe',                    slug: 'Chloe' },
  { brand: 'Burberry',                 slug: 'Burberry' },
  { brand: 'Jimmy Choo',               slug: 'Jimmy-Choo' },
  { brand: 'Coach',                    slug: 'Coach' },
  // Session 4 — niche & deeper existing brands
  { brand: 'Xerjoff',                  slug: 'Xerjoff' },
  { brand: 'Roja Dove',                slug: 'Roja-Dove' },
  { brand: 'Clive Christian',          slug: 'Clive-Christian' },
  { brand: 'Acqua di Parma',           slug: 'Acqua-di-Parma' },
  { brand: 'Memo Paris',               slug: 'Memo-Paris' },
  { brand: 'Initio Parfums Prives',    slug: 'Initio-Parfums-Prives' },
  { brand: 'Tiffany',                  slug: 'Tiffany-Co' },
  { brand: 'Van Cleef and Arpels',     slug: 'Van-Cleef-Arpels' },
  { brand: 'Sisley',                   slug: 'Sisley' },
  { brand: 'Lalique',                  slug: 'Lalique' },
];

interface PdpExtract {
  name: string;
  release_year: number | null;
  fragrance_family: string | null;
  gender: 'feminine' | 'masculine' | 'unisex' | null;
  concentration: Concentration | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  top_accords: string[];
  accord_intensity: Record<string, number>;
  community_longevity: number | null;     // 0..5
  community_sillage: number | null;
  community_projection: number | null;
  image_url: string | null;
}

async function listBrandPdpUrls(page: any, slug: string): Promise<string[]> {
  const url = `https://www.fragrantica.com/designers/${slug}.html`;
  console.log(`  brand index: ${url}`);
  await gotoAndHydrate(page, url, { graceMs: 3500 });
  const html = await page.content();
  // Match relative or absolute Fragrantica PDP URLs for this brand only.
  const re = new RegExp(`/perfume/${slug}/[^"]+\\.html`, 'gi');
  const matches = html.match(re) || [];
  return Array.from(new Set(matches.map((u: string) => `https://www.fragrantica.com${u.replace(/^https?:\/\/www\.fragrantica\.com/, '')}`)));
}

async function extractPdp(page: any, url: string, brandName?: string): Promise<PdpExtract | null> {
  await gotoAndHydrate(page, url, { graceMs: 3000, hydrationSelector: 'h1' });
  // IMPORTANT: passing the function as a string instead of as a callable
  // sidesteps the esbuild/tsx wrapper that injects `__name` (an esbuild
  // debug helper) into the bundled function — that wrapper gets evaluated
  // in the browser context where __name doesn't exist.
  const code = `(() => {
    const _injectedBrand = ${JSON.stringify(brandName ?? '')};
    const clean = (s) => (s ?? '').replace(/\\s+/g, ' ').trim();
    const h1 = clean(document.querySelector('h1') && document.querySelector('h1').textContent);
    if (!h1) return null;
    // Reject rate-limit / Cloudflare challenge pages
    const h1L = h1.toLowerCase();
    if (h1L.includes('429') || h1L.includes('too many requests') || h1L.includes('access denied') ||
        h1L.includes('just a moment') || h1L.includes('checking your browser') ||
        h1L.includes('cloudflare') || h1L.includes('attention required')) return null;
    let name = h1.replace(/\\s+for\\s+(women|men|women and men).*$/i, '').trim();
    // Strip the brand name (which Fragrantica appends to every h1).
    // Try two sources: the canonical URL slug, and the actual brand name passed in.
    const canon = (document.querySelector('link[rel="canonical"]') || {}).href || location.href;
    const brandFromUrl = decodeURIComponent((canon.match(/\\/perfume\\/([^/]+)\\//) || [])[1] || '').replace(/-/g, ' ');
    const brandNames = [brandFromUrl, _injectedBrand].filter(Boolean);
    for (const b of brandNames) {
      // Strip trailing brand occurrence (may appear with or without spaces/special chars)
      const escaped = b.replace(/[.*+?^\${}()|[\\\\]\\\\\\\\]/g, '\\\\$&');
      name = name.replace(new RegExp('\\\\s*' + escaped + '\\\\s*$', 'i'), '').trim();
      // Also strip runs of the brand where &/and/spaces are collapsed
      const bCompact = b.replace(/[^a-zA-Z0-9]/g, '');
      const nCompact = name.replace(/[^a-zA-Z0-9]/g, '');
      // If name ends with brand text compactly, trim trailing brand word-by-word
      const bWords = b.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\\s+/);
      for (let i = bWords.length; i > 0; i--) {
        const suffix = bWords.slice(0, i).join('[^a-zA-Z0-9]*');
        name = name.replace(new RegExp('\\\\s*' + suffix + '\\\\s*$', 'i'), '').trim();
      }
    }
    const bodyText = clean(document.body.textContent);
    const yMatch1 = bodyText.match(/Launched in (\\d{4})/i);
    const yMatch2 = bodyText.match(/\\b(19|20)\\d{2}\\b/);
    const release_year = yMatch1 ? Number(yMatch1[1]) : (yMatch2 ? Number(yMatch2[0]) : null);

    const notesAfterLabel = (label) => {
      const headers = Array.from(document.querySelectorAll('h4, span'))
        .filter((el) => clean(el.textContent).toLowerCase() === label.toLowerCase());
      const out = [];
      for (const h of headers) {
        let container = h.parentElement;
        for (let i = 0; i < 4 && container; i++) {
          const links = container.querySelectorAll('a[href*="/notes/"]');
          if (links.length > 0) {
            links.forEach((a) => {
              const t = clean(a.textContent);
              if (t && t.length > 1 && t.length < 40) out.push(t);
            });
            break;
          }
          container = container.parentElement;
        }
      }
      return Array.from(new Set(out));
    };
    const top = notesAfterLabel('Top Notes');
    const heart = notesAfterLabel('Middle Notes');
    const base = notesAfterLabel('Base Notes');

    const accord_intensity = {};
    // Stop-words for known non-accord text that happens to live in
    // width-styled bars (sponsorships, ad disclosures, etc.).
    const accordStopWords = new Set(['sponsored','advertisement','ad','sponsor','promo','review','product','add to wishlist']);
    document.querySelectorAll('div[style*="width"]').forEach((el) => {
      const style = el.getAttribute('style') || '';
      const m = style.match(/width:\\s*([\\d.]+)%/);
      if (!m) return;
      const pct = Number(m[1]);
      if (!Number.isFinite(pct) || pct <= 0) return;
      const label = clean(el.textContent || (el.parentElement && el.parentElement.textContent));
      if (!label || label.length > 30) return;
      const k = label.toLowerCase();
      if (accordStopWords.has(k)) return;
      // Only accept simple lower-case-ish accord labels (one or two words).
      if (!/^[a-z][a-z\\- ]{2,29}$/.test(k)) return;
      accord_intensity[k] = Math.max(1, Math.min(5, Math.round(pct / 20)));
    });
    const top_accords = Object.entries(accord_intensity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map((kv) => kv[0]);

    const lower = h1.toLowerCase();
    let gender = null;
    if (lower.includes('women and men')) gender = 'unisex';
    else if (lower.includes('for women')) gender = 'feminine';
    else if (lower.includes('for men')) gender = 'masculine';

    const heroImg = document.querySelector('img[itemprop="image"], img[alt*="perfume"]');
    const image_url = heroImg ? heroImg.src : null;

    return {
      name,
      release_year,
      fragrance_family: null,
      gender,
      concentration: null,
      top_notes: top,
      heart_notes: heart,
      base_notes: base,
      top_accords,
      accord_intensity,
      community_longevity: null,
      community_sillage: null,
      community_projection: null,
      image_url,
    };
  })()`;
  return page.evaluate(code);
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Optional: filter to specific brands via CLI args.
  const args = process.argv.slice(2);
  const wanted = args.length > 0
    ? BRANDS.filter((b) => args.some((a) => b.brand.toLowerCase().includes(a.toLowerCase()) || b.slug.toLowerCase() === a.toLowerCase()))
    : BRANDS;

  console.log(`Scraping ${wanted.length} brands from Fragrantica...`);

  for (const { brand, slug } of wanted) {
    console.log(`\n=== ${brand} ===`);
    const outPath = path.join(DATA_DIR, `frag-${slug.toLowerCase()}-raw.json`);
    let urls: string[] = [];
    // Launch a fresh browser per brand — Fragrantica tracks the browser session
    // and blocks subsequent index-page fetches from the same browser instance.
    const browser = await launchStealth();
    try {
      urls = await withFreshPage(browser, (page) => listBrandPdpUrls(page, slug));
      if (urls.length === 0) {
        console.log(`  0 PDPs on first attempt — waiting 15s and retrying index...`);
        await new Promise((r) => setTimeout(r, 15_000));
        urls = await withFreshPage(browser, (page) => listBrandPdpUrls(page, slug));
      }
    } catch (e) {
      console.warn(`  index failed: ${(e as Error).message}`);
      await browser.close().catch(() => {});
      continue;
    }
    console.log(`  ${urls.length} PDP urls discovered`);

    // Optional limit via PERFUMEPICKS_LIMIT env var — useful for fast smoke
    // tests on a small subset before committing 5+ min per brand.
    const limit = process.env.PERFUMEPICKS_LIMIT ? Number(process.env.PERFUMEPICKS_LIMIT) : urls.length;
    if (limit < urls.length) {
      console.log(`  (limiting to first ${limit} for this run)`);
      urls = urls.slice(0, limit);
    }

    const out: CandidateFragrance[] = [];
    // Recycle the page every PAGE_RECYCLE_EVERY navs — long-lived pages
    // eventually trip "Session closed", but opening a fresh page per nav
    // sometimes races into "Connection closed" on the previous page's
    // teardown. Recycling every ~10 navs is a stable middle ground.
    const PAGE_RECYCLE_EVERY = 10;
    let page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15');
    await page.setViewport({ width: 1366, height: 900 });

    for (const [i, url] of urls.entries()) {
      // Recycle the page every N navs.
      if (i > 0 && i % PAGE_RECYCLE_EVERY === 0) {
        try { await page.close(); } catch {}
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15');
        await page.setViewport({ width: 1366, height: 900 });
      }
      process.stdout.write(`  [${i + 1}/${urls.length}] ${url.split('/').pop()?.slice(0, 50)}... `);
      try {
        const pdp = await extractPdp(page, url, brand);
        if (!pdp) { process.stdout.write('skip\n'); }
        else {
          out.push({
            brand,
            name: pdp.name,
            release_year: pdp.release_year,
            concentration: pdp.concentration ?? 'edp',
            fragrance_family: pdp.fragrance_family,
            gender: pdp.gender,
            top_notes: pdp.top_notes,
            heart_notes: pdp.heart_notes,
            base_notes: pdp.base_notes,
            top_accords: pdp.top_accords,
            accord_intensity: pdp.accord_intensity,
            community_longevity: pdp.community_longevity,
            community_sillage: pdp.community_sillage,
            community_projection: pdp.community_projection,
            compliment_score: null,
            versatility_score: null,
            office_safe_score: null,
            price_tier: null,
            retail_msrp_usd_cents: null,
            prices: [],
            image_url: pdp.image_url,
            source: 'fragrantica',
            source_url: url,
            sources: ['fragrantica'],
          });
          process.stdout.write(`ok (${pdp.top_notes.length}/${pdp.heart_notes.length}/${pdp.base_notes.length} notes, ${pdp.top_accords.length} accords)\n`);
        }
      } catch (e) {
        process.stdout.write(`err: ${(e as Error).message.slice(0, 60)}\n`);
      }
      await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
      if ((i + 1) % 10 === 0) fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    }
    try { await page.close(); } catch {}
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`  wrote ${out.length} fragrances → ${path.relative(process.cwd(), outPath)}`);
    await browser.close().catch(() => {});

    // Cool-down between brands.
    console.log(`  cooling down 20s before next brand...`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
