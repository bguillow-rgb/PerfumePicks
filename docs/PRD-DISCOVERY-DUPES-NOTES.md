# PRD — Perfume Picks: Discovery, Dupes, Notes & the "What People Want" North Star

> **Status:** DRAFT for review (Chief UX → Mark Z → founder Q&A). **NO BUILD until founder says go.**
> **Author:** Claude (with founder)
> **Last updated:** 2026-06-07
> **Related docs:** `docs/PERFUME-PICKS-CONTEXT.md` (source of truth for product/infra)

---

## 0. TL;DR

We did heavy market research (Reddit threads across r/fragrance, r/FemFragLab, r/DIYfragrance) and a hard data audit. Two truths emerged:

1. **The market is wide open.** The category leader (Parfumo) has a beloved *website* and a disliked *app*; the data leader (Fragrantica) has *no app* and is bleeding users over moderation controversy. The most-requested feature — a **ranked dupes/clones finder** — exists nowhere good.
2. **Our foundations have three load-bearing defects** that must be fixed before we can win:
   - **Dupe + "Smells Like" are dead in production** (UUID-vs-slug ID mismatch).
   - **Note pyramids cover only ~26% of the catalog** and ~73% of accords are LLM-inferred, not sourced — the exact trust axis enthusiasts judge us on.
   - **The enrichment catalog is the wrong catalog** — skewed to obscure indie houses, missing the designer originals (Dior, Versace, Paco Rabanne…) people actually want dupes of.

This PRD specifies how we build the 11-item "what people want" list **better than anyone**, with **ranked dupes as the hero**, and fix the foundations underneath it.

---

## 1. North Star & The 11 Wants

Our north star is the verbatim "what's missing" list distilled from the threads. We will be measurably best-in-class on each:

| # | Want (user voice) | Priority |
|---|---|---|
| 1 | **Ranked dupes/clones finder** — type a designer frag, get clones ranked closest→farthest | **P0 — hero** |
| 2 | Search by notes + mood/description ("warm, date night, summer") | P1 |
| 3 | Wear tracking → end-of-year "Spotify Wrapped" recap | P1 |
| 4 | Buy links / "available on" marketplace | P0 (mostly done) |
| 5 | Compare multiple perfumes' notes side-by-side | P2 |
| 6 | **Accurate, trustworthy notes** (distrust Fragrantica votes; trust Parfumo sourcing) | **P0 — foundation** |
| 7 | Short, pithy reviews — "just say what it smells like," casual takes | P2 |
| 8 | User-added fragrances when DB is missing one | P1 |
| 9 | Lightweight community / forum | P3 |
| 10 | Layering combos | P3 (exists) |
| 11 | Recommendations from collection — **without "AI" hype** | P1 (positioning) |

---

## 2. Evidence Base (Reddit research → what it tells us)

Direct signals pulled from the threads (paraphrased with intent preserved):

**On the incumbents**
- "Parfumo. Fragrantica is garbage." / "We definitely don't all love Fragrantica." — Parfumo is the enthusiast default; Fragrantica is resented for ads, scrolling, and controversy.
- "Parfumo via browser is best… the app didn't have any of the reviews, comments, forums." / "Parfumo looks a bit boring and fragrantica doesn't have one at all." — **The leader's app is weak. This is our wedge.**
- "Parfumo has a rigorous process to get notes approved… cite reliable sources. Fragrantica posts notes based on user votes… Parfumo is more accurate." — **Note accuracy is the #1 trust differentiator.**

**On what they do**
- "It tells me that in the past 39 days I've logged 78 wears of 75 unique fragrances… most worn brands/scents, % of collection worn, suggestions for time/season." — wear tracking + stats is a core loved behavior.
- "tap the spray bottle icon and it will record the date and time… Tracker list under the Assistant tab." — logging must be one tap.
- "That 'Spotify' style flashback of your wears of the year seems pretty nice." — **Wrapped is explicitly wanted.**
- Many use **spreadsheets** ("I love data") and even **ChatGPT** ("I had it remember my collection and ask for layering combos") — unmet need for structured, smart tooling.

**On what's missing (the build list)**
- "Inspired/Dupes/Clones Finder — type in a fragrance and view inspired/dupe/clones ranging from best to worst… ranking." — **verbatim the hero feature.**
- "Search by notes & description (mood, taste or environment) that finds the best matching fragrances."
- "A 'available on' option so users can find fragrances on their marketplaces."
- "A section where we can compare notes of multiple perfumes."
- "User option to add fragrances that aren't available, reviewed and posted."
- "Something like perfume map but with more filters."
- Skepticism: "Apps claiming to use AI to recommend fragrances… it's vaporware." / "shared notes don't mean you'll like it." — **Do not market 'AI'. Frame as evidence from their own behavior.**

**On reviews**
- "The reviewers always write a 7-page essay instead of just saying what it smells like." / "I read the short pithy statements rather than epically long reviews." — **structured short takes beat essays.**

---

## 3. Personas

**P1 — "Steph," the curious newcomer (r/FemFragLab OP).** Owns 5–15 bottles, nose isn't trained, overwhelmed by Fragrantica. Wants: tell me what I'll like, track what I have, don't make me read essays. Mobile-only. **Primary monetization target.**

**P2 — "DietCoke," the enthusiast tracker.** 75–250 fragrances incl. samples/decants. Logs daily wears, loves stats, distrusts inaccurate notes, currently on Parfumo web + a spreadsheet. Wants: accurate notes, deep tracking, Wrapped, complete DB. **Primary retention + word-of-mouth target.**

**P3 — "BudgetSeeker," the dupe hunter.** Loves a $300 designer scent, can't justify it. Wants: "what's a cheaper version of X that smells the same?" ranked by closeness with the price saved. **Primary acquisition hook + affiliate revenue driver.**

---

## 4. Goals / Non-Goals

**Goals**
- Ship a ranked dupe finder that is the best in the category (detail page, Discover hero, Home module).
- Raise note-pyramid coverage on the *purchasable* catalog to ≥80% from trustworthy sources, with visible provenance.
- Make the catalog *complete* for collections (decouple visibility from "can we sell it").
- Rebuild Wrapped; add compare, mood search, quick-take reviews; fix user-add.
- Reframe recommendations away from "AI" toward evidence.

**Non-Goals (now)**
- A full forum/social network (lean on feed + quick-takes).
- ML/vector recommendation models (deterministic + precomputed similarity is enough at our scale).
- Android (iOS-first remains).
- Becoming a bigger *database* than Fragrantica (we win on app UX + trust + dupes, not raw count).

---

## 5. Current-State Architecture (as built)

```
                         ┌───────────────────────────────────────────┐
                         │                 iOS APP                     │
                         │            (Expo / React Native)            │
                         │                                             │
   Home ─ Discover ─ Train ─ Wardrobe ─ Profile ─ Fragrance Detail ─ Scan
                         │        │                      │             │
                         │   useCatalogStore (id = SLUG) │             │
                         └────────┼──────────────────────┼─────────────┘
                                  │ slug-keyed reads      │ RPCs
                                  ▼                       ▼
                         ┌─────────────────────────────────────────────┐
                         │                  SUPABASE                     │
                         │  fragrances (PK=UUID, slug unique)            │
                         │   ├─ top/heart/base_notes[]  (~26% filled)    │
                         │   ├─ top_accords[]           (~99% filled)    │
                         │   ├─ similar_fragrance_ids[] (UUIDs) ◄─ BUG   │
                         │   ├─ dupe_of (UUID), dupe_confidence ◄─ BUG   │
                         │   └─ is_active                                 │
                         │  brands · fragrance_retailer_links            │
                         │  fragrance_celebrities · reviews · wear_logs  │
                         │  RPCs: get_scent_twins, get_collab_recs,      │
                         │        get_wrapped (exists, unused)           │
                         └─────────────────────────────────────────────┘
                                  ▲
              ┌───────────────────┴─────────────────────────────────┐
              │              OFFLINE DATA PIPELINE                    │
              │                                                       │
   Affiliate feeds (CJ SFTP, Perfumania Shopify) ─► etl-*.ts ─► fragrances + retailer_links
   Brand-site + Fragrantica scrapes ─► scrape-*.ts ─► merge-scraped-sources.ts
        ─► enrich-catalog-llm.ts (accords/scores) ─► enriched-candidates.json (5,386)
        ─► reconcile-enriched-to-etl.ts (slug-match) ─► fragrances (notes/accords)
        ─► backfill-prices.ts ─► similarity-precompute.ts (dupe_of, similar) ─► cleanup-non-affiliate-frags.ts (DELETES orphans)
```

### 5.1 The three defects, precisely

| Defect | Location | Effect |
|---|---|---|
| **ID mismatch** | `similarity-precompute.ts` writes `dupe_of`/`similar_fragrance_ids` as **UUIDs**; app maps `id = slug` (`useCatalogStore.ts:91`) and resolves via `.in('slug', …)` (`:280`) and `c.dupe_of === f.id` (`fragrance/[id].tsx:357`). | Precomputed dupes + "Smells Like" never resolve. Live dupes = crude accord-overlap fallback, unranked. |
| **Notes sparsity** | Pipeline: only 26% of candidates carry note pyramids; reconcile only fills where scrape-slug == etl-slug. | Designer frags in the purchasable catalog show empty/auto-generated notes → fails the trust test. |
| **Catalog mismatch** | Enrichment scrapes are indie-brand-site heavy; affiliate ETL is designer-retail heavy; the two overlap poorly. Plus `cleanup-non-affiliate-frags.ts` deletes any frag without a buy link. | Catalog is simultaneously *too obscure* (enrichment) and *too thin* (visibility gated on affiliate). Power-user collections can't be completed. |

---

## 6. Target Architecture (proposed)

```
   ┌──────────────────────────── iOS APP ────────────────────────────┐
   │  HOME: "Don't Pay a Fortune" dupe module  ──┐                    │
   │  DISCOVER: dupe-finder hero + mood search  ─┼─► <DupeEngine> ──┐ │
   │  DETAIL: ranked dupes w/ % match + savings ─┘                  │ │
   │  COMPARE: 2–3 side-by-side note/accord diff                    │ │
   │  WRAPPED: year-in-review                                       │ │
   │  useCatalogStore  ── normalized on SLUG everywhere ◄── FIX ────┘ │
   └───────────────────────────────┬─────────────────────────────────┘
                                    │  slug-keyed reads + new RPCs
                                    ▼
   ┌──────────────────────────── SUPABASE ───────────────────────────┐
   │  fragrances                                                       │
   │   + purchasable BOOLEAN  (replaces "delete if no buy link")       │
   │   + notes_source TEXT, notes_verified BOOL  (provenance)          │
   │   + dupe_of stays UUID (server truth)                             │
   │  fragrance_dupes (NEW VIEW/TABLE): original_slug, dupe_slug,      │
   │       match_pct, price_delta_cents, direction                     │
   │  RPC get_dupes(slug) ─► ranked dupe rows (slug-keyed, app-ready)  │
   │  RPC get_wrapped(user) ─► year stats (already exists)             │
   └──────────────────────────────────────────────────────────────────┘
                                    ▲
   ┌────────────────── PIPELINE (hardened) ───────────────────────────┐
   │  Notes-first sourcing: prioritize designer/niche ORIGINALS        │
   │   1. read-only audit script (coverage by brand/tier)              │
   │   2. targeted note backfill for purchasable + high-demand frags   │
   │   3. dupe-seed list (known designer→dupe maps) curated/imported   │
   │   4. similarity-precompute v2 (slug output, note-weighted, guards) │
   │   5. purchasable flag instead of delete                           │
   └──────────────────────────────────────────────────────────────────┘
```

Key architectural decisions:
- **Slug is the one true app ID.** Either (a) store dupe/similar relations as slugs, or (b) expose a `get_dupes(slug)` RPC that joins UUID→slug server-side and returns app-ready rows. **Recommended: (b)** — keeps the relational integrity (UUID FKs) while giving the client slug-keyed data. Belt-and-suspenders: also normalize `rowToFragrance` to resolve any UUID arrays via a server join.
- **A dedicated dupe surface** (`fragrance_dupes` materialized view or table) so dupes are queryable both directions (dupes-of-X and what-X-is-a-dupe-of) with `match_pct` and `price_delta`.
- **Provenance is a first-class field.** `notes_source` + `notes_verified` drive a visible "Notes verified ✓" badge — the Parfumo trust signal, made explicit.
- **`purchasable` flag** decouples catalog completeness from monetization.

---

## 7. Feature Specs & User Stories

### 7.1 Ranked Dupe Finder — THE HERO (P0)

**User stories**
- *As BudgetSeeker, I type "Baccarat Rouge 540" and get a ranked list of cheaper alternatives, closest match first, each showing a % match and how much I'd save, with a buy button.*
- *As Steph, on any fragrance page I see "Smell-alikes for less" with the top 3 ranked dupes and their price.*
- *As BudgetSeeker, from Home I tap "Don't pay a fortune," pick an expensive scent (or one from my wishlist), and see ranked cheaper twins.*

**Spec**
- **Ranking:** `match_pct` derived from `dupe_confidence` (and similarity score), displayed as e.g. "92% match." Sorted desc. Secondary sort: larger savings first.
- **Savings:** `price_delta = original.msrp − dupe.msrp`, shown as "Save ~$180."
- **Direction-aware:** A dupe page links back up to its "inspired by" original; an original lists its dupes.
- **Confidence honesty:** Below a threshold, label "loose match" rather than overstating (addresses the "shared notes ≠ liking" skepticism).
- **Empty state:** If no dupe ≥ threshold, show "No close dupes yet — here's what's *similar*" (not a dead end).
- **Reusable component `<DupeList>`** consumed by detail, Discover hero, Home module.
- **Reusable `<DupePicker>`**: search/select any fragrance → renders `<DupeList>` for it.

**Surfaces**
1. **Fragrance detail** — replace the broken `findCheaperAlternatives` fallback (`fragrance/[id].tsx:61,357`) with `get_dupes(slug)`. Keep Pro gating per current product (or reconsider — see Open Questions).
2. **Discover hero** — top-of-page dupe-finder search box: "Find a cheaper version of…" → `<DupePicker>`.
3. **Home module** — "Don't Pay a Fortune" card: featured expensive frag or user's wishlist/wardrobe item → ranked cheaper twins. **(Founder's idea — confirmed in scope.)**

**Data dependency:** Requires (a) ID-layer fix, (b) note coverage on originals for quality, (c) dupe-seed list for the marquee designer→dupe pairs people expect (BR540→ Dossier/ALT, Sauvage → clones, etc.).

---

### 7.2 Search by Notes + Mood (P1)

**User story:** *As Steph, I type "warm cozy date night" and get fragrances matching that vibe, not a literal keyword search.*

**Spec**
- Map free-text mood phrases → accord sets (lexicon: "cozy/warm" → amber, vanilla, warm-spicy; "fresh/summer" → citrus, aquatic, green; "date night" → high compliment_score + amber/sweet; "office" → office_safe_score).
- Combine with existing note/accord/brand search in `discover.tsx`. Keep the curated mood pills but back them with the same lexicon.
- Surface active interpretation ("Showing warm, sweet, evening scents") so it's legible, not a black box.

---

### 7.3 Year-in-Review "Wrapped" (P1)

**User story:** *As DietCoke, at year end I get a shareable recap: total wears, unique scents, top 5, most-worn brand, seasonal breakdown, % of collection worn.*

**Spec**
- Rebuild the removed Wrapped (per `PERFUME-PICKS-CONTEXT.md` it was pulled for a "come back in December" stub). Use existing `get_wrapped` RPC + `wear_logs`.
- Make it always-available (rolling trailing-12-months, not just December) to avoid the dead-stub problem.
- Shareable image card (drives word-of-mouth; the "Spotify flashback" people asked for).

---

### 7.4 Buy Links / Marketplace (P0, mostly done)

**User story:** *As any user, on a fragrance I see where to buy it and the price, and tapping opens the retailer.*

**Spec**
- Already works (Perfumania). Expand retailer coverage (ties to §8 DB plan). Keep affiliate disclosure. FragranceShop CF param issue is platform-side (known).

---

### 7.5 Compare Side-by-Side (P2)

**User story:** *As DietCoke, I pick 2–3 fragrances and see their note pyramids, accords, and performance next to each other, with shared vs unique notes highlighted.*

**Spec**
- New `/compare` route. Add-to-compare affordance on cards/detail. Column layout; highlight shared notes (intersection) and deltas. Strong dependency on note coverage (§7.6).

---

### 7.6 Accurate, Trustworthy Notes — FOUNDATION (P0)

**User story:** *As DietCoke, the notes I see are accurate and I can tell where they came from, so I trust this app over Fragrantica.*

**Spec**
- Raise note-pyramid coverage on the **purchasable** catalog to ≥80%.
- Add `notes_source` + `notes_verified`; show a "Notes verified" badge when sourced from a trusted scrape (Fragrantica/brand). When only LLM-inferred accords exist, **don't fake a pyramid** — show accords and label honestly.
- Prioritize backfill by demand: designer/mainstream originals first (they're both the most-viewed and the most-searched dupe targets).
- See §8 for the sourcing plan.

---

### 7.7 Short, Pithy Reviews (P2)

**User story:** *As Steph, I read and write one-line "smells like…" takes with quick tags, not essays.*

**Spec**
- Add a structured quick-take to `ReviewSection`: a short "smells like" field (char-capped) + one-tap tags (e.g., "compliment magnet," "office-safe," "too strong," "short-lived," "smells expensive").
- Surface quick-takes above long reviews; let users sort "quick takes first" (Parfumo's "statements" setting that users praised).

---

### 7.8 User-Added Fragrances (P1)

**User story:** *As DietCoke, when my niche bottle isn't in the DB, I add it (and it persists), so my collection is complete.*

**Spec**
- Fix the P2 persistence bug (custom scan items vanish on restart — `PERFUME-PICKS-CONTEXT.md §10`).
- Add an explicit "Add a fragrance" manual path (not only via scan). Store as a user-scoped custom catalog entry; never block wardrobe completeness on the global catalog.

---

### 7.9 Lightweight Community (P3)

**User story:** *As any user, I see what others are wearing and their quick takes — without a toxic forum.*

**Spec**
- Lean on existing SOTD feed + scent-twins + quick-take reviews. No standalone forum now. Revisit later.

---

### 7.10 Layering Combos (P3, exists)

- Keep Pro layering. Surface saved combos in My Notes and on detail. No major work.

---

### 7.11 Recommendations Without "AI" Hype (P1, positioning)

**User story:** *As skeptical DietCoke, recommendations are explained by my own behavior, not hand-waved as "AI."*

**Spec**
- Copy/positioning pass across Home/Discover/Train: "Because you loved X and wear Y," "Based on your most-worn accords." Remove any "AI" framing. Engine stays deterministic (it already is — a strength).

---

## 8. Data / Notes / DB Sourcing Strategy (the re-audit → the plan)

### 8.1 Audit findings (measured 2026-06-07 on `enriched-candidates.json`, n=5,386)

| Field | Coverage | Note |
|---|---|---|
| top_accords | 99.2% | but ~73% LLM-inferred, not sourced |
| fragrance_family | 98.7% | LLM-normalized |
| image_url | 99.4% | from feeds/scrapes |
| msrp | 59.1% | |
| **top/heart/base notes** | **26.1% / 24.6% / 25.8%** | **the trust gap** |
| release_year | 27.3% | |
| price_tier | 0% | computed later via backfill |
| community_longevity | 0% | not captured in candidates |

**Source mix:** Fragrantica 27.3% (real notes); remaining 73% indie brand-site scrapes (Sucreabeille 712, Arielle Shoshana 380, Demeter 314…).

**Designer coverage in enrichment data:** Dior **absent**, Versace **absent**, Paco Rabanne **absent**, JPG **absent**, Gucci/Burberry/Azzaro/Mugler/Narciso/Kayali **absent**; Carolina Herrera 10, Valentino 34, Chanel 103, Tom Ford 190. **The enrichment set does not match the affiliate (purchasable) set**, so most designer originals can't be note-enriched today.

### 8.2 Required: a read-only LIVE audit (do first, free, no writes)

The candidate file ≠ live `fragrances` table. Before any paid work we run a read-only script to measure the *live* catalog:
- count active; count purchasable (have ≥1 retailer link);
- % with note pyramids, by brand tier (designer vs niche vs indie);
- % with `dupe_of`; % with `similar_fragrance_ids`;
- top 100 most-viewed/most-searched frags and their note coverage (demand-weighted gap).

Output: a coverage report that sizes the backfill before we spend on it.

### 8.3 Sourcing strategy (best-available, in priority order)

1. **Demand-first note backfill.** Enrich the *purchasable* catalog, designer/mainstream originals first. Source order per fragrance: (a) existing trusted scrape, (b) targeted fresh scrape of the original (Fragrantica/brand), (c) LLM inference **only as labeled fallback**, never masquerading as sourced.
2. **Dupe-seed import.** Curate/import a seed list of the canonical designer→dupe relationships the market expects (the "BR540 dupe," "Sauvage clone" queries). This guarantees the marquee dupe results are *correct*, not just algorithmically nearest. Algorithm fills the long tail.
3. **`purchasable` decouple.** Replace `cleanup-non-affiliate-frags.ts` deletion with an `is_active` + `purchasable` model: keep non-sellable frags visible (for collection completeness), rank/surface purchasable higher.
4. **similarity-precompute v2.** Output slug-keyed relations (or feed the `get_dupes` RPC), down-weight note-overlap when notes are missing (avoid false confidence), add guardrails (don't call something a 90% match on accords alone).
5. **Retailer expansion.** Add feeds to widen `purchasable` coverage on originals + cheaper dupes (the affiliate upside of the dupe feature).

### 8.4 Re-audit cadence

After each backfill tranche: re-run the live audit; track note-coverage % on purchasable catalog and dupe-coverage % on top-demand originals as the two headline data-quality KPIs.

---

## 9. Data Model Changes (proposed migrations)

```sql
-- fragrances: provenance + completeness decouple
ALTER TABLE fragrances ADD COLUMN purchasable BOOLEAN DEFAULT false;
ALTER TABLE fragrances ADD COLUMN notes_source TEXT;        -- 'fragrantica' | 'brand' | 'llm' | null
ALTER TABLE fragrances ADD COLUMN notes_verified BOOLEAN DEFAULT false;

-- dedicated dupe surface (slug-keyed, direction-aware, app-ready)
CREATE TABLE fragrance_dupes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id     UUID NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  dupe_id         UUID NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  match_pct       INT  NOT NULL,            -- 0..100
  price_delta_cents INT,                    -- original.msrp - dupe.msrp
  source          TEXT,                     -- 'algo' | 'seed' | 'editorial'
  UNIQUE(original_id, dupe_id)
);

-- app-ready RPC: returns slug-keyed ranked dupes for a given original slug
CREATE FUNCTION get_dupes(p_slug TEXT) RETURNS TABLE(...) ...;  -- joins UUID->slug server-side
```

`get_dupes` returns dupe rows already shaped for `rowToFragrance` (slug as id) + `match_pct` + `price_delta`. Client never sees UUIDs.

---

## 10. Implementation Details (component & file level)

**Foundation (unblocks everything)**
- `scripts/similarity-precompute.ts` — v2: write to `fragrance_dupes` (+ keep `dupe_of` for FK integrity); note-aware confidence guard.
- New migration: `purchasable`, `notes_source`, `notes_verified`, `fragrance_dupes`, `get_dupes` RPC.
- `src/stores/useCatalogStore.ts` — add `fetchDupes(slug)` calling `get_dupes`; ensure any UUID-array resolution goes through a slug-join (fixes "Smells Like" too).

**Dupe components**
- `src/components/fragrance/DupeList.tsx` — ranked rows: image, name/brand, `match_pct` pill, "Save $X," buy CTA.
- `src/components/fragrance/DupePicker.tsx` — search/select → `<DupeList>`.
- `app/(tabs)/fragrance/[id].tsx` — replace `findCheaperAlternatives` (`:61,357`) with `fetchDupes(slug)`; honest empty/loose-match states.
- `app/(tabs)/discover.tsx` — add dupe-finder hero above search; integrate mood lexicon into search.
- `app/(tabs)/index.tsx` (Home) — "Don't Pay a Fortune" module using `<DupePicker>`/`<DupeList>`.

**Other features**
- `app/wrapped.tsx` (rebuild) + share-card; wire `get_wrapped`.
- `app/compare.tsx` (new) + add-to-compare affordance.
- `src/components/fragrance/ReviewSection.tsx` — quick-take field + tag chips; sort quick-takes first.
- Scan/user-add persistence fix (custom catalog entry survives restart).
- Copy pass for anti-"AI" framing (Home/Discover/Train).

**Mood lexicon**
- `src/constants/moodLexicon.ts` — phrase → accord/score mapping; consumed by Discover search.

---

## 11. Phasing / Milestones

- **M0 — Foundation (gating):** read-only live audit; ID-layer fix + `get_dupes` RPC + `fragrance_dupes`; similarity-precompute v2. *Outcome: dupes & "Smells Like" actually work.*
- **M1 — Dupe Hero:** `<DupeList>`/`<DupePicker>`; detail + Discover hero + Home module; dupe-seed import for marquee pairs. *Outcome: best-in-class ranked dupes.*
- **M2 — Trust:** note backfill (demand-first) + provenance badges; `purchasable` decouple. *Outcome: accurate notes + complete catalog.*
- **M3 — Delight:** Wrapped; mood search; quick-take reviews.
- **M4 — Depth:** Compare; user-add fix; anti-AI copy; layering surfacing.

---

## 12. Success Metrics

- **Dupe engagement:** dupe-finder searches/user; dupe→buy affiliate CTR.
- **Data quality:** note-pyramid coverage on purchasable catalog (target ≥80%); dupe coverage on top-100 demand originals (target ≥90% with a ≥ "good" match).
- **Retention:** wear-logs/user/week; Wrapped shares.
- **Trust proxy:** App Store review sentiment mentioning "notes," "accurate," "dupes."

---

## 13. Risks & Open Questions (for founder Q&A)

**Risks**
- Note backfill cost/time (paid LLM + scraping). Sized only after the live audit.
- Dupe over-claiming → backlash from the very skeptics we quoted. Mitigation: confidence guardrails + "loose match" labeling + curated seeds for marquee pairs.
- `purchasable` decouple could dilute affiliate conversion if not ranked carefully.
- Scraping ToS/legal for note sourcing (Legal Eagle review recommended before scraping at scale).

**Open questions**
1. **Is the dupe finder free or Pro?** It's the #1 acquisition hook (argues free, at least the first result) but also a strong paywall lever (current product gates it).
2. **How aggressive on catalog completeness** vs affiliate purity — show non-sellable frags, or keep the catalog tight?
3. **Note sourcing budget** — what's the ceiling for the backfill run?
4. **Scraping posture** — are we comfortable scraping Fragrantica/brand sites for notes, or do we want a licensed/owned data source?
5. **Dupe-seed authorship** — curate the marquee designer→dupe list ourselves, or import from an existing public dataset?

---

## 14. Appendix — files & references

- App: `app/(tabs)/discover.tsx`, `app/(tabs)/fragrance/[id].tsx`, `app/(tabs)/index.tsx`, `src/stores/useCatalogStore.ts`.
- Pipeline: `scripts/similarity-precompute.ts`, `scripts/enrich-catalog-llm.ts`, `scripts/reconcile-enriched-to-etl.ts`, `scripts/cleanup-non-affiliate-frags.ts`, `scripts/data/enriched-candidates.json`.
- Schema: `supabase/migrations/001_initial_schema.sql`, `…1120_rpcs_scent_twins_wrapped.sql`.
- Context: `docs/PERFUME-PICKS-CONTEXT.md`.
```
