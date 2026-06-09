# Perfume Picks — Product & Engineering Context

> **Audience:** Claude (AI assistant), QA engineers, future contributors.
> **Purpose:** Single source of truth for product intent, feature gates, QA setup, business logic, and known issues. Code alone cannot answer these questions.
> **Last updated:** 2026-06-07. Keep this doc current when product decisions change.

---

## 1. What the App Is and Does

Perfume Picks is an iOS app (React Native / Expo, App Store live) for fragrance enthusiasts — primarily women. It helps users discover perfumes they'll love, track what they own, and understand their own scent preferences over time.

### Five Core Jobs the App Does

| Job | Screen | How it works |
|---|---|---|
| **Discover fragrances** | Discover tab | Browse by brand, filter by accord/gender, search catalog |
| **Train taste profile** | Taste tab (Train My Nose) | Tinder-style swipe deck — love/like/pass builds preference model |
| **Track your wardrobe** | Wardrobe tab | Catalog of bottles/decants/samples the user has, wants, or has tried |
| **Get daily picks** | Today tab | Personalized rails — SOTD from community, New Arrivals, recommendations |
| **Scan & identify bottles** | Scan FAB (bottom right) | Camera → Claude Vision API identifies fragrance → add to wardrobe |

### Intended User Flow (first launch)

1. App opens → handwritten splash → Home tab
2. User sees "Wearing Today" (community SOTD feed) + editorial rails
3. Taps **Taste tab** → Train My Nose intro → swipes 5–10 cards
4. Returns to Home → rails sharpen based on swipe signals
5. Taps a fragrance → Detail page (notes, performance, pricing, buy links)
6. Adds to Wardrobe via sheet
7. Over time: quiz deepens profile, scan adds unknown bottles, wardrobe grows
8. Pro upgrade unlocks unlimited swipes, full taste profile, unlimited wardrobe

---

## 2. Free vs Pro Feature Gates

### Free Tier
- 10 swipes/day in Train My Nose (`FREE_DAILY_SWIPE_LIMIT = 10`)
- 10 Perfume Concierge (scan) uses/day (`FREE_DAILY_SCAN_LIMIT = 10`)
- 20 wardrobe items (`FREE_WARDROBE_CAP = 20`)
- 5-question taste quiz
- Basic home recommendations
- Browse Discover, view fragrance details, log wears

### Pro Tier ($2.99/mo · $24.99/yr · 7-day free trial)
- Unlimited daily swipes
- Unlimited scans
- Unlimited wardrobe items
- Full 10-question quiz
- Full taste profile breakdown (`/taste-profile` route)
- Layering suggestions on fragrance detail
- Dupe finder on fragrance detail

### How Pro Is Enforced
- **Client-side:** Zustand `useProStore` (`isPro` boolean, persisted via AsyncStorage)
- **Server-side:** Postgres RLS via `is_pro_user(uid)` on Supabase — actual enforcement
- **Source of truth:** RevenueCat customer info, synced on sign-in via `useAppSync`
- **Comped accounts:** `comped_users` table; `is_current_user_comped()` RPC activates Pro silently on login
- **Important:** `deactivate()` is called on sign-out, so Pro status does not leak to subsequent guest sessions

### RevenueCat Setup
- Project: `d4fefeca` at app.revenuecat.com
- Apple key: `appl_KhgCHPkwhZTbsPrSqpzHsSkDUPX` (in `eas.json`)
- Products: `perfumepicks_pro_monthly`, `perfumepicks_pro_yearly`
- Entitlement: `pro`
- Offering: `default` (must have both packages attached)

---

## 3. App Store / Business Intent

### What Apple Should See
- Fragrance discovery, wardrobe tracking, taste training
- Camera permission: scan bottle labels to identify fragrances
- Photo library permission: wardrobe/profile photos
- In-App Purchase: Pro subscription (auto-renewing, 7-day trial)

### Affiliate Revenue
- CJ Affiliate publisher ID: `7966973`
- Retailers: Perfumania (ID `17277211`, working), FragranceShop (ID `16941446`, CF blocks `cjevent` param — stripped)
- Affiliate links surface on fragrance detail pages under "Where to Buy"
- Logic in `src/lib/affiliate.ts` — opens retailer URL and fires tracking event
- **Known issue:** FragranceShop's Cloudflare blocks the CJ tracking parameter. Perfumania links work correctly.

### Paywall Strategy
- Paywall appears at: swipe limit, wardrobe cap, scan limit, pro-gated feature taps, Profile "Upgrade to Pro" button
- Paywall always shows pricing UI with hardcoded fallbacks ($2.99/$24.99) even if RevenueCat fails to load
- On purchase tap: silently retries RevenueCat if it errored on load
- Guests (anonymous auth) can purchase — no sign-in gate on purchase per Apple §5.1.1(v)

---

## 4. Technical Stack

| Layer | Tech |
|---|---|
| Framework | React Native + Expo SDK 52, Expo Router (file-based nav) |
| OTA Updates | EAS Update, channel `production`, runtime version `1.0.0` |
| Native builds | EAS Build, App Store build profile |
| Backend | Supabase (Postgres + Auth + Edge Functions + Storage) |
| Auth | Supabase Auth — Apple Sign-In, Google Sign-In, anonymous guest |
| State | Zustand + AsyncStorage persist middleware |
| Catalog | Supabase `fragrances` + `brands` tables, ETL from CJ/Perfumania feed |
| AI | Claude API (Vision) for bottle scan identification |
| Purchases | RevenueCat (`react-native-purchases`) |
| Analytics | PostHog (configured but key is placeholder in current build) |

### Key Constants
- Bundle ID: `com.bobguillow.perfumepicks`
- Apple Team ID: `ZNS5TNLB2D`
- App Store app ID: `6774184221`
- Supabase project ref: `jdkwlwyysgofljkobpmr`
- EAS project ID: `45707459-d6b8-4aa8-8ddf-5a5894dde578`
- EAS account: `bg233`

---

## 5. QA Setup & Directives

### Which Build to Test

**Default target: TestFlight build (production OTA channel).**

This is the real user build. OTA updates ship to TestFlight via `npx eas update --channel production`. The TestFlight build always has the latest OTA applied after a cold restart. Test against this unless you have a specific reason to test the simulator.

Use the iOS Simulator (production bundle install) only when:
- TestFlight is unavailable
- You need automated Maestro flows (Maestro cannot control a physical device easily)
- You are testing layout/visual issues at specific screen sizes

Never use Expo Go (`host.exp.Exponent`) for QA on features that touch native modules: RevenueCat, Google Sign-In, camera, push notifications.

### App Launch Commands (Simulator)

```bash
# Boot simulator
xcrun simctl boot "iPhone 16 Pro"
open -a Simulator

# Install production build (if you have the .app artifact)
xcrun simctl install booted path/to/PerfumePicks.app

# Launch
xcrun simctl launch booted com.bobguillow.perfumepicks

# Or launch via Expo dev server (Expo Go only)
npx expo start --ios
```

### Maestro

```bash
# Install
brew install maestro

# Run a single flow (production bundle)
maestro --platform=ios test tests/maestro/generated/001-home-screen-loads.yaml

# Run the full P0 suite
maestro --platform=ios test tests/maestro/generated/e2e-p0-critical-paths.yaml
```

**appId for production bundle flows:** `com.bobguillow.perfumepicks`
**appId for Expo Go dev flows:** `host.exp.Exponent`

Flows live in: `tests/maestro/generated/`
Reports land in: `tests/maestro/reports/`
Artifacts (screenshots): `tests/maestro/artifacts/<run-id>/`

### Maestro Flow Permanence

**Save all generated Maestro flows permanently to `tests/maestro/generated/`.** They become the regression suite. Do not use temp files. Name them with a numbered prefix (`001-`, `002-`) so they run in a predictable order.

### Test Credentials
- Main test account: `bobguillow@icloud.com` (Pro via comp — use to verify Pro features)
- Guest session: tap "Continue as Guest" on login screen (anonymous Supabase auth — use to verify free-tier limits and paywall gates)
- Sign-out clears Pro status; the next session starts as a true free guest

### Claude QA Skill
Invoke with: `/qa-tester <inline instructions or path to plan>`

The skill generates Maestro YAML, boots a simulator if needed, runs flows, visually reviews screenshots, and returns a markdown QA report. Full instructions in `~/.claude/skills/qa-tester/skill.md` and `.claude/skills/qa-tester/skill.md`.

---

## 6. Known Bugs Handling for Claude

### Rule: Skip known failures, verify known fixes.

Claude should not spend time confirming bugs that are already documented as active. Instead:
- For items listed under **Active / Not Yet Fixed** below: skip testing them, note them as known in any report.
- For items listed under **Fixed in Recent OTAs**: verify the fix actually holds — do NOT assume it works just because it was shipped.

### Exception: Google Sign-In
Google Sign-In will fail on any TestFlight build produced before the `iosUrlScheme` was added to `app.json` (added 2026-06-07). This is a **known infrastructure limitation of the current build** — not a code bug. Skip Google Sign-In tests until a new native build is produced. Document as: *"Blocked pending native rebuild — not a regression."*

---

## 7. Report Format

When Claude runs a QA or competitive session, produce **four separate output files**, not one giant report:

### `tests/reports/QA_REPORT.md`
Maestro flow results table + visual screenshot review. One row per test case. Status: PASS / FAIL / VISUAL ISSUE / BLOCKED. Include screenshot paths.

### `tests/reports/BUGS_FOUND.md`
Only new bugs discovered in this session. Do not re-list known bugs from this doc. Format per bug: screen affected, steps to reproduce, expected vs actual, severity (P0/P1/P2).

### `tests/reports/COMPETITIVE_BENCHMARK.md`
Side-by-side feature comparison: Perfume Picks vs Fragrantica vs Scentbird. See competitive instructions below.

### `tests/reports/LAUNCH_READINESS_CHECKLIST.md`
Binary checklist of launch-critical items. Each item: ✅ ready / ❌ not ready / ⚠️ known issue. Categories: Auth flows, Core feature gates, Paywall, Affiliate links, Performance, Crashes.

---

## 8. Competitive Benchmark Targets

### Target Apps

1. **Fragrantica** — `com.fragrantica.android` / search "Fragrantica" on App Store
   - Dominant fragrance database, web-first, mobile is an afterthought
   - Beat it on: iOS-native UX, taste personalization, scan-to-identify, wardrobe tracking

2. **Scentbird** — search "Scentbird" on App Store
   - Strong brand, locked to their subscription catalog
   - Beat it on: any-fragrance wardrobe (not just theirs), dupe finder, taste profile depth, no subscription lock-in

### How Claude Should Do the Comparison

**Preferred: Install and use the competitor apps if they are available in the simulator or on a connected device.** A feature matrix built from actually tapping through the app is far more accurate than reading App Store listings.

If competitor apps are not installed:
1. Fetch their App Store product pages
2. Read their App Store descriptions, screenshot captions, and review themes
3. Note which features they claim vs what Perfume Picks has

**What to compare in `COMPETITIVE_BENCHMARK.md`:**

| Dimension | Perfume Picks | Fragrantica | Scentbird |
|---|---|---|---|
| Taste personalization | | | |
| Wardrobe / collection tracking | | | |
| Scan / identify by photo | | | |
| Dupe / cheaper alternative finder | | | |
| Onboarding (first 60 seconds) | | | |
| Search UX | | | |
| Fragrance detail depth | | | |
| Community / social features | | | |
| Free tier generosity | | | |
| iOS design quality | | | |

Fill each cell with a one-line honest assessment. Do not flatter Perfume Picks — accurate is more useful than favorable.

---

## 9. Screens & Routes Reference

| Route | Screen | Auth required | Pro required |
|---|---|---|---|
| `/(tabs)` | Today / Home | No | No |
| `/(tabs)/discover` | Discover | No | No |
| `/(tabs)/train` | Taste / Train My Nose | No | No (capped at 10/day) |
| `/(tabs)/wardrobe` | My Wardrobe | No | No (capped at 20 items) |
| `/(tabs)/profile` | Profile / You | No | No |
| `/fragrance/[id]` | Fragrance Detail | No | Partial (layering, dupes) |
| `/brand/[name]` | Brand page | No | No |
| `/scan` | Perfume Concierge (camera scan) | No | No (capped at 10/day) |
| `/paywall` | Pro upgrade | No | — |
| `/quiz` | Taste Quiz | No | Partial (10q vs 5q) |
| `/quiz/results` | Quiz Results | No | No |
| `/taste-profile` | Full Taste Profile | No | Yes |
| `/auth/login` | Sign In | — | — |

---

## 10. Known Bugs & Known Weirdness

### Active / Not Yet Fixed (do not waste time re-discovering these)

| Issue | Details | Severity |
|---|---|---|
| **Google Sign-In blocked on current build** | Fully configured in code and services (Google Cloud bundle ID set, Supabase Google provider enabled, iosUrlScheme in app.json). Blocked pending native rebuild. | P1 — known infra gap |
| **FragranceShop affiliate tracking** | Cloudflare strips the `cjevent` param. Perfumania works. No code fix available — platform-side issue. | P2 |
| **Custom wardrobe items don't survive app restart** | Items added via scan quick-add with a custom fragrance ID exist in-memory only. On restart the wardrobe row exists but the detail screen may show a blank. The detail screen does not yet gracefully handle an unknown `fragrance_id`. | P2 |
| **PostHog analytics not tracking** | Key is placeholder `REPLACE_WITH_PERFUME_PICKS_POSTHOG_KEY` — events are not being tracked in production. | P2 |
| **Sentry error reporting not active** | DSN is placeholder `REPLACE_WITH_PERFUME_PICKS_SENTRY_DSN` — errors not reported remotely. | P2 |

### Fixed in Recent OTAs (verify these hold, do not re-investigate root cause)

| Issue | Fix shipped | What to verify |
|---|---|---|
| Pro status not cleared on sign-out → guests bypass swipe limit | `deactivate()` in `handleSignOut` | Sign out, continue as guest, confirm train shows 10-swipe limit |
| Wardrobe empty after sign-in | `hydrateWardrobe` merges unsynced local + Supabase rows | Sign out, sign back in, confirm wardrobe items appear |
| Duplicate `useAppSync` hook | Removed duplicate call in `_layout.tsx` | No symptom to verify — check for double-hydration race |
| SOTD feed showing same fragrance twice | Dedup by `fragrance_id` in `useSOTDFeed` | Confirm "Wearing Today" rail has no repeated fragrance |
| Train deck returning in A–Z order | `fetchEnriched` orders by `id` (UUID = pseudo-random) | Open Train session, confirm first 10 cards are not alphabetical |
| Brand tiles showing plain text | Product image backgrounds + dark overlay in Discover | Verify brand grid shows images |
| Scan dead end on unidentified bottle | Quick-add form with pre-filled name/brand | Scan an unidentifiable object, confirm form appears |
| Scan quick-add rejecting unknown bottles | Synthetic catalog entry created, added to wardrobe | Type a completely made-up fragrance name, confirm it saves |
| Scan photo not on custom item card | Photo copied to document directory as `image_url` | Add custom bottle via scan, confirm photo appears in wardrobe |
| Paywall blank error screen when RC fails | Always renders pricing UI with hardcoded fallbacks | Open paywall with no network, confirm $2.99/$24.99 still shows |
| Perfume Wrapped showing "Come back in December" | Feature removed from Profile | Confirm Profile has no Wrapped row |

### Permanent Quirks (by design, do not file as bugs)

- **`isPro` in AsyncStorage is client-side only.** Server RLS is the real guard. A user cannot exploit this for any server-side data.
- **OTA runtime version locked to `1.0.0`.** Native dependency changes require a full App Store build — OTA cannot touch native modules.
- **New Architecture (`newArchEnabled: true`) is on.** Some older RN packages may have edge-case compatibility issues.
- **`checkAutomatically: "NEVER"`** — OTA updates are not auto-applied. They take effect on the next cold app launch.
- **Maestro cannot control native system dialogs** — camera permission prompts, Apple Sign-In sheet, StoreKit purchase sheet must be pre-approved manually before running automated flows.
