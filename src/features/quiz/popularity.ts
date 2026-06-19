/**
 * Recognizability resolver for the Fragrance DNA picker.
 *
 * The picker's whole promise is "every tile is a fragrance you recognize", which
 * is governed by `fragrances.popularity_tier` (DNA spec Part 5/6). On the real
 * Supabase catalog that column is populated by `scripts/dna-seed-popularity.ts`.
 * The mock catalog (used by the dev client / sim) has no such column, so we
 * resolve a tier at runtime from the SAME Popularity Seed List V1 — matched by
 * normalized brand + name. Anything unmatched defaults to tier 2 (catalog-only,
 * never a picker tile), exactly as the seed doc specifies.
 *
 * Pure + deterministic. No I/O.
 */

/** Minimal structural shape the resolver needs (subset of MockFragrance). */
export interface RecognizableFragrance {
  brand: string;
  name: string;
  image_url: string;
  top_accords: string[];
  popularity_tier?: number;
}

// ── Popularity Seed List V1 (docs/perfume-picks-popularity-seed-v1.md) ─────────
// [brand, name, tier]. Tiers 5/4/3 only — everything else defaults to 2.
const SEED: [string, string, number][] = [
  // Tier 5 — household icons
  ['Dior', 'Sauvage', 5],
  ['Chanel', 'Bleu de Chanel', 5],
  ['Giorgio Armani', 'Acqua di Gio', 5],
  ['Versace', 'Eros', 5],
  ['Creed', 'Aventus', 5],
  ['Paco Rabanne', '1 Million', 5],
  ['Jean Paul Gaultier', 'Le Male', 5],
  ['Chanel', 'Coco Mademoiselle', 5],
  ['Chanel', 'No. 5', 5],
  ['Dior', "J'adore", 5],
  ['Yves Saint Laurent', 'Black Opium', 5],
  ['Lancome', 'La Vie Est Belle', 5],
  ['Viktor & Rolf', 'Flowerbomb', 5],
  ['Carolina Herrera', 'Good Girl', 5],
  ['Marc Jacobs', 'Daisy', 5],
  ['Maison Francis Kurkdjian', 'Baccarat Rouge 540', 5],
  ['Tom Ford', 'Black Orchid', 5],
  ['Le Labo', 'Santal 33', 5],

  // Tier 4 — very well known
  ['Dior', 'Dior Homme Intense', 4],
  ['Yves Saint Laurent', "La Nuit de l'Homme", 4],
  ['Chanel', 'Allure Homme Sport', 4],
  ['Versace', 'Dylan Blue', 4],
  ['Paco Rabanne', 'Invictus', 4],
  ['Giorgio Armani', 'Acqua di Gio Profumo', 4],
  ['Prada', 'Luna Rossa', 4],
  ['Dolce & Gabbana', 'The One', 4],
  ['Tom Ford', 'Oud Wood', 4],
  ['Tom Ford', 'Tobacco Vanille', 4],
  ['Creed', 'Green Irish Tweed', 4],
  ['Parfums de Marly', 'Layton', 4],
  ['Initio', 'Oud for Greatness', 4],
  ['Xerjoff', 'Erba Pura', 4],
  ['Yves Saint Laurent', 'Libre', 4],
  ['Gucci', 'Bloom', 4],
  ['Gucci', 'Guilty', 4],
  ['Valentino', 'Born in Roma', 4],
  ['Mugler', 'Angel', 4],
  ['Mugler', 'Alien', 4],
  ['Narciso Rodriguez', 'For Her', 4],
  ['Dolce & Gabbana', 'Light Blue', 4],
  ['Burberry', 'Her', 4],
  ['Lancome', 'Idole', 4],
  ['Givenchy', "L'Interdit", 4],
  ['Ariana Grande', 'Cloud', 4],
  ['Maison Francis Kurkdjian', 'Grand Soir', 4],
  ['Jo Malone', 'Wood Sage & Sea Salt', 4],

  // Tier 3 — enthusiast-recognizable (reshuffle floor)
  ['Byredo', 'Gypsy Water', 3],
  ['Byredo', 'Mojave Ghost', 3],
  ['Byredo', 'Blanche', 3],
  ['Diptyque', 'Philosykos', 3],
  ['Diptyque', 'Tam Dao', 3],
  ['Maison Margiela', 'Replica By the Fireplace', 3],
  ['Maison Margiela', 'Replica Jazz Club', 3],
  ['Maison Margiela', 'Replica Beach Walk', 3],
  ['Frederic Malle', 'Portrait of a Lady', 3],
  ['Kilian', "Love, Don't Be Shy", 3],
  ['Parfums de Marly', 'Herod', 3],
  ['Parfums de Marly', 'Pegasus', 3],
  ['Nishane', 'Hacivat', 3],
  ['Amouage', 'Interlude Man', 3],
  ['Hermes', "Terre d'Hermes", 3],
  ['Guerlain', 'Shalimar', 3],
  ['Acqua di Parma', 'Colonia', 3],
  ['Maison Francis Kurkdjian', 'Oud Satin Mood', 3],
  ['Phlur', 'Missing Person', 3],
  ['Sol de Janeiro', 'Cheirosa 62', 3],
  ['Glossier', 'You', 3],
  ['Escentric Molecules', 'Molecule 01', 3],
  ['Le Labo', 'Another 13', 3],
  ["Penhaligon's", 'Halfeti', 3],
];

/** Default tier for catalog rows that don't match the seed list. */
export const DEFAULT_POPULARITY_TIER = 2;
/** Grid 1 floor — household icons / very-well-known only. */
export const GRID1_TIER_FLOOR = 4;
/** Reshuffle floor — never drops below enthusiast-recognizable. */
export const RESHUFFLE_TIER_FLOOR = 3;

// Strip accents, lowercase, punctuation→space (mirrors the ETL canonicalizer).
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip concentration / packaging words so "Sauvage" matches "Sauvage Eau de Parfum".
const CONC =
  /\b(eau de parfum|eau de toilette|eau de cologne|parfum|cologne|edp|edt|edc|extrait|intense|elixir|for (men|women|her|him)|pour (homme|femme)|spray|tester)\b/g;
const matchKey = (s: string): string => norm(s).replace(CONC, ' ').replace(/\s+/g, ' ').trim();

// Index: normBrand → matchKey(name) → tier.
const INDEX: Map<string, Map<string, number>> = (() => {
  const m = new Map<string, Map<string, number>>();
  for (const [brand, name, tier] of SEED) {
    const bk = norm(brand);
    const nk = matchKey(name);
    let inner = m.get(bk);
    if (!inner) {
      inner = new Map();
      m.set(bk, inner);
    }
    inner.set(nk, tier);
  }
  return m;
})();

/**
 * Resolve recognizability tier for a fragrance. Prefers an explicit
 * `popularity_tier` (the Supabase column) when present; otherwise matches the
 * seed list by normalized brand + name, then a whole-token prefix fallback
 * ("Aventus" matches "Aventus 10th Anniversary"), else DEFAULT_POPULARITY_TIER.
 */
export function resolvePopularityTier(f: RecognizableFragrance): number {
  if (typeof f.popularity_tier === 'number' && f.popularity_tier > 0) {
    return f.popularity_tier;
  }
  const inner = INDEX.get(norm(f.brand));
  if (!inner) return DEFAULT_POPULARITY_TIER;
  const nk = matchKey(f.name);
  const exact = inner.get(nk);
  if (exact != null) return exact;
  // whole-token prefix: seed "aventus" → catalog "aventus 10th anniversary".
  for (const [seedKey, tier] of inner) {
    if (nk === seedKey || nk.startsWith(seedKey + ' ')) return tier;
  }
  return DEFAULT_POPULARITY_TIER;
}

/**
 * DNA-eligible for the picker: recognizable enough (tier ≥ reshuffle floor),
 * has a displayable image (recognition is the whole point), and carries real
 * accord data so `aggregateFromFragrances` can actually read a signal off it.
 */
export function isPickerEligible(f: RecognizableFragrance): boolean {
  if (!f.image_url) return false;
  if (!f.top_accords || f.top_accords.length === 0) return false;
  return resolvePopularityTier(f) >= RESHUFFLE_TIER_FLOOR;
}
