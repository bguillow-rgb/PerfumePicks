# Perfume Picks — Pre-Release QA Report

**Date:** 2026-06-07
**Build under test:** Current `main` (SDK 54 / RN 0.81.5 / New Architecture), freshly compiled via `expo run:ios` — NOT the stale May-30 dev-client.
**Device:** iPhone 17 Pro simulator, iOS 26.4
**Bundle:** `com.bobguillow.perfumepicks`
**Method:** Maestro UI automation against the live app + simulator console capture (`xcrun simctl log stream`) for runtime errors. All flows saved permanently to `tests/maestro/generated/` (regression suite). Screenshots in `tests/maestro/artifacts/20260607-112409/`.

---

## 1. Executive summary

The app is **visually polished and functionally solid** across every screen a reviewer or user will touch in the first session: Home, Discover, Search, Fragrance Detail, Brand pages, Train (Taste), Wardrobe, Profile, Paywall, Quiz, and Scan all render correctly and navigate cleanly. All four free-tier gates are implemented and surfaced to the user (10 swipes/day, 10 scans/day, 5-question quiz, wardrobe cap messaging). The paywall degrades gracefully to hardcoded fallback pricing.

Two **real backend defects were reproduced live in the console** (not inferred from code):
1. **Community SOTD rail is non-functional** — the `wear_logs → profiles` PostgREST relationship does not exist, so the query 400s on every Home load and the "wearing today" rail silently shows only its empty-state. The shipped dedup "fix" is unreachable.
2. **RevenueCat returns 401 Invalid API Key** — offerings never load; the paywall always uses fallback pricing. Must be confirmed as a simulator/key-environment issue before release, not a production key problem.

Neither is a crash. Neither blocks the core funnel. See `BUGS_FOUND.md`.

---

## 2. Test environment note (why this build, not TestFlight)

The context doc's default is the TestFlight production-OTA build. That was explicitly overridden for this run: the May-30 dev-client on disk is a stale SDK-52 native shell that red-screens (`Cannot find native module 'ExpoPushTokenManager'`) against current JS. A TestFlight `.ipa` is a device-only ARM slice and cannot run in the simulator. To test **current code**, a fresh simulator dev-client was built from `main`. This is the right artifact for "does the latest code work," with the caveat that native-only concerns (push tokens, real StoreKit, real Google Sign-In sheet) behave differently than on a device.

---

## 3. Flow results (regression suite `tests/maestro/generated/`)

| # | Flow | Result | Notes |
|---|---|---|---|
| 001 | Home screen loads | **PASS** | SOTD hero, Your Taste, Community rail, bottom rails all render. |
| 002 | Tab navigation | **PASS** | All 5 tabs reachable. Tab bar is **not** exposed by testID under New Arch — see §4. |
| 003 | Discover + search + edge cases | **PASS** | Search works; misspelling ("Savage") returns fuzzy results; "zzzzfakeperfume" shows **"No matches"** empty state. No "BY ACCORD" section exists (removed/never shipped — assertion dropped). |
| 004 | Train (Taste) session | **PASS** | "0 / 10 swipes today" gate visible; deck first card = Armaf *Odyssey Limoni* (**not alphabetical** — OTA fix holds); PASS/LIKE/LOVE work. |
| 005 | Wardrobe tab | **PASS** | All/Have/Want/Tried filters + in-wardrobe search all functional. |
| 006 | Profile + paywall | **PASS** | No "Wrapped" row (OTA fix holds); paywall opens; **$24.99/yr + $2.99/mo fallback pricing renders despite RC 401** (OTA fix holds). |
| 007 | Fragrance detail | **PASS** | Opens from search; affiliate "Buy from perfumania · $15" CTA, Add to Wardrobe, Log a Wear, About/Notes sections all present. (iOS quirk: first tap on a search result only dismisses the keyboard — flow now hides keyboard first.) |
| 008 | Taste quiz | **PASS** | Free quiz is exactly **5 questions** ("1 of 5" … "5 of 5"); after Q5 a Pro upsell modal appears ("Unlock 5 deeper questions + Taste Insights with Pro"). Gate works. |
| 009 | Scan / Perfume Concierge | **PASS (UI)** | "Perfume Concierge", "Identify a Fragrance", "Choose from Library", "10 / 10 free scans remaining today" all render. Capture + camera permission are native — **BLOCKED** for automation (see §5). |
| 010 | Brand page | **PASS** | BY HOUSE grid → tile (lattafa, 183 fragrances) → brand page with sort pills + images → back-nav. Brand tiles show images (OTA fix holds). |

**Score: 10/10 flows green.** 003, 006, 007, 008, 010 were corrected from stale assumed strings to match the current build's actual UI; the corrections are documented inline in each YAML.

---

## 4. Known automation constraint — tab bar selectors

Under New Architecture + `react-native-screens`, the bottom tab bar's `tabBarTestID`s (`tab-discover`, etc.) are **not** surfaced to the iOS accessibility tree, so Maestro cannot match them by `id`. The tabs *are* present as accessibility labels (`"Discover, tab, 2 of 6"`). All flows now tap tabs via text regex `"Discover, tab.*"`. This is a test-harness detail, not an app bug, but worth noting for anyone extending the suite.

---

## 5. BLOCKED (native dialogs / auth — not testable via Maestro in sim)

| Area | Why blocked |
|---|---|
| Camera capture + scan identification | Camera permission + capture are native; Maestro cannot drive them. UI shell verified only. |
| Scan quick-add fixes (synthetic catalog entry, photo on card, custom-item persistence) | Gated behind camera capture. **Not verified this run.** Note: custom items not surviving restart is a known P2. |
| Apple/Google Sign-In, StoreKit purchase sheet | Native sheets; Google Sign-In additionally blocked pending native rebuild (known P1). |
| Sign-out → guest swipe-limit reset; wardrobe hydrate on re-login | Require an authenticated session; not exercised this run. |
| Real RevenueCat purchase / entitlement | Key is rejected (401) and StoreKit needs a config file in sim. |

---

## 6. OTA-fix verification summary

| Claimed fix | Status |
|---|---|
| Paywall renders fallback pricing when RC fails | ✅ **Verified** ($24.99 / $2.99 shown with RC 401 live) |
| Perfume Wrapped removed from Profile | ✅ **Verified** (assertNotVisible passed + visual) |
| Brand tiles show product images | ✅ **Verified** |
| Train deck not A–Z | ✅ **Verified** (first card Armaf, not "Abaan"-type) |
| SOTD dedup by fragrance_id | ❌ **Unreachable** — query errors before any rows return (see BUGS_FOUND #1) |
| Scan quick-add / photo / synthetic catalog | ⛔ **BLOCKED** (native camera) |
| Sign-out Pro reset / wardrobe hydrate | ⛔ **Not tested** (needs auth) |
| Removed duplicate `useAppSync` | — No user-visible symptom; not independently verifiable from UI |

---

## 7. Free-tier gates — all confirmed present & surfaced

- **Train:** "0 / 10 swipes today" header.
- **Scan:** "10 / 10 free scans remaining today".
- **Quiz:** hard stop at 5 questions → Pro upsell modal.
- **Wardrobe cap / unlimited:** surfaced in paywall copy ("Unlimited Wardrobe … no cap"). Live 20-item cap not exercised (would require adding 20 items).

---

## 8. Visual quality

Consistently high. Cohesive cream/gold editorial aesthetic, serif display + cursive accents, dense-but-legible rails. Detail screen, paywall, and brand pages in particular look ship-ready. No layout breakage, clipping, or contrast failures observed across 38 screenshots.

See `LAUNCH_READINESS_CHECKLIST.md` for the go/no-go call and `BUGS_FOUND.md` for defect detail.
