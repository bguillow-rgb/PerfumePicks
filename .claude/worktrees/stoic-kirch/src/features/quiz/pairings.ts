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

// Deep-cut pairings — less-obvious options used to fill the 3rd slot when
// possible, so every cigar gets a "huh, wouldn't have thought of that" rec
// alongside two conventional picks. Kept separate from FLAVOR_DRINK_MAP so the
// top-2 slots stay crowd-pleasing and category-diverse; only slot 3 is swapped
// when a deep-cut matches the cigar's flavor profile.
const DEEP_CUT_FLAVOR_DRINK_MAP: Record<string, DrinkPairing[]> = {
  cream: [
    { drink: 'Pedro Ximénez Sherry', category: 'wine', reason: 'Syrupy raisin-and-cream — a liquid dessert' },
    { drink: 'Horchata', category: 'other', reason: 'Rice-and-cinnamon milk softens the smoke' },
  ],
  vanilla: [
    { drink: 'Pineau des Charentes', category: 'wine', reason: 'Cognac-fortified grape juice, heavy on honey and vanilla' },
    { drink: 'Japanese Whisky Highball', category: 'whiskey', reason: 'Lifts subtle vanilla without adding weight' },
  ],
  caramel: [
    { drink: 'Añejo Tequila', category: 'other', reason: 'Aged agave pulls out caramel and vanilla oak' },
    { drink: 'Tokaji Aszú', category: 'wine', reason: 'Hungarian dessert wine — apricot and burnt sugar' },
  ],
  honey: [
    { drink: 'Sauternes', category: 'wine', reason: 'Botrytized Bordeaux — honey, apricot, and beeswax' },
    { drink: 'Metaxa', category: 'other', reason: 'Greek brandy-wine blend with honey and cinnamon' },
  ],
  chocolate: [
    { drink: 'Banyuls', category: 'wine', reason: 'French sweet red — cocoa and wild cherry' },
    { drink: 'Mole Stout', category: 'beer', reason: 'Chocolate-chile stout pushes the mole territory further' },
  ],
  cocoa: [
    { drink: 'Amaro Nonino', category: 'other', reason: 'Bittersweet Italian — cocoa with orange peel' },
    { drink: 'Xocolatl Stout', category: 'beer', reason: 'Spiced cocoa stout made for a cigar' },
  ],
  earth: [
    { drink: 'Mezcal', category: 'other', reason: 'Smoky agave mirrors an earthy, loamy wrapper' },
    { drink: 'Barolo', category: 'wine', reason: 'Nebbiolo tar and roses — earthy and structured' },
    { drink: 'Cask-Strength Islay', category: 'whiskey', reason: 'Unfiltered peat reads as damp forest floor' },
  ],
  leather: [
    { drink: 'Armagnac', category: 'other', reason: 'Rustic cousin of Cognac — leather and dried fruit' },
    { drink: 'Amaro Averna', category: 'other', reason: 'Sicilian bitter with herbal, saddle-leather depth' },
  ],
  cedar: [
    { drink: 'Rioja Gran Reserva', category: 'wine', reason: 'Long American-oak aging leaves cedar in the glass' },
    { drink: 'Sancerre', category: 'wine', reason: 'Flinty Sauvignon Blanc lifts the cedar without clashing' },
  ],
  wood: [
    { drink: 'Eau de Vie', category: 'other', reason: 'Clear fruit brandy lets the wrapper\'s wood do the talking' },
    { drink: 'Daiginjo Sake', category: 'other', reason: 'Chilled premium sake — unexpected wood interplay' },
  ],
  pepper: [
    { drink: 'Mezcal', category: 'other', reason: 'Chile-edged smoke meets peppery wrapper' },
    { drink: 'Northern Rhône Syrah', category: 'wine', reason: 'White pepper and cured olive in the glass' },
    { drink: 'Gewürztraminer', category: 'wine', reason: 'Lychee and pink peppercorn — a surprising lift' },
  ],
  spice: [
    { drink: 'Calvados', category: 'other', reason: 'Norman apple brandy — baking spice in aged bottlings' },
    { drink: 'Genever', category: 'other', reason: 'Dutch malted gin with clove and juniper warmth' },
    { drink: 'Rhum Agricole', category: 'rum', reason: 'Martinique cane juice rum — grassy and allspice-forward' },
  ],
  cinnamon: [
    { drink: 'Xtabentún', category: 'other', reason: 'Mayan honey-anise liqueur — cinnamon\'s cousin' },
    { drink: 'Mulled Wine', category: 'wine', reason: 'Spiced red done right — clove and cinnamon carry over' },
  ],
  nut: [
    { drink: 'Madeira Bual', category: 'wine', reason: 'Nutty, volcanic Portuguese fortified — a thinking-person\'s pairing' },
    { drink: 'Amontillado Sherry', category: 'wine', reason: 'Between fino and oloroso — hazelnut and sea air' },
  ],
  almond: [
    { drink: 'Orgeat Cocktail', category: 'other', reason: 'Almond-syrup tiki drink (a proper Mai Tai) amplifies nuttiness' },
    { drink: 'Fino Sherry', category: 'wine', reason: 'Crisp, bone-dry, with a nutty almond bite' },
  ],
  cherry: [
    { drink: 'Kirschwasser', category: 'other', reason: 'German cherry brandy — cherry pit and stone' },
    { drink: 'Kriek Lambic', category: 'beer', reason: 'Belgian wild ale on cherries — tart and unexpected' },
    { drink: 'Amaro Montenegro', category: 'other', reason: 'Herbal Italian with dried cherry and rose petal' },
  ],
  citrus: [
    { drink: 'Campari Spritz', category: 'other', reason: 'Bitter orange lifts citrus-forward wrappers' },
    { drink: 'White Port & Tonic', category: 'wine', reason: 'Portugal\'s under-the-radar aperitif' },
  ],
  fruit: [
    { drink: 'Madeira Sercial', category: 'wine', reason: 'Bright acidity and orchard fruit — cuts through body' },
    { drink: 'Vintage Armagnac', category: 'other', reason: 'Aged fruit brandy with jammy stone-fruit depth' },
  ],
  coffee: [
    { drink: 'Barrel-Aged Coffee Stout', category: 'beer', reason: 'Bourbon-barrel coffee stout — decadent and long-finishing' },
    { drink: 'Espresso Martini', category: 'other', reason: 'Coffee, vodka, Kahlúa — a night-capping classic' },
  ],
  toast: [
    { drink: 'Trappist Quadrupel', category: 'beer', reason: 'Rochefort 10 or similar — toasted malt and dark fruit' },
    { drink: 'Madeira Verdelho', category: 'wine', reason: 'Off-dry Portuguese — toasted nuts and caramelized fruit' },
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

  // 3. Pick top 2 with category diversity (keep the crowd-pleasing anchors).
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

  const ordered = [...diverse, ...rest];
  const top2 = ordered.slice(0, 2);

  // 4. Deep-cut slot 3: match the cigar's flavors against the deep-cut pool
  //    and prefer a drink whose category isn't already in the top 2 (keeps
  //    category diversity). Falls back to the next best regular match if no
  //    deep cut applies, and falls back to nothing if we only have 2 total.
  const usedDrinks = new Set(top2.map((p) => p.drink));
  const usedCategories = new Set(top2.map((p) => p.category));

  const deepCutCandidates: DrinkPairing[] = [];
  const seenDeep = new Set<string>();
  for (const flavor of cigar.flavors ?? []) {
    const lower = flavor.toLowerCase();
    for (const [keyword, drinks] of Object.entries(DEEP_CUT_FLAVOR_DRINK_MAP)) {
      if (!lower.includes(keyword)) continue;
      for (const d of drinks) {
        if (usedDrinks.has(d.drink) || seenDeep.has(d.drink)) continue;
        seenDeep.add(d.drink);
        deepCutCandidates.push(d);
      }
    }
  }

  // Prefer deep cuts whose category differs from the top-2 picks.
  const noveltyPick =
    deepCutCandidates.find((d) => !usedCategories.has(d.category)) ??
    deepCutCandidates[0];

  if (noveltyPick) return [...top2, noveltyPick];

  return ordered.slice(0, 3);
}
