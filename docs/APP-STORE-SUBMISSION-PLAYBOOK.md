# App Store Submission Playbook
## Lessons from Pour Picks (build #1–18) — applied to Perfume Picks

This document captures every rejection, every fix, and every pre-emptive measure taken across
Pour Picks' App Store journey. Use it as a pre-submission checklist for Perfume Picks to avoid
repeating the same back-and-forth.

---

## The rejection history (Pour Picks)

### Rejection 1 — Build #17 (rejection ID ddcb15cf)
Apple flagged **four issues simultaneously**:

| Guideline | What they said | What was wrong |
|---|---|---|
| **§5.1.1(v)** Account-based features | Guests had to sign in before seeing the purchase button | Subscriptions for non-account-based content must be purchasable WITHOUT requiring sign-in. Registration is only allowed as an optional add-on for cross-device sync. |
| **§5.1.1(iv)** Permission request UI | Camera pre-permission screen had a "Grant Permission" button and a "Go Back" button | Apple rule: pre-permission screens must say "Continue" or "Next". No exit affordance allowed on a pre-permission screen. |
| **§3.1.2(c)** In-app purchase disclosure | No functional Terms of Use link in the App Store Description | The description must include a live clickable link to Terms of Use |
| **§2.1(b)** Incomplete information | IAP products not attached to the version submission | `pp_pro_monthly` + `pp_pro_yearly` must be attached in ASC before submitting for review |

**Code fixes (Build #18):**
- `app/paywall.tsx` — Guests now see the same purchase CTA as signed-in users. Removed the "Sign in to subscribe" gate. Added optional "Sign in to sync across devices" text link *below* the CTA.
- `app/identify/camera.tsx` — Changed "Grant Permission" → "Continue". Removed the "Go Back" button entirely.

**ASC metadata fixes (founder, outside code):**
- Added a functional Terms of Use URL to the App Store description text
- Attached both IAP products to the version before resubmitting

---

## Pre-emptive fixes applied to Stick Picks *from* Pour Picks lessons
(commit `fde4b56` in StickPicks repo documents these as "preemptive fixes from Pour Picks rejection history")

- **§5.1.1(v)**: Guests can purchase without signing in across all Picks apps
- **§5.1.1(iv)**: All permission screens use "Continue" / "Next" — never "Grant Permission" or "Allow"
- **§3.1.2(c)**: App Store description always includes a live Terms of Use link
- **Terms of Use** (not "Terms of Service") — Apple's own HIG uses "Terms of Use"; "Terms of Service" is flagged in some reviews (see `945191f` in StickPicks)

---

## Compliance patterns that must be in every Picks app

### Paywall (§3.1.2 + §5.1.1(v))
- [ ] Guests can tap the purchase CTA without signing in first
- [ ] Sign-in is presented as *optional* (sync benefit), not a gate
- [ ] Auto-renew disclosure visible: `"Auto-renews at $X/year until cancelled"`
- [ ] "Restore Purchase" visible to all users including guests
- [ ] Privacy Policy + Terms of Use links in the paywall footer
- [ ] IAP products attached to the version in ASC before submitting

### Permission requests (§5.1.1(iv))
- [ ] Camera permission screen button text: **"Continue"** (not "Grant Permission", "Allow", "Enable")
- [ ] No "Go Back" / "Skip" / exit button on permission request screens
- [ ] Photo library permission: same rule — "Continue" only
- [ ] Notification permission: same rule

### Account / auth (§5.1.1)
- [ ] Guest mode available — user can explore the app without creating an account
- [ ] Sign-out visible in Profile (§5.1.1(ii))
- [ ] Delete Account available in Profile (§5.1.1(v)) — must actually cascade-delete all data
- [ ] Delete-account flow confirmed working end-to-end (Supabase Edge Function)

### Legal links (§3.1.2(c))
- [ ] **Terms of Use** link (not "Terms of Service") in:
  - App Store Connect description text (live URL, not just the dedicated ASC field)
  - In-app login screen footer
  - In-app paywall footer
  - In-app profile screen
- [ ] Privacy Policy link in same four locations
- [ ] Both URLs must be live on the public web before submission
- [ ] In-app screens should link OUT to the hosted URLs so copy can be updated without resubmission

### App Store Connect metadata (§2.1)
- [ ] Privacy Policy URL populated in ASC
- [ ] Support URL populated in ASC
- [ ] All IAP products **attached to the version** before submitting (not just created — they must be in the "Add-Ons" section of the version)
- [ ] Age rating questionnaire completed (fragrance app: no alcohol/drugs/tobacco = lower rating; if any content references restricted substances, bump to 17+)
- [ ] Privacy nutrition labels accurate (what data you collect, with/without user account, etc.)

### Review notes (prevent rejection for missing info)
Always include in the App Store Connect review notes:
```
Guest mode: tap "Continue as Guest" on the login screen to explore without an account.
Test account: [email] / [password]   ← provide a real non-anonymous test account
In-app purchases: use the sandbox environment. Products are perfumepicks_pro_monthly ($2.99) and perfumepicks_pro_yearly ($24.99).
```

---

## Content / copy rules (§1.4 and general review sensitivity)

Pour Picks avoided §1.4.3 (alcohol content) issues by using neutral framing:
- ✅ "tasting," "pour," "cellar," "collection," "notes"
- ❌ "drink," "booze," "shots," "get drunk," "binge"
- No people visibly consuming alcohol in screenshots or marketing imagery
- No glasses-being-clinked imagery in App Store screenshots

**Fragrance-specific (Perfume Picks):**
- No copy encouraging excessive use or addiction-adjacent framing
- "Wardrobe," "collection," "discover" are safe
- Keep fragrance-note descriptions neutral; avoid anything that reads as drug-adjacent paraphernalia

---

## Technical submission pitfalls

### EAS + environment variables
- All `EXPO_PUBLIC_*` vars must be populated in `eas.json` production profile before building
- `SENTRY_DISABLE_AUTO_UPLOAD=true` for the first build (prevents build failure without Sentry auth token)
- Google Sign-In client IDs are **baked into the binary at build time** — OTA updates cannot change them
- Supabase URL + anon key go in EAS `production` env, NOT just `.env.local`

### Common build blockers
- **RevenueCat fallback prices** must match ASC-configured prices exactly ($2.99/$24.99) — drifting causes §3.1.2 issues
- **Bundle ID rename mid-flight** = new ASC app record + resubmit from scratch. Don't rename after first TestFlight.
- **`ITSAppUsesNonExemptEncryption: false`** must be in `app.json` infoPlist to pass export compliance
- **iOS deployment target** should be ≥ 15.5 for Expo SDK 54

### Sentry sourcemap workflow
1. First build: `SENTRY_DISABLE_AUTO_UPLOAD=true` → build succeeds even without auth token
2. After first build green: set Sentry org auth token in EAS secrets → flip `SENTRY_DISABLE_AUTO_UPLOAD=false` for production only

---

## Submission sequence (what order to do things)

1. **External prerequisites first** (can't be OTA'd later):
   - [ ] RevenueCat: project + Apple API key + products + entitlement + offering
   - [ ] ASC: app record created, IAP products created and in "Ready to Submit"
   - [ ] Supabase: all production env vars confirmed
   - [ ] Legal pages live on public web (privacy, terms, support)
   - [ ] Google OAuth credentials in eas.json (requires new build)

2. **Fill `eas.json` placeholders** — verify with `eas env:list`

3. **Run `eas build --platform ios --profile production`**

4. **Internal TestFlight** (no review needed, instant):
   - Install on real device, verify all flows
   - Sandbox purchase round-trip (buy → Pro activates → restore on reinstall)

5. **External TestFlight** (~24h Apple beta review):
   - Use as a dry run — same review team, same guidelines
   - Fix anything flagged here before App Store submission

6. **App Store submission**:
   - Attach build in ASC
   - Attach IAP products to version
   - Add Terms of Use link to description text
   - Fill review notes with guest login instructions + test account
   - Submit

---

## Checklist — Perfume Picks specific

### Code (verify before building)
- [ ] `app/paywall.tsx` — guests see purchase CTA without sign-in gate
- [ ] Camera/scan screen — permission button says "Continue", no exit button
- [ ] Profile screen has Sign Out + Delete Account rows for signed-in users
- [ ] Delete-account edge function tested and cascades correctly
- [ ] Privacy Policy + Terms of Use links in: login footer, paywall footer, profile screen
- [ ] Terms labeled "Terms of Use" not "Terms of Service" throughout

### ASC metadata
- [ ] Privacy Policy URL: live public URL
- [ ] Support URL: live public URL
- [ ] Terms of Use URL: live public URL (also pasted into description text)
- [ ] Age rating questionnaire completed (likely 4+ or 9+ — no alcohol/restricted content in fragrance)
- [ ] Privacy nutrition labels filled accurately
- [ ] `perfumepicks_pro_monthly` + `perfumepicks_pro_yearly` attached to version (must match `src/lib/revenuecat.ts` exactly — these IDs are locked)
- [ ] Review notes written with guest flow instructions

### EAS / build
- [ ] `EXPO_PUBLIC_SUPABASE_URL` — filled
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` — filled
- [ ] `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — ✅ done (`307052163679-qthrjn2865cin6devcg2re9dpmbrhfh5.apps.googleusercontent.com`)
- [ ] `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — ✅ done (`307052163679-f4hubfdggn04mv2kuplvv9v7s46co2nc.apps.googleusercontent.com`)
- [ ] `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` — fill
- [ ] `EXPO_PUBLIC_SENTRY_DSN` — fill (or skip Sentry for v1)
- [ ] `EXPO_PUBLIC_POSTHOG_API_KEY` — fill (or skip PostHog for v1)
- [ ] `SENTRY_DISABLE_AUTO_UPLOAD=true` — already set
- [ ] `ITSAppUsesNonExemptEncryption: false` in `app.json` — already set
