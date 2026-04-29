# PerfumePicks — Milestone Plan

**Goal:** Ship a complete, production-ready v1 equivalent to StickPicks 13 — fully synced to Supabase, real catalog, all core loops working — then layer in the fragrance-specific differentiators that StickPicks never had.

**Current state:** Local-only (AsyncStorage). Mock catalog (10 entries). Core UI shells exist. No Supabase sync. No auth enforcement.

---

## What "StickPicks 13" parity means

StickPicks shipped fully working:
- Real backend sync (not AsyncStorage)
- Enforced auth (every screen requires a user)
- Real catalog (not mock data)
- Collection management with full CRUD
- Swipe/feedback engine feeding real recommendations
- Quiz → taste profile → personalized home screen
- Pro paywall with RevenueCat enforcement
- Settings, account deletion, legal screens

PerfumePicks needs all of that **plus** the fragrance-specific features StickPicks never had (wear tracking, SOTD feed, taste profile analytics screen, daily wardrobe carousel).

---

## Milestone 1 — Backend Foundation
**"Everything writes to Supabase. Auth is real."**

Nothing user-facing changes visually. This is plumbing that every subsequent milestone depends on.

### Auth
- [ ] Enforce auth gate on app load — redirect to `auth/login` if no session
- [ ] Complete `auth/login.tsx`: email/password + Apple Sign In + Google Sign In working end-to-end
- [ ] Auto-create `profiles` row on first sign-in (Supabase auth trigger or client-side upsert)
- [ ] Sign out clears session and returns to login
- [ ] Deep-link handling post-OAuth redirect

### Supabase Sync — Wardrobe
- [ ] On auth: fetch `wardrobe_items` for current user, merge into `useWardrobeStore`
- [ ] `add()`: write to Supabase, fall back to local on failure
- [ ] `update()`: patch Supabase row
- [ ] `remove()`: delete Supabase row (soft-delete via `sold_on` status or hard delete)
- [ ] Replace `SAMPLE_WARDROBE_IDS` seed with real user data on first load

### Supabase Sync — Wear Logs
- [ ] On auth: fetch `wear_logs` for current user, hydrate `useWearLogStore`
- [ ] `add()`: write to Supabase; streak trigger fires server-side (migration 003)
- [ ] `remove()`: delete from Supabase
- [ ] Offline queue: if no network on `add()`, queue locally and sync on reconnect

### Supabase Sync — Swipe Feedback
- [ ] On each swipe in Train: upsert `swipe_feedback` row
- [ ] On auth: fetch existing swipes to restore `useSwipeStore`

### Supabase Sync — Taste Profile
- [ ] After each swipe or wear log: recompute `deriveTasteProfile()` and upsert `user_taste_profiles`
- [ ] On auth: fetch stored taste profile to seed local profile immediately (skip cold-start wait)

### Real Catalog
- [ ] Replace `MOCK_CATALOG` / `getFragrance()` / `getFragrances()` with Supabase queries
- [ ] Seed production `fragrances` + `brands` tables (minimum 200 fragrances to launch)
- [ ] `useFragrance(id)` hook — fetches from Supabase, caches with React Query
- [ ] `useFragranceSearch(query)` hook — uses `fragrances_name_trgm_idx` (pg_trgm)
- [ ] Fragrance images served from Supabase Storage or CDN

---

## Milestone 2 — Core Loops Complete
**"Every feature a user touches daily works end-to-end."**

### Wear Tracking (completes F1)
- [ ] Spray bottle icon on every wardrobe card — one-tap opens `LogWearSheet` pre-filled with that fragrance
- [ ] Wear count badge on wardrobe cards ("Worn 14×")
- [ ] "Last worn" label on fragrance detail page
- [ ] Backdating: date picker in `LogWearSheet` (defaults today, up to 2 years back)
- [ ] Edit / delete individual wear log entries
- [ ] Wear history list on fragrance detail page (chronological, newest first)

### Private Notes (completes F6)
- [ ] Notes text field on fragrance detail page (private, per-user)
- [ ] Reads/writes `wardrobe_items.notes` — already in schema
- [ ] Searchable from wardrobe screen (filter by note keyword)

### Train My Nose — Complete
- [ ] Swipes actually pull from real Supabase catalog (not 10 mock entries)
- [ ] Session summary shows correct counts from `swipe_feedback` table
- [ ] "You've seen everything" empty state with option to reset dislikes

### Wardrobe — Complete
- [ ] Add fragrance flow: search → detail → "Add to Wardrobe" → pick status/size
- [ ] Edit wardrobe item: change status, update remaining mL, add purchase price
- [ ] Remove item with confirmation
- [ ] Running-low indicator (< 20% remaining mL)
- [ ] Purchase price entry (feeds cost-per-wear in Milestone 4)

### Quiz — Complete
- [ ] Quiz results write to `quiz_results` table
- [ ] Quiz re-run option in Profile settings
- [ ] Quiz signals feed `user_taste_profiles` (currently wired to mock only)

### Home Screen — Complete
- [ ] "FROM YOUR WARDROBE" carousel (✅ built) — now powered by real wardrobe + real catalog
- [ ] Recommendations pull from real catalog via Supabase
- [ ] "New Arrivals" rail reads from `fragrances.created_at` (not release_year proxy)

### Pro / Paywall — Complete
- [ ] RevenueCat enforcement: gate Pro features (taste profile analytics, advanced recommendations)
- [ ] Restore purchases flow
- [ ] Free tier limits defined and enforced (e.g. wardrobe capped at 20 items)

### Account & Settings — Complete
- [ ] Display name + bio editable in Profile
- [ ] Avatar upload to Supabase Storage
- [ ] Delete account: calls `delete-account` Edge Function (already exists)
- [ ] Privacy policy and Terms screens (✅ exist at `app/legal/`)

---

## Milestone 3 — Fragrance-Specific Features
**"Everything StickPicks never had."**

### Taste Profile Screen (completes F3)
- [ ] "My Taste Profile" screen in Profile tab (Pro feature)
- [ ] Top 10 notes by weight from `user_taste_profiles.liked_notes` — bubble chart or ranked list
- [ ] Top accords + fragrance families breakdown
- [ ] Notes split by pyramid position (top / heart / base)
- [ ] "Explore more like this" → Discover filtered by top notes
- [ ] Shareable taste profile card (image export)

### Season/Occasion Recommendations — Complete (completes F5)
- [ ] "What should I wear?" shortcut on home screen
- [ ] User picks occasion (casual / office / date / formal) + time of day
- [ ] Live weather fetch via location (replace season proxy in `useDailyPicks`)
- [ ] Results show 3–5 owned fragrances with one-line reasons
- [ ] Tap "Wear this today" → logs wear directly from the result

### Collection Note/Accord Analytics (part of F3)
- [ ] Collection utilization rate on Profile ("You've worn 14 of 32 bottles")
- [ ] Most-worn fragrance of the month on Profile
- [ ] Seasonal breakdown chart (spring/summer/fall/winter wear frequency)

### Fragrance Relationship Map (F4)
- [ ] "Similar in your wardrobe" section on fragrance detail — fragrances you own that share top notes/accords with the one you're viewing
- [ ] Full relationship map screen (network graph) — Roadmap; ship the detail-page version now

### SOTD Social Feed (completes F2)
- [ ] `useWearLogStore.add()` includes `is_public` field; `LogWearSheet` has public toggle (private by default)
- [ ] Community feed in Discover tab: public `wear_logs` for today, newest first
- [ ] Feed card: user avatar, fragrance name/brand, occasion badge, notes, reaction bar
- [ ] Multi-fragrance day: group same-user same-date entries into one day card with fragrance chips
- [ ] Reactions: heart / fire / want_to_try / interesting — writes to `wear_log_reactions`
- [ ] "Want to try" reaction → adds to wardrobe as `status='want'`
- [ ] Follow / unfollow users — writes to `follows` table
- [ ] Following feed tab (filtered to followees)
- [ ] User profile pages (`app/user/[id].tsx`)

### Reviews & Ratings (F7)
- [ ] Review + rating form on fragrance detail (overall / longevity / sillage / value)
- [ ] Community review list on fragrance detail — sorted by helpful
- [ ] "Owns this" badge if reviewer has it in wardrobe
- [ ] Helpful / not helpful vote
- [ ] Report review → `content_reports` table (already in schema)

---

## Milestone 4 — Analytics, Retention, Virality
**"The features that make people stay and share."**

### Perfume Wrapped (F10)
- [ ] `GET /analytics/me/year-in-review` Supabase RPC or Edge Function
- [ ] Stats: most worn, top 5, total wears, wear-weighted top notes, seasonal breakdown, cost-per-wear leader, new additions, longest streak, "sleeper pick"
- [ ] Swipeable card sequence UI (story format, one stat per screen)
- [ ] Each card exportable as a branded image
- [ ] Available from December 1; push notification when ready
- [ ] Graceful empty state for < 10 wears

### Cost-Per-Wear
- [ ] Compute on Profile analytics screen: `purchase_price_cents / wear_count` per fragrance
- [ ] Best and worst value bottles highlighted
- [ ] Feeds into Wrapped

### Streak & Badges
- [ ] Streak counter on home screen ("🔥 17 days")
- [ ] Milestone badges: 7 / 30 / 100 / 365 days — in-app toast on unlock
- [ ] Badge display on profile
- [ ] `user_badges` table + badge check after each wear log

### Daily Notification
- [ ] Opt-in push notification at user-configured time: "What are you wearing today?"
- [ ] Deep-links to home screen log prompt
- [ ] Skip if already logged today

### Scent Twins (Phase 2 social)
- [ ] Jaccard similarity on wear history between users
- [ ] "Your Scent Twins" section in Discover tab
- [ ] Drives follow suggestions

### Share Cards
- [ ] SOTD share card: fragrance image + name + house + user handle — exportable to camera roll / share sheet
- [ ] Uses `react-native-view-shot` or server-side image generation

---

## Milestone 5 — AI & Scale
**"The long-term moat."**

### AI Personalization (F9)
- [ ] Mood tagging on wear log entries
- [ ] Morning recommendation push notification with weather-aware pick
- [ ] Claude API integration: feed `user_taste_profiles` + recent wear history as context for recommendations
- [ ] "Why this?" explanation on every recommendation card
- [ ] Collaborative filtering: surface fragrances loved by users with similar taste profiles
- [ ] Cold-start: rules-based until 20+ wear log entries, then AI takes over

### Fragrance Relationship Map — Full (F4)
- [ ] Full interactive network graph (nodes = fragrances, edges = shared notes/accords)
- [ ] "Missing link" suggestions: catalog fragrances that connect strongly to your collection
- [ ] Accessible list-based fallback

### Offline First
- [ ] Wear logs queue locally when offline, sync on reconnect
- [ ] Collection browsable with no network (cached via React Query)

### Export
- [ ] Full wear history export (CSV / JSON)
- [ ] GDPR data deletion confirmation flow

---

## Summary

| Milestone | Theme | Unlocks |
|---|---|---|
| **1** | Backend Foundation | Real data, real auth, real catalog |
| **2** | Core Loops | Daily usable app — wear tracking, wardrobe CRUD, quiz, paywall |
| **3** | Fragrance Features | Everything StickPicks never had — SOTD feed, taste profile, reviews, relationship map |
| **4** | Retention & Virality | Wrapped, streaks, cost-per-wear, share cards |
| **5** | AI & Scale | Claude-powered personalization, offline, full graph |

**Milestones 1 + 2 = StickPicks 13 parity.**
**Milestones 3 + 4 = PerfumePicks v1 launch.**
**Milestone 5 = competitive moat.**
