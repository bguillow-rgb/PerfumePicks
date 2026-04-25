/**
 * Scrape Le Labo Fragrances.
 * Source: https://www.lelabofragrances.com/us_en/eaux-de-parfum.html
 *
 * Le Labo's PDP is famously minimalist; notes are in a small "scent
 * pyramid" section. They sell decants too — the runner picks the 50ml
 * "classic size" as the headline.
 */

import { runBrandScraper, parsePriceCents, parseSizeMl } from './lib/scrapeBrand';

runBrandScraper({
  brand: 'Le Labo',
  sourceId: 'lelabo',
  categoryUrls: [
    'https://www.lelabofragrances.com/us_en/eaux-de-parfum.html',
  ],
  extractFromPage: async (page, link) => {
    await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 25_000 });
    return page.evaluate(() => {
      const name = (document.querySelector('h1')?.textContent ?? '').trim().replace(/\s+/g, ' ');
      function notesByLabel(label: string): string[] {
        const wrap = Array.from(document.querySelectorAll('*'))
          .find((el) => el.textContent?.trim().toLowerCase().startsWith(label.toLowerCase()));
        if (!wrap) return [];
        const t = wrap.parentElement?.textContent ?? '';
        return t
          .replace(new RegExp(label, 'i'), '')
          .split(/[,;•\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && s.length < 40);
      }
      const variants: { size: string; price: string }[] = [];
      document.querySelectorAll('[data-size], [class*="size"]').forEach((v) => {
        const size = v.textContent?.trim() ?? '';
        const price = v.closest('li, button, div')?.querySelector('[class*="price"]')?.textContent?.trim() ?? '';
        if (size && price) variants.push({ size, price });
      });
      const img = document.querySelector('img[class*="product"], picture img') as HTMLImageElement | null;
      return { name, top: notesByLabel('top'), heart: notesByLabel('heart'), base: notesByLabel('base'), variants, image: img?.src ?? null };
    }).then((d) => ({
      name: d.name,
      top_notes: d.top,
      heart_notes: d.heart,
      base_notes: d.base,
      prices: d.variants
        .map((v) => ({
          retailer: 'lelabo-direct',
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
