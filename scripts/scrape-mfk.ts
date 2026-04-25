/**
 * Scrape Maison Francis Kurkdjian (MFK) fragrances.
 * Source: https://www.franciskurkdjian.com/us/en/category/fragrance.html
 *
 * MFK's site uses a Magento-style PDP. Notes appear under accordions
 * labeled "Top notes / Heart notes / Base notes". Prices are in a sticky
 * variant selector.
 */

import { runBrandScraper, parsePriceCents, parseSizeMl } from './lib/scrapeBrand';

runBrandScraper({
  brand: 'Maison Francis Kurkdjian',
  sourceId: 'mfk',
  categoryUrls: [
    'https://www.franciskurkdjian.com/us/en/category/fragrance/eaux-de-parfum.html',
    'https://www.franciskurkdjian.com/us/en/category/fragrance/baccarat-rouge-540-collection.html',
  ],
  extractFromPage: async (page, link) => {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
    return page.evaluate(() => {
      const text = (sel: string) => (document.querySelector(sel)?.textContent ?? '').trim().replace(/\s+/g, ' ');
      const name = text('h1, [class*="ProductName"]');
      function notesUnder(label: string): string[] {
        const headings = Array.from(document.querySelectorAll('*'))
          .filter((el) => el.textContent?.trim().toLowerCase() === label.toLowerCase());
        const out: string[] = [];
        for (const h of headings) {
          const next = h.parentElement?.nextElementSibling || h.nextElementSibling;
          const t = next?.textContent ?? '';
          for (const part of t.split(/[,;•\n]/)) {
            const trimmed = part.trim();
            if (trimmed.length > 1 && trimmed.length < 40) out.push(trimmed);
          }
        }
        return Array.from(new Set(out));
      }
      const variants: { size: string; price: string }[] = [];
      document.querySelectorAll('[class*="size"], [class*="variant"]').forEach((v) => {
        const size = v.textContent?.trim() ?? '';
        const price = (v.closest('[class*="variant"]') ?? v.parentElement)
          ?.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
        if (size && price) variants.push({ size, price });
      });
      const img = document.querySelector('img[class*="product"], picture img') as HTMLImageElement | null;
      return { name, top: notesUnder('Top notes'), heart: notesUnder('Heart notes'), base: notesUnder('Base notes'), variants, image: img?.src ?? null };
    }).then((d) => ({
      name: d.name,
      top_notes: d.top,
      heart_notes: d.heart,
      base_notes: d.base,
      prices: d.variants
        .map((v) => ({
          retailer: 'mfk-direct',
          size_ml: parseSizeMl(v.size) ?? 0,
          price_usd_cents: parsePriceCents(v.price) ?? 0,
          is_decant: false,
          url: link.url,
        }))
        .filter((p) => p.size_ml > 0 && p.price_usd_cents > 0),
      image_url: d.image,
      headline_size_ml: 70,
    }));
  },
}).catch((e) => { console.error(e); process.exit(1); });
