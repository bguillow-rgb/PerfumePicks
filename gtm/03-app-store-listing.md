# iOS App Store Listing

Paste-ready metadata for App Store Connect, plus the ASO strategy behind it. These are **launch v1** values — no console data exists yet, so treat the keyword field as a hypothesis to refine with Apple Search Ads search-term data within the first 4–8 weeks (per the ASO playbook).

---

## App name (30 char limit)

**Perfume Picks: Scent Wardrobe**  (28 chars)

> Brand + highest-weight keywords ("scent wardrobe"). Alt to A/B-test in a future version: `Perfume Picks – Fragrance Log` (29).

## Subtitle (30 char limit)

**Fragrance DNA & cheaper dupes**  (28 chars)

> Updated 2026-07-18: leads with the two hooks users actually convert on (DNA + dupes). Alt to test: `Your collection & dupe finder` (28).

## Promotional text (170 char limit, not indexed — change anytime)

> Get your Fragrance DNA, a daily scent to wear from bottles you already own, and cheaper dupes that smell nearly the same. Built for collectors.

(~140 chars, humanized 2026-07-18)

## Keyword field (100 char limit, comma-separated, NO spaces, no repeats of name/subtitle words)

```
fragrance,cologne,perfume,scent,collection,inventory,tracker,diary,journal,notes,dupe,clone,niche,eau
```

(99 chars)

> Rules applied: no spaces, no duplication of "perfume/wardrobe/picks/scent/collection/dupe" already in name/subtitle where it would waste characters (note: "scent" and "collection" and "dupe" appear in metadata above — **before submitting, drop whichever duplicates Apple flags and backfill with: `samples,decants,batch,layering,sillage,accord,review`**). Apple auto-combines individual words into phrases, so single terms beat phrases.
> **Post-launch:** seed Apple Search Ads on candidate terms (`fragrance collection`, `perfume dupes`, `cologne tracker`, `fragrance journal`), then promote real converters into this field.

## Description (4,000 char limit — first ~3 lines matter most for conversion)

<!-- Updated 2026-07-18: humanized (zero em dashes), affiliate-accurate ("where to
buy" now that 8,356 buy links are live), archetype count claim removed (there are
22, not 11), and current features surfaced (Scent of the Day rotation, Share DNA,
8am reminder). -->

```
Perfume Picks reads your taste into a Fragrance DNA. Then it hands you a scent to wear each day from the bottles you already own, and finds cheaper bottles that smell nearly the same.

YOUR FRAGRANCE DNA
Tap the scents you love and we read your palate into an archetype: The Seducer, The Connoisseur, The Purist, and more. It's your taste with a name on it, and it keeps sharpening every time you wear, swipe, or add a bottle.

SCENT OF THE DAY
Open the app to a scent chosen from your own wardrobe, matched to your DNA and the day, with a line on why it fits. Turn on the morning reminder and it arrives at 8am.

CHEAPER BOTTLES THAT SMELL THE SAME
Love a $300 bottle? We find dupes matched on accords, ranked by how close they smell and how much you'd save. Usually 30 to 70 percent less.

YOUR WHOLE COLLECTION
Track every bottle you own, want, or have tried, with remaining mL, price, and when you last wore it. Log a wear in one tap and it captures the day and occasion. Backdate up to two years, and log layering combos too.

SCAN A BOTTLE
Point your camera at a bottle and we'll identify it and add it to your wardrobe.

SHARE YOUR DNA
Send friends your archetype and they can go find out theirs.

YOUR YEAR IN SCENT
Perfume Wrapped turns your wear history into a recap you can share: top houses, top families, the bottles you reached for most.

WHO WEARS THIS
See verified celebrity associations on the fragrances you're exploring.

WHERE TO BUY
When you're ready to buy, we point you to real retailers and may earn a commission. Perfume Picks is not a store and never sells you fragrance directly.

FREE TO START
Find your Fragrance DNA, build your wardrobe, log your wears, and get a daily pick. All free.

PERFUME PICKS PRO
Unlimited Train My Nose swipes and scans, an unlimited wardrobe, every dupe, layering suggestions, Perfume Wrapped, and your full taste profile.
- $2.99/month, or $24.99/year with a 7-day free trial.
Subscriptions auto-renew until cancelled. Manage anytime in your App Store settings.

PRIVATE BY DEFAULT
No ads. We don't sell or share your data. Your wardrobe stays yours.

Built by a collector, for collectors.

Terms: https://perfumepicks.app/terms
Privacy: https://perfumepicks.app/privacy
Questions? support@perfumepicks.app
```

## What's New (version notes — launch 1.0)

```
Welcome to Perfume Picks — the wardrobe for fragrance collectors.

- Discover your Fragrance DNA and your archetype
- Catalog your whole collection: have, want, worn, tested, sold
- Log every wear with weather and occasion
- Get a daily pick from bottles you already own
- Find dupes that smell nearly identical for less
- Scan a bottle to add it instantly

We're just getting started. Tell us what you'd love next: support@perfumepicks.app
```

## Subscription display names & descriptions (App Store Connect IAP)

- **Perfume Picks Pro (Monthly)** — "Living Fragrance DNA, unlimited wardrobe, all dupes, and Pro analytics. $2.99/month."
- **Perfume Picks Pro (Annual)** — "Everything in Pro, billed yearly. 7-day free trial, then $24.99/year — save 30%."

## Privacy nutrition label (align with the privacy promise)

- Data **not** sold or shared with third parties for advertising.
- Data linked to identity used only to run the app (account, wardrobe, preferences).
- No third-party ad tracking. (Confirm against actual Supabase/PostHog/Sentry/RevenueCat data flows before submission.)

## Category

- **Primary:** Lifestyle  (best ranking opportunity; matches "wardrobe/collection" framing)
- **Secondary:** Shopping  (captures dupe/buy intent)

## Screenshot caption set (overlay text — first 3 are decisive)

1. **Your taste, named.** — Fragrance DNA reveal (archetype card)
2. **Wear what you love.** — Today / Scent of the Day pick
3. **Your whole collection, organized.** — Wardrobe with mL + price
4. **A wear log that remembers.** — Log-wear sheet w/ weather + occasion
5. **Dupes that smell the same — for less.** — DupeList with match % + savings
6. **Scan a bottle to add it.** — Scan screen
7. **Your year in scent.** — Perfume Wrapped card

> Source screenshots already exist in repo root and `/ux-shots/` (e.g. `q08-results.png`, `e2e-01-home-top.png`, `w01-wardrobe-one-item.png`, `f07-log-wear-sheet.png`, `p08-paywall.png`). Use hybrid screenshots: real UI + bold caption overlay in champagne gold on ivory.

## App preview video (15–30s, .mov/.m4v/.mp4)

Beat sheet: DNA reveal (archetype lands) → wardrobe scroll → tap-to-log a wear (weather auto-fills) → Scent of the Day → dupe with savings → logo + "The Fragrance Collector's Wardrobe." No voiceover needed; text beats + the in-app palette.

## Review response templates

- **5★, loves DNA:** "Thank you — 'your taste, named' is exactly what we were going for. If you ever want a feature, we read every email: support@perfumepicks.app"
- **Wants a missing fragrance:** "Appreciate it. Send the name to support@perfumepicks.app and we'll get it into the catalog — the collection grows every week."
- **Pricing complaint:** "Totally fair. The Fragrance DNA, wardrobe, wear log, and daily picks are free for good — Pro is there if the Living DNA and dupe finder earn it. One dupe usually pays for a year."
- **Bug report:** "Sorry about that — that's not the experience we want. Email support@perfumepicks.app with your device/iOS and we'll fix it fast."
