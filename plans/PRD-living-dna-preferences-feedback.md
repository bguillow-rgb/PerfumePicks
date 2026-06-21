# PerfumePicks — Living DNA, Scent Preferences & Feedback PRD

**Document type:** Product requirements (as-built reconciliation)
**Created:** 2026-06-21
**Status:** Shipped (commit d88cf18) — this PRD documents what is in code now, so the
previously chat-only "Living-DNA PRD §7" (referenced from
`src/lib/sync/recomputeScheduler.ts:1`) finally has a home on disk.
**Scope:** The three taste layers the app personalizes on — Fragrance DNA
(identity), the Living-DNA recompute that keeps it current, the Scent
Preferences constraint layer, and the always-on Feedback line.

---

## 1. Why this exists

Three previously-pasted-in-chat work streams shipped without a committed
requirements doc. This reconciles them against the code so future agents have a
single source of truth and don't re-derive the rules. Nothing here proposes new
work — every requirement below is already implemented and is cited to `path:line`.

The taste model has **three layers**, each feeding the recommendation engine
(`src/features/recommend/useRecommendations.ts`):

| Layer | Meaning | Source of truth |
|---|---|---|
| **Fragrance DNA** | Identity — who the user is, named as an archetype | `src/features/dna/` + the onboarding spine `app/dna/index.tsx` |
| **Living DNA** | The DNA kept current as behaviour accrues | `src/features/dna/signals.ts`, `livingArchetype.ts`, `src/lib/sync/recomputeScheduler.ts` |
| **Scent Preferences** | Stated hard constraints behaviour can't reveal | `src/stores/useScentPreferencesStore.ts` + `app/preferences/index.tsx` |

---

## 2. Fragrance DNA — onboarding spine (as built)

**Flow:** picker grid → refine → "reading your palate" beat → reveal →
**top-match fragrance detail** (`app/dna/index.tsx`). This is the primary
new-user onboarding and is never paywalled.

| # | Requirement | Code |
|---|---|---|
| DNA-1 | Picker shows recognizable bottles only (tier ≥ 3), most-famous-first | `src/features/quiz/pickerGrid.ts` (`buildPickerList`) |
| DNA-2 | Grid **lazy-loads** the next batch of 12 as the user scrolls near the bottom; there is **no reshuffle button** | `app/dna/index.tsx` `handleScroll` (~277); `PICKER_GRID_SIZE = 12` |
| DNA-3 | Selection is **capped at 5** (`MAX_PICKS`); a 6th distinct tap is rejected with a warning haptic; long-press = hard-no removal | `pickerGrid.ts` `MAX_PICKS = 5`; `app/dna/index.tsx` `handleTap` (~291), `handleLongPress` (~305) |
| DNA-4 | Refine sets per-pick relationship (own/want/like) + favorite; "own"→wardrobe `have`, "want"→`want`, both bypassing the free-tier cap | `app/dna/index.tsx` refine handlers (wardrobe seeding `bypassCap`) |
| DNA-5 | Reveal names the archetype with emblem, identity line, trait chips, and a Share action | `src/components/dna/DnaReveal.tsx` |
| DNA-6 | "See my top match" opens the **top-match fragrance detail directly** — `router.replace('/(tabs)')` then `router.push('/fragrance/<id>')`; no first-match interstitial. No ranked match → land on Today | `app/dna/index.tsx` `handleRecOpen` (~262), reveal `onContinue` |

**Removed in d88cf18 (do not reintroduce):** the FirstRec first-match
interstitial screen, the picker reshuffle / "Show me others" control, and the
testIDs `dna-reshuffle`, `dna-first-rec`, `dna-rec-buy`, `dna-rec-cta`,
`dna-rec-not-me`, `dna-rec-my-dna`, `dna-rec-skip`.

---

## 3. Trait-routed buyer CTA (monetization)

The first rec and the fragrance detail show the **same bottle with the same
plain reasons to everyone** — reasons stay monetization-blind. Only the CTA is
routed by the user's strongest *buyer* trait.

| # | Requirement | Code |
|---|---|---|
| CTA-1 | Routing: `valueHunter → dupe`, `luxury → original`; default (no buyer trait) → **original** | `src/features/dna/ctaRouting.ts` (`CTA_BY_TRAIT`, `DEFAULT_DNA_CTA`) |
| CTA-2 | On fragrance detail the routed buyer strip (`dna-routed-cta`) renders **only for the dupe case AND when a verified dupe exists** (`dupeCount > 0`); it's a jump-down to Budget Dupes | `app/fragrance/[id].tsx` buyer strip (~542); falls back to `ctaForKind('original')` when `dupeCount === 0` |
| CTA-3 | The `original` case renders **nothing extra** — the top affiliate Buy pill already covers it; the legacy "Get the original" card is gone | `app/fragrance/[id].tsx` |
| CTA-4 | There is **no "$6 sample" route and no "adventurous" route** — `DnaCtaKind` is only `'dupe' | 'original'` | `src/features/dna/ctaRouting.ts:21` |
| CTA-5 | The affiliate Buy pill fires `handleAffiliateClick` with `source_screen: 'fragrance_detail_rail'` | `app/fragrance/[id].tsx` Buy pill (~450) |

**Rationale (kept verbatim from `ctaRouting.ts`):** there is no sample/decant SKU
data, so a "$6 sample" CTA could never be verified to exist — promising one would
point the user at a full-price bottle. The Original is the safe default; a dead
CTA is never shown.

---

## 4. Living DNA — keeping it current

The DNA is not frozen at onboarding. A unified, weighted signal pool with
recency decay re-ranks archetypes; the live archetype **leans** as taste drifts
and **swaps** only after a clear, sustained move (hysteresis).

### 4.1 Signal weighting

`effectiveWeight = base × deliberateFactor × recencyFactor`
(`src/features/dna/signals.ts`).

| Constant | Value | Meaning |
|---|---|---|
| `DELIBERATE_MULTIPLIER` | 1.5 | Deliberate picks/loves outweigh passive likes/left-swipes |
| `RECENCY_TAU_DAYS` | 30 | Exponential recency half-life — recent taste dominates |
| `LEAN_REVEAL_RATIO` | 0.85 | Challenger ≥ 85% of current → surface a lean |
| `SWAP_MARGIN` | 0.05 | Challenger must clear current by this margin to swap |
| `SWAP_COOLDOWN_DAYS` | 14 | Minimum days between archetype swaps |
| `LIVING_DNA_ENABLED` | true | Master flag |

Dislikes route to the **avoided** channel rather than negative-weighting a trait.

### 4.2 Recompute scheduler

`scheduleLivingDnaRecompute(trigger)` (`src/lib/sync/recomputeScheduler.ts`) is a
decoupled, **~1s debounced** request so a burst (e.g. a whole swipe session)
coalesces into one recompute. Triggers: `swipe`, `wear`, `wardrobe`,
`session_end`, `foreground`, `migration`. The real worker is registered once by
`useAppSync` to avoid import cycles.

| # | Requirement | Code |
|---|---|---|
| LIV-1 | Recompute runs on app **foreground**, on a one-time launch **migration**, and debounced after swipe/wear/wardrobe/session-end bursts | `app/_layout.tsx` (foreground + migration), `recomputeScheduler.ts` |
| LIV-2 | A clear move surfaces a **shift banner** (`dna-shift-banner` / `dna-shift-compact`) that can be acknowledged (`dna-shift-ack`) | `src/components/dna/LivingArchetypeReadout.tsx` |
| LIV-3 | A soft drift surfaces a **lean** (`dna-leaning` / `dna-leaning-compact`) with a swap-progress meter (`dna-swap-progress`) | `src/features/dna/livingArchetype.ts` (`isLeaning`, `swapProgress`), `LivingArchetypeReadout.tsx` |
| LIV-4 | Retake stays on the **old archetype until the new reveal commits** (atomic draft) | `app/dna/index.tsx` retake mode; `applyLivingArchetype` |
| LIV-5 | The compact readout rides inside the Today **unified DNA card**; the full readout lives on the My-DNA / taste-profile home | `src/components/dna/UnifiedDnaCard.tsx`, `app/(tabs)/index.tsx` |
| LIV-6 | Recompute fires `DNA_RECOMPUTED`; an archetype swap fires `DNA_ARCHETYPE_CHANGED` | `src/lib/observability/events.ts` |

---

## 5. Scent Preferences — the constraint layer

The third taste layer: hard limits behaviour can't reveal. Reached from the
Profile "Scent Preferences" row (`app/(tabs)/profile.tsx` ~276,
`router.push('/preferences')`) — **not Pro-gated**.

| # | Requirement | Code |
|---|---|---|
| PRF-1 | Four sections: **Budget** (single-select tier 1–5 or No-limit), **Avoid** (multi-select accord groups), **Occasion** (single-select), **Season** (single-select) | `app/preferences/index.tsx` |
| PRF-2 | Every choice writes **straight to the persisted store** — there is **no explicit save step**; "Done"/Back just navigate | `app/preferences/index.tsx` (`setBudget`/`toggleAvoid`/`setOccasion`/`setSeason` → `router.back()`) |
| PRF-3 | The rec engine reads preferences directly each render: avoid + budget become scoring constraints; occasion + season pin context. Occasion **overrides** the time-inferred occasion | `src/stores/useScentPreferencesStore.ts:1`; `src/features/recommend/useRecommendations.ts` |
| PRF-4 | Preferences persist across app kills (AsyncStorage) | `useScentPreferencesStore` persist config |

testIDs: `preferences-screen`, `preferences-back`, `preferences-done`,
`pref-budget-{1..5|none}`, `pref-avoid-<groupId>`,
`pref-occasion-{casual|office|date|evening|formal|workout|travel|none}`,
`pref-season-{spring|summer|fall|winter|none}`.

### 5.1 Weekday-aware SOTD occasion

When no occasion is chosen, the SOTD context infers occasion from the **current
weekday + hour** (`inferOccasionFromTime`,
`src/features/recommend/useRecommendations.ts:72`):

- `>= 20:00` or `< 03:00` → `evening`
- Sat/Sun daytime → `casual` (**never** `office`)
- weekday 09:00–17:00 → `office`
- otherwise → `casual`

A Scent-Preferences occasion overrides this. The "Why today" reason must never
read "discreet enough for the office" on a weekend.

---

## 6. Feedback bubble — direct line to the founder

| # | Requirement | Code |
|---|---|---|
| FB-1 | A floating bubble (`<FeedbackBubble />`, accessibilityLabel "Send feedback") sits bottom-right on every main tab, stacked **above** the gold Scan FAB and visually **secondary** to it | `src/components/feedback/FeedbackBubble.tsx`; mounted `app/(tabs)/_layout.tsx` (~378) |
| FB-2 | It opens the same `FeedbackSheet` reachable from the Profile "Send Feedback" row: four category chips (default "Idea / request"), a required message, optional email | `src/components/feedback/FeedbackSheet.tsx` |
| FB-3 | Submit is disabled until message ≥ 4 chars; field caps at 2000 with a live count; success shows a thank-you that auto-closes ~1.4s | `FeedbackSheet.tsx` (`MIN_LEN`, `MAX_LEN`) |
| FB-4 | Submits write to the shared Pour Picks feedback hub (`APP_TAG = 'perfumepicks'`); fires `FEEDBACK_OPENED` / `FEEDBACK_SUBMITTED` / `FEEDBACK_FAILED`; failure re-enables the form (text preserved) | `src/lib/feedback.ts`, `src/lib/observability/events.ts` |

---

## 7. Navigation note — fragrance detail on the root stack

`fragrance/[id]` is registered on the **root stack**, not nested under the tabs,
so opening a dupe/similar from a detail page builds real back-history and Back
returns to the previous bottle (not Home). Registered at `app/_layout.tsx` (~306,
with a comment about real back-history). The `preferences/index` route is
registered alongside it (~311).

---

## 8. Known loose ends (flagged, not fixed)

- `DNA_FIRST_REC_VIEWED`, `DNA_FIRST_REC_REROLL`, and `DNA_SKIP_TO_APP` remain in
  `src/lib/observability/events.ts` though the FirstRec interstitial UI was
  deleted — likely **dead event names** now.
- The reveal CTA label still reads "See my top match" although it now opens the
  detail page directly (acceptable copy, but worth noting it no longer routes to
  a dedicated "match" surface).
