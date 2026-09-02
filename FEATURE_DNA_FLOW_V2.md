# Fragrance DNA Onboarding Flow v2

Status: DRAFT for review. No code written yet.
Author: audit-driven spec, 2026-06-28.

Goals:
1. Fewer taps to reveal (remove the refine step).
2. Picks treated as "loved", not owned (also fixes a wardrobe-corruption bug).
3. Collapse the three duplicate DNA surfaces into ONE canonical scrolling page.
4. A monetizable top-match card on that page, affiliate-first and most-expensive-first.
5. A "show me more matches" results page sorted most expensive to cheapest.

---

## 1. Why we are changing this

### Problem A: too many taps to reveal
Today: grid -> refine ("ALMOST THERE", own/want/like) -> reading -> reveal -> tap again -> first match opens as a separate `/fragrance/{id}` route. Too many taps before the user sees who they are.

### Problem B: the refine screen corrupts wardrobe data
In `app/dna/index.tsx` `startCompute` (line ~152) the relation defaults to `'own'` (`relations[f.id] ?? 'own'`). Users blow past the refine screen without tapping a chip, so loved scents get written to the wardrobe as **owned** bottles (status `'have'`, 100ml). Data confirms it: only 3 users have ever tagged a relation (1 own, 5 want, 0 like ever), while ~10 users show the identical phantom "3 have / 0 want" pattern. That pollutes `deriveWardrobe(owned)`. Removing the screen and treating picks as taste-only `'like'` fixes this.

### Problem C: three different pages all say "your fragrance DNA"
The same `FragranceDNA` object is rendered by three separate components, two of which are near-duplicates:

| Surface | File | Header | Content |
|---|---|---|---|
| Reveal (after picker) | `src/components/dna/DnaReveal.tsx` | "YOUR FRAGRANCE DNA" | emblem, archetype, identity, journey, traits, share, accord radar |
| Home card (Today hero) | `src/components/dna/UnifiedDnaCard.tsx` | "YOUR FRAGRANCE DNA" | archetype, identity, readout, picks rail, journey + "Learn more ->" |
| Taste Profile (Learn more target) | `app/taste-profile.tsx` | "MY FRAGRANCE DNA" | archetype, identity, readout, journey, traits, retake, JourneyLadder, notes, accords, families, avoid, price/longevity |

The Reveal and the Taste Profile are the same identity told twice. Taste Profile is literally Reveal plus the deeper signal sections scrolled below. Two separate pages for the same thing is confusing and triples the maintenance cost of any DNA copy change.

---

## 2. Target architecture: ONE canonical DNA page

There is one DNA page. It is the user's passport. It is `app/taste-profile.tsx` (the existing re-viewable surface), restructured into a single scroll:

```
[ celebration header — only on first view after the picker ]
  emblem + archetype name (spring-in) + identity + share        (from DnaReveal)
  one-time success haptic + DNA_REVEAL_VIEWED analytics

TOP MATCH CARD                                                   (NEW, monetizable)

YOUR ACCORD PROFILE (radar)
LivingArchetypeReadout
journey line + trait chips
[ deeper signals — scroll ]
  JourneyLadder
  YOUR TOP NOTES / PREFERRED ACCORDS / FAMILIES / AVOID
  price + longevity
Retake

footer CTA: "Show me more matches"  -> matches results page
```

- **The post-picker reveal is this same page** rendered with a `celebrate` flag that turns on the one-time animations, haptic, and share affordance pinned at top. It is not a separate component anymore.
- **The Home `UnifiedDnaCard` stays as a compact teaser.** "Learn more ->" and the picks rail both deep-link into the one page (optionally scroll-anchored to a section). It does NOT render the full identity itself beyond the teaser.
- **`src/components/dna/DnaReveal.tsx` is deleted.** Its unique pieces (spring-in name animation, success haptic, share sheet, `DNA_REVEAL_VIEWED` / `DNA_REVEAL_SHARED` analytics) move into the celebration header of the one page. The accord radar it shows already exists on the Taste Profile concept, so it stops being duplicated.

Net: one place to edit DNA copy, one scroll, no "why am I seeing this twice."

---

## 3. Target flow (new)

```
grid (pick the ones you love)
   |
   v   picks recorded as relation 'like' (taste-only, NOT seeded to wardrobe)
read Fragrance DNA  (reading animation)
   |
   v
DNA PAGE (celebrate=true)
   - celebration header (archetype spring-in, haptic, share)
   - TOP MATCH CARD                      (affiliate-first, most expensive)
   - accord profile / readout / journey / traits
   - scroll -> deeper signals (notes, families, avoid, price/longevity, ladder)
   - footer CTA: "Show me more matches"
   |
   v
MATCHES RESULTS PAGE
   - frags ranked from the picker bottles
   - affiliate-link-first, sorted most expensive -> cheapest
```

Later, from Home: `UnifiedDnaCard` "Learn more ->" routes to the SAME DNA PAGE (celebrate=false, no animations).

---

## 4. Requirement-by-requirement

### R1. Remove the "ALMOST THERE" / refine screen
- Delete the refine render block in `app/dna/index.tsx` (lines ~376-463): title "Own it, want it, or just love the scent?", the own/want/like chips, the "Read my Fragrance DNA" CTA.
- Rewire the grid CTA (line ~551-564). Today: `onPress={() => setStep('refine')}`, label `Continue with {count}`. New: call `startCompute()` directly; relabel to `Read my Fragrance DNA`.
- Remove `'refine'` from the `step` union and all `setStep('refine')` references. Remove the `relations` state object and refine chip handlers.

### R2. Treat picker selections as "loved", not owned
- In `startCompute`, every pick is `relation: 'like'` (taste-only). Remove the `?? 'own'` default.
- `'like'` must NOT seed the wardrobe. Confirm the own->'have' / want->'want' wardrobe write (lines ~160-186) is skipped entirely.
- Keep recording picks to the pick-stream / `dna_picker_events` so DNA still computes; the relation tag on those events is `'like'`.
- This removes the phantom-owned write and fixes `deriveWardrobe`.

### R3. Collapse Reveal + Taste Profile into one page
- `app/taste-profile.tsx` becomes the single DNA page. Add a `celebrate` route param (default false).
- When `celebrate=true`: render a top celebration header carrying the spring-in archetype name, the one-time success haptic, the `DNA_REVEAL_VIEWED` analytics, and the "Share your DNA" affordance. Migrate these from `DnaReveal.tsx`.
- When `celebrate=false` (the everyday re-view from Home / You tab): no animations, no haptic, plain header.
- Delete `src/components/dna/DnaReveal.tsx` and its render in `app/dna/index.tsx` (lines ~351-364). After `startCompute`/reading completes, route to the DNA page with `celebrate=true` instead of mounting `DnaReveal`.
- `UnifiedDnaCard` "Learn more ->" (`onLearnMore`) and the existing You-tab entry point both route to this one page (celebrate=false). Confirm there is no other component rendering the full identity block.

### R4. Top-match card on the DNA page
- Place a top-match card directly under the celebration/identity header, ABOVE the accord profile.
- Card content: the single best match that (a) has a live affiliate link and (b) is the most expensive among well-matched candidates (ranking in R5). Show image, brand + name, a short "why it matches" line (reuse `reasons` from `scoreFragranceDNA`), price, and a primary action that opens the affiliate link / product page.
- The DNA page needs the computed top match passed in (today `taste-profile.tsx` recomputes its profile on entry; the top match should be computed from the same DNA + retailer-links data). Decide whether the page computes it on entry or receives it via route/state from `app/dna/index.tsx` on the first reveal. Proposal: the page computes it on entry so it is correct on every re-view, not just right after the picker.

### R5. Ranking layer: affiliate-first, then most-expensive-first
Net-new. `scoreFragranceDNA` / `rankWithRelaxation` are fit-only and monetization-blind. We add a layer on top; we do NOT change the scoring math.

- **Candidate fit:** keep `rankWithRelaxation(recPool, dna)` for fit-ranked recs (still guarantees >=1 via price->projection->gender relaxation).
- **Affiliate gate:** join each candidate to `fragrance_retailer_links`. A fragrance is "buyable" when it has at least one row with `link_status` ok, `in_stock` true, and non-null `price_cents` / `url`. Extend `useRetailerLinksStore` (today it builds `priceBySlug` as the **cheapest** `price_cents` per slug; we additionally need the affiliate `url` and the **max** price per slug for the expensive-first sort).
- **Top match (R4):** among candidates that pass a fit threshold AND are buyable, pick the **most expensive** (highest affiliate `price_cents`, fall back to `retail_msrp_usd_cents`). This is "the best matched perfume that we have an affiliate link for and is most expensive."
- **Decision needed (flag for review):** define the fit threshold / candidate pool size before the expensive-first tiebreak, so we do not surface a barely-matching but pricey bottle as the hero. Proposal: take the top N fit-ranked buyable candidates (N=10), then sort those by price descending and take the most expensive as the hero. Confirm N.

### R6. "Show me more matches" results page (new screen)
- New route, e.g. `app/dna/matches.tsx` (confirm path/name). The DNA page footer CTA "Show me more matches" routes here.
- Content: frags ranked from the picker bottles, **affiliate-link-first** and **sorted most expensive -> cheapest**.
- Source list = the same buyable, fit-passing candidate pool from R5, sorted by affiliate `price_cents` descending (then `retail_msrp_usd_cents` desc as fallback).
- Each row: image, brand + name, price, fit reason, affiliate action.
- **Decision needed:** non-buyable frags (no live affiliate link) excluded (proposed, since the page's purpose is monetizable matches) or demoted to bottom.

---

## 5. Files touched (summary)

| File | Change |
|---|---|
| `app/dna/index.tsx` | Remove refine step (R1); grid CTA -> `startCompute` direct; relations all `'like'`, no wardrobe seed (R2); after reading, route to DNA page `celebrate=true` instead of mounting DnaReveal (R3); compute top match + match pool (R4, R5) |
| `app/taste-profile.tsx` | Becomes the single DNA page; add `celebrate` param + celebration header migrated from DnaReveal (R3); add top-match card above accord profile (R4); footer CTA "Show me more matches" -> matches page (R6) |
| `src/components/dna/DnaReveal.tsx` | **Deleted.** Spring-in name, haptic, share, reveal analytics migrate into the DNA page celebration header (R3) |
| `src/components/dna/UnifiedDnaCard.tsx` | Stays a compact teaser; "Learn more ->" routes to the one DNA page, celebrate=false (R3) |
| `src/features/dna/score.ts` | No math change. New ranking/selection helper layered on `rankWithRelaxation` for affiliate-gate + expensive-first (R5) |
| `src/stores/useRetailerLinksStore.ts` | Expose affiliate `url` and **max** price per slug (today only cheapest) + a buyable check (R5) |
| `app/dna/matches.tsx` (new) | Results page, affiliate-first, expensive->cheap (R6) |

---

## 6. Open decisions for you to confirm

1. **Fit-vs-price tradeoff (R5):** candidate pool size N before the expensive-first sort. Proposed N=10.
2. **Non-buyable frags on the results page (R6):** exclude entirely (proposed) or demote to bottom.
3. **Matches page route name:** `app/dna/matches.tsx` ok?
4. **Grid CTA label** after removing refine: keep "Read my Fragrance DNA"?
5. **Top match computation locus (R4):** compute on DNA-page entry (proposed, correct on every re-view) vs pass in from the picker once.
6. **Wardrobe entry point:** with picks no longer seeding the wardrobe, how does a user populate their wardrobe now? Confirm we are intentionally cutting the onboarding-time wardrobe seed.

---

## 7. Out of scope (tracked separately)

- The guest persist storm (issue #1): device-global pick-stream queue surviving an Apple sign-in that mints a new uid via `signInWithIdToken`, causing cross-uid UPDATE 403/42501 retry loops. Fix is `linkIdentity` + clear pick-stream on uid change + flush() author-uid guard. Not part of this redesign, but the pick-stream still runs in this flow.

---

## 8. Build log

### M1 — flow rewire + ranking layer (code complete, branch `claude/dna-flow-v2`)

Implemented:
- `src/features/dna/score.ts` — pure `rankBuyableMatches(candidates, dna, getBuyable, opts)` layered on `rankWithRelaxation`; returns `{ hero, matches, fallbackUsed }`. Hero = most expensive among the top-`HERO_FIT_POOL` (=10) best-FIT buyable candidates; `matches` = all other buyable, price desc; zero-buyable → hero is the top fit rec with `buyable: null` and `fallbackUsed: true`. No scoring-math change.
- `src/stores/useRetailerLinksStore.ts` — added `buyableBySlug: Map<slug, {priceCents, url}>` built in the same pagination pass as the (unchanged) cheapest `priceBySlug`. Representative = highest-priced buyable row per slug, url paired. `getBuyable(slug)` getter.
- `src/features/dna/killSwitch.ts` — `useDnaMonetizationEnabled()` (reads `app_config.dna_monetization_enabled`, fail-open) gating the monetization SURFACES only, not the reveal.
- `app/dna/index.tsx` — removed the refine (“ALMOST THERE”) screen + dead styles; grid CTA → `startCompute()` directly, label “Read my Fragrance DNA”; every pick `relation: 'like'` (taste-only); deleted the wardrobe seed + `useWardrobeStore` import + `relations`/`setRelation`/`selectedFrags`.

Mark Z gate: **Patch (verify, don't rewrite) → ship to M1 gate.** No regression (DNA derivation byte-identical: `'like'` and the old `'own'` default both weight 1.0 in `pickWeight`). His #1 silent-failure risk **verified clear**: `SELECT DISTINCT link_status, in_stock` over all 8,356 `fragrance_retailer_links` rows → `link_status` is exactly `'ok'` (8317) / `'dead'` (39); `in_stock` is a real boolean; the gate yields **3,796 buyable rows** (non-empty index, hero path works in prod).

### M2 entry criteria (Mark Z mandate — blockers, do NOT skip)

1. **Supabase must be configured in the QA dev client.** `load()` early-returns when `!isSupabaseConfigured`, so on a sim without Supabase `buyableBySlug` is empty and the hero is ALWAYS the no-buyable fallback. Verify, or the M2 hero QA is fallback-only theater.
2. **M2 caller contract:** `await useRetailerLinksStore.getState().load()` and gate the hero compute on `loaded === true` before calling `rankBuyableMatches`. A half-loaded index silently demotes buyable bottles to fallback.
3. **Add `EVENTS.DNA_TOP_MATCH_NO_BUYABLE`** (does not yet exist in `src/lib/observability/events.ts`) and log it on `fallbackUsed`. Without it we're blind to monetization-miss rate.
4. **Open the buy URL through the CJ affiliate wrapper** (website ID 101759456), not raw `Linking.openURL`, or clicks go unattributed and the commission is lost.
5. **Founder decisions to confirm before rendering:** (a) representative price = MOST expensive retailer even when CompactCard shows a cheaper “from $X” for the same bottle (price inconsistency across surfaces); (b) NO fit floor on the “more matches” list (expensive-first can put a barely-fit pricey bottle on top); (c) are the user’s own picks eligible to be the hero?
6. **Empty-wardrobe smoke:** new users now finish onboarding with an empty wardrobe (seed deleted). Confirm Today/You render a clean empty-state, no crash.

### QA flows
- `tests/maestro/generated/dna-v2-baseline.yaml` — documented BEFORE-state (asserts the removed refine screen; expected to fail post-M1).
- `tests/maestro/generated/dna-v2-flow.yaml` — M1 acceptance written against the OLD entry assumption (Home “SCENT OF THE DAY” → hero DNA CTA → picker). Superseded by `dna-v2-m1-accept.yaml`.
- `tests/maestro/generated/dna-v2-m1-accept.yaml` — **the canonical passing M1 flow.** Reflects shipped reality: the picker is the FIRST screen for a fresh user (per `killSwitch.ts`), so it waits on `dna-picker-grid` directly, picks 3 tiles, asserts the CTA matches `.*Read my Fragrance DNA.*`, taps `dna-picker-continue`, asserts `ALMOST THERE` is NOT visible, then waits for `.*FRAGRANCE DNA.*`.

### M1 qa-tester gate — **PASSED** (2026-06-28, on-device sim)

Ran on a **freshly compiled local dev client** (iPhone 17 Pro, iOS 26.5). The 5/18 EAS `development` sim build was too stale — it predates `expo-notifications` being added natively and red-screened on launch with `Cannot find native module 'ExpoPushTokenManager'`. Rebuilt locally via `expo run:ios` (after fixing the CocoaPods ASCII-8BIT locale bug with `LANG/LC_ALL=en_US.UTF-8`); the fresh client includes both `expo-notifications` and Skia and runs current JS clean.

Result — all assertions green:
- Fresh user lands **directly on the picker grid** (“Pick the ones you love”); 0-pick CTA reads “Pick at least one”.
- After picking 3 tiles the CTA reads **“Read my Fragrance DNA →”** (NOT “Continue with N”).
- Tapping it goes **straight to the reading beat → reveal**; the **“ALMOST THERE” refine screen never appears** (assertNotVisible passed).
- Reveal renders a full valid DNA (“The Romantic”, identity + journey lines, trait chips, accord radar, “See my top match” CTA).
- **Empty-wardrobe smoke folded in (M2 entry criterion #6):** fresh install, empty wardrobe, picks = taste-only `'like'` (no seed) — the DNA computed and the reveal rendered with no crash, confirming the deleted wardrobe seed caused no derivation regression.
