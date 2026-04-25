import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Brand prestige tier (0=ultra-luxury, 1=premium, 2=mid-premium, 3=mid, 4=value)
// Based on typical retail positioning at Cigars International / Famous Smoke Shop.
const BRAND_PRESTIGE: Record<string, number> = {
  // Ultra-luxury ($18-35+)
  'Davidoff': 0,
  'Arturo Fuente': 0, // Opus X etc push up; tier-aware below handles low tiers
  'Padron': 0, // 1926/1964 lines; non-series Padron 3000/4000 fall to tier
  'Liga Privada': 0,
  'Cohiba': 0,
  'Ashton': 0,
  'Sobremesa': 0,
  'Muestra de Saka': 0,
  'Dunbarton Tobacco & Trust': 0,
  'Casdagli': 0,
  'Sin Compromiso': 0,
  'Regius': 0,
  'Principle': 0,

  // Premium ($12-18)
  'My Father': 1,
  'Tatuaje': 1,
  'Illusione': 1,
  'AVO': 1,
  'Avo': 1,
  'Fuente Fuente OpusX': 1,
  'Warped': 1,
  'Crowned Heads': 1,
  'Herrera Esteli': 1,
  'Aging Room': 1,
  'Caldwell': 1,
  'Ezra Zion': 1,
  'Foundation Cigar Co': 1,
  'Ferio Tego': 1,
  'La Flor Dominicana': 1,
  'Mi Querida': 1,
  'Montecristo': 1,
  'Romeo y Julieta': 1,
  'Partagas': 1,
  'H. Upmann': 1,
  'Punch': 1,
  'La Gloria Cubana': 1,
  'Hoyo de Monterrey': 1,
  'San Cristobal': 1,
  'Bolivar': 1,
  'Trinidad': 1,
  'Dunhill': 1,
  'RoMa Craft': 1,
  'EP Carrillo': 1,
  'Plasencia': 1,
  'Gurkha': 1,
  'Viaje': 1,

  // Mid-premium ($8-12)
  'Oliva': 2,
  'Drew Estate': 2,
  'Rocky Patel': 2,
  'Perdomo': 2,
  'Camacho': 2,
  'CAO': 2,
  'Alec Bradley': 2,
  'Alec & Bradley': 2,
  'Tabak Especial': 2,
  'Undercrown': 2,
  'Aladino': 2,
  'Kristoff': 2,
  'Crux': 2,
  'Espinosa': 2,
  'Fratello': 2,
  'Southern Draw': 2,
  'Cornelius & Anthony': 2,
  'La Palina': 2,
  'La Aroma de Cuba': 2,
  'Macanudo': 2,
  'Brick House': 2,
  'La Herencia Cubana': 2,
  'Joya de Nicaragua': 2,
  'Diesel': 2,
  'Aganorsa Leaf': 2,
  'Flor de las Antillas': 2,
  'Todos Las Dias': 2,
  'Mombacho': 2,
  'Henry Clay': 2,
  'Black Label Trading Co': 2,
  'ACE Prime': 2,
  'Protocol': 2,
  'Dapper': 2,
  'HVC': 2,
  'Blackbird': 2,
  'Eiroa': 2,
  'Flores y Rodriguez': 2,
  'Casa Fernandez': 2,
  'Balmoral': 2,
  'Amendola': 2,
  'All Saints': 2,
  'La Barba': 2,
  'StillWell Star': 2,
  'Rojas': 2,
  'Saga': 2,
  'San Lotano': 2,
  'Acid': 2,
  'Gran Habano': 2,

  // Mid ($6-9)
  'CLE': 3,
  'Kentucky Fire Cured': 3,
  'Nica Rustica': 3,
  'Encore': 3,
  'Ventura': 3,
  'New World': 3,
  'Room 101': 3,
  'Java': 3,
  'Leaf by Oscar': 3,
  'Nub': 3,
  'Casa Magna': 3,
  'Ramon Bueso': 3,
  'AJ Fernandez': 3,
  'Villiger': 3,
  'Sprocket': 3,

  // Value ($3-5)
  'Charter Oak': 4,
};

// Base per-stick MSRP in USD by (brand prestige, price_tier). Row=prestige 0..4, col=tier 1..5
const PRICE_MATRIX: number[][] = [
  // Ultra-luxury brands rarely ship a tier-1 stick, but guard anyway
  [10.0, 14.0, 18.0, 24.0, 32.0], // prestige 0
  [7.5,  10.0, 13.0, 17.0, 23.0], // prestige 1
  [5.5,  7.5,  9.5,  12.0, 16.0], // prestige 2
  [4.0,  6.0,  8.0,  10.5, 14.0], // prestige 3
  [3.0,  4.5,  6.0,  8.0,  11.0], // prestige 4 (value)
];

// Vitola size multiplier — larger vitolas cost more within the same line.
// Based on a normalized "small→large" scale.
const VITOLA_MULTIPLIERS: Record<string, number> = {
  // Small
  'Petit Corona': 0.82,
  'Small Panatela': 0.78,
  'Panatela': 0.85,
  'Lancero': 0.92,
  'Corona': 0.9,
  'Cigarillo': 0.6,
  // Mid
  'Corona Gorda': 0.96,
  'Robusto': 1.0,
  'Rothschild': 0.98,
  'Short Robusto': 0.92,
  'Petit Robusto': 0.9,
  'Belicoso': 1.05,
  'Piramide': 1.05,
  'Piramides': 1.05,
  'Pyramid': 1.05,
  'Torpedo': 1.05,
  'Figurado': 1.08,
  'Perfecto': 1.08,
  // Large
  'Toro': 1.1,
  'Grand Toro': 1.12,
  'Gran Toro': 1.12,
  'Sixty': 1.15,
  'Gordo': 1.18,
  'Double Robusto': 1.12,
  'Churchill': 1.15,
  'Double Corona': 1.2,
  'Presidente': 1.22,
  'Prominente': 1.25,
  'Salomon': 1.3,
  'Soberano': 1.3,
  'Magnum': 1.2,
  'A': 1.35,
};

function prestigeOf(brand: string): number {
  if (brand in BRAND_PRESTIGE) return BRAND_PRESTIGE[brand];
  // Default unknown brands to mid ($6-9 range)
  return 3;
}

function vitolaMultiplier(vitola: string | null): number {
  if (!vitola) return 1.0;
  // Direct match
  if (vitola in VITOLA_MULTIPLIERS) return VITOLA_MULTIPLIERS[vitola];
  // Case-insensitive fallback
  const v = vitola.toLowerCase();
  for (const [key, mult] of Object.entries(VITOLA_MULTIPLIERS)) {
    if (key.toLowerCase() === v) return mult;
  }
  // Heuristic fallback by size keywords
  if (/gordo|60|sixty|magnum/i.test(vitola)) return 1.18;
  if (/churchill|double corona|presidente/i.test(vitola)) return 1.15;
  if (/toro/i.test(vitola)) return 1.1;
  if (/robusto/i.test(vitola)) return 1.0;
  if (/corona/i.test(vitola)) return 0.9;
  if (/petit|small/i.test(vitola)) return 0.82;
  return 1.0;
}

function computePriceCents(brand: string, vitola: string | null, priceTier: number): number {
  const prestige = prestigeOf(brand);
  const tier = Math.max(1, Math.min(5, priceTier || 3));
  const base = PRICE_MATRIX[prestige][tier - 1];
  const mult = vitolaMultiplier(vitola);
  const dollars = base * mult;
  // Round to nearest $0.25, then convert to cents
  const rounded = Math.round(dollars * 4) / 4;
  return Math.round(rounded * 100);
}

async function main() {
  console.log('Fetching cigars...');
  const { data: cigars, error } = await sb
    .from('cigars')
    .select('id, brand, vitola, price_tier, name, line');
  if (error) {
    console.error('Fetch failed:', error);
    process.exit(1);
  }
  if (!cigars) {
    console.error('No cigars returned');
    process.exit(1);
  }
  console.log(`Got ${cigars.length} cigars.`);

  // Sample preview before committing
  console.log('\n=== SAMPLE PRICES ===');
  const samples = cigars.slice(0, 10);
  for (const c of samples) {
    const p = computePriceCents(c.brand, c.vitola, c.price_tier);
    console.log(`${c.brand} ${c.line || c.name} ${c.vitola || ''} (tier ${c.price_tier}) → $${(p/100).toFixed(2)}`);
  }

  // Distribution stats
  const priceStats: Record<string, number> = {};
  const prices: number[] = [];
  for (const c of cigars) {
    const p = computePriceCents(c.brand, c.vitola, c.price_tier) / 100;
    prices.push(p);
    const bucket = p < 5 ? '<$5' : p < 8 ? '$5-8' : p < 12 ? '$8-12' : p < 18 ? '$12-18' : p < 25 ? '$18-25' : '$25+';
    priceStats[bucket] = (priceStats[bucket] || 0) + 1;
  }
  console.log('\n=== DISTRIBUTION ===');
  console.log(priceStats);
  console.log(`min: $${Math.min(...prices).toFixed(2)}, max: $${Math.max(...prices).toFixed(2)}, avg: $${(prices.reduce((a,b)=>a+b)/prices.length).toFixed(2)}`);

  if (process.argv.includes('--commit')) {
    console.log('\n=== UPDATING DATABASE ===');
    let success = 0, failed = 0;
    const BATCH = 50;
    for (let i = 0; i < cigars.length; i += BATCH) {
      const batch = cigars.slice(i, i + BATCH);
      await Promise.all(batch.map(async (c) => {
        const price_usd_cents = computePriceCents(c.brand, c.vitola, c.price_tier);
        const { error } = await sb
          .from('cigars')
          .update({ price_usd_cents })
          .eq('id', c.id);
        if (error) { failed++; console.error(`Update ${c.id} failed:`, error.message); }
        else success++;
      }));
      process.stdout.write(`\r  ${Math.min(i + BATCH, cigars.length)}/${cigars.length}`);
    }
    console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
  } else {
    console.log('\nDry run complete. Re-run with --commit to write to DB.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
