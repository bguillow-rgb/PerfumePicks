# PerfumePicks — Milestone Plan

**Goal:** Build the chassis for every v1 feature first — auth, sync, every screen wired to real Supabase queries with empty states — and bolt content (catalog volume, copy, screenshots, real users) on top later. Three engineering milestones plus a parallel content-population workstream.

**Strategic shift (2026-05-14):** The previous plan was a checklist that interleaved plumbing (auth, sync, RLS) with content concerns (2,500-fragrance seed, marketing screenshots, affiliate approvals). It's now restructured so plumbing finishes first: M1 closes auth + sync + Pro gating; M2 builds stub UI + queries for EVERY v1 feature against real Supabase tables with tested RLS; content production runs as a parallel workstream once M2 closes; M3 is the AI wave.

---

## Status legend

- ✅ done — verified in code today
- 🟡 in-progress — partially built, gap explicit in task body
- ⬜ not started — no code yet
- 🛑 blocked — reason stated inline

**Effort:** S = <30 min · M = 30 min – 2 h · L = half day or more
**Risk:** low · med · high — likelihood of surprise during execution

---

## Mark Z Review — 2026-05-14 (P0 fixes folded in)

Plan reviewed by Mark Z post-rewrite. Four P0 issues folded into the body:

1. **Pro gate hardened to server-side enforcement** (M1 Phase C) — RC webhook → `profiles.is_pro` → RLS `is_pro_user(uid)` function. Client flags are UX only.
2. **Offline queue deferred to post-M2; today's policy is fail-loudly** (M1 Phase A) — `syncWrite` helper, toast on fail, manual retry banner, Sentry alert at >5 unsynced rows.
3. **AI cost guards layered, not single** (M3 Phase A) — per-user, per-IP, account-age, total daily, manual kill switch.
4. **Migration naming convention switched to timestamp prefixes** (M2 Phase B) — also split the 6-table-in-one-migration into six discrete migrations + six RLS migrations + a real pgTAP test suite + FK/soft-delete safety on `fragrances.id`.

Plus the smaller P1 items: `wear_logs.mood` schema move from M3 → M2, `<EmptyState>` shared component, Apple Sign-In split into verify-then-implement, avatar upload constraints spelled out, observability event taxonomy in `src/lib/observability/events.ts`.

---

## Execution Gate — N=3 commit rule

Mark Z's last point: "stop relitigating scope." From here forward, **commit to executing N tasks before requesting next replan.** Default N=3. Plan changes mid-N require explicit founder approval, not drift.

**Current N (M1 Phase A start):**
1. Mount `useAppSync` in `_layout.tsx` + add `hydrate()` actions to all three stores (the broken plumbing).
2. Add `syncWrite` helper + write-through on wardrobe/wear/swipe stores with fail-loudly toast policy.
3. Switch `clientId()` to `uuid v4` so locally-created rows survive Supabase round-trip.

Verify Phase A exit criterion (sign-in hydrates, sign-out clears, writes persist) on real device before picking the next N.

---

## Strategy Update — 2026-05-14 (hybrid data sources, plumbing-first reshape)

**Catalog now uses a hybrid data model** instead of a single licensed API:

- **Affiliate feeds (CJ FragranceX / Rakuten Sephora / Amazon Associates) supply images, price, retailer link, and our affiliate tag** — same integration powers both the eventual catalog seed AND the M2 "Buy from" monetization surface.
- **Fragella API (Basic, $12/mo) backfills notes pyramid, accord weights, longevity, sillage, perfumer.** Image-mirroring rights to our Supabase CDN confirmed in writing by Fragella support.
- **Scraped niche-house data** (~50 houses already collected in `scripts/data/frag-*-raw.json` by another agent) covers fragrances neither source handles well.
- See the Content Population workstream at the bottom for the full per-field source priority table.

**The plumbing-first reshape** means catalog volume is no longer an M1 blocker. M1 ships against the existing 50-row `014_seed_catalog.sql` plus the demo-mode `MOCK_CATALOG` fallback. The big ETL + ≥2,500 catalog target moves to "Content Population (post-M2)" and runs in parallel with M3.

---

## Research Updates — 2026-05-13

Based on `plans/Market-Research-Competitive-Analysis.md` (top-5 iOS apps + affiliate analysis). Deltas folded into the new milestone structure:

- **Catalog seed target ≥2,500 / 5K stretch** — pushed to Content Population, no longer an M1 deliverable.
- **Image source decision** — Fragella API license + user uploads (Parfumo model), see Content Population. Never scrape Fragrantica.
- **Affiliate "Buy from" links** — wired in M2 against placeholder URLs; CJ / Rakuten / Amazon approvals happen during Content Population.
- **`empty` wardrobe status** — added to M2 (small schema add, popular collector signal).
- **Weather-aware morning pick** — wired with placeholder weather in M2; AI upgrade lives in M3.
- **Layering log + compliments log** — explicit M2 surfaces.
- **Filter UX** — elevated in M2 (recurring Parfumo complaint).
- **Bottle scan** — M3 (AI wave) only.
- **Don't build:** decant marketplace / direct subscription / brand-partner integrations — see bottom of doc.

---

## Audit — actual state observed 2026-05-13

| Area | State | Evidence |
|---|---|---|
| Auth gate in `_layout.tsx` | ✅ implemented (`useProtectedRoute`) | `app/_layout.tsx:69-89` |
| Session subscription + RC identify | ✅ implemented | `app/_layout.tsx:119-160` |
| `useAppSync` hook | ✅ written but **NOT mounted** in `_layout.tsx` | `src/lib/sync/useAppSync.ts` exists; `grep -l useAppSync` returns only the file itself |
| `useWardrobeStore` Supabase write-through | ⬜ none — AsyncStorage only | `src/stores/useWardrobeStore.ts` is pure Zustand+AsyncStorage; no Supabase calls; no `hydrate` action defined yet (but called by `useAppSync`) |
| `useWearLogStore` Supabase write-through | ⬜ none — AsyncStorage only | Same — no `hydrate` action |
| `useSwipeStore` Supabase write-through | ⬜ none — AsyncStorage only | Same — no `hydrate` action |
| `useCatalogStore` Supabase reads | ✅ implemented, demo-mode fallback works | `src/stores/useCatalogStore.ts` |
| `MOCK_CATALOG` direct imports outside store | 🟡 **10 files** still import it (plan claim of 15 is stale) | `src/mock/fragrances.ts`, `src/features/recommend/useRecommendations.ts`, `src/components/sheets/FragranceNotesSheet.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/train.tsx`, `app/(tabs)/fragrance/[id].tsx`, `app/brand/[name].tsx`, `app/quiz/results.tsx`, plus `useCatalogStore.ts` itself |
| Pro gate plumbing | ✅ RC init + `useProStore.activate()` on session | `app/_layout.tsx:114-117, 128-137`; `src/lib/revenuecat.ts`; `src/stores/useProStore.ts` |
| Migrations 001–004 + 014 | ✅ applied | `supabase/migrations/` |
| `wear_logs.is_public`, `follows`, `wear_log_reactions`, `profiles` streak cols | ✅ exist | `003_sotd_social.sql`, `004_sotd_rls.sql` |
| `014_seed_catalog.sql` | ✅ exists, **50 rows** (not 2,500) | 476-line file with 25 brands + 50 fragrances |
| `fragrance_reviews` table | ⬜ does not exist | not in any migration |
| `user_badges` table | ⬜ does not exist | not in any migration |
| `layering_entries` / `compliments` tables | ⬜ do not exist | not in any migration |
| `delete-account` Edge Function | ✅ exists | `supabase/functions/delete-account/` |
| Login screen | ✅ exists | `app/auth/login.tsx` |

---

## Milestone 1 — FOUNDATION
**"Real auth, real sync, real data — for the user's own data."**

Layers 1, 2, 3, 6 from the original plan (auth + session, sync engine, catalog read layer, Pro / paywall gating). Catalog content quality bar is intentionally low: `014_seed_catalog.sql` (50 rows) is enough; the ETL pipeline lives in the Content Population workstream.

**Exit criterion (overall, testable):** on a fresh device, sign in with Apple. Within 2 seconds every screen loads with real data hydrated from your account — wardrobe, wear logs, swipes, taste profile all read from Supabase. Every wardrobe / wear / swipe action writes through to Supabase and reappears after sign-out, reinstall, sign-in (verify by signing in on a second device and seeing the same data). Free-tier limits enforce (e.g. 10 swipes/day cap already in `useSwipeStore`); Pro features visibly gate via `useProStore`. Demo mode (no `EXPO_PUBLIC_SUPABASE_URL`) still boots straight to `(tabs)` for UI review.

---

### Phase A — Mount sync, finish stores

Audit: `useAppSync` is fully written; `_layout.tsx` does not call it; the three remote-backed stores don't have a `hydrate()` action despite the hook trying to call one. Fix this first; everything else in M1 depends on it.

- ⬜ Mount `useAppSync(session?.user?.id ?? null)` in `RootLayout`. (S, low) — one import + one hook call in `app/_layout.tsx`.
- ⬜ Add `hydrate(rows: WardrobeItem[])` to `useWardrobeStore` (replaces local list, marks hydrated). (S, low)
- ⬜ Add `hydrate(rows: WearLog[])` to `useWearLogStore`. (S, low)
- ⬜ Add `hydrate(rows: SwipeRecord[])` to `useSwipeStore`. (S, low)
- ⬜ Wire wardrobe `add` / `update` / `remove` to also write to `wardrobe_items` (Supabase) when `isSupabaseConfigured`. **On failure: keep the local write, toast the user "Couldn't sync — will retry on next launch," log to Sentry.** No silent swallowing. (M, low — see Failure Policy below)
- ⬜ Wire wear-log `add` / `update` / `remove` to also write to `wear_logs`. Streak trigger fires server-side (migration 003 already installs it). Same failure policy. (M, low)
- ⬜ Wire swipe `record` to upsert `swipe_feedback` (one row per fragrance per user). Same failure policy. (S, low)
- ⬜ Wardrobe ID strategy: switch `clientId()` to `uuid v4` so locally-created rows survive the round-trip to Supabase without server-side regeneration. (S, low)
- ⬜ Sign-out path: clear all three stores via existing `hydrate([])` branch — verify no data leaks between accounts on the same device. (S, low) — requires `hydrate` actions above.

#### Failure Policy — fail loudly, no offline queue yet (P0, Mark Z review)
A real offline queue (idempotency keys, retry-with-backoff, cross-device conflict resolution, replay on reconnect) is two engineering days minimum. **Deferred to post-M2 hardening.** Today's policy:

- ⬜ Single helper `syncWrite(table, row): Promise<{ok: boolean, error?: string}>` wraps every write-through call. On failure: returns ok=false, the caller toasts the user, Sentry logs, the local store keeps the row marked `_unsynced: true`. (S, low)
- ⬜ On next app foreground / next sign-in, surface any `_unsynced: true` rows in a simple "Tap to retry sync (N items)" banner. No automatic replay yet — manual, visible, deliberate. (S, low)
- ⬜ Sentry alert at >5 unsynced rows for any user over a 24-hour window. (S, low)

The proper offline queue is M2-hardening or M3 work. Don't pretend it's free.

**Phase A exit:** on sign-in, the three stores receive Supabase rows; on sign-out they empty. Adding a fragrance to wardrobe persists to Supabase (verify in Studio); deleting it removes the row. No `MOCK_CATALOG` calls have changed yet — that's Phase B.

---

### Phase B — Catalog read layer everywhere

Audit: `useCatalogStore` is correctly wired to Supabase with demo-mode fallback. The 10 files still importing `MOCK_CATALOG` mostly do it for sync getters or specific lookups; each one needs to switch to `useCatalogStore.getState().getById(id)` or the appropriate async fetcher with React Query caching.

- ⬜ Replace `MOCK_CATALOG` direct imports in 9 files (not counting `useCatalogStore.ts` itself which uses it only as demo-mode fallback). Each is a 5–15 line edit. (M, low — repetitive but mechanical):
  - `src/features/recommend/useRecommendations.ts`
  - `src/components/sheets/FragranceNotesSheet.tsx`
  - `app/(tabs)/index.tsx`
  - `app/(tabs)/discover.tsx`
  - `app/(tabs)/train.tsx`
  - `app/(tabs)/fragrance/[id].tsx`
  - `app/brand/[name].tsx`
  - `app/quiz/results.tsx`
  - `src/mock/fragrances.ts` — keep this as the demo-mode dataset; no edit required, just verify nothing in `app/` paths leans on it outside `useCatalogStore.getById`.
- ⬜ `useFragrance(id)` React Query hook wrapping `useCatalogStore.fetchById` — cache key `['fragrance', id]`, stale time 5 min. (S, low)
- ⬜ `useFragranceSearch(query)` hook wrapping `useCatalogStore.search` — debounced 300 ms. (S, low)
- ⬜ Verify pg_trgm fuzzy search returns sensible results against the 50-row seed; if not, add `gist` index in a tiny migration. (S, low — likely already fine)

**Phase B exit:** `grep -rln "MOCK_CATALOG" src/ app/` returns only `src/mock/fragrances.ts` and `src/stores/useCatalogStore.ts`. Every screen reads from Supabase via the catalog store. Demo mode still works.

---

### Phase C — Pro / paywall + account essentials

Audit: RC init runs on app start; `useProStore.activate()` is called when session changes. Paywall screen exists at `app/paywall.tsx`. Delete-account Edge Function exists.

- ⬜ Define free-tier limits in one place (e.g. `src/lib/limits.ts`): wardrobe cap (e.g. 20 items), daily swipe cap (already 10), Pro-gated screens (taste profile analytics, Wrapped, weather push). (S, low) — **client-side limits are UX only, never enforcement** (see Pro Gate Hardening below).
- ⬜ Enforce wardrobe cap in `useWardrobeStore.add` — return a sentinel + show paywall sheet. (S, low)
- ⬜ Restore-purchases button in Settings → call RC `restorePurchases` → re-run `isProActive`. (S, low)
- ⬜ **Apple Sign In — verify config first** (bundle id, capability, associated domains, EAS profile all green). (S, low — pure verification)
- ⬜ **Apple Sign In — implement flow** end-to-end; deep-link callback hits `(tabs)` cleanly. (M, low if verify above passes; M, med otherwise)
- ⬜ Profiles row auto-creation on first sign-in — already in `useAppSync.ensureProfile`. (S, low — verify)
- ⬜ Display name + bio editable in Profile screen, writes to `profiles`. (S, low)
- ⬜ **Avatar upload to Supabase Storage** with explicit constraints: max 500KB after compression, max 1024×1024, JPEG only. Bucket `avatars`, RLS owner-only on path `avatars/{uid}.jpg`, signed URL with 1-hr expiry for read. (M, med — image-picker + compression + bucket + RLS)
- ⬜ Delete-account button in Profile calls existing `delete-account` Edge Function; show confirmation + sign-out on success. (S, low)
- ⬜ Privacy + Terms screens — already exist at `app/legal/`; verify links from Profile and Login. (S, low)

#### Pro Gate Hardening — server-side enforcement (P0, Mark Z review)
**Client-side `useProStore` flags are UX only.** A jailbroken or modded build flips them in seconds. Real enforcement must live in Postgres RLS.

- ⬜ RevenueCat webhook → Supabase Edge Function that updates `profiles.is_pro boolean not null default false` and `profiles.pro_expires_at timestamptz`. (M, med — webhook signature verification matters)
- ⬜ Postgres function `is_pro_user(uid uuid) returns boolean security definer` reading from `profiles.is_pro` AND `pro_expires_at > now()`. (S, low)
- ⬜ Every Pro-only RPC declares `using (is_pro_user(auth.uid()))` in its RLS policy or wraps in a guard. Pro-only RPCs identified so far: `get_year_in_review` (Wrapped), the M3 collaborative-filtering RPC, the AI "Why this?" Edge Function. (M, med — pattern set here, applied per Pro-only feature as it ships)
- ⬜ Client `useProStore` reads `profiles.is_pro` on session change (not just RevenueCat). Two sources must agree before unlocking UI; if they disagree, lock the feature and log to Sentry. (S, low)

#### Observability Taxonomy — single source of truth for PostHog events
- ⬜ Create `src/lib/observability/events.ts` with typed event names enum (`enum Event { AFFILIATE_OUTBOUND_CLICKED = 'affiliate_outbound_clicked', WARDROBE_ITEM_ADDED = 'wardrobe_item_added', ... }`). (S, low)
- ⬜ Wrap PostHog calls in a single helper `track(event: Event, props?: Record<string, unknown>)`. No raw event strings allowed anywhere. (S, low)
- ⬜ TypeScript-enforce: `eslint-no-restricted-syntax` rule that fails CI if a `posthog.capture(` string literal appears anywhere except the helper. (S, low) — when CI exists.

**Phase C exit:** sign in, sign out, restore purchases, delete account all work on a physical device against a real Supabase project. Free-tier user can't add a 21st wardrobe item without seeing the paywall. Avatar upload round-trips. **Server-side Pro gate proven:** RC webhook flips `profiles.is_pro`; a manual SQL update to `is_pro=false` immediately revokes Pro features on next query (confirmed by RLS test). Client `useProStore` and `profiles.is_pro` agree on every session.

---

## Milestone 2 — WIRING
**"Every screen the v1 launch will have, plumbed end-to-end, even if empty."**

This is the plumbing-first thesis made concrete: every M3/M4/M5 feature from the old plan gets stub UI + real Supabase query + tested RLS policy + non-broken empty state. Empty arrays today, real content later. The exit isn't "feature looks beautiful" — it's "feature is fully plumbed end-to-end with verified RLS, ready for content to land on top."

**Exit criterion (overall, testable):** every screen in `plans/FUTURE_PHASE_REQUIREMENTS.md` F1–F10 has (a) a working route, (b) a Supabase query or RPC behind it, (c) a tested RLS policy with both authorized and unauthorized cases verified, (d) a non-broken empty state. None of them have to look beautiful or have content. A QA pass with a brand-new account should produce empty screens that all render without crashes, errors, or "undefined" text.

Tasks within a phase can be done in any order. Phases must be done in order — schema/RLS first (B and C) before UI consumers; A is independent.

---

### Phase A — Wardrobe + wear tracking + private notes UI completion

This is the part the founder demos. The data layer is in M1; the UI layer goes here. F1 (wear tracking) and F6 (private notes) close in this phase.

- ⬜ Spray bottle icon on every wardrobe card; one-tap opens `LogWearSheet` pre-filled with that fragrance. (S, low) — `LogWearSheet` already exists.
- ⬜ Wear count badge on wardrobe cards ("Worn 14×") via `useWearLogStore.countByFragrance()`. (S, low)
- ⬜ "Last worn" label on fragrance detail page. (S, low)
- ⬜ Backdating: date picker in `LogWearSheet`, defaults today, up to 2 years back. (S, low)
- ⬜ Edit / delete individual wear log entries from fragrance detail history list. (S, low)
- ⬜ Wear history list on fragrance detail (chronological, newest first). (S, low)
- ⬜ Private notes text field on fragrance detail — reads/writes `wardrobe_items.notes` (column exists). (S, low)
- ⬜ Search wardrobe by note keyword. (S, low)
- ⬜ Add fragrance flow: search → detail → "Add to Wardrobe" → status/size sheet. Already partially wired; verify against real catalog. (S, low)
- ⬜ Edit wardrobe item: status, remaining mL, purchase price. (S, low)
- ⬜ Running-low indicator (< 20% mL) — `runningLow()` selector already exists. Just surface it. (S, low)
- ⬜ Migration: extend `wardrobe_items.status` enum to include `'empty'` (joins existing `have` / `want` / `tested` / `sold_on`). (S, low) — small DB add per competitive analysis row 23.
- ⬜ `'empty'` filter pill on wardrobe screen. (S, low)
- ⬜ Quiz results write to `quiz_results` table (already exists in schema). (S, low — verify currently writes)
- ⬜ Quiz re-run option in Profile settings. (S, low)
- ⬜ "FROM YOUR WARDROBE" carousel powered by real wardrobe + real catalog (already built; just verify the wiring after Phase B of M1 lands). (S, low)
- ⬜ Home "New Arrivals" rail reads `fragrances.created_at DESC LIMIT 20`. (S, low)

**Phase A exit:** wear tracking is end-to-end functional — log a wear, see the count tick up across detail page and card, edit/delete, backdate. Private notes round-trip. Wardrobe CRUD works against Supabase with the `'empty'` status visible. Quiz writes to Supabase.

---

### Phase B — Schema gaps + RLS for everything else

Stub UI in Phase C needs tables and policies. Get them all in one migration sprint so the UI work in Phase C is just "wire screens to queries".

#### Migration naming convention (P0, Mark Z review)
**Switch from sequential `005_` numbering to timestamp prefixes** to prevent two branches claiming the same slot:
- Format: `YYYYMMDDHHMM_short_description.sql` (Supabase CLI compatible).
- ⬜ Rename next new migrations to timestamp format. Old `001_initial_schema.sql` etc. stay as-is — don't rewrite history. New migrations from here use timestamps. (S, low)

#### Schema additions — six new tables, six discrete tasks
Mark Z review flagged that "one big migration with 6 tables" hides scope. Splitting:

- ⬜ Migration `<ts>_fragrance_reviews.sql`: `fragrance_reviews (id uuid pk, user_id uuid not null references auth.users on delete cascade, fragrance_id uuid not null references fragrances(id) on update cascade on delete restrict, rating_overall int check (rating_overall between 1 and 5), rating_longevity int, rating_sillage int, rating_value int, body text, helpful_count int not null default 0, created_at timestamptz default now(), unique(user_id, fragrance_id))`. (M, low)
- ⬜ Migration `<ts>_review_helpful_votes.sql`: `review_helpful_votes (user_id uuid references auth.users, review_id uuid references fragrance_reviews on delete cascade, value boolean not null, created_at timestamptz default now(), primary key(user_id, review_id))`. Plus AFTER INSERT/DELETE trigger to maintain denormalized `fragrance_reviews.helpful_count`. (M, low)
- ⬜ Migration `<ts>_layering_entries.sql`: `layering_entries (id uuid pk, user_id uuid references auth.users, fragrance_a_id uuid references fragrances, fragrance_b_id uuid references fragrances, notes text, created_at timestamptz, check(fragrance_a_id < fragrance_b_id))`. (S, low)
- ⬜ Migration `<ts>_compliments_log.sql`: `compliments_log (id uuid pk, user_id uuid references auth.users, fragrance_id uuid references fragrances, what_was_said text, context text, occurred_on date, created_at timestamptz)`. (S, low)
- ⬜ Migration `<ts>_user_badges.sql`: `user_badges (id uuid pk, user_id uuid references auth.users on delete cascade, badge_key text not null, awarded_at timestamptz default now(), unique(user_id, badge_key))`. (S, low)
- ⬜ Migration `<ts>_fragrance_retailer_links.sql`: side table over JSONB for cleaner click-tracking. `fragrance_retailer_links (id uuid pk, fragrance_id uuid references fragrances, retailer text not null, url text not null, our_affiliate_tag text, price_cents int, last_seen_at timestamptz)`. (M, low)
- ⬜ Migration `<ts>_mood_on_wear_logs.sql`: add `mood text` nullable column to `wear_logs`. Schema first, UI consumes in M3. (S, low) — moved from M3 per Mark Z review.

#### FK + soft-delete safety (P0, Mark Z review)
- ⬜ Migration `<ts>_fragrance_id_safety.sql`: add `merged_into_id uuid references fragrances(id)` to `fragrances` for soft-delete redirects. **Never DELETE a fragrance row** — set `merged_into_id` instead. Update read queries to resolve redirects. ON UPDATE CASCADE on every FK pointing at `fragrances.id`. (M, med)

#### RLS — one policy migration per table
- ⬜ Migration `<ts>_fragrance_reviews_rls.sql`: enable RLS; owner read/write/update/delete; public select; service-role bypass. (S, low)
- ⬜ Migration `<ts>_review_helpful_votes_rls.sql`: enable RLS; owner read/write; public select for aggregate counts only via a view. (S, low)
- ⬜ Migration `<ts>_layering_entries_rls.sql`: enable RLS; owner-only on every operation. (S, low)
- ⬜ Migration `<ts>_compliments_log_rls.sql`: enable RLS; owner-only on every operation. (S, low)
- ⬜ Migration `<ts>_user_badges_rls.sql`: enable RLS; owner select; service-role insert (triggered by wear log + streak logic, never client-side). (S, low)
- ⬜ Migration `<ts>_fragrance_retailer_links_rls.sql`: enable RLS; public select; service-role write (ETL only). (S, low)

#### RLS test fixtures (Mark Z review — pick a tool, don't hand-roll)
- ⬜ Choose tool: pgTAP via `supabase test db` (recommended) OR a Deno script using two service-role keys masquerading as different users. **pgTAP is the right boring choice.** (S, low — decision only)
- ⬜ Write `supabase/tests/rls.test.sql` covering: each new table, two users, owner-only assertions, public-read assertions, unauthorized-access denial. (L, med — pays off forever)

#### Computed helpers + RPCs
- ⬜ Per-fragrance "similar in your wardrobe" — no schema change; computed client-side as Jaccard on top notes between the viewed fragrance and the user's `wardrobe_items`. Add `getSimilarInWardrobe(fragranceId)` helper. (S, low)
- ⬜ Scent twins — computed via Jaccard on `wear_logs.fragrance_id` between users; one RPC `get_scent_twins(target_user uuid)` returning top 10 candidate users. (M, med)
- ⬜ Perfume Wrapped RPC `get_year_in_review(target_user uuid, year int)` returning the F10 stat bundle. RPC SECURITY DEFINER, gated on `auth.uid() = target_user` AND `is_pro_user(auth.uid())`. (L, med)
- ⬜ Streak fields — already on `profiles` (per migration 003). Verify they update on each `wear_logs` insert via the trigger that exists. (S, low — read-only verify)

#### Shared UI primitive
- ⬜ `<EmptyState>` component (`src/components/ui/EmptyState.tsx`) with title / subtitle / illustration / CTA props. Every M2 Phase C stub uses it. Reduces 50 design decisions to 50 copy decisions. (S, low — Mark Z review)

**Phase B exit:** every table the v1 launch will read from exists with RLS policies tested for both authorized and unauthorized access. RPCs for Wrapped + scent twins return data (empty arrays for new users) without errors.

---

### Phase C — Stub UI for every M3 / M4 feature

This is the strategic shift. Each screen below ships now, queries real Supabase, renders an empty state today. Beauty and content land later.

#### Taste profile (closes F3)
- ⬜ "My Taste Profile" route in Profile tab, queries `user_taste_profiles` for current user, renders empty state when `signal_count = 0`. (M, low)
- ⬜ Top 10 notes by weight from `liked_notes` JSONB — ranked list or simple bubble chart. (M, low)
- ⬜ Top accords + families breakdown from `preferred_accords` / `preferred_families`. (S, low)
- ⬜ Notes split by pyramid position (top / heart / base) — computed from owned-fragrance pyramid intersection. (M, low)
- ⬜ "Explore more like this" → Discover prefiltered by top notes. (S, low)
- ⬜ Shareable taste profile card via `react-native-view-shot`. (M, med — image export is fiddly)

#### SOTD feed (closes F2 plumbing)
- ⬜ `is_public` toggle on `LogWearSheet`, off by default. (S, low) — column already exists.
- ⬜ `useSOTDFeed` infinite query against `wear_logs where is_public = true`, ordered by `worn_on DESC, created_at DESC`. (M, low)
- ⬜ Discover tab "Today" + "Following" + "Trending" sections. (M, med)
- ⬜ `WearLogFeedCard` component: avatar, fragrance, occasion, weather, notes, reaction bar, time. (M, low)
- ⬜ Multi-fragrance day grouping: same user + same `worn_on` → one card with fragrance chips. (M, med)
- ⬜ Reactions UI writes to `wear_log_reactions` (table exists, trigger updates `wear_logs.reaction_count`). (S, low)
- ⬜ "Want to try" reaction → also adds the fragrance to wardrobe with `status='want'`. (S, low)
- ⬜ Follow / unfollow user — writes to `follows`. (S, low)
- ⬜ Following tab filters feed to `wear_logs` where `user_id in (select followee_id from follows where follower_id = auth.uid())`. (S, low)
- ⬜ User profile route `app/user/[id].tsx`: public wear log history, follower/following counts, collection size, taste profile summary. (M, med)
- ⬜ Follow suggestions: simple Jaccard on `user_taste_profiles.preferred_accords`. (M, med)

#### Reviews (closes F7)
- ⬜ Review form on fragrance detail — overall + longevity + sillage + value (1–5 each) + body. Writes `fragrance_reviews`. (M, low) — requires Phase B table.
- ⬜ Community reviews list on fragrance detail, sorted by helpful. Empty state today. (S, low)
- ⬜ "Owns this" badge when reviewer has fragrance in their wardrobe. Computed via join. (S, low)
- ⬜ Helpful / not helpful vote writes `review_helpful_votes`; optimistic UI. (S, low)
- ⬜ Report review → existing `content_reports` table. (S, low)

#### Season / occasion / weather-aware morning push (closes F5)
- ⬜ "What should I wear?" shortcut on home screen. (S, low)
- ⬜ Occasion picker (casual / office / date / formal) + time-of-day. (S, low)
- ⬜ Live weather fetch via Expo Location → OpenWeatherMap free tier (no key in code; placeholder until M1 of Content Population provisions the key in EAS secrets). (M, med)
- ⬜ Rules-based scoring: season + temp band + occasion proxy + accord weights from `user_taste_profiles`. No Claude API yet — that's M3. (M, med)
- ⬜ Results show 3–5 owned fragrances with one-line reasons. (S, low)
- ⬜ "Wear this today" → logs wear. (S, low)
- ⬜ Opt-in morning push at user-configured time. Expo Notifications setup + scheduled local notification. (M, med)
- ⬜ Empty state for users with < 5 wardrobe items: "Add a few fragrances to get personalized picks." (S, low)

#### Similar in your wardrobe + relationship map seed (closes F4 detail-page version)
- ⬜ "Similar in your wardrobe" section on fragrance detail, computed via Phase B helper. Empty when wardrobe is small. (S, low)
- ⬜ Full relationship-map screen — deferred to M3 backlog (per old plan); leave a route stub that links to a "coming soon" state. (S, low)

#### Layering log + compliments log (closes F6 layering + compliments ACs)
- ⬜ "Add a layering entry" button on fragrance detail → fragrance picker → notes. Writes `layering_entries`. (M, low) — Phase B table.
- ⬜ Layering history list per fragrance. (S, low)
- ⬜ "Log a compliment" entry on fragrance detail (separate first-class entry, not generic notes). Writes `compliments_log`. (S, low)
- ⬜ Compliments count badge on wardrobe cards (signal of high-performance bottles). (S, low)

#### Streaks + badges + daily reminder (closes F10 streak inputs)
- ⬜ Streak counter on home screen reads `profiles.current_streak`. Renders 0 today for new users. (S, low)
- ⬜ Badge unlock check after each wear log → write `user_badges` for 7 / 30 / 100 / 365 thresholds. Toast on unlock. (M, low)
- ⬜ Badge display on Profile. (S, low)
- ⬜ Opt-in daily reminder push: "What are you wearing today?" at user-configured time. (M, med — Expo Notifications)
- ⬜ Skip reminder if a wear log already exists for today. (S, low)

#### Perfume Wrapped scaffold (closes F10)
- ⬜ "Perfume Wrapped" entry in Profile, queries Phase B RPC. (S, low)
- ⬜ Swipeable card UI shell — one stat per screen, branded visuals placeholder. (M, med)
- ⬜ Empty state for users with <10 wears or before December 1: "Come back in December." (S, low)
- ⬜ Each card exportable via `react-native-view-shot`. (S, low — pairs with taste profile share card)

#### Scent twins (closes social Phase 2)
- ⬜ Discover tab "Your Scent Twins" section, queries Phase B RPC. Empty state today. (S, low)
- ⬜ Tap twin → user profile route already built above. (S, low)

#### Discover filter UX
- ⬜ Faceted filter sheet on Discover: brand, accord, family, year range, price tier, longevity, sillage, gender. (L, med — UI is the bulk)
- ⬜ Multi-select with active-filter chip row + clear-all. Persist per session. (M, low)
- ⬜ Empty state honors filters: "No fragrances match. Loosen filters." (S, low)

#### Affiliate "Buy from" links (closes competitive row 35)
- ⬜ `fragrance_retailer_links` table populated for now with placeholder URLs (per Phase B). (S, low)
- ⬜ Fragrance detail "Buy from" section showing retailer chips with placeholder logos + price-if-present. (M, low)
- ⬜ FTC disclosure: visible "We may earn a commission" string in the section. (S, low) — legal requirement, ships today even with placeholder URLs.
- ⬜ PostHog event on click for attribution analytics. (S, low) — analytics layer already initialized.

**Phase C exit:** every F1–F10 surface has a route, a real Supabase query, a tested RLS policy, and a tidy empty state. A QA walkthrough on a brand-new account hits zero crashes and zero "undefined" text. The screens are ugly, but they are wired.

---

## Milestone 3 — AI WAVE
**"Claude API integration, recommendation explanations, bottle scan."**

Stays as a separate milestone because the engineering pattern is different: API key management, prompt design, fallback paths, cost monitoring, model routing. Plumbing for AI is not the same as plumbing for CRUD. Closes F9 in full and adds the bottle-scan backlog item.

**Exit criterion (overall, testable):** "Why this?" string renders on every recommendation card and is generated by Claude with a deterministic fallback when the API errors or budget caps. Bottle-scan camera flow identifies one of the 50 seeded fragrances with ≥80% confidence in good lighting and refuses low-confidence matches. Per-user daily Claude cost stays under a fixed cap.

---

### Phase A — Claude client + prompt design + cost guard

- ⬜ `src/lib/claude.ts` — wraps the Anthropic SDK; auto-includes user's `user_taste_profiles` + last 20 `wear_logs` as context. (M, med)
- ⬜ API key via EAS secrets — never committed; Expo Application Services env var `EXPO_PUBLIC_CLAUDE_PROXY_URL` pointing at a Supabase Edge Function that forwards (keeps the key server-side). (M, med — Edge Function pattern matters because the SDK key cannot ship in the binary)
- ⬜ Model routing: Haiku-class for "Why this?" explanations; Sonnet-class for bottle scan vision. (S, low)

#### Cost Guards — five layers, not one (P0, Mark Z review)
A single per-user daily token budget is insufficient. One bug can spike total bill 1000x. One bot floods one IP. Real guards are layered.

- ⬜ **Per-user daily token budget** enforced in the Edge Function — fallback string returned on cap exceeded. Per-user state in `ai_usage(user_id, day, tokens_in, tokens_out, cost_usd_cents)` table. (M, med)
- ⬜ **Per-IP daily request cap** — separate rate-limit table keyed on hashed IP. Prevents bot floods on a single endpoint. (S, low)
- ⬜ **Account-age throttle** — accounts <24h old get a tighter per-user cap (e.g. 10% of normal) to prevent fresh-signup spam. (S, low)
- ⬜ **Total daily budget** with PagerDuty/email alerts at 50%, 80%, 100% of the configured cap. Edge Function reads `app_settings.ai_daily_budget_usd_cents` and returns fallback when exceeded. (M, med)
- ⬜ **Manual kill switch** — env var `CLAUDE_KILL_SWITCH=1` on the Edge Function returns fallback unconditionally. Founder can flip from Supabase dashboard in 30 seconds. (S, low)
- ⬜ Cost monitoring → PostHog event per call with `tokens_in`, `tokens_out`, `cost_usd_cents`. (S, low)

**Phase A exit:** one canonical AI call works end-to-end from app → Edge Function → Claude → back. **All five cost guards have automated tests:** per-user cap returns fallback at threshold; per-IP cap rejects at threshold; new accounts hit the lower cap; total daily cap triggers alert; kill switch returns fallback when flipped.

---

### Phase B — Recommendation explanations + mood + collaborative filtering

- ⬜ "Why this?" string on every recommendation card — generated server-side by the Edge Function with the user's taste profile + the candidate fragrance + a deterministic fallback for cache miss / budget exceeded. (M, med)
- ⬜ Mood tagging on `LogWearSheet` (optional select: happy / relaxed / confident / romantic / focused). New nullable column `wear_logs.mood`. (S, low)
- ⬜ Collaborative filtering RPC `get_collab_recs(target_user uuid, limit int)` — naive: top N fragrances loved by users whose `user_taste_profiles.preferred_accords` overlap with target. (M, med)
- ⬜ Surface CF results in Discover "Recommended for you" rail when user has ≥20 wear logs; rules-based result otherwise. (S, low)
- ⬜ Upgrade the M2 weather-aware morning pick to call the Claude prompt once user has ≥20 wears. (S, low)

**Phase B exit:** sign in as a seasoned account (≥20 wear logs), open the home screen, see real Claude-generated "Why this?" reasoning on at least one card. Sign in as a brand-new account, see the rules-based fallback render correctly.

---

### Phase C — Bottle scan

- ⬜ Camera UI using `expo-camera` with capture button. (S, low)
- ⬜ Image → Edge Function → Claude vision API → returns top match + confidence score. (L, high — model quality bar is unclear; Scentra exists and reviewers complain it doesn't identify well)
- ⬜ Confidence threshold (e.g. 0.8) — below threshold, refuse and ask user to add manually. (S, low)
- ⬜ Manual confirm step before adding to wardrobe. (S, low)
- ⬜ Only attempt scans against active catalog; cap monthly per-user scan count for free tier. (S, low)

**Phase C exit:** in good lighting, a seeded fragrance bottle scans to the correct match with ≥80% confidence in 5/10 trials. Low-confidence matches are refused, not guessed.

---

## Content Population (post-M2, runs in parallel with M3)

**Not a milestone — a workstream.** Begins after M2 closes. Tracked here so it's not lost. Tag each item "Content (post-M2)".

### Per-field source priority table (decided 2026-05-14)

App reads from Supabase only; ETL is the only thing that talks to upstream sources.

| Field | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Bottle images | Affiliate feed (CJ FragranceX, Rakuten Sephora, Amazon Associates) | Fragella API | User-uploaded |
| Price + retailer URL | Affiliate feed | — | — |
| Purchase link (our affiliate tag) | Affiliate feed (we inject tags) | — | — |
| Notes pyramid (top/middle/base) | Fragella API | Scraped niche-house data (`scripts/data/frag-*-raw.json`) | Hide in UI ("notes coming soon") |
| Main accords + weights | Fragella API | Scraped data | Hide in UI |
| Longevity / sillage | Fragella API | Scraped data | Community-aggregated (post-launch) |
| Perfumer | Fragella API | Scraped data | — |
| Release year | Affiliate or Fragella, whichever populated | — | Ingest-date as proxy |
| Brand alias normalization | Manual mapping table | — | — |

**ETL guard:** if BOTH affiliate and Fragella return empty for a fragrance, skip it. Never ship half-data entries.

### Affiliate approvals

- ⬜ Content (post-M2): apply to **CJ Affiliate for FragranceX** (1–10% commission, 45-day cookie, daily product feed). Requires the marketing site at `perfumepicks.app` to be live with several articles. (L, med)
- ⬜ Content (post-M2): apply to **Rakuten Advertising for Sephora** (5–10% luxury, 24-hour cookie). (L, med)
- ⬜ Content (post-M2): apply to **Amazon Associates Luxury Beauty** (10%, 24-hour cookie — "Buy from" CTA only, NOT image source per Operating Agreement). (M, med)
- ⬜ Content (post-M2): subscribe to **Fragella Basic ($12/mo)** when ETL is ready to call them. Commercial image rights + Supabase CDN mirroring already confirmed in writing. (S, low — do NOT pay before integration ready)

### ETL pipeline

- ⬜ Content (post-M2): `scripts/etl/run-catalog-ingest.ts` — orchestrates the merge:
  1. Pull from CJ FragranceX feed → `staging_affiliate` (image URL, price, retailer URL, our affiliate tag)
  2. Pull from Fragella API per fragrance name → `staging_fragella` (notes, accords, longevity, sillage, perfumer)
  3. Merge `staging_affiliate` + `staging_fragella` + niche-house scrapes into final `fragrances` + `brands`, applying the source-priority table
  4. Mirror images from affiliate / Fragella CDNs → Supabase Storage CDN (caches forever while either subscription active)
  5. Apply brand alias map (`Gianni Versace` → `Versace`, etc.) (L, high — most complex single piece in the project)
- ⬜ Content (post-M2): schedule the pipeline weekly via cron (delta only, not full re-ingest). (M, med)
- ⬜ Content (post-M2): grow catalog from 50 → **≥2,500 launch / 5K stretch**. Verify search quality holds at scale. (L, med)
- ⬜ Content (post-M2): real product images mirrored to Supabase Storage (replace placeholder URLs). (L, med)
- ⬜ Content (post-M2): backfill `fragrance_retailer_links` rows with real affiliate-tagged URLs once CJ + Rakuten + Amazon approvals land. (M, low)
- ⬜ Content (post-M2): brand alias map population. (M, low)
- ⬜ Content (post-M2): 3–5 fragrance articles for the marketing site (CJ Affiliate approval requirement). (L, med)
- ⬜ Content (post-M2): 7 app screenshots for `web/public/assets/screenshots/`. (M, low)
- ⬜ Content (post-M2): user-upload photo capability with explicit ownership/originality terms (Parfumo model). Award contributor badges. (L, med)

### Forbidden

- 🛑 **Never scrape Fragrantica.** Active DMCA program; brand C&D risk for raw bottle photos.

### Niche-house data

~50 raw scrapes already collected by another agent under `scripts/data/frag-*-raw.json` (Arquiste, Bruno Fazzolari, Imaginary Authors, Jorum Studio, Tom Ford, Xerjoff, Memo Paris, Carner Barcelona, etc.). Use these as the third source for niche houses where neither affiliate feeds nor Fragella have good coverage.

---

## Summary

| Milestone | Theme | Closes |
|---|---|---|
| **1 — FOUNDATION** | Real auth, sync engine, catalog read, Pro gate | Plumbing under the user's own data |
| **2 — WIRING** | Stub UI + real queries + RLS for every F1–F10 surface | Every screen the v1 launch will have, wired end-to-end, empty states tidy |
| **3 — AI WAVE** | Claude API, "Why this?", mood, collab filtering, bottle scan | F9 + competitive moat |
| **Content Population (post-M2)** | ETL, ≥2,500 catalog, affiliate approvals, real images, marketing copy | Catalog volume + revenue plumbing + marketing site content |

M1 + M2 = the chassis. M3 = the engine. Content Population = the paint and bodywork.

---

## Not building (from 2026-05-13 research)

- 🛑 **Decant marketplace** — Scentbird's lane; affiliate-link instead.
- 🛑 **Direct-sale subscription** — operational complexity is enormous for a software-only team.
- 🛑 **Brand-partner integrations** — Sommelier du Parfum's lane; defer until post-PMF.
- 🛑 **Scraping Fragrantica** — they enforce DMCA.
- 🛑 **Full interactive relationship-map / network graph** — M3 backlog at earliest; ship the detail-page "similar in your wardrobe" version in M2 instead.
- 🛑 **Photo moderation pipeline + comments on SOTD posts** — post-M3; SOTD ships with reactions only in M2.
