/**
 * Canonical text normalization for catalog search.
 *
 * `ilike` in Postgres is case-insensitive but NOT accent-insensitive, so
 * searching the raw `name` column meant typing the natural spelling
 * ("hermes", "lancome", "meteore") returned zero rows for the bottles stored
 * with accents ("Hermès", "Lancôme", "Météore"). Both sides of the search now
 * run through this normalization: the client normalizes the query, and
 * Postgres stores a normalized mirror of each name in `name_normalized`
 * (see supabase/migrations/202607151200_accent_insensitive_search.sql).
 *
 * This is deliberately identical to normalizeStr() in
 * scripts/lib/affiliate-etl-base.ts — that function already builds every slug
 * in the catalog, so matching it keeps the ETL, the client, and the database
 * in agreement. If you change one, change all three (the SQL function has a
 * matching accent map and a parity test).
 *
 * Note: only accents that Unicode decomposes into "base letter + combining
 * mark" are stripped. Standalone letters like ø, æ, ß, and đ are not accented
 * forms of an ASCII letter, so they collapse to a space like any other
 * non-alphanumeric character.
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents (Hermès → hermes)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
