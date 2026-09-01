/**
 * Pick the catalog row a bottle scan actually meant.
 *
 * THE BUG THIS REPLACES (2026-08-29): scan's confirm handler did
 *   const matches = await search(result.name, 5);
 *   router.replace(`/fragrance/${matches[0].id}`)
 * — the AI's identified BRAND was discarded, and whatever ranked first for the
 * name alone was opened. Catalog search scores on name only (see the rank
 * comment in useCatalogStore), so a common name lands on an arbitrary house and
 * the user is taken to the wrong bottle after a CORRECT identification. The
 * manual quick-add path right below it already searched `name + brand`; only the
 * scan path threw the brand away.
 *
 * Rule: when the scan gave us a brand, the match must agree with it. If nothing
 * in the catalog matches that brand we return null — showing "not in our catalog"
 * is honest, whereas opening a different house's bottle is a silent wrong answer,
 * which is worse than no answer.
 */
import type { Fragrance } from '@/src/stores/useCatalogStore';

/** Lowercase, strip accents/punctuation, collapse spaces — mirrors pp_normalize. */
export function normBrand(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when two brand strings refer to the same house. Substring containment
 * (either direction) handles the real variance between what a model reads off a
 * bottle and how the catalog stores it — "Dior" vs "Christian Dior",
 * "YSL" vs "Yves Saint Laurent" — without matching unrelated houses, since a
 * 3+ char containment on a normalized brand token is a strong signal.
 */
export function brandsAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normBrand(a);
  const y = normBrand(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 3 && y.includes(x)) return true;
  if (y.length >= 3 && x.includes(y)) return true;
  return false;
}

/**
 * Choose the row to open for a scan result.
 * - brand known  → first candidate whose brand agrees; null when none do.
 * - brand absent → fall back to the search's own top hit (nothing better to go on).
 */
export function pickScanMatch(
  matches: Fragrance[],
  scannedBrand: string | null | undefined,
): Fragrance | null {
  if (!matches?.length) return null;
  if (!normBrand(scannedBrand)) return matches[0] ?? null;
  return matches.find((m) => brandsAgree(m.brand, scannedBrand)) ?? null;
}

/** Token overlap between a scanned name and a catalog name (0..1). */
function nameOverlap(scanned: string, candidate: string): number {
  const a = new Set(normBrand(scanned).split(' ').filter((w) => w.length > 2));
  const b = new Set(normBrand(candidate).split(' ').filter((w) => w.length > 2));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
}

/**
 * Resolve a scan result to a catalog row, tolerating a verbose identification.
 *
 * A real scan returned name='"VACATION" Scent of the "World Famous" Vacation(R)
 * Sunscreen Company', brand='Vacation Inc.' for a bottle the catalog holds as
 * Vacation / Vacation. Searching that full string matches nothing, so the user
 * was told the bottle was not in the catalog when it was. The proxy prompt now
 * asks for canonical short terms; this is the belt-and-braces on the client, so
 * one wordy identification can never again read as "missing from catalog".
 *
 * Order: full "name brand" → brand alone (ranked by name overlap) → name alone.
 * Brand agreement is still required whenever a brand was identified.
 */
export async function resolveScanMatch(
  search: (q: string, limit: number) => Promise<Fragrance[]>,
  name: string,
  brand: string | null | undefined,
): Promise<Fragrance | null> {
  const b = (brand ?? '').trim();
  const direct = pickScanMatch(await search(b ? `${name} ${b}` : name, 5), b);
  if (direct) return direct;

  if (b) {
    // The house is usually short and clean even when the name is not — so ask
    // the catalog for the house, then pick the row whose name overlaps most.
    const byBrand = (await search(b, 25)).filter((f) => brandsAgree(f.brand, b));
    if (byBrand.length) {
      const ranked = byBrand
        .map((f) => ({ f, score: nameOverlap(name, f.name) }))
        .sort((x, y) => y.score - x.score);
      // A single-bottle house needs no overlap evidence; otherwise require some.
      if (byBrand.length === 1 || ranked[0].score > 0) return ranked[0].f;
    }
  }
  return pickScanMatch(await search(name, 5), b);
}
