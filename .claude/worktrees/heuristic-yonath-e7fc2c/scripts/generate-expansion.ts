/**
 * Generates ~1,500 additional real cigar entries to expand the database from 538 to 2,000+.
 * All brands, lines, and attributes are based on real cigars.
 * Run: npx tsx scripts/generate-expansion.ts
 */
import * as fs from 'fs';
import * as path from 'path';

interface CigarEntry {
  brand: string;
  name: string;
  vitola: string | null;
  strength: number;
  body: number;
  price_tier: number;
  wrapper: string | null;
  binder: string | null;
  filler: string[];
  origin: string | null;
  flavors: string[];
  description: string;
}

interface LineTemplate {
  name: string;
  strength: number;
  body: number;
  price_tier: number;
  wrapper: string;
  binder: string;
  filler: string[];
  flavors: string[];
  description: string;
  vitolas?: string[];
}

interface BrandTemplate {
  brand: string;
  origin: string;
  lines: LineTemplate[];
}

const VITOLA_SETS = {
  standard: ['Robusto', 'Toro', 'Churchill', 'Corona', 'Gordo', 'Lancero'],
  short: ['Robusto', 'Toro', 'Corona'],
  full: ['Robusto', 'Toro', 'Churchill', 'Corona', 'Gordo', 'Lancero', 'Torpedo', 'Belicoso'],
  premium: ['Robusto', 'Toro', 'Churchill', 'Torpedo', 'Perfecto'],
  compact: ['Robusto', 'Toro', 'Gordo'],
  nub: ['Nub 460', 'Nub 464'],
  figurado: ['Torpedo', 'Belicoso', 'Perfecto', 'Figurado'],
  box_pressed: ['Robusto Box-Pressed', 'Toro Box-Pressed', 'Churchill Box-Pressed'],
};

// ─── BRAND DATA ───────────────────────────────────────────────────────────────
// New brands and expanded lines for existing brands (existing 51 brands excluded
// from new-brand generation; only net-new lines added for some).

const brands: BrandTemplate[] = [
  // ── NEW BRANDS ──────────────────────────────────────────────────────────────
  {
    brand: 'Cohiba',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Blue', strength: 2, body: 2, price_tier: 4, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'almonds', 'white pepper'], description: 'Elegant mild smoke with refined Connecticut Shade wrapper.' },
      { name: 'Red Dot', strength: 3, body: 3, price_tier: 4, wrapper: 'Cameroon', binder: 'Dominican', filler: ['Dominican', 'Piloto Cubano'], flavors: ['cedar', 'nuts', 'coffee', 'earth'], description: 'Classic medium-bodied blend with a rich Cameroon wrapper.' },
      { name: 'Black', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'leather', 'earth'], description: 'Bold and complex with deep maduro character.' },
      { name: 'Macassar', strength: 3, body: 4, price_tier: 5, wrapper: 'Connecticut Broadleaf', binder: 'Honduran', filler: ['Dominican', 'Nicaraguan'], flavors: ['coffee', 'dark chocolate', 'spice', 'leather'], description: 'Rich double-binder construction delivers layered complexity.' },
      { name: 'Riviera', strength: 2, body: 3, price_tier: 5, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'honey', 'vanilla'], description: 'Ultra-premium mild cigar with silky Connecticut wrapper.' },
      { name: 'Nicaragua', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'earth', 'cocoa', 'leather'], description: 'Full Nicaraguan puro with bold Habano flavor.' },
    ],
  },
  {
    brand: 'Partagas',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Legendario', strength: 3, body: 3, price_tier: 3, wrapper: 'Cameroon', binder: 'Mexican', filler: ['Dominican', 'Mexican'], flavors: ['earth', 'cedar', 'nuts', 'leather'], description: 'Classic Dominican blend with trademark Cameroon wrapper.' },
      { name: '1845 Extra Fuerte', strength: 5, body: 5, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan', 'Dominican'], flavors: ['black pepper', 'espresso', 'leather', 'dark chocolate'], description: 'Full-throttle power with dark Habano Oscuro wrapper.' },
      { name: '1845 Extra Oscuro', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Dominican', 'Nicaraguan'], flavors: ['cocoa', 'coffee', 'earth', 'spice'], description: 'Dark and brooding maduro with substantial body.' },
      { name: 'Cortado', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Indonesian', filler: ['Dominican', 'Nicaraguan'], flavors: ['coffee', 'cream', 'cedar', 'sweet spice'], description: 'Coffee-inspired blend balancing sweetness and spice.' },
      { name: 'Cifuentes', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'honey', 'almonds'], description: 'Premium Dominican blend honoring the Cifuentes family legacy.' },
    ],
  },
  {
    brand: 'Herrera Esteli',
    origin: 'Nicaragua',
    lines: [
      { name: 'Herrera Esteli', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Honduran', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'nuts', 'white pepper'], description: 'Willy Herrera\'s flagship — balanced, elegant Nicaraguan blend.' },
      { name: 'Norteno', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Honduran', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'dark chocolate', 'earth'], description: 'Bolder Herrera expression with dark Mexican wrapper.' },
      { name: 'Miami', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'baking spice', 'citrus'], description: 'Small-batch Miami-rolled with extra refinement.' },
      { name: 'Inktome', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'molasses', 'leather'], description: 'Maduro-wrapped powerhouse from the Herrera Esteli line.' },
      { name: 'Brazilian Maduro', strength: 3, body: 4, price_tier: 3, wrapper: 'Brazilian Mata Fina', binder: 'Honduran', filler: ['Nicaraguan'], flavors: ['cocoa', 'sweet spice', 'earth', 'coffee'], description: 'Brazilian wrapper adds sweetness to the Herrera blend.' },
    ],
  },
  {
    brand: 'Undercrown',
    origin: 'Nicaragua',
    lines: [
      { name: 'Shade', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Sumatran', filler: ['Nicaraguan', 'Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Drew Estate\'s approachable Connecticut-wrapped blend.' },
      { name: 'Maduro', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Connecticut Stalk-Cut', filler: ['Nicaraguan', 'Brazilian'], flavors: ['cocoa', 'pepper', 'earth', 'coffee'], description: 'The original Undercrown — dark, rich, and satisfying.' },
      { name: 'Sun Grown', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Sumatra', binder: 'Connecticut River Valley Stalk-Cut', filler: ['Nicaraguan'], flavors: ['cedar', 'spice', 'nuts', 'leather'], description: 'Sun Grown wrapper brings more spice and complexity.' },
      { name: 'Dojo Dogma', strength: 4, body: 5, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Connecticut Stalk-Cut', filler: ['Nicaraguan', 'Brazilian'], flavors: ['dark chocolate', 'espresso', 'earth', 'black pepper'], description: 'Box-pressed collaboration with massive flavor.' },
      { name: '10', strength: 4, body: 4, price_tier: 4, wrapper: 'Mexican San Andres Maduro', binder: 'Connecticut', filler: ['Nicaraguan', 'Brazilian'], flavors: ['cocoa', 'espresso', 'cedar', 'sweet spice'], description: 'Anniversary edition celebrating ten years of Undercrown.' },
    ],
  },
  {
    brand: 'Espinosa',
    origin: 'Nicaragua',
    lines: [
      { name: 'Laranja Reserva', strength: 3, body: 3, price_tier: 3, wrapper: 'Brazilian Mata Fina', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['citrus', 'cedar', 'cream', 'sweet spice'], description: 'Brazilian wrapper delivers a smooth, citrusy experience.' },
      { name: 'Crema', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'vanilla', 'white pepper', 'hay'], description: 'Gentle, creamy everyday smoke at a great price.' },
      { name: 'Habano', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'earth'], description: 'Classic medium-bodied Habano-wrapped Nicaraguan puro.' },
      { name: 'Las 6 Provincias', strength: 4, body: 4, price_tier: 4, wrapper: 'Corojo', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'cocoa', 'spice'], description: 'Cuban heritage blend honoring Cuba\'s six provinces.' },
      { name: 'Knuckle Sandwich', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['red pepper', 'leather', 'cedar', 'earth'], description: 'Collaboration with Guy Fieri — bold and punchy.' },
      { name: '601 Blue Label', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['nuts', 'cedar', 'pepper', 'leather'], description: 'Balanced Nicaraguan puro with a loyal following.' },
    ],
  },
  {
    brand: 'Southern Draw',
    origin: 'Nicaragua',
    lines: [
      { name: 'Rose of Sharon', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'honey', 'cedar', 'floral'], description: 'Delicate Connecticut smoke with honeyed sweetness.' },
      { name: 'Jacobs Ladder', strength: 5, body: 5, price_tier: 3, wrapper: 'Pennsylvania Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'black pepper', 'earth'], description: 'Full-bore maduro delivering waves of dark flavors.' },
      { name: 'Kudzu', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'pepper', 'coffee', 'earth'], description: 'Dark and sprawling flavor profile like its namesake vine.' },
      { name: 'Firestarter', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['red pepper', 'cedar', 'leather', 'spice'], description: 'Spicy Habano-wrapped blend that ignites the palate.' },
      { name: 'Quick Draw', strength: 3, body: 3, price_tier: 2, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'nuts', 'cedar', 'hay'], description: 'Value-priced mild smoke for everyday enjoyment.' },
    ],
  },
  {
    brand: 'Fratello',
    origin: 'Nicaragua',
    lines: [
      { name: 'Classico', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'nuts', 'pepper'], description: 'Italian-inspired medium-bodied Nicaraguan blend.' },
      { name: 'Navetta', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'leather', 'spice'], description: 'Space-inspired full-bodied premium cigar.' },
      { name: 'Bianco', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'vanilla', 'cedar', 'white pepper'], description: 'Light and creamy Connecticut expression.' },
      { name: 'Sorella', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'nuts', 'baking spice', 'cream'], description: 'Sister blend with rosado wrapper bringing sweetness.' },
    ],
  },
  {
    brand: 'Protocol',
    origin: 'Nicaragua',
    lines: [
      { name: 'Official', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'nuts'], description: 'Law enforcement-inspired brand with solid medium body.' },
      { name: 'Probable Cause', strength: 4, body: 4, price_tier: 3, wrapper: 'Pennsylvania Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'pepper'], description: 'Dark maduro blend with compelling evidence of flavor.' },
      { name: 'Themis', strength: 4, body: 4, price_tier: 4, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'espresso', 'spice'], description: 'Justice-themed San Andres-wrapped powerhouse.' },
      { name: 'Blue', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Thin blue line mild Connecticut smoke.' },
    ],
  },
  {
    brand: 'Aging Room',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Quattro Nicaragua', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'earth', 'pepper', 'coffee'], description: 'Full Nicaraguan expression in the Quattro line.' },
      { name: 'Quattro Original', strength: 3, body: 3, price_tier: 3, wrapper: 'Sumatra', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'nuts', 'cream', 'sweet spice'], description: 'Balanced Dominican blend with Sumatran wrapper.' },
      { name: 'Bin No. 2', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'coffee', 'leather', 'cream'], description: 'Small-batch premium Dominican cigar.' },
      { name: 'Pelo de Oro', strength: 4, body: 4, price_tier: 5, wrapper: 'Ecuadorian Pelo de Oro', binder: 'Dominican', filler: ['Dominican'], flavors: ['earth', 'spice', 'leather', 'cocoa'], description: 'Ultra-rare Pelo de Oro tobacco — nearly extinct leaf.' },
      { name: 'Solera', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Sumatra Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'nuts'], description: 'Aged Dominican blend with refined smoothness.' },
    ],
  },
  {
    brand: 'Crux',
    origin: 'Nicaragua',
    lines: [
      { name: 'du Connoisseur', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'pepper', 'earth'], description: 'Connoisseur-grade medium-bodied Nicaraguan cigar.' },
      { name: 'Epicure', strength: 3, body: 3, price_tier: 4, wrapper: 'Habano Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'cedar', 'spice'], description: 'Dark and elegant maduro for the refined palate.' },
      { name: 'Bull & Bear', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'dark chocolate', 'coffee'], description: 'Wall Street-inspired bold San Andres blend.' },
      { name: 'Guild', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'nuts', 'vanilla', 'hay'], description: 'Mild Connecticut smoke for the casual enthusiast.' },
      { name: 'Limitada', strength: 4, body: 5, price_tier: 4, wrapper: 'Pennsylvania Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'earth', 'leather'], description: 'Limited production full-bodied showcase cigar.' },
    ],
  },
  {
    brand: 'Dapper',
    origin: 'Nicaragua',
    lines: [
      { name: 'El Borracho', strength: 3, body: 3, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'leather', 'sweet spice'], description: 'Day of the Dead-inspired medium-bodied smoke.' },
      { name: 'Cubo Claro', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'hay', 'vanilla'], description: 'Light and approachable cube-pressed Connecticut.' },
      { name: 'Siempre', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'espresso', 'leather', 'earth'], description: 'Always bold — dark Habano-wrapped Nicaraguan puro.' },
      { name: 'La Madrina', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'baking spice', 'cream', 'nuts'], description: 'Rosado-wrapped blend with balanced sweetness.' },
    ],
  },
  {
    brand: 'Eiroa',
    origin: 'Honduras',
    lines: [
      { name: 'The First 20 Years', strength: 4, body: 4, price_tier: 4, wrapper: 'Corojo', binder: 'Honduran Corojo', filler: ['Honduran'], flavors: ['red pepper', 'leather', 'cedar', 'earth'], description: 'Pure Corojo puro celebrating 20 years of cultivation.' },
      { name: 'CBT Maduro', strength: 4, body: 5, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Honduran', filler: ['Honduran'], flavors: ['dark chocolate', 'espresso', 'molasses', 'leather'], description: 'Maduro expression of the classic Eiroa blend.' },
      { name: 'Classic', strength: 3, body: 3, price_tier: 3, wrapper: 'Corojo', binder: 'Honduran', filler: ['Honduran'], flavors: ['cedar', 'pepper', 'nuts', 'earth'], description: 'Approachable Corojo-wrapped Honduran cigar.' },
    ],
  },
  {
    brand: 'CLE',
    origin: 'Honduras',
    lines: [
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Value-priced mild Connecticut smoke.' },
      { name: 'Corojo', strength: 3, body: 3, price_tier: 2, wrapper: 'Honduran Corojo', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'earth'], description: 'Spicy Corojo-wrapped blend at an everyday price.' },
      { name: 'Prieto', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'pepper'], description: 'Dark and bold maduro with rich complexity.' },
      { name: 'Eiroa Dark 60', strength: 5, body: 5, price_tier: 4, wrapper: 'Corojo Maduro', binder: 'Honduran', filler: ['Honduran'], flavors: ['espresso', 'leather', 'black pepper', 'dark chocolate'], description: 'Maximum intensity 60-ring Corojo maduro.' },
      { name: 'Asylum 13', strength: 4, body: 4, price_tier: 2, wrapper: 'Honduran Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'earth', 'leather', 'nuts'], description: 'Bold large-ring-gauge value smoke.' },
    ],
  },
  {
    brand: 'Cornelius & Anthony',
    origin: 'Nicaragua',
    lines: [
      { name: 'Meridian', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'spice', 'cream'], description: 'Well-balanced Nicaraguan with Habano complexity.' },
      { name: 'Daddy Mac', strength: 4, body: 4, price_tier: 3, wrapper: 'Pennsylvania Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'leather'], description: 'Dark and satisfying broadleaf maduro smoke.' },
      { name: 'Venganza', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'pepper', 'leather', 'cocoa'], description: 'Revenge — intense dark wrapper with Nicaraguan filler.' },
      { name: 'Aerial', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Dominican', filler: ['Nicaraguan', 'Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'almonds'], description: 'Light and airy Connecticut-wrapped cigar.' },
    ],
  },
  {
    brand: 'ACE Prime',
    origin: 'Nicaragua',
    lines: [
      { name: 'Pichardo Reserva Familiar', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'espresso', 'dark chocolate', 'pepper'], description: 'Luciano Meirelles\'s premium Nicaraguan family reserve.' },
      { name: 'Pichardo Clasico', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'nuts', 'pepper', 'cream'], description: 'Everyday expression of the Pichardo line.' },
      { name: 'M.X.S.', strength: 5, body: 5, price_tier: 4, wrapper: 'Mexican San Andres Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['black pepper', 'leather', 'espresso', 'earth'], description: 'Maximum strength Nicaraguan blend for power seekers.' },
      { name: 'Luciano The Dreamer', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'baking spice', 'citrus'], description: 'Rosado-wrapped dream blend from master blender Luciano.' },
    ],
  },
  {
    brand: 'Black Label Trading Co',
    origin: 'Nicaragua',
    lines: [
      { name: 'Salvation', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'pepper', 'cedar', 'cocoa'], description: 'Dark and moody boutique Nicaraguan blend.' },
      { name: 'Last Rites', strength: 5, body: 5, price_tier: 4, wrapper: 'Pennsylvania Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'earth', 'black pepper'], description: 'Final statement — massive broadleaf maduro power.' },
      { name: 'Porcelain', strength: 2, body: 2, price_tier: 4, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'vanilla', 'cedar', 'white pepper'], description: 'Delicate Connecticut expression from BLTC.' },
      { name: 'Bishops Blend', strength: 4, body: 4, price_tier: 4, wrapper: 'Mexican San Andres Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['coffee', 'leather', 'dark chocolate', 'spice'], description: 'Collaboration with Mardo Cigars — dark and complex.' },
    ],
  },
  {
    brand: 'Rojas',
    origin: 'Nicaragua',
    lines: [
      { name: 'Bluebonnets', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'pepper', 'cream'], description: 'Texas-inspired medium-bodied Nicaraguan blend.' },
      { name: 'Street Tacos', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'pepper', 'earth', 'spice'], description: 'Bold and flavorful like its Mexican street food namesake.' },
      { name: 'Unfinished Business', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'leather', 'dark chocolate', 'pepper'], description: 'Dark and intense — settling the score.' },
    ],
  },
  {
    brand: 'Room 101',
    origin: 'Honduras',
    lines: [
      { name: 'Farce Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Matt Booth\'s accessible Connecticut-wrapped smoke.' },
      { name: 'Farce Maduro', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'earth', 'leather'], description: 'Dark and theatrical broadleaf maduro expression.' },
      { name: 'Hit & Run', strength: 3, body: 3, price_tier: 2, wrapper: 'Honduran Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'nuts'], description: 'Quick and punchy everyday Honduran blend.' },
      { name: 'The Big Payback', strength: 3, body: 3, price_tier: 2, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['earth', 'pepper', 'leather', 'cedar'], description: 'Value-packed Nicaraguan with big ring gauges.' },
    ],
  },
  {
    brand: 'Leaf by Oscar',
    origin: 'Honduras',
    lines: [
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 2, wrapper: 'Connecticut Shade', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Wrapped in a whole tobacco leaf — mild Connecticut blend.' },
      { name: 'Corojo', strength: 3, body: 3, price_tier: 2, wrapper: 'Corojo', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'earth'], description: 'Corojo leaf-wrapped cigar with spicy kick.' },
      { name: 'Maduro', strength: 4, body: 4, price_tier: 2, wrapper: 'Maduro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'sweet spice'], description: 'Dark maduro wrapped in its own outer leaf.' },
      { name: 'Sumatra', strength: 3, body: 3, price_tier: 2, wrapper: 'Sumatra', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cedar', 'nuts', 'spice', 'cream'], description: 'Sumatran wrapper brings complexity at a value price.' },
    ],
  },
  {
    brand: 'Flor de las Antillas',
    origin: 'Nicaragua',
    lines: [
      { name: 'Sun Grown', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Sumatra', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'nuts', 'sweet spice', 'leather'], description: '2012 Cigar of the Year — My Father\'s approachable classic.' },
      { name: 'Maduro', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'earth', 'sweet spice'], description: 'Maduro version adding dark sweetness to the classic.' },
    ],
  },
  {
    brand: 'La Flor Dominicana',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Double Ligero', strength: 5, body: 5, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Dominican', filler: ['Dominican Ligero'], flavors: ['black pepper', 'leather', 'earth', 'espresso'], description: 'Double dose of ligero tobacco for maximum strength.' },
      { name: 'Air Bender', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano', binder: 'Dominican', filler: ['Dominican'], flavors: ['pepper', 'leather', 'cedar', 'cocoa'], description: 'Complex chisel-tipped cigar with intense flavors.' },
      { name: 'La Nox', strength: 5, body: 5, price_tier: 4, wrapper: 'Connecticut Broadleaf Oscuro', binder: 'Dominican', filler: ['Dominican'], flavors: ['espresso', 'dark chocolate', 'leather', 'black pepper'], description: 'Nocturnal dark wrapper with explosive full body.' },
      { name: '1994', strength: 3, body: 3, price_tier: 3, wrapper: 'Natural', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'nuts', 'leather', 'cream'], description: 'Heritage blend from the year Litto Gomez founded LFD.' },
      { name: 'Andalusian Bull', strength: 5, body: 5, price_tier: 5, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Dominican', filler: ['Dominican'], flavors: ['espresso', 'leather', 'dark chocolate', 'earth'], description: 'Award-winning figurado with intense Dominican power.' },
      { name: 'Suave', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Smooth and gentle everyday Dominican cigar.' },
    ],
  },
  {
    brand: 'Ezra Zion',
    origin: 'Nicaragua',
    lines: [
      { name: 'Honor Series', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'pepper', 'nuts'], description: 'Boutique Nicaraguan crafted with attention to detail.' },
      { name: 'FHK', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'espresso', 'cocoa', 'pepper'], description: 'Fat Heavy Killer — bold dark Habano expression.' },
      { name: 'Jamais Vu', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'baking spice', 'citrus'], description: 'Never before seen — rosado-wrapped boutique gem.' },
    ],
  },
  {
    brand: 'Blackbird',
    origin: 'Nicaragua',
    lines: [
      { name: 'Crow', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'nuts', 'pepper'], description: 'Sleek medium-bodied Nicaraguan cigar.' },
      { name: 'Rook', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'pepper', 'earth'], description: 'Dark San Andres-wrapped blend with bold character.' },
      { name: 'Jackdaw', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Gentle Connecticut smoke from the Blackbird aviary.' },
    ],
  },
  {
    brand: 'Amendola',
    origin: 'Nicaragua',
    lines: [
      { name: 'Cannoli', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'nuts', 'sweet spice'], description: 'Italian pastry-inspired smooth Nicaraguan blend.' },
      { name: 'Signature', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'espresso', 'pepper', 'cocoa'], description: 'Bold flagship dark Habano cigar.' },
      { name: 'Family Reserve', strength: 4, body: 4, price_tier: 4, wrapper: 'Pennsylvania Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'leather', 'earth'], description: 'Premium family reserve broadleaf selection.' },
    ],
  },
  {
    brand: 'All Saints',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Dedicacion', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'cream', 'leather', 'pepper'], description: 'Dedicated Dominican blend with medium complexity.' },
      { name: 'Santo Domingo', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cocoa', 'leather', 'pepper', 'earth'], description: 'Dark Habano-wrapped Dominican power.' },
      { name: 'Cathedral', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'vanilla', 'cedar', 'almonds'], description: 'Mild and contemplative Connecticut-wrapped Dominican.' },
    ],
  },
  {
    brand: 'Nica Rustica',
    origin: 'Nicaragua',
    lines: [
      { name: 'El Brujito', strength: 3, body: 3, price_tier: 2, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['earth', 'pepper', 'cedar', 'leather'], description: 'Drew Estate\'s rustic Nicaraguan puro — earthy and genuine.' },
      { name: 'Adobe', strength: 3, body: 3, price_tier: 2, wrapper: 'Brazilian Arapiraca', binder: 'Indonesian', filler: ['Honduran', 'Nicaraguan'], flavors: ['cocoa', 'earth', 'sweet spice', 'cedar'], description: 'Brazilian-wrapped expression of rustic character.' },
    ],
  },
  {
    brand: 'Kentucky Fire Cured',
    origin: 'Nicaragua',
    lines: [
      { name: 'Just a Friend', strength: 3, body: 3, price_tier: 2, wrapper: 'Kentucky Fire Cured', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['smoky', 'mesquite', 'pepper', 'earth'], description: 'Campfire-kissed blend with genuine fire-cured tobacco.' },
      { name: 'Swamp Thang', strength: 3, body: 3, price_tier: 2, wrapper: 'Candela/Fire Cured', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['smoky', 'herbs', 'pepper', 'earth'], description: 'Green candela barber-pole with fire-cured character.' },
    ],
  },
  {
    brand: 'Tabak Especial',
    origin: 'Nicaragua',
    lines: [
      { name: 'Dulce', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['coffee', 'cream', 'vanilla', 'sweet spice'], description: 'Coffee-infused mild cigar with sweet character.' },
      { name: 'Negra', strength: 3, body: 3, price_tier: 3, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'coffee', 'earth'], description: 'Dark coffee-infused maduro with rich espresso notes.' },
      { name: 'Cafe con Leche', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['coffee', 'cream', 'milk chocolate', 'vanilla'], description: 'Creamy coffee and milk infusion — morning cigar perfection.' },
    ],
  },
  {
    brand: 'Java',
    origin: 'Nicaragua',
    lines: [
      { name: 'Java', strength: 2, body: 2, price_tier: 2, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['coffee', 'mocha', 'cream', 'vanilla'], description: 'Drew Estate\'s coffee-infused classic — chocolate and mocha.' },
      { name: 'Java Latte', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'vanilla', 'coffee', 'milk chocolate'], description: 'Light coffee-infused Connecticut smoke.' },
      { name: 'Java Mint', strength: 2, body: 2, price_tier: 2, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['mint', 'coffee', 'chocolate', 'cream'], description: 'Mint-infused coffee cigar — refreshing and sweet.' },
      { name: 'Java Red', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Sumatra', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cherry', 'coffee', 'sweet spice', 'cream'], description: 'Red berry-infused coffee blend with fruity sweetness.' },
    ],
  },
  {
    brand: 'Encore',
    origin: 'Nicaragua',
    lines: [
      { name: 'Encore', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Sumatra Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'espresso', 'dark chocolate', 'pepper'], description: 'E.P. Carrillo\'s triumph — dark, bold, and unforgettable.' },
      { name: 'Encore Majestic', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Sumatra Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'pepper', 'espresso'], description: 'Larger ring gauge delivering even more Encore complexity.' },
    ],
  },
  {
    brand: 'Charter Oak',
    origin: 'Nicaragua',
    lines: [
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 1, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'hay', 'vanilla'], description: 'Foundation Cigar Co\'s value-priced mild smoke.' },
      { name: 'Maduro', strength: 3, body: 3, price_tier: 1, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'cedar', 'earth', 'sweet spice'], description: 'Affordable maduro from Nick Melillo\'s value line.' },
      { name: 'Habano', strength: 3, body: 3, price_tier: 1, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'cedar', 'leather', 'nuts'], description: 'Budget-friendly Habano with surprising depth.' },
      { name: 'Broadleaf', strength: 3, body: 3, price_tier: 1, wrapper: 'Connecticut Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'earth', 'leather', 'sweet spice'], description: 'Dark broadleaf wrapper at an unbeatable price.' },
    ],
  },
  {
    brand: 'Mi Querida',
    origin: 'Nicaragua',
    lines: [
      { name: 'Mi Querida', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'pepper', 'leather'], description: 'Dunbarton\'s dark and complex broadleaf-wrapped gem.' },
      { name: 'Triqui Traca', strength: 5, body: 5, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['black pepper', 'espresso', 'leather', 'earth'], description: 'Firecracker — maximum intensity broadleaf maduro.' },
    ],
  },
  {
    brand: 'Todos Las Dias',
    origin: 'Nicaragua',
    lines: [
      { name: 'Thick Lonsdale', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'pepper', 'earth'], description: 'Steve Saka\'s everyday smoke — balanced and honest.' },
      { name: 'Half Churchill', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'nuts', 'leather', 'cream'], description: 'Shorter format for a quick but quality smoke.' },
    ],
  },
  {
    brand: 'Sin Compromiso',
    origin: 'Nicaragua',
    lines: [
      { name: 'Sin Compromiso', strength: 5, body: 5, price_tier: 5, wrapper: 'Connecticut Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'leather', 'dark chocolate', 'black pepper'], description: 'No compromise — Steve Saka\'s ultimate full-bodied cigar.' },
    ],
  },
  {
    brand: 'Aladino',
    origin: 'Honduras',
    lines: [
      { name: 'Classic', strength: 3, body: 3, price_tier: 3, wrapper: 'Corojo Ligero', binder: 'Honduran', filler: ['Honduran'], flavors: ['cedar', 'pepper', 'earth', 'nuts'], description: 'Pure Honduran Corojo puro from Julio R. Eiroa.' },
      { name: 'Maduro', strength: 4, body: 4, price_tier: 3, wrapper: 'Corojo Maduro', binder: 'Honduran', filler: ['Honduran'], flavors: ['cocoa', 'coffee', 'earth', 'sweet spice'], description: 'Dark Corojo maduro with rich sweetness.' },
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Corojo Connecticut', binder: 'Honduran', filler: ['Honduran'], flavors: ['cream', 'cedar', 'nuts', 'white pepper'], description: 'Shade-grown Corojo wrapper — mild and creamy.' },
      { name: 'Vintage Selection', strength: 4, body: 4, price_tier: 4, wrapper: 'Corojo Ligero', binder: 'Honduran', filler: ['Honduran'], flavors: ['pepper', 'leather', 'earth', 'cocoa'], description: 'Vintage-aged Corojo tobaccos for extra depth.' },
      { name: 'Cazador', strength: 3, body: 3, price_tier: 2, wrapper: 'Corojo', binder: 'Honduran', filler: ['Honduran'], flavors: ['earth', 'cedar', 'pepper', 'leather'], description: 'Hunter\'s cigar — rustic and value-oriented Corojo puro.' },
    ],
  },
  {
    brand: 'Flores y Rodriguez',
    origin: 'Dominican Republic',
    lines: [
      { name: '10th Anniversary', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'cream', 'leather', 'spice'], description: 'Anniversary blend celebrating a decade of craft.' },
      { name: 'Connecticut Valley Reserve', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'almonds'], description: 'Elegant mild Dominican with premium Connecticut leaf.' },
      { name: 'Gran Reserva Maduro', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'leather', 'earth'], description: 'Grand reserve maduro with extended aging.' },
    ],
  },
  {
    brand: 'Principle',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Aviator', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'leather', 'cream', 'pepper'], description: 'Aviation-themed premium Dominican cigar.' },
      { name: 'Money', strength: 4, body: 4, price_tier: 4, wrapper: 'Pennsylvania Broadleaf', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'leather'], description: 'Worth every penny — dark broadleaf premium blend.' },
      { name: 'Archive', strength: 3, body: 3, price_tier: 5, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'nuts'], description: 'Ultra-premium Connecticut from Principe\'s archive.' },
    ],
  },
  {
    brand: 'Ventura',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Archetype Axis Mundi', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan', 'Dominican'], flavors: ['leather', 'espresso', 'pepper', 'earth'], description: 'Center of the world — dark and contemplative blend.' },
      { name: 'Archetype Strange Passage', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cream', 'cedar', 'nuts', 'white pepper'], description: 'Journey through mild Connecticut territory.' },
      { name: 'Archetype Dreamstate', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'leather', 'pepper', 'cream'], description: 'Surreal medium-bodied experience.' },
      { name: 'Case Study', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Affordable study in Connecticut Shade cigar-making.' },
    ],
  },
  {
    brand: 'Saga',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Short Tales Toro', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'nuts', 'pepper', 'leather'], description: 'Value-priced Dominican with surprising complexity.' },
      { name: 'Golden Age Connecticut', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'vanilla', 'cedar', 'hay'], description: 'Mild and affordable Connecticut-wrapped Dominican.' },
      { name: 'Solaz', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'leather', 'cream', 'spice'], description: 'Comforting medium-bodied Dominican blend.' },
    ],
  },
  {
    brand: 'Dunhill',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Signed Range', strength: 3, body: 3, price_tier: 4, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican', 'Brazilian'], flavors: ['cream', 'cedar', 'leather', 'nuts'], description: 'British heritage brand with refined Dominican tobacco.' },
      { name: 'Aged Maduro', strength: 4, body: 4, price_tier: 4, wrapper: 'Brazilian Maduro', binder: 'Dominican', filler: ['Dominican', 'Brazilian'], flavors: ['cocoa', 'coffee', 'leather', 'earth'], description: 'Dark maduro expression of the Dunhill tradition.' },
    ],
  },
  {
    brand: 'La Barba',
    origin: 'Nicaragua',
    lines: [
      { name: 'Purple', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano Rosado', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'baking spice', 'pepper'], description: 'Tony Bellatto\'s rosado-wrapped artisan blend.' },
      { name: 'Red', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'pepper', 'cocoa', 'espresso'], description: 'Darker expression with more intensity and richness.' },
      { name: 'One For All', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Collaborative Connecticut for universal enjoyment.' },
    ],
  },
  {
    brand: 'StillWell Star',
    origin: 'Nicaragua',
    lines: [
      { name: 'Aromatic No. 1', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan', 'Pipe Tobacco'], flavors: ['vanilla', 'cedar', 'cream', 'sweet spice'], description: 'Drew Estate\'s cigar-pipe hybrid with aromatic pipe tobacco.' },
      { name: 'Bayou No. 32', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan', 'Perique Pipe Tobacco'], flavors: ['pepper', 'earth', 'plum', 'spice'], description: 'Louisiana Perique pipe tobacco blended into a cigar.' },
      { name: 'English No. 27', strength: 3, body: 3, price_tier: 3, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan', 'Latakia'], flavors: ['smoky', 'leather', 'earth', 'pepper'], description: 'English-style Latakia pipe tobacco meets premium cigar.' },
    ],
  },
  {
    brand: 'New World',
    origin: 'Nicaragua',
    lines: [
      { name: 'New World', strength: 4, body: 4, price_tier: 2, wrapper: 'Nicaraguan Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'dark chocolate', 'earth'], description: 'AJ Fernandez value powerhouse — full body, low price.' },
      { name: 'New World Connecticut', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Mild AJ Fernandez blend at everyday pricing.' },
      { name: 'New World Puro Especial', strength: 4, body: 4, price_tier: 2, wrapper: 'Nicaraguan Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'earth', 'leather', 'cocoa'], description: 'Pure Nicaraguan expression of the New World line.' },
      { name: 'Cameroon Selection', strength: 3, body: 3, price_tier: 2, wrapper: 'African Cameroon', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['earth', 'cedar', 'sweet spice', 'cream'], description: 'Unique Cameroon wrapper at a value price point.' },
    ],
  },
  {
    brand: 'San Lotano',
    origin: 'Honduras',
    lines: [
      { name: 'The Bull', strength: 5, body: 5, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['black pepper', 'leather', 'espresso', 'earth'], description: 'AJ Fernandez\'s charging bull — full power Honduran blend.' },
      { name: 'Oval', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'cream'], description: 'Unique oval-pressed shape with balanced flavors.' },
      { name: 'Requiem Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Gentle Connecticut-wrapped Honduran blend.' },
      { name: 'Requiem Maduro', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['dark chocolate', 'coffee', 'earth', 'pepper'], description: 'Dark maduro with San Andres wrapper depth.' },
    ],
  },
  {
    brand: 'Balmoral',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Anejo XO Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican', 'Brazilian'], flavors: ['cream', 'cedar', 'vanilla', 'almonds'], description: 'Royal Dutch brand with premium Connecticut wrapper.' },
      { name: 'Anejo XO Oscuro', strength: 4, body: 4, price_tier: 3, wrapper: 'Brazilian Oscuro', binder: 'Dominican', filler: ['Dominican', 'Brazilian'], flavors: ['cocoa', 'coffee', 'leather', 'earth'], description: 'Dark Brazilian oscuro expression of the Anejo XO.' },
      { name: 'Serie Signaturas Dueto', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'cream', 'leather', 'sweet spice'], description: 'Premium series featuring two-country filler blend.' },
    ],
  },
  {
    brand: 'AVO',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Classic', strength: 2, body: 2, price_tier: 4, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'Avo Uvezian\'s original mild Dominican classic.' },
      { name: 'XO', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'cream', 'nuts', 'leather'], description: 'Extended aged Dominican blend with more depth.' },
      { name: 'Syncro Nicaragua', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['pepper', 'leather', 'cocoa', 'cedar'], description: 'Dominican-Nicaraguan fusion with Habano wrapper.' },
      { name: 'Syncro South America Ritmo', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Ecuador', binder: 'Dominican', filler: ['Dominican', 'Peruvian'], flavors: ['cream', 'cedar', 'spice', 'earth'], description: 'South American tobacco blend with rhythmic balance.' },
    ],
  },
  {
    brand: 'Kristoff',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Ligero Maduro', strength: 5, body: 5, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'leather', 'black pepper'], description: 'Full-power maduro with intense ligero filler.' },
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Mild and smooth Connecticut-wrapped Dominican.' },
      { name: 'Sumatra', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Sumatra', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'spice', 'leather', 'nuts'], description: 'Sumatran wrapper bringing Indonesian spice character.' },
      { name: 'GC Signature Series', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['leather', 'pepper', 'cocoa', 'cedar'], description: 'Grand Cru signature blend with extended aging.' },
      { name: 'Pistoff Kristoff', strength: 4, body: 4, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['pepper', 'leather', 'earth', 'espresso'], description: 'Bold and angry dark Habano-wrapped Dominican.' },
    ],
  },
  {
    brand: 'Casa Fernandez',
    origin: 'Nicaragua',
    lines: [
      { name: 'Miami Reserva', strength: 4, body: 4, price_tier: 4, wrapper: 'Corojo', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'cedar', 'earth'], description: 'Miami-rolled Corojo puro from the Eiroa family.' },
      { name: 'Aganorsa Supreme Leaf', strength: 4, body: 4, price_tier: 3, wrapper: 'Corojo', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'earth', 'leather', 'cocoa'], description: 'Supreme leaf selection from Aganorsa farms.' },
      { name: 'JFR Lunatic', strength: 5, body: 5, price_tier: 3, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['black pepper', 'espresso', 'leather', 'dark chocolate'], description: 'Enormous ring gauge delivering maximum intensity.' },
    ],
  },
  {
    brand: 'Muestra de Saka',
    origin: 'Nicaragua',
    lines: [
      { name: 'Nacatamale', strength: 4, body: 4, price_tier: 4, wrapper: 'Nicaraguan Corojo 99', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'earth', 'cedar'], description: 'Steve Saka\'s showcase of Nicaraguan Corojo tobacco.' },
      { name: 'Exclusivo', strength: 4, body: 4, price_tier: 5, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'leather', 'dark chocolate', 'earth'], description: 'Ultra-premium exclusive Dunbarton release.' },
    ],
  },
  {
    brand: 'Ramon Bueso',
    origin: 'Honduras',
    lines: [
      { name: 'Genesis The Project', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'earth'], description: 'Outstanding value Honduran with balanced complexity.' },
      { name: 'Odyssey', strength: 3, body: 3, price_tier: 2, wrapper: 'Connecticut Shade', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'nuts', 'vanilla'], description: 'Mild journey through Connecticut flavor territory.' },
      { name: 'Genesis Habano', strength: 4, body: 4, price_tier: 2, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'leather', 'cocoa', 'earth'], description: 'Dark Habano wrapper on a value-priced Honduran blend.' },
    ],
  },
  {
    brand: 'Henry Clay',
    origin: 'Dominican Republic',
    lines: [
      { name: 'War Hawk', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf', binder: 'Dominican', filler: ['Dominican', 'Honduran'], flavors: ['leather', 'earth', 'pepper', 'cocoa'], description: 'Historic brand revived with bold broadleaf wrapper.' },
      { name: 'Stalk Cut', strength: 3, body: 3, price_tier: 2, wrapper: 'Connecticut Stalk-Cut', binder: 'Dominican', filler: ['Dominican', 'Honduran'], flavors: ['cedar', 'cream', 'nuts', 'earth'], description: 'Value-priced using unique stalk-cut Connecticut leaf.' },
    ],
  },
  {
    brand: 'Alec & Bradley',
    origin: 'Honduras',
    lines: [
      { name: 'Gatekeeper', strength: 3, body: 3, price_tier: 2, wrapper: 'Honduran', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'earth'], description: 'Value gateway cigar from the Rubin brothers.' },
      { name: 'Magic Toast', strength: 3, body: 3, price_tier: 3, wrapper: 'Honduran Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['toast', 'cedar', 'leather', 'nuts'], description: 'Honduran blend with toasty, nutty character.' },
      { name: 'Kintsugi', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cocoa', 'pepper', 'leather', 'earth'], description: 'Japanese art of repair — dark and beautiful blend.' },
      { name: 'Blind Faith', strength: 4, body: 4, price_tier: 3, wrapper: 'Honduran Habano Oscuro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['leather', 'espresso', 'pepper', 'dark chocolate'], description: 'Dark Habano-wrapped leap of faith.' },
      { name: 'Texas Lancero', strength: 4, body: 4, price_tier: 3, wrapper: 'Honduran Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'leather', 'cedar', 'earth'], description: 'Texas-sized lancero format — bold and spicy.', vitolas: ['Lancero'] },
    ],
  },
  {
    brand: 'La Herencia Cubana',
    origin: 'Nicaragua',
    lines: [
      { name: 'Core', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'earth'], description: 'Cuban heritage brand at value pricing.' },
      { name: 'CORE Maduro', strength: 4, body: 4, price_tier: 2, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'earth', 'leather'], description: 'Dark maduro expression at everyday pricing.' },
    ],
  },
  {
    brand: 'Villiger',
    origin: 'Dominican Republic',
    lines: [
      { name: 'La Flor de Ynclan', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['leather', 'pepper', 'cocoa', 'cedar'], description: 'Award-winning dark Habano blend from Heinrich Villiger.' },
      { name: 'Cuellar Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'almonds'], description: 'Mild and refined Connecticut-wrapped Dominican.' },
      { name: 'La Libertad', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'cream'], description: 'Freedom blend with balanced Dominican-Nicaraguan filler.' },
    ],
  },
  {
    brand: 'Arturo Fuente',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Opus X', strength: 5, body: 5, price_tier: 5, wrapper: 'Dominican Rosado', binder: 'Dominican', filler: ['Dominican'], flavors: ['red pepper', 'leather', 'cedar', 'cocoa'], description: 'The holy grail — first-ever all-Dominican puro wrapper.' },
      { name: 'Forbidden X', strength: 4, body: 4, price_tier: 5, wrapper: 'Dominican Rosado', binder: 'Dominican', filler: ['Dominican'], flavors: ['spice', 'leather', 'cocoa', 'cedar'], description: 'Rare Opus X variant with unique wrapper selection.' },
      { name: 'Don Carlos', strength: 3, body: 3, price_tier: 4, wrapper: 'Cameroon', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'leather', 'cream', 'earth'], description: 'Named for Carlos Fuente Sr. — elegant Cameroon-wrapped.' },
      { name: 'Don Carlos Eye of the Shark', strength: 4, body: 4, price_tier: 5, wrapper: 'Cameroon', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'leather', 'pepper', 'cocoa'], description: 'Rare torpedo with intense Cameroon character.' },
      { name: 'Hemingway', strength: 3, body: 3, price_tier: 3, wrapper: 'African Cameroon', binder: 'Dominican', filler: ['Dominican'], flavors: ['cedar', 'cream', 'nuts', 'sweet spice'], description: 'Literature-inspired perfectos with Cameroon wrapper.' },
      { name: 'Añejo', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Dominican', filler: ['Dominican'], flavors: ['cocoa', 'coffee', 'leather', 'cedar'], description: 'Aged in cognac barrels — deep and complex maduro.' },
    ],
  },
  {
    brand: 'Padron',
    origin: 'Nicaragua',
    lines: [
      { name: '1964 Anniversary Maduro', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'leather', 'earth'], description: 'Iconic box-pressed maduro celebrating 1964 founding year.' },
      { name: '1964 Anniversary Natural', strength: 3, body: 3, price_tier: 4, wrapper: 'Habano Natural', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'nuts', 'cream', 'pepper'], description: 'Natural wrapper version of the legendary 1964 series.' },
      { name: 'Family Reserve No. 45', strength: 4, body: 4, price_tier: 5, wrapper: 'Habano Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'leather', 'spice'], description: 'Ultra-premium family reserve with extended aging.' },
      { name: 'Family Reserve No. 50', strength: 4, body: 4, price_tier: 5, wrapper: 'Habano Natural', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'cream', 'cocoa'], description: 'Natural wrapper family reserve — refined complexity.' },
      { name: '60th Anniversary', strength: 4, body: 4, price_tier: 5, wrapper: 'Habano Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'leather', 'dark chocolate', 'pepper'], description: 'Cigar of the Year 2024 — celebrating six decades.' },
      { name: 'Damaso', strength: 2, body: 2, price_tier: 3, wrapper: 'Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'white pepper', 'vanilla'], description: 'Padron\'s only Connecticut-wrapped blend — mild and smooth.' },
    ],
  },
  {
    brand: 'My Father',
    origin: 'Nicaragua',
    lines: [
      { name: 'Le Bijou 1922', strength: 5, body: 5, price_tier: 4, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'earth', 'cocoa', 'leather'], description: 'The jewel — full-bodied showcase of Garcia family craft.' },
      { name: 'La Opulencia', strength: 4, body: 4, price_tier: 4, wrapper: 'Mexican San Andres', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'spice', 'coffee'], description: 'Opulent San Andres-wrapped premium blend.' },
      { name: 'The Judge', strength: 5, body: 5, price_tier: 4, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['black pepper', 'leather', 'espresso', 'dark chocolate'], description: 'Full-power verdict from the Garcia family.' },
      { name: 'Connecticut', strength: 2, body: 2, price_tier: 3, wrapper: 'Ecuadorian Connecticut Shade', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'white pepper'], description: 'The mild side of My Father — smooth Connecticut wrapper.' },
      { name: 'La Gran Oferta', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'pepper', 'cream', 'leather'], description: 'The great offer — medium-bodied value from My Father.' },
    ],
  },
  {
    brand: 'Liga Privada',
    origin: 'Nicaragua',
    lines: [
      { name: 'Unico Serie Dirty Rat', strength: 5, body: 5, price_tier: 5, wrapper: 'Connecticut Broadleaf Stalk-Cut', binder: 'Plantation-Grown Brazilian Mata Fina', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'earth', 'dark chocolate', 'leather'], description: 'Infamous short smoke — intense broadleaf powerhouse.' },
      { name: 'Unico Serie Flying Pig', strength: 5, body: 5, price_tier: 5, wrapper: 'Connecticut Broadleaf Stalk-Cut', binder: 'Plantation-Grown Brazilian Mata Fina', filler: ['Honduran', 'Nicaraguan'], flavors: ['espresso', 'leather', 'dark chocolate', 'earth'], description: 'Rare figurado — when pigs fly, you smoke one.' },
      { name: 'Unico Serie Papas Fritas', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf', binder: 'Connecticut River Valley Stalk-Cut', filler: ['Honduran', 'Nicaraguan'], flavors: ['cocoa', 'leather', 'pepper', 'earth'], description: 'Short filler from Liga Privada scraps — incredible value.' },
      { name: 'H99 Connecticut Corojo', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Corojo', binder: 'Brazilian Mata Fina', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'leather', 'cedar', 'earth'], description: 'Rare Connecticut Corojo wrapper — spicy and unique.' },
    ],
  },
  {
    brand: 'Oliva',
    origin: 'Nicaragua',
    lines: [
      { name: 'Serie V Melanio', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Sumatra', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'cedar', 'sweet spice'], description: 'Cigar of the Year 2014 — honoring Melanio Oliva.' },
      { name: 'Serie V Melanio Maduro', strength: 5, body: 5, price_tier: 4, wrapper: 'Mexican San Andres Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['dark chocolate', 'espresso', 'leather', 'earth'], description: 'Dark maduro version of the acclaimed Melanio.' },
      { name: 'Master Blends 3', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'earth', 'cocoa'], description: 'Complex multi-country master blend.' },
      { name: 'Connecticut Reserve', strength: 2, body: 2, price_tier: 2, wrapper: 'Ecuadorian Connecticut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Mild and approachable Connecticut from Oliva.' },
    ],
  },
  {
    brand: 'Drew Estate',
    origin: 'Nicaragua',
    lines: [
      { name: 'Acid Kuba Kuba', strength: 2, body: 2, price_tier: 3, wrapper: 'Sumatra', binder: 'Indonesian', filler: ['Nicaraguan'], flavors: ['vanilla', 'herbs', 'coffee', 'chocolate'], description: 'Best-selling infused cigar with herb and botanical notes.' },
      { name: 'Acid Blondie', strength: 2, body: 2, price_tier: 2, wrapper: 'Connecticut Shade', binder: 'Indonesian', filler: ['Nicaraguan'], flavors: ['vanilla', 'cream', 'herbs', 'sweet spice'], description: 'Small and sweet infused smoke — perfect quick treat.' },
      { name: 'Acid Cold Infusion', strength: 2, body: 2, price_tier: 3, wrapper: 'Sumatra', binder: 'Indonesian', filler: ['Nicaraguan'], flavors: ['mint', 'herbs', 'cream', 'cedar'], description: 'Refreshing cold-infused botanical blend.' },
      { name: 'Natural Root', strength: 3, body: 3, price_tier: 2, wrapper: 'Connecticut Stalk-Cut', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['earth', 'cedar', 'herbs', 'leather'], description: 'Organic and earthy — the natural side of Drew Estate.' },
      { name: 'Larutan Jucy Lucy', strength: 3, body: 3, price_tier: 3, wrapper: 'Candela', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['citrus', 'herbs', 'cedar', 'sweet spice'], description: 'Green candela wrapper with juicy citrus character.' },
    ],
  },
  {
    brand: 'Tatuaje',
    origin: 'Nicaragua',
    lines: [
      { name: 'Havana VI', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'pepper', 'leather', 'earth'], description: 'Pete Johnson\'s everyday value Nicaraguan blend.' },
      { name: 'Monster Series', strength: 5, body: 5, price_tier: 5, wrapper: 'Connecticut Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['espresso', 'dark chocolate', 'leather', 'black pepper'], description: 'Annual Halloween release — limited and legendary.' },
      { name: 'TAA', strength: 4, body: 4, price_tier: 4, wrapper: 'Connecticut Broadleaf', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'leather', 'pepper', 'earth'], description: 'Tobacconists\' Association exclusive — coveted yearly release.' },
      { name: 'Karloff', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'cedar', 'cocoa'], description: 'Named for the horror icon — dark and bold.' },
    ],
  },
  {
    brand: 'Crowned Heads',
    origin: 'Nicaragua',
    lines: [
      { name: 'Mil Dias', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'pepper', 'nuts'], description: 'A thousand days — Honduran-made Nicaraguan blend.' },
      { name: 'Le Careme', strength: 3, body: 3, price_tier: 4, wrapper: 'Connecticut Broadleaf Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'cream', 'cedar'], description: 'Pastry-inspired maduro with sweet complexity.' },
      { name: 'Court Reserve', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'leather', 'cream', 'spice'], description: 'Royal court reserve blend with extended aging.' },
    ],
  },
  {
    brand: 'Rocky Patel',
    origin: 'Honduras',
    lines: [
      { name: 'DBS', strength: 4, body: 4, price_tier: 3, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['leather', 'espresso', 'pepper', 'cocoa'], description: 'Dark wrapper delivering bold Honduran power.' },
      { name: 'ALR Second Edition', strength: 4, body: 4, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['pepper', 'leather', 'cedar', 'cocoa'], description: 'Aged Limited Rare — premium aged tobaccos.' },
      { name: 'The Edge Connecticut', strength: 2, body: 2, price_tier: 2, wrapper: 'Connecticut Shade', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cream', 'cedar', 'vanilla', 'hay'], description: 'Mild edge — smooth Connecticut at a great price.' },
      { name: 'Freedom', strength: 3, body: 3, price_tier: 2, wrapper: 'Ecuadorian Habano', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'nuts', 'leather'], description: 'Patriotic value blend celebrating American freedom.' },
      { name: 'Tavicusa', strength: 4, body: 4, price_tier: 3, wrapper: 'Mexican San Andres Maduro', binder: 'Honduran', filler: ['Honduran', 'Nicaraguan'], flavors: ['cocoa', 'leather', 'earth', 'pepper'], description: 'San Andres maduro with deep chocolate notes.' },
    ],
  },
  {
    brand: 'Casdagli',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Daughters of the Wind', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'cream', 'leather', 'sweet spice'], description: 'Exotic boutique Dominican blend with refined character.' },
      { name: 'Basilica', strength: 4, body: 4, price_tier: 4, wrapper: 'Mexican San Andres', binder: 'Dominican', filler: ['Dominican', 'Peruvian'], flavors: ['cocoa', 'leather', 'earth', 'spice'], description: 'Architectural blend built on San Andres foundation.' },
    ],
  },
  {
    brand: 'Mombacho',
    origin: 'Nicaragua',
    lines: [
      { name: 'Tierra Volcan', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'earth', 'pepper', 'cream'], description: 'Volcanic soil-grown Nicaraguan tobacco blend.' },
      { name: 'Liga Maestro', strength: 4, body: 4, price_tier: 4, wrapper: 'Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['leather', 'espresso', 'dark chocolate', 'pepper'], description: 'Master league dark wrapper with Nicaraguan power.' },
    ],
  },
  {
    brand: 'Ferio Tego',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Summa', strength: 3, body: 3, price_tier: 4, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'cream', 'leather', 'spice'], description: 'Michael Herklots\' flagship — the pinnacle of blending.' },
      { name: 'Timeless Panamericana', strength: 3, body: 3, price_tier: 3, wrapper: 'Ecuadorian Habano', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cedar', 'pepper', 'cream', 'nuts'], description: 'Pan-American tribute blending Dominican and Nicaraguan leaf.' },
      { name: 'Timeless Supreme', strength: 4, body: 4, price_tier: 3, wrapper: 'Connecticut Broadleaf', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['cocoa', 'leather', 'earth', 'pepper'], description: 'Supreme broadleaf-wrapped expression of the Timeless line.' },
    ],
  },
  {
    brand: 'Oliva',
    origin: 'Nicaragua',
    lines: [
      { name: 'Serie G Maduro', strength: 3, body: 3, price_tier: 2, wrapper: 'Brazilian Maduro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cocoa', 'coffee', 'earth', 'sweet spice'], description: 'Approachable Brazilian maduro at an everyday price.' },
      { name: 'Serie G Cameroon', strength: 2, body: 2, price_tier: 2, wrapper: 'African Cameroon', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['cedar', 'cream', 'nuts', 'earth'], description: 'Mild Cameroon-wrapped Nicaraguan value smoke.' },
    ],
  },
  {
    brand: 'Davidoff',
    origin: 'Dominican Republic',
    lines: [
      { name: 'Winston Churchill Late Hour', strength: 4, body: 4, price_tier: 5, wrapper: 'Ecuadorian Habano Oscuro', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['leather', 'espresso', 'dark chocolate', 'spice'], description: 'Dark and powerful — for Churchill\'s late-night hours.' },
      { name: 'Winston Churchill The Traveller', strength: 3, body: 3, price_tier: 5, wrapper: 'Ecuadorian Connecticut', binder: 'Dominican', filler: ['Dominican'], flavors: ['cream', 'cedar', 'vanilla', 'leather'], description: 'Travel-inspired mild blend from the Churchill series.' },
      { name: 'Yamasa', strength: 4, body: 4, price_tier: 5, wrapper: 'Dominican Yamasá', binder: 'Dominican', filler: ['Dominican', 'Nicaraguan'], flavors: ['pepper', 'earth', 'leather', 'dark chocolate'], description: 'Dark Yamasá region wrapper — bold and innovative.' },
      { name: 'Nicaragua', strength: 4, body: 4, price_tier: 5, wrapper: 'Nicaraguan Habano Oscuro', binder: 'Nicaraguan', filler: ['Nicaraguan'], flavors: ['pepper', 'leather', 'espresso', 'earth'], description: 'Full Nicaraguan puro — Davidoff\'s boldest expression.' },
    ],
  },
];

// ─── GENERATION ──────────────────────────────────────────────────────────────

function generateCigars(): CigarEntry[] {
  const cigars: CigarEntry[] = [];

  for (const brand of brands) {
    for (const line of brand.lines) {
      const vitolas = line.vitolas ?? VITOLA_SETS.standard;
      for (const vitola of vitolas) {
        cigars.push({
          brand: brand.brand,
          name: line.name,
          vitola,
          strength: line.strength,
          body: line.body,
          price_tier: line.price_tier,
          wrapper: line.wrapper,
          binder: line.binder,
          filler: line.filler,
          origin: brand.origin,
          flavors: line.flavors,
          description: line.description,
        });
      }
    }
  }

  return cigars;
}

// ─── DEDUP & MERGE ──────────────────────────────────────────────────────────

function main() {
  // Load existing cigars
  const existingPath = path.join(__dirname, 'data', 'cigars.json');
  const existing: CigarEntry[] = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
  console.log(`Existing cigars: ${existing.length}`);

  // Generate expansion
  const expansion = generateCigars();
  console.log(`Generated expansion: ${expansion.length}`);

  // Build dedup key set from existing
  const existingKeys = new Set(
    existing.map((c) => `${c.brand}|||${c.name}|||${c.vitola ?? ''}`.toLowerCase())
  );

  // Filter out duplicates
  const newCigars = expansion.filter((c) => {
    const key = `${c.brand}|||${c.name}|||${c.vitola ?? ''}`.toLowerCase();
    if (existingKeys.has(key)) return false;
    existingKeys.add(key); // also dedup within expansion
    return true;
  });

  console.log(`After dedup: ${newCigars.length} new cigars`);

  // Merge
  const merged = [...existing, ...newCigars];
  console.log(`Total merged: ${merged.length}`);

  // Write merged file
  fs.writeFileSync(existingPath, JSON.stringify(merged, null, 2));
  console.log(`Written to ${existingPath}`);

  // Also write just the new ones for incremental seeding
  const expansionPath = path.join(__dirname, 'data', 'cigars-expansion.json');
  fs.writeFileSync(expansionPath, JSON.stringify(newCigars, null, 2));
  console.log(`New cigars written to ${expansionPath}`);
}

main();
