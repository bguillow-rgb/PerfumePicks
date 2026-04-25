# Perfume Picks — install on your phone for early UI review

This build runs in **demo mode** — no Supabase, no RevenueCat, no real auth. The
app boots straight into the Today screen so you can review every screen visually.
All data on screen is mock data from `src/mock/fragrances.ts` (~25 real luxury
fragrances with notes, accords, prices, and images).

## What you'll see

1. **Splash:** "Perfume Picks" written in cursive (Pinyon Script) — appears
   letter-by-letter left-to-right with a champagne-gold pen tip tracking the
   leading edge. ~2.6s total before the home screen takes over.
2. **Today tab:** time-aware greeting, hero "Wear Today" pick, three rails
   (Today's Edit, New Arrivals, Trending in your taste).
3. **Discover tab:** working search (try "amber" or "rose"), curated edit pills
   with horizontal carousel, brand grid, accord grid.
4. **myWardrobe tab:** 6 sample fragrances with status pills, mL fill meters,
   and a "Reorder" alert on Miss Dior (low remaining).
5. **Train tab:** intro screen → tap "Begin a Session" → working swipe deck
   with rotation, like/pass badges, haptic feedback, session summary.
6. **Profile tab:** account stub, settings rows, Pro upgrade entry.
7. **Fragrance detail:** tap any card to see the notes pyramid, accord chips
   with intensity meters, performance bars, derived scores, similar fragrances,
   and pricing tier.
8. **Quiz:** Profile → "Take the quiz" → 3-question taste flow → results page
   with top 5 matches.

## To install on your iPhone

You need:
- macOS with **Xcode 15+** installed
- Apple Developer account (your `ZNS5TNLB2D` team ID is already in `app.json`)
- iPhone connected via USB **or** on the same Wi-Fi as your Mac

```bash
cd "/Users/bobguillow/Perfume Picks"

# (Already done by Claude, but run again if anything looks off)
npm install

# Build the dev client and install to your phone in one go.
# Xcode will handle code signing automatically.
npx expo run:ios --device
```

`expo run:ios --device` will:
1. Generate the native iOS project (`ios/` folder)
2. Build the app with Xcode
3. Install it to whichever device you select from the prompt
4. Launch the bundler so live-reload works while you're using it

First run takes 5–10 minutes (CocoaPods + native build). Subsequent runs are
30–60 seconds.

## When prompted to "select a device"

Pick your physical iPhone from the list (not a simulator — the splash
animation looks much better on a real screen, and the haptics on the swipe deck
only fire on hardware).

## To use TestFlight instead (no USB cable)

This requires the EAS provisioning steps from the previous turn. Once Supabase
+ RevenueCat + EAS project are set up, run:

```bash
npx eas build --profile preview --platform ios
npx eas submit --profile preview --platform ios
```

## Known demo-mode limitations

- **No auth, no sync.** Anything you do (likes in Train, etc.) is local to the
  current app session and resets on relaunch.
- **Paywall is a stub.** Tapping "Start Pro" will just show "Unavailable" since
  RevenueCat isn't configured yet. The UI/copy is final.
- **Fragrance images are stock photos** from Unsplash, not actual brand product
  shots. Real images replace them when the scraper pipeline runs.
- **No notifications, no analytics, no error reporting.** All gracefully no-op.

## What you should look at and react to

1. **Splash animation** — does the handwriting feel right? Speed, pen tip
   visibility, fade timing.
2. **Color palette** — ivory + champagne gold + soft blush. Does it feel
   feminine + luxury enough for the target audience?
3. **Typography** — Pinyon Script for the wordmark, Cormorant Garamond serif
   for headings, system sans for body. Hierarchy okay?
4. **Today screen** — does the greeting + hero + rails feel like a daily
   ritual, or like a search result?
5. **Detail page** — is the notes pyramid + accord chips + perf bars enough
   information density, or do you want more / less?
6. **Train deck** — physics, rotation, badge legibility, action button feel.

When you're ready, tell me what to change.

## What's NOT in this build (deliberately deferred)

- Real backend (Supabase project provisioning)
- RevenueCat / IAP wiring (paywall UI only, no real purchases)
- Real Google / Apple sign-in (auth screen present but bypassed in demo mode)
- Sentry / PostHog (no-op when env unset)
- Real fragrance catalog from scrapers (using 25-fragrance mock until the
  pipeline is run)
- App icons + native launch screen (still default Expo icons)
- Push notifications

Each of these unblocks separately and doesn't need to happen before you give
visual feedback on the screens above.
