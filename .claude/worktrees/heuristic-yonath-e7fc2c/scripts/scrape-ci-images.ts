/**
 * Scrapes Cigar International search results to find product images
 * for each brand in our database, then maps them to our cigars.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CI_SEARCH_URL = 'https://www.cigarsinternational.com/shop/';
const CI_IMG_BASE = 'https://img.cigarsinternational.com';

// User agent to avoid bot detection
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface CigarRecord {
  id: string;
  brand: string;
  name: string;
}

interface ScrapedProduct {
  name: string;
  imageUrl: string;
}

async function searchCI(query: string): Promise<ScrapedProduct[]> {
  const url = `${CI_SEARCH_URL}?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`  Search failed for "${query}": ${res.status}`);
      return [];
    }

    const html = await res.text();

    // Extract product names and images from HTML
    const products: ScrapedProduct[] = [];

    // Pattern: product images are in format /product/iris/bgwhite/wd500/XXXX.jpg
    // or /p/500/cb/k/XXXX.jpg
    const imgPattern = /https?:\/\/img\.cigarsinternational\.com\/(?:product\/iris\/bgwhite\/wd500|p\/500\/cb\/\w)\/[^"'\s]+\.(?:jpg|png)/gi;
    const imgMatches = html.match(imgPattern) || [];

    // Product names appear in various patterns
    // Look for text near the images - usually in <a> tags or heading elements
    const namePattern = /<(?:h2|h3|a)[^>]*>([^<]*(?:Padron|Arturo|Fuente|Oliva|Rocky|Liga|Davidoff|Ashton|My Father|Montecristo|Romeo|Tatuaje|Perdomo|CAO|Punch|Macanudo|Nub|Acid|Camacho|Foundation|Drew Estate|Crowned|Illusione|AJ Fernandez|EP Carrillo|Joya|Alec Bradley|Brick House|La Gloria|La Aroma|Avo|Plasencia|Gurkha|Diesel|Caldwell|Warped|HVC|Aganorsa|San Cristobal|Hoyo|H\. Upmann|Bolivar|Villiger|Gran Habano|Casa Magna|La Palina|Regius|RoMa Craft|Viaje|Sobremesa|Dunbarton|Trinidad)[^<]*)<\/(?:h2|h3|a)>/gi;
    const nameMatches = [...html.matchAll(namePattern)];

    // Also try a simpler approach: extract from alt text of images
    const altPattern = /alt="([^"]*(?:cigar|padron|fuente|oliva|liga|davidoff)[^"]*)"/gi;
    const altMatches = [...html.matchAll(altPattern)];

    // Build unique image list
    const uniqueImgs = [...new Set(imgMatches.map(u => u.split('?')[0]))];

    // Build product list from names found
    const names = nameMatches.map(m => m[1].trim()).filter(n => n.length > 3 && n.length < 100);
    const altNames = altMatches.map(m => m[1].trim()).filter(n => n.length > 3);

    const allNames = [...new Set([...names, ...altNames])];

    // Pair them up (images and names appear in same order on page)
    for (let i = 0; i < Math.min(uniqueImgs.length, 30); i++) {
      products.push({
        name: allNames[i] || `Product ${i + 1}`,
        imageUrl: uniqueImgs[i],
      });
    }

    return products;
  } catch (e: any) {
    console.warn(`  Error searching "${query}": ${e.message}`);
    return [];
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestImageMatch(cigar: CigarRecord, products: ScrapedProduct[]): string | null {
  const cigarNorm = normalizeForMatch(`${cigar.brand} ${cigar.name}`);
  const cigarBrand = normalizeForMatch(cigar.brand);
  const cigarName = normalizeForMatch(cigar.name);

  // Try exact-ish match first
  for (const p of products) {
    const pNorm = normalizeForMatch(p.name);
    if (pNorm.includes(cigarName) || cigarName.includes(pNorm)) {
      return p.imageUrl;
    }
  }

  // Try brand match (use first image for that brand)
  for (const p of products) {
    const pNorm = normalizeForMatch(p.name);
    if (pNorm.includes(cigarBrand)) {
      return p.imageUrl;
    }
  }

  // Use first product image as fallback for this search
  return products.length > 0 ? products[0].imageUrl : null;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Get all unique brands from our DB
  const { data: cigars, error } = await supabase
    .from('cigars')
    .select('id, brand, name')
    .order('brand');

  if (error || !cigars) {
    console.error('Failed to fetch cigars:', error?.message);
    process.exit(1);
  }

  console.log(`Processing ${cigars.length} cigars across brands...\n`);

  // Group by brand
  const byBrand: Record<string, CigarRecord[]> = {};
  for (const c of cigars) {
    if (!byBrand[c.brand]) byBrand[c.brand] = [];
    byBrand[c.brand].push(c);
  }

  const brands = Object.keys(byBrand).sort();
  console.log(`${brands.length} unique brands to search\n`);

  let updated = 0;
  let failed = 0;
  const allResults: Record<string, ScrapedProduct[]> = {};

  // Search CI for each brand
  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    process.stdout.write(`[${i + 1}/${brands.length}] Searching: ${brand}...`);

    const products = await searchCI(brand);
    allResults[brand] = products;

    console.log(` found ${products.length} product images`);

    // Rate limiting - be respectful
    await sleep(1500);
  }

  console.log('\n--- Mapping images to cigars ---\n');

  // Now also search for specific cigar lines that might have different results
  // For major brands, do sub-searches
  const majorLines: Record<string, string[]> = {
    'Padron': ['Padron 1926', 'Padron 1964', 'Padron Family Reserve'],
    'Arturo Fuente': ['Fuente OpusX', 'Fuente Don Carlos', 'Fuente Hemingway'],
    'Liga Privada': ['Liga Privada No 9', 'Liga Privada T52'],
    'My Father': ['My Father Le Bijou', 'My Father Flor de las Antillas', 'My Father The Judge'],
    'Oliva': ['Oliva Serie V', 'Oliva Serie O', 'Oliva Master Blends'],
    'Rocky Patel': ['Rocky Patel Vintage 1990', 'Rocky Patel Vintage 1992', 'Rocky Patel Decade'],
    'Davidoff': ['Davidoff Winston Churchill', 'Davidoff Grand Cru'],
  };

  for (const [brand, lines] of Object.entries(majorLines)) {
    for (const line of lines) {
      process.stdout.write(`  Sub-search: ${line}...`);
      const products = await searchCI(line);
      // Merge with brand results
      allResults[brand] = [...(allResults[brand] || []), ...products];
      console.log(` +${products.length} images`);
      await sleep(1500);
    }
  }

  console.log('\n--- Updating database ---\n');

  // Map and update each cigar
  for (const brand of brands) {
    const brandCigars = byBrand[brand];
    const products = allResults[brand] || [];

    for (const cigar of brandCigars) {
      // Also try searching for specific cigar if we have few brand results
      let imageUrl = findBestImageMatch(cigar, products);

      if (imageUrl) {
        const { error: updateErr } = await supabase
          .from('cigars')
          .update({ image_url: imageUrl })
          .eq('id', cigar.id);

        if (!updateErr) {
          updated++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  No image found: ${failed}`);

  // Verify
  const { count } = await supabase
    .from('cigars')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%cigarsinternational%');
  console.log(`  Cigars with CI images: ${count}`);
}

main().catch(console.error);
