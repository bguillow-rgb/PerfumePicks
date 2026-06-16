# Perfume Picks — Competitive Benchmark

**Date:** 2026-06-07
**Perfume Picks data:** first-hand, from the running current build (38 screenshots, 10 Maestro flows).
**Competitor data:** App Store / web research (apps not installable in this simulator session). Treated as lower-confidence than the hands-on Perfume Picks data — see sources at bottom.

Two very different competitors:
- **Fragrantica** — the dominant *fragrance database & community*. Web-first; the mobile app is a companion to a massive crowd-sourced encyclopedia. Monetized by ads/traffic, not subscription.
- **Scentbird** — a *fragrance subscription commerce* app. The app exists to build a monthly sample queue from **their** ~900–1,000-scent catalog. Monetized by the $17.95/mo subscription.

Perfume Picks sits between them: a personal **taste + wardrobe + discovery** app over an open (affiliate) catalog, with a Pro subscription for depth — not locked to a sample box, not a community encyclopedia.

---

## Feature matrix

| Dimension | Perfume Picks | Fragrantica | Scentbird |
|---|---|---|---|
| **Taste personalization** | Strong: 5-Q free quiz (10 on Pro) + swipe-based "Train My Nose" that learns notes/accords; top-accord surfaced on Profile ("citrus"). | Weak: database-driven; you self-navigate. No real taste model. | Moderate: onboarding quiz seeds a recommended queue; refined by post-delivery ratings — but oriented to *their* catalog. |
| **Wardrobe / collection tracking** | Strong & open: Have/Want/Tried states, wear logging, any fragrance (free cap 20). | Partial: you can mark "I have / I had / I want" on profiles; list-style, not a designed wardrobe. | Closed: a *queue* of their catalog + what they shipped you — not an open collection of what you actually own. |
| **Scan / identify by photo** | Yes — "Perfume Concierge" AI photo identify (10/day free). Differentiator vs both. | No. | No. |
| **Dupe / cheaper-alternative finder** | Yes — a headline Pro feature ("find cheaper alternatives that smell just as good"). *(Not exercised live this run; surfaced in paywall + detail.)* | No (community sometimes discusses dupes in reviews, not a feature). | No — opposed to their model (they sell designer samples). |
| **Onboarding (first 60s)** | Fast, no forced signup: lands on Home, quiz is one tap, swipe training is immediate. Guest-first. | Slow/encyclopedic; built for browsing, not a guided start. | Quiz-then-signup-then-pay; the funnel is built to convert to subscription quickly. |
| **Search UX** | Clean native search w/ fuzzy match ("Savage"→Sauvage), accord chips, real "No matches" empty state. Minor: first tap on a result dismisses keyboard. | Powerful database search (the gold standard for breadth) but a dated, web-wrapper feel on mobile. | Search scoped to their catalog only. |
| **Fragrance detail depth** | Strong & elegant: notes, accords, identity, EDP/year, performance dots, narrative description, affiliate buy link. Less crowd data than Fragrantica. | Deepest *data/community*: pyramid, hundreds of reviews, longevity/sillage voting, photos. Unmatched on breadth. | Shallow: marketing blurb + basic notes for catalog items. |
| **Community / social** | Weakest area: "Community SOTD" rail exists but is **currently non-functional** (see BUG-1). No reviews/voting. | Strongest: the entire product is community — reviews, forums, voting, news. | Light: ratings/reviews feed their rec engine; some social proof, no real forum. |
| **Free tier generosity** | Generous: full browse, wardrobe (20), 10 swipes/day, 10 scans/day, 5-Q quiz — all free; Pro removes caps + adds dupes/insights. | Effectively all-free (ad-supported); no paywall on content. | Not free: it's a paid subscription box; the app is a storefront. |
| **iOS design quality** | High — cohesive cream/gold editorial system, serif+cursive, native feel. Among the nicer fragrance apps. | Low-moderate — functional but web-wrapper, dated mobile UI. | Moderate-high — clean commerce UI, but conventional. |

---

## Honest read

**Where Perfume Picks genuinely wins**
- **iOS-native polish** — clearly ahead of Fragrantica's web-wrapper feel, on par with or above Scentbird's commerce UI.
- **Scan-to-identify** — neither competitor has it; a real "wow" demo.
- **Open wardrobe + taste model in one app** — Fragrantica has data but no taste engine; Scentbird has a queue but it's locked to their catalog. Perfume Picks combines an open collection with a learned taste profile.
- **Dupe finder** as a paid hook is differentiated (assuming it works — verify live before leaning on it in marketing).
- **Guest-first, generous free tier** lowers the trial barrier vs Scentbird's pay-wall.

**Where Perfume Picks loses / is exposed**
- **Community & review depth** — Fragrantica is a category of its own here, and Perfume Picks' one social surface (Community SOTD) is currently broken. This is the biggest honest gap. Don't market "community" until BUG-1 is fixed.
- **Database breadth & crowd data** — Fragrantica has years of reviews, note pyramids, and longevity/sillage votes per fragrance. Perfume Picks' detail is prettier but thinner on crowd-sourced signal.
- **Brand trust / catalog** — Scentbird has a known brand and a try-before-buy model. Perfume Picks monetizes via affiliate links + Pro, which is lighter-touch but lacks Scentbird's "get the actual juice" value prop.

**Strategic takeaway:** Lead marketing with **scan + taste personalization + beautiful native wardrobe**, not community. Treat Fragrantica as the reference users *also* keep open for deep reviews, and Scentbird as the thing users graduate from when they want to track scents they actually own rather than rent.

---

## Sources
- [How to Develop an App Like Fragrantica — Idea Usher](https://ideausher.com/blog/develop-an-app-like-fragrantica-perfumes/)
- [Best Fragrance Finder App 2026 — Scentra](https://perfumeidentifier.com/blog/best-fragrance-finder-app/)
- [Scentbird Perfume Subscription Plans](https://www.scentbird.com/blog/perfume-subscription/)
- [Scentbird Reviews 2026 — FashionBeans](https://www.fashionbeans.com/article/scentbird-reviews/)
- [Scentbird Monthly Perfume Box — Google Play](https://play.google.com/store/apps/details?id=com.scentbird&hl=en_US)

*Competitor cells are best-effort from public sources, not hands-on testing this session; re-validate by installing both apps on a device before using this matrix in any external-facing material.*
