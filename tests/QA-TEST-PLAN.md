# PerfumePicks QA Test Plan

**Version:** 1.0
**Last updated:** 2026-05-15
**Coverage:** Features F1-F10, all screens, all sheets, all cross-cutting concerns
**Platform:** React Native / Expo (iOS + Android)

---

## Table of Contents

1. [F1 — Spray/Wear Tracking](#f1--spraywear-tracking)
2. [F2 — SOTD Social Feed](#f2--sotd-social-feed)
3. [F3 — Collection Note/Accord Analytics](#f3--collection-noteaccord-analytics)
4. [F4 — Fragrance Relationship Mapping](#f4--fragrance-relationship-mapping)
5. [F5 — Season/Time/Occasion Recommendations](#f5--seasontimeoccasion-recommendations)
6. [F6 — Private Notes on Owned Perfumes](#f6--private-notes-on-owned-perfumes)
7. [F7 — Reviews and Ratings](#f7--reviews-and-ratings)
8. [F8 — Mobile-First Native App](#f8--mobile-first-native-app)
9. [F9 — AI-Driven Personalization](#f9--ai-driven-personalization)
10. [F10 — Perfume Wrapped Annual Review](#f10--perfume-wrapped-annual-review)
11. [Screen: Home/Today Tab](#screen-hometoday-tab)
12. [Screen: Discover Tab](#screen-discover-tab)
13. [Screen: Train Tab](#screen-train-tab)
14. [Screen: Wardrobe Tab](#screen-wardrobe-tab)
15. [Screen: Profile Tab](#screen-profile-tab)
16. [Screen: Fragrance Detail](#screen-fragrance-detail)
17. [Screen: Auth/Login](#screen-authlogin)
18. [Screen: Paywall](#screen-paywall)
19. [Screen: Scan](#screen-scan)
20. [Screen: SOTD Feed](#screen-sotd-feed)
21. [Screen: Rec Results](#screen-rec-results)
22. [Screen: Quiz](#screen-quiz)
23. [Screen: Brand Page](#screen-brand-page)
24. [Screen: User Profile (Public)](#screen-user-profile-public)
25. [Screen: Taste Profile](#screen-taste-profile)
26. [Screen: Wrapped](#screen-wrapped)
27. [Sheets: AddToWardrobe](#sheet-addtowardrobe)
28. [Sheets: LogWear](#sheet-logwear)
29. [Sheets: FragranceNotes](#sheet-fragrancenotes)
30. [Sheets: WhatToWear](#sheet-whattowear)
31. [Sheets: DiscoverFilter](#sheet-discoverfilter)
32. [Cross-Cutting: Auth States](#cross-cutting-auth-states)
33. [Cross-Cutting: Sync and Data Integrity](#cross-cutting-sync-and-data-integrity)
34. [Cross-Cutting: Free Tier Limits](#cross-cutting-free-tier-limits)
35. [Cross-Cutting: Pro Gating](#cross-cutting-pro-gating)
36. [Cross-Cutting: Network Failure and Offline](#cross-cutting-network-failure-and-offline)
37. [Cross-Cutting: Deep Linking](#cross-cutting-deep-linking)
38. [Cross-Cutting: RevenueCat](#cross-cutting-revenuecat)
39. [Cross-Cutting: Accessibility](#cross-cutting-accessibility)
40. [Cross-Cutting: Performance](#cross-cutting-performance)
41. [Cross-Cutting: Data Integrity and Cross-Device Sync](#cross-cutting-data-integrity-and-cross-device-sync)

---

## F1 -- Spray/Wear Tracking

### User Stories
- US-001: As a collector, I want to tap a spray bottle icon on any fragrance in my collection so that I can quickly log that I am wearing it today.
- US-002: As a user who forgets to log in the moment, I want to backdate a wear entry so that my history stays accurate even when I log after the fact.
- US-003: As a user, I want to edit or delete past wear entries so that mistakes do not pollute my history.
- US-004: As a user, I want to see a wear count and "last worn" date on each fragrance card so that I can track frequency at a glance.

### Acceptance Criteria
- [ ] AC-001: Spray bottle icon visible on each fragrance card in the collection view
- [ ] AC-002: One-tap logging -- tapping the icon creates a wear entry for the current date/time with no additional confirmation required (optional quick-confirm toast with undo)
- [ ] AC-003: Wear log screen per fragrance shows full chronological history with date, time, and optional note
- [ ] AC-004: Users can add, edit, or delete any individual wear entry
- [ ] AC-005: Backdating supported via date/time picker (up to 2 years in the past)
- [ ] AC-006: Wear count badge visible on fragrance card (e.g. "Worn 14x")
- [ ] AC-007: "Last worn" label visible on fragrance card or detail screen
- [ ] AC-008: Wear data feeds into analytics features (F3, F5, F9)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-001 | Spray icon visibility on wardrobe card | 1. Add a fragrance to wardrobe 2. Navigate to Wardrobe tab 3. Observe fragrance card | Spray bottle icon is visible on each card with status "have" | P0 |
| TC-002 | One-tap wear logging | 1. Navigate to Wardrobe tab 2. Tap spray icon on a fragrance card | Wear entry created with today's date; toast with undo appears; haptic feedback fires | P0 |
| TC-003 | Wear log toast undo | 1. Tap spray icon to log a wear 2. Immediately tap "Undo" on toast | Wear entry is removed; wear count reverts to previous value | P0 |
| TC-004 | Wear log chronological history | 1. Log 3 wears on different dates for the same fragrance 2. Open fragrance detail 3. Scroll to wear history section | All 3 entries shown in reverse chronological order (newest first) with date, time, and note fields | P0 |
| TC-005 | Add wear entry manually | 1. Open fragrance detail 2. Tap "Log Wear" / open LogWear sheet 3. Select today's date 4. Add optional note 5. Confirm | New entry appears in wear history; wear count increments by 1 | P0 |
| TC-006 | Edit existing wear entry | 1. Open wear history for a fragrance 2. Tap edit on an existing entry 3. Change the date and note 4. Save | Entry shows updated date and note; list re-sorts if date changed | P1 |
| TC-007 | Delete wear entry | 1. Open wear history for a fragrance 2. Tap delete on an entry 3. Confirm deletion | Entry is removed from list; wear count decrements by 1 | P0 |
| TC-008 | Backdate wear -- valid range | 1. Open LogWear sheet 2. Open date picker 3. Select a date 2 years in the past 4. Confirm | Entry created with the backdated date; appears in correct chronological position | P0 |
| TC-009 | Backdate wear -- beyond 2 year limit | 1. Open LogWear sheet 2. Attempt to select a date more than 2 years ago | Date picker prevents selection beyond 2-year boundary OR validation error shown | P1 |
| TC-010 | Backdate wear -- future date | 1. Open LogWear sheet 2. Attempt to select a future date | Date picker prevents future date selection OR validation error shown | P1 |
| TC-011 | Wear count badge display | 1. Log wear on a fragrance 5 times 2. Navigate to Wardrobe tab | Card shows "Worn 5x" badge | P0 |
| TC-012 | Wear count badge zero state | 1. Add a fragrance to wardrobe but never log a wear 2. View wardrobe | No wear count badge shown (or shows "Worn 0x" -- verify expected design) | P1 |
| TC-013 | Last worn label display | 1. Log a wear for a fragrance today 2. View fragrance detail | "Last worn" label shows today's date | P0 |
| TC-014 | Last worn label -- multiple wears | 1. Log wears on 3 different dates 2. View fragrance detail | "Last worn" shows the most recent date, not first or oldest | P1 |
| TC-015 | Wear data persistence across app restart | 1. Log several wears 2. Force-close app 3. Reopen app | All wear entries persisted via AsyncStorage; counts and dates correct | P0 |
| TC-016 | Wear data feeds F3 analytics | 1. Log 10+ wears on fragrances with distinct notes 2. Open Taste Profile | Taste profile reflects wear-weighted note frequency, not just collection ownership | P1 |
| TC-017 | Wear data feeds F5 recommendations | 1. Log 20+ wears with occasion tags 2. Open "What should I wear?" | Recommendations reference wear history patterns | P1 |
| TC-018 | Spray icon -- want list item | 1. Add fragrance with status "want" 2. View wardrobe | Spray icon should NOT appear on want-list items (only on "have" items) | P1 |
| TC-019 | Rapid double-tap on spray icon | 1. Quickly double-tap the spray icon on a card | Only one wear entry created (debounce or dedup logic) | P1 |
| TC-020 | Wear log syncs to Supabase | 1. Sign in with a real account 2. Log a wear 3. Check Supabase `wear_logs` table | Row inserted with correct user_id, fragrance_id, worn_on, created_at | P0 |

---

## F2 -- SOTD Social Feed

### User Stories
- US-005: As a user, I want to post my scent of the day with a photo and optional caption so that I can share my fragrance choices with the community.
- US-006: As a user who layers or switches fragrances during the day, I want to add multiple scents to a single SOTD post so that my log accurately reflects how I actually wear fragrance.
- US-007: As a user, I want to see what other people in the community are wearing today so that I can discover new fragrances and get inspired.
- US-008: As a user, I want to see cost-per-wear calculations on my own wear history so that I can understand the value I am getting from each bottle.

### Acceptance Criteria
- [ ] AC-009: Global feed showing recent SOTD posts, photo-forward card layout
- [ ] AC-010: Post creation -- select one or more fragrances from collection (or search database), optionally attach a photo, add a caption
- [ ] AC-011: Multi-scent support -- users can add up to 5 fragrances per SOTD post to represent layering or day-to-evening switches; each fragrance displayed as a chip/tag on the post card
- [ ] AC-012: Optional context tag per fragrance in the post (e.g. "morning", "layered with", "evening switch")
- [ ] AC-013: Like and comment on posts
- [ ] AC-014: Follow/unfollow users; following feed and global feed tabs
- [ ] AC-015: Link from a post (or individual fragrance chip) to the fragrance detail page
- [ ] AC-016: Fragrance name + house displayed on each post card
- [ ] AC-017: Cost-per-wear -- user can enter bottle price; app divides by wear count to show $/wear
- [ ] AC-018: Seasonal wear patterns -- bar/line chart showing how wear frequency changes across seasons and months

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-021 | Global feed loads | 1. Navigate to SOTD Feed 2. Observe Today tab | Feed loads with recent posts; photo-forward card layout; posts show fragrance name + house | P0 |
| TC-022 | Create SOTD post -- single fragrance | 1. Tap create post 2. Search and select one fragrance 3. Add caption 4. Submit | Post appears at top of feed with fragrance chip, caption, and author info | P0 |
| TC-023 | Create SOTD post -- with photo | 1. Tap create post 2. Select fragrance 3. Attach photo from camera roll 4. Submit | Post displays attached photo prominently in card layout | P0 |
| TC-024 | Create SOTD post -- multi-scent (2 fragrances) | 1. Tap create post 2. Select 2 fragrances 3. Submit | Post shows both fragrances as separate chips/tags on the card | P0 |
| TC-025 | Create SOTD post -- max 5 fragrances | 1. Tap create post 2. Select 5 fragrances 3. Attempt to add a 6th | 5 fragrance chips shown; unable to add more than 5 | P1 |
| TC-026 | Context tags per fragrance | 1. Create a multi-scent post 2. Add context tags ("morning", "layered with") to individual fragrances | Tags display next to each fragrance chip in the post | P1 |
| TC-027 | Like a post | 1. View a post in the feed 2. Tap the like button | Like count increments; heart icon fills; state persists on re-visit | P0 |
| TC-028 | Unlike a post | 1. Like a post 2. Tap the like button again | Like count decrements; heart icon unfills | P1 |
| TC-029 | Comment on a post | 1. View a post 2. Tap comment 3. Type a comment 4. Submit | Comment appears under the post with author and timestamp | P0 |
| TC-030 | Follow a user from post | 1. View a post 2. Tap the author's profile/follow button | Follow state toggles; user appears in Following feed | P0 |
| TC-031 | Unfollow a user | 1. Follow a user 2. Tap unfollow | User removed from Following feed; follow count updates | P1 |
| TC-032 | Following feed tab | 1. Follow 2+ users 2. Navigate to SOTD Feed > Following tab | Only posts from followed users appear | P0 |
| TC-033 | Trending tab | 1. Navigate to SOTD Feed > Trending tab | Posts sorted by engagement (likes/comments) in recent timeframe | P1 |
| TC-034 | Tap fragrance chip navigates to detail | 1. View a post with a fragrance chip 2. Tap the fragrance name/chip | Navigates to the fragrance detail screen for that fragrance | P0 |
| TC-035 | Cost-per-wear calculation | 1. Add a fragrance with purchase price $100 2. Log 10 wears | Cost-per-wear shows $10.00/wear on analytics | P0 |
| TC-036 | Cost-per-wear -- no price entered | 1. Add a fragrance without a purchase price 2. View analytics | Cost-per-wear shows "N/A" or prompt to enter price; no division by zero | P1 |
| TC-037 | Cost-per-wear -- zero wears | 1. Add fragrance with price but no wears | Cost-per-wear shows bottle price or "No wears yet"; no division by zero | P1 |
| TC-038 | Seasonal wear patterns chart | 1. Log wears across 4+ months 2. View analytics | Bar/line chart shows wear frequency by month/season; chart is readable | P1 |
| TC-039 | Today/Following/Trending tab switching | 1. Navigate between all 3 tabs | Each tab loads appropriate content; no stale data from previous tab | P0 |
| TC-040 | Empty following feed | 1. Follow nobody 2. Go to Following tab | Empty state with prompt to follow users | P1 |

---

## F3 -- Collection Note/Accord Analytics

### User Stories
- US-009: As a collector, I want to see which fragrance notes appear most often across my collection so that I understand my own taste preferences.
- US-010: As a user, I want a visual "taste profile" showing my top fragrance families and accords so that I can describe my preferences to others.
- US-011: As a new collector, I want recommendations based on my taste profile so that I can discover fragrances likely to suit me.

### Acceptance Criteria
- [ ] AC-019: "My Taste Profile" screen in the user's profile section
- [ ] AC-020: Top 10 notes by occurrence across owned fragrances, visualized as a ranked list or bubble chart
- [ ] AC-021: Top fragrance families/accords shown as a breakdown
- [ ] AC-022: Notes breakdown differentiates top/heart/base notes
- [ ] AC-023: Profile is recalculated when collection changes
- [ ] AC-024: "Explore more like this" CTA links to fragrance discovery filtered by top notes/families
- [ ] AC-025: Shareable taste profile card (image export) for social sharing (deferred -- no react-native-view-shot yet)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-041 | Taste Profile screen accessible | 1. Navigate to Profile tab 2. Tap "My Taste Profile" | Taste Profile screen opens; Pro gate enforced if applicable | P0 |
| TC-042 | Top 10 notes display | 1. Add 5+ fragrances to wardrobe (each with known notes) 2. Open Taste Profile | Top 10 notes shown as ranked list or bubble chart; counts are correct | P0 |
| TC-043 | Fragrance family breakdown | 1. Add fragrances spanning 3+ families 2. Open Taste Profile | Families/accords shown as visual breakdown with correct proportions | P0 |
| TC-044 | Notes pyramid position breakdown | 1. Open Taste Profile with 5+ fragrances | Notes breakdown differentiates top, heart, and base notes into separate sections | P1 |
| TC-045 | Recalculation on collection add | 1. Open Taste Profile and note current top notes 2. Add a new fragrance with unique notes 3. Return to Taste Profile | Profile reflects the newly added fragrance's notes | P0 |
| TC-046 | Recalculation on collection remove | 1. Open Taste Profile 2. Remove a fragrance from wardrobe 3. Return to Taste Profile | Removed fragrance's notes no longer contribute to counts | P1 |
| TC-047 | "Explore more like this" CTA | 1. Open Taste Profile 2. Tap "Explore more like this" | Navigates to Discover with filters pre-set for user's top notes/families | P1 |
| TC-048 | Shareable card -- deferred state | 1. Open Taste Profile 2. Look for share button | Share functionality is either hidden or shows "Coming soon" placeholder (deferred) | P2 |
| TC-049 | Empty collection taste profile | 1. Remove all fragrances from wardrobe 2. Open Taste Profile | Empty state with prompt to add fragrances; no crash or blank screen | P1 |
| TC-050 | Single fragrance taste profile | 1. Have exactly 1 fragrance in wardrobe 2. Open Taste Profile | Profile shows notes from that single fragrance without errors | P1 |
| TC-051 | Wear-weighted vs. collection-weighted | 1. Add 5 fragrances; log 20 wears on one, 1 on others 2. Open Taste Profile | If wear-weighted mode is active, heavily-worn fragrance's notes dominate | P2 |

---

## F4 -- Fragrance Relationship Mapping

### User Stories
- US-012: As a collector, I want to see a visual map of how my fragrances relate to each other so that I can understand the structure of my collection.
- US-013: As a user, I want to see which of my fragrances share the most notes so that I can identify redundancies or complementary pieces.
- US-014: As a user, I want the map to suggest fragrances I might enjoy based on how they connect to fragrances I already own.

### Acceptance Criteria
- [ ] AC-026: Interactive graph/network visualization -- each node is a fragrance, edges represent shared notes/accords
- [ ] AC-027: Edge weight reflects degree of overlap (more shared notes = thicker/shorter edge)
- [ ] AC-028: Nodes are color-coded by fragrance family or accord
- [ ] AC-029: Tapping a node opens the fragrance detail screen
- [ ] AC-030: "Missing link" suggestions -- fragrances not in the collection that connect strongly to existing pieces
- [ ] AC-031: Performant with collections up to 200 fragrances
- [ ] AC-032: Accessible fallback view (list-based) for users who prefer not to use the graph
- [ ] AC-033: "Similar in Your Wardrobe" on detail page uses Jaccard similarity on notes with >= 0.15 threshold

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-052 | Similar in Your Wardrobe -- matches exist | 1. Add 3 fragrances sharing notes (Jaccard >= 0.15) 2. Open detail for one | "Similar in Your Wardrobe" section shows the related fragrances | P0 |
| TC-053 | Similar in Your Wardrobe -- no matches | 1. Add 2 fragrances with no overlapping notes (Jaccard < 0.15) 2. Open detail | "Similar in Your Wardrobe" section hidden or shows empty state | P1 |
| TC-054 | Similar in Your Wardrobe -- threshold boundary | 1. Add fragrances with exactly 0.15 Jaccard overlap 2. Open detail | Fragrance appears in "Similar" section (boundary is inclusive) | P2 |
| TC-055 | Tap similar fragrance navigates | 1. View "Similar in Your Wardrobe" section 2. Tap a similar fragrance | Navigates to that fragrance's detail page | P1 |
| TC-056 | Graph visualization -- basic render (deferred) | 1. Add 5+ fragrances 2. Open relationship map | Graph renders with nodes and edges; no crash | P2 |
| TC-057 | Graph node color coding (deferred) | 1. Open relationship map with fragrances from different families | Nodes color-coded by family; legend visible | P2 |
| TC-058 | Graph edge weight visualization (deferred) | 1. Open relationship map 2. Compare edges between similar vs. dissimilar fragrances | Edges between high-overlap fragrances are thicker/shorter | P2 |
| TC-059 | Graph node tap to detail (deferred) | 1. Open relationship map 2. Tap a node | Fragrance detail opens for that node | P2 |
| TC-060 | Missing link suggestions (deferred) | 1. Open relationship map | "Missing link" fragrances suggested that would bridge gaps in the collection | P2 |
| TC-061 | Graph performance at 200 fragrances (deferred) | 1. Load wardrobe with 200 fragrances 2. Open relationship map | Map renders within 3 seconds; interaction is smooth (>30fps) | P2 |
| TC-062 | Accessible fallback list view (deferred) | 1. Enable accessibility settings 2. Open relationship map | List-based view available as alternative to graph | P2 |

---

## F5 -- Season/Time/Occasion Recommendations

### User Stories
- US-015: As a user on a summer morning heading to the office, I want the app to suggest the best fragrance from my collection for that context so that I do not have to think about it.
- US-016: As a user planning a date night, I want to see which of my fragrances are best suited for the occasion so that I can make a confident choice.
- US-017: As a user, I want recommendations to account for the current weather so that the suggested scent suits the conditions.

### Acceptance Criteria
- [ ] AC-034: "What should I wear?" shortcut on home screen
- [ ] AC-035: User selects or confirms: season (auto-detected from date), time of day (morning/afternoon/evening/night), occasion (casual, office, date night, formal, outdoor/active, evening, travel)
- [ ] AC-036: Optional: current weather (manually entered via 6-option picker: hot-humid, hot-dry, warm, cool, cold, rainy)
- [ ] AC-037: App returns ranked list of 3-5 fragrances from user's collection with brief reasoning per suggestion
- [ ] AC-038: User can mark a suggestion as "worn today" directly from the recommendation screen (triggers F1 wear log)
- [ ] AC-039: Summer rules: favor citrus, aquatic, green, light floral families
- [ ] AC-040: Winter rules: favor amber, oud, woody, spicy, gourmand families
- [ ] AC-041: Morning/daytime rules: favor fresh, clean, light projection
- [ ] AC-042: Evening/night rules: favor richer, deeper, higher sillage
- [ ] AC-043: Office rules: moderate projection, inoffensive
- [ ] AC-044: Date night rules: higher sillage, sensual accords
- [ ] AC-045: Formal rules: classic/timeless compositions
- [ ] AC-046: Rules-based scoring for <20 wears; Claude-powered for >=20 wears

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-063 | "What should I wear?" shortcut on home | 1. Open Home/Today tab 2. Locate the shortcut | "What should I wear?" button/card is visible and tappable | P0 |
| TC-064 | WhatToWear sheet opens | 1. Tap "What should I wear?" | Sheet opens with occasion picker (7 options) and weather picker (6 options) | P0 |
| TC-065 | Occasion picker -- 7 options | 1. Open WhatToWear sheet 2. View occasion options | All 7 occasions available: casual, office, date, evening, formal, workout, travel | P0 |
| TC-066 | Weather picker -- 6 options | 1. Open WhatToWear sheet 2. View weather options | All 6 weather options available: hot-humid, hot-dry, warm, cool, cold, rainy | P0 |
| TC-067 | Recommendation results -- 3-5 fragrances | 1. Select occasion + weather 2. Submit | Returns 3-5 fragrances with brief reasoning per suggestion | P0 |
| TC-068 | Recommendation results -- empty wardrobe | 1. Remove all fragrances 2. Open WhatToWear | Empty state with prompt to add fragrances to wardrobe | P1 |
| TC-069 | "Wear this today" from rec results | 1. Get recommendations 2. Tap "Wear this today" on a suggestion | Wear log entry created for that fragrance; navigates or confirms via toast | P0 |
| TC-070 | Summer scoring rules | 1. Set season to summer 2. Have wardrobe with citrus and oud fragrances | Citrus/aquatic/green fragrances ranked higher than heavy oud/amber | P1 |
| TC-071 | Winter scoring rules | 1. Set season to winter 2. Have wardrobe with fresh and gourmand fragrances | Amber/oud/woody/gourmand fragrances ranked higher than fresh/citrus | P1 |
| TC-072 | Morning rules | 1. Set time to morning 2. Get recommendations | Fresh, clean, light-projection fragrances ranked higher | P1 |
| TC-073 | Date night rules | 1. Set occasion to "date" 2. Get recommendations | Higher sillage, sensual accord fragrances ranked higher | P1 |
| TC-074 | Office rules | 1. Set occasion to "office" 2. Get recommendations | Moderate projection, inoffensive fragrances ranked higher | P1 |
| TC-075 | Formal rules | 1. Set occasion to "formal" 2. Get recommendations | Classic/timeless compositions ranked higher | P2 |
| TC-076 | Rules-based path (<20 wears) | 1. Have fewer than 20 wear logs total 2. Get recommendations | Recommendations use rules-based scoring; no AI call made | P0 |
| TC-077 | AI-powered path (>=20 wears) | 1. Have 20+ wear logs 2. Get recommendations | Recommendations use Claude-powered reasoning; "Why this?" text present | P1 |
| TC-078 | Season auto-detection | 1. Open WhatToWear in January 2. Observe pre-filled season | Season defaults to winter (Northern Hemisphere) | P2 |

---

## F6 -- Private Notes on Owned Perfumes

### User Stories
- US-018: As a collector, I want to write private notes about how a fragrance performs on my skin so that I remember what I have observed without publishing a public review.
- US-019: As a user, I want to note what occasions or weather conditions I prefer a fragrance for so that I can refer back when deciding what to wear.
- US-020: As a user, I want to record compliments I have received when wearing a fragrance so that I can remember which ones land well socially.
- US-021: As a layering experimenter, I want to record which fragrances I have layered together and whether I liked the result.

### Acceptance Criteria
- [ ] AC-047: Private notes field on each fragrance's detail page (not visible to other users)
- [ ] AC-048: Rich text or structured fields -- free-text and/or structured tags for occasion, weather, skin performance (longevity, sillage), social reception
- [ ] AC-049: Notes are searchable from within the user's collection
- [ ] AC-050: Layering log -- ability to record a fragrance pair + freeform notes on the combination
- [ ] AC-051: Notes are included in user data export (GDPR/privacy)
- [ ] AC-052: Notes are backed up to user's cloud account (not lost on app reinstall)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-079 | Private notes field on detail page | 1. Add fragrance to wardrobe 2. Open fragrance detail 3. Scroll to notes section | Private notes section visible with free-text field | P0 |
| TC-080 | Write and save private note | 1. Open fragrance detail 2. Type in the notes field "Lasts 8 hours on my skin" 3. Tap save/dismiss | Note persists; re-opening the detail shows saved text | P0 |
| TC-081 | Occasion preference tags | 1. Open FragranceNotes sheet 2. Select occasion tags (office, date) 3. Save | Tags persist and display on next visit | P0 |
| TC-082 | Weather preference tags | 1. Open FragranceNotes sheet 2. Select weather tags (warm, cool) 3. Save | Tags persist and display on next visit | P0 |
| TC-083 | Skin performance tags | 1. Open FragranceNotes sheet 2. Select skin performance tags (long-lasting, projects-well) 3. Save | Tags persist and display on next visit | P0 |
| TC-084 | Compliments log -- add entry | 1. Open compliments section 2. Add compliment "You smell amazing" with context "date night" 3. Save | Compliment entry appears in social_notes field | P0 |
| TC-085 | Layering log -- add entry | 1. Open layering section 2. Select paired fragrance 3. Add note "Great combo for summer evenings" 4. Save | Layering entry appears with paired fragrance name and note | P0 |
| TC-086 | Layering log -- remove entry | 1. Have an existing layering entry 2. Tap remove/delete on the entry 3. Confirm | Entry removed from layering logs | P1 |
| TC-087 | Notes searchable from wardrobe | 1. Write a note containing "beach vacation" on a fragrance 2. Go to Wardrobe tab 3. Search "beach vacation" | Fragrance with matching note appears in search results | P0 |
| TC-088 | Notes not visible to other users | 1. User A writes notes on a fragrance 2. User B views the same fragrance detail | User B does not see User A's private notes | P0 |
| TC-089 | Notes persist on app restart | 1. Write notes on a fragrance 2. Force-close app 3. Reopen and check | Notes persisted via AsyncStorage | P0 |
| TC-090 | Notes backup to Supabase | 1. Sign in 2. Write notes 3. Sign out 4. Sign in on different device | Notes sync from Supabase and appear on new device (when sync is wired) | P1 |
| TC-091 | Notes for fragrance not in wardrobe | 1. View a fragrance NOT in wardrobe 2. Check for notes section | Notes section should be hidden or prompt to add to wardrobe first | P1 |
| TC-092 | Multiple occasion tags | 1. Select all 7 occasion tags 2. Save and re-open | All 7 tags persist correctly | P2 |
| TC-093 | Empty notes state | 1. Open notes for a fragrance with no notes written | Empty state shown with placeholder text or prompt | P1 |
| TC-094 | Layering log -- paired fragrance name display | 1. Add layering entry with paired fragrance 2. View layering log | Paired fragrance name displayed (denormalized from store) | P1 |

---

## F7 -- Reviews and Ratings

### User Stories
- US-022: As a user, I want to rate a fragrance on key dimensions (longevity, sillage, overall) so that I can contribute to the community's collective knowledge.
- US-023: As a shopper, I want to read community reviews before buying so that I get real-world perspectives beyond marketing copy.
- US-024: As a reviewer, I want my review to feel personal and attributed so that I build a reputation in the community.

### Acceptance Criteria
- [ ] AC-053: Rating dimensions -- Overall (1-5 stars), Longevity (1-5), Sillage (1-5), Value for Money (1-5)
- [ ] AC-054: Freeform review text (required for full review submission; optional for rating-only)
- [ ] AC-055: Review linked to reviewer's profile; reviewer's taste profile shown as context
- [ ] AC-056: Helpful/not helpful upvote on reviews
- [ ] AC-057: Sort reviews by: most recent, most helpful, most critical
- [ ] AC-058: Verified ownership badge -- if fragrance is in reviewer's collection, show "Owns this" indicator
- [ ] AC-059: No ads on review pages
- [ ] AC-060: Moderation -- report review option; admin review queue
- [ ] AC-061: One review per user per fragrance (enforce uniqueness)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-095 | Submit full review with all ratings | 1. Open fragrance detail 2. Tap "Write Review" 3. Set Overall: 4, Longevity: 5, Sillage: 3, Value: 4 4. Write review text 5. Submit | Review appears in reviews section with all 4 dimensions and text | P0 |
| TC-096 | Rating-only submission (no text) | 1. Set all 4 rating dimensions 2. Leave review text empty 3. Submit | Rating-only review accepted; appears in aggregates | P1 |
| TC-097 | Attempt submit without ratings | 1. Write review text only 2. Attempt submit without setting any ratings | Validation error -- at least Overall rating required | P1 |
| TC-098 | Review linked to profile | 1. Submit a review 2. Tap on the reviewer name | Navigates to reviewer's public profile | P0 |
| TC-099 | Helpful/not helpful voting | 1. View a review 2. Tap "Helpful" | Helpful count increments; user's vote persisted | P0 |
| TC-100 | Cannot vote helpful on own review | 1. Submit a review 2. Attempt to vote helpful on your own review | Vote button disabled or hidden for own reviews | P1 |
| TC-101 | Sort by most recent | 1. View reviews section 2. Select sort "Most Recent" | Reviews ordered by submission date, newest first | P1 |
| TC-102 | Sort by most helpful | 1. View reviews section 2. Select sort "Most Helpful" | Reviews ordered by helpful vote count, highest first | P1 |
| TC-103 | Sort by most critical | 1. View reviews section 2. Select sort "Most Critical" | Reviews ordered by overall rating, lowest first | P2 |
| TC-104 | "Owns this" badge | 1. Add fragrance to wardrobe 2. Submit review for that fragrance | Review displays "Owns this" badge | P0 |
| TC-105 | "Owns this" badge -- not owned | 1. Submit review for a fragrance NOT in wardrobe | Review does NOT display "Owns this" badge | P1 |
| TC-106 | One review per user per fragrance | 1. Submit a review for fragrance X 2. Attempt to submit a second review for fragrance X | Second review prevented; option to edit existing review instead | P0 |
| TC-107 | Report a review | 1. View a review 2. Tap "Report" 3. Select reason 4. Submit | Report submitted; review flagged for moderation | P1 |
| TC-108 | No ads on review page | 1. Open fragrance detail 2. Scroll through reviews section | No ad placements within or between reviews | P0 |
| TC-109 | Star rating component -- half stars | 1. Open rating UI 2. Tap between stars | Ratings are whole numbers only (1-5), no half stars | P2 |
| TC-110 | Review text character limit | 1. Write a very long review (2000+ chars) 2. Submit | Review accepted or truncated with clear limit indication | P2 |

---

## F8 -- Mobile-First Native App

### User Stories
- US-025: As a user, I want a fast, clean, native mobile app so that managing my fragrance collection is enjoyable and effortless.
- US-026: As a user with accessibility needs, I want the app to support dynamic type and screen readers so that I can use all features.

### Acceptance Criteria
- [ ] AC-062: Native iOS app (React Native / Expo) published to App Store
- [ ] AC-063: Native Android app published to Google Play
- [ ] AC-064: App cold start < 2 seconds on a 3-year-old mid-range device
- [ ] AC-065: Offline-first for collection browsing (cached data available without network)
- [ ] AC-066: Push notifications for: social interactions (likes, comments), SOTD reminders (opt-in), wear reminders (opt-in)
- [ ] AC-067: Dark mode support (not yet implemented)
- [ ] AC-068: Dynamic type / accessibility text size support on iOS
- [ ] AC-069: Zero full-page intrusive ads; monetization via premium subscription only
- [ ] AC-070: WCAG 2.1 AA compliance
- [ ] AC-071: 44pt minimum tap targets throughout the app

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-111 | Cold start time iOS | 1. Force-close app 2. Cold launch 3. Time until interactive | App interactive in <2 seconds on iPhone 12 or newer | P0 |
| TC-112 | Cold start time Android | 1. Force-close app 2. Cold launch on mid-range Android 3. Time until interactive | App interactive in <2 seconds on 3-year-old mid-range device | P0 |
| TC-113 | Offline collection browsing | 1. Load wardrobe with fragrances while online 2. Go to airplane mode 3. Open Wardrobe tab | All wardrobe items visible; cards load from cache | P0 |
| TC-114 | Offline -- attempt to add wardrobe item | 1. Go offline 2. Add fragrance to wardrobe | Item added locally; _unsynced flag set; toast warns about sync failure | P0 |
| TC-115 | Push notification -- like received | 1. User B likes User A's post 2. Check User A's notifications | Push notification delivered (when implemented) | P1 |
| TC-116 | Push notification -- SOTD reminder | 1. Enable SOTD reminders in settings 2. Wait for scheduled time | Push notification prompts "What are you wearing today?" | P2 |
| TC-117 | Dark mode -- not yet implemented | 1. Toggle system dark mode 2. Open app | App renders in light mode only (dark mode is deferred); no crash or unreadable text | P1 |
| TC-118 | Dynamic type -- large text | 1. Set iOS system font size to largest 2. Open app | Text scales appropriately; no truncation of critical info; layout does not break | P0 |
| TC-119 | Dynamic type -- small text | 1. Set iOS system font size to smallest 2. Open app | Text is readable; tap targets remain >= 44pt | P1 |
| TC-120 | No intrusive ads | 1. Navigate through all screens | Zero full-page ads; zero interstitial ads; zero banner ads | P0 |
| TC-121 | Tab bar renders on all screens | 1. Navigate to each of the 5 tabs | Tab bar visible with correct icons: Today (sparkles), Discover (search), Train (heart disc), Wardrobe (rose), You (avatar) | P0 |
| TC-122 | Tab haptic feedback | 1. Tap each tab | Light haptic feedback on each tab press | P2 |
| TC-123 | Portrait orientation | 1. Use app in portrait mode | All screens render correctly in portrait | P0 |
| TC-124 | Landscape orientation | 1. Rotate device to landscape | App either locks to portrait or adapts gracefully | P2 |

---

## F9 -- AI-Driven Personalization

### User Stories
- US-027: As a long-term user, I want the app's recommendations to get noticeably smarter over time so that I feel like it actually knows my taste.
- US-028: As a user, I want to log my mood alongside wear entries so that the AI can learn which scents I reach for in different emotional states.
- US-029: As a user, I want to receive proactive suggestions in the morning so that I engage with my collection more actively.

### Acceptance Criteria
- [ ] AC-072: Mood tagging on wear log entries (optional): happy, relaxed, confident, romantic, focused, etc.
- [ ] AC-073: Weather-aware recommendations -- manual picker (6 options); no auto-fetch yet
- [ ] AC-074: Collaborative filtering -- surface fragrances loved by users with similar taste profiles (RPC-based)
- [ ] AC-075: Cold-start handling -- rules-based recommendations until 20 wear log entries
- [ ] AC-076: "Why this?" explanation on recommendation cards (Claude Haiku via proxy)
- [ ] AC-077: Morning pick -- Claude-powered suggestion for users with >= 20 wears
- [ ] AC-078: Bottle scan via Claude Vision (Sonnet) -- camera capture, identify, confirm/reject
- [ ] AC-079: 5-layer cost guards on Edge Function (rate limit, token cap, daily budget, per-user cap, circuit breaker)
- [ ] AC-080: Privacy-first -- all personalization data stored per-user, not used for cross-user ad targeting

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-125 | Mood tagging on wear log | 1. Open LogWear sheet 2. Select a mood tag (e.g. "confident") 3. Save wear | Mood tag persisted on the wear log entry | P1 |
| TC-126 | Mood tagging -- optional | 1. Open LogWear sheet 2. Do NOT select a mood 3. Save wear | Wear saved successfully without mood tag | P0 |
| TC-127 | Weather-aware recs -- manual picker | 1. Open WhatToWear 2. Select weather from 6 options 3. Get recommendations | Recommendations factor in selected weather condition | P0 |
| TC-128 | Collaborative filtering results | 1. Have a taste profile with 20+ swipes 2. View collaborative filtering recs | Fragrances shown that are loved by users with similar profiles; RPC call succeeds | P1 |
| TC-129 | Cold-start -- <20 wears | 1. New user with 0-19 wears 2. Request recommendations | Rules-based recommendations returned; no AI call made | P0 |
| TC-130 | Cold-start -- exactly 20 wears | 1. Log exactly the 20th wear 2. Request recommendations | Claude-powered recommendations now available | P1 |
| TC-131 | "Why this?" explanation | 1. View a recommendation card 2. Tap "Why this?" | AI-generated explanation shown; specific to the fragrance and user profile | P1 |
| TC-132 | "Why this?" -- AI unavailable fallback | 1. Simulate AI proxy failure 2. Tap "Why this?" | Deterministic fallback shown (e.g. "Matches your taste for citrus and fresh fragrances.") | P0 |
| TC-133 | Morning pick -- Pro user with 20+ wears | 1. Be a Pro user with 20+ wears 2. Open app in the morning | Morning pick suggestion card visible on Home screen | P1 |
| TC-134 | Morning pick -- free user or <20 wears | 1. Be a free user 2. Check Home screen | No AI morning pick shown; rules-based daily picks instead | P1 |
| TC-135 | Bottle scan -- capture and identify | 1. Open Scan screen 2. Take photo of a perfume bottle 3. Wait for AI analysis | Result card shows brand, name, confidence tier (exact/likely/guess/unsure) | P0 |
| TC-136 | Bottle scan -- exact match (>= 0.85) | 1. Scan a well-known bottle | Confidence label: "EXACT MATCH"; option to navigate to fragrance detail | P1 |
| TC-137 | Bottle scan -- no match | 1. Scan a non-perfume object | "No match" state shown; option to search manually | P0 |
| TC-138 | Bottle scan -- confirm result | 1. Scan a bottle 2. Get a match 3. Tap "Confirm" | Navigates to fragrance detail page for the matched fragrance | P1 |
| TC-139 | Bottle scan -- reject result | 1. Scan a bottle 2. Get a match 3. Tap "Not this" or reject | Returns to scan ready state or manual search | P1 |
| TC-140 | Cost guards -- rate limit | 1. Make rapid successive AI calls exceeding rate limit | Requests throttled; user sees fallback instead of error | P1 |
| TC-141 | Cost guards -- AI not configured | 1. Run app without Supabase configured 2. Trigger AI feature | Returns fallback: "AI features require sign-in." | P0 |
| TC-142 | Deterministic fallback -- accords present | 1. Trigger "Why this?" for fragrance with top_accords data 2. AI fails | Fallback: "Matches your taste for [accord1] and [accord2] fragrances." | P1 |
| TC-143 | Deterministic fallback -- no accords, has family | 1. Trigger "Why this?" for fragrance with family but no accords 2. AI fails | Fallback: "A [family] fragrance that aligns with your profile." | P2 |
| TC-144 | Deterministic fallback -- no data | 1. Trigger "Why this?" for fragrance with no accords or family 2. AI fails | Fallback: "Selected based on your taste profile." | P2 |

---

## F10 -- Perfume Wrapped Annual Review

### User Stories
- US-030: As a user at year-end, I want a personalized summary of my fragrance year so that I can reflect on my habits and share my highlights with the community.
- US-031: As a collector, I want to see which fragrance I wore most and which I barely touched so that I can make informed decisions about my collection.
- US-032: As a user, I want my Wrapped to be shareable as a visual card so that I can post it to my SOTD feed or share it outside the app.
- US-033: As a user with cost-per-wear data, I want to see which bottle gave me the best value this year so that I feel good about my purchases.

### Acceptance Criteria
- [ ] AC-081: Most worn fragrance of the year (by wear count), with total wears and a % of all wears
- [ ] AC-082: Top 5 fragrances by wear count, presented as a ranked list
- [ ] AC-083: Total sprays/wears logged across the year
- [ ] AC-084: Favorite notes and accords of the year (derived from wear-weighted note frequency)
- [ ] AC-085: Seasonal breakdown -- which season had the most wears; top fragrance per season
- [ ] AC-086: Cost-per-wear leader -- the fragrance with the lowest $/wear among bottles with a price entered
- [ ] AC-087: Most expensive wear -- fragrance with the highest cost-per-wear
- [ ] AC-088: New additions -- how many fragrances were added to the collection this year; which new addition was worn most
- [ ] AC-089: Wear streaks -- longest consecutive-day streak of logging a wear
- [ ] AC-090: "Sleeper pick" -- a fragrance added early in the year but worn heavily later
- [ ] AC-091: Available from December 1 for any user with at least 10 wear log entries in the calendar year
- [ ] AC-092: Presented as a swipeable card sequence (deferred -- currently static grid)
- [ ] AC-093: Each card exportable as static image (deferred -- no react-native-view-shot)
- [ ] AC-094: Full Wrapped summary also available as scrollable recap screen
- [ ] AC-095: Push notification when Wrapped is ready (opt-in)
- [ ] AC-096: Users with <10 wears see a prompt to start tracking rather than empty state
- [ ] AC-097: Pro-gated -- only Pro users can access Wrapped
- [ ] AC-098: Streak counter on home screen
- [ ] AC-099: Badge system (7/30/100/365 day thresholds)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-145 | Wrapped available December 1+ | 1. Set device date to December 1 2. Have 10+ wears in current year 3. Navigate to Wrapped | Wrapped screen accessible and populated | P0 |
| TC-146 | Wrapped unavailable before December 1 | 1. Set device date to November 30 2. Navigate to Wrapped | Wrapped not available; prompt or countdown shown | P1 |
| TC-147 | Wrapped -- insufficient data (<10 wears) | 1. Have fewer than 10 wears 2. Navigate to Wrapped | Prompt to start tracking; no empty/broken stats | P0 |
| TC-148 | Most worn fragrance stat | 1. Log 20 wears on Fragrance A, 5 on B, 3 on C 2. View Wrapped | Fragrance A shown as most worn with count (20) and percentage (71%) | P0 |
| TC-149 | Top 5 fragrances ranked list | 1. Wear 5+ different fragrances 2. View Wrapped | Top 5 shown in ranked order by wear count | P0 |
| TC-150 | Total wears count | 1. Log exactly 50 wears 2. View Wrapped | "50 total wears" displayed | P0 |
| TC-151 | Favorite notes and accords | 1. Wear fragrances with known notes 2. View Wrapped | Notes/accords shown weighted by WEAR frequency, not just collection | P1 |
| TC-152 | Seasonal breakdown | 1. Log wears across all 4 seasons 2. View Wrapped | Season with most wears highlighted; top fragrance per season shown | P1 |
| TC-153 | Cost-per-wear leader | 1. Set prices on 3+ fragrances with different wear counts 2. View Wrapped | Lowest $/wear fragrance highlighted | P1 |
| TC-154 | Most expensive wear | 1. Set prices on fragrances with varying wear counts 2. View Wrapped | Highest $/wear fragrance highlighted | P2 |
| TC-155 | New additions count | 1. Add 3 fragrances during the year 2. View Wrapped | "3 new additions" shown; most-worn new addition highlighted | P1 |
| TC-156 | Wear streak -- longest | 1. Log wears on 7 consecutive days 2. View Wrapped | "7-day streak" shown as longest streak | P1 |
| TC-157 | Sleeper pick | 1. Add fragrance in January, barely wear until October, then wear 10x 2. View Wrapped | Fragrance surfaced as "sleeper pick" | P2 |
| TC-158 | Pro gate enforcement | 1. Be a free user 2. Attempt to access Wrapped | Paywall shown; Wrapped content not accessible | P0 |
| TC-159 | Swipeable cards -- deferred | 1. Open Wrapped | Static grid layout renders (swipeable cards deferred) | P1 |
| TC-160 | Shareable cards -- deferred | 1. Look for share button on Wrapped | Share button hidden or "Coming soon" (react-native-view-shot not available) | P2 |
| TC-161 | Scrollable recap screen | 1. Open Wrapped 2. Scroll through all stats | All stats visible in scrollable layout; no cut-off content | P0 |
| TC-162 | Streak counter on home screen | 1. Log wears on 3 consecutive days 2. Open Home tab | Streak counter shows "3-day streak" | P0 |
| TC-163 | Badge -- 7-day streak | 1. Log wears on 7 consecutive days | Badge "7-Day Streak" awarded; alert shown | P0 |
| TC-164 | Badge -- 30-day streak | 1. Log wears on 30 consecutive days | Badge "30-Day Streak" awarded | P1 |
| TC-165 | Badge -- 100-day streak | 1. Log wears on 100 consecutive days | Badge "100-Day Streak" awarded | P2 |
| TC-166 | Badge -- 365-day streak | 1. Log wears on 365 consecutive days | Badge "365-Day Streak" awarded | P2 |
| TC-167 | Badge -- first wear | 1. Log very first wear ever | "First Wear!" badge awarded; alert shown | P0 |
| TC-168 | Badge -- first review | 1. Submit very first review | "First Review!" badge awarded; alert shown | P1 |
| TC-169 | Badge -- no duplicate awards | 1. Already have 7-day streak badge 2. Log wear on day 8 | No duplicate 7-day badge alert; only new badges awarded | P1 |

---

## Screen: Home/Today Tab

### User Stories
- US-034: As a user, I want to see a personalized home screen with today's picks, recent activity, and quick actions so that I can engage with my collection immediately.

### Acceptance Criteria
- [ ] AC-100: "What should I wear?" shortcut visible and tappable
- [ ] AC-101: Daily picks section (rules-based or AI-powered)
- [ ] AC-102: Recent wear history summary
- [ ] AC-103: Streak counter visible when active
- [ ] AC-104: Morning pick card for Pro users with 20+ wears

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-170 | Home screen loads | 1. Open app 2. Land on Today tab | Home screen renders with all sections; no blank areas | P0 |
| TC-171 | "What should I wear?" shortcut | 1. View Home tab 2. Tap "What should I wear?" | WhatToWear sheet opens | P0 |
| TC-172 | Daily picks -- new user | 1. New user with no swipes or wears 2. View Home tab | Daily picks section shows generic popular fragrances or empty state | P1 |
| TC-173 | Daily picks -- trained user | 1. User with 20+ swipes 2. View Home tab | Daily picks personalized to taste profile | P1 |
| TC-174 | Streak counter displayed | 1. Log wears on 3 consecutive days 2. Open Home tab | Streak counter shows current streak (e.g. "3-day streak") | P0 |
| TC-175 | Streak counter -- no streak | 1. Skip a day after logging wears 2. Open Home tab | Streak counter hidden or shows 0 | P1 |
| TC-176 | Home screen scroll performance | 1. Open Home tab with populated data 2. Scroll up and down rapidly | Smooth scrolling at 60fps; no jank | P1 |
| TC-177 | Home tab icon | 1. View tab bar | Today tab shows sparkles-outline icon | P2 |

---

## Screen: Discover Tab

### User Stories
- US-035: As a user, I want to browse and search the fragrance catalog so that I can find new fragrances to try or add to my wardrobe.
- US-036: As a user, I want to filter by brand, accord, gender, and other criteria so that I can narrow down my search.

### Acceptance Criteria
- [ ] AC-105: Search bar for text search across fragrance names, brands
- [ ] AC-106: Filter pills/sheet for brands, accords, gender, price range
- [ ] AC-107: Celebrity picks section
- [ ] AC-108: Scent twins section
- [ ] AC-109: Collab recs section (for users with sufficient taste data)
- [ ] AC-110: Brand browse grid/list
- [ ] AC-111: Accord browse

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-178 | Discover screen loads | 1. Tap Discover tab | Screen renders with search bar, browse sections | P0 |
| TC-179 | Search by fragrance name | 1. Tap search bar 2. Type "Sauvage" | Results show matching fragrances with that name | P0 |
| TC-180 | Search by brand | 1. Type "Dior" in search | Results show Dior fragrances | P0 |
| TC-181 | Search -- no results | 1. Type "xyznonexistent123" | Empty state shown: "No fragrances found" | P1 |
| TC-182 | Search -- minimum character threshold | 1. Type a single character | Results appear after minimum threshold (e.g. 2+ chars) | P2 |
| TC-183 | Filter sheet opens | 1. Tap filter icon/pill on Discover | DiscoverFilter sheet opens with all filter options | P0 |
| TC-184 | Filter by brand | 1. Open filter 2. Select "Chanel" 3. Apply | Only Chanel fragrances shown in results | P0 |
| TC-185 | Filter by accord | 1. Open filter 2. Select "Woody" 3. Apply | Only fragrances with woody accord shown | P0 |
| TC-186 | Multiple filters combined | 1. Select brand "Dior" AND accord "Fresh" | Only Dior fragrances with fresh accord shown | P1 |
| TC-187 | Clear all filters | 1. Apply filters 2. Tap "Clear All" | All filters reset; full catalog shown | P1 |
| TC-188 | Celebrity picks section | 1. Scroll to Celebrity Picks 2. View celebrity cards | Celebrity associations displayed with photos and fragrance links | P0 |
| TC-189 | Tap celebrity card | 1. Tap a celebrity card | Shows fragrances associated with that celebrity | P1 |
| TC-190 | Scent twins section | 1. Scroll to Scent Twins section | Similar fragrance pairs shown | P1 |
| TC-191 | Collab recs -- sufficient data | 1. Have 20+ swipes 2. View Discover | Collab recs section populated with personalized suggestions | P1 |
| TC-192 | Collab recs -- insufficient data | 1. New user with <20 swipes 2. View Discover | Collab recs section hidden or shows "Swipe more to unlock" | P1 |
| TC-193 | Brand browse | 1. Scroll to brands section 2. Tap a brand | Navigates to Brand page with that brand's fragrances | P0 |
| TC-194 | Discover tab icon | 1. View tab bar | Discover tab shows search-outline icon | P2 |
| TC-195 | Discover scroll performance | 1. Scroll through all sections rapidly | Smooth scrolling; images load progressively | P1 |

---

## Screen: Train Tab

### User Stories
- US-037: As a user, I want to swipe through fragrances to train the app on my preferences so that recommendations improve over time.

### Acceptance Criteria
- [ ] AC-112: Swipe deck with fragrance cards
- [ ] AC-113: Swipe right = love, left = dislike, up = like, down = skip
- [ ] AC-114: Free tier daily limit of 10 swipes
- [ ] AC-115: Pro users get unlimited swipes
- [ ] AC-116: Gender filter to narrow presented fragrances
- [ ] AC-117: Swipe count visible (X of daily limit)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-196 | Train screen loads | 1. Tap Train tab | Swipe deck renders with a fragrance card on top | P0 |
| TC-197 | Swipe right -- love | 1. Swipe a card to the right | Card dismissed; fragrance recorded as "love" in swipe store | P0 |
| TC-198 | Swipe left -- dislike | 1. Swipe a card to the left | Card dismissed; fragrance recorded as "dislike" | P0 |
| TC-199 | Swipe up -- like | 1. Swipe a card upward | Card dismissed; fragrance recorded as "like" | P0 |
| TC-200 | Swipe down -- skip | 1. Swipe a card downward | Card dismissed; fragrance recorded as "skip" | P1 |
| TC-201 | Free tier -- 10 swipe daily limit | 1. Be a free user 2. Swipe 10 times | After 10th swipe, paywall/limit message shown; cannot swipe more | P0 |
| TC-202 | Free tier -- limit resets next day | 1. Hit daily limit 2. Advance device clock to next day 3. Open Train | Swipe limit reset; can swipe 10 more times | P0 |
| TC-203 | Pro user -- unlimited swipes | 1. Be a Pro user 2. Swipe 50 times | No daily limit enforced; can keep swiping | P0 |
| TC-204 | Gender filter | 1. Open Train 2. Toggle gender filter (e.g. "Masculine") | Only masculine fragrances appear in the deck | P1 |
| TC-205 | Swipe count display | 1. Swipe 3 times as free user | Counter shows "3/10" or similar | P1 |
| TC-206 | Re-swipe overwrites previous action | 1. Swipe fragrance A as "love" 2. Encounter fragrance A again (if possible) 3. Swipe as "dislike" | Store updated to "dislike" for fragrance A (most recent action wins) | P1 |
| TC-207 | Empty deck -- all fragrances swiped | 1. Swipe through all available fragrances | End state shown: "You've seen them all!" or similar | P2 |
| TC-208 | Already-swiped fragrances excluded | 1. Swipe 5 fragrances 2. Leave and return to Train | Previously swiped fragrances not shown again (or shown in a separate "re-evaluate" mode) | P1 |
| TC-209 | Train tab icon | 1. View tab bar | Train tab shows elevated heart disc icon (38px champagne circle) | P0 |
| TC-210 | Train tab icon -- active state | 1. Tap Train tab | Disc background changes to champagne-gold with white heart; label margin adjusts | P2 |
| TC-211 | Swipe data syncs to Supabase | 1. Sign in 2. Swipe several fragrances 3. Check `swipe_feedback` table | Rows upserted with correct user_id, fragrance_id, action | P0 |

---

## Screen: Wardrobe Tab

### User Stories
- US-038: As a collector, I want to see all my fragrances organized in my wardrobe so that I can manage my collection.
- US-039: As a user, I want to search and filter my wardrobe so that I can quickly find a specific fragrance.

### Acceptance Criteria
- [ ] AC-118: Collection grid/list view with fragrance cards
- [ ] AC-119: Filter pills by status (have, want, tested, sold_on)
- [ ] AC-120: Search within wardrobe
- [ ] AC-121: Spray button on each "have" card
- [ ] AC-122: Edit wardrobe item (status, size, remaining, notes)
- [ ] AC-123: Delete wardrobe item with confirmation
- [ ] AC-124: Empty state for new users with no collection
- [ ] AC-125: Free tier cap of 20 items

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-212 | Wardrobe screen loads | 1. Tap Wardrobe tab | Collection view renders; all wardrobe items visible | P0 |
| TC-213 | Empty wardrobe state | 1. New user with no fragrances 2. Open Wardrobe | Empty state with illustration and CTA to add fragrances | P0 |
| TC-214 | Filter pill -- "have" | 1. Have items with mixed statuses 2. Tap "Have" filter pill | Only items with status "have" shown | P0 |
| TC-215 | Filter pill -- "want" | 1. Tap "Want" filter pill | Only items with status "want" shown | P0 |
| TC-216 | Filter pill -- "tested" | 1. Tap "Tested" filter pill | Only items with status "tested" shown | P1 |
| TC-217 | Filter pill -- "sold_on" | 1. Tap "Sold On" filter pill | Only items with status "sold_on" shown | P1 |
| TC-218 | Search wardrobe by name | 1. Type fragrance name in search bar | Matching fragrances filtered in real-time | P0 |
| TC-219 | Search wardrobe by notes content | 1. Have a fragrance with private note "beach" 2. Search "beach" | Fragrance with matching private note appears (F6 AC-049) | P1 |
| TC-220 | Spray button on "have" card | 1. View a card with status "have" | Spray bottle icon visible and tappable | P0 |
| TC-221 | Spray button NOT on "want" card | 1. View a card with status "want" | No spray icon visible | P1 |
| TC-222 | Edit wardrobe item | 1. Long-press or tap edit on a card 2. Change status from "have" to "sold_on" 3. Save | Item status updated; re-filters if active filter excludes new status | P0 |
| TC-223 | Edit wardrobe -- size and remaining | 1. Edit a wardrobe item 2. Set size_ml to 100, remaining_ml to 30 3. Save | Values persisted; "running low" indicator may appear (30/100 = 30% > 20%) | P1 |
| TC-224 | Delete wardrobe item | 1. Tap delete on a card 2. Confirm in dialog | Item removed from wardrobe; count decrements | P0 |
| TC-225 | Delete wardrobe -- cancel | 1. Tap delete 2. Cancel in dialog | Item NOT removed; wardrobe unchanged | P1 |
| TC-226 | Free tier -- 20 item cap | 1. Be a free user 2. Add 20 items to wardrobe 3. Attempt to add a 21st | WARDROBE_CAP_HIT returned; paywall shown instead of adding item | P0 |
| TC-227 | Free tier -- cap not hit on edit | 1. Have exactly 20 items 2. Edit an existing item (change status) | Edit succeeds; cap only applies to NEW adds, not updates | P0 |
| TC-228 | Pro user -- unlimited wardrobe | 1. Be a Pro user 2. Add 25+ items | No cap; all items accepted | P0 |
| TC-229 | Wardrobe card -- wear count badge | 1. Log 5 wears on a fragrance 2. View wardrobe | Card shows "Worn 5x" badge | P0 |
| TC-230 | Wardrobe card -- brand display | 1. View wardrobe cards | Brand name visible; not truncated (pipe-stripped) | P0 |
| TC-231 | Wardrobe card -- celebrity subtitle | 1. View card for fragrance with celebrity association | Celebrity subtitle visible beneath fragrance name | P2 |
| TC-232 | Wardrobe tab icon | 1. View tab bar | Wardrobe tab shows rose-outline icon | P2 |
| TC-233 | Running low indicator | 1. Set remaining_ml to 10 on a 100ml bottle (10% = <20%) | "Running low" indicator visible on the card | P1 |
| TC-234 | Deduplicate on re-add | 1. Add fragrance A to wardrobe 2. Attempt to add fragrance A again | Existing entry updated (not duplicated); existing id returned | P0 |

---

## Screen: Profile Tab

### User Stories
- US-040: As a user, I want to view and edit my profile, manage my subscription, and access account actions from one place.

### Acceptance Criteria
- [ ] AC-126: Avatar display (photo or monogram)
- [ ] AC-127: Editable display name and bio
- [ ] AC-128: Pro badge/status indicator
- [ ] AC-129: Badges section showing earned badges
- [ ] AC-130: Account actions: sign out, delete account, manage subscription
- [ ] AC-131: Links to Taste Profile, Wrapped, Privacy, Terms

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-235 | Profile screen loads | 1. Tap Profile (You) tab | Profile screen renders with avatar, name, bio | P0 |
| TC-236 | Avatar -- monogram (no photo) | 1. Have no profile photo set | Champagne monogram shown in blush circle with ring | P0 |
| TC-237 | Avatar -- photo | 1. Upload a profile photo 2. View Profile tab | Photo shown in circular avatar with champagne ring | P0 |
| TC-238 | Avatar -- live update in tab bar | 1. Upload a new profile photo | Tab bar icon updates immediately to show new photo | P1 |
| TC-239 | Edit display name | 1. Tap edit on display name 2. Change name 3. Save | Name updated; reflected across all screens | P0 |
| TC-240 | Edit bio | 1. Tap edit on bio 2. Write bio text 3. Save | Bio persisted and visible on profile | P1 |
| TC-241 | Pro badge visible for Pro users | 1. Be a Pro user 2. View Profile | Pro badge/indicator visible | P0 |
| TC-242 | Pro badge hidden for free users | 1. Be a free user 2. View Profile | No Pro badge; "Upgrade to Pro" link shown instead | P1 |
| TC-243 | Badges section -- earned badges | 1. Earn multiple badges (first wear, 7-day streak) 2. View Profile | Badges section shows all earned badges with labels | P0 |
| TC-244 | Badges section -- no badges | 1. New user with no badges 2. View Profile | Empty state or "Start tracking to earn badges" | P1 |
| TC-245 | Sign out | 1. Tap "Sign Out" 2. Confirm | Session cleared; navigates to login screen; local data handling per policy | P0 |
| TC-246 | Delete account | 1. Tap "Delete Account" 2. Confirm destructive action | Account deleted; all data removed; navigates to login | P0 |
| TC-247 | Link to Taste Profile | 1. Tap "My Taste Profile" row | Navigates to Taste Profile screen | P0 |
| TC-248 | Link to Wrapped | 1. Tap "Wrapped" row | Navigates to Wrapped screen (with Pro/date gating) | P1 |
| TC-249 | Link to Privacy Policy | 1. Tap "Privacy Policy" | Opens privacy policy screen | P1 |
| TC-250 | Link to Terms of Service | 1. Tap "Terms of Service" | Opens terms screen | P1 |
| TC-251 | Profile tab icon -- monogram | 1. View tab bar with no photo set | Circular avatar with cursive monogram in champagne on blush | P0 |
| TC-252 | Profile tab icon -- focused ring | 1. Tap Profile tab | Ring thickness increases (1.5px) and color changes to champagne accent | P2 |

---

## Screen: Fragrance Detail

### User Stories
- US-041: As a user, I want to see comprehensive details about a fragrance including notes, performance, reviews, and personal data so that I can make informed decisions.

### Acceptance Criteria
- [ ] AC-132: Hero section with image, name, brand, concentration
- [ ] AC-133: Notes pyramid (top, heart, base)
- [ ] AC-134: Accords chips
- [ ] AC-135: Performance bars (longevity, sillage, value)
- [ ] AC-136: Community reviews section
- [ ] AC-137: "Similar in Your Wardrobe" section (Jaccard >= 0.15)
- [ ] AC-138: Cheaper alternatives section
- [ ] AC-139: Retailer pricing with affiliate links
- [ ] AC-140: Private notes section (F6, only for owned fragrances)
- [ ] AC-141: Wear history section (F1, only for owned fragrances)
- [ ] AC-142: Layering log section (F6)
- [ ] AC-143: Compliments log section (F6)
- [ ] AC-144: "Add to Wardrobe" CTA if not owned
- [ ] AC-145: "Log Wear" CTA if owned
- [ ] AC-146: Celebrity associations section

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-253 | Detail screen loads from catalog | 1. Tap a fragrance from Discover 2. Wait for detail to load | Hero image, name, brand, concentration all visible | P0 |
| TC-254 | Detail screen loads from wardrobe | 1. Tap a fragrance from Wardrobe tab | Same detail screen; additional owned-fragrance sections visible | P0 |
| TC-255 | Notes pyramid display | 1. Open detail for a fragrance with notes data | Top, heart, and base notes displayed in pyramid layout | P0 |
| TC-256 | Notes pyramid -- missing layer | 1. Open detail for fragrance with missing heart notes data | Pyramid renders gracefully; missing layer shown as empty or "Unknown" | P1 |
| TC-257 | Accord chips display | 1. Open detail for fragrance with accords | Accord chips rendered with correct colors/labels | P0 |
| TC-258 | Performance bars | 1. Open detail for fragrance with performance data | Longevity, sillage, value bars rendered with community averages | P0 |
| TC-259 | Reviews section | 1. Open detail for fragrance with reviews | Reviews shown with star ratings, text, "Owns this" badges | P0 |
| TC-260 | Reviews section -- no reviews | 1. Open detail for fragrance with no reviews | "Be the first to review" prompt | P1 |
| TC-261 | Similar in Your Wardrobe | 1. Have overlapping fragrances in wardrobe (Jaccard >= 0.15) 2. Open detail | "Similar in Your Wardrobe" section shows matches | P0 |
| TC-262 | Cheaper alternatives section | 1. Open detail for a fragrance 2. Scroll to alternatives | Cheaper similar fragrances listed with price comparison | P1 |
| TC-263 | Retailer pricing links | 1. Open detail 2. Scroll to pricing section | Retailer links shown with prices; tapping opens affiliate link | P0 |
| TC-264 | Affiliate link handler | 1. Tap a retailer price link | External browser/app opens with correct affiliate URL | P0 |
| TC-265 | Private notes -- owned fragrance | 1. Open detail for an owned fragrance | Private notes section visible with edit capability | P0 |
| TC-266 | Private notes -- not owned | 1. Open detail for non-owned fragrance | Private notes section hidden or "Add to wardrobe first" | P1 |
| TC-267 | Wear history -- owned fragrance | 1. Open detail for owned fragrance with wears | Wear history section shows chronological entries | P0 |
| TC-268 | Wear history -- no wears | 1. Open detail for owned fragrance with 0 wears | "No wears logged yet" with "Log Wear" CTA | P1 |
| TC-269 | "Add to Wardrobe" CTA | 1. Open detail for non-owned fragrance 2. Tap "Add to Wardrobe" | AddToWardrobe sheet opens | P0 |
| TC-270 | "Log Wear" CTA | 1. Open detail for owned fragrance 2. Tap "Log Wear" | LogWear sheet opens | P0 |
| TC-271 | Celebrity associations section | 1. Open detail for fragrance with celebrity data | "Who Wears This" section shows celebrity names/images | P1 |
| TC-272 | Layering log section | 1. Open detail for owned fragrance 2. View layering section | Layering entries shown; option to add new pairing | P1 |
| TC-273 | Compliments log section | 1. Open detail for owned fragrance 2. View compliments section | Compliment entries shown; option to add new compliment | P1 |
| TC-274 | Detail scroll performance | 1. Open a fully-loaded detail page 2. Scroll through all sections | Smooth scrolling; images lazy-load; no jank | P1 |
| TC-275 | Detail -- deep link with openLogWear | 1. Navigate to detail with ?openLogWear=true param | Detail opens with LogWear sheet auto-opened | P1 |

---

## Screen: Auth/Login

### User Stories
- US-042: As a new user, I want to sign in quickly with Apple, Google, or as a guest so that I can start using the app immediately.

### Acceptance Criteria
- [ ] AC-147: Apple Sign-In button (iOS)
- [ ] AC-148: Google Sign-In button
- [ ] AC-149: Guest/anonymous mode
- [ ] AC-150: returnTo parameter respected after sign-in
- [ ] AC-151: Comped Pro check after successful sign-in

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-276 | Login screen loads | 1. Navigate to auth/login | Login screen renders with Apple and Google buttons | P0 |
| TC-277 | Apple Sign-In -- success | 1. Tap "Continue with Apple" 2. Authenticate via Apple ID | Signed in; redirected to home or returnTo destination | P0 |
| TC-278 | Apple Sign-In -- cancel | 1. Tap "Continue with Apple" 2. Cancel Apple dialog | Returned to login screen; no error; no partial state | P0 |
| TC-279 | Google Sign-In -- success | 1. Tap "Continue with Google" 2. Select Google account | Signed in; redirected to home or returnTo destination | P0 |
| TC-280 | Google Sign-In -- cancel | 1. Tap "Continue with Google" 2. Cancel Google dialog | Returned to login screen; no error | P0 |
| TC-281 | Google Sign-In -- not configured | 1. Run with Google client IDs not set or set to REPLACE_ prefixed values | Google button hidden or disabled gracefully | P1 |
| TC-282 | Guest mode | 1. Continue without signing in (anonymous) | App functional with local-only data; session isAnonymous=true | P0 |
| TC-283 | returnTo parameter | 1. Navigate to login with ?returnTo=/quiz 2. Sign in successfully | Redirected to /quiz after sign-in, not home | P0 |
| TC-284 | Comped Pro check | 1. Sign in with a comped account (in comped_users table) | Pro activated automatically after sign-in | P1 |
| TC-285 | Non-comped user | 1. Sign in with a regular account | Pro NOT activated; remains free tier | P1 |
| TC-286 | Loading state during sign-in | 1. Tap a sign-in button | Loading indicator shown; buttons disabled during auth flow | P1 |
| TC-287 | Network error during sign-in | 1. Go offline 2. Attempt sign-in | Error message shown; user can retry | P1 |

---

## Screen: Paywall

### User Stories
- US-043: As a free user, I want to see what Pro offers and purchase a subscription so that I can unlock premium features.

### Acceptance Criteria
- [ ] AC-152: Plan cards (monthly and yearly) with pricing
- [ ] AC-153: Purchase flow via RevenueCat
- [ ] AC-154: Restore purchases flow
- [ ] AC-155: Loading state while offerings load
- [ ] AC-156: Error state if RevenueCat unavailable (expected in Expo Go)
- [ ] AC-157: Feature list showing what Pro unlocks

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-288 | Paywall screen loads | 1. Navigate to paywall | Plan cards displayed with monthly and yearly pricing | P0 |
| TC-289 | Monthly package displayed | 1. View paywall | Monthly plan card shown with correct price | P0 |
| TC-290 | Yearly package displayed | 1. View paywall | Yearly plan card shown with correct price and savings callout | P0 |
| TC-291 | Purchase monthly -- success | 1. Tap monthly plan 2. Complete purchase via App Store | Pro activated; paywall dismissed; Pro badge visible on profile | P0 |
| TC-292 | Purchase -- user cancels | 1. Tap a plan 2. Cancel in App Store dialog | Returned to paywall; no error; Pro NOT activated | P0 |
| TC-293 | Purchase -- error | 1. Simulate purchase error | Alert shown with error message; user can retry | P1 |
| TC-294 | Restore purchases -- success | 1. Tap "Restore Purchases" 2. Previous subscription found | Pro activated; "Your Pro subscription has been restored" alert | P0 |
| TC-295 | Restore purchases -- nothing found | 1. Tap "Restore Purchases" 2. No prior subscription | "No Purchase Found" alert with clear message | P0 |
| TC-296 | RevenueCat loading state | 1. Open paywall before offerings load | Loading indicator shown; plan cards appear when ready | P1 |
| TC-297 | RevenueCat unavailable (Expo Go) | 1. Run in Expo Go 2. Open paywall | Error state with clear message that purchases require a production build | P0 |
| TC-298 | RevenueCat unavailable -- retry | 1. See error state 2. Tap retry | Load function re-invoked; offerings re-fetched | P1 |
| TC-299 | Feature list | 1. View paywall | List of Pro features visible (unlimited wardrobe, unlimited swipes, full quiz, etc.) | P1 |
| TC-300 | Paywall -- already Pro | 1. Be a Pro user 2. Navigate to paywall | Shows "You're already Pro" or redirects away | P1 |

---

## Screen: Scan

### User Stories
- US-044: As a user, I want to point my camera at a perfume bottle and have the app identify it so that I can quickly look up details.

### Acceptance Criteria
- [ ] AC-158: Camera capture via expo-image-picker
- [ ] AC-159: AI identification via Claude Vision (Sonnet)
- [ ] AC-160: Confidence-tiered result card (exact/likely/guess/unsure)
- [ ] AC-161: Confirm/reject flow
- [ ] AC-162: Navigate to detail on confirm
- [ ] AC-163: Manual search fallback on reject or no match

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-301 | Scan screen -- ready state | 1. Open Scan screen | Camera button/prompt visible; "Perfume Concierge" branding | P0 |
| TC-302 | Camera permission -- granted | 1. Tap capture 2. Grant camera permission | Camera opens; photo taken | P0 |
| TC-303 | Camera permission -- denied | 1. Tap capture 2. Deny camera permission | Alert: "Camera Access Needed" with instruction to enable in Settings | P0 |
| TC-304 | Scanning state -- shimmer | 1. Take a photo 2. Wait for AI analysis | Shimmer/loading animation shown during processing | P1 |
| TC-305 | Result -- exact match (>=0.85) | 1. Scan a recognizable bottle | "EXACT MATCH" label with brand and name; confirm/reject buttons | P0 |
| TC-306 | Result -- likely match (0.70-0.84) | 1. Scan a partially visible bottle | "LIKELY MATCH" label displayed | P1 |
| TC-307 | Result -- best guess (0.50-0.69) | 1. Scan an ambiguous bottle | "BEST GUESS" label displayed | P1 |
| TC-308 | Result -- unsure (<0.50) | 1. Scan a low-confidence object | "UNSURE" label displayed; manual search prominent | P1 |
| TC-309 | Result -- no match at all | 1. Scan a non-perfume object | "No match" state; manual search option | P0 |
| TC-310 | Confirm result | 1. Get a match 2. Tap confirm | Navigates to fragrance detail page for matched fragrance | P0 |
| TC-311 | Reject result | 1. Get a match 2. Tap reject | Returns to ready state or opens manual search | P0 |
| TC-312 | Scan -- AI unavailable | 1. Supabase not configured or proxy down 2. Attempt scan | Graceful error; "AI features require sign-in" or similar fallback | P0 |
| TC-313 | Scan -- image processing | 1. Take photo 2. Observe processing | Image resized/compressed via expo-image-manipulator before sending to API | P2 |
| TC-314 | Scan -- Pro gated | 1. Be a free user 2. Attempt to scan | Paywall shown (BOTTLE_SCAN is Pro feature) | P0 |

---

## Screen: SOTD Feed

### User Stories
- US-045: As a user, I want to browse the social feed with Today, Following, and Trending tabs so that I can see what the community is wearing.

### Acceptance Criteria
- [ ] AC-164: Today tab with chronological posts
- [ ] AC-165: Following tab with posts from followed users
- [ ] AC-166: Trending tab with engagement-sorted posts

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-315 | Feed screen loads | 1. Navigate to SOTD Feed | Feed renders with tab selector: Today / Following / Trending | P0 |
| TC-316 | Today tab -- posts load | 1. Tap Today tab | Recent SOTD posts shown chronologically | P0 |
| TC-317 | Following tab -- posts from followed users | 1. Follow 2+ users 2. Tap Following tab | Only posts from followed users shown | P0 |
| TC-318 | Following tab -- follow nobody | 1. Follow no users 2. Tap Following tab | Empty state: "Follow users to see their posts" | P1 |
| TC-319 | Trending tab | 1. Tap Trending tab | Posts sorted by engagement metrics | P1 |
| TC-320 | Post card -- fragrance name + house | 1. View any post card | Fragrance name and house clearly displayed | P0 |
| TC-321 | Post card -- photo display | 1. View post with photo | Photo prominently displayed in card | P0 |
| TC-322 | Post card -- multi-scent chips | 1. View post with multiple fragrances | Each fragrance shown as a chip/tag | P1 |
| TC-323 | Pull to refresh | 1. Pull down on feed | New posts fetched; feed refreshes | P1 |
| TC-324 | Feed pagination / infinite scroll | 1. Scroll to bottom of feed | More posts loaded; no abrupt end | P1 |

---

## Screen: Rec Results

### User Stories
- US-046: As a user, I want to see my recommendation results with a hero pick and ranked list so that I can choose what to wear.

### Acceptance Criteria
- [ ] AC-167: Hero pick card with top recommendation
- [ ] AC-168: Ranked list of 3-5 recommendations
- [ ] AC-169: AI reasoning text per recommendation (when available)
- [ ] AC-170: "Wear this today" action on each result

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-325 | Rec results screen loads | 1. Complete WhatToWear selection 2. View results | Hero pick card shown at top; ranked list below | P0 |
| TC-326 | Hero pick card | 1. View rec results | Top recommendation displayed prominently with fragrance image and name | P0 |
| TC-327 | Ranked list -- 3-5 items | 1. View rec results | 3-5 fragrances ranked with position numbers | P0 |
| TC-328 | AI reasoning text | 1. View rec results (AI-powered path) | Each recommendation shows AI-generated reasoning | P1 |
| TC-329 | Rules-based reasoning text | 1. View rec results (rules-based path) | Each recommendation shows rules-based reasoning | P0 |
| TC-330 | "Wear this today" | 1. Tap "Wear this today" on a recommendation | Wear log entry created; confirmation toast | P0 |
| TC-331 | Navigate to fragrance detail from result | 1. Tap the fragrance card in results | Navigates to fragrance detail page | P1 |

---

## Screen: Quiz

### User Stories
- US-047: As a new user, I want to take a taste quiz so that the app can learn my preferences quickly.
- US-048: As a Pro user, I want to answer all 9 quiz questions for more precise recommendations.

### Acceptance Criteria
- [ ] AC-171: 3 free questions for all users
- [ ] AC-172: 9 total questions for Pro users
- [ ] AC-173: Paywall intercept after question 3 for free users
- [ ] AC-174: Answers preserved in quiz store so resumption works after upgrade
- [ ] AC-175: Results screen with personalized recommendations

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-332 | Quiz loads | 1. Navigate to /quiz | First question displayed with options | P0 |
| TC-333 | Answer free question 1 | 1. Select an option for Q1 (family) | Q2 loads with animation; answer stored in quiz store | P0 |
| TC-334 | Complete 3 free questions | 1. Answer Q1, Q2, Q3 | Free users see paywall intercept or results with 3-question accuracy | P0 |
| TC-335 | Paywall intercept at Q3 for free users | 1. Be a free user 2. Answer Q3 | Paywall shown; answers preserved; can upgrade and resume from Q4 | P0 |
| TC-336 | Pro user -- all 9 questions | 1. Be a Pro user 2. Start quiz | All 9 questions available; no paywall intercept | P0 |
| TC-337 | Answer preservation across upgrade | 1. Answer Q1-Q3 as free user 2. Subscribe to Pro 3. Return to quiz via returnTo | Quiz resumes from Q4; Q1-Q3 answers preserved | P0 |
| TC-338 | Quiz results screen | 1. Complete all available questions 2. Submit | Results screen shows personalized fragrance recommendations | P0 |
| TC-339 | Quiz -- back navigation | 1. On Q2 2. Navigate back | Returns to Q1 with previous answer still selected | P1 |
| TC-340 | Quiz -- question animation | 1. Answer a question | FadeInRight/FadeOutLeft animation on question transition | P2 |
| TC-341 | Quiz -- haptic feedback on selection | 1. Tap a quiz option | Haptic feedback fires | P2 |
| TC-342 | Pro quiz route (/quiz/pro) | 1. Be a Pro user 2. Navigate to /quiz/pro | Pro-specific quiz flow loads | P1 |
| TC-343 | Quiz results route (/quiz/results) | 1. Complete quiz 2. Observe route | Results screen renders at /quiz/results | P0 |

---

## Screen: Brand Page

### User Stories
- US-049: As a user, I want to see all fragrances from a specific brand on one page so that I can explore a house's lineup.

### Acceptance Criteria
- [ ] AC-176: Brand header with name and fragrance count
- [ ] AC-177: Grid/list of all fragrances from that brand
- [ ] AC-178: Tap fragrance navigates to detail

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-344 | Brand page loads | 1. Navigate to /brand/[name] (e.g. from Discover) | Brand page renders with brand name header and fragrance count | P0 |
| TC-345 | Brand fragrance list | 1. View brand page | All fragrances for that brand displayed | P0 |
| TC-346 | Tap fragrance on brand page | 1. Tap a fragrance card | Navigates to fragrance detail | P0 |
| TC-347 | Brand page -- no fragrances | 1. Navigate to a brand with no catalog entries | Empty state or "No fragrances found" | P2 |
| TC-348 | Brand page -- correct fragrance count | 1. View brand header | Count matches actual number of fragrances listed | P1 |
| TC-349 | Brand page via /discover/brand/[brand] route | 1. Navigate via discover sub-route | Same brand page content renders | P1 |

---

## Screen: User Profile (Public)

### User Stories
- US-050: As a user, I want to view another user's public profile and follow/unfollow them so that I can connect with the community.

### Acceptance Criteria
- [ ] AC-179: Public profile with avatar, name, bio
- [ ] AC-180: Follow/unfollow button
- [ ] AC-181: Public collection stats (fragrance count, wear count)
- [ ] AC-182: Recent SOTD posts by this user

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-350 | Public profile loads | 1. Navigate to /user/[id] | Profile renders with avatar, name, bio | P0 |
| TC-351 | Follow button -- not following | 1. View user you don't follow | "Follow" button visible | P0 |
| TC-352 | Follow -- tap to follow | 1. Tap "Follow" button | Button changes to "Following"; follow count updates | P0 |
| TC-353 | Unfollow -- tap to unfollow | 1. Tap "Following" button | Confirmation; button reverts to "Follow"; count updates | P0 |
| TC-354 | Public collection stats | 1. View a user's public profile | Fragrance count and wear count visible | P1 |
| TC-355 | Recent SOTD posts | 1. View a user's profile | Their recent SOTD posts shown | P1 |
| TC-356 | Own profile vs public profile | 1. Navigate to /user/[own-id] | Redirects to Profile tab or shows edit capabilities | P2 |
| TC-357 | Public profile -- no posts | 1. View profile of user with no SOTD posts | "No posts yet" empty state | P2 |

---

## Screen: Taste Profile

### User Stories
- US-051: As a user, I want to see my full taste profile analysis so that I understand my fragrance preferences.

### Acceptance Criteria
- [ ] AC-183: Taste Profile screen accessible from Profile tab
- [ ] AC-184: Pro-gated (TASTE_PROFILE_SCREEN)
- [ ] AC-185: Top notes, accords, families visualization

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-358 | Taste Profile -- Pro user | 1. Be a Pro user 2. Navigate from Profile to Taste Profile | Screen loads with full taste analysis | P0 |
| TC-359 | Taste Profile -- free user | 1. Be a free user 2. Attempt to open Taste Profile | Paywall shown; content not accessible | P0 |
| TC-360 | Taste Profile content | 1. Open Taste Profile with 10+ fragrances in wardrobe | Top notes, accords, families all visualized | P0 |
| TC-361 | Taste Profile -- empty wardrobe | 1. Have no fragrances 2. Open Taste Profile | "Add fragrances to see your taste profile" empty state | P1 |

---

## Screen: Wrapped

### User Stories
- US-052: As a user, I want to view my annual Perfume Wrapped summary so that I can reflect on my fragrance year.

### Acceptance Criteria
- [ ] AC-186: Wrapped screen accessible from Profile
- [ ] AC-187: Pro-gated (PERFUME_WRAPPED)
- [ ] AC-188: Date-gated (December 1+)
- [ ] AC-189: Data-gated (10+ wears in calendar year)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-362 | Wrapped -- all gates pass | 1. Be Pro 2. Date is December+ 3. Have 10+ wears 4. Open Wrapped | Full Wrapped experience renders with all stats | P0 |
| TC-363 | Wrapped -- not Pro | 1. Be free user 2. Open Wrapped | Paywall shown | P0 |
| TC-364 | Wrapped -- before December | 1. Date is before December 1 2. Open Wrapped | Not available; countdown or "Available in December" message | P1 |
| TC-365 | Wrapped -- insufficient wears | 1. Have <10 wears 2. Open Wrapped | "Start tracking to unlock Wrapped" prompt | P0 |
| TC-366 | Wrapped -- all stats present | 1. Open valid Wrapped | All 10 stat categories present (most worn, top 5, total wears, etc.) | P0 |

---

## Sheet: AddToWardrobe

### User Stories
- US-053: As a user, I want to add a fragrance to my wardrobe with specific details so that I can track my collection accurately.

### Acceptance Criteria
- [ ] AC-190: Status picker (have, want, tested, sold_on)
- [ ] AC-191: Unit type selector (bottle, decant, sample)
- [ ] AC-192: Size and remaining ml inputs
- [ ] AC-193: Optional purchase price and date
- [ ] AC-194: Free tier cap enforcement

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-367 | Sheet opens from detail | 1. Open fragrance detail (not in wardrobe) 2. Tap "Add to Wardrobe" | AddToWardrobe sheet slides up with all fields | P0 |
| TC-368 | Set status to "have" | 1. Select "Have" status 2. Fill remaining fields 3. Save | Item added with status "have"; appears in wardrobe | P0 |
| TC-369 | Set status to "want" | 1. Select "Want" status 2. Save | Item added with status "want"; no spray icon on card | P0 |
| TC-370 | Unit type -- bottle | 1. Select "Bottle" unit type 2. Set size to 100ml 3. Save | Item saved with unit_type "bottle" and size_ml 100 | P0 |
| TC-371 | Unit type -- decant | 1. Select "Decant" 2. Set size to 10ml 3. Save | Item saved with unit_type "decant" | P1 |
| TC-372 | Unit type -- sample | 1. Select "Sample" 2. Set size to 2ml 3. Save | Item saved with unit_type "sample" | P1 |
| TC-373 | Purchase price entry | 1. Enter purchase price $150 2. Save | purchase_price_cents stored as 15000 | P1 |
| TC-374 | Purchase date entry | 1. Select purchase date 2. Save | purchase_date stored in ISO format | P2 |
| TC-375 | Free tier cap hit | 1. Be free user with 20 items 2. Open AddToWardrobe | WARDROBE_CAP_HIT returned; paywall shown | P0 |
| TC-376 | Dismiss sheet without saving | 1. Open sheet 2. Swipe down to dismiss | No item added; wardrobe unchanged | P1 |
| TC-377 | Quick-want heart from Discover | 1. Tap heart on a card in Discover | Fragrance added as "want" status without opening full sheet | P1 |

---

## Sheet: LogWear

### User Stories
- US-054: As a user, I want to log a wear with optional details so that my history is rich and useful.

### Acceptance Criteria
- [ ] AC-195: Date picker (default today, backdate up to 2 years)
- [ ] AC-196: Occasion picker (7 options)
- [ ] AC-197: Weather picker (6 options)
- [ ] AC-198: Rating (0-5)
- [ ] AC-199: "Would wear again" toggle
- [ ] AC-200: Optional note text
- [ ] AC-201: Public/private toggle (is_public for SOTD)
- [ ] AC-202: Optional mood tag (F9)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-378 | LogWear sheet opens | 1. Tap spray icon or "Log Wear" CTA | Sheet opens with date defaulted to today | P0 |
| TC-379 | Log with defaults | 1. Open LogWear 2. Tap save immediately | Wear logged with today's date; all optional fields null | P0 |
| TC-380 | Set occasion | 1. Select "date" occasion 2. Save | Wear entry has occasion="date" | P0 |
| TC-381 | Set weather | 1. Select "warm" weather 2. Save | Wear entry has weather="warm" | P0 |
| TC-382 | Set rating | 1. Select 4 stars 2. Save | Wear entry has rating=4 | P1 |
| TC-383 | "Would wear again" toggle | 1. Toggle "Would wear again" on 2. Save | Wear entry has would_wear_again=true | P1 |
| TC-384 | Add note | 1. Type "Great projection all day" 2. Save | Wear entry has note text saved | P1 |
| TC-385 | Backdate to 6 months ago | 1. Open date picker 2. Select date 6 months ago 3. Save | Wear entry created with backdated date; appears in correct chronological position | P0 |
| TC-386 | Public toggle | 1. Toggle is_public on 2. Save | Wear entry marked as public (visible in SOTD feed) | P1 |
| TC-387 | Mood tag (F9) | 1. Select mood "confident" 2. Save | Mood tag persisted on entry | P1 |
| TC-388 | LogWear via deep link | 1. Navigate with ?openLogWear=true param | LogWear sheet auto-opens on fragrance detail | P1 |

---

## Sheet: FragranceNotes

### User Stories
- US-055: As a user, I want to edit my private notes for a fragrance in a dedicated sheet so that I can organize my observations.

### Acceptance Criteria
- [ ] AC-203: Free-text body field
- [ ] AC-204: Occasion preference tag picker
- [ ] AC-205: Weather preference tag picker
- [ ] AC-206: Skin performance tag picker
- [ ] AC-207: Save persists to FragranceNotesStore

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-389 | FragranceNotes sheet opens | 1. Open fragrance detail for owned fragrance 2. Tap "Edit Notes" | Sheet opens with current notes pre-filled | P0 |
| TC-390 | Edit body text | 1. Type/modify body text 2. Save | Updated body text persisted in store | P0 |
| TC-391 | Select occasion tags | 1. Tap occasion tags (office, casual) 2. Save | Tags saved to occasion_prefs array | P0 |
| TC-392 | Select weather tags | 1. Tap weather tags (warm, cool) 2. Save | Tags saved to weather_prefs array | P0 |
| TC-393 | Select skin performance tags | 1. Tap tags (long-lasting, projects-well) 2. Save | Tags saved to skin_performance array | P0 |
| TC-394 | Deselect tags | 1. Select a tag 2. Tap again to deselect 3. Save | Tag removed from array | P1 |
| TC-395 | Pre-filled on re-open | 1. Save notes 2. Close sheet 3. Re-open | All previously saved data pre-filled | P0 |

---

## Sheet: WhatToWear

### User Stories
- US-056: As a user, I want to quickly select my context and get fragrance recommendations from my wardrobe.

### Acceptance Criteria
- [ ] AC-208: Occasion picker (7 options)
- [ ] AC-209: Weather picker (6 options)
- [ ] AC-210: Submit triggers recommendation engine
- [ ] AC-211: Results navigate to rec/results

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-396 | WhatToWear sheet opens | 1. Tap "What should I wear?" on Home | Sheet opens with occasion and weather pickers | P0 |
| TC-397 | Select occasion and weather | 1. Select "date" occasion 2. Select "warm" weather | Both selections highlighted | P0 |
| TC-398 | Submit with selections | 1. Select context 2. Tap submit | Sheet dismisses; navigates to rec/results with chosen context | P0 |
| TC-399 | Submit without selections | 1. Tap submit without selecting anything | Validation message or default values used | P1 |
| TC-400 | All 7 occasions selectable | 1. Try selecting each of the 7 occasions | Each is tappable and selectable: casual, office, date, evening, formal, workout, travel | P1 |
| TC-401 | All 6 weather options selectable | 1. Try selecting each of the 6 weather options | Each is tappable: hot-humid, hot-dry, warm, cool, cold, rainy | P1 |

---

## Sheet: DiscoverFilter

### User Stories
- US-057: As a user, I want to filter the Discover catalog by various criteria so that I can narrow results.

### Acceptance Criteria
- [ ] AC-212: Brand filter
- [ ] AC-213: Accord filter
- [ ] AC-214: Gender filter
- [ ] AC-215: Apply/clear actions

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-402 | DiscoverFilter sheet opens | 1. Tap filter icon on Discover tab | Sheet opens with brand, accord, gender filters | P0 |
| TC-403 | Select brand filter | 1. Select a brand 2. Apply | Discover results filtered to that brand | P0 |
| TC-404 | Select accord filter | 1. Select an accord 2. Apply | Discover results filtered to that accord | P0 |
| TC-405 | Select gender filter | 1. Select "Masculine" or "Feminine" 2. Apply | Results filtered by gender | P1 |
| TC-406 | Multiple filters | 1. Select brand + accord 2. Apply | Results match BOTH criteria | P1 |
| TC-407 | Clear all filters | 1. Apply filters 2. Open sheet 3. Tap "Clear All" 4. Apply | All filters reset; full catalog shown | P0 |
| TC-408 | Dismiss without applying | 1. Select filters 2. Swipe sheet down without tapping Apply | Previous filter state preserved; no change | P1 |

---

## Cross-Cutting: Auth States

### User Stories
- US-058: As a guest user, I want core features to work locally so that I can try the app before committing to an account.
- US-059: As a signed-in user, I want my data to sync to the cloud so that I do not lose it.
- US-060: As a Pro user, I want premium features unlocked so that I get value from my subscription.

### Acceptance Criteria
- [ ] AC-216: Guest mode -- local-only data, no sync, limited features
- [ ] AC-217: Signed-in free -- cloud sync, free tier limits apply
- [ ] AC-218: Signed-in Pro -- cloud sync, no limits, all features unlocked

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-409 | Guest -- wardrobe works locally | 1. Use app as guest 2. Add fragrances to wardrobe | Wardrobe functional; items persisted locally via AsyncStorage | P0 |
| TC-410 | Guest -- sync writes return ok (demo mode) | 1. Use app as guest 2. Add item (triggers syncWrite) | syncWrite returns ok=true (demo mode); no error toast | P0 |
| TC-411 | Guest -- social features limited | 1. Use app as guest 2. Try to post to SOTD | Prompted to sign in; cannot post as guest | P1 |
| TC-412 | Signed-in -- data syncs | 1. Sign in 2. Add wardrobe item | Item persisted locally AND synced to Supabase | P0 |
| TC-413 | Signed-in free -- limits enforced | 1. Sign in (non-Pro) 2. Hit 20 wardrobe items | Cap enforced at 20; paywall shown on 21st attempt | P0 |
| TC-414 | Signed-in Pro -- no limits | 1. Sign in as Pro 2. Add 25+ wardrobe items | All accepted; no cap | P0 |
| TC-415 | Session state after sign-in | 1. Sign in 2. Check useSessionStore | userId set; isAnonymous=false (or true for guest); email populated | P0 |
| TC-416 | Session state after sign-out | 1. Sign out 2. Check useSessionStore | userId=null; isAnonymous=false; email=null | P0 |
| TC-417 | Pro hydration on app start | 1. Close and reopen app as Pro user | isPro=true rehydrated from AsyncStorage; hasHydrated=true | P0 |
| TC-418 | Pro deactivation on expired subscription | 1. Subscription expires 2. Open paywall (triggers RevenueCat check) | isPro set to false; Pro features re-gated | P1 |

---

## Cross-Cutting: Sync and Data Integrity

### User Stories
- US-061: As a user, I want my data changes to sync reliably to the server so that I do not lose my collection.
- US-062: As a user, I want to be notified when a sync fails so that I know my data may not be backed up.

### Acceptance Criteria
- [ ] AC-219: Local-first writes -- store updates immediately, sync fires as side effect
- [ ] AC-220: _unsynced marking on failed sync writes
- [ ] AC-221: "Couldn't sync" toast on failure with details in dev mode
- [ ] AC-222: Demo mode (no Supabase) -- all syncWrites return ok=true
- [ ] AC-223: User ID stamped on inserts/upserts from auth.getUser()
- [ ] AC-224: Unauthenticated insert rejected (not signed in)

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-419 | Local-first write pattern | 1. Add wardrobe item 2. Observe store state immediately | Item appears in store BEFORE server response | P0 |
| TC-420 | Sync success -- no _unsynced flag | 1. Add item while online and signed in 2. Wait for sync | _unsynced is undefined/false on the item | P0 |
| TC-421 | Sync failure -- _unsynced set | 1. Simulate server error (Supabase down) 2. Add item | Item saved locally; _unsynced=true flag set on the item | P0 |
| TC-422 | Sync failure -- toast shown | 1. Trigger a sync failure | "Couldn't sync" alert shown with "saved locally" message | P0 |
| TC-423 | Sync failure -- dev detail | 1. Run in __DEV__ mode 2. Trigger sync failure | Alert includes server error detail; console.warn fired | P2 |
| TC-424 | Demo mode -- no Supabase | 1. Run without Supabase env vars 2. Add/update/delete items | All syncWrites return ok=true; no error toasts; local-only flow works | P0 |
| TC-425 | User ID on insert | 1. Sign in 2. Add wardrobe item 3. Inspect Supabase row | user_id column matches auth.uid() | P0 |
| TC-426 | Unauthenticated insert rejected | 1. Clear session (no user) 2. Trigger insert via syncWrite | Returns ok=false with "Not signed in" error | P0 |
| TC-427 | Hydration on sign-in | 1. Sign in with account that has server data 2. Observe stores | useAppSync hydrates wardrobe, wear logs, and swipes from server; hydrated=true | P0 |
| TC-428 | Hydration on sign-out | 1. Sign out 2. Observe stores | Stores hydrated with empty arrays; local data cleared | P0 |
| TC-429 | Wardrobe server sync -- update | 1. Edit wardrobe item 2. Check Supabase | Row updated server-side; _unsynced cleared | P1 |
| TC-430 | Wardrobe server sync -- delete | 1. Delete wardrobe item 2. Check Supabase | Row deleted server-side | P1 |
| TC-431 | Wear log server sync -- insert | 1. Log a wear 2. Check Supabase | Row inserted in wear_logs with correct fields | P0 |
| TC-432 | Swipe server sync -- upsert | 1. Swipe a fragrance 2. Check Supabase | Row upserted in swipe_feedback keyed on (user_id, fragrance_id) | P1 |
| TC-433 | Swipe re-swipe overwrites | 1. Swipe fragrance A as "love" 2. Re-swipe A as "dislike" 3. Check server | Single row with action="dislike" (not two rows) | P1 |
| TC-434 | Sentry capture on sync error | 1. Trigger sync error | captureException called with error and context (sync_op, sync_table) | P2 |

---

## Cross-Cutting: Free Tier Limits

### User Stories
- US-063: As a free user, I want clear indication of my remaining quota so that I am not surprised by limits.

### Acceptance Criteria
- [ ] AC-225: Wardrobe cap: 20 items
- [ ] AC-226: Daily swipe cap: 10 per day
- [ ] AC-227: Quiz questions: 3 for free
- [ ] AC-228: Paywall shown when limits hit

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-435 | Wardrobe cap at exactly 20 | 1. Add exactly 20 items 2. Verify 20th accepted 3. Attempt 21st | 20th accepted; 21st returns WARDROBE_CAP_HIT; paywall shown | P0 |
| TC-436 | Wardrobe cap -- update does not count | 1. Have 20 items 2. Edit item #5 (change status) | Edit succeeds; no cap error | P0 |
| TC-437 | Wardrobe cap -- dedup does not count | 1. Have 20 items including fragrance A 2. Re-add fragrance A | Existing entry updated; no cap error (already exists) | P0 |
| TC-438 | Swipe cap at exactly 10 | 1. Swipe 10 times in one day | 10th swipe accepted; 11th blocked with limit message | P0 |
| TC-439 | Swipe cap -- day rollover | 1. Hit 10 swipe limit 2. Device date advances to next day | dailySwipeCount resets; can swipe again | P0 |
| TC-440 | Quiz -- 3 free questions | 1. Be free user 2. Complete Q3 | Paywall intercept; cannot access Q4-Q9 | P0 |
| TC-441 | FREE_LIMITS constants | 1. Inspect FREE_LIMITS | wardrobeItems=20, dailySwipes=10, quizQuestions=3 | P0 |

---

## Cross-Cutting: Pro Gating

### User Stories
- US-064: As a developer, I want Pro features gated both client-side (UX) and server-side (RLS) so that free users cannot bypass limits.

### Acceptance Criteria
- [ ] AC-229: Client-side UX gates via useProStore.isPro
- [ ] AC-230: Server-side RLS enforcement via is_pro_user(auth.uid())
- [ ] AC-231: Pro features list: taste_profile_screen, perfume_wrapped, weather_morning_push, ai_why_this, collab_filtering, advanced_analytics, unlimited_wardrobe, unlimited_swipes, full_quiz, bottle_scan

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-442 | Pro gate -- Taste Profile | 1. Free user taps Taste Profile | Paywall shown; content not rendered | P0 |
| TC-443 | Pro gate -- Perfume Wrapped | 1. Free user navigates to Wrapped | Paywall shown | P0 |
| TC-444 | Pro gate -- Bottle Scan | 1. Free user opens Scan | Paywall shown | P0 |
| TC-445 | Pro gate -- Full Quiz | 1. Free user after Q3 | Paywall intercept at question boundary | P0 |
| TC-446 | Pro gate -- Unlimited Wardrobe | 1. Free user at 20 items | Paywall on 21st add; Pro user unlimited | P0 |
| TC-447 | Pro gate -- Unlimited Swipes | 1. Free user at 10 swipes | Blocked; Pro user can continue | P0 |
| TC-448 | Pro gate -- server-side RLS | 1. Modify client to bypass isPro check 2. Attempt insert beyond limit | Server rejects via RLS policy (is_pro_user check) | P0 |
| TC-449 | Pro activation -- immediate effect | 1. Subscribe to Pro 2. Check all gated features | All Pro features immediately accessible without app restart | P0 |
| TC-450 | Pro deactivation -- immediate effect | 1. Deactivate Pro 2. Check gated features | All Pro features re-gated immediately | P1 |
| TC-451 | PRO_FEATURES enum consistency | 1. Verify all PRO_FEATURES values match actual gates in code | Every feature in the enum has a corresponding client-side gate | P1 |

---

## Cross-Cutting: Network Failure and Offline

### User Stories
- US-065: As a user with poor connectivity, I want the app to remain functional offline and clearly communicate when data is not synced.

### Acceptance Criteria
- [ ] AC-232: Offline wardrobe browsing works
- [ ] AC-233: Writes succeed locally but _unsynced flag set on sync failure
- [ ] AC-234: Toast notification on sync failure
- [ ] AC-235: Supabase errors captured to Sentry

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-452 | Airplane mode -- browse wardrobe | 1. Load wardrobe while online 2. Go to airplane mode 3. Browse wardrobe | All cached items visible; images from cache or placeholders | P0 |
| TC-453 | Airplane mode -- add item | 1. Go offline 2. Add wardrobe item | Item added locally; sync fails; _unsynced=true; toast shown | P0 |
| TC-454 | Airplane mode -- log wear | 1. Go offline 2. Log a wear | Wear logged locally; sync fails; _unsynced=true; toast shown | P0 |
| TC-455 | Airplane mode -- swipe | 1. Go offline 2. Swipe a fragrance | Swipe recorded locally; sync fails; notifySyncFailure called | P1 |
| TC-456 | Return online -- no automatic retry | 1. Create _unsynced items offline 2. Return online | Items remain _unsynced (retry-on-reconnect is deferred; manual retry via banner) | P1 |
| TC-457 | Supabase timeout | 1. Simulate slow network causing Supabase timeout | syncWrite catches error; returns ok=false; captureException called | P1 |
| TC-458 | Network error during login | 1. Go offline 2. Attempt sign-in | Error handled gracefully; no crash; user informed | P0 |

---

## Cross-Cutting: Deep Linking

### User Stories
- US-066: As a user navigating between screens, I want deep link parameters to control screen behavior so that context is preserved.

### Acceptance Criteria
- [ ] AC-236: openLogWear param opens LogWear sheet on fragrance detail
- [ ] AC-237: from=wardrobe param indicates navigation source
- [ ] AC-238: returnTo param on auth/login redirects after sign-in

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-459 | openLogWear deep link | 1. Navigate to fragrance/[id]?openLogWear=true | Fragrance detail opens with LogWear sheet auto-presented | P0 |
| TC-460 | from=wardrobe param | 1. Navigate to detail with from=wardrobe | Back navigation returns to Wardrobe tab (not Discover) | P1 |
| TC-461 | returnTo on login | 1. Navigate to auth/login?returnTo=/quiz 2. Sign in | After sign-in, navigates to /quiz instead of home | P0 |
| TC-462 | returnTo -- no param | 1. Navigate to auth/login (no returnTo) 2. Sign in | Navigates to home/Today tab after sign-in | P0 |
| TC-463 | Invalid deep link param | 1. Navigate with invalid/malformed params | App handles gracefully; no crash; falls back to default behavior | P1 |

---

## Cross-Cutting: RevenueCat

### User Stories
- US-067: As a developer, I want RevenueCat integration to handle subscriptions reliably across environments.

### Acceptance Criteria
- [ ] AC-239: Expected Expo Go error handled gracefully
- [ ] AC-240: Purchase flow calls purchasePackage and activates Pro on success
- [ ] AC-241: Restore flow calls restorePurchases
- [ ] AC-242: Customer info checked on init -- syncs Pro state with server truth

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-464 | RevenueCat init -- production build | 1. Launch production build | initRevenueCat succeeds; offerings loaded; loading=false | P0 |
| TC-465 | RevenueCat init -- Expo Go | 1. Launch in Expo Go | loadError=true; console log "[RevenueCat] Not available in this environment"; no crash | P0 |
| TC-466 | Customer info sync on init | 1. Launch app with active subscription | getCustomerInfo returns active; isPro set to true | P0 |
| TC-467 | Customer info sync -- expired | 1. Launch app with expired subscription | getCustomerInfo returns inactive; isPro set to false | P0 |
| TC-468 | Purchase -- user cancelled (not an error) | 1. Start purchase 2. Cancel in App Store | No error alert; returns false; purchasing=false | P0 |
| TC-469 | Restore -- success path | 1. Tap restore 2. Prior purchase found | Pro activated; "Restored" alert shown | P0 |
| TC-470 | Restore -- nothing found | 1. Tap restore 2. No prior purchase | "No Purchase Found" alert; Pro NOT activated | P0 |
| TC-471 | Monthly package identification | 1. Load offerings | monthlyPackage correctly identified from availablePackages | P1 |
| TC-472 | Yearly package identification | 1. Load offerings | yearlyPackage correctly identified from availablePackages | P1 |
| TC-473 | Retry after load failure | 1. Initial load fails 2. Tap retry | load() re-invoked; offerings re-fetched | P1 |

---

## Cross-Cutting: Accessibility

### User Stories
- US-068: As a user with visual impairments, I want the app to be fully usable with VoiceOver and dynamic type so that I can access all features.

### Acceptance Criteria
- [ ] AC-243: All tap targets >= 44pt
- [ ] AC-244: VoiceOver labels on all interactive elements
- [ ] AC-245: Dynamic type support on iOS
- [ ] AC-246: WCAG 2.1 AA contrast ratios
- [ ] AC-247: No information conveyed by color alone

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-474 | Tap target size -- tab bar | 1. Measure tab bar button touch areas | Each tab >= 44pt touch target | P0 |
| TC-475 | Tap target size -- spray icon | 1. Measure spray icon on wardrobe card | Touch target >= 44pt | P0 |
| TC-476 | Tap target size -- star rating | 1. Measure star rating tap area | Each star >= 44pt touch area | P1 |
| TC-477 | VoiceOver -- tab bar | 1. Enable VoiceOver 2. Navigate tab bar | Each tab announces name: "Today", "Discover", "Train", "Wardrobe", "You" | P0 |
| TC-478 | VoiceOver -- fragrance card | 1. Enable VoiceOver 2. Focus on a fragrance card | Card announces fragrance name, brand, and key info | P0 |
| TC-479 | VoiceOver -- spray icon | 1. Enable VoiceOver 2. Focus on spray icon | Announces "Log wear for [fragrance name]" or equivalent | P1 |
| TC-480 | VoiceOver -- swipe deck | 1. Enable VoiceOver 2. Navigate Train tab | Accessible alternatives to swipe gestures; card info announced | P1 |
| TC-481 | Dynamic type -- XXL | 1. Set system font to XXL 2. Navigate all major screens | Text scales; no overflow/truncation of critical content; layout adjusts | P0 |
| TC-482 | Dynamic type -- XS | 1. Set system font to smallest 2. Navigate | Text readable; touch targets remain >= 44pt | P1 |
| TC-483 | Color contrast -- primary text | 1. Audit text colors against backgrounds | Contrast ratio >= 4.5:1 for body text (WCAG AA) | P0 |
| TC-484 | Color contrast -- champagne accent on white | 1. Check accent color (COLORS.accent) on card/white background | Contrast ratio >= 3:1 for non-text elements | P1 |
| TC-485 | Information not by color alone | 1. Review status indicators, badges, alerts | Each conveys meaning via text/icon in addition to color | P1 |

---

## Cross-Cutting: Performance

### User Stories
- US-069: As a user, I want the app to be fast and smooth so that managing my collection does not feel sluggish.

### Acceptance Criteria
- [ ] AC-248: Cold start < 2 seconds
- [ ] AC-249: Scroll FPS >= 60fps on modern devices
- [ ] AC-250: Images lazy-load with progressive display
- [ ] AC-251: <100ms interaction response for common actions

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-486 | Cold start -- iOS | 1. Force-close 2. Launch from home screen 3. Measure time to interactive | < 2 seconds on iPhone 12+ | P0 |
| TC-487 | Cold start -- Android | 1. Force-close 2. Launch 3. Measure | < 2 seconds on mid-range 3-year-old device | P0 |
| TC-488 | Wardrobe scroll -- 20 items | 1. Populate 20 items 2. Scroll wardrobe rapidly | 60fps; no dropped frames | P0 |
| TC-489 | Wardrobe scroll -- 100 items (Pro) | 1. Populate 100 items 2. Scroll | Smooth scrolling; virtualized list renders only visible items | P1 |
| TC-490 | Discover feed scroll | 1. Scroll through Discover results | Smooth scrolling; images load progressively | P0 |
| TC-491 | SOTD feed scroll | 1. Scroll through SOTD feed with photo cards | Smooth scrolling; photos load progressively | P1 |
| TC-492 | Spray icon tap response | 1. Tap spray icon 2. Measure response time | < 100ms to register tap and show toast/feedback | P0 |
| TC-493 | Tab switch response | 1. Tap between tabs 2. Measure response | < 100ms to begin rendering new tab content | P0 |
| TC-494 | Image lazy loading | 1. Scroll quickly through fragrance list | Placeholder/skeleton shown before images load; no blank spaces | P1 |
| TC-495 | AsyncStorage hydration time | 1. Cold-start app with large local dataset 2. Measure hydration | Stores hydrate from AsyncStorage within cold-start budget | P1 |

---

## Cross-Cutting: Data Integrity and Cross-Device Sync

### User Stories
- US-070: As a user with multiple devices, I want my data to be consistent across devices after sign-in.
- US-071: As a user, I want sign-out to clear my local data so that my account is secure.

### Acceptance Criteria
- [ ] AC-252: _unsynced rows tracked for retry
- [ ] AC-253: Cross-device sync via hydrate() on sign-in
- [ ] AC-254: Sign-out clears all local user data from stores
- [ ] AC-255: Client-generated UUIDs match server rows (no drift)
- [ ] AC-256: AsyncStorage persistence survives app restart

### Test Cases

| ID | Scenario | Steps | Expected Result | Priority |
|---|---|---|---|---|
| TC-496 | Cross-device -- wardrobe sync | 1. Add items on Device A (signed in) 2. Sign in on Device B | Device B hydrates wardrobe with all items from server | P0 |
| TC-497 | Cross-device -- wear logs sync | 1. Log wears on Device A 2. Sign in on Device B | Device B hydrates wear logs with all entries from server | P0 |
| TC-498 | Cross-device -- swipes sync | 1. Swipe fragrances on Device A 2. Sign in on Device B | Device B hydrates swipe store with all swipe records | P1 |
| TC-499 | Sign-out clears wardrobe | 1. Sign out | useWardrobeStore.items = []; hydrated reset | P0 |
| TC-500 | Sign-out clears wear logs | 1. Sign out | useWearLogStore.logs = []; hydrated reset | P0 |
| TC-501 | Sign-out clears swipes | 1. Sign out | useSwipeStore.swipes = {}; dailySwipeCount/Date reset | P0 |
| TC-502 | Sign-out clears session | 1. Sign out | useSessionStore: userId=null, isAnonymous=false, email=null | P0 |
| TC-503 | Client UUID matches server | 1. Add wardrobe item 2. Compare local id with Supabase row id | IDs match; uuid v4 format | P0 |
| TC-504 | AsyncStorage persistence -- wardrobe | 1. Add items 2. Force-close app 3. Reopen | Items restored from AsyncStorage before server hydration | P0 |
| TC-505 | AsyncStorage persistence -- wear logs | 1. Log wears 2. Force-close 3. Reopen | Logs restored from AsyncStorage | P0 |
| TC-506 | AsyncStorage persistence -- swipes | 1. Swipe fragrances 2. Force-close 3. Reopen | Swipes restored from AsyncStorage including dailySwipeCount/Date | P0 |
| TC-507 | AsyncStorage persistence -- Pro state | 1. Activate Pro 2. Force-close 3. Reopen | isPro=true restored; hasHydrated=true after rehydration | P0 |
| TC-508 | _unsynced rows identifiable | 1. Create items offline 2. Inspect store | Items with _unsynced=true are distinguishable from synced items | P1 |
| TC-509 | Hydrate does not duplicate local-only data | 1. Have local-only items 2. Sign in (triggering hydrate) | Server data replaces local; no duplicates from merge | P1 |
| TC-510 | Concurrent modification -- same fragrance | 1. Device A updates an item 2. Device B updates same item before sync | Last-write-wins on next hydration; no crash or data corruption | P2 |

---

## Summary

| Category | User Stories | Acceptance Criteria | Test Cases |
|---|---|---|---|
| F1 -- Spray/Wear Tracking | US-001 to US-004 | AC-001 to AC-008 | TC-001 to TC-020 |
| F2 -- SOTD Social Feed | US-005 to US-008 | AC-009 to AC-018 | TC-021 to TC-040 |
| F3 -- Collection Analytics | US-009 to US-011 | AC-019 to AC-025 | TC-041 to TC-051 |
| F4 -- Relationship Mapping | US-012 to US-014 | AC-026 to AC-033 | TC-052 to TC-062 |
| F5 -- Recommendations | US-015 to US-017 | AC-034 to AC-046 | TC-063 to TC-078 |
| F6 -- Private Notes | US-018 to US-021 | AC-047 to AC-052 | TC-079 to TC-094 |
| F7 -- Reviews & Ratings | US-022 to US-024 | AC-053 to AC-061 | TC-095 to TC-110 |
| F8 -- Mobile App | US-025 to US-026 | AC-062 to AC-071 | TC-111 to TC-124 |
| F9 -- AI Personalization | US-027 to US-029 | AC-072 to AC-080 | TC-125 to TC-144 |
| F10 -- Perfume Wrapped | US-030 to US-033 | AC-081 to AC-099 | TC-145 to TC-169 |
| Home/Today | US-034 | AC-100 to AC-104 | TC-170 to TC-177 |
| Discover | US-035 to US-036 | AC-105 to AC-111 | TC-178 to TC-195 |
| Train | US-037 | AC-112 to AC-117 | TC-196 to TC-211 |
| Wardrobe | US-038 to US-039 | AC-118 to AC-125 | TC-212 to TC-234 |
| Profile | US-040 | AC-126 to AC-131 | TC-235 to TC-252 |
| Fragrance Detail | US-041 | AC-132 to AC-146 | TC-253 to TC-275 |
| Auth/Login | US-042 | AC-147 to AC-151 | TC-276 to TC-287 |
| Paywall | US-043 | AC-152 to AC-157 | TC-288 to TC-300 |
| Scan | US-044 | AC-158 to AC-163 | TC-301 to TC-314 |
| SOTD Feed | US-045 | AC-164 to AC-166 | TC-315 to TC-324 |
| Rec Results | US-046 | AC-167 to AC-170 | TC-325 to TC-331 |
| Quiz | US-047 to US-048 | AC-171 to AC-175 | TC-332 to TC-343 |
| Brand Page | US-049 | AC-176 to AC-178 | TC-344 to TC-349 |
| User Profile (Public) | US-050 | AC-179 to AC-182 | TC-350 to TC-357 |
| Taste Profile | US-051 | AC-183 to AC-185 | TC-358 to TC-361 |
| Wrapped | US-052 | AC-186 to AC-189 | TC-362 to TC-366 |
| AddToWardrobe Sheet | US-053 | AC-190 to AC-194 | TC-367 to TC-377 |
| LogWear Sheet | US-054 | AC-195 to AC-202 | TC-378 to TC-388 |
| FragranceNotes Sheet | US-055 | AC-203 to AC-207 | TC-389 to TC-395 |
| WhatToWear Sheet | US-056 | AC-208 to AC-211 | TC-396 to TC-401 |
| DiscoverFilter Sheet | US-057 | AC-212 to AC-215 | TC-402 to TC-408 |
| Auth States | US-058 to US-060 | AC-216 to AC-218 | TC-409 to TC-418 |
| Sync & Data Integrity | US-061 to US-062 | AC-219 to AC-224 | TC-419 to TC-434 |
| Free Tier Limits | US-063 | AC-225 to AC-228 | TC-435 to TC-441 |
| Pro Gating | US-064 | AC-229 to AC-231 | TC-442 to TC-451 |
| Network/Offline | US-065 | AC-232 to AC-235 | TC-452 to TC-458 |
| Deep Linking | US-066 | AC-236 to AC-238 | TC-459 to TC-463 |
| RevenueCat | US-067 | AC-239 to AC-242 | TC-464 to TC-473 |
| Accessibility | US-068 | AC-243 to AC-247 | TC-474 to TC-485 |
| Performance | US-069 | AC-248 to AC-251 | TC-486 to TC-495 |
| Data Integrity/Sync | US-070 to US-071 | AC-252 to AC-256 | TC-496 to TC-510 |
| **TOTALS** | **71** | **256** | **510** |
