# Perfume Picks — Bugs Found

**Date:** 2026-06-07 · **Build:** current `main`, fresh SDK 54 simulator dev-client · **Device:** iPhone 17 Pro / iOS 26.4

Only defects **reproduced live this session** are listed as NEW. Items already documented in the context doc are summarized under "Known / pre-existing" for completeness.

---

## NEW — reproduced live this run

### BUG-1 — Community SOTD rail is dead: `wear_logs → profiles` relationship missing (P1)

**Severity:** P1 (a headline social feature renders nothing; the shipped "dedup fix" is unreachable)
**Where:** Home tab "COMMUNITY SOTD / wearing today" rail; also `app/feed.tsx`.
**Source of the query:** `src/hooks/useSOTDFeed.ts:31-37`

```
.from('wear_logs')
.select('… profiles(display_name), fragrances(name, brand_id, image_url, brands(name))')
.eq('is_public', true)
```

**Live console evidence (captured 2x per Home load — mount + focus refresh):**
```
[useSOTDFeed] error: Could not find a relationship between 'wear_logs'
and 'profiles' in the schema cache
```

**Impact:** PostgREST cannot embed `profiles(display_name)` because no FK/relationship from `wear_logs` to `profiles` is exposed in the schema cache. The hook catches the error and returns early with an empty array, so:
- The Community SOTD rail **always** falls back to its featured/empty state ("Featured pick · Log yours to share").
- The dedup-by-`fragrance_id` logic shipped as an OTA fix (`useSOTDFeed.ts:47-54`) **never executes** — the query fails before any rows exist to dedup. That fix cannot be verified because the feature it lives in is non-functional.
- `/feed` (full SOTD feed screen) is similarly affected.

**Likely fix (not applied — reporting only):** expose the FK in Supabase (`wear_logs.user_id → profiles.id`) and reload the PostgREST schema cache, **or** hint the embed (`profiles!wear_logs_user_id_fkey(...)`), **or** split into two queries (fetch logs, then fetch profiles by id). Whichever path, re-verify the dedup afterward.

**Note:** This is not a crash and not in the core install→browse→buy funnel, but it's a visible "is anything happening here?" dead zone on the primary screen and undercuts the social hook.

---

### BUG-2 — RevenueCat 401 "Invalid API Key" → offerings never load (P1, environment-gated)

**Severity:** P1 if it reaches production; **likely a key/environment issue** in this build.
**Where:** RevenueCat SDK init (paywall + Pro entitlement).

**Live console evidence:**
```
[RevenueCat] ℹ️ Looks like you're using a legacy API key.
[RevenueCat] 😿‼️ There was a credentials issue … Invalid API Key.
[RevenueCat] API request failed: GET '/v1/product_entitlement_mapping' (401)
```

**Impact:** Offerings/product-entitlement mapping fail with 401, so live prices never load. The paywall's hardcoded fallback ($24.99/yr, $2.99/mo) saves the UX — **verified rendering correctly** — but with this key, **no real purchase can complete** and Pro entitlement cannot be fetched. App Store review will attempt a real purchase; if the production build carries this same key, IAP review fails.

**Action before release:** Confirm the **production iOS** RevenueCat API key (not a legacy/placeholder key) is wired into the App Store build, and complete one real sandbox purchase on a device. The simulator also needs a StoreKit config file to transact; absence of that masks the issue locally.

---

## Test-fixture issues fixed this run (not app bugs — recorded for transparency)

- **Tab bar not matchable by `testID`** under New Arch / react-native-screens → switched all flows to accessibility-text regex (`"Discover, tab.*"`).
- **Search result needs two taps** — the first tap on a result card only dismisses the iOS keyboard. Flows now `hideKeyboard` before tapping. (Minor UX nit: users may also experience the "first tap just closes keyboard" feel on the search list — worth a designer's glance, but standard iOS behavior.)
- Stale assumed strings corrected: Discover has no "BY ACCORD" section; quiz CTA is "Take the Taste Quiz" (entry screen offers "View My Results / Take the Quiz Again" once taken); detail labels are "About this fragrance / Notes / Add to Wardrobe / Log a Wear" (not "Performance / Pricing"); Profile quiz row is "Take the quiz"; Privacy Policy/Terms live below the fold.

---

## Known / pre-existing (from context doc — NOT re-investigated, confirmed still relevant)

| Issue | Severity | Status this run |
|---|---|---|
| Google Sign-In blocked pending native rebuild | P1 | Not testable (native sheet) — still open |
| FragranceShop affiliate `cjevent` stripped by Cloudflare (Perfumania works) | P2 | Confirmed Perfumania affiliate link renders live ("Buy from perfumania · $15") |
| Custom scan-added wardrobe items don't survive restart | P2 | Not exercised (camera-gated) — still open |
| PostHog key is placeholder — analytics not tracking | P2 | Still open (not verifiable from UI) |
| Sentry DSN is placeholder — errors not reported | P2 | Still open |

---

## Priority recommendation

1. **BUG-2 (RevenueCat key)** — gating for App Store IAP review. Verify/replace key + do a sandbox purchase **before** submitting.
2. **BUG-1 (SOTD relationship)** — fix the FK or restructure the query; either hide the rail until it works or make it function. Visible on the primary screen.
3. PostHog/Sentry placeholders — flip to real keys so you have telemetry from day one of launch.
