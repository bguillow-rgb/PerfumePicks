/**
 * Query repair for catalog search: the decisions that turn a near-miss into the
 * bottle the user meant, kept pure so they can be tested without Postgres.
 *
 * Built from the 34 distinct searches that came back empty between 2026-08-01
 * and 2026-10-05. Each rule here exists because a specific real query failed,
 * and each is deliberately conservative: an empty screen is a bad answer, but a
 * confidently WRONG bottle is worse, and in the DNA picker a wrong hit can get
 * tapped and pollute the user's taste seed.
 */

/**
 * Words long enough to pass the >=3-char brand-lookup guard but that identify no
 * brand. Without this, "bath and body works" matched 26 brands on "and" alone
 * and "perfume para los hombres" matched 21. Applied to the brand LOOKUP only:
 * these words still take part in name matching ("the one", "pour homme").
 */
export const BRAND_LOOKUP_STOPWORDS: ReadonlySet<string> = new Set([
  // English
  'and', 'the', 'for', 'all', 'with', 'from', 'her', 'his', 'men', 'mens', 'women', 'womens',
  // Spanish / French / Italian / Portuguese function words seen in real queries
  'los', 'las', 'del', 'des', 'les', 'con', 'por', 'para', 'pour', 'une', 'per', 'uno', 'una',
  'hombre', 'hombres', 'mujer', 'mujeres', 'homme', 'femme',
  // Category words that substring-match house names ("Parfums de Marly",
  // "Perfume Lounge") without naming any one of them. "parfums de marly" still
  // resolves: "marly" does the lookup, and every token is checked for
  // consumption against the brands that matched.
  'perfume', 'perfumes', 'parfum', 'parfums', 'fragrance', 'fragrances', 'cologne', 'colonia',
  'scent', 'scents', 'eau', 'edp', 'edt', 'spray',
]);

/** Tokens eligible to drive the brand lookup: >=3 chars and not a stop-word. */
export function brandLookupTokens(tokens: readonly string[]): string[] {
  return tokens
    .map((t) => t.replace(/[^a-z0-9]/gi, ''))
    .filter((t) => t.length >= 3 && !BRAND_LOOKUP_STOPWORDS.has(t));
}

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent transposition as
 * a single edit. Transposition is the commonest real typo ("pual" for "paul"),
 * and plain Levenshtein charges it 2.
 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/**
 * Is `token` a plausible misspelling of `word`? Only ever asked about words of a
 * brand that has ALREADY matched the query, so the candidate set is a handful of
 * words, not the catalog. Even so: tokens under 4 chars never fuzzy-match (too
 * ambiguous), and the first letter must agree - real typos almost never change
 * it, and requiring it is what keeps a 2-edit allowance on a 4-letter word sane.
 */
export function isTypoOf(token: string, word: string): boolean {
  if (token.length < 4 || word.length < 4) return false;
  if (token === word) return true;
  if (token[0] !== word[0]) return false;
  return editDistance(token, word) <= 2;
}

export interface BrandCandidate {
  id: string;
  name_normalized: string | null;
  aliases: string[] | null;
}

/**
 * The exact search matched at least one brand, but the leftover words killed
 * every result, e.g.:
 *   "jean pual"   - "jean" matched 9 brands incl. Jean Paul Gaultier; "pual"
 *                   (a typo of a word IN the brand name) then matched no bottle.
 *   "kayali wedd" - Kayali matched; no Kayali bottle contains "wedd".
 *   "ysl babycat" - YSL matched via alias; Babycat isn't in the catalog.
 * Returns the one brand whose lineup should be shown instead of nothing, or null
 * when the answer is genuinely ambiguous (better empty than a guess).
 *
 * 1. A brand that explains every leftover token as a typo of one of its own
 *    words wins outright - that is "jean pual" -> Jean Paul Gaultier, and NOT
 *    Jean Patou, which a trigram ranking prefers 0.40 to 0.33.
 * 2. Otherwise, with exactly ONE unexplained token left, show the brand that
 *    accounted for the most query tokens, if that top count is unique. One
 *    stray word after a recognised brand means "something from this house".
 *    Two or more stray words means the brand match is incidental.
 */
export function pickBrandFallback(
  brands: readonly BrandCandidate[],
  tokens: readonly string[],
): string | null {
  if (brands.length === 0 || tokens.length === 0) return null;

  const scored = brands.map((b) => {
    const name = b.name_normalized ?? '';
    const words = name.split(/\s+/).filter(Boolean);
    const aliases = new Set(b.aliases ?? []);
    const consumed = tokens.filter((t) => aliases.has(t) || name.includes(t));
    const leftover = tokens.filter((t) => !consumed.includes(t));
    const absorbed = leftover.filter((t) => words.some((w) => isTypoOf(t, w)));
    return { id: b.id, consumed: consumed.length, leftover, absorbed: absorbed.length };
  });

  const full = scored.filter((s) => s.consumed > 0 && s.leftover.length > 0 && s.absorbed === s.leftover.length);
  if (full.length > 0) {
    full.sort((a, b) => (b.consumed + b.absorbed) - (a.consumed + a.absorbed));
    const best = full[0];
    const tied = full.filter((s) => s.consumed + s.absorbed === best.consumed + best.absorbed);
    return tied.length === 1 ? best.id : null;
  }

  const contenders = scored.filter((s) => s.consumed > 0 && s.leftover.length === 1);
  if (contenders.length === 0) return null;
  const top = Math.max(...contenders.map((s) => s.consumed));
  const leaders = contenders.filter((s) => s.consumed === top);
  return leaders.length === 1 ? leaders[0].id : null;
}
