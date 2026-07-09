# DNA V3 — 20 Archetypes + Picker Search: Milestone Plan

_Written 2026-07-09. The consolidated program from three inputs: the archetype audit
(77% of 35 prod users elect the_seducer; 5 labels never elected), FEATURE_ARCHETYPES_V2.md
(centroid engine, 20-label roster, data prerequisites), and FEATURE_PICKER_SEARCH.md
(Chief UX "bring your own bottle" spec). Read those two spec files before starting any
milestone — they are the source of truth for design decisions; this file is the
execution order and the gates._

## Program goal

Ship DNA V3 in Perfume Picks 1.0.5: twenty decisive archetypes elected by a
centroid engine over catalog-normalized taste axes, fed by a picker that lets
enthusiasts search the full catalog for bottles they actually own — with CI
gates that make the everyone-is-one-archetype bug structurally impossible.

## Operating rules (non-negotiable)

- **Live prod app.** All engine changes flag-gated behind the existing DNA
  killSwitch pattern (src/features/dna/killSwitch.ts). No prod DB writes except
  the catalog backfill columns (additive UPDATEs) and the enrich-queue table.
- **Work in a dedicated worktree** on branch `feat/dna-v3` (the repo's main
  checkout is shared with other active sessions — do NOT work on main's
  checkout). Pattern: `git worktree add .claude/worktrees/dna-v3 -b feat/dna-v3`.
- **Milestone autonomy:** when a milestone's exit gates pass, proceed to the
  next without pausing (Bob's standing build-autonomy rule). Stop ONLY at M6
  (device gate — requires Bob) or when a gate cannot be made to pass.
- **Every milestone ends with:** tests green (`npx jest`), tsc clean
  (`npx tsc --noEmit`), a one-paragraph progress note appended to the
  "## Log" section at the bottom of this file, and a commit on `feat/dna-v3`.
- Outbound-facing copy (reveal identity lines, picker strings) gets a humanize
  pass before it's committed (Bob's standing rule).

---

## M0 — Catalog backfill & data audit (server-side only, zero app risk)

The pool is 112 bottles; the axes are dead without these columns.

1. Backfill `release_year` (69/112 missing), `community_projection`,
   `community_sillage`, `community_longevity` (73/112 missing) for all
   dna_eligible bottles. Reuse the enrichment pattern in
   scripts/enrich-notes-llm.mjs (LLM-assisted with source-grounding; write a
   `scripts/enrich-dna-pool.mjs`). Values must be sourced/estimable, not
   hallucinated — flag any bottle where confidence is low instead of guessing.
2. Audit `top_accords` + `fragrance_family` completeness on all 112; fix gaps.
3. Compute + bake the catalog-wide axis distributions (percentile tables for
   the 14 axes in FEATURE_ARCHETYPES_V2.md) → `src/features/dna/axisNorms.ts`
   (generated file with a regeneration script `scripts/build-axis-norms.mjs`).

**Exit gates:** pool coverage ≥95% on year/projection/sillage/longevity;
axisNorms.ts generated + unit test asserting sane ranges; report of per-column
before/after coverage in the Log.

## M1 — Centroid election engine (flag-gated)

1. `src/features/dna/axes.ts`: user feature vector — 14 axes, each the user's
   picks scored against axisNorms (catalog-wide percentiles). Weighted by
   resolvePickWeight (favorites 2.5×, search picks 1.5× when M4 lands).
2. `src/features/dna/centroids.ts`: 20 centroids per the V2 roster (10 kept +
   10 new). Election = weighted-distance argmin; margin = gap(best, runnerUp).
3. Wire into deriveDna behind a `dna_v3_archetypes` flag (killSwitch pattern):
   flag off → legacy SCORERS path byte-identical (no-regression tests).
4. Margin threshold → living-archetype lean mechanic ("X with a Y lean") using
   the existing livingArchetype.ts runner-up plumbing.
5. Fix the compute-lookup trap NOW (needed by M4): startCompute must merge a
   searchPickCache into its byId map instead of silently dropping non-pool
   picks (app/dna/index.tsx:194,206).

**Exit gates:** jest green incl. no-regression suite (flag off = legacy
output on all existing fixtures); replay of ALL real prod pick streams
(fixture pulled read-only from user_taste_profiles) elects ≥8 distinct
archetypes with max share ≤20%.

## M2 — Balance CI gates (the never-again suite)

1. `src/features/dna/__tests__/election-balance.test.ts`:
   - Replay gate (real pick streams, refreshed fixture): ≥8 distinct, max ≤20%.
   - Simulation gate: 10k synthetic pick-sets sampled from the real pool
     (uniform + persona-biased samplers, seeded/deterministic): every one of
     the 20 elected on 2–10% of sets, none >12%, median margin ≥ lean threshold.
2. Tune centroids until gates pass. Tuning is data work, not test-weakening —
   the thresholds in this file are the contract; changing them requires Bob.

**Exit gates:** both gates green in CI; distribution table (label → sim share →
replay share) appended to the Log.

## M3 — Copy, icons, and the share surface for 20

1. revealCopy.ts: name + identity line + icon + tint for all 20 (12 exist,
   8+ new visuals needed from the Ionicons set + brand tints). Identity lines
   get the humanize pass — no AI-marketing words (unlock/discover/elevate…).
2. Web: /i NAMES map updated for all 20 keys (web/src/pages/i.astro) —
   forward-compatible, can deploy ahead of the app.
3. Modifier fold-in on the reveal + share hook: "The {Modifier} {Archetype}"
   display form (~120 combos) per the audit recommendation.

**Exit gates:** every ArchetypeKey has complete copy (exhaustiveness type
test); web builds; share-hook unit test renders modifier form; humanize pass
recorded in Log.

## M4 — Picker search ("bring your own bottle")

Build FEATURE_PICKER_SEARCH.md exactly — entry affordance line, in-place
expand, result shelf, the gold-ring docking, all seven edge states, keyboard
rules, no tray, no reshuffle. Plus:

1. Search backend: name+brand ilike over is_active catalog, completeness gate
   (family + accords present), enrich-on-demand queue table + insert.
2. searchPickedIds store state + SEARCH_DELIBERATE_WEIGHT = 1.5 composition.
3. Analytics: search_opened / search_result_picked / search_no_results /
   search_enrich_requested events (PostHog, same naming style as dna_* events).

**Exit gates:** jest + tsc green; Maestro flow for the picker updated
(search open → pick → dock → mixed 1+4 → compute) passing on simulator;
mobile-UX audit rules verified in the flow (keyboard never hides CTA,
back collapses search first).

## M5 — KPI + rollout instrumentation

1. KPI dashboard: archetype distribution panel (elected label counts, margin
   histogram, search-pick share of picks) so the balance gates are observable
   in prod, not just CI. (Coordinate with the invite-funnel dashboard work —
   another session touched scripts/kpi/; rebase carefully.)
2. Flag rollout plan in the Log: allowlist (Bob) → 100%, mirroring the Pour
   DNA rollout pattern; re-derive note (existing users re-elect on next
   recompute — expected, lean/swap covers identity changes).

**Exit gates:** dashboard renders the new panel against prod (read-only);
rollout checklist written.

## M6 — DEVICE GATE (Bob required — loop STOPS here)

Console-launch-verify on Bob's device (standing rule: tsc+vitest green ≠
runs): flag on for Bob's account → retake DNA → search a bottle → gold-ring
dock → mixed picks → reveal shows a V3 archetype with modifier → share hook
renders → no Skia/undefined-font crashes. Then: 1.0.5 build + submit (after
1.0.4 is approved+released), flag ramp per M5 plan.

---

## Log

_(appended by each milestone run — newest at top)_

**2026-07-09 — M2 complete (balance CI gates, centroids tuned to pass both).** New suite `__tests__/features/dna/electionBalance.test.ts` carries BOTH contract gates. **Replay gate** (fixture refreshed via `scripts/refresh-replay-fixture.mjs` — byte-identical to M1's pull, still 31 streams/30 bottles): ≥8 distinct + max ≤20% → **14 distinct, max 19.4% (the_seducer 6/31), 21/31 leans**. **Simulation gate:** 10,000 synthetic pick-sets from a new prod-baked fixture (`scripts/refresh-sim-pool-fixture.mjs`, read-only → `fixtures/sim-pool.json`: the real 112-bottle dna_eligible pool + a seeded 400-bottle full-catalog sample that ONLY the labeled search-enthusiast persona draws from, since pool adventurousness is ~constant 0). Samplers: seeded mulberry32 (no Math.random), uniform 1–5-pick sets (20%) + 18 persona-biased samplers spanning the axis space (the eleven from the plan + search-enthusiast + axis-completion personas: luxe-polished, loud-presence, more-is-more, skin-scent, green-nature, one-family-loyalist); Gaussian affinity sampling (σ=0.13) with structural constraints (one-family / distinct-families) where the loyalty/breadth axes need them. Gate: every label 2–10%, none >12%, median margin ≥ V3_LEAN_MARGIN → **min 2.67% (the_purist), max 9.20% (the_explorer), median margin 0.0404, 50.3% decisive. V3_LEAN_MARGIN unchanged at 0.04.** Suite runs in ~1s (per-bottle percentiles + per-persona affinities precomputed once; sim uses deriveAxes+electArchetype directly, replay uses full deriveFragranceDNA). Distribution (label → sim share → replay share): executive 3.62%→3.2% · seducer 6.57%→19.4% · connoisseur 5.38%→9.7% · signature_wearer 3.30%→3.2% · purist 2.67%→0 · showstopper 4.02%→6.5% · smart_shopper 5.43%→0 · romantic 7.77%→6.5% · explorer 9.20%→6.5% · classicist 5.45%→3.2% · gourmand 5.93%→12.9% · minimalist 3.44%→0 · naturalist 6.38%→3.2% · trendsetter 4.43%→3.2% · old_soul 4.64%→0 · maximalist 5.56%→9.7% · night_owl 4.72%→6.5% · spice_trader 3.66%→6.5% · daybreaker 2.98%→0 · soft_focus 4.85%→0 (zero-replay labels are the quiet/value/vintage corners the 31 mainstream-loud real streams genuinely don't contain; the sim gate is their coverage guarantee). **Tuning (all placement work, thresholds untouched):** purist was a universal sink at 15% (presence t=0.35 ≈ pool median — a mid-pool centroid absorbs every unremarkable set) → now demands near-silence + all accord floors (presence 0.15, +florality/greenness repellers); romantic dropped presence from its mask entirely (real pool florals sit at presence .06–.32, the old t=0.6 handed soft florals to purist) and targets the true feminine genderLean value 0.89; minimalist moved below the pool median (presence 0.22, warmth 0.28) — it died at 0.67% above it; daybreaker pinned to COLD fresh (warmth 0.05) with floor targets; showstopper's presence t MUST stay extreme (0.97) — pulling it to the reachable p90 made it the sink for real mainstream-loud prod streams (replay hit 26–32% during tuning; comment in centroids.ts records this); seducer darkness eased to 0.55 (pool darkness is floor-bound for 75% of bottles) + sweetness w↑ 0.8 as the dry/sweet splitter against spice_trader, which lost warmth from its mask entirely (warm-spicy accords feed BOTH raw scores — weighting warmth there just re-fights the seducer) and gained a sweetness repeller; explorer = the UNANCHORED variety-seeker (loyalty w 1.2 — family entropy is near-max for any 4–5-pick set, so breadth alone hands it every multi-family wardrobe) vs maximalist = the loud ⭐-anchored broad wardrobe (presence 0.68/breadth 0.95/loyalty 0.25); trendsetter era t to the pool-reachable 0.78; old_soul dropped luxury ("any price" is the spec); classicist era w↑ 1.4, connoisseur darkness w↑ 0.8 + breadth w↑ 1.0 vs executive, whose floor-targeted darkness/spice axes proved to be load-bearing repellers (removing them thinned margins everywhere — reverted, comment records it). **Gates re-verified after tuning:** full `npx jest` green (36 suites / 485 tests incl. the M1 no-regression suite), `npx tsc --noEmit` = identical 29-error pre-existing baseline, 0 new. Notes for M3: replay seducer share (19.4%) sits 0.6pt under the 20% ceiling — the next fixture refresh may need a placement nudge; ARCHETYPE_COPY still has 8 placeholder entries (M3's authored+humanized pass); sim personas encode the M4 search-pick assumption that full-catalog picks carry adventurousness ≈ 0.51 vs pool ≈ 0 — M4 should keep search picks flowing through the same axis pipeline unchanged.

**2026-07-09 — M1 complete (centroid election engine, flag-gated).** The 20-archetype centroid engine is live behind the new `dna_v3_archetypes` flag (fail-CLOSED, opposite of the kill-switches: off unless the app_settings row is explicitly truthy; sync cache in `src/features/dna/v3Flag.ts`, remote resolver `useDnaV3ArchetypesEnabled` in killSwitch.ts, mounted on the picker screen). New modules: `axisScore.ts` (canonical raw-score formulas — extracted from build-axis-norms.mjs, which now documents TS as canonical; NULL fields skip an axis, luxury imputes tier medians), `axes.ts` (14-axis user vector: catalog axes as resolvePickWeight-weighted percentile means honoring explicit pick.weight; breadth = family entropy, loyalty = tightness + ⭐ anchor, both evidence-damped to 0.5 at 1 pick so single-pick users don't all collapse onto Signature Wearer), `centroids.ts` (20 centroids with per-axis weight masks, weighted-RMS argmin, margin = d(runnerUp) − d(best), lean below V3_LEAN_MARGIN=0.04 surfaced via the existing challenger/leaning fields → "X with a Y lean" renders through LivingArchetypeReadout unchanged). Wired into both deriveFragranceDNA and deriveLivingDNA (v3 ranked list feeds applyLivingArchetype); 10 new ArchetypeKeys added to types.ts + placeholder ARCHETYPE_COPY entries (TODO M3 authored pass). Compute-lookup trap fixed: `useDnaPickerStore.searchPickCache` (+`cacheSearchPick`, empty until M4) merges into startCompute's byId so non-pool picks survive to the DNA. Replay fixture: `scripts/refresh-replay-fixture.mjs` (read-only; users anonymized u01…; catalog is keyed by SLUG — the seeds' id) → `__tests__/features/dna/fixtures/replay-picks.json`, 31 real prod streams / 30 bottles. **Gates:** `npx jest` green (35 suites / 482 tests; the pre-existing worker force-exit warning reproduces on the pre-M1 tree — not introduced here), incl. no-regression (flag off byte-identical to legacy over all 31 real streams + referencePool path + living path) and the replay gate. `npx tsc --noEmit`: identical 29-error baseline set, 0 new. **Replay distribution (flag on, 31 streams — legacy elected the_seducer on 28/31):** the_romantic 5 (16.1%) · the_spice_trader 3 · the_connoisseur 3 · the_maximalist 2 · the_seducer 2 · the_executive 2 · the_gourmand 2 · the_showstopper 2 · the_night_owl 2 · the_explorer 2 · the_signature_wearer 2 · the_old_soul 1 · the_classicist 1 · the_soft_focus 1 · the_purist 1 → **15 distinct (gate ≥8), max share 16.1% (gate ≤20%)**; 21/31 within the lean margin (honest straddles on mainstream 1–3-pick profiles). Tuning notes for M2: adventurousness is ~constant 0 across the all-popular pool (percentile of tier-4/5 bottles vs full catalog) — no centroid may depend on it to fire (unit-enforced w ≤ 0.3); zero-signal accord axes sit at tied-block midpoints (darkness ≈0.43, spice ≈0.33, greenness ≈0.30, florality ≈0.23), so "high" targets must clear those floors. Five labels unelected on replay (smart_shopper, minimalist, naturalist, trendsetter, daybreaker) — all proven reachable by the centroids unit test (each wins on its own target point); M2's 10k-simulation gate covers their real coverage.

**2026-07-09 — M0 complete (catalog backfill & axis norms).** Backfilled the 112-bottle dna_eligible pool via `scripts/enrich-dna-pool.mjs` (LLM-assisted, claude-opus-4-8, dry-run reviewed then live; only NULL fields written, low-confidence rows skipped): 110 bottles updated, 284 fields. Coverage before → after: release_year 43/112 (38.4%) → **111/112 (99.1%)**, community_projection 39/112 (34.8%) → **111/112 (99.1%)**, community_sillage 39/112 → **111/112 (99.1%)**, community_longevity 39/112 → **111/112 (99.1%)** — gate ≥95% met on all four (verified with live count queries). Skipped (low confidence, left NULL): the feminine "Dylan Blue" row (`versace-dylan-blue-perfume-for-women`, missing release_year) and Hermès Rose Amazone (missing all three community_* — thin community data). top_accords gaps (7 bottles) filled by deriving from each row's own accord_intensity keys (no LLM); fragrance_family had zero gaps. `scripts/build-axis-norms.mjs` pulls the full is_active catalog (10,481 rows, paginated) and generates `src/features/dna/axisNorms.ts`: percentile tables (101 quantiles, min-max normalized, mean-rank tie handling in `axisPercentile()`) for the 12 catalog-derived axes; breadth + loyalty documented as user-relative (no catalog norm). Unit test at `__tests__/features/dna/axisNorms.test.ts` (repo's jest `roots` is pinned to `<rootDir>/__tests__`, so the test lives there rather than `src/**/__tests__`). Tests: this repo runs **jest**, not vitest (the "npx vitest run" wording in the gates is a cross-project slip) — `npx jest` green, 30 suites / 422 tests; also fixed `jest.config.js` `testPathIgnorePatterns` to anchor `/.claude/worktrees/` to `<rootDir>` so the suite can run from inside a worktree at all. tsc: 0 errors in M0 files; 29 pre-existing baseline errors in untouched ETL/web files (identical set exists on main — not introduced here, candidates for a separate cleanup).
