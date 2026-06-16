# Perfume Picks — Launch Readiness Checklist

**Date:** 2026-06-07 · **Build:** current `main` (SDK 54), fresh simulator dev-client · **Reviewer:** QA pass (automated + console capture)

## Recommendation: **SHIP AFTER 1 BLOCKER FIX** 🟡

The app is stable, polished, and the entire core funnel (browse → detail → wardrobe → paywall) works. There is **no crash and no broken core path**. However, **one item gates App Store IAP approval** and must be resolved before submission, plus one visible feature is dead and should be fixed or hidden. Everything else is launch-acceptable.

---

## 🔴 Must fix before submitting (release blocker)

- [ ] **RevenueCat key (BUG-2).** Live build returns `401 Invalid API Key`; no purchase can complete. Confirm the **production iOS** RevenueCat key is in the App Store build and complete **one real sandbox purchase on a device**. App Review *will* try to buy Pro — if this key ships, IAP review fails. *(Paywall UI itself is fine — fallback pricing renders.)*

## 🟠 Strongly recommended before launch (not a hard blocker)

- [ ] **Community SOTD rail (BUG-1).** `wear_logs→profiles` relationship missing → rail is permanently empty on the Home screen and the dedup fix is unreachable. **Either** fix the Supabase FK / restructure the query, **or** hide the rail until it works. A dead zone on the primary screen looks unfinished.
- [ ] **Flip PostHog + Sentry placeholders to real keys.** You will be blind on analytics and crashes from day one otherwise. Cheap to fix, high regret if skipped.

## 🟡 Verify on a real device before / right after launch (BLOCKED in sim this run)

- [ ] Camera scan capture + AI identification (Perfume Concierge) end-to-end.
- [ ] Scan quick-add: synthetic catalog entry, photo on the wardrobe card, and the known **custom-item-doesn't-survive-restart** P2 — decide if that's acceptable for v1.
- [ ] Apple Sign-In + (when native rebuild lands) Google Sign-In.
- [ ] Real StoreKit purchase + Pro entitlement unlock + Restore Purchases.
- [ ] Sign-out → guest still capped at 10 swipes; sign back in → wardrobe rehydrates.
- [ ] Push notifications (native module requires device).

## ✅ Verified working this run (no action needed)

- [x] App cold-launches to Home on current code (SDK 54), no red screen.
- [x] All 5 tabs + Scan FAB navigate correctly.
- [x] Discover: brand grid with images, search, fuzzy match, "No matches" empty state.
- [x] Fragrance detail: notes, accords, About, Add to Wardrobe, Log a Wear, **affiliate "Buy from perfumania" link live**.
- [x] Brand page: sorting, images, counts, back-nav.
- [x] Train: "0/10 swipes today" gate, non-alphabetical deck, swipe actions.
- [x] Wardrobe: All/Have/Want/Tried filters + search.
- [x] Profile: stats, no "Wrapped" row, taste section, account section.
- [x] Paywall: opens, value props, **fallback pricing $24.99/yr + $2.99/mo renders despite RC down**.
- [x] Quiz: 5-question free gate → Pro upsell at Q5.
- [x] Scan UI: Perfume Concierge screen + "10/10 free scans" gate.

## App Store metadata / compliance (confirm separately — outside this QA run)

- [ ] Privacy Policy + Terms of Use reachable in-app (present below the fold on Profile — confirmed) **and** as hosted URLs in App Store Connect.
- [ ] IAP products (`$2.99/mo`, `$24.99/yr` w/ 7-day trial) configured + "Ready to Submit" in App Store Connect, matching the in-app fallback strings.
- [ ] Screenshots / preview reflect the current cream/gold UI.
- [ ] Guest purchase path works (paywall allows purchase without account — §5.1.1(v) compliant per code).
- [ ] Account deletion path available (App Store requirement for accounts).

---

### One-line verdict
**Polished, stable, demo-ready — but do not submit until the RevenueCat production key is verified with a real sandbox purchase, and either fix or hide the broken Community SOTD rail.** Fix those two and this is a confident ship.
