/**
 * Scrape Tom Ford Beauty fragrances via Shopify JSON API.
 * Source: https://www.tomfordbeauty.com/collections/fragrance/products.json
 *
 * No Puppeteer needed — Shopify's products.json endpoint returns structured data.
 * PDP notes still require a browser (no notes in Shopify JSON), so we fall back
 * to whatever is in the body_html field.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'frag-tom-ford-shopify-raw.json');
const BASE = 'https://www.tomfordbeauty.com';
const POLITE_DELAY_MS = 800;

function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/[,\s]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}
function parseSizeMl(title: string): number | null {
  const lo = title.toLowerCase().replace(/\s/g, '');
  const ml = lo.match(/(\d+(?:\.\d+)?)\s*ml/);
  if (ml) return parseFloat(ml[1]);
  const oz = lo.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?oz|oz)/);
  if (oz) return Math.round(parseFloat(oz[1]) * 29.5735);
  return null;
}
function parseConcentration(title: string): Concentration {
  const t = title.toLowerCase();
  if (t.includes('parfum') && !t.includes('eau de parfum')) return 'parfum';
  if (t.includes('eau de parfum') || t.includes('edp')) return 'edp';
  if (t.includes('eau de toilette') || t.includes('edt')) return 'edt';
  if (t.includes('extrait')) return 'extrait';
  if (t.includes('cologne')) return 'cologne';
  return 'edp';
}
function parseGender(tags: string[], title: string): 'feminine' | 'masculine' | 'unisex' | null {
  const t = (tags.join(' ') + ' ' + title).toLowerCase();
  if (t.includes('women') || t.includes('feminine') || t.includes('for her')) return 'feminine';
  if (t.includes('men') || t.includes('masculine') || t.includes('for him')) return 'masculine';
  return null;
}
function parseNotesFromHtml(html: string): { top: string[]; heart: string[]; base: string[] } {
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  function after(label: string): string[] {
    const re = new RegExp(label + '[:\\s]+([^.\\n]{3,120})', 'i');
    const m = text.match(re);
    if (!m) return [];
    return m[1].split(/[,;&]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40);
  }
  return { top: after('top notes'), heart: after('heart notes'), base: after('base notes') };
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  tags: string[];
  images: { src: string }[];
  variants: {
    id: number;
    title: string;
    price: string;
    sku: string;
  }[];
}

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  const url = `${BASE}/collections/fragrance/products.json?limit=250&page=${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PerfumePicksBot/1.0)' },
  });
  if (!res.ok) return [];
  const json = await res.json() as { products: ShopifyProduct[] };
  return json.products ?? [];
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Fetch all pages
  const allProducts: ShopifyProduct[] = [];
  for (let p = 1; p <= 5; p++) {
    const batch = await fetchPage(p);
    if (!batch.length) break;
    allProducts.push(...batch);
    console.log(`Page ${p}: ${batch.length} products (total: ${allProducts.length})`);
    await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
  }

  // Filter to actual fragrances (exclude sets, accessories)
  const fragrances = allProducts.filter(p => {
    const h = p.handle.toLowerCase();
    const t = p.title.toLowerCase();
    // Keep if it looks like a fragrance
    if (h.includes('-set') || h.includes('set-') || t.includes(' set')) return false;
    if (t.includes('candle') || t.includes('lotion') || t.includes('body') || t.includes('soap')
      || t.includes('beard oil') || t.includes('deodorant') || t.includes('hand cream')
      || t.includes('shower') || t.includes('gift card')) return false;
    const hasFrag = h.includes('eau-de-parfum') || h.includes('eau-de-toilette') || h.includes('parfum')
      || h.includes('cologne') || p.tags.some(tag => tag.toLowerCase().includes('fragrance'));
    return hasFrag || p.images.length > 0; // Keep products with images that may be fragrances
  });
  console.log(`\n${fragrances.length} fragrances after filtering (from ${allProducts.length} total)`);

  const out: CandidateFragrance[] = [];

  for (const [i, product] of fragrances.entries()) {
    process.stdout.write(`  [${i + 1}/${fragrances.length}] ${product.title.slice(0, 55)}... `);

    const notes = parseNotesFromHtml(product.body_html ?? '');
    const concentration = parseConcentration(product.title);
    const gender = parseGender(product.tags, product.title);
    const image_url = product.images[0]?.src ?? null;

    // Build prices from variants
    const prices = product.variants
      .map(v => ({
        retailer: 'tomford-direct',
        size_ml: parseSizeMl(v.title) ?? 0,
        price_usd_cents: parsePriceCents(v.price) ?? 0,
        is_decant: false,
        url: `${BASE}/products/${product.handle}`,
      }))
      .filter(p => p.size_ml > 0 && p.price_usd_cents > 0);

    const headline = prices.find(p => p.size_ml >= 50) ?? prices[0];

    out.push({
      brand: 'Tom Ford',
      name: product.title,
      release_year: null,
      concentration,
      fragrance_family: null,
      gender,
      top_notes: notes.top,
      heart_notes: notes.heart,
      base_notes: notes.base,
      top_accords: [], accord_intensity: {},
      community_longevity: null, community_sillage: null, community_projection: null,
      compliment_score: null, versatility_score: null, office_safe_score: null,
      price_tier: null,
      retail_msrp_usd_cents: headline?.price_usd_cents ?? null,
      prices,
      image_url,
      source: 'tomford',
      source_url: `${BASE}/products/${product.handle}`,
      sources: ['tomford'],
    });
    process.stdout.write('ok\n');
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances → ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
