/**
 * Mood lexicon — maps free-text vibe phrases ("warm cozy date night") to the
 * accord sets + score targets our catalog already carries, so Discover search
 * can answer mood queries instead of doing a literal keyword match. (PRD §7.2)
 *
 * Design notes:
 *   - Triggers are VIBE words only (warm, cozy, fresh, date night, office…),
 *     never bare accord names. That keeps the "By Accord" tile taps (which set
 *     the query to e.g. "amber") on the literal-search path, and makes mood
 *     search purely additive.
 *   - A concept contributes accords (OR-matched against top_accords) and/or a
 *     score floor (compliment_score / office_safe_score / versatility_score).
 *   - `labels` are surfaced back to the user ("Showing warm, sweet, evening
 *     scents") so the interpretation is legible, not a black box.
 */

type ScoreKey = 'compliment_score' | 'office_safe_score' | 'versatility_score';

type MoodConcept = {
  /** Lowercased phrases that trigger this concept (matched as substrings). */
  triggers: string[];
  /** Accords to OR-match against a fragrance's top_accords. */
  accords?: string[];
  /** Score floors this concept implies (max wins when concepts combine). */
  scores?: Partial<Record<ScoreKey, number>>;
  /** Human-readable tag shown in the interpretation banner. */
  label: string;
};

/**
 * Order matters only for label readability — multi-word triggers are listed
 * before their single-word components so "date night" wins over "night".
 */
const MOOD_CONCEPTS: MoodConcept[] = [
  { triggers: ['date night', 'romantic', 'seductive', 'sexy', 'sensual', 'flirty'], accords: ['amber', 'vanilla', 'sweet', 'musk', 'warm-spicy'], scores: { compliment_score: 0.6 }, label: 'date-night' },
  { triggers: ['office', 'work', 'professional', 'meeting', 'workplace', 'safe', 'inoffensive', 'subtle'], scores: { office_safe_score: 0.6 }, label: 'office-safe' },
  { triggers: ['everyday', 'daily', 'versatile', 'all-rounder', 'go-to', 'signature'], scores: { versatility_score: 0.6 }, label: 'versatile' },
  { triggers: ['compliment', 'crowd-pleaser', 'head turner', 'head-turner', 'attention'], scores: { compliment_score: 0.65 }, label: 'compliment-getter' },
  { triggers: ['elegant', 'sophisticated', 'classy', 'refined', 'expensive', 'luxurious', 'smells expensive', 'rich'], accords: ['amber', 'iris', 'woody', 'powdery', 'leather'], scores: { compliment_score: 0.6 }, label: 'elegant' },
  { triggers: ['warm', 'cozy', 'cosy', 'comforting', 'snug'], accords: ['amber', 'vanilla', 'warm-spicy', 'woody'], label: 'warm' },
  { triggers: ['sweet', 'gourmand', 'dessert', 'edible', 'foodie', 'sugary', 'candy'], accords: ['vanilla', 'gourmand', 'sweet', 'caramel'], label: 'sweet' },
  { triggers: ['fresh', 'clean', 'crisp', 'soapy', 'showered'], accords: ['fresh', 'citrus', 'aquatic', 'green'], label: 'fresh' },
  { triggers: ['summer', 'beach', 'hot weather', 'tropical', 'vacation', 'poolside'], accords: ['citrus', 'aquatic', 'fresh', 'green', 'fruity'], label: 'summery' },
  { triggers: ['winter', 'cold weather', 'snow', 'chilly'], accords: ['amber', 'oud', 'woody', 'warm-spicy', 'vanilla'], label: 'wintry' },
  { triggers: ['spring', 'springtime'], accords: ['floral', 'green', 'citrus', 'rose', 'powdery'], label: 'spring' },
  { triggers: ['fall', 'autumn', 'autumnal'], accords: ['woody', 'spicy', 'warm-spicy', 'amber', 'tobacco'], label: 'autumnal' },
  { triggers: ['night', 'evening', 'club', 'nightout', 'night out', 'going out'], accords: ['amber', 'oud', 'sweet', 'warm-spicy'], scores: { compliment_score: 0.55 }, label: 'evening' },
  { triggers: ['floral', 'flowery', 'pretty', 'feminine', 'girly'], accords: ['floral', 'rose', 'white floral', 'powdery'], label: 'floral' },
  { triggers: ['woody', 'earthy', 'foresty'], accords: ['woody', 'oud', 'sandalwood', 'cedar'], label: 'woody' },
  { triggers: ['spicy', 'peppery'], accords: ['spicy', 'warm-spicy', 'pepper'], label: 'spicy' },
  { triggers: ['citrus', 'zesty', 'lemony'], accords: ['citrus', 'fresh'], label: 'citrusy' },
  { triggers: ['powdery', 'soft', 'comfort'], accords: ['powdery', 'iris', 'musk'], label: 'soft' },
  { triggers: ['aquatic', 'marine', 'ocean', 'watery', 'sea'], accords: ['aquatic', 'fresh', 'marine'], label: 'aquatic' },
  { triggers: ['smoky', 'smoke', 'incense', 'leathery', 'leather'], accords: ['leather', 'smoky', 'incense', 'tobacco'], label: 'smoky' },
];

/** Tappable example vibes shown to teach the feature when browsing. */
export const MOOD_SUGGESTIONS = [
  'warm & cozy',
  'date night',
  'fresh summer',
  'office safe',
  'smells expensive',
  'sweet gourmand',
] as const;

export type MoodInterpretation = {
  accords: string[];
  scores: Partial<Record<ScoreKey, number>>;
  labels: string[];
};

/**
 * Parse a free-text query into a mood interpretation. Returns null when the
 * query contains no vibe words (caller should fall back to literal search).
 */
export function interpretMood(query: string): MoodInterpretation | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;

  const accords = new Set<string>();
  const scores: Partial<Record<ScoreKey, number>> = {};
  const labels: string[] = [];

  for (const concept of MOOD_CONCEPTS) {
    if (!concept.triggers.some((t) => q.includes(t))) continue;
    concept.accords?.forEach((a) => accords.add(a));
    if (concept.scores) {
      for (const [k, v] of Object.entries(concept.scores) as [ScoreKey, number][]) {
        scores[k] = Math.max(scores[k] ?? 0, v);
      }
    }
    if (!labels.includes(concept.label)) labels.push(concept.label);
  }

  if (labels.length === 0) return null;
  return { accords: [...accords], scores, labels };
}

type Rankable = {
  top_accords: string[];
  compliment_score: number;
  office_safe_score: number;
  versatility_score: number;
};

/**
 * Filter + rank a pool against a mood interpretation. Every set score floor is
 * a hard requirement; accord overlap drives ranking. Falls back to score-only
 * ranking when the interpretation carries no accords (pure "office safe" etc.).
 */
export function rankByMood<T extends Rankable>(
  pool: T[],
  mood: MoodInterpretation,
  limit = 200,
): T[] {
  const wantAccords = mood.accords.length > 0;
  const scored: { item: T; score: number }[] = [];

  for (const f of pool) {
    // Hard score floors.
    if (mood.scores.compliment_score != null && f.compliment_score < mood.scores.compliment_score) continue;
    if (mood.scores.office_safe_score != null && f.office_safe_score < mood.scores.office_safe_score) continue;
    if (mood.scores.versatility_score != null && f.versatility_score < mood.scores.versatility_score) continue;

    let overlap = 0;
    if (wantAccords) {
      for (const a of f.top_accords) if (mood.accords.includes(a)) overlap++;
      if (overlap === 0) continue; // must match the vibe's accords
    }

    // Tie-break with compliment score so the most-loved matches float up.
    const score = overlap * 10 + f.compliment_score;
    scored.push({ item: f, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
