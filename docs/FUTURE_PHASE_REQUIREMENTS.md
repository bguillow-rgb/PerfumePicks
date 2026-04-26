# PerfumePicks — Future Phase Feature Requirements

**Document type:** Product requirements / feature roadmap
**Last updated:** 2026-04-25
**Sources:** Competitive analysis (Parfumo, Fragrantica), Reddit r/fragrance user feedback

---

## Table of Contents

1. [Competitive Landscape](#competitive-landscape)
2. [Strategic Positioning](#strategic-positioning)
3. [Feature Specifications](#feature-specifications)
   - [F1 — Spray/Wear Tracking](#f1--spraywear-tracking)
   - [F2 — SOTD Social Feed](#f2--scent-of-the-day-sotd-social-feed)
   - [F3 — Collection Note/Accord Analytics](#f3--collection-noteaccord-analytics)
   - [F4 — Fragrance Relationship Mapping](#f4--fragrance-relationship-mapping)
   - [F5 — Season/Time/Occasion Recommendations](#f5--seasontimeoccasion-based-recommendations)
   - [F6 — Private Notes on Owned Perfumes](#f6--private-notes-on-owned-perfumes)
   - [F7 — Reviews and Ratings](#f7--reviews-and-ratings)
   - [F8 — Mobile-First Native App with Clean UX](#f8--mobile-first-native-app-with-clean-ux)
   - [F9 — AI-Driven Personalization](#f9--ai-driven-personalization)
   - [F10 — Perfume Wrapped Annual Review](#f10--perfume-wrapped-annual-review)
4. [Priority Summary](#priority-summary)
5. [Open Questions](#open-questions)

---

## Competitive Landscape

### Parfumo

| Dimension | Assessment |
|---|---|
| **Strengths** | Best-in-class fragrance data (notes, accords, longevity/sillage ratings); wardrobe/collection management; spray tracking feature; active collector community |
| **Weaknesses** | Overwhelming UX for new users; limited, underdeveloped mobile app; discoverability is difficult for casual users |

### Fragrantica

| Dimension | Assessment |
|---|---|
| **Strengths** | Largest fragrance database in the world; dominant SEO presence; strong user-generated review community; extensive notes/accord taxonomy |
| **Weaknesses** | Extremely dated UI (early 2010s aesthetic); intrusive ads throughout; **no native iOS or Android app**; no AI or personalization features |

### Key Gaps Neither Competitor Addresses

- No contextual AI recommendations (season, time of day, occasion)
- No native mobile app with a modern, clean UX (Fragrantica has none; Parfumo's is minimal)
- No integration of personal analytics with a visual social feed
- No "taste profile" built from collection-wide analysis
- No private per-user notes alongside public community content

---

## Strategic Positioning

> **PerfumePicks is mobile-first, AI-powered, and designed for the Gen Z and Millennial fragrance enthusiast who wants clean UX, personal intelligence, and a social community — in a single app.**

We win on three axes where both competitors are weak:

1. **Mobile experience** — native app, fast, beautiful, designed for the phone
2. **AI & personalization** — recommendations that actually learn from behavior
3. **Social + analytics** — SOTD feed plus personal stats, not just a database

---

## Feature Specifications

---

### F1 — Spray/Wear Tracking

**Priority:** MVP
**Inspiration:** Parfumo's wear log; r/fragrance community requests

#### Overview
Allow users to log every time they wear a fragrance from their collection, building a personal wear history over time.

#### User Stories

- As a collector, I want to tap a spray bottle icon on any fragrance in my collection so that I can quickly log that I'm wearing it today.
- As a user who forgets to log in the moment, I want to backdate a wear entry so that my history stays accurate even when I log after the fact.
- As a user, I want to edit or delete past wear entries so that mistakes don't pollute my history.
- As a user, I want to see a wear count and "last worn" date on each fragrance card so that I can track frequency at a glance.

#### Acceptance Criteria

- [ ] Spray bottle icon visible on each fragrance card in the collection view
- [ ] One-tap logging: tapping the icon creates a wear entry for the current date/time with no additional confirmation required (optional quick-confirm toast with undo)
- [ ] Wear log screen per fragrance shows full chronological history with date, time, and optional note
- [ ] Users can add, edit, or delete any individual wear entry
- [ ] Backdating supported via date/time picker (up to 2 years in the past)
- [ ] Wear count badge visible on fragrance card (e.g. "Worn 14×")
- [ ] "Last worn" label visible on fragrance card or detail screen
- [ ] Wear data feeds into analytics features (F3, F5, F9)

---

### F2 — Scent of the Day (SOTD) Social Feed

**Priority:** Phase 2
**Inspiration:** Reddit r/fragrance daily SOTD threads; Parfumo community; Instagram fragrance community

#### Overview
A photo-forward social feed where users share what they're wearing each day. Combines the community engagement of Reddit's SOTD threads with personal analytics (cost-per-wear, seasonal patterns, yearly Wrapped-style summaries). This is a major competitive differentiator — no existing platform combines a visual social feed with personal fragrance analytics.

#### User Stories

- As a user, I want to post my scent of the day with a photo and optional caption so that I can share my fragrance choices with the community.
- As a user who layers or switches fragrances during the day, I want to add multiple scents to a single SOTD post so that my log accurately reflects how I actually wear fragrance.
- As a user, I want to see what other people in the community are wearing today so that I can discover new fragrances and get inspired.
- As a user, I want to see cost-per-wear calculations on my own wear history so that I can understand the value I'm getting from each bottle.

#### Acceptance Criteria

**Social Feed**
- [ ] Global feed showing recent SOTD posts, photo-forward card layout
- [ ] Post creation: select one or more fragrances from collection (or search database), optionally attach a photo, add a caption
- [ ] Multi-scent support: users can add up to 5 fragrances per SOTD post to represent layering or day-to-evening switches; each fragrance displayed as a chip/tag on the post card
- [ ] Optional context tag per fragrance in the post (e.g. "morning", "layered with", "evening switch") to clarify how/when each was worn
- [ ] Like and comment on posts
- [ ] Follow/unfollow users; following feed and global feed tabs
- [ ] Link from a post (or individual fragrance chip) to the fragrance detail page
- [ ] Fragrance name + house displayed on each post card

**Personal Analytics**
- [ ] Cost-per-wear: user can enter bottle price; app divides by wear count to show $/wear
- [ ] Seasonal wear patterns: bar/line chart showing how wear frequency changes across seasons and months

---

### F3 — Collection Note/Accord Analytics

**Priority:** Phase 2
**Inspiration:** r/fragrance "iOS App for Fragrance Collectors" thread (56 upvotes); Parfumo note data

#### Overview
Analyze a user's entire collection to surface their most common notes, accords, and fragrance families. Build a personal "taste profile" showing what ingredients and families they gravitate toward.

#### User Stories

- As a collector, I want to see which fragrance notes appear most often across my collection so that I understand my own taste preferences.
- As a user, I want a visual "taste profile" showing my top fragrance families and accords so that I can describe my preferences to others.
- As a new collector, I want recommendations based on my taste profile so that I can discover fragrances likely to suit me.

#### Acceptance Criteria

- [ ] "My Taste Profile" screen in the user's profile section
- [ ] Top 10 notes by occurrence across owned fragrances, visualized as a ranked list or bubble chart
- [ ] Top fragrance families/accords (e.g. Woody, Citrus, Oriental) shown as a breakdown
- [ ] Notes breakdown differentiates top/heart/base notes
- [ ] Profile is recalculated when collection changes
- [ ] "Explore more like this" CTA links to fragrance discovery filtered by top notes/families
- [ ] Shareable taste profile card (image export) for social sharing

---

### F4 — Fragrance Relationship Mapping

**Priority:** Roadmap
**Inspiration:** Data visualization; collection analysis

#### Overview
Visualize how fragrances in a user's collection relate to each other through shared notes and accords. Helps users discover patterns in their preferences and understand how their collection clusters.

#### User Stories

- As a collector, I want to see a visual map of how my fragrances relate to each other so that I can understand the structure of my collection.
- As a user, I want to see which of my fragrances share the most notes so that I can identify redundancies or complementary pieces.
- As a user, I want the map to suggest fragrances I might enjoy based on how they connect to fragrances I already own.

#### Acceptance Criteria

- [ ] Interactive graph/network visualization: each node is a fragrance, edges represent shared notes/accords
- [ ] Edge weight reflects degree of overlap (more shared notes = thicker/shorter edge)
- [ ] Nodes are color-coded by fragrance family or accord
- [ ] Tapping a node opens the fragrance detail screen
- [ ] "Missing link" suggestions: fragrances not in the collection that connect strongly to existing pieces
- [ ] Performant with collections up to 200 fragrances
- [ ] Accessible fallback view (list-based) for users who prefer not to use the graph

---

### F5 — Season/Time/Occasion-Based Recommendations

**Priority:** Phase 2
**Inspiration:** Competitive gap — neither Parfumo nor Fragrantica offers contextual recommendations

#### Overview
AI-driven recommendations from the user's own collection (or discovery) based on season, time of day, and occasion. This is the single largest competitive gap in the market — no existing fragrance platform offers contextual AI recommendations.

#### User Stories

- As a user on a summer morning heading to the office, I want the app to suggest the best fragrance from my collection for that context so that I don't have to think about it.
- As a user planning a date night, I want to see which of my fragrances are best suited for the occasion so that I can make a confident choice.
- As a user, I want recommendations to account for the current weather so that the suggested scent suits the conditions.

#### Acceptance Criteria

**Recommendation Engine**
- [ ] "What should I wear?" shortcut on home screen
- [ ] User selects or confirms: season (auto-detected from date), time of day (morning/afternoon/evening/night), occasion (casual, office, date night, formal, outdoor/active)
- [ ] Optional: current weather (auto-fetched via location or manually entered)
- [ ] App returns ranked list of 3–5 fragrances from user's collection with brief reasoning per suggestion (e.g. "Light citrus top notes make this ideal for a warm summer morning")
- [ ] User can mark a suggestion as "worn today" directly from the recommendation screen (triggers F1 wear log)

**Contextual Logic (MVP rules-based, upgraded to AI in F9)**
- [ ] Summer: favor citrus, aquatic, green, light floral families
- [ ] Winter: favor amber, oud, woody, spicy, gourmand families
- [ ] Morning/daytime: favor fresh, clean, light projection
- [ ] Evening/night: favor richer, deeper, higher sillage
- [ ] Office: moderate projection, inoffensive (avoid extremely heavy musks/ouds)
- [ ] Date night: higher sillage, sensual accords (musks, ambers, florals)
- [ ] Formal: classic/timeless compositions

---

### F6 — Private Notes on Owned Perfumes

**Priority:** MVP
**Inspiration:** r/fragrance user requests; gap in all existing platforms

#### Overview
A private, per-user notes section on each fragrance in the collection. Unlike community reviews (which are public and generic), these are personal observations — how a scent performs on the user's skin, compliments received, preferred use cases, layering combinations.

#### User Stories

- As a collector, I want to write private notes about how a fragrance performs on my skin so that I remember what I've observed without publishing a public review.
- As a user, I want to note what occasions or weather conditions I prefer a fragrance for so that I can refer back when deciding what to wear.
- As a user, I want to record compliments I've received when wearing a fragrance so that I can remember which ones land well socially.
- As a layering experimenter, I want to record which fragrances I've layered together and whether I liked the result.

#### Acceptance Criteria

- [ ] Private notes field on each fragrance's detail page (not visible to other users)
- [ ] Rich text or structured fields (user preference): free-text and/or structured tags for occasion, weather, skin performance (longevity, sillage), social reception
- [ ] Notes are searchable from within the user's collection
- [ ] Layering log: ability to record a fragrance pair + freeform notes on the combination
- [ ] Notes are included in user data export (GDPR/privacy)
- [ ] Notes are backed up to user's cloud account (not lost on app reinstall)

---

### F7 — Reviews and Ratings

**Priority:** Phase 2
**Inspiration:** Fragrantica community reviews; cleaner UX

#### Overview
A community-driven reviews and ratings system with a modern UX. Unlike Fragrantica's dense, ad-heavy review pages, PerfumePicks reviews should be clean, mobile-first, and social.

#### User Stories

- As a user, I want to rate a fragrance on key dimensions (longevity, sillage, overall) so that I can contribute to the community's collective knowledge.
- As a shopper, I want to read community reviews before buying so that I get real-world perspectives beyond marketing copy.
- As a reviewer, I want my review to feel personal and attributed, not anonymous, so that I build a reputation in the community.

#### Acceptance Criteria

- [ ] Rating dimensions: Overall (1–5 stars), Longevity (1–5), Sillage (1–5), Value for Money (1–5)
- [ ] Freeform review text (required for full review submission; optional for rating-only)
- [ ] Review linked to reviewer's profile; reviewer's taste profile shown as context
- [ ] Helpful/not helpful upvote on reviews
- [ ] Sort reviews by: most recent, most helpful, most critical
- [ ] Verified ownership badge: if fragrance is in reviewer's collection, show "Owns this" indicator
- [ ] No ads on review pages
- [ ] Moderation: report review option; admin review queue

---

### F8 — Mobile-First Native App with Clean UX

**Priority:** MVP (foundational)
**Inspiration:** Key differentiator vs. Fragrantica (web-only) and Parfumo (limited mobile)

#### Overview
The entire PerfumePicks experience is designed from the ground up for mobile, targeting Gen Z and Millennial fragrance enthusiasts. A clean, modern aesthetic with fast performance is a non-negotiable differentiator.

#### Principles

- **Mobile-first:** Every screen designed for portrait mobile before any other viewport
- **Fast:** Target <2s cold start; <100ms interaction response for common actions
- **Clean:** Minimal chrome, generous whitespace, strong typography hierarchy
- **Accessible:** WCAG 2.1 AA compliance; dynamic type support on iOS
- **Consistent:** Design system with a shared component library; no bespoke one-off screens

#### Acceptance Criteria

- [ ] Native iOS app (React Native / Expo) published to App Store
- [ ] Native Android app published to Google Play
- [ ] App cold start < 2 seconds on a 3-year-old mid-range device
- [ ] Offline-first for collection browsing (cached data available without network)
- [ ] Push notifications for: social interactions (likes, comments), SOTD reminders (opt-in), wear reminders (opt-in)
- [ ] Dark mode support
- [ ] Dynamic type / accessibility text size support on iOS
- [ ] Zero full-page intrusive ads; monetization via premium subscription only

---

### F9 — AI-Driven Personalization

**Priority:** Roadmap (builds on F1, F2, F5 data foundations)
**Inspiration:** Competitive gap — neither Parfumo nor Fragrantica has real AI

#### Overview
True machine-learning personalization that learns from a user's wear history, stated preferences, mood, weather, and occasion to make increasingly accurate recommendations over time. This is the long-term moat — it gets better the more the app is used.

#### User Stories

- As a long-term user, I want the app's recommendations to get noticeably smarter over time so that I feel like it actually knows my taste.
- As a user, I want to log my mood alongside wear entries so that the AI can learn which scents I reach for in different emotional states.
- As a user, I want to receive proactive suggestions in the morning (e.g. "It's going to be warm today — here's what we think you'll want to wear") so that I engage with my collection more actively.

#### Acceptance Criteria

- [ ] Mood tagging on wear log entries (optional): happy, relaxed, confident, romantic, focused, etc.
- [ ] Weather-aware recommendations: app fetches local weather forecast and factors temperature/humidity into suggestions
- [ ] Collaborative filtering: surface fragrances loved by users with similar taste profiles
- [ ] Cold-start handling: rules-based recommendations (F5) until sufficient wear history exists (threshold: ~20 wear log entries)
- [ ] Model retrains on user data periodically; user can see "Based on your recent wears" explanations
- [ ] Morning recommendation push notification (opt-in): sent at user-configured time with top suggestion for the day
- [ ] "Explain this recommendation" transparency: users can see why a fragrance was suggested
- [ ] Privacy-first: all personalization data stored per-user, not used for cross-user ad targeting

---

### F10 — Perfume Wrapped Annual Review

**Priority:** Phase 2
**Inspiration:** Spotify Wrapped; Reddit r/fragrance user requests; ties directly into F1 wear tracking and F2 SOTD data

#### Overview
A Spotify Wrapped-style year-end summary that turns a user's wear history, collection activity, and social data into a shareable, visually engaging annual review. Explicitly requested by Reddit r/fragrance users. Depends on F1 (wear tracking) for data; optionally enriched by F2 (SOTD), F3 (note analytics), and F5 (occasion/season data).

#### User Stories

- As a user at year-end, I want a personalized summary of my fragrance year so that I can reflect on my habits and share my highlights with the community.
- As a collector, I want to see which fragrance I wore most and which I barely touched so that I can make informed decisions about my collection.
- As a user, I want my Wrapped to be shareable as a visual card so that I can post it to my SOTD feed or share it outside the app.
- As a user with cost-per-wear data, I want to see which bottle gave me the best value this year so that I feel good about my purchases.

#### Acceptance Criteria

**Stats Included in Wrapped**
- [ ] Most worn fragrance of the year (by wear count), with total wears and a % of all wears
- [ ] Top 5 fragrances by wear count, presented as a ranked list
- [ ] Total sprays/wears logged across the year
- [ ] Favorite notes and accords of the year (derived from wear-weighted note frequency, not just collection ownership)
- [ ] Seasonal breakdown: which season had the most wears; top fragrance per season
- [ ] Cost-per-wear leader: the fragrance with the lowest $/wear among bottles with a price entered
- [ ] Most expensive wear: fragrance with the highest cost-per-wear
- [ ] New additions: how many fragrances were added to the collection this year; which new addition was worn most
- [ ] Wear streaks: longest consecutive-day streak of logging a wear
- [ ] "Sleeper pick": a fragrance that was added early in the year but only discovered/worn heavily later

**Presentation & Sharing**
- [ ] Wrapped is generated automatically in December (available from December 1) for any user with at least 10 wear log entries in the calendar year
- [ ] Presented as a swipeable card sequence (story/slideshow format), one stat per screen, with branded visuals
- [ ] Each card is exportable as a static image for sharing to SOTD feed, Instagram, etc.
- [ ] Full Wrapped summary also available as a scrollable recap screen for reference throughout the following year
- [ ] Users receive a push notification when their Wrapped is ready (opt-in)
- [ ] Users with insufficient data (<10 wears) see a prompt to start tracking rather than an empty state

---

## Priority Summary

| Feature | Priority | Rationale |
|---|---|---|
| F8 — Mobile-First Native App | **MVP** | Foundational; without this, nothing else works |
| F6 — Private Notes | **MVP** | Low complexity, high user value, fills obvious gap |
| F1 — Spray/Wear Tracking | **MVP** | Core engagement loop; enables all analytics features |
| F3 — Note/Accord Analytics | **Phase 2** | Requires collection data; high user demand from Reddit |
| F5 — Season/Time/Occasion Recs | **Phase 2** | Largest competitive gap; rules-based version is buildable pre-AI |
| F7 — Reviews & Ratings | **Phase 2** | Community flywheel; requires user base first |
| F2 — SOTD Social Feed | **Phase 2** | High-impact differentiator; requires user base and wear tracking |
| F10 — Perfume Wrapped | **Phase 2** | High shareability/retention driver; requires a full year of F1 wear data |
| F4 — Fragrance Relationship Map | **Roadmap** | Compelling but complex; depends on rich collection data |
| F9 — AI-Driven Personalization | **Roadmap** | Requires significant wear history data; long-term moat |

### Definition of Phases

- **MVP** — Required for a meaningful v1 launch. Core loop: collect → track → discover.
- **Phase 2** — Post-launch, once there is a user base generating data and feedback. Focus on social, analytics, and initial recommendations.
- **Roadmap** — Longer-term differentiation. Requires scale (data volume, engineering investment) to execute well.

---

## Open Questions

1. **Data source for fragrance notes/accords** — Are we scraping, licensing, or building our own database? The quality of F3, F4, F5, and F9 depends heavily on note/accord data accuracy.
2. **Cost-per-wear pricing data** — Do users manually enter purchase prices, or do we integrate with a pricing API/marketplace?
3. **SOTD moderation** — What is the content moderation strategy for the social feed (F2)? User-reporting only, or proactive moderation?
4. **AI model hosting** — For F9, are we using a hosted LLM API (e.g. Claude) or training/fine-tuning a smaller on-device model?
5. **Monetization model** — Which features are free vs. premium? Likely candidates for premium: AI recommendations (F9), advanced analytics (F3, F4), SOTD feed (F2).
6. **Privacy/GDPR** — Wear history and mood data are personal. What is the data retention policy and user deletion flow?
