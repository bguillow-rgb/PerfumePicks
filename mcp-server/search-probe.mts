/**
 * search-probe.mts — the regression check this server has never had.
 *
 * Search has now been broken twice in ways that unit tests over a fixture
 * would not have caught, because the failures were about how real catalog rows
 * interact with PostgREST filters and popularity-ordered candidate windows
 * (2026-10-16: AND-ed terms, word boundaries, gendered synonyms, an 80-row
 * candidate cap that hid the right answer). So this probe runs the real code
 * against the real catalog.
 *
 * READ-ONLY: it calls searchFragrances/resolveFragrance, which issue SELECTs
 * only. Safe to run against production, which is the point.
 *
 * Run: npx tsx search-probe.mts   (exits non-zero if an expectation fails)
 */
import { searchFragrances, resolveFragrance, displayName } from "./src/fragrances.js";

/** [query, substring the top hit must contain, why this case exists] */
const SEARCHES: [string, string | null, string][] = [
  ["Pure XS For Her", "pure xs women", "her -> women; the 2026-10-16 defect"],
  ["Pure XS For Him", "pure xs men", "mirror case, must not match the women's row"],
  ["Dior Homme Intense", "Dior Homme Intense", "homme in a real name still resolves"],
  ["Bleu de Chanel", "Bleu de Chanel", "exact name beats the pricier Parfum flanker"],
  ["Bleu de Chanel Parfum", "Bleu de Chanel Parfum", "the flanker is still reachable by its own name"],
  ["Good Girl", "Good Girl", "pillar must not lose to Good Girl Supreme/Blush/Legere"],
  ["Eternity", "Eternity", "pillar vs its many flankers"],
  ["Acqua di Parma Fico di Amalfi", "Fico di Amalfi", "brand words live in the slug"],
  ["Terre d'Hermes", "Terre D'Hermes", "apostrophes"],
  ["Louis Vuitton Ombre Nomade", "Ombre Nomade", "added 2026-10-16"],
  ["Good Girl Gone Bad", "Good Girl Gone Bad", "multi-word, no connectives"],
  ["zzqqxx not a real fragrance 12345", null, "nonsense must return nothing"],
  ["for the and of", null, "an all-connective query must not match everything"],
];

/** [reference, substring the resolved row must contain] */
const RESOLVES: [string, string | null][] = [
  ["Pure XS For Her", "pure xs women"],
  ["Pure XS For Him", "pure xs men"],
  ["Bleu de Chanel", "Bleu de Chanel"],
  ["Ombre Nomade", "Ombre Nomade"],
  ["zzqqxx not real 12345", null],
];

let failed = 0;
const check = (label: string, got: string | null, want: string | null, why = "") => {
  const ok = want === null ? got === null : got !== null && got.toLowerCase().includes(want.toLowerCase());
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(46)} -> ${got ?? "(none)"}${why ? `   [${why}]` : ""}`);
};

for (const [q, want, why] of SEARCHES) {
  const rows = await searchFragrances({ query: q, limit: 3 });
  check(`search ${JSON.stringify(q)}`, rows.length ? displayName(rows[0]) : null, want, why);
}
for (const [ref, want] of RESOLVES) {
  const f = await resolveFragrance(ref);
  check(`resolve ${JSON.stringify(ref)}`, f ? displayName(f) : null, want);
}

console.log(failed ? `\n${failed} expectation(s) failed` : "\nall expectations held");
process.exit(failed ? 1 : 0);
