import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'fs';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BRAND_PRESTIGE: Record<string, number> = {
  'Davidoff': 0, 'Arturo Fuente': 0, 'Padron': 0, 'Liga Privada': 0, 'Cohiba': 0,
  'Ashton': 0, 'Sobremesa': 0, 'Muestra de Saka': 0, 'Dunbarton Tobacco & Trust': 0,
  'Casdagli': 0, 'Sin Compromiso': 0, 'Regius': 0, 'Principle': 0,
  'My Father': 1, 'Tatuaje': 1, 'Illusione': 1, 'AVO': 1, 'Avo': 1,
  'Warped': 1, 'Crowned Heads': 1, 'Herrera Esteli': 1, 'Aging Room': 1, 'Caldwell': 1,
  'Ezra Zion': 1, 'Foundation Cigar Co': 1, 'Ferio Tego': 1, 'La Flor Dominicana': 1,
  'Mi Querida': 1, 'Montecristo': 1, 'Romeo y Julieta': 1, 'Partagas': 1, 'H. Upmann': 1,
  'Punch': 1, 'La Gloria Cubana': 1, 'Hoyo de Monterrey': 1, 'San Cristobal': 1,
  'Bolivar': 1, 'Trinidad': 1, 'Dunhill': 1, 'RoMa Craft': 1, 'EP Carrillo': 1,
  'Plasencia': 1, 'Gurkha': 1, 'Viaje': 1,
  'Oliva': 2, 'Drew Estate': 2, 'Rocky Patel': 2, 'Perdomo': 2, 'Camacho': 2, 'CAO': 2,
  'Alec Bradley': 2, 'Alec & Bradley': 2, 'Tabak Especial': 2, 'Undercrown': 2,
  'Aladino': 2, 'Kristoff': 2, 'Crux': 2, 'Espinosa': 2, 'Fratello': 2, 'Southern Draw': 2,
  'Cornelius & Anthony': 2, 'La Palina': 2, 'La Aroma de Cuba': 2, 'Macanudo': 2,
  'Brick House': 2, 'La Herencia Cubana': 2, 'Joya de Nicaragua': 2, 'Diesel': 2,
  'Aganorsa Leaf': 2, 'Flor de las Antillas': 2, 'Todos Las Dias': 2, 'Mombacho': 2,
  'Henry Clay': 2, 'Black Label Trading Co': 2, 'ACE Prime': 2, 'Protocol': 2,
  'Dapper': 2, 'HVC': 2, 'Blackbird': 2, 'Eiroa': 2, 'Flores y Rodriguez': 2,
  'Casa Fernandez': 2, 'Balmoral': 2, 'Amendola': 2, 'All Saints': 2, 'La Barba': 2,
  'StillWell Star': 2, 'Rojas': 2, 'Saga': 2, 'San Lotano': 2, 'Acid': 2, 'Gran Habano': 2,
  'CLE': 3, 'Kentucky Fire Cured': 3, 'Nica Rustica': 3, 'Encore': 3, 'Ventura': 3,
  'New World': 3, 'Room 101': 3, 'Java': 3, 'Leaf by Oscar': 3, 'Nub': 3, 'Casa Magna': 3,
  'Ramon Bueso': 3, 'AJ Fernandez': 3, 'Villiger': 3, 'Sprocket': 3,
  'Charter Oak': 4,
};

const PRICE_MATRIX: number[][] = [
  [10.0, 14.0, 18.0, 24.0, 32.0],
  [7.5,  10.0, 13.0, 17.0, 23.0],
  [5.5,  7.5,  9.5,  12.0, 16.0],
  [4.0,  6.0,  8.0,  10.5, 14.0],
  [3.0,  4.5,  6.0,  8.0,  11.0],
];

const VITOLA_MULTIPLIERS: Record<string, number> = {
  'Petit Corona': 0.82, 'Small Panatela': 0.78, 'Panatela': 0.85, 'Lancero': 0.92,
  'Corona': 0.9, 'Cigarillo': 0.6, 'Corona Gorda': 0.96, 'Robusto': 1.0,
  'Rothschild': 0.98, 'Short Robusto': 0.92, 'Petit Robusto': 0.9, 'Belicoso': 1.05,
  'Piramide': 1.05, 'Piramides': 1.05, 'Pyramid': 1.05, 'Torpedo': 1.05,
  'Figurado': 1.08, 'Perfecto': 1.08, 'Toro': 1.1, 'Grand Toro': 1.12, 'Gran Toro': 1.12,
  'Sixty': 1.15, 'Gordo': 1.18, 'Double Robusto': 1.12, 'Churchill': 1.15,
  'Double Corona': 1.2, 'Presidente': 1.22, 'Prominente': 1.25, 'Salomon': 1.3,
  'Soberano': 1.3, 'Magnum': 1.2, 'A': 1.35,
};

function prestigeOf(brand: string): number {
  return brand in BRAND_PRESTIGE ? BRAND_PRESTIGE[brand] : 3;
}
function vitolaMultiplier(vitola: string | null): number {
  if (!vitola) return 1.0;
  if (vitola in VITOLA_MULTIPLIERS) return VITOLA_MULTIPLIERS[vitola];
  const v = vitola.toLowerCase();
  for (const [k, m] of Object.entries(VITOLA_MULTIPLIERS)) if (k.toLowerCase() === v) return m;
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
  const dollars = base * vitolaMultiplier(vitola);
  const rounded = Math.round(dollars * 4) / 4;
  return Math.round(rounded * 100);
}

async function main() {
  const cigars: { id: string; brand: string; vitola: string | null; price_tier: number }[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb
      .from('cigars')
      .select('id, brand, vitola, price_tier')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;
    cigars.push(...data);
    if (data.length < PAGE) break;
  }
  console.log(`Fetched ${cigars.length} cigars.`);

  const migration = readFileSync('supabase/migrations/006_cigar_prices_and_humidor_quantity.sql', 'utf-8');

  const lines: string[] = [];
  lines.push('-- Migration 006 + price seed');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('');
  lines.push(migration);
  lines.push('');
  lines.push('-- Bulk update cigar prices (CASE WHEN against id)');
  lines.push('UPDATE cigars SET price_usd_cents = CASE id');
  for (const c of cigars) {
    const cents = computePriceCents(c.brand, c.vitola, c.price_tier);
    lines.push(`  WHEN '${c.id}'::uuid THEN ${cents}`);
  }
  lines.push('END WHERE id IN (');
  lines.push(cigars.map(c => `'${c.id}'::uuid`).join(',\n'));
  lines.push(');');

  const out = lines.join('\n');
  writeFileSync('/tmp/stickpicks-price-seed.sql', out);
  console.log(`Wrote /tmp/stickpicks-price-seed.sql (${out.length} bytes, ${cigars.length} cigars)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
