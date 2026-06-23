# iOS App Store Listing

Paste-ready metadata for App Store Connect, plus the ASO strategy behind it. These are **launch v1** values — no console data exists yet, so treat the keyword field as a hypothesis to refine with Apple Search Ads search-term data within the first 4–8 weeks (per the ASO playbook).

---

## App name (30 char limit)

**Perfume Picks: Scent Wardrobe**  (28 chars)

> Brand + highest-weight keywords ("scent wardrobe"). Alt to A/B-test in a future version: `Perfume Picks – Fragrance Log` (29).

## Subtitle (30 char limit)

**Your collection & dupe finder**  (28 chars)

> Alt options to test: `Wear what you love & log it` (27) · `Fragrance DNA & cheaper dupes` (29).

## Promotional text (170 char limit, not indexed — change anytime)

> Find your Fragrance DNA, get a daily pick from bottles you already own, and discover cheaper dupes that smell nearly identical. The wardrobe built for collectors.

(157 chars)

## Keyword field (100 char limit, comma-separated, NO spaces, no repeats of name/subtitle words)

```
fragrance,cologne,perfume,scent,collection,inventory,tracker,diary,journal,notes,dupe,clone,niche,eau
```

(99 chars)

> Rules applied: no spaces, no duplication of "perfume/wardrobe/picks/scent/collection/dupe" already in name/subtitle where it would waste characters (note: "scent" and "collection" and "dupe" appear in metadata above — **before submitting, drop whichever duplicates Apple flags and backfill with: `samples,decants,batch,layering,sillage,accord,review`**). Apple auto-combines individual words into phrases, so single terms beat phrases.
> **Post-launch:** seed Apple Search Ads on candidate terms (`fragrance collection`, `perfume dupes`, `cologne tracker`, `fragrance journal`), then promote real converters into this field.

## Description (4,000 char limit — first ~3 lines matter most for conversion)

```
Perfume Picks is the wardrobe built for fragrance collectors. Catalog every bottle, log each wear, and get a daily pick from the scents you already own — never from a store.

Most fragrance apps want to sell you the next bottle. Perfume Picks works from the ones already on your shelf.

DISCOVER YOUR FRAGRANCE DNA
Tap the scents you love and we read your palate into one of 11 archetypes — The Connoisseur, The Seducer, The Purist, The Showstopper, and more. It's your taste, named. And it's Living: your DNA keeps sharpening every time you wear, swipe, and add a bottle.

A WARDROBE THAT REMEMBERS
Every bottle in one place — have, want, worn, tested, sold — with remaining mL, price, and the date you last wore it. The back of the shelf finally gets its turn.

A WEAR LOG THAT DOES THE WORK
Tap to log a wear. It captures the weather and the date, asks the occasion, and quietly builds your history: your compliments, your patterns, your cost-per-wear. Backdate up to two years. Log layering combos.

A PICK FOR TONIGHT, NOT JUST SHOPPING
Open the app to a Scent of the Day drawn from your own bottles — aware of the weather, the occasion, and the scents you've been neglecting.

CHEAPER BOTTLES THAT SMELL THE SAME
Love a $300 bottle? We surface dupes that smell nearly identical, ranked by match and showing the savings — often 30–70% less. One good find pays for a year of Pro.

SCAN A BOTTLE TO ADD IT
Point your camera at a bottle and we'll identify it and add it to your wardrobe.

YOUR YEAR IN SCENT
Perfume Wrapped turns your wear history into a shareable recap — top houses, top families, your most-loved bottles.

WHO WEARS THIS
See verified celebrity associations on the fragrances you're exploring.

FREE TO START
Find your Fragrance DNA, build your wardrobe, log wears, and get daily picks — free.

PERFUME PICKS PRO
Go Pro for your Living Fragrance DNA, an unlimited wardrobe, every dupe, unlimited Train My Nose swipes, layering suggestions, Perfume Wrapped, and advanced cost-per-wear analytics.
- $2.99/month, or $24.99/year with a 7-day free trial.

INDEPENDENT AND PRIVATE
No ads. We don't sell or share your data. Your wardrobe stays yours. Perfume Picks is not a retailer — we never sell fragrance. When you choose to buy, you buy from real retailers, and we may earn a commission.

Built by a collector, for collectors.

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
