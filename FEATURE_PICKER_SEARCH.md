# Picker Search — "Bring Your Own Bottle" (Chief UX spec, 2026-07-09)

_Chief UX adversarial review, grounded in the real picker code (app/dna/index.tsx,
src/features/dna/pickerGrid.ts, types.ts, metrics.ts). Companion to
FEATURE_ARCHETYPES_V2.md — search is what feeds the new axes real variance.
Verdict: promising; build exactly this, not a bolted-on search bar._

## Code truths this design is built on (do not violate)

- **There is no picks tray.** Selection = per-tile badges + live text count
  (index.tsx:423–430) + CTA count (:499). We do not add a tray.
- **Picker picks are relation `'like'` and never write the wardrobe**
  (index.tsx:199–211, types.ts:30–33). Search picks keep `'like'` + an explicit
  `weight` (types.ts:261–264, honored by resolvePickWeight metrics.ts:38–40).
  Never `'own'` — ownership capture belongs to scan / Add-to-Wardrobe.
- **Grid is deterministic, no reshuffle** (pickerGrid.ts:14–15,163) with lazy
  reveal on a plain ScrollView (index.tsx:76,309–321). Result shelves must be
  short + horizontal; never mount hundreds of tiles.
- **MAX_PICKS = 5** (pickerGrid.ts:28), single guard in handleTap (:327–334).
- **⚠ THE implementation trap:** startCompute builds its byId map from `pool`
  only (:194) and silently drops picks not in it (:206). Searched fragrances
  MUST be merged into the compute lookup (searchPickCache) or they vanish from
  the DNA.
- Haptic vocabulary: Light=tap, Medium=favorite/CTA, Heavy=hard-no,
  Warning=cap. Search reuses these; nothing new.
- Fresh reset on open (:83–85) must also reset query, searchPickedIds, pinned.

## Entry affordance (winner of 5 considered; rejected: pinned top bar,
## Popular|Search segmented control, header-icon modal, link next to novice escape)

One muted line directly beneath the count sub-copy, above the grid:

> **Own a bottle you don't see? Search for it.**

- Sentence in COLORS.muted; "Search for it." in COLORS.accent with the
  escapeText underline treatment (:586). 16px search-outline glyph, muted.
- Tap → expands IN PLACE to a slim single-line TextInput, placeholder
  **"Search by brand or bottle"**. Grid stays visible above. No navigation.
- Ownership framing makes search read optional by construction AND explains
  why these picks weigh more (deliberate signal).

## The memorable interaction — "the docking"

Tap a search result → tile lifts off the result shelf and flies up into slot 0
of the grid (~280ms translate+scale), settling with a thin inset **gold
"brought-in" ring** (2px COLORS.accent, inset ~2px — visibly distinct from the
flush tileSel border :546) + check badge + Light haptic. Your bottle sits among
the icons, marked as the one you brought. Gold ring = deliberate weight, legible.

## Bob's five questions — defined behavior

1. **Optional framing** — copy/placement above. No "discover/explore/find your
   signature" anywhere.
2. **Finding a favorite** — tap result → Light haptic → added to selectedIds +
   new `searchPickedIds: Set<string>` → docks as pinned head tile with gold
   ring → field collapses to the affordance row, keyboard dismisses, query
   clears.
3. **Grid update** — NO reshuffle, NO similar-bottle injection. Exactly one
   change: the searched bottle joins as a pinned head tile. Pinned tiles live
   in a `pinned` array prepended to `visible`, never subject to greedy fill or
   scroll-reveal drops.
4. **Abandonment** — un-picked results are ephemeral view state. New query
   replaces the shelf wholesale. Inline ✕ / back gesture collapses search
   first (clears query, keeps all picks), never exits onboarding; second back
   only acts in retake (cancelRetake :136).
5. **Mixed selection** — one currency: selectedIds.length drives count + CTA
   unchanged. Grid picks = flush accent border; search picks = inset gold
   ring; both get check badge + star. MAX 5 across both via the existing
   guard. Weight: SEARCH_DELIBERATE_WEIGHT = 1.5, composed as
   `1.5 * (favorite ? 2.5 : 1)`.

## Edge states

| State | Behavior | Exact copy |
|---|---|---|
| Empty search (pre-typing) | field open, grid visible, one muted hint | "Type a brand or bottle — like Baccarat Rouge 540" |
| No results | one quiet line, no icon/button; query stays editable | "No match for "{q}". Check the spelling — or it may not be in our catalog yet." |
| Fails completeness gate | dimmed non-tappable tile + subline; tap enqueues enrich-on-demand | subline "Details coming soon"; toast "Noted — we'll prioritize {name}." |
| Dupe of a grid tile | no second tile; grid scrolls to existing tile, selects it with gold ring (promoted to deliberate weight) | "Already on your wall — selected it for you." |
| Deselect gold tile | ring+check clear; tile stays pinned-unselected (greyed) for the session; favorite/relation cleared | — |
| Max picks in search | Warning haptic, no dock | "Five is the max — remove one to add this." |
| Keyboard | field + single-row horizontal shelf above keyboard; footer CTA always visible/tappable; dismiss collapses field, keeps picks | — |

## Do NOT build

Persistent top search bar · Popular|Search segmented control · full-screen
search modal · "similar to your pick" injection · autocomplete overlay that
occludes the grid/CTA · generic icon+headline+button empty state · results at
equal visual weight to grid tiles (the gold ring is the point) · a tray.

## Build notes

- searchPickCache: merge searched fragrance rows into startCompute's byId.
- Search backend: ilike on name+brand over is_active catalog, results gated on
  family+accords present; misses → enrich-on-demand queue.
- Pick-stream capture: source stays 'picker'; consider sub-source
  'picker_search' for analytics (INVITE-style funnel: search_opened,
  search_result_picked, search_no_results).
- Ships app-side → rides the same 1.0.5 as Archetypes V2 (flag-gated).
