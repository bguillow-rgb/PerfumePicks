/**
 * Scrape Byredo fragrances.
 * Source: https://www.byredo.com/us_en/fragrance/eau-de-parfum
 *
 * Byredo's PDP has nice clean structured data — notes appear in a labeled
 * "Composition" block with bullet lists, prices in a dropdown.
 */

import { runBrandScraper, parsePriceCents, parseSizeMl } from './lib/scrapeBrand';

runBrandScraper({
  brand: 'Byredo',
  sourceId: 'byredo',
  categoryUrls: [
    'https://www.byredo.com/us_en/fragrance/eau-de-parfum',
    'https://www.byredo.com/us_en/fragrance/extrait-de-parfum',
  ],
  extractFromPage: async (page, link) => {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
    return page.evaluate(() => {
      const name = (document.querySelector('h1')?.textContent ?? '').trim().replace(/\s+/g, ' ');
      function notesUnder(label: string): string[] {
        const headings = Array.from(document.querySelectorAll('h2, h3, h4, dt, strong'))
          .filter((el) => el.textContent?.trim().toLowerCase() === label.toLowerCase());
        const out: string[] = [];
        for (const h of headings) {
          const next = h.nextElementSibling;
          (next?.querySelectorAll('li') ?? []).forEach((li) => {
            const t = li.textContent?.trim();
            if (t && t.length > 1 && t.length < 40) out.push(t);
          });
          if (next && next.children.length === 0 && next.textContent) {
            for (const part of next.textContent.split(/[,;•]/)) {
              const trimmed = part.trim();
              if (trimmed.length > 1 && trimmed.length < 40) out.push(trimmed);
            }
          }
        }
        return Array.from(new Set(out));
      }
      const variants: { size: string; price: string }[] = [];
      document.querySelectorAll('option, [class*="variant"]').forEach((v) => {
        const size = v.textContent?.trim() ?? '';
        const price = v.getAttribute('data-price') ?? v.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
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
          retailer: 'byredo-direct',
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
