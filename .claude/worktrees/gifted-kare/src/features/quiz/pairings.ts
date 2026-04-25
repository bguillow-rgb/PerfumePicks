import type { Cigar } from '@/src/types/cigar';

export interface DrinkPairing {
  drink: string;
  category: 'whiskey' | 'rum' | 'wine' | 'beer' | 'coffee' | 'other';
  reason: string;
}

// Flavor keywords mapped to drink affinities
const FLAVOR_DRINK_MAP: Record<string, DrinkPairing[]> = {
  // Sweet / creamy
  cream: [
    { drink: 'Café Latte', category: 'coffee', reason: 'Creamy milk balances the smoke' },
    { drink: 'Irish Cream Liqueur', category: 'other', reason: 'Echoes the creamy sweetness' },
  ],
  vanilla: [
    { drink: 'Bourbon', category: 'whiskey', reason: 'Vanilla notes in the oak complement each other' },
    { drink: 'Cream Soda', category: 'other', reason: 'Amplifies the vanilla sweetness' },
  ],
  caramel: [
    { drink: 'Aged Rum', category: 'rum', reason: 'Caramel in both creates a rich harmony' },
    { drink: 'Macchiato', category: 'coffee', reason: 'Caramel and espresso mirror the sweetness' },
  ],
  honey: [
    { drink: 'Mead', category: 'other', reason: 'Honey meets honey — a natural pairing' },
    { drink: 'Cognac', category: 'whiskey', reason: 'Fruity sweetness matches the honey notes' },
  ],
  chocolate: [
    { drink: 'Espresso', category: 'coffee', reason: 'Dark roast meets dark chocolate' },
    { drink: 'Stout', category: 'beer', reason: 'Roasted malt echoes the chocolate' },
    { drink: 'Port', category: 'wine', reason: 'Rich and sweet — a classic pairing' },
  ],
  cocoa: [
    { drink: 'Mocha', category: 'coffee', reason: 'Cocoa on cocoa — a perfect match' },
    { drink: 'Barrel-Aged Stout', category: 'beer', reason: 'Deep roast character aligns beautifully' },
  ],

  // Earthy / woody
  earth: [
    { drink: 'Scotch (Highland)', category: 'whiskey', reason: 'Earthy peat and smoke harmonize' },
    { drink: 'Red Burgundy', category: 'wine', reason: 'Earthy Pinot Noir is a natural complement' },
  ],
  leather: [
    { drink: 'Rye Whiskey', category: 'whiskey', reason: 'Spicy rye matches the rugged leather' },
    { drink: 'Turkish Coffee', category: 'coffee', reason: 'Bold and unfiltered — matches the intensity' },
  ],
  cedar: [
    { drink: 'Cabernet Sauvignon', category: 'wine', reason: 'Cedar and oak-aged wine share the same wood notes' },
    { drink: 'Old Fashioned', category: 'whiskey', reason: 'Bitters and oak complement the cedar' },
  ],
  wood: [
    { drink: 'Bourbon', category: 'whiskey', reason: 'Oak barrel aging mirrors the woody character' },
    { drink: 'Amber Ale', category: 'beer', reason: 'Malty warmth pairs well with wood notes' },
  ],

  // Spicy / bold
  pepper: [
    { drink: 'Rye Whiskey', category: 'whiskey', reason: 'Spice meets spice — bold and complementary' },
    { drink: 'Malbec', category: 'wine', reason: 'Peppery Argentine red is a natural fit' },
    { drink: 'Espresso', category: 'coffee', reason: 'Intensity meets intensity' },
  ],
  spice: [
    { drink: 'Chai Latte', category: 'coffee', reason: 'Warm spices in both create a cozy pairing' },
    { drink: 'Islay Scotch', category: 'whiskey', reason: 'Smoky and spiced — a bold combination' },
  ],
  cinnamon: [
    { drink: 'Apple Cider', category: 'other', reason: 'Cinnamon and apple — autumn in a glass' },
    { drink: 'Rye Manhattan', category: 'whiskey', reason: 'Sweet vermouth and cinnamon spice harmonize' },
  ],

  // Nutty
  nut: [
    { drink: 'Amaretto', category: 'other', reason: 'Almond liqueur amplifies the nuttiness' },
    { drink: 'Sherry (Oloroso)', category: 'wine', reason: 'Nutty sherry is a textbook cigar pairing' },
  ],
  almond: [
    { drink: 'Amaretto Sour', category: 'other', reason: 'Almond on almond — it just works' },
    { drink: 'Medium Roast Coffee', category: 'coffee', reason: 'Nutty coffee brings out the almond' },
  ],

  // Fruity
  cherry: [
    { drink: 'Pinot Noir', category: 'wine', reason: 'Cherry-forward wine complements beautifully' },
    { drink: 'Manhattan', category: 'whiskey', reason: 'Maraschino cherry ties it all together' },
  ],
  citrus: [
    { drink: 'Gin & Tonic', category: 'other', reason: 'Bright botanicals lift the citrus notes' },
    { drink: 'Saison', category: 'beer', reason: 'Citrusy Belgian farmhouse ale is refreshing alongside' },
  ],
  fruit: [
    { drink: 'Sangria', category: 'wine', reason: 'Fruity wine echoes the fruit-forward profile' },
    { drink: 'Cognac (VS)', category: 'whiskey', reason: 'Young Cognac is bright and fruity' },
  ],

  // Roasted / dark
  coffee: [
    { drink: 'Cold Brew', category: 'coffee', reason: 'Smooth cold brew won\'t compete — it complements' },
    { drink: 'Coffee Stout', category: 'beer', reason: 'Double down on the coffee character' },
  ],
  toast: [
    { drink: 'Brown Ale', category: 'beer', reason: 'Toasty malt mirrors the toasted notes' },
    { drink: 'Dark Roast Coffee', category: 'coffee', reason: 'Roasted meets roasted' },
  ],
};

// Strength-based defaults when flavor matching is sparse
const STRENGTH_DEFAULTS: Record<number, DrinkPairing[]> = {
  1: [
    { drink: 'Champagne', category: 'wine', reason: 'Light and celebratory — lets a mild cigar shine' },
    { drink: 'Café Latte', category: 'coffee', reason: 'Smooth and milky — won\'t overpower a mild stick' },
  ],
  2: [
    { drink: 'Sauvignon Blanc', category: 'wine', reason: 'Crisp white wine complements a lighter cigar' },
    { drink: 'Light Rum & Cola', category: 'rum', reason: 'Easy-going and approachable' },
  ],
  3: [
    { drink: 'Bourbon', category: 'whiskey', reason: 'A versatile match for a medium-bodied cigar' },
    { drink: 'Medium Roast Coffee', category: 'coffee', reason: 'Balanced body pairs with balanced coffee' },
  ],
  4: [
    { drink: 'Single Malt Scotch', category: 'whiskey', reason: 'Complex whisky for a complex cigar' },
    { drink: 'Espresso', category: 'coffee', reason: 'Bold enough to stand up to a strong cigar' },
  ],
  5: [
    { drink: 'Barrel-Proof Bourbon', category: 'whiskey', reason: 'Full power meets full power' },
    { drink: 'Aged Rum (12yr+)', category: 'rum', reason: 'Deep and rich — the classic full-body pairing' },
    { drink: 'Turkish Coffee', category: 'coffee', reason: 'Intense and unfiltered — matches the strength' },
  ],
};

/**
 * Returns 2-3 drink pairings for a cigar based on its flavor profile,
 * strength, and body. No DB migration needed — purely algorithmic.
 */
export function getDrinkPairings(cigar: Cigar): DrinkPairing[] {
  const seen = new Set<string>();
  const pairings: DrinkPairing[] = [];

  // 1. Match flavors to drinks
  for (const flavor of cigar.flavors ?? []) {
    const lower = flavor.toLowerCase();
    for (const [keyword, drinks] of Object.entries(FLAVOR_DRINK_MAP)) {
      if (lower.includes(keyword)) {
        for (const d of drinks) {
          if (!seen.has(d.drink)) {
            seen.add(d.drink);
            pairings.push(d);
          }
        }
      }
    }
  }

  // 2. If we have fewer than 2, fill from strength defaults
  if (pairings.length < 2) {
    const defaults = STRENGTH_DEFAULTS[cigar.strength] ?? STRENGTH_DEFAULTS[3]!;
    for (const d of defaults) {
      if (!seen.has(d.drink)) {
        seen.add(d.drink);
        pairings.push(d);
      }
    }
  }

  // 3. Return top 3, preferring variety across categories
  const categories = new Set<string>();
  const diverse: DrinkPairing[] = [];
  const rest: DrinkPairing[] = [];

  for (const p of pairings) {
    if (!categories.has(p.category)) {
      categories.add(p.category);
      diverse.push(p);
    } else {
      rest.push(p);
    }
  }

  return [...diverse, ...rest].slice(0, 3);
}
