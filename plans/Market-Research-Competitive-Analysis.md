# PerfumePicks — Market Research & Competitive Analysis

**Date:** 2026-05-13
**Author:** Claude research agent
**Sources:** ~35 web sources cited inline (App Store listings, retailer affiliate pages, affiliate-network reviews, Reddit/forum threads, third-party review aggregators)

---

## 1. Executive Summary

**Top finding — the fragrance-app field is bifurcated, with no clear "tracker + social + shop" winner.** The US iOS App Store splits cleanly into (a) one mass-market subscription play (Scentbird, ~83K ratings), (b) two retailer apps (FragranceX, Notino) that sell perfume directly but offer almost no tracker/wardrobe features, and (c) a long tail of small-to-mid catalog/tracker apps (Parfumo, Fragram, Aromoshelf, Sommelier du Parfum, PERFUMIST, Scented.ai) that mostly have <2K ratings each. Fragrantica — by far the largest brand in fragrance — still has no official native iOS app; the apps with "Fragrantica" in the title on the US store are unaffiliated scanners with single-digit ratings. The market category that StickPicks-style apps occupy on iOS (collection + wear log + recommendation + social) is sparsely populated by mature competitors. Parfumo is the closest analog and only has ~280 US ratings.

**Biggest gap vs. our spec — the social/SOTD + analytics + AI combination is genuinely uncovered.** Parfumo offers wear tracking and SOTD logging from the fragrance page but its UX is widely described as a stripped-down companion to the website with limited discovery filtering. Aromoshelf has a social SOTD feed but no AI personalization, no relationship map, no wrapped-style recap, and reviewers report missing pre-loaded note data ("you have to put those in manually"). Sillage ("AI Perfume & Fragrance Tracker") is closest to our pitch (weather-aware AI recs + collection + SOTD + wishlist/empties) but is brand-new (1 rating). No competitor combines: wear tracking + SOTD feed + cost-per-wear + AI weather/occasion picks + wrapped recap + clean mobile UX. The PerfumePicks plan (`MILESTONE-PLAN.md` M1–M5) maps to every feature users say is missing.

**Biggest business-model insight — there is no easy "scrape Fragrantica, also collect affiliate revenue" path. Pick a primary affiliate and pair it with a paid commercial fragrance-data API.** Fragrantica's terms claim copyright over uploaded images and they have an active DMCA agent; Parfumo relies on community uploads with strict ownership/originality rules. The viable commercial paths are: (1) license a paid API such as **Fragella** (~74K fragrances, CDN-hosted bottle JPGs + transparent WebP, includes purchase links — pricing not publicly listed) or **Fragrances of the World** (Michael Edwards' 36K+ DB, used by retailers), and (2) join 2–3 retailer affiliate programs. The strongest fragrance-affiliate combination for a US-first launch is **FragranceX** (CJ, 1–10% commission, 45-day cookie, daily product feed — confirmed) + **Sephora** (Rakuten, 5–10% on luxury beauty, only 24-hour cookie) + **Amazon Associates Luxury Beauty** (10%, broadest coverage). FragranceNet, Notino, Jomashop all have data feeds but commission rates of 1–5%; weaker per-click economics but useful as fallbacks. The "Luxury Beauty" Amazon category at 10% is a meaningful baseline — if a retailer can't beat it, it's not worth integrating.

---

## 2. Top 5 Apps — At-a-Glance Table

Ranked by **US iOS App Store review count** (numbers from the live App Store listings on 2026-05-13 via WebFetch; figures are point-in-time and the App Store rounds large counts). Where review count isn't a perfect signal of category leadership (e.g., FragranceX is a retailer app, not a "picker"), the column flags this.

| # | App | Developer | US App Store Rating | US Ratings (count) | Price model | Category | Sells perfume directly? |
|---|---|---|---|---|---|---|---|
| 1 | **Scentbird Perfume Box** ([App Store](https://apps.apple.com/us/app/scentbird-perfume-box/id1444093439)) | Scentbird, Inc. | 4.8 | ~82,877 | Subscription (~$16.95/mo) | Shopping | Yes — subscription |
| 2 | **FragranceX.com** ([App Store](https://apps.apple.com/us/app/fragrancex-com/id6471501243)) | FRAGRANCEX.COM INC. | 4.8 | ~2,472 | Free (retailer app) | Shopping | Yes — direct retailer |
| 3 | **Fragram • Perfume Finder** ([App Store](https://apps.apple.com/us/app/fragram-perfume-finder/id6447068877)) | Hleb Kuznetsov | 4.7 | ~1,147 | Freemium (IAP) | Lifestyle | No — finder/picker |
| 4 | **Sommelier du Parfum** ([App Store](https://apps.apple.com/us/app/sommelier-du-parfum/id1450650821)) | Sommelier du Parfum | 4.9 | ~654 | Free, ads-free | Shopping | No — directs to nearby stores |
| 5 | **PERFUMIST Perfumes Advisor** ([App Store](https://apps.apple.com/us/app/perfumist-perfumes-advisor/id631338649)) | Frederick Besson | 4.4 | ~544 | Free | Lifestyle | No — advisor only |

**Apps just outside the top 5 (worth noting as direct PerfumePicks analogs):**
- **Aromoshelf – AI Scent Wardrobe** (~287 ratings, 4.8) — closest social/SOTD competitor
- **Parfumo** (~280 ratings, 4.9) — closest catalog/wear-tracking competitor; large global website behind it
- **Scented.ai – a perfume mentor** (insufficient ratings for star average; Pro Weekly $4.99 / Pro Yearly $29.99)
- **Sillage — AI Perfume & Fragrance Tracker** (1 rating; brand-new, May 2026; strongest feature parity with our M5 plan)
- **Fragrantica & Product Scanner** ("ScentSnap" by Samet Sulun) — **not** an official Fragrantica app; ~4 ratings, 1.0 stars

**Important caveat — Scentbird and FragranceX dominate by review count because they're transactional retailer apps where every shipment is a prompt for a rating.** For the "picker / wardrobe / tracker" category that PerfumePicks actually competes in, the top-by-reviews are Fragram, Sommelier du Parfum, PERFUMIST, Aromoshelf, Parfumo. We deep-dive both retailer and tracker apps below, because both compete for the same shelf in users' minds, and our affiliate strategy depends on understanding the retailer side.

---

## 3. Per-App Deep Dives

### 3.1 Scentbird Perfume Box

**Core value prop.** Monthly perfume subscription. Discover designer/niche fragrances by receiving 8mL travel-size decants curated from a 900+ scent catalog. The app is the channel to manage the subscription queue.

**Feature inventory.**
- ✅ Subscription queue/picker, order tracking
- ✅ Fragrance browse + filter, brand index
- ✅ Customer reviews on each fragrance
- 🟡 Wishlist (queue)
- ❌ Wear/SOTD logging
- ❌ Wardrobe/collection management
- ❌ Social feed / follows
- ❌ Taste profile or AI personalization beyond their own quiz
- ❌ Layering / dupes / cost-per-wear
- ❌ Wrapped-style year-in-review

**Catalog size + data quality.** ~900 fragrances per their marketing copy. Limited compared to Parfumo (223K) or Fragrantica (millions of pages). Notes/accords visible per product but light vs. enthusiast platforms. Imagery is high-quality and consistent (their own studio shots of decants).

**Monetization.** Subscription, ~$16.95/mo (introductory $8.47 first month per their promotional copy). Add-ons (candles, car fresheners, full bottles).

**Acquire-the-perfume path.** **Sells directly.** Single-vendor commerce — they ship the decants themselves. No outbound retailer links visible. This means Scentbird is a closed-loop economy, not an affiliate-friendly target.

**Strengths.** Massive review volume (mostly retail-channel ratings). Strong brand recognition. Slick onboarding quiz. Variety. App Store rating 4.8.

**Weaknesses.** Documented complaints on Trustpilot, Sitejabber, ComplaintsBoard about: shipping delays, billing after cancellation, customer-support unresponsiveness, quiz/recommendation misses. App reviewers report crashes during the first-of-the-month selection rush (per FashionBeans roundup [fashionbeans.com](https://www.fashionbeans.com/article/scentbird-reviews/) and ComplaintsBoard [complaintsboard.com/scentbird-b136152](https://www.complaintsboard.com/scentbird-b136152)). Sitejabber rating is 2.1/5 over 988 reviews ([sitejabber.com](https://www.sitejabber.com/reviews/scentbird.com)) — divergent from App Store. Trustpilot ~23,885 reviews at 4 stars ([trustpilot.com](https://www.trustpilot.com/review/scentbird.com)).

**Reviews dive.**
- Praise: Variety, discovery via curation, "tried before you buy" mechanic
- Complain: shipping speed, double-billing, surprise upcharges for premium picks, inconsistent app stability
- Beg for: better recommendation quiz, faster shipping, transparent pricing
- Sources: [Trustpilot](https://www.trustpilot.com/review/scentbird.com), [Sitejabber](https://www.sitejabber.com/reviews/scentbird.com), [ComplaintsBoard](https://www.complaintsboard.com/scentbird-b136152), [FashionBeans](https://www.fashionbeans.com/article/scentbird-reviews/), [Lemon8 user review](https://www.lemon8-app.com/@__sarahelyse/7273264435891192325)

---

### 3.2 FragranceX.com

**Core value prop.** Discount fragrance retailer — same brands as a department store at up to ~80% off, with a "10,000+ authentic fragrances" pitch.

**Feature inventory.**
- ✅ Catalog browse, filter (brand, scent profile, notes), search
- ✅ Customer reviews on products
- ✅ Cart / checkout / order tracking
- ✅ Wishlist
- ❌ Wear/SOTD logging
- ❌ Wardrobe analytics
- ❌ Social feed
- ❌ Personal taste profile
- ❌ AI recommendations
- ❌ Layering / cost-per-wear / wrapped

**Catalog size + data quality.** ~10K fragrances (their marketing claim). Product images are studio shots / brand-supplied; notes data is light vs. Parfumo or Fragrantica.

**Monetization.** Retail margin. No subscription. Promotes discounts and free shipping over $35.

**Acquire-the-perfume path.** **Sells directly** as a retailer. **Affiliate program exists** via CJ Affiliate: 1–10% commission tiered by performance (up to 12% with bonuses), 45-day cookie window, daily-updated product data feed ([getlasso.co/affiliate/fragrancex](https://getlasso.co/affiliate/fragrancex/), [FlexOffers listing](https://www.flexoffers.com/affiliate-programs/fragrancex-com-affiliate-program/), [public.cj.com](https://public.cj.com/signup/publisher?advertiserId=1024283)). This is the strongest affiliate partner for a US fragrance-tracker app — daily feed, generous cookie, mid-tier commission, US-focused inventory.

**Strengths.** Real prices, real inventory, real reviews. 29,064 reviews at 4.98 stars on ResellerRatings ([resellerratings.com/store/FragranceX](https://www.resellerratings.com/store/FragranceX)). 21,737 Trustpilot reviews ([trustpilot.com](https://www.trustpilot.com/review/www.fragrancex.com)).

**Weaknesses.** App has documented issues with scrolling, accidental Safari hand-offs, and complaints about "permanent sales" framed as flash deals ([smartcustomer.com/reviews/fragrancex.com](https://www.smartcustomer.com/reviews/fragrancex.com)). Occasional counterfeit complaints on BBB and forum posts (Fragrantica thread: [beta.fragrantica.com/board/viewtopic.php?id=271617](https://beta.fragrantica.com/board/viewtopic.php?id=271617)). No wardrobe/tracking features at all.

**Reviews dive.**
- Praise: prices, selection, fast US shipping for many
- Complain: counterfeit suspicions on a minority of orders, app UX glitches, shipping choice limits
- Beg for: nothing tracker-related — users don't go there for that
- Sources: [Trustpilot](https://www.trustpilot.com/review/www.fragrancex.com), [Sitejabber](https://www.sitejabber.com/reviews/fragrancex.com), [BBB profile](https://www.bbb.org/us/ny/hauppauge/profile/online-retailer/fragrancexcom-inc-0121-7289/complaints), [ResellerRatings](https://www.resellerratings.com/store/FragranceX)

---

### 3.3 Fragram • Perfume Finder

**Core value prop.** AI-powered personalized perfume finder. Matches you to fragrances based on mood, style, and preference signals.

**Feature inventory.**
- ✅ AI-driven quiz / matchmaking
- ✅ Scent profile generation
- ✅ Recommendations (free + IAP-gated)
- 🟡 Collection / wishlist (unclear depth from listing)
- ❌ SOTD social feed
- ❌ Wear logging emphasis
- ❌ Cost-per-wear / wrapped
- ❌ Layering / dupes data

**Catalog size + data quality.** Not disclosed on the listing. Size 126.7 MB suggests significant on-device assets (images, ML model, fragrance metadata).

**Monetization.** Freemium with in-app purchases. Specific tier pricing not visible on the standard App Store listing without fetching the IAP modal.

**Acquire-the-perfume path.** Not clearly disclosed in publicly indexed copy. Likely affiliate-link outbound, given the "finder" rather than "retailer" positioning, but unconfirmed.

**Strengths.** 1,147 US ratings at 4.7 — strong velocity for a smaller indie app. AI/discovery angle resonates.

**Weaknesses.** Limited public information about catalog source, image rights, or business model. Solo developer (Hleb Kuznetsov) — sustainability question.

**Reviews dive.** Specific user complaint patterns not surfaced in indexed web reviews — most discussion of "Fragram" hits the App Store reviews page itself ([Ratings & Reviews](https://apps.apple.com/us/app/fragram-perfume-finder/id6447068877?see-all=reviews&platform=iphone)).

---

### 3.4 Sommelier du Parfum

**Core value prop.** AI fragrance advisor. Builds a bespoke recommendation list from 10K+ perfumes by learning your reactions to scents tested in-store; locates nearby retail to test the picks.

**Feature inventory.**
- ✅ Personalized recommendations engine
- ✅ Catalog (~10,000 perfumes)
- ✅ Store locator (nearby stockists)
- ✅ Note/composition education
- ✅ New-release tracking (Dior, Chanel, etc.)
- ❌ Wear log / SOTD
- ❌ Collection management
- ❌ Social feed
- ❌ Reviews/ratings community
- ❌ Cost-per-wear / wrapped

**Catalog size + data quality.** ~10K fragrances. Worked with brands like Prada and Estée Lauder ([LinkedIn company page](https://www.linkedin.com/company/sommelier-du-parfum)).

**Monetization.** Free, "ads-free" per their own marketing. Likely B2B (brand partnerships) given the LinkedIn note about powering Prada/Estée Lauder.

**Acquire-the-perfume path.** **Directs to nearby physical stores** to test. No direct sale, no clear affiliate flow visible in indexed copy.

**Strengths.** 4.9 rating, 654 reviews. Clean "no ads" positioning. Educational tone. Strong brand partnerships behind the scenes.

**Weaknesses.** Latest version is **September 15, 2023 (v2.5.4)** — stale by ~2.5 years. Users report login bugs ([justuseapp.com review aggregator](https://justuseapp.com/en/app/1450650821/sommelier-du-parfum/reviews)). Risk of abandonment.

**Reviews dive.**
- Praise: clean UX, ad-free, smart recommendations
- Complain: login failures, "slow and clunky" — JustUseApp safety score 67.4/100
- Sources: [Basenotes thread](https://basenotes.com/threads/sommelier-du-parfum-a-fragrance-profiling-marketing-app.522394/), [JustUseApp](https://justuseapp.com/en/app/1450650821/sommelier-du-parfum/reviews)

---

### 3.5 PERFUMIST Perfumes Advisor

**Core value prop.** Olfactive profiling app. Build your "olfactory profile" by rating perfumes; app surfaces matches across 50K+ scents from ~2,000 brands.

**Feature inventory.**
- ✅ Olfactory profile (percentages — what you like / don't)
- ✅ Catalog (~50,000 perfumes, ~2,000 brands)
- ✅ Search by notes, brands
- ✅ Custom lists (collection equivalent)
- ✅ Personalized recommendations
- ✅ Community of fragrance enthusiasts
- 🟡 Reviews per fragrance
- ❌ SOTD social feed
- ❌ Wear-frequency tracking (unclear)
- ❌ Cost-per-wear, wrapped, layering

**Catalog size + data quality.** ~50K perfumes, ~2K brands. Top/heart/base notes structured per fragrance.

**Monetization.** Free. Contact email is `contact@perfumist.fr` — French team, B2B brand work likely.

**Acquire-the-perfume path.** Not strongly retailer-integrated. Limited public detail on outbound shopping links.

**Strengths.** Mature (originally launched ~2013 — App ID 631338649 is old). 50K catalog. Profile-as-percentages is a distinctive UX trick.

**Weaknesses.** 4.4 rating (lowest of the top 5). Dated visual design. France-rooted — US discovery and noteworthiness are limited.

**Reviews dive.** Public review threads sparse. App Store reviews are the primary signal.

---

### 3.6 Bonus deep dives (just outside top 5, direct PerfumePicks analogs)

#### Aromoshelf – AI Scent Wardrobe
- Closest social-SOTD competitor. ~287 US ratings, 4.8 stars. Active dev (last update 2 days before research date). 62.6 MB. Free.
- Has: virtual shelves, SOTD posts with community, comments on SOTD, achievements/rewards system, photo upload, AI recs, shopping partner integration in beta.
- Missing: pre-populated notes data (reviewer complaint: users must manually enter notes), AI rec depth is unclear, no wrapped/year-in-review found.
- Per their about page ([aromoshelf.com/about-us](https://aromoshelf.com/about-us)), positioning is shifting from "journaling" to "smart perfume shopping app" with retailer integration — the same business model we're considering.

#### Parfumo
- Closest catalog/wear-tracking competitor. ~280 US ratings, 4.9 stars. Free.
- Has: 223K+ fragrance database, wear tracking, SOTD logging from fragrance page, statistics on usage, "Tested" log, collection management, community reviews.
- Missing: rich discovery filtering (per user complaint that nav for finding/filtering new fragrances is limited), AI recs, wrapped, dedicated social feed (it's more "log it" than "share it"). The app is widely described as a stripped-down companion to the much richer web platform.
- Photo sourcing: **community user uploads** with strict ownership and originality rules ([forum thread on photo rules](https://www.parfumo.com/forums/topic/how-to-propose-a-main-picture-for-fragrances)).
- Monetization not clearly publicly documented; appears to rely on free + community contribution model.

#### Scented.ai – a perfume mentor
- AI-first positioning, natural-language search ("rainy forest walk"), sensory training games, recommendation analytics.
- Pro Weekly $4.99 / Pro Yearly $29.99 (per [App Store listing](https://apps.apple.com/us/app/scented-ai-a-perfume-mentor/id6479217740)).
- Too new to have rating data (0 ratings on App Store as of research date).

#### Sillage — AI Perfume & Fragrance Tracker
- Closest single-app match to our M5 vision: weather-aware AI picks at 7am daily, digital vanity (collection + wishlist + empties), SOTD log, rate longevity/projection/compliments.
- Brand-new (May 4, 2026 update; 1 rating). IAP $5.99–$49.99.
- Direct head-on competitor — worth monitoring weekly.

---

## 4. Synthesized "Best Perfume Picker" Spec

Ranked by user-demand frequency across App Store reviews, Reddit (r/fragrance) threads referenced in our own `FUTURE_PHASE_REQUIREMENTS.md`, and competitor feature inventories. Maximalist — this is the spec to whittle from, not the v1 ship list.

**Tier 1 — Table stakes (every meaningful competitor has at least most of these)**
1. **Comprehensive fragrance database** with notes (top/heart/base), accords, brand, perfumer, year, longevity/sillage data
2. **Catalog search + multi-faceted filter** (brand, note, accord, family, year, gender, price band)
3. **Collection / wardrobe** with status (own / tried / want / sold)
4. **Wear log** with date, optional context (occasion, weather, mood)
5. **SOTD logging** from the fragrance detail page (Parfumo's pattern)
6. **Per-fragrance community reviews** with star ratings on longevity, sillage, overall
7. **Wishlist / "want to try"**
8. **High-quality product images** consistently across catalog
9. **iOS native app, dark mode, no intrusive ads**

**Tier 2 — Strong differentiators (one or two competitors have these)**
10. **Personal taste profile** — top notes/accords/families across the collection (Parfumo's "tracker", PERFUMIST's percentage profile, Aromoshelf's analytics)
11. **AI recommendations from your collection** (Sillage, Sommelier du Parfum, Fragram)
12. **Weather-aware morning pick** (Sillage's 7am daily push)
13. **Occasion-aware picks** (date / office / formal / casual)
14. **SOTD social feed with reactions and comments** (Aromoshelf)
15. **Multi-fragrance day support** (layering / day-to-evening switch) — uncovered by everyone
16. **Private per-user notes** distinct from public reviews — uncovered
17. **Backdating wear entries up to 2 years** — uncovered as a first-class feature
18. **Cost-per-wear** tied to purchase price — uncovered
19. **"Similar in your wardrobe" suggestions on fragrance detail** — partial in some apps
20. **Streaks and badges** for daily logging — uncovered

**Tier 3 — Loud user requests but no competitor ships well**
21. **Year in review / "Perfume Wrapped"** with shareable cards
22. **Layering log** — record a pair + freeform notes on the combo
23. **Empties tracking** with cost-per-wear leader/laggard at end of bottle
24. **Decant / sample marketplace integration** (Scentbird-adjacent but inside a tracker)
25. **Scan-the-bottle to add to wardrobe** (Scentra has it, with quality issues)
26. **Fragrance relationship map / network graph**
27. **Scent twins** — users with overlapping wear history
28. **Compliments log** — record what people said when wearing X
29. **Mood-tagged wears** feeding personalization
30. **Offline-first wear logging** with sync on reconnect
31. **Full export of wear history (CSV / JSON)** — GDPR-style data portability
32. **"What people are wearing today" trending feed** filtered by fragrance / brand / season
33. **Push notification at user-configured time: "What are you wearing today?"**
34. **Verified ownership badge** on community reviews

**Tier 4 — Business-model surface (the question of how the app sustains itself)**
35. **Affiliate retailer links from fragrance detail page** ("Buy from X") with multi-retailer comparison
36. **Direct-sale subscription** (Scentbird's lane — only really works for a single vertically-integrated player)
37. **Premium subscription** gating advanced analytics, AI personalization, wrapped detail, unlimited wardrobe
38. **Ad-free as a paid promise** (Sommelier du Parfum, our F8)
39. **Brand-partner integrations** (Sommelier du Parfum / Prada/Estée Lauder model — B2B revenue)
40. **Privacy-first stance** — no cross-user ad targeting

---

## 5. Decision Table — Our Plan vs. The Spec

References below are to `plans/MILESTONE-PLAN.md` (cited as `MP:LXX`) and `plans/FUTURE_PHASE_REQUIREMENTS.md` (cited as `FPR:Fn`).

| # | Feature (from synthesized spec) | The Best Spec — what users want | PerfumePicks current plan (citation) | Status | Recommendation | Why |
|---|---|---|---|---|---|---|
| 1 | Comprehensive fragrance database | Notes pyramid, accords, brand, perfumer, year | Real catalog seed ≥200 fragrances at launch (`MP:60`), pg_trgm search index (`MP:62`) | ✅ planned | Keep, but expand catalog target to ≥5K before v1 launch | 200 is too small to be credible for an enthusiast app — Aromoshelf reviewers already complain about gaps |
| 2 | Catalog search + multi-facet filter | Brand, note, accord, family, year, price | Search hook exists (`MP:62`); discover/filter UI is implicit but not enumerated | 🟡 partial | Add explicit filter UX work-package to Milestone 2 | Filter quality is a recurring Parfumo complaint we can beat |
| 3 | Collection / wardrobe with status | own / tried / want / sold | `wardrobe_items` table + status; add/edit/remove flow (`MP:89-92`) | ✅ planned | Keep | Already covered |
| 4 | Wear log with context | Date, occasion, weather, mood | `wear_logs` + `LogWearSheet` (`MP:71-77`); spec in `FPR:F1` | ✅ planned | Keep | Strong; matches Parfumo |
| 5 | SOTD logging from fragrance detail | One-tap spray icon | Spray bottle icon on wardrobe cards (`MP:71`) and detail page (`MP:73`) | ✅ planned | Keep | Already covered |
| 6 | Per-fragrance community reviews | Star ratings, longevity, sillage, helpful votes | F7 / `MP:156-161` — full rating dims, ownership badge, report flow | ✅ planned | Keep, but defer to post-MVP per existing prioritization | Reviews need a user base first — chicken/egg |
| 7 | Wishlist / "want to try" | Status='want' on wardrobe | Wardrobe `status='want'` (`MP:152`), "want_to_try" reaction on SOTD adds it | ✅ planned | Keep | Already covered |
| 8 | High-quality product images | Consistent, attribution-clean | Images served from Supabase Storage / CDN (`MP:64`) | 🟡 partial | **Decide source NOW** — licensed API (Fragella / Fragrances of the World) vs. retailer affiliate feed vs. user-upload. See §6 | This is the highest-stakes unresolved decision; product images block catalog launch |
| 9 | iOS native, dark mode, no intrusive ads | React Native / Expo, polished | iOS + Android (`FPR:F8 AC`), no full-page ads (`FPR:F8 AC`) | ✅ planned | Keep | Already covered |
| 10 | Personal taste profile | Top notes/accords/families | M3 Taste Profile screen (`MP:122-127`), F3 spec | ✅ planned | Keep | Already covered |
| 11 | AI recs from your collection | Why this? explanation | F9 / `MP:206-212` — Claude API + collaborative filtering | ✅ planned (M5) | Keep | Long-term moat; M5 timing is realistic |
| 12 | Weather-aware morning pick | Push at user-configured time with daily pick | F9 / `MP:209` "morning recommendation push notification with weather-aware pick" | ✅ planned (M5) | **Consider moving forward to M3-M4** | Sillage already ships this; first-mover here matters; rules-based (no AI) version is buildable on M3 timing |
| 13 | Occasion-aware picks | Date / office / formal / casual | M3 "What should I wear?" (`MP:130-134`), F5 | ✅ planned | Keep | Already covered |
| 14 | SOTD social feed with reactions | Heart/fire/want/interesting + comments | M3 SOTD feed (`MP:145-154`), reactions table, follows | ✅ planned | Keep | Already covered |
| 15 | Multi-fragrance day support | Layering / day-to-evening | M3 explicit support (`MP:149` "Multi-fragrance day: group same-user same-date entries"), per `SOTD-Implementation-Plan.md` §3.2 schema design | ✅ planned | Keep | Differentiator — no competitor handles this well |
| 16 | Private per-user notes | Personal observations distinct from reviews | F6 / M2 Private Notes (`MP:79-81`) | ✅ planned | Keep | MVP scope already |
| 17 | Backdating wear entries (2-yr window) | Date picker | M2 (`MP:74` "Backdating supported via date/time picker (up to 2 years in the past)" — verified via `FPR:F1 AC` line 92) | ✅ planned | Keep | Already covered |
| 18 | Cost-per-wear | Bottle price ÷ wear count | M4 Cost-Per-Wear (`MP:177-180`), purchase_price_cents on wardrobe (`MP:93`) | ✅ planned | Keep | Differentiator — no competitor ships this |
| 19 | "Similar in your wardrobe" | On fragrance detail page | M3 Fragrance Relationship Map (`MP:141-143`) — detail-page version first | ✅ planned | Keep | Smart phased approach |
| 20 | Streaks and badges | 7/30/100/365-day milestones | M4 Streak & Badges (`MP:182-185`) | ✅ planned | Keep | Already covered |
| 21 | Year in review / Perfume Wrapped | Shareable cards, multiple stats | M4 Perfume Wrapped (`MP:169-174`), F10 | ✅ planned | Keep | Already covered; high virality |
| 22 | Layering log | Pair + freeform notes | F6 AC ("Layering log: pair + notes") | ✅ planned | Confirm `wardrobe_items.notes` or a dedicated table supports pairs | Spec exists in FPR but no Milestone line explicitly carries it — small gap to close |
| 23 | Empties tracking + cost-per-wear at empty | Wardrobe status='sold' or 'empty' | Wardrobe status field exists (`MP:42`); cost-per-wear in M4 | 🟡 partial | **Add "empty" as explicit status** and surface cost-per-wear at empty event | Sillage and Aromoshelf both ship "Empties" — popular among collectors |
| 24 | Decant / sample marketplace | Buy a sample of a fragrance | Not in plan | ❌ missing | **Defer** | Scentbird's lane; partnering or affiliate-linking is cleaner than building |
| 25 | Scan-the-bottle to add | Camera → fragrance match | Not in plan | ❌ missing | **Add to M5 backlog** | Scentra has it (poorly); a working version would be a marketing moment, but model quality risk is real |
| 26 | Fragrance relationship map / graph | Full network graph | M5 Fragrance Relationship Map (`MP:214-217`), F4 | ✅ planned | Keep | Already covered |
| 27 | Scent twins | Jaccard similarity on wear history | M4 Scent Twins (`MP:188-191`) | ✅ planned | Keep | Already covered |
| 28 | Compliments log | Record what people said | F6 AC ("record compliments received") | 🟡 partial | Add a dedicated UI surface in M3 | Currently embedded in private notes; deserves first-class entry per `FPR:F6` user story |
| 29 | Mood-tagged wears | Optional mood field feeding AI | M5 AI Personalization (`MP:207` "Mood tagging on wear log entries") | ✅ planned | Keep | Already covered |
| 30 | Offline-first wear logging | Local queue, sync on reconnect | M1 offline queue (`MP:48`), M5 Offline First (`MP:218-220`) | ✅ planned | Keep | Already covered |
| 31 | Full data export (CSV/JSON) | GDPR-style portability | M5 Export (`MP:222-224`) | ✅ planned | Keep | Already covered |
| 32 | Trending feed by fragrance/brand | Top fragrances worn today | M3 "Trending section: top 5 fragrance_id values" per `SOTD-Implementation-Plan.md` §3.3 Sprint 3 | ✅ planned | Keep | Already covered |
| 33 | "What are you wearing today?" daily push | Opt-in, user-configured time | M4 Daily Notification (`MP:186-188`) | ✅ planned | Keep | Already covered |
| 34 | Verified ownership badge | "Owns this" on reviews | F7 AC, M3 (`MP:159` "'Owns this' badge if reviewer has it in wardrobe") | ✅ planned | Keep | Already covered |
| 35 | Affiliate retailer links | "Buy from X" on fragrance detail | Not explicitly in plan | ❌ missing | **Add to M2 or M3** | This is the primary revenue line that doesn't depend on subscription scale. See §6.3 |
| 36 | Direct-sale subscription (Scentbird model) | Build the inventory + ship decants | Not in plan | ❌ missing | **Don't build** | Operational complexity is enormous; doesn't fit a software-only team |
| 37 | Premium subscription | Pro paywall, RevenueCat | M2 Pro / Paywall (`MP:97-100`), F8 implicit | ✅ planned | Keep — and tighten what's gated | Gate AI (M5), advanced analytics (M3/M4), wrapped detail — match Scented.ai's $29.99/yr benchmark |
| 38 | Ad-free as paid promise | No banner/interstitial ads | `FPR:F8 AC` "Zero full-page intrusive ads; monetization via premium subscription only" | ✅ planned | Keep | Differentiator vs. Fragrantica's ad-heavy reputation |
| 39 | Brand-partner integrations | B2B revenue, e.g., Prada-powered quiz | Not in plan | ❌ missing | **Defer to post-PMF** | Sommelier du Parfum's lane; needs scale first |
| 40 | Privacy-first stance | No cross-user ad targeting | `FPR:F9 AC` "all personalization data stored per-user, not used for cross-user ad targeting" | ✅ planned | Keep + market it | Easy story to tell, increasingly meaningful to users |

**Decision-table summary.** Of 40 spec rows: **30 fully planned**, **4 partial (need explicit work-package addition)**, **6 missing**. The missing 6 are: (8) image source decision, (23) explicit "empty" status, (24) decant marketplace (defer), (25) bottle scan (M5 backlog), (35) affiliate retailer links (add to M2/M3), (36) direct-sale subscription (don't build), (39) brand-partner integrations (defer). Of the partials: (2) filter UX, (22) layering log surface, (28) compliments log surface — all small adds.

---

## 6. Product Images & Affiliate Strategy

### 6.1 How competitors source images

| Competitor | Image source | Risk profile |
|---|---|---|
| **Fragrantica** | User-uploaded photos; Fragrantica asserts copyright over uploaded content and runs an active DMCA program ([dmca.phtml](https://www.fragrantica.com/dmca.phtml), [photo copyrights forum thread](https://www.fragrantica.com/board/viewtopic.php?id=270376)) | Scraping is enforced against. Brand C&Ds plausible for raw bottle images. |
| **Parfumo** | Community uploads with strict ownership/originality rules ([photo submission guidelines forum](https://www.parfumo.com/forums/topic/how-to-propose-a-main-picture-for-fragrances), [photos forum](https://www.parfumo.com/forums/topic/post-your-photos-of-your-fragrances-and-collections)) | Lower legal risk than Fragrantica because of stricter ownership policy. |
| **Scentbird** | Their own studio photography of decants | None — they own everything. |
| **FragranceX** | Brand-supplied / studio photography of full bottles | Standard retailer rights. Affiliates get product feed access to these images via CJ. |
| **PERFUMIST, Sommelier du Parfum, Fragram, Aromoshelf** | Likely mix of brand press kits + retailer feeds + some scraping; not publicly documented | Variable. |
| **Sillage (Mustafa Gunes)** | Solo dev; opaque source | High risk if unlicensed scraping. |
| **Fragella API** | "CDN-hosted image URLs for fragrance bottles" + transparent WebP — but image licensing not publicly disclosed on the marketing page | Need to verify license before commercial use. |

**Legal context.** Fragrances themselves are not copyrightable in the US ([Fragrantica column on perfume copyright](https://www.fragrantica.com/news/Perfume-Copyright-15473.html), [boisdejasmin.com](https://boisdejasmin.com/2014/01/copyright-protection-not-for-perfume.html)), but bottle photographs, ad creative, packaging design, and trademarked names are protectable. Aggressive scraping of Fragrantica is a credible source of takedowns; community/user-submitted images with affirmative consent are the cleanest no-cost path, and licensed APIs are the cleanest paid path.

### 6.2 Top fragrance affiliate programs (table)

Sources for each row are cited inline.

| # | Program | Network | Commission | Cookie | Product feed | Image rights to affiliates | Geo | Min payout | Approval |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **FragranceX.com** | CJ Affiliate | 1–10% (up to 12% with perf bonuses) | 45 days | ✅ daily-updated data feed | Confirmed via CJ — standard banner/text creative + product images ([getlasso](https://getlasso.co/affiliate/fragrancex/), [CJ](https://public.cj.com/signup/publisher?advertiserId=1024283), [FlexOffers](https://www.flexoffers.com/affiliate-programs/fragrancex-com-affiliate-program/)) | US-focused | Per CJ defaults (~$50) | Moderate |
| 2 | **FragranceNet.com** | Rakuten Advertising (LinkShare) | 1–5% | Not publicly stated | Marketing materials + banners listed; product feed not explicitly confirmed publicly | Banners/text confirmed; product-feed image rights need confirmation ([affiliate program page](https://www.fragrancenet.com/help/affiliate_program), [getlasso](https://getlasso.co/affiliate/fragrancenet/)) | US-focused | Rakuten defaults | Moderate |
| 3 | **Sephora** | Rakuten Advertising | 5–10% (luxury), some sources say up to 7.2% on the standard tier | **24 hours (very short)** | ✅ access to 200+ brands, 13K+ products via Rakuten feed ([Sephora affiliate page](https://www.sephora.com/beauty/affiliates), [creator-hero.com](https://www.creator-hero.com/blog/sephora-affiliate-program-in-depth-review-pros-and-cons)) | Standard Rakuten product images + banners | US/global | $50 | Selective |
| 4 | **Ulta Beauty** | Impact (historically) | ~2% | 30 days | Yes via Impact | Standard Impact product images | US | $50 | Moderate |
| 5 | **Notino** | CJ Affiliate | ~5% (avg) | Variable (CPS model) | ✅ — Notino markets a "complete data feed of all our products" to affiliates ([Notino affiliate page](https://www.notino.co.uk/affiliate-program/), [getlasso](https://getlasso.co/affiliate/notino/)) | Standard CJ product images + banners | UK/EU strongest; US presence growing | Per CJ | Moderate |
| 6 | **Jomashop** | Awin / CJ | 1–5% | Per network | Yes via network | Standard product images | US/global | Per network | Moderate |
| 7 | **Perfume.com** | Skimlinks, Viglink, FlexOffers, Impact | Not publicly disclosed | Per network | Yes via network | Banner/product images via affiliate networks ([FlexOffers](https://www.flexoffers.com/affiliate-programs/perfume-com-affiliate-program/)) | US | Per network | Moderate |
| 8 | **Perfumania** | CJ | 4% | 15 days (short) | Yes via CJ | Standard CJ | US | $50 | Moderate |
| 9 | **The Perfume Shop** | Awin | ~5% | Per Awin defaults | Yes via Awin | Standard Awin product images | UK only — not US | £/Awin defaults | Moderate |
| 10 | **Amazon Associates — Luxury Beauty** | Amazon | **10%** | 24 hours | ✅ Amazon Product Advertising API (PA-API) — needs throughput minimum | Per Amazon Associates Operating Agreement — narrow display rules, must attribute, can't cache long-term | US | $10 (gift card) / $100 (direct) | Tiered (need first sale ~6 months) |
| 11 | **Scentstore** | Refersion / Direct | ~7.5% (avg) / 2% on codes | 14 days | Yes — regularly updated | Per program | Mostly EU | Per network | Moderate |
| 12 | **Scent Split** | Refersion | 10% | 90 days | Per program | Per program | Decants — niche | Per Refersion | Moderate |

**Other affiliate-friendly data sources (not retailers but image-feed candidates):**
- **Fragella API** — 74K+ fragrances, CDN-hosted bottle JPGs + transparent WebP, includes purchase links per fragrance, notes/accords with confidence levels ([api.fragella.com](https://api.fragella.com/)). Pricing not publicly listed — need a sales conversation. **This is the single best candidate for catalog + image feed if licensing terms work.**
- **Fragrances of the World** by Michael Edwards — 36K+ fragrance database used by retailers ([fragrancesoftheworld.info](https://www.fragrancesoftheworld.info/)). Authoritative but enterprise pricing likely.
- **Kaggle "Perfume E-Commerce Dataset 2024"** — public scraped data, **not commercially safe** for production.

### 6.3 Recommendation for PerfumePicks

**Image strategy — recommended sequence:**
1. **Immediate (M1 catalog seed):** License **Fragella API** or contact **Fragrances of the World** for a commercial licensing conversation. Pick whichever offers the cleanest image-rights terms at a price the project can sustain. Both deliver structured notes, accords, and images. Fragella's transparent-WebP feature is meaningfully useful for our card UI design.
2. **Parallel (M2):** Build a user-submitted-photo capability with explicit ownership/originality terms in the upload flow — Parfumo's model. Award user content with badges / "Photo contributor" status. This is the long-term moat against per-fragrance image cost.
3. **Never:** Scrape Fragrantica. Their DMCA program is active and their terms explicitly assert copyright over uploaded photos.

**Affiliate strategy — recommended sequence for v1 (US-first):**
1. **Primary: FragranceX (CJ).** Best combination of US fragrance focus, mid-tier commission (1–10%, realistic 5–8% blended), 45-day cookie window (long), daily product feed. The product-feed images double as a fallback for our catalog imagery. Apply for CJ approval as soon as the marketing site at `web/` has any meaningful content depth.
2. **Secondary: Sephora (Rakuten).** Higher commission tier on luxury beauty (5–10%), but the 24-hour cookie kills attribution unless the user clicks → buys same day. Use Sephora links specifically on niche/luxury fragrance detail pages where their inventory wins.
3. **Tertiary: Amazon Associates — Luxury Beauty (10%).** Best-in-class commission rate, broadest catalog coverage, 24-hour cookie. The PA-API has restrictive image-caching rules — use Amazon links for "Buy from" CTAs only, not as a catalog image source. Note: Amazon Associates requires a first sale within 180 days of approval to keep the account, which is feasible once the app has any user base.
4. **Defer:** FragranceNet (1–5% is too low), Notino (UK/EU stronger), Jomashop (1–5%), Perfumania (15-day cookie too short).

**Revenue model framing.** Affiliate links from the fragrance detail page should be a **passive** monetization layer alongside the Pro subscription. Pro is the main revenue line (RevenueCat-gated, per `MP:97-100`); affiliate is the "free-tier monetization that isn't ads" answer to `FPR:F8 AC` ("Zero full-page intrusive ads"). Critically, **affiliate links are not the same as direct sales** — we link out, the retailer fulfills, and we earn a commission. This avoids any inventory/operations exposure.

---

## 7. Open Questions / Things We Couldn't Confirm

1. **Exact iOS App Store review counts can drift day to day.** Numbers in §2 are point-in-time from WebFetch on the App Store pages on 2026-05-13. Re-pull before any external citation.
2. **Fragella API and Fragrances of the World commercial pricing** are not publicly listed. Need a sales conversation with each. Worth scoping budget at $200–$2000/mo for a catalog of our target size, but this is a guess until we have quotes.
3. **Fragella image licensing terms** are not publicly visible on their marketing site. Verify in their Terms of Use before integration.
4. **Parfumo's exact premium tier (if any)** wasn't surfaced cleanly. Their public-facing copy implies fully free with community contribution; needs a direct sign-up to confirm whether there's a hidden premium tier.
5. **Fragram, Sommelier du Parfum, PERFUMIST, Sillage** — none of them publish detailed feature inventories or pricing tier breakdowns on their App Store listings. Some assertions here are inferred from marketing copy + app screenshots and should be verified by a hands-on install before strategic decisions are made.
6. **Aromoshelf's "shopping partner integration in beta"** — we don't know which retailers they've partnered with. Worth a competitive watch.
7. **Sephora and Amazon's actual approval bars** for a small fragrance-tracker iOS app are unknown — both networks reject many small applicants. Have FragranceX (CJ) as the surest bet.
8. **The Fragrantica iOS-app status** — they have a PWA wrapper but no native app, per current search results. They've stated they want to ship native; if they do, every dynamic in this analysis shifts.
9. **App-Store-Connect-only metrics (search-term performance, conversion rate, impressions)** are not available to outside research. Once we have a live app, the ASO playbook in CLAUDE.md applies.
10. **Bottle-scan ML accuracy** — Scentra exists, has bad ratings, and users complain it doesn't identify fragrances well. The technical bar for shipping this well is unknown.

---

## 8. Sources

App Store listings (US):
- [Scentbird Perfume Box](https://apps.apple.com/us/app/scentbird-perfume-box/id1444093439)
- [FragranceX.com](https://apps.apple.com/us/app/fragrancex-com/id6471501243)
- [Fragram • Perfume Finder](https://apps.apple.com/us/app/fragram-perfume-finder/id6447068877)
- [Sommelier du Parfum](https://apps.apple.com/us/app/sommelier-du-parfum/id1450650821)
- [PERFUMIST Perfumes Advisor](https://apps.apple.com/us/app/perfumist-perfumes-advisor/id631338649)
- [Parfumo](https://apps.apple.com/us/app/parfumo/id1220565521)
- [Aromoshelf – AI Scent Wardrobe](https://apps.apple.com/us/app/aromoshelf-ai-scent-wardrobe/id1628531505)
- [Scented.ai – a perfume mentor](https://apps.apple.com/us/app/scented-ai-a-perfume-mentor/id6479217740)
- [AI Perfume & Fragrance Tracker (Sillage)](https://apps.apple.com/us/app/ai-perfume-fragrance-tracker/id6758308867)
- [Fragrantica & Product Scanner (ScentSnap, unofficial)](https://apps.apple.com/us/app/fragrantica-product-scanner/id6737468636)
- [Perfume Park - Top Fragrance](https://apps.apple.com/us/app/perfume-park-top-fragrance/id1599235193)

Reviews / community / aggregator sources:
- [Trustpilot — Scentbird](https://www.trustpilot.com/review/scentbird.com)
- [Sitejabber — Scentbird](https://www.sitejabber.com/reviews/scentbird.com)
- [ComplaintsBoard — Scentbird](https://www.complaintsboard.com/scentbird-b136152)
- [FashionBeans review of Scentbird](https://www.fashionbeans.com/article/scentbird-reviews/)
- [Trustpilot — FragranceX](https://www.trustpilot.com/review/www.fragrancex.com)
- [Sitejabber — FragranceX](https://www.sitejabber.com/reviews/fragrancex.com)
- [ResellerRatings — FragranceX](https://www.resellerratings.com/store/FragranceX)
- [BBB — FragranceX](https://www.bbb.org/us/ny/hauppauge/profile/online-retailer/fragrancexcom-inc-0121-7289/complaints)
- [SmartCustomer — FragranceX](https://www.smartcustomer.com/reviews/fragrancex.com)
- [Fragrantica forum — fakes thread](https://beta.fragrantica.com/board/viewtopic.php?id=271617)
- [JustUseApp — Sommelier du Parfum](https://justuseapp.com/en/app/1450650821/sommelier-du-parfum/reviews)
- [Basenotes — Sommelier du Parfum thread](https://basenotes.com/threads/sommelier-du-parfum-a-fragrance-profiling-marketing-app.522394/)
- [Parfumo — "switching from Fragrantica" thread](https://www.parfumo.com/forums/topic/just-made-the-switch-from-fr-grantica)
- [Parfumo — wear tracker forum](https://www.parfumo.com/forums/topic/what-is-your-most-least-worn-fragrance-parfumo-advisor)
- [Parfumo — "Tested" feature thread](https://www.parfumo.com/forums/topic/how-do-you-use-the-tested-feature)
- [Aromoshelf — about us](https://aromoshelf.com/about-us)

Image sourcing / copyright:
- [Fragrantica DMCA Disclaimer](https://www.fragrantica.com/dmca.phtml)
- [Fragrantica — perfume copyright column](https://www.fragrantica.com/news/Perfume-Copyright-15473.html)
- [Fragrantica forum — copyright on uploaded photos](https://www.fragrantica.com/board/viewtopic.php?id=270376)
- [Parfumo forum — how to propose a main picture](https://www.parfumo.com/forums/topic/how-to-propose-a-main-picture-for-fragrances)
- [Parfumo forum — post your photos](https://www.parfumo.com/forums/topic/post-your-photos-of-your-fragrances-and-collections)
- [boisdejasmin — perfume not copyrightable](https://boisdejasmin.com/2014/01/copyright-protection-not-for-perfume.html)

Fragrance data APIs:
- [Fragella API homepage](https://api.fragella.com/)
- [Fragella API playground](https://api.fragella.com/playground.html)
- [Fragella API public roadmap](https://api.fragella.com/roadmap.html)
- [Fragrances of the World](https://www.fragrancesoftheworld.info/)
- [Apify Fragrantica scraper](https://apify.com/lexis-solutions/fragrantica/api)

Affiliate program documentation:
- [FragranceX on CJ](https://public.cj.com/signup/publisher?advertiserId=1024283)
- [FragranceX program detail (Lasso)](https://getlasso.co/affiliate/fragrancex/)
- [FragranceX (FlexOffers)](https://www.flexoffers.com/affiliate-programs/fragrancex-com-affiliate-program/)
- [FragranceNet affiliate program](https://www.fragrancenet.com/help/affiliate_program)
- [FragranceNet program detail (Lasso)](https://getlasso.co/affiliate/fragrancenet/)
- [Sephora Beauty Affiliates](https://www.sephora.com/beauty/affiliates)
- [Sephora affiliate review (Creator Hero)](https://www.creator-hero.com/blog/sephora-affiliate-program-in-depth-review-pros-and-cons)
- [Notino affiliate program](https://www.notino.co.uk/affiliate-program/)
- [Notino program detail (Lasso)](https://getlasso.co/affiliate/notino/)
- [Jomashop affiliate](https://help.jomashop.com/hc/en-us/articles/11923106976027-Affiliate-Program)
- [Perfume.com affiliate (FlexOffers)](https://www.flexoffers.com/affiliate-programs/perfume-com-affiliate-program/)
- [The Perfume Shop affiliates (UK)](https://www.theperfumeshop.com/affiliates)
- [Commission Academy — best fragrance programs 2025](https://commission.academy/blog/best-fragrance-affiliate-programs/)
- [UpPromote — best perfume affiliate programs](https://uppromote.com/affiliate-programs/perfume/)
- [Lasso — 19 best fragrance affiliate programs](https://getlasso.co/niche/fragrance/)
- [Amazon Associates — commission rates 2026 (earnifyhub)](https://earnifyhub.com/blog/affiliate/amazon-associates-commission-rates-all-categories.php)

Internal docs referenced:
- `/Users/bobguillow/PerfumePicks/.claude/worktrees/competent-newton/plans/FUTURE_PHASE_REQUIREMENTS.md`
- `/Users/bobguillow/PerfumePicks/.claude/worktrees/competent-newton/plans/MILESTONE-PLAN.md`
- `/Users/bobguillow/PerfumePicks/.claude/worktrees/competent-newton/plans/SOTD-Implementation-Plan.md`
