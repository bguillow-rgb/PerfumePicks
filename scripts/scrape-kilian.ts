/**
 * Scrape Kilian Paris fragrances.
 * Source: https://www.bykilian.com/the-fragrances
 *
 * Kilian's PDP groups notes under "Olfactive Pyramid" with a top/heart/base
 * substructure. Sizes typically 50ml + 100ml refill.
 */

import { runBrandScraper, parsePriceCents, parseSizeMl } from './lib/scrapeBrand';

runBrandScraper({
  brand: 'Kilian',
  sourceId: 'kilian',
  categoryUrls: [
    'https://www.bykilian.com/the-fragrances',
  ],
  extractFromPage: async (page, link) => {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
    return page.evaluate(() => {
      const name = (document.querySelector('h1')?.textContent ?? '').trim().replace(/\s+/g, ' ');
      function notesUnder(label: string): string[] {
        const headings = Array.from(document.querySelectorAll('*'))
          .filter((el) => {
            const t = el.textContent?.trim().toLowerCase() ?? '';
            return t === label.toLowerCase() || t === `${label.toLowerCase()} notes`;
          });
        const out: string[] = [];
        for (const h of headings) {
          const next = h.nextElementSibling || h.parentElement?.nextElementSibling;
          const t = next?.textContent ?? '';
          for (const part of t.split(/[,;•\n]/)) {
            const trimmed = part.trim();
            if (trimmed.length > 1 && trimmed.length < 40) out.push(trimmed);
          }
        }
        return Array.from(new Set(out));
      }
      const variants: { size: string; price: string }[] = [];
      document.querySelectorAll('[class*="variant"], [class*="size"]').forEach((v) => {
        const size = v.textContent?.trim() ?? '';
        const price = v.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
        if (size && price) variants.push({ size, price });
      });
      const img = document.querySelector('img[class*="product"], picture img') as HTMLImageElement | null;
      return { name, top: notesUnder('Top'), heart: notesUnder('Heart'), base: notesUnder('Base'), variants, image: img?.src ?? null };
    }).then((d) => ({
      name: d.name,
      top_notes: d.top,
      heart_notes: d.heart,
      base_notes: d.base,
      prices: d.variants
        .map((v) => ({
          retailer: 'kilian-direct',
          size_ml: parseSizeMl(v.size) ?? 0,
          price_usd_cents: parsePriceCents(v.price) ?? 0,
          is_decant: false,
          url: link.url,
        }))
        .filter((p) => p.size_ml > 0 && p.price_usd_cents > 0),
      image_url: d.image,
      headline_size_ml: 50,
    }));
  },
}).catch((e) => { console.error(e); process.exit(1); });
