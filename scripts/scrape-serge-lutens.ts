/**
 * Scrape Serge Lutens fragrances via Shopify JSON API.
 * Source: https://www.sergelutens.com/collections/all/products.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(DATA_DIR, 'frag-serge-lutens-shopify-raw.json');
const BASE = 'https://www.sergelutens.com';

function parsePriceCents(v: string): number | null {
  const m = v.replace(/[,\s]/g, '').match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}
function parseSizeMl(title: string): number | null {
  const lo = title.toLowerCase().replace(/\s/g, '');
  const ml = lo.match(/(\d+(?:\.\d+)?)\s*ml/); if (ml) return parseFloat(ml[1]);
  const oz = lo.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?oz|oz)/); if (oz) return Math.round(parseFloat(oz[1]) * 29.5735);
  return null;
}
function parseConcentration(title: string): Concentration {
  const t = title.toLowerCase();
  if (t.includes('extrait')) return 'extrait';
  if (t.includes('parfum') && !t.includes('eau de parfum')) return 'parfum';
  if (t.includes('eau de parfum') || t.includes('edp')) return 'edp';
  if (t.includes('eau de toilette') || t.includes('edt')) return 'edt';
  if (t.includes('cologne')) return 'cologne';
  return 'edp';
}
function parseNotesFromHtml(html: string): { top: string[]; heart: string[]; base: string[] } {
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
  id: number; title: string; handle: string; body_html: string;
  tags: string[]; images: { src: string }[];
  variants: { id: number; title: string; price: string; sku: string }[];
}

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  const url = `${BASE}/collections/all/products.json?limit=250&page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } });
  if (!res.ok) return [];
  const json = await res.json() as { products: ShopifyProduct[] };
  return json.products ?? [];
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const allProducts: ShopifyProduct[] = [];
  const seen = new Set<number>();
  for (let p = 1; p <= 5; p++) {
    const batch = await fetchPage(p);
    if (!batch.length) break;
    for (const prod of batch) {
      if (!seen.has(prod.id)) { seen.add(prod.id); allProducts.push(prod); }
    }
    console.log(`Page ${p}: ${batch.length} products (${allProducts.length} unique total)`);
    if (batch.length < 250) break;
    await new Promise(r => setTimeout(r, 500));
  }

  const fragrances = allProducts.filter(p => {
    const t = p.title.toLowerCase();
    const h = p.handle.toLowerCase();
    const tags = p.tags.map(tag => tag.toLowerCase());
    // Exclude non-fragrance products
    if (t.includes(' set') || t.includes('voucher') || t.includes('gift card')) return false;
    if (t.includes('candle') || t.includes('soap') || t.includes('lotion') || t.includes('cream')) return false;
    if (t.includes('sample') || t.includes('discovery') || t.includes('coffret')) return false;
    if (tags.some(tag => tag.includes('notsync') || tag.includes('hide_from_search'))) return false;
    // Exclude Serge Lutens makeup line
    if (t.includes('fard') || t.includes('mascara') || t.includes('spectral') || t.includes('lipstick')) return false;
    if (t.includes('teint si fin') || t.includes('baume à lèvres') || t.includes('passe-velours')) return false;
    if (t.includes('fondu enchaîné') || t.includes("l'étoffe du mat")) return false;
    if (t.includes('gwp -') || t.includes('pouch') || t.includes('miroir') || t.includes('loose powder')) return false;
    if (t.includes('sleeve') || t.includes('atomizer') || t.includes('travel spray case')) return false;
    if (h.includes('rouge-a-levres') || h.includes('fard-a-')) return false;
    // Must have at least one variant with an ml size (fragrances) or explicit fragrance handle
    if (h.includes('eau-de-parfum') || h.includes('eau-de-toilette') || h.includes('extrait') || h.includes('-parfum')) return true;
    const hasSize = p.variants.some(v => parseSizeMl(v.title) !== null && parseSizeMl(v.title)! >= 10);
    return hasSize;
  });
  console.log(`${fragrances.length} fragrances after filtering`);

  const out: CandidateFragrance[] = [];
  for (const [i, product] of fragrances.entries()) {
    process.stdout.write(`  [${i + 1}/${fragrances.length}] ${product.title.slice(0, 55)}... `);
    const notes = parseNotesFromHtml(product.body_html ?? '');
    const concentration = parseConcentration(product.title + ' ' + product.handle);
    const prices = product.variants
      .map(v => ({ retailer: 'sergelutens-direct', size_ml: parseSizeMl(v.title) ?? 0,
        price_usd_cents: parsePriceCents(v.price) ?? 0, is_decant: false,
        url: `${BASE}/products/${product.handle}` }))
      .filter(p => p.size_ml > 0 && p.price_usd_cents > 0);
    const headline = prices.find(p => p.size_ml >= 50) ?? prices[0];
    out.push({
      brand: 'Serge Lutens', name: product.title, release_year: null, concentration,
      fragrance_family: null, gender: 'unisex', top_notes: notes.top, heart_notes: notes.heart,
      base_notes: notes.base, top_accords: [], accord_intensity: {},
      community_longevity: null, community_sillage: null, community_projection: null,
      compliment_score: null, versatility_score: null, office_safe_score: null, price_tier: null,
      retail_msrp_usd_cents: headline?.price_usd_cents ?? null, prices,
      image_url: product.images[0]?.src ?? null,
      source: 'sergelutens', source_url: `${BASE}/products/${product.handle}`, sources: ['sergelutens'],
    });
    process.stdout.write('ok\n');
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.length} fragrances → ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
