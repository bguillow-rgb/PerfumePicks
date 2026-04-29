# SOTD Feature — Implementation Plan

**Document type:** Engineering implementation plan
**Created:** 2026-04-26
**Inputs:** SOTD-Research-Summary.md, SOTD-Code-Scope.md, existing codebase audit
**Status:** Ready for sprint planning

---

## 1. Codebase Audit — What Already Exists

Before planning any new work, here is what the app already has that is directly relevant to SOTD.

### Already built

| Area | What exists |
|---|---|
| **Wear logging** | `wear_logs` table (Supabase schema, `001_initial_schema.sql:153`); `useWearLogStore` (Zustand + AsyncStorage, local-only) |
| **Log sheet** | `src/components/sheets/LogWearSheet.tsx` — sheet for logging a wear with occasion, weather, rating |
| **Wardrobe** | `wardrobe_items` table + `useWardrobeStore`; `AddToWardrobeSheet`; `app/(tabs)/wardrobe.tsx` |
| **Fragrance detail** | `app/fragrance/[id].tsx` — detail page exists, spray/log entry point will go here |
| **Discover tab** | `app/(tabs)/discover.tsx` — the tab exists; currently empty or placeholder |
| **Taste profile** | `user_taste_profiles` table + `src/features/recommend/tasteProfile.ts` — note/accord weights already materialized |
| **Recommendations** | `src/features/recommend/score.ts`, `useRecommendations.ts` |
| **Auth** | `app/auth/login.tsx`, Supabase `auth.users` |
| **Paywall** | `app/paywall.tsx`, RevenueCat (`useRevenueCat.ts`, `revenuecat.ts`) |
| **Swipe/Train** | `app/(tabs)/train.tsx`, `swipe_feedback` table |
| **Component library** | `Button`, `Card`, `Badge`, `EmptyState`, `StarRating`, `ScreenWrapper`, etc. in `src/components/ui/` |
| **Fragrance components** | `FragranceCard`, `AccordChip`, `NotePyramid`, `PerfBar`, `MlMeter` |

### What does NOT exist yet

- Social layer: no `follows`, `reactions`, or activity-feed tables
- Photo uploads: no storage bucket, no upload pipeline
- SOTD public visibility: `wear_logs` has no `is_public` flag or photo field
- Supabase sync for wear logs: `useWearLogStore` writes to AsyncStorage only — **not synced to Supabase yet**
- Streak tracking: no `current_streak` or `last_sotd_date` on user profile
- Community feed UI: `discover.tsx` exists but has no feed implementation

---

## 2. Critical Conflict: Scope Doc vs. Existing Schema

The `SOTD-Code-Scope.md` proposes a **new `sotd_entries` table** with a `UNIQUE(user_id, logged_date)` constraint (one entry per day). This conflicts with the existing codebase in two important ways:

**Conflict 1 — `wear_logs` already does this job.**
The existing `wear_logs` table (`001_initial_schema.sql:153`) covers every field the scope doc's `sotd_entries` proposes — and more (it adds `performance_longevity`, `performance_sillage`, `performance_projection`, `would_wear_again`, `season`, `weather`). Building a parallel table would create two divergent data stores for the same user action.

**Conflict 2 — One-per-day constraint breaks multi-scent requirements.**
The scope doc's `UNIQUE(user_id, logged_date)` would allow only one fragrance per day. The requirements spec (F2) explicitly supports multiple fragrances per day for layering and day-to-evening switches. The existing `wear_logs` schema correctly has no such constraint.

**Resolution: extend `wear_logs`, do not create `sotd_entries`.**
Add the missing social columns (`is_public`, `photo_url`, `reaction_count`) to `wear_logs` via a new migration. The SOTD social feed is just the public view of `wear_logs` entries.

---

## 3. Revised Data Model

### 3.1 Migration: extend `wear_logs` for social (new migration `003_sotd_social.sql`)

```sql
-- Extend wear_logs with social + photo fields
ALTER TABLE wear_logs
  ADD COLUMN IF NOT EXISTS is_public        boolean not null default false,
  ADD COLUMN IF NOT EXISTS photo_url        text,
  ADD COLUMN IF NOT EXISTS photo_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reaction_count   int not null default 0,
  ADD COLUMN IF NOT EXISTS comment_count    int not null default 0;  -- Phase 2

-- Index for community feed queries (public entries, newest first)
CREATE INDEX IF NOT EXISTS wear_logs_public_date_idx
  ON wear_logs (worn_on DESC)
  WHERE is_public = true;

-- Index for "what is being worn today" feed
CREATE INDEX IF NOT EXISTS wear_logs_public_today_idx
  ON wear_logs (worn_on DESC, created_at DESC)
  WHERE is_public = true;
```

### 3.2 New table: `follows`

```sql
CREATE TABLE IF NOT EXISTS follows (
  id          uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  UNIQUE(follower_id, followee_id),
  CONSTRAINT no_self_follow CHECK (follower_id != followee_id)
);

CREATE INDEX follows_follower_idx ON follows (follower_id);
CREATE INDEX follows_followee_idx ON follows (followee_id);
```

### 3.3 New table: `wear_log_reactions`

```sql
CREATE TABLE IF NOT EXISTS wear_log_reactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  wear_log_id  uuid not null references wear_logs(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('heart','fire','want_to_try','interesting')),
  created_at   timestamptz not null default now(),
  UNIQUE(user_id, wear_log_id, reaction_type)
);

CREATE INDEX wear_log_reactions_log_idx  ON wear_log_reactions (wear_log_id);
CREATE INDEX wear_log_reactions_user_idx ON wear_log_reactions (user_id);
```

### 3.4 Extend `auth.users` metadata (via Supabase profiles table or user_metadata)

Add denormalized streak fields. The scope doc puts these on `users`; in Supabase the right pattern is a `profiles` table (if one doesn't exist) or extending it:

```sql
-- If a profiles table doesn't already exist:
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  bio             text,
  avatar_url      text,
  current_streak  int not null default 0,
  last_sotd_date  date,
  total_sotd_count int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

> **Check first:** if `profiles` already exists (check `002_rls_policies.sql` and the app's profile store), add columns via `ALTER TABLE` rather than creating fresh.

---

## 4. Tech Stack Notes (Scope Doc vs. Actual Stack)

The scope doc assumes a custom Node.js REST API. The actual stack is **Supabase + React Native/Expo**. This changes the implementation approach for several areas:

| Scope doc assumes | Actual approach |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Supabase Auth — already handled |
| Custom REST endpoints (`POST /sotd/log`, etc.) | Supabase PostgREST (auto-generated) + Edge Functions for complex logic |
| Redis for activity stream cache | Supabase Realtime (Postgres changes) for live feed; no Redis needed for MVP |
| Bull job queue for notifications | Supabase Edge Functions + pg_cron or external push service (Expo Notifications) |
| S3 + CloudFront for photos | Supabase Storage (S3-backed, built-in CDN) |
| Custom JWT auth middleware | Supabase JWT — RLS policies handle authorization |

The scope doc's API surface is still a useful reference for what queries are needed, but they should be implemented as PostgREST queries + Supabase client calls, not custom REST endpoints.

---

## 5. Phased Implementation Plan

### Phase 1 — MVP (estimated 6–8 weeks)

**Goal:** Core SOTD logging with optional public sharing, personal history, and a basic community feed. No photos, no follow graph yet.

---

#### Sprint 1: Supabase Sync for Wear Logs (prerequisite for everything else)

`useWearLogStore` currently writes to AsyncStorage only. All social features depend on wear logs being in Supabase.

- [ ] **Migration `003_sotd_social.sql`** — add `is_public`, `photo_url`, `photo_uploaded_at`, `reaction_count` to `wear_logs`; create `follows` and `wear_log_reactions` tables; create/extend `profiles` table with streak fields
- [ ] **Update RLS** (`002_rls_policies.sql` or new `004_sotd_rls.sql`):
  - `wear_logs`: owner can read/write all rows; anyone can read rows where `is_public = true`
  - `follows`: authenticated users can insert/delete their own rows; anyone can read
  - `wear_log_reactions`: authenticated users can insert/delete their own rows; anyone can read aggregates
- [ ] **Migrate `useWearLogStore`** from AsyncStorage-only to Supabase-backed:
  - On `add`: write to Supabase `wear_logs`, fall back to AsyncStorage if offline
  - On app load: fetch user's wear logs from Supabase, merge with local
  - Reconcile any existing local-only logs on first sync (upload on reconnect)
- [ ] **Update `LogWearSheet`**: add `is_public` toggle ("Share with community") — off by default

**Files affected:** `src/stores/useWearLogStore.ts`, `src/components/sheets/LogWearSheet.tsx`, `supabase/migrations/003_sotd_social.sql`, `supabase/migrations/004_sotd_rls.sql`

---

#### Sprint 2: SOTD Logging UX + Personal History

- [ ] **Spray bottle icon on wardrobe cards** (`app/(tabs)/wardrobe.tsx`, `src/components/fragrance/FragranceCard.tsx`): one-tap opens `LogWearSheet` pre-filled with that fragrance; confirm toast with undo
- [ ] **Multi-fragrance day support**: `LogWearSheet` should allow logging additional fragrances for the same date (no unique constraint — the schema already supports this). When viewing history for a date, group entries by `worn_on` to show all fragrances worn that day together.
- [ ] **Backdating**: add date picker to `LogWearSheet` (defaults to today, picker goes up to 2 years back)
- [ ] **Wear count + last worn** on fragrance cards and detail page (`app/fragrance/[id].tsx`): derive from `useWearLogStore.countByFragrance()`
- [ ] **History / Calendar view**: new screen or section in Profile tab:
  - Month grid: each day with a log shows fragrance thumbnail(s)
  - Tap day → detail modal showing all entries for that date
  - "Timeline" toggle for chronological list view
- [ ] **Streak calculation**: compute `current_streak` from `wear_logs.worn_on`; show on Today/home screen; update `profiles.current_streak` + `profiles.last_sotd_date` on each log

**New files:** `app/(tabs)/history.tsx` (or section within Profile), calendar grid component
**Files affected:** `app/(tabs)/wardrobe.tsx`, `app/fragrance/[id].tsx`, `src/components/sheets/LogWearSheet.tsx`, `src/components/fragrance/FragranceCard.tsx`, `src/stores/useWearLogStore.ts`

---

#### Sprint 3: Community Feed (Discover Tab)

- [ ] **Implement `app/(tabs)/discover.tsx`** with:
  - "Today" tab: public `wear_logs` entries for today, ordered by `created_at DESC`
  - "Following" tab: same but filtered to `follows.followee_id` (requires follow graph — see Sprint 4; ship "Following" tab as empty state with "Find people to follow" CTA for now)
  - "Trending" section: top 5 `fragrance_id` values by count in public wear logs for today
- [ ] **`WearLogFeedCard` component** (`src/components/sotd/WearLogFeedCard.tsx`):
  - User avatar + username
  - Fragrance name + brand (tap → fragrance detail)
  - Occasion + weather badges (`ContextBadges` can be reused)
  - Notes (truncated, tap to expand)
  - Reaction bar (heart, fire, want_to_try, interesting) with counts
  - Multi-fragrance day: if multiple entries for same user+date, group as a single "day card" showing all fragrances as chips
  - Time posted
- [ ] **Reactions**: `POST wear_log_reactions`, toggle behavior (re-tap removes reaction); optimistic UI update
- [ ] **"Want to try" reaction** → one-tap adds fragrance to `wardrobe_items` with `status='want'`; toast confirmation
- [ ] **Infinite scroll** with `useInfiniteQuery` (TanStack Query)

**New files:** `src/components/sotd/WearLogFeedCard.tsx`, `src/hooks/useSOTDFeed.ts`
**Files affected:** `app/(tabs)/discover.tsx`

---

#### Sprint 4: Follow Graph + Profiles

- [ ] **Follow/unfollow**: `follows` table write; button on user profile screen
- [ ] **User profile screen** (`app/user/[id].tsx` — new): public wear log history, follower/following counts, collection size, taste profile summary
- [ ] **"Following" feed** in Discover tab: now functional
- [ ] **Follow suggestions**: "People with similar taste" based on `user_taste_profiles` overlap (simple Jaccard similarity on `preferred_accords` JSONB keys)

**New files:** `app/user/[id].tsx`

---

#### Sprint 5: Analytics + Streak Gamification

- [ ] **Analytics screen** (within Profile tab or as a new tab section):
  - Total wears logged
  - Most-worn fragrances (top 5, with wear count)
  - Collection utilization rate (distinct fragrances worn / `wardrobe_items` where `status='have'`)
  - Current streak + best streak
- [ ] **Streak milestones**: badge awards at 7, 30, 100, 365-day streaks; in-app toast/modal on milestone hit
- [ ] **Daily notification** (opt-in): Expo Push Notifications; sent at user-configured time if no log yet today; deep-link to Today tab

**New files:** `app/(tabs)/analytics.tsx` or section within Profile, `src/hooks/useStreakBadges.ts`

---

### Phase 2 (post-MVP, estimated 4–6 weeks)

- [ ] **Photo uploads**: Supabase Storage bucket (`sotd-photos`); client-side resize to 1200×1200 / 70% JPEG before upload; CDN URL stored in `wear_logs.photo_url`; basic server-side validation (size, mime type, dimensions)
- [ ] **Photo moderation**: AWS Rekognition or Google Vision API integration; `photo_flags` table; manual review queue in admin panel
- [ ] **Share cards**: generate a branded card image (fragrance name, house, user, date) exportable to iOS/Android share sheet; use `react-native-view-shot` or server-side image generation
- [ ] **Advanced analytics**: seasonal heatmaps, month-by-month wear frequency chart, cost-per-wear (derive from `wardrobe_items.purchase_price_cents` / wear count)
- [ ] **Comments**: `wear_log_comments` table; threaded comments on feed cards; moderation
- [ ] **Scent twins**: Jaccard similarity on wear history (fragrance-level overlap); surface in Discover tab as "Your Scent Twins"
- [ ] **Community challenges**: monthly themed prompts ("Citrus Week," "Blind-buy Friday")
- [ ] **Trending leaderboards**: non-competitive (most adventurous, most consistent logger)

---

### Phase 3 (roadmap)

- [ ] **Perfume Wrapped** (F10): annual year-in-review; requires a full calendar year of wear log data; Supabase Edge Function to compute stats; swipeable card UI
- [ ] **AI-powered recommendations** (F9): integrate with Claude API; feed `user_taste_profiles` + recent wear history as context; "Why this?" transparency UI
- [ ] **Offline-first**: full offline logging with background sync on reconnect
- [ ] **Export/import**: CSV/JSON export of full wear history

---

## 6. Key Decisions Required Before Sprint 1 Starts

These must be resolved before writing code. Raise in the next planning session.

### Product

1. **`is_public` default**: should new wear log entries default to public or private? Private-by-default is safer for trust but hurts feed density early on. Consider: public-by-default with a prominent opt-out, or prompt the user on first log.

2. **Multi-fragrance feed card grouping**: when a user logs 3 fragrances on the same day, does the community feed show 3 separate cards or 1 grouped day-card? Grouped is cleaner but harder to react to individually. Recommendation: grouped card with individual fragrance chips, reactions attach to the day-card.

3. **Occasion/mood taxonomy**: `wear_logs.occasion` and `wear_logs.mood` are currently free-text in the store but have an enum check in `LogWearSheet`. Confirm the canonical list before adding new entries — the existing values (`office`, `date`, `casual`, `evening`, `formal`, `workout`, `travel`) may need additions for SOTD context (e.g., `gym` and `travel` already exist; consider `special_occasion`).

4. **SOTD vs. Wear Log naming**: internally these are the same table (`wear_logs`). Decide on the user-facing terminology: "Log a Wear" vs. "Post SOTD" vs. "Log Scent." Consistency matters for marketing and onboarding copy.

### Engineering

5. **Profiles table**: verify whether a `profiles` table already exists (not visible in the provided migrations — check if auth.users metadata or a profiles table is being used by `useProfileStore.ts`). This determines whether Sprint 1 needs `CREATE TABLE profiles` or `ALTER TABLE profiles`.

6. **Supabase Realtime for feed**: decide whether to use Supabase Realtime (Postgres change subscriptions) for live feed updates, or simple polling. Realtime is more complex to set up but gives a better feed experience. Recommendation: polling (30s interval) for MVP, Realtime for Phase 2.

7. **Photo storage bucket naming and public access policy**: Supabase Storage buckets can be public or private. For SOTD photos, public CDN URLs are required. Confirm bucket name and RLS policy before Sprint 2 photo work.

8. **Streak computation strategy**: compute streak on every `wear_logs` insert via a Postgres trigger (accurate, event-driven) or compute on-demand in the client (simpler, slightly stale). Recommendation: Postgres trigger for accuracy; client caches the result.

---

## 7. File Map Summary

```
New migrations:
  supabase/migrations/003_sotd_social.sql    ← extend wear_logs, new follows + reactions tables
  supabase/migrations/004_sotd_rls.sql       ← RLS for new tables + updated wear_logs policies

New screens:
  app/(tabs)/history.tsx                     ← calendar + timeline view of personal wear history
  app/user/[id].tsx                          ← public user profile

New components:
  src/components/sotd/WearLogFeedCard.tsx    ← feed card for community entries
  src/components/sotd/CalendarGrid.tsx       ← month calendar with fragrance thumbnails

New hooks:
  src/hooks/useSOTDFeed.ts                   ← community feed query (infinite scroll)
  src/hooks/useStreak.ts                     ← streak computation + milestone detection

Modified files:
  src/stores/useWearLogStore.ts              ← add Supabase sync, is_public field
  src/components/sheets/LogWearSheet.tsx     ← add is_public toggle, date picker, multi-fragrance
  src/components/fragrance/FragranceCard.tsx ← add spray icon, wear count badge
  app/fragrance/[id].tsx                     ← add wear count, last worn, spray button
  app/(tabs)/discover.tsx                    ← implement community feed
  app/(tabs)/wardrobe.tsx                    ← spray icons on each card
```

---

*Plan authored 2026-04-26. Review with engineering before Sprint 1 kickoff.*
