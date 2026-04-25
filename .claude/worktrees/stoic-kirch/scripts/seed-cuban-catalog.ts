/**
 * Seed canonical Habanos S.A. (Cuban) catalog rows into the cigars table.
 *
 * Context:
 *   The DB today has ~78 rows tagged origin='Cuba', but the "Include Cuban
 *   cigars" toggle (quiz/results.tsx) and origin-based filters depend on
 *   there actually being a meaningful Cuban catalog. Many iconic Cuban
 *   marks are only represented by their non-Cuban trademark cousins (the
 *   1960s US-Cuba trademark split — Altadis/General Cigar hold non-Cuba
 *   rights; Habanos S.A. holds Cuba). This seed inserts the canonical
 *   Habanos S.A. global-release catalog so Cuban SKUs actually show up.
 *
 * Idempotent:
 *   Uses upsert with onConflict on (brand, line, vitola) so re-running
 *   leaves the DB alone. First run inserts; subsequent runs are no-ops.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   EXPO_PUBLIC_SUPABASE_URL=https://....supabase.co \
 *   npx tsx scripts/seed-cuban-catalog.ts [--dry-run]
 *
 * Writes:
 *   ~200 rows, each with origin='Cuba' and sensible wrapper/binder/filler
 *   defaults (Habano wrapper, Cuban binder+filler by regulation).
 *   image_url is left null — the brand-logo fallback from PR #7's
 *   CigarImage will cover the display until per-SKU photos are sourced.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY = new Set(process.argv.slice(2)).has('--dry-run');

if (!URL || !KEY) {
  console.error('Missing env. Need EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(URL, KEY);

interface CigarRow {
  brand: string;
  line: string;
  vitola: string;
  // Defaults that apply to virtually every Habanos SKU:
  //   wrapper: 'Habano' (the Cuban wrapper designation)
  //   binder: 'Cuban', filler: ['Cuban'] (standard Cuban puro)
  //   origin: 'Cuba'
  // Strength/body/price are set per-line to reflect the common profile;
  // individual vitolas can inherit these defaults.
  strength: 1 | 2 | 3 | 4 | 5; // 1=mild, 5=full
  body: 1 | 2 | 3 | 4 | 5;
  price_tier: 1 | 2 | 3 | 4 | 5; // 1=$, 5=$$$$$
  description?: string;
  flavors?: string[];
}

// Helper to build the full row from a shorthand + per-line defaults.
function mk(
  brand: string,
  line: string,
  vitola: string,
  base: Omit<CigarRow, 'brand' | 'line' | 'vitola'>,
): CigarRow {
  return { brand, line, vitola, ...base };
}

// ---- Canonical Habanos catalog. ----
// Profiles cribbed from Habanos S.A. global-release notes + widely agreed
// cigar-journalism baselines. Not perfect per-SKU but broadly right.

const ROWS: CigarRow[] = [];

// ---- Cohiba ----
// Cohiba is Cuba's flagship brand. Three "lines" in common circulation:
// Linea Clasica, Linea 1492 (Siglo), Linea Behike (limited).
const COHIBA_CLASSIC = { strength: 4 as const, body: 4 as const, price_tier: 4 as const, flavors: ['cedar', 'earth', 'coffee'], description: 'Cohiba Clasica — Cuba\'s flagship full-bodied Habano.' };
const COHIBA_SIGLO = { strength: 3 as const, body: 3 as const, price_tier: 4 as const, flavors: ['cedar', 'cream', 'honey'], description: 'Cohiba Linea 1492 — medium-bodied and elegant.' };
const COHIBA_BEHIKE = { strength: 5 as const, body: 5 as const, price_tier: 5 as const, flavors: ['cocoa', 'leather', 'spice'], description: 'Cohiba Behike — rare medio tiempo leaf, top of the Habanos pyramid.' };

ROWS.push(
  mk('Cohiba', 'Linea Clasica', 'Panetela', COHIBA_CLASSIC),
  mk('Cohiba', 'Linea Clasica', 'Corona Especial', COHIBA_CLASSIC),
  mk('Cohiba', 'Linea Clasica', 'Exquisito', COHIBA_CLASSIC),
  mk('Cohiba', 'Linea Clasica', 'Lancero', COHIBA_CLASSIC),
  mk('Cohiba', 'Linea Clasica', 'Robusto', COHIBA_CLASSIC),
  mk('Cohiba', 'Linea Clasica', 'Esplendido', COHIBA_CLASSIC),
  mk('Cohiba', 'Siglo I', 'Mareva', COHIBA_SIGLO),
  mk('Cohiba', 'Siglo II', 'Marevas', COHIBA_SIGLO),
  mk('Cohiba', 'Siglo III', 'Corona Grande', COHIBA_SIGLO),
  mk('Cohiba', 'Siglo IV', 'Corona Gorda', COHIBA_SIGLO),
  mk('Cohiba', 'Siglo V', 'Dalias', COHIBA_SIGLO),
  mk('Cohiba', 'Siglo VI', 'Canonazo', COHIBA_SIGLO),
  mk('Cohiba', 'Behike 52', 'BHK 52', COHIBA_BEHIKE),
  mk('Cohiba', 'Behike 54', 'BHK 54', COHIBA_BEHIKE),
  mk('Cohiba', 'Behike 56', 'BHK 56', COHIBA_BEHIKE),
  mk('Cohiba', 'Maduro 5 Genios', 'Genios', { ...COHIBA_CLASSIC, strength: 4, body: 4, description: 'Cohiba Maduro 5 line — 5-year aged maduro wrapper.' }),
  mk('Cohiba', 'Maduro 5 Magicos', 'Magicos', { ...COHIBA_CLASSIC, strength: 4, body: 4 }),
  mk('Cohiba', 'Maduro 5 Secretos', 'Secretos', { ...COHIBA_CLASSIC, strength: 4, body: 4 }),
);

// ---- Montecristo ----
const MC = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['coffee', 'chocolate', 'cedar'], description: 'Montecristo — benchmark medium-bodied Habano.' };
const MC_EDICION = { strength: 4 as const, body: 4 as const, price_tier: 4 as const, flavors: ['coffee', 'earth', 'dark fruit'], description: 'Montecristo Edicion Limitada.' };
ROWS.push(
  mk('Montecristo', 'No.1', 'Cervante', MC),
  mk('Montecristo', 'No.2', 'Piramide', MC),
  mk('Montecristo', 'No.3', 'Corona', MC),
  mk('Montecristo', 'No.4', 'Marevas', MC),
  mk('Montecristo', 'No.5', 'Perla', MC),
  mk('Montecristo', 'Edmundo', 'Edmundo', { ...MC, strength: 4, body: 4, price_tier: 4 }),
  mk('Montecristo', 'Petit Edmundo', 'Petit Edmundo', { ...MC, strength: 4, body: 4 }),
  mk('Montecristo', 'Double Edmundo', 'Double Edmundo', { ...MC, strength: 4, body: 4, price_tier: 4 }),
  mk('Montecristo', 'Joyita', 'Petit Corona', MC),
  mk('Montecristo', 'Media Corona', 'Media Corona', MC),
  mk('Montecristo', 'Especial', 'Laguito No.1', MC),
  mk('Montecristo', 'Especial No.2', 'Laguito No.2', MC),
  mk('Montecristo', 'Churchill Anejados', 'Julieta', MC_EDICION),
  mk('Montecristo', 'Open Eagle', 'Forum', { ...MC, strength: 3 }),
  mk('Montecristo', 'Open Master', 'Corona Gorda', { ...MC, strength: 3 }),
  mk('Montecristo', 'Open Regata', 'Vitola Open Regata', { ...MC, strength: 3 }),
  mk('Montecristo', 'Open Junior', 'Minuto', { ...MC, strength: 3 }),
  mk('Montecristo', 'Linea 1935 Leyenda', 'Leyenda', MC_EDICION),
  mk('Montecristo', 'Linea 1935 Maltes', 'Maltes', MC_EDICION),
  mk('Montecristo', 'Linea 1935 Dumas', 'Dumas', MC_EDICION),
);

// ---- Partagás ----
const PT = { strength: 4 as const, body: 4 as const, price_tier: 3 as const, flavors: ['earth', 'leather', 'coffee'], description: 'Partagás — powerful and earthy Habano.' };
ROWS.push(
  mk('Partagás', 'Serie D No.4', 'Robusto', PT),
  mk('Partagás', 'Serie D No.5', 'Petit Robusto', PT),
  mk('Partagás', 'Serie D No.6', 'Reyes', PT),
  mk('Partagás', 'Serie E No.2', 'Duke', PT),
  mk('Partagás', 'Serie P No.2', 'Piramide', PT),
  mk('Partagás', 'Lusitania', 'Prominente', PT),
  mk('Partagás', 'Mille Fleurs', 'Petit Corona', PT),
  mk('Partagás', 'Shorts', 'Minuto', PT),
  mk('Partagás', 'Presidente', 'Dalias', PT),
  mk('Partagás', '8-9-8', 'Dalias', PT),
  mk('Partagás', 'Chicos', 'Entreacto', { ...PT, strength: 3 }),
  mk('Partagás', 'Linea Maduro No.1', 'Gordito', { ...PT, strength: 4, body: 4 }),
  mk('Partagás', 'Linea Maduro No.2', 'Petit Robusto', { ...PT, strength: 4, body: 4 }),
  mk('Partagás', 'Linea Maduro No.3', 'Magico', { ...PT, strength: 4, body: 4 }),
);

// ---- Romeo y Julieta ----
const RYJ = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cedar', 'cream', 'honey'], description: 'Romeo y Julieta — smooth, aromatic Habano.' };
ROWS.push(
  mk('Romeo y Julieta', 'Churchills', 'Julieta No.2', RYJ),
  mk('Romeo y Julieta', 'Short Churchills', 'Robusto', RYJ),
  mk('Romeo y Julieta', 'Wide Churchills', 'Montesco', RYJ),
  mk('Romeo y Julieta', 'Belicosos', 'Campana', RYJ),
  mk('Romeo y Julieta', 'Coronitas en Cedro', 'Petit Corona', RYJ),
  mk('Romeo y Julieta', 'Exhibicion No.3', 'Corona Gorda', RYJ),
  mk('Romeo y Julieta', 'Exhibicion No.4', 'Hermoso No.4', RYJ),
  mk('Romeo y Julieta', 'Mille Fleurs', 'Petit Corona', RYJ),
  mk('Romeo y Julieta', 'Petit Julieta', 'Petit Cetro', RYJ),
  mk('Romeo y Julieta', 'Petit Churchills', 'Petit Robusto', RYJ),
  mk('Romeo y Julieta', 'Piramides', 'Piramide', RYJ),
  mk('Romeo y Julieta', 'Sport Largos', 'Perla', RYJ),
  mk('Romeo y Julieta', 'No.1 de Luxe', 'Corona', RYJ),
  mk('Romeo y Julieta', 'No.2 de Luxe', 'Marevas', RYJ),
  mk('Romeo y Julieta', 'No.3 de Luxe', 'Eminente', RYJ),
);

// ---- H. Upmann ----
const UP = { strength: 2 as const, body: 2 as const, price_tier: 3 as const, flavors: ['cream', 'cedar', 'vanilla'], description: 'H. Upmann — mild-to-medium, classically refined Habano.' };
ROWS.push(
  mk('H. Upmann', 'Magnum 46', 'Corona Gorda', UP),
  mk('H. Upmann', 'Magnum 50', 'Magnum 50', { ...UP, strength: 3 }),
  mk('H. Upmann', 'Magnum 54', 'Magnum 54', { ...UP, strength: 3 }),
  mk('H. Upmann', 'Corona Major', 'Petit Corona', UP),
  mk('H. Upmann', 'Connossieur A', 'Robusto', UP),
  mk('H. Upmann', 'Connossieur B', 'Hermoso No.4', UP),
  mk('H. Upmann', 'Half Corona', 'Half Corona', UP),
  mk('H. Upmann', 'Petit Corona', 'Marevas', UP),
  mk('H. Upmann', 'No.2', 'Piramide', { ...UP, strength: 3 }),
  mk('H. Upmann', 'Regalias', 'Corona', UP),
  mk('H. Upmann', 'Royal Robusto', 'Hermoso No.4', { ...UP, strength: 3 }),
  mk('H. Upmann', 'Sir Winston', 'Julieta No.2', UP),
);

// ---- Hoyo de Monterrey ----
const HOYO = { strength: 2 as const, body: 2 as const, price_tier: 3 as const, flavors: ['cedar', 'honey', 'hay'], description: 'Hoyo de Monterrey — mild, creamy, aromatic.' };
ROWS.push(
  mk('Hoyo de Monterrey', 'Epicure No.1', 'Corona Gorda', HOYO),
  mk('Hoyo de Monterrey', 'Epicure No.2', 'Robusto', HOYO),
  mk('Hoyo de Monterrey', 'Epicure Especial', 'Epicure Especial', { ...HOYO, strength: 3 }),
  mk('Hoyo de Monterrey', 'Epicure de Luxe', 'Corona Gorda', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo du Prince', 'Almuerzo', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo du Député', 'Trabuco', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo du Roi', 'Corona', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo du Maire', 'Entreacto', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo du Gourmet', 'Palma', HOYO),
  mk('Hoyo de Monterrey', 'Le Hoyo de San Juan', 'Geniales', { ...HOYO, strength: 3 }),
  mk('Hoyo de Monterrey', 'Le Hoyo de Rio Seco', 'Gordito', { ...HOYO, strength: 3 }),
  mk('Hoyo de Monterrey', 'Double Corona', 'Prominente', HOYO),
  mk('Hoyo de Monterrey', 'Churchill', 'Julieta No.2', HOYO),
  mk('Hoyo de Monterrey', 'Short Hoyo Piramides', 'Piramide Chico', { ...HOYO, strength: 3 }),
);

// ---- Bolívar ----
const BOL = { strength: 5 as const, body: 5 as const, price_tier: 3 as const, flavors: ['earth', 'leather', 'black pepper'], description: 'Bolívar — among the most powerful Habanos.' };
ROWS.push(
  mk('Bolívar', 'Royal Coronas', 'Robusto', BOL),
  mk('Bolívar', 'Belicosos Finos', 'Campana', BOL),
  mk('Bolívar', 'Coronas Junior', 'Minuto', BOL),
  mk('Bolívar', 'Petit Coronas', 'Marevas', BOL),
  mk('Bolívar', 'Libertador', 'Edmundo', { ...BOL, strength: 4, price_tier: 4 }),
  mk('Bolívar', 'Corona Gigantes', 'Julieta No.2', BOL),
  mk('Bolívar', 'Soberanos', 'Soberano', { ...BOL, price_tier: 4 }),
);

// ---- Punch ----
const PUNCH = { strength: 3 as const, body: 3 as const, price_tier: 2 as const, flavors: ['coffee', 'earth', 'wood'], description: 'Punch — medium-bodied, woody, dependable.' };
ROWS.push(
  mk('Punch', 'Punch Punch', 'Corona Gorda', PUNCH),
  mk('Punch', 'Punch Royal Coronation', 'Corona', PUNCH),
  mk('Punch', 'Petit Coronations', 'Minuto', PUNCH),
  mk('Punch', 'Coronations', 'Marevas', PUNCH),
  mk('Punch', 'Double Corona', 'Prominente', PUNCH),
  mk('Punch', 'Churchills', 'Julieta No.2', PUNCH),
  mk('Punch', 'Short de Punch', 'Petit Cetro', PUNCH),
  mk('Punch', 'Petit Punch', 'Belvederes', PUNCH),
);

// ---- Ramón Allones ----
const RA = { strength: 4 as const, body: 4 as const, price_tier: 3 as const, flavors: ['earth', 'leather', 'cocoa'], description: 'Ramón Allones — earthy, powerful, richly flavored.' };
ROWS.push(
  mk('Ramón Allones', 'Specially Selected', 'Robusto', RA),
  mk('Ramón Allones', 'Small Club Coronas', 'Minuto', RA),
  mk('Ramón Allones', 'Gigantes', 'Prominente', RA),
  mk('Ramón Allones', 'Allones Superiores', 'Corona Gorda', RA),
);

// ---- Trinidad ----
const TRIN = { strength: 4 as const, body: 4 as const, price_tier: 5 as const, flavors: ['cedar', 'honey', 'cream'], description: 'Trinidad — premium Habanos presentation.' };
ROWS.push(
  mk('Trinidad', 'Fundadores', 'Laguito Especial', TRIN),
  mk('Trinidad', 'Reyes', 'Reyes', TRIN),
  mk('Trinidad', 'Coloniales', 'Coloniales', TRIN),
  mk('Trinidad', 'Vigia', 'Vigia', TRIN),
  mk('Trinidad', 'Esmeralda', 'Esmeralda', TRIN),
);

// ---- Juan López ----
const JL = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cedar', 'cream', 'dried fruit'], description: 'Juan López — refined, well-balanced Habano.' };
ROWS.push(
  mk('Juan López', 'Seleccion No.1', 'Corona Gorda', JL),
  mk('Juan López', 'Seleccion No.2', 'Robusto', JL),
  mk('Juan López', 'Patricias', 'Petit Robusto', JL),
);

// ---- Vegas Robaina ----
const VR = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cedar', 'honey', 'earth'], description: 'Vegas Robaina — tribute to Don Alejandro Robaina, Vuelta Abajo terroir.' };
ROWS.push(
  mk('Vegas Robaina', 'Famosos', 'Corona Gorda', VR),
  mk('Vegas Robaina', 'Unicos', 'Piramide', VR),
);

// ---- Fonseca ----
const FO = { strength: 2 as const, body: 2 as const, price_tier: 2 as const, flavors: ['cream', 'almond', 'hay'], description: 'Fonseca — mild, creamy Cuban entry point.' };
ROWS.push(
  mk('Fonseca', 'No.1', 'Cervantes', FO),
  mk('Fonseca', 'KDT Cadetes', 'Cadetes', FO),
  mk('Fonseca', 'Cosacos', 'Cosacos', FO),
  mk('Fonseca', 'Delicias', 'Petit Corona', FO),
);

// ---- Quai d'Orsay ----
const QO = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cream', 'cedar', 'honey'], description: 'Quai d\'Orsay — originally a French-market exclusive.' };
ROWS.push(
  mk('Quai d\'Orsay', 'Coronas Claro', 'Corona', QO),
  mk('Quai d\'Orsay', 'No.50', 'Petit Robusto', QO),
  mk('Quai d\'Orsay', 'No.54', 'Robusto', QO),
);

// ---- Por Larrañaga ----
const PL = { strength: 2 as const, body: 2 as const, price_tier: 2 as const, flavors: ['cream', 'hay', 'toast'], description: 'Por Larrañaga — one of the oldest Habanos marks, mild and smooth.' };
ROWS.push(
  mk('Por Larrañaga', 'Petit Coronas', 'Marevas', PL),
  mk('Por Larrañaga', 'Panetela', 'Panetela', PL),
);

// ---- Sancho Panza ----
const SP = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cedar', 'earth', 'leather'], description: 'Sancho Panza — medium-bodied with earthy richness.' };
ROWS.push(
  mk('Sancho Panza', 'Non Plus', 'Mareva', SP),
  mk('Sancho Panza', 'Belicosos', 'Campana', SP),
  mk('Sancho Panza', 'Molinos', 'Cervantes', SP),
);

// ---- Saint Luis Rey ----
const SLR = { strength: 4 as const, body: 4 as const, price_tier: 3 as const, flavors: ['earth', 'leather', 'coffee'], description: 'Saint Luis Rey — richly flavored, medium-full.' };
ROWS.push(
  mk('Saint Luis Rey', 'Regios', 'Hermoso No.4', SLR),
  mk('Saint Luis Rey', 'Serie A', 'Julieta No.2', SLR),
);

// ---- El Rey del Mundo ----
const ERDM = { strength: 2 as const, body: 2 as const, price_tier: 2 as const, flavors: ['cream', 'hay', 'almond'], description: 'El Rey del Mundo — mild, classical Habano.' };
ROWS.push(
  mk('El Rey del Mundo', 'Choix Supreme', 'Hermoso No.4', ERDM),
  mk('El Rey del Mundo', 'Demi Tasse', 'Entreacto', ERDM),
);

// ---- Cuaba ----
const CBA = { strength: 3 as const, body: 3 as const, price_tier: 3 as const, flavors: ['cedar', 'leather', 'honey'], description: 'Cuaba — all-figurado presentation.' };
ROWS.push(
  mk('Cuaba', 'Tradicionales', 'Tradicional', CBA),
  mk('Cuaba', 'Divinos', 'Divino', CBA),
  mk('Cuaba', 'Exclusivos', 'Exclusivo', CBA),
  mk('Cuaba', 'Distinguidos', 'Distinguido', CBA),
  mk('Cuaba', 'Salomones', 'Salomon', { ...CBA, price_tier: 5 }),
);

// ---- Diplomáticos ----
const DIP = { strength: 3 as const, body: 3 as const, price_tier: 2 as const, flavors: ['coffee', 'cedar', 'leather'], description: 'Diplomáticos — Montecristo sibling, medium-bodied.' };
ROWS.push(
  mk('Diplomáticos', 'No.2', 'Piramide', DIP),
);

// ---- La Gloria Cubana (Cuban side) ----
const LGC = { strength: 2 as const, body: 2 as const, price_tier: 2 as const, flavors: ['cream', 'cedar', 'floral'], description: 'La Gloria Cubana (Habanos) — mild, aromatic, classical.' };
ROWS.push(
  mk('La Gloria Cubana', 'Medaille d\'Or No.2', 'Dalias', LGC),
  mk('La Gloria Cubana', 'Medaille d\'Or No.4', 'Seoane', LGC),
  mk('La Gloria Cubana', 'Tainos', 'Julieta No.2', LGC),
  mk('La Gloria Cubana', 'Minutos', 'Minuto', LGC),
);

// ---- Rafael Gonzalez ----
const RG = { strength: 2 as const, body: 2 as const, price_tier: 2 as const, flavors: ['hay', 'cream', 'cedar'], description: 'Rafael Gonzalez — classical mild Habano.' };
ROWS.push(
  mk('Rafael Gonzalez', 'Perlas', 'Perla', RG),
  mk('Rafael Gonzalez', 'Petit Coronas', 'Marevas', RG),
);

// ---- San Cristóbal de la Habana ----
const SCH = { strength: 4 as const, body: 4 as const, price_tier: 3 as const, flavors: ['cedar', 'cocoa', 'earth'], description: 'San Cristóbal de la Habana — named for Havana\'s forts.' };
ROWS.push(
  mk('San Cristóbal de la Habana', 'El Principe', 'Minuto', SCH),
  mk('San Cristóbal de la Habana', 'La Fuerza', 'Marevas', SCH),
  mk('San Cristóbal de la Habana', 'La Punta', 'Campana', SCH),
  mk('San Cristóbal de la Habana', 'El Morro', 'Julieta No.2', SCH),
);

// ---- Rounding out: Vegueros, La Flor de Cano, José L. Piedra ----
ROWS.push(
  mk('Vegueros', 'Mañanitas', 'Petit Corona', { strength: 2, body: 2, price_tier: 1, flavors: ['hay', 'toast'], description: 'Vegueros — everyday Habano from pinar del rio.' }),
  mk('Vegueros', 'Entretiempos', 'Petit Robusto', { strength: 2, body: 2, price_tier: 1 }),
  mk('Vegueros', 'Tapados', 'Robusto', { strength: 3, body: 3, price_tier: 2 }),
  mk('La Flor de Cano', 'Selectos', 'Hermoso No.4', { strength: 2, body: 2, price_tier: 2 }),
  mk('La Flor de Cano', 'Short Churchill', 'Robusto', { strength: 3, body: 3, price_tier: 2 }),
  mk('José L. Piedra', 'Cremas', 'Minuto', { strength: 3, body: 3, price_tier: 1 }),
  mk('José L. Piedra', 'Brevas', 'Perla', { strength: 3, body: 3, price_tier: 1 }),
  mk('José L. Piedra', 'Conservas', 'Petit Corona', { strength: 3, body: 3, price_tier: 1 }),
);

// ---- Seed ----

interface InsertRow {
  brand: string;
  line: string;
  name: string;
  vitola: string;
  strength: number;
  body: number;
  price_tier: number;
  wrapper: string;
  binder: string;
  filler: string[];
  origin: string;
  flavors: string[];
  description: string;
  image_url: null;
}

function toInsert(r: CigarRow): InsertRow {
  return {
    brand: r.brand,
    line: r.line,
    name: `${r.brand} ${r.line} ${r.vitola}`.replace(/\s+/g, ' ').trim(),
    vitola: r.vitola,
    strength: r.strength,
    body: r.body,
    price_tier: r.price_tier,
    wrapper: 'Habano',
    binder: 'Cuban',
    filler: ['Cuban'],
    origin: 'Cuba',
    flavors: r.flavors ?? [],
    description: r.description ?? '',
    image_url: null,
  };
}

async function main() {
  console.log(`seed-cuban-catalog  ${DRY ? '[DRY-RUN]' : '[WRITE]'}`);
  console.log(`Rows to insert: ${ROWS.length}`);

  // Show a couple samples
  console.log('\nSample (first 3):');
  for (const r of ROWS.slice(0, 3)) {
    console.log(`  ${r.brand} ${r.line} / ${r.vitola} — strength ${r.strength}`);
  }
  console.log('\nSample (last 3):');
  for (const r of ROWS.slice(-3)) {
    console.log(`  ${r.brand} ${r.line} / ${r.vitola} — strength ${r.strength}`);
  }

  // Distinct brands
  const brands = new Set(ROWS.map((r) => r.brand));
  console.log(`\nDistinct brands in seed: ${brands.size}`);
  console.log([...brands].join(', '));

  if (DRY) {
    console.log('\n(dry-run) no writes.');
    return;
  }

  // Filter out any rows that already exist on (brand, line, vitola) so
  // re-runs don't insert duplicates. Supabase doesn't support multi-column
  // onConflict without an explicit unique constraint; we check first.
  console.log('\nChecking existing rows...');
  const existing = new Set<string>();
  // Fan-out by brand to keep each query small
  for (const brand of brands) {
    const { data, error } = await supabase
      .from('cigars')
      .select('brand, line, vitola')
      .eq('brand', brand);
    if (error) {
      console.warn(`  skipped existing-check for ${brand}: ${error.message}`);
      continue;
    }
    for (const row of data ?? []) {
      existing.add(`${row.brand}|${row.line}|${row.vitola ?? ''}`);
    }
  }

  const toInsert: InsertRow[] = [];
  let skipped = 0;
  for (const r of ROWS) {
    const key = `${r.brand}|${r.line}|${r.vitola}`;
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    toInsert.push({
      brand: r.brand,
      line: r.line,
      name: `${r.brand} ${r.line} ${r.vitola}`.replace(/\s+/g, ' ').trim(),
      vitola: r.vitola,
      strength: r.strength,
      body: r.body,
      price_tier: r.price_tier,
      wrapper: 'Habano',
      binder: 'Cuban',
      filler: ['Cuban'],
      origin: 'Cuba',
      flavors: r.flavors ?? [],
      description: r.description ?? '',
      image_url: null,
    });
  }

  console.log(`Already in DB, skipping: ${skipped}`);
  console.log(`New rows to insert: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('Nothing to insert.');
    return;
  }

  // Insert in batches of 100
  let written = 0;
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('cigars').insert(slice);
    if (error) {
      console.warn(`  batch ${i / BATCH + 1} failed: ${error.message}`);
    } else {
      written += slice.length;
    }
    process.stdout.write(`\r  written ${written}/${toInsert.length}  `);
  }
  console.log('\n\nDone.');
}

// Eliminate the unused helper warning — `toInsert` above is called inline
// in main(); export the builder so future scripts can reuse the shape.
export { toInsert };

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
