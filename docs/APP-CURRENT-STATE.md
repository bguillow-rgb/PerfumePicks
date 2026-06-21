# PerfumePicks — App Current State

**Last updated:** 2026-06-21 (reconciled against commit d88cf18)
**Purpose:** A single map of what the app does *now*, every major feature cited
to `path:line`. This is the orientation doc; the QA detail lives in
[`tests/QA-TEST-PLAN.md`](../tests/QA-TEST-PLAN.md) and the requirements in
[`plans/PRD-living-dna-preferences-feedback.md`](../plans/PRD-living-dna-preferences-feedback.md).
**Stack:** React Native / Expo (expo-router), Zustand + AsyncStorage persistence,
Supabase auth/data, RevenueCat Pro gating, PostHog analytics, Sentry.

---

## 1. Entry flow & navigation gates

`app/_layout.tsx` owns the boot sequence. `useProtectedRoute`
(`app/_layout.tsx:76`) runs two gates in order:

1. **Auth gate** (`app/_layout.tsx:91`) — real mode only. No session → redirect
   to `/auth/login`. A non-anonymous session inside the auth group → bounce to
   `/(tabs)`. Demo mode (no Supabase env) skips this so the UI boots without
   credentials.
2. **Onboarding gate** (`app/_layout.tsx:108`) — once a session exists (or in
   demo mode), if the user hasn't seen onboarding they're forced to `/dna`
   (`:110`). Onboarded users are bounced out of `/dna` **unless** they're in
   `retakeMode` (`:111`).

So the path for a brand-new user is: **auth/login → /dna (DNA spine) → /(tabs)**.

**Root stack screens** (`app/_layout.tsx:306`+): `fragrance/[id]` (on the root
stack for real back-history, `:306`), `dna` (gesture disabled, `:307`),
`preferences/index` (`:311`), `paywall` (`:312`), `taste-profile` (`:315`).

**Tabs** (`app/(tabs)/_layout.tsx:317`+): Today (`index`, testID `tab-today`),
Discover (`tab-discover`), Taste (`train`, `tab-taste`), Wardrobe
(`tab-wardrobe`), You (`profile`, `tab-profile`). The Scan FAB and the
`<FeedbackBubble />` (`app/(tabs)/_layout.tsx:378`) overlay every tab.

**Launch-time work** in `RootLayout`: error reporting + analytics + RevenueCat
init (`:140`), OTA update check on launch and foreground (`:151`), and the
Living-DNA migration + foreground recompute (`:189`).

---

## 2. Fragrance DNA pipeline (primary onboarding)

Spine lives in `app/dna/index.tsx`: **picker grid → refine → "reading your
palate" beat → reveal → top-match fragrance detail.** Never paywalled.

| Stage | What it does | Code |
|---|---|---|
| Picker | Recognizable bottles only (tier ≥ 3), most-famous-first; **lazy-loads 12 at a time** on scroll (no reshuffle); selection **capped at 5**; long-press = hard-no | `src/features/quiz/pickerGrid.ts` (`PICKER_GRID_SIZE = 12`, `MAX_PICKS = 5`); `app/dna/index.tsx` `handleScroll` ~277, `handleTap` ~291, `handleLongPress` ~305 |
| Refine | Per-pick relationship (own/want/like) + favorite; "own"→wardrobe `have`, "want"→`want` (both bypass the free cap) | `app/dna/index.tsx` refine handlers |
| Reveal | Archetype emblem + identity line + trait chips + Share + "See my top match" | `src/components/dna/DnaReveal.tsx` |
| Hand-off | "See my top match" → `router.replace('/(tabs)')` then `router.push('/fragrance/<id>')`; no ranked match → Today. **No first-match interstitial** | `app/dna/index.tsx` `handleRecOpen` ~262 |

**Trait-routed buyer CTA** (`src/features/dna/ctaRouting.ts`): `valueHunter →
dupe`, `luxury → original`, default → **original** (`:42`). `DnaCtaKind` is only
`'dupe' | 'original'` (`:21`) — the "$6 sample" and "adventurous" routes are
gone. On fragrance detail the routed strip (`dna-routed-cta`) renders **only**
for the dupe case with a verified dupe (`app/fragrance/[id].tsx` ~542); the
`original` case shows nothing extra beyond the top Buy pill.

**Removed in d88cf18:** FirstRec interstitial, picker reshuffle, and testIDs
`dna-reshuffle` / `dna-first-rec` / `dna-rec-*`.

---

## 3. Living DNA (keeps the DNA current)

The DNA re-ranks as behaviour accrues. Math in `src/features/dna/signals.ts`:
`effectiveWeight = base × deliberateFactor × recencyFactor`. Key constants:
`DELIBERATE_MULTIPLIER = 1.5`, `RECENCY_TAU_DAYS = 30`, `LEAN_REVEAL_RATIO =
0.85`, `SWAP_MARGIN = 0.05`, `SWAP_COOLDOWN_DAYS = 14`, `LIVING_DNA_ENABLED =
true`. Dislikes route to the avoided channel.

- **Scheduler:** `scheduleLivingDnaRecompute(trigger)`
  (`src/lib/sync/recomputeScheduler.ts:44`) — ~1s debounced
  (`RECOMPUTE_DEBOUNCE_MS = 1000`). Triggers: `swipe`, `wear`, `wardrobe`,
  `session_end`, `foreground`, `migration`. Worker registered by `useAppSync` to
  avoid import cycles.
- **Archetype hysteresis:** `applyLivingArchetype`, `isLeaning`, `leaningLabel`,
  `swapProgress` in `src/features/dna/livingArchetype.ts`.
- **Surfaces:** compact readout inside the Today unified card
  (`src/components/dna/UnifiedDnaCard.tsx`); full readout
  (`src/components/dna/LivingArchetypeReadout.tsx`) on the My-DNA / taste-profile
  home. Shift banner (`dna-shift-banner`/`-compact`, ack `dna-shift-ack`); lean
  (`dna-leaning`/`-compact`) + `dna-swap-progress`.
- **Events:** `DNA_RECOMPUTED`, `DNA_ARCHETYPE_CHANGED`
  (`src/lib/observability/events.ts:34`).

---

## 4. Scent Preferences (constraint layer)

`app/preferences/index.tsx`, store `src/stores/useScentPreferencesStore.ts`.
Reached from Profile's "Scent Preferences" row (`app/(tabs)/profile.tsx` ~276),
**not Pro-gated**. Four sections — Budget (single-select tier 1–5/none), Avoid
(multi-select accord groups), Occasion (single-select), Season (single-select).
Every chip writes **straight to the persisted store — no save step**; Done/Back
just navigate. The rec engine reads them each render
(`src/features/recommend/useRecommendations.ts`): avoid + budget become
constraints; occasion + season pin context, with a chosen occasion overriding
the time-inferred one.

testIDs: `preferences-screen`, `preferences-back`, `preferences-done`,
`pref-budget-{1..5|none}`, `pref-avoid-<groupId>`, `pref-occasion-*`,
`pref-season-*`.

**Weekday-aware SOTD occasion** (`inferOccasionFromTime`,
`src/features/recommend/useRecommendations.ts:72`): evenings (≥20:00 or <03:00) →
`evening`; Sat/Sun daytime → `casual` (never `office`); weekday 09:00–17:00 →
`office`; else `casual`. A preference occasion overrides it.

---

## 5. Fragrance detail

`app/fragrance/[id].tsx`, on the **root stack** for real back-history. Contains:
the affiliate **Buy pill** ("Buy from <retailer> · $price", fires
`handleAffiliateClick` with `source_screen: 'fragrance_detail_rail'`, ~450); the
dupe-only routed buyer strip (~542); note pyramid / accords / performance bars;
Budget Dupes and Similar sections; private notes, layering, compliments (F6);
add-to-wardrobe and log-wear entry points.

---

## 6. Tabs at a glance

| Tab | File | Highlights |
|---|---|---|
| Today | `app/(tabs)/index.tsx` | Unified DNA hero card (retake → `startRetake()` + `/dna`; learn-more → `/taste-profile`); SOTD "Wear today" pick with weekday-aware reason; `GetStartedHero` for new users without a live DNA |
| Discover | `app/(tabs)/discover.tsx` | Search, brands, accords, editorial edits |
| Taste | `app/(tabs)/train.tsx` | Swipe training (love/like/pass) feeding Living DNA |
| Wardrobe | `app/(tabs)/wardrobe.tsx` | Collection by status (have/want/tested/sold), filters, analytics |
| You | `app/(tabs)/profile.tsx` | Scent Preferences row (~276), Send Feedback row, Wrapped, account, Pro |

---

## 7. Feedback

Floating `<FeedbackBubble />` (`src/components/feedback/FeedbackBubble.tsx`,
accessibilityLabel "Send feedback") above the Scan FAB on every tab, plus a
Profile "Send Feedback" row — both open `FeedbackSheet`
(`src/components/feedback/FeedbackSheet.tsx`): four category chips (default "Idea
/ request"), message (min 4, max 2000 chars), optional email. Writes to the
shared Pour Picks hub (`src/lib/feedback.ts`, `APP_TAG = 'perfumepicks'`); fires
`FEEDBACK_OPENED` / `FEEDBACK_SUBMITTED` / `FEEDBACK_FAILED`.

---

## 8. Stores (Zustand + AsyncStorage)

| Store | Role |
|---|---|
| `useTasteProfileStore` | Durable Fragrance DNA + live archetype |
| `useScentPreferencesStore` | Stated constraints (§4) |
| `useOnboardingStore` | `hasSeenOnboarding`, `hydrated`, `retakeMode` — drives the onboarding gate |
| `useWardrobeStore` | Collection items by status |
| `useWearLogStore` | Wear logs (SOTD, history) |
| Swipe/train store | Train feedback feeding Living DNA |

---

## 9. Analytics

All event names are centralized in `src/lib/observability/events.ts` and the
`track` wrapper is typed to require an `EventName` (raw strings won't compile).
Notable groups: DNA (reveal/CTA/recompute/archetype-changed), affiliate
(`AFFILIATE_OUTBOUND_CLICKED` / `AFFILIATE_LINK_FAILED`), feedback, wardrobe,
wear, train, Pro/paywall, sync.

---

## 10. Known loose ends (flagged, not changed)

- `DNA_FIRST_REC_VIEWED`, `DNA_FIRST_REC_REROLL`, `DNA_SKIP_TO_APP` still exist
  in `src/lib/observability/events.ts:26` though the FirstRec UI was deleted —
  likely **dead event names**.
- The reveal CTA label still says "See my top match" although it now opens the
  fragrance detail directly (acceptable copy, noted for clarity).
