# Archetypes V2 — 20 Decisive DNA Labels

_Spec drafted 2026-07-09 from the label audit (77% of prod users elect the_seducer; 5 of 11
labels never elected across 35 real profiles). Goal per Bob: ~20 archetypes, each decisive,
variety grounded in real data._

## Why the current design can't reach 20

Election today is argmax over hand-tuned weighted sums (archetype.ts SCORERS). Each new
scorer reshapes every other scorer's basin — at 11 labels one basin (Seducer) already
captures 77% because it stacks three signals that are mainstream-correlated and the
outcome inputs are centered on an absolute 0.5 instead of the pool mean. Adding 9 more
scorers to that argmax means hand-balancing 20 interacting basins by feel. Not viable.

## Architecture: centroid election in a pool-normalized taste space

1. **User feature vector** — every axis is that user's picks scored as percentiles
   *within the 112-bottle DNA picker pool* (the fix that already works for traits),
   so axes spread by construction:

   | Axis | Source columns (real, verified in prod catalog) |
   |---|---|
   | warmth | warm accords (amber/spicy/vanilla) vs fresh/citrus/aquatic |
   | sweetness | sweet/vanilla/gourmand accords + gourmand family |
   | florality | floral family + floral/rose/jasmine/powdery accords |
   | presence | community_projection + community_sillage + accord_intensity |
   | luxury | price_tier / retail_msrp percentile |
   | adventurousness | inverse popularity_tier percentile within pool |
   | era | release_year percentile |
   | greenness | green/earthy/aromatic accords |
   | darkness | leather/tobacco/oud/smoky accords |
   | spice | spicy/warm-spicy accords |
   | breadth | family entropy across picks |
   | loyalty | signature outcome + wardrobe tightness |
   | value | inverse price percentile × versatility_score |
   | gender-lean | gender column blend |

2. **Each archetype = a centroid** (target profile over those axes) + copy + icon/tint.
   Election = weighted-distance argmin. Centroids are placed to tile the space —
   distribution balance is a *placement* property you can test, not an emergent
   accident of 20 fighting scorers.

3. **Decisiveness = margin.** If (best − runnerUp) ≥ threshold → clean reveal. Below
   threshold → the existing living-archetype lean mechanic renders "The X with a Y
   lean". Decisive by design, honest when the data genuinely straddles.

4. **Balance is CI-enforced, not vibes:**
   - Replay gate: all real pick streams (35 today, grows weekly) re-derived — max
     share ≤ 20%, ≥ 8 distinct labels elected.
   - Simulation gate: 10k synthetic pick-sets sampled from the real pool (uniform +
     persona-biased) — every archetype elected on 2–10% of sets, none > 12%, median
     margin above the lean threshold.

## The 20-label roster (signal signatures, names get Bob's taste pass)

Kept & tightened (10): Executive (office+luxury, fresh/woody) · Seducer (REQUIRES
warmth+darkness, not just outcome columns) · Connoisseur (luxury+anti-popularity+breadth) ·
Signature Wearer (loyalty↑ breadth↓) · Purist (clean musk, presence↓) · Showstopper
(presence top-decile) · Smart Shopper (value axis — drop the dupe signal: the pool
contains ZERO dupes today, which is why it never fired) · Romantic (florality soft) ·
Explorer (breadth↑ adventurousness↑) · Classicist (era↓ luxury↑ chypre/fougère).

New (10): **The Gourmand** (sweetness↑ — 21 sweet + 16 vanilla accords in pool) ·
**The Minimalist** (fresh + presence↓ + tight set) · **The Naturalist** (greenness↑) ·
**The Trendsetter** (era↑ 2020+ + popularity↑) · **The Old Soul** (era↓↓ any price —
distinct from Classicist which is price-anchored) · **The Maximalist** (presence↑ +
breadth↑ + longevity↑) · **The Night Owl** (darkness↑ office-safe↓ — dark/smoky, vs
Seducer's warm-sweet) · **The Spice Trader** (spice↑ — 35 spicy-accord bottles) ·
**The Daybreaker** (citrus/aquatic morning-fresh — 61 citrus-accord bottles) ·
**The Soft Focus** (powdery/musky skin-scent femme — 14 powdery + 12 musky).

Crowd-Pleaser stays retired (pool can't contrast it). Modifiers stay and multiply
perceived variety (~20 × 6 combos on the reveal).

## Data prerequisites (the "real data" part — P0, before the engine)

The pool is 112 bottles; coverage gaps would kill 4 of the 20 on arrival:
- **release_year: 69/112 missing** → era axis dead for 62% of picks (Trendsetter,
  Old Soul, Classicist). Backfill job, same pattern as enrich-notes-llm.mjs.
- **projection/sillage/longevity: 73/112 missing** → presence axis dead for 65%
  (Showstopper, Maximalist, Minimalist). Backfill.
- Verify accord completeness on all 112 (top_accords drives 7 of 14 axes).
- Optional later: grow the pool past 112 (still recognizable-tiles-only) so
  adventurousness/Connoisseur get more contrast.

## Rollout

- Engine behind the existing DNA killSwitch flag pattern; live-prod rules apply
  (read-only audit done, this spec is the sign-off gate).
- Existing users re-derive on next recompute (living-DNA intended behavior; some
  current Seducers will change identity — accepted, the lean/swap reveal covers it).
- Integration checklist per label: types.ts key · centroid · revealCopy (name,
  identity line, icon, tint) · web /i NAMES map (share previews) · replay+simulation
  fixtures. 20 icon/tint pairs needed (12 exist).
- Ships app-side → 1.0.5 binary (after 1.0.4 clears review). Web NAMES map can ship
  ahead (forward-compatible).

## Order of work

1. Catalog backfill (release_year, projection/sillage/longevity, accord audit) — ~half day
2. Feature-vector + centroid engine + margin/lean wiring — ~1 day
3. Replay + simulation CI gates — ~half day
4. Copy/icons for 20 + reveal + web map — ~half day (humanize pass on identity lines)
5. Flag-gated verify on device, then 1.0.5
