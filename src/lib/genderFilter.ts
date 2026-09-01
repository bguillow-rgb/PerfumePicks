/**
 * Audience preference — which fragrances the app shows this user.
 *
 * WHY IT EXISTS: a user reported there was no way to say "I wear men's
 * fragrances", and the app had a worse default hiding in it —
 * app/discover/brand/[brand].tsx shipped a "For Her" toggle defaulting to
 * feminine+unisex, so every brand page assumed the user was a woman.
 *
 * WHY UNISEX SITS ON BOTH SIDES: unisex is 6,190 of 10,371 active bottles (60%).
 * Filtering "Men's" to masculine-only would cut the catalog to 1,618 and the DNA
 * picker to 376 tiles, hiding most niche and nearly everything modern. Men's =
 * masculine + unisex (7,808 / 1,052 in the picker); Women's = feminine + unisex
 * (8,670 / 1,212). Verified 2026-08-29 against the live catalog.
 *
 * WHY "EVERYTHING" IS A REAL OPTION, NOT A FOOTNOTE: an aggregate behavioural
 * read of the live user base (owned/worn/picked bottles joined to their gender,
 * unisex excluded as uninformative) found NO skew — masculine 40% / feminine 36%
 * / mixed 25%, and among the most engaged users the mixed share rises to ~46%.
 * Collectors genuinely wear both, so a hard split would hide bottles our best
 * users demonstrably want.
 *
 * NULL GENDER: 83 active bottles have gender IS NULL. A plain `IN (...)` drops
 * them silently, so callers must include nulls — see genderFilterClause.
 */

export type GenderPref = 'mens' | 'womens' | 'all';

export const GENDER_PREF_OPTIONS: {
  value: GenderPref;
  label: string;
  detail: string;
}[] = [
  { value: 'mens', label: "Men's", detail: 'Masculine and unisex fragrances' },
  { value: 'womens', label: "Women's", detail: 'Feminine and unisex fragrances' },
  { value: 'all', label: 'Everything', detail: 'The full catalogue, nothing hidden' },
];

/** The default for anyone who has not chosen — show everything, hide nothing. */
export const DEFAULT_GENDER_PREF: GenderPref = 'all';

/**
 * Catalog `gender` values to keep, or undefined for "no filter".
 * undefined (not an empty array) is what the catalog store already treats as
 * unfiltered, so this drops straight into the existing `genders` parameters.
 */
export function gendersFor(pref: GenderPref | null | undefined): string[] | undefined {
  switch (pref) {
    case 'mens':
      return ['masculine', 'unisex'];
    case 'womens':
      return ['feminine', 'unisex'];
    default:
      return undefined;
  }
}

/** True when this bottle should be visible under `pref`. Null gender counts as unisex. */
export function matchesGenderPref(
  gender: string | null | undefined,
  pref: GenderPref | null | undefined,
): boolean {
  const allowed = gendersFor(pref);
  if (!allowed) return true;
  // Unknown gender behaves as unisex rather than disappearing from every view.
  const g = (gender ?? 'unisex').toLowerCase();
  return allowed.includes(g);
}

/**
 * PostgREST `or=` clause for a gender filter that also keeps NULL rows.
 * `.in('gender', [...])` alone drops the 83 null-gender bottles.
 */
export function genderOrClause(pref: GenderPref | null | undefined): string | null {
  const allowed = gendersFor(pref);
  if (!allowed) return null;
  return `gender.in.(${allowed.join(',')}),gender.is.null`;
}
