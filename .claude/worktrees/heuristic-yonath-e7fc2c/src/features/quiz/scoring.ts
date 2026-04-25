import type { Cigar, QuizAnswers } from '@/src/types/cigar';

interface ScoredCigar {
  cigar: Cigar;
  score: number;
  reasons: string[];
}

/**
 * Maps user-facing flavor labels to the actual flavor strings stored in the DB.
 * A quiz selection of "Chocolate" should match cigars with cocoa, dark chocolate, etc.
 */
const FLAVOR_GROUPS: Record<string, string[]> = {
  cedar: ['cedar', 'oak'],
  leather: ['leather'],
  pepper: ['pepper', 'black pepper', 'red pepper', 'white pepper'],
  chocolate: ['chocolate', 'cocoa', 'dark chocolate', 'milk chocolate', 'mocha'],
  coffee: ['coffee', 'espresso', 'mocha'],
  cream: ['cream', 'vanilla', 'milk chocolate'],
  nuts: ['nuts', 'almonds', 'almond'],
  earth: ['earth', 'charcoal', 'smoke', 'smoky', 'mesquite'],
  fruit: ['fruit', 'cherry', 'plum', 'citrus', 'dried fruit'],
  spice: ['spice', 'sweet spice', 'baking spice', 'black pepper', 'red pepper'],
  honey: ['honey', 'caramel', 'molasses', 'sweet'],
  vanilla: ['vanilla', 'cream', 'sweet'],
  toast: ['toast', 'hay', 'oak'],
};

function flavorOverlap(userFlavors: string[], cigarFlavors: string[]): { hits: number; matched: string[] } {
  const cigarSet = new Set(cigarFlavors.map((f) => f.toLowerCase()));
  let hits = 0;
  const matched: string[] = [];

  for (const userFlavor of userFlavors) {
    const group = FLAVOR_GROUPS[userFlavor.toLowerCase()];
    if (!group) {
      // Direct match fallback
      if (cigarSet.has(userFlavor.toLowerCase())) {
        hits++;
        matched.push(userFlavor);
      }
      continue;
    }
    // Check if any term in the group matches any cigar flavor
    if (group.some((term) => cigarSet.has(term))) {
      hits++;
      matched.push(userFlavor);
    }
  }

  return { hits, matched };
}

export function scoreQuiz(answers: QuizAnswers, cigars: Cigar[]): ScoredCigar[] {
  if (!cigars.length) return [];

  const scored = cigars.map((cigar) => {
    let score = 0;
    const reasons: string[] = [];
    const cigarFlavors = cigar.flavors ?? [];

    // Strength match (30% weight, max 30 points)
    if (answers.strength != null && cigar.strength) {
      const diff = Math.abs(answers.strength - cigar.strength);
      const pts = (1 - diff / 4) * 30;
      score += pts;
      if (diff === 0) reasons.push('Strength matches perfectly');
      else if (diff === 1) reasons.push('Strength is a close match');
    }

    // Flavor overlap (40% weight, max 40 points)
    if (answers.flavors.length > 0 && cigarFlavors.length > 0) {
      const { hits, matched } = flavorOverlap(answers.flavors, cigarFlavors);
      const pct = hits / answers.flavors.length;
      score += pct * 40;
      if (matched.length > 0) {
        reasons.push(`Flavor match: ${matched.join(', ')}`);
      }
    }

    // Price match (20% weight, max 20 points)
    if (answers.price != null && cigar.price_tier) {
      const diff = Math.abs(answers.price - cigar.price_tier);
      const pts = (1 - diff / 4) * 20;
      score += pts;
      if (diff === 0) reasons.push('Price tier matches exactly');
      else if (diff === 1) reasons.push('Price is in range');
    }

    // Body match (bonus for advanced quiz, max 10 points)
    if (answers.body != null && cigar.body) {
      const diff = Math.abs(answers.body - cigar.body);
      score += (1 - diff / 4) * 10;
      if (diff <= 1) reasons.push('Body is a close match');
    }

    // Smoothness (bonus for advanced quiz)
    if (answers.smoothness) {
      const hasCreamy = cigarFlavors.some((f) =>
        ['cream', 'vanilla', 'honey', 'sweet', 'milk chocolate'].includes(f.toLowerCase())
      );
      const hasSpice = cigarFlavors.some((f) =>
        ['pepper', 'black pepper', 'red pepper', 'spice', 'earth', 'leather'].includes(f.toLowerCase())
      );

      if (answers.smoothness === 'ultra-smooth') {
        score += hasCreamy ? 5 : hasSpice ? 1 : 3;
      } else if (answers.smoothness === 'punchy') {
        score += hasSpice ? 5 : hasCreamy ? 1 : 3;
      } else {
        score += 3;
      }
    }

    // Time of day adjustment (bonus for advanced quiz)
    if (answers.time) {
      const isMild = (cigar.strength ?? 3) <= 2;
      const isFull = (cigar.strength ?? 3) >= 4;

      if (answers.time === 'morning' && isMild) score += 3;
      if (answers.time === 'late' && isFull) score += 3;
      if (answers.time === 'evening' && isFull) score += 2;
      if (answers.time === 'midday') score += 1; // slight boost for any cigar midday
    }

    // Wrapper preference (bonus for advanced quiz, max 5 points)
    if (answers.wrapper && answers.wrapper !== 'any' && cigar.wrapper) {
      const w = cigar.wrapper.toLowerCase();
      if (answers.wrapper === 'connecticut' && w.includes('connecticut')) {
        score += 5;
        reasons.push('Connecticut wrapper match');
      } else if (answers.wrapper === 'habano' && (w.includes('habano') || w.includes('corojo'))) {
        score += 5;
        reasons.push('Habano wrapper match');
      } else if (answers.wrapper === 'maduro' && (w.includes('maduro') || w.includes('oscuro') || w.includes('broadleaf'))) {
        score += 5;
        reasons.push('Maduro wrapper match');
      }
    }

    // Origin preference (bonus for advanced quiz, max 5 points)
    if (answers.origin && answers.origin !== 'any' && cigar.origin) {
      if (cigar.origin.toLowerCase() === answers.origin.toLowerCase()) {
        score += 5;
        reasons.push(`Made in ${cigar.origin}`);
      }
    }

    // Adventure level adjustment (bonus)
    if (answers.adventure === 'surprise') {
      score += Math.random() * 5;
    }

    return { cigar, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 10);
}
