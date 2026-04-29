/**
 * Generic multi-brand Shopify JSON API scraper.
 * Add brand configs to BRANDS array to scrape additional Shopify-based perfumers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CandidateFragrance, Concentration } from './types';

const DATA_DIR = path.join(__dirname, 'data');

interface BrandConfig {
  brand: string;
  base: string;
  collection: string;  // e.g. 'all', 'fragrances', 'perfume'
  gender: 'masculine' | 'feminine' | 'unisex' | null;
  outFile: string;
  lenient?: boolean;  // When true, accept all products with price > 0 (for brands where everything is a fragrance)
}

const BRANDS: BrandConfig[] = [
  { brand: 'Etat Libre d\'Orange', base: 'https://www.etatlibredorange.com', collection: 'fragrances', gender: 'unisex', outFile: 'frag-etat-libre-dorange-raw.json' },
  { brand: 'Vilhelm Parfumerie', base: 'https://www.vilhelmparfumerie.com', collection: 'all', gender: 'unisex', outFile: 'frag-vilhelm-parfumerie-raw.json' },
  { brand: 'LM Parfums', base: 'https://www.lmparfums.com', collection: 'all', gender: 'unisex', outFile: 'frag-lm-parfums-raw.json' },
  { brand: 'Atkinsons 1799', base: 'https://www.atkinsons1799.com', collection: 'all', gender: 'unisex', outFile: 'frag-atkinsons-1799-raw.json', lenient: true },
  { brand: 'Nasomatto', base: 'https://www.nasomatto.com', collection: 'all', gender: 'unisex', outFile: 'frag-nasomatto-raw.json' },
  { brand: 'Amouage', base: 'https://amouage.com', collection: 'all', gender: 'unisex', outFile: 'frag-amouage-direct-raw.json' },
  { brand: 'Imaginary Authors', base: 'https://www.imaginaryauthors.com', collection: 'all', gender: 'unisex', outFile: 'frag-imaginary-authors-raw.json' },
  { brand: 'Commodity', base: 'https://www.commodityfragrances.com', collection: 'all', gender: 'unisex', outFile: 'frag-commodity-raw.json' },
  { brand: 'Miller Harris', base: 'https://www.millerharris.com', collection: 'all', gender: 'unisex', outFile: 'frag-miller-harris-raw.json' },
  { brand: 'Zoologist', base: 'https://www.zoologistperfumes.com', collection: 'all', gender: 'unisex', outFile: 'frag-zoologist-raw.json', lenient: true },
  { brand: 'Molinard', base: 'https://www.molinard.com', collection: 'all', gender: 'unisex', outFile: 'frag-molinard-raw.json' },
  { brand: 'Sucreabeille', base: 'https://www.sucreabeille.com', collection: 'all', gender: 'unisex', outFile: 'frag-sucreabeille-raw.json', lenient: true },
  // New brands added 2026-04-29
  { brand: 'Phlur', base: 'https://www.phlur.com', collection: 'perfumes', gender: 'unisex', outFile: 'frag-phlur-raw.json', lenient: true },
  { brand: 'Perris Monte Carlo', base: 'https://www.perrismontecarlo.com', collection: 'fragrances', gender: 'unisex', outFile: 'frag-perris-monte-carlo-raw.json' },
  { brand: 'Ormonde Jayne', base: 'https://www.ormondejayne.com', collection: 'all', gender: 'unisex', outFile: 'frag-ormonde-jayne-raw.json' },
  { brand: 'Robert Piguet Parfums', base: 'https://www.robertpiguetparfums.com', collection: 'all', gender: 'unisex', outFile: 'frag-robert-piguet-raw.json' },
  { brand: 'Beaufort London', base: 'https://www.beaufortlondon.com', collection: 'all', gender: 'unisex', outFile: 'frag-beaufort-london-raw.json' },
  { brand: 'Jusbox Perfumes', base: 'https://www.jusboxperfumes.com', collection: 'all', gender: 'unisex', outFile: 'frag-jusbox-raw.json' },
  { brand: 'Toskovat', base: 'https://www.toskovat.com', collection: 'all', gender: 'unisex', outFile: 'frag-toskovat-raw.json', lenient: true },
];

function parsePriceCents(v: string): number | null {
  const m = v.replace(/[,\s]/g, '').match(/[€$£]?(\d+(?:\.\d{1,2})?)/);
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

function isFragranceLenient(p: ShopifyProduct): boolean {
  const t = p.title.toLowerCase();
  if (t.includes('candle') || t.includes('soap') || t.includes('lotion') || t.includes('gift set')) return false;
  if (t.includes('voucher') || t.includes('gift card') || t.includes('sample kit')) return false;
  if (t.includes('discovery set') || t.includes('coffret') || t.includes('perfume set')) return false;
  if (t.includes(' duo') || t.includes(' trio') || t.includes(' kit')) return false;
  if (t.includes('air freshener') || t.includes('incense') || t.includes('body wash')) return false;
  if (t.includes('body oil') || t.includes('body cream') || t.includes('body mist')) return false;
  if (t.includes('digital gift') || t.includes('gift card') || t.includes('sample')) return false;
  // Must have at least one variant with price > 0
  return p.variants.some(v => parseFloat(v.price) > 0);
}

function isFragrance(p: ShopifyProduct): boolean {
  const t = p.title.toLowerCase();
  const h = p.handle.toLowerCase();
  const tags = (p.tags ?? []).map(tg => tg.toLowerCase());
  // Exclusions
  if (t.includes(' set') || t.includes('gift set') || t.includes('discovery set')) return false;
  if (t.includes('voucher') || t.includes('gift card') || t.includes('sample')) return false;
  if (t.includes('candle') || t.includes('soap') || t.includes('lotion') || t.includes('body cream')) return false;
  if (t.includes('coffret') || t.includes('travel spray') && !t.includes('ml')) return false;
  // Only exclude bundles if the product is clearly a multi-item bundle (not just tagged)
  if (t.includes('bundle ') || t.startsWith('bundle:')) return false;
  // Explicit fragrance signals
  if (h.includes('eau-de-parfum') || h.includes('eau-de-toilette') || h.includes('extrait') || h.includes('-edp')) return true;
  if (tags.some(tg => ['fragrance', 'perfume', 'parfum', 'edp', 'edt'].some(kw => tg.includes(kw)))) return true;
  // Fallback: must have ≥1 variant with ml size ≥10ml
  return p.variants.some(v => { const ml = parseSizeMl(v.title); return ml !== null && ml >= 10; });
}

async function scrapeBrand(cfg: BrandConfig): Promise<void> {
  const outPath = path.join(DATA_DIR, cfg.outFile);
  console.log(`\n=== ${cfg.brand} ===`);

  const allProducts: ShopifyProduct[] = [];
  const seen = new Set<number>();
  for (let p = 1; p <= 5; p++) {
    const url = `${cfg.base}/collections/${cfg.collection}/products.json?limit=250&page=${p}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PerfumePicksBot/1.0)' } });
    if (!res.ok) { console.log(`  Page ${p}: HTTP ${res.status} — stopping`); break; }
    const json = await res.json() as { products: ShopifyProduct[] };
    const batch = json.products ?? [];
    if (!batch.length) break;
    for (const prod of batch) {
      if (!seen.has(prod.id)) { seen.add(prod.id); allProducts.push(prod); }
    }
    console.log(`  Page ${p}: ${batch.length} products (${allProducts.length} unique total)`);
    if (batch.length < 250) break;
    await new Promise(r => setTimeout(r, 400));
  }

  const fragrances = allProducts.filter(p => cfg.lenient ? isFragranceLenient(p) : isFragrance(p));
  console.log(`  ${fragrances.length} fragrances after filtering`);

  const out: CandidateFragrance[] = [];
  for (const product of fragrances) {
    const notes = parseNotesFromHtml(product.body_html ?? '');
    const concentration = parseConcentration(product.title + ' ' + product.handle);
    const prices = product.variants
      .map(v => ({ retailer: `${cfg.brand.toLowerCase().replace(/\s+/g, '-')}-direct`,
        size_ml: parseSizeMl(v.title) ?? 0, price_usd_cents: parsePriceCents(v.price) ?? 0,
        is_decant: false, url: `${cfg.base}/products/${product.handle}` }))
      .filter(p => p.size_ml > 0 && p.price_usd_cents > 0);
    const headline = prices.find(p => p.size_ml >= 50) ?? prices[0];
    out.push({
      brand: cfg.brand, name: product.title, release_year: null, concentration,
      fragrance_family: null, gender: cfg.gender, top_notes: notes.top, heart_notes: notes.heart,
      base_notes: notes.base, top_accords: [], accord_intensity: {},
      community_longevity: null, community_sillage: null, community_projection: null,
      compliment_score: null, versatility_score: null, office_safe_score: null, price_tier: null,
      retail_msrp_usd_cents: headline?.price_usd_cents ?? null, prices,
      image_url: product.images[0]?.src ?? null,
      source: cfg.brand.toLowerCase().replace(/\s+/g, '-'), source_url: `${cfg.base}/products/${product.handle}`,
      sources: [cfg.brand.toLowerCase().replace(/\s+/g, '-')],
    });
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`  → Wrote ${out.length} fragrances to ${cfg.outFile}`);
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const cfg of BRANDS) {
    try {
      await scrapeBrand(cfg);
    } catch (e) {
      console.error(`  ERROR for ${cfg.brand}:`, (e as Error).message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nAll brands done.');
}

main().catch(e => { console.error(e); process.exit(1); });
