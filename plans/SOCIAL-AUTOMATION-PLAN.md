# Perfume Picks — Social Media Automation Plan

_Last updated: 2026-06-25_

---

## Current State

**Zero social automation exists.** Two manual Claude skills handle content generation
(`perfume-picks` for replies, `perfume-picks-social` for original posts). No social API
keys are configured. GitHub Actions currently automate only SEO content and site health.

---

## The 8 Tasks — Automation Assessment

| # | Task | Automatable? | APIs Available | Effort |
|---|------|-------------|----------------|--------|
| 1 | 20-30 influencer DMs/week | Semi (find + draft, human sends) | None (IG/TT block DM bots) | Phase 2 |
| 2 | Daily TikTok videos | No (video creation + ToS risk) | TikTok Creator API (restricted) | Phase 3 |
| 3 | Daily Instagram Reels | Partial (needs video content) | Meta Graph API (restricted) | Phase 3 |
| 4 | Daily Threads posts | Yes | Meta Threads API (2024) | Phase 1 |
| 5 | Daily Bluesky posts | Yes | AT Protocol (fully open) | Phase 1 |
| 6 | Reddit answers | Semi (generate, human approves) | Reddit OAuth API | Phase 1 |
| 7 | Comment on 20 videos/day | Partial (YouTube yes, TT/IG risky) | YouTube Data API v3 | Phase 2 |
| 8 | Fragrance of the Day feature | Yes (content engine for all platforms) | Supabase + Anthropic | Phase 1 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              FOTD Content Engine (daily cron)       │
│  • Picks a fragrance from Supabase catalog          │
│  • Generates platform-specific copy via Claude API  │
│  • Outputs: text posts, captions, scripts, hashtags │
└──────────┬──────────────────────────────────────────┘
           │
     ┌─────▼──────────────────────────────────────┐
     │         Platform Routing                    │
     ├─────────────────────────────────────────────┤
     │  Bluesky     → auto-post (AT Protocol)      │
     │  Threads     → auto-post (Meta API)         │
     │  X/Twitter   → auto-post (API v2 free tier) │
     │  Reddit      → draft queue (human approves) │
     │  Instagram   → draft queue (manual posting) │
     │  TikTok      → script + caption (manual)    │
     └─────────────────────────────────────────────┘
```

The core insight: **one fragrance, one content generation pass, outputs for all 6 platforms.**
This keeps Claude API costs low and ensures voice consistency.

---

## Phase 1: Quick Wins (This Week)

### 1.1 FOTD Content Engine (`scripts/social/fotd-generator.ts`)
The core pipeline everything else depends on.

**What it does:**
- Queries Supabase for an unposted fragrance (prefers ones with affiliate links, high popularity)
- Tracks posted fragrances in `social_posts_log` Supabase table
- Calls Claude API to generate:
  - Bluesky post (300 chars max)
  - Threads post (500 chars, can include hashtags)
  - X/Twitter post (280 chars)
  - Reddit comment (natural, helpful, no promotion)
  - Instagram caption (longer, storytelling)
  - TikTok script (30s spoken word)
- Outputs JSON to stdout or a file

**Env vars needed:**
```
SUPABASE_URL=https://jdkwlwyysgofljkobpmr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
```

### 1.2 Bluesky Auto-Poster (`scripts/social/post-bluesky.ts`)
AT Protocol is fully open — no API key approval needed.

**What it does:**
- Creates a Bluesky session with identifier + app password
- Posts the FOTD Bluesky copy
- Handles token refresh

**Env vars needed:**
```
BSKY_IDENTIFIER=perfumepicks.bsky.social
BSKY_APP_PASSWORD=...  (generate in Bluesky Settings → App Passwords)
```

**GitHub Action:** `.github/workflows/social-bluesky.yml` — daily at 13:00 UTC

### 1.3 Reddit Monitor (`scripts/social/reddit-monitor.ts`)
NOT auto-posting. Finds questions, drafts helpful answers, outputs for human review.

**What it does:**
- Searches r/fragrance, r/Frugal_Fragrance, r/DesiFragranceAddicts for new questions
- Filters for: recommendation requests, dupe questions, "what should I buy" posts
- For each hit, generates a helpful, non-promotional response via Claude
- Outputs to `scripts/social/data/reddit-drafts-YYYY-MM-DD.json` for human review
- Drafts follow perfume-picks-social voice: no promotion unless it naturally fits

**Env vars needed:**
```
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USERNAME=...
REDDIT_PASSWORD=...
```

**GitHub Action:** `.github/workflows/social-reddit-monitor.yml` — daily at 14:00 UTC

### 1.4 Threads Drafter (`scripts/social/threads-drafter.ts`)
Meta's Threads API (launched June 2024) supports text post creation.

**What it does:**
- Takes FOTD output and posts the Threads copy
- Requires Instagram Business Account + Threads API approval (Meta App Review)

**Env vars needed:**
```
THREADS_ACCESS_TOKEN=...
THREADS_USER_ID=...
```

**Status:** Script is built in Phase 1, but runs in draft-mode (saves to file) until
Meta App Review is approved. Estimated approval time: 1-2 weeks.

---

## Phase 2: Medium Effort (Weeks 2-3)

### 2.1 X/Twitter Auto-Poster
- Twitter API v2 free tier: 1,500 tweet writes/month (50/day — plenty)
- Need `TWITTER_BEARER_TOKEN`, `TWITTER_API_KEY`, etc.
- OAuth 2.0 with PKCE for user context writes

### 2.2 YouTube Comment Generator
- YouTube Data API v3 — `comments.insert` endpoint
- Find fragrance review videos published in last 48h
- Generate human-sounding comments that add value
- Requires Google OAuth for the Perfume Picks YouTube account

### 2.3 Influencer Outreach System
- **Find:** Search Instagram/TikTok via hashtags (#perfumepicks, #fragrancecommunity)
  using a tool like Apify or PhantomBuster (paid, but cheap) — OR manual curation
- **Draft:** Claude generates personalized DM for each influencer based on their content
- **Track:** Google Sheet or Supabase table with outreach status
- **Send:** Human sends (Instagram + TikTok DM APIs don't allow bot DMs)

### 2.4 Reddit Auto-Poster (gated)
- After Phase 1 (monitor) runs for 1 week without quality issues, enable auto-posting
- Keep a confidence threshold: only auto-post when Claude is highly confident the response
  is helpful, specific, and non-promotional
- Human review queue for borderline cases

---

## Phase 3: Harder Stuff (Month 2)

### 3.1 TikTok Video Creation
Options (in order of effort):
1. **Static image + voiceover:** Use Canvas API or a service like Creatomate to generate
   a video from a product image + AI voiceover. ~$30/mo, fully automatable.
2. **Canva API:** Canva has a Design API that can generate video from templates.
3. **Manual posting with auto-generated script:** The FOTD engine already generates
   TikTok scripts. Human records/posts.

TikTok's Creator API allows scheduled posts but requires approval through their
developer program. Apply during Phase 2.

### 3.2 Instagram Reels
- Similar video challenge as TikTok
- Meta's Content Publishing API allows Reels posting (requires video upload to hosted URL first)
- Workflow: Generate script → create video (Creatomate or similar) → upload to S3/Supabase
  Storage → post via Graph API

### 3.3 Influencer DM Automation
- **Don't automate this on Instagram/TikTok** — both platforms detect and ban automation
  aggressively. Accounts get permanently disabled.
- **Realistic workflow:** Claude finds influencers + drafts DMs → spreadsheet queue →
  human sends 5-10/day via native app (takes ~15 min)
- **Alternative:** Use a legitimate influencer platform (Grin, Aspire) that has proper
  API access and partnership disclosure

---

## Fragrance of the Day — In-App Feature

Beyond social, FOTD should be a proper app feature:

1. **Supabase:** Add `featured_at` column to fragrances table (or new `daily_feature` table)
2. **App:** Home screen "Today's Pick" card with the featured fragrance
3. **Deep links:** Social posts link to `perfumepicks://fragrance/[slug]` and the web detail page
4. **Affiliate revenue:** FOTD always features a fragrance with affiliate retailer links

**Migration needed:** `202606251200_daily_feature.sql`

---

## ToS / Legal Considerations

| Platform | Bot Policy | Our Approach |
|----------|-----------|--------------|
| Bluesky | Open, AT Protocol explicitly supports bots | Auto-post ✓ |
| Threads | Official API available | Auto-post with approved app ✓ |
| X/Twitter | Official API, rate limits apply | Auto-post within free tier limits ✓ |
| Reddit | Official API, rate limits, spam detection | Draft + human review (auto-post later) |
| Instagram | Anti-automation ToS; Graph API for business | Only post via official API, no scraping |
| TikTok | Very strict automation ToS | Manual posting only; official Creator API for scheduling |
| YouTube | Official API only | Comment via YouTube Data API ✓ |
| Fragrantica | No API; scraping ToS violation | Manual participation only |

**Hard rules:**
- Never buy followers/engagement
- Never use unofficial browser automation for posting (account ban risk)
- Reddit: never spam; if a post doesn't earn the mention, don't mention it
- Always disclose when content is AI-assisted if platform requires it

---

## Env Vars Master List

Add all of these to GitHub Actions secrets + local `.env.local`:

```bash
# Phase 1 — Already have
ANTHROPIC_API_KEY=...
SUPABASE_URL=https://jdkwlwyysgofljkobpmr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Phase 1 — Need to add
BSKY_IDENTIFIER=perfumepicks.bsky.social
BSKY_APP_PASSWORD=...

REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USERNAME=PerfumePicks
REDDIT_PASSWORD=...

THREADS_ACCESS_TOKEN=...
THREADS_USER_ID=...

# Phase 2 — Need to add
TWITTER_BEARER_TOKEN=...
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...

YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
```

---

## Files Created

```
scripts/social/
├── fotd-generator.ts       # Core FOTD content engine
├── post-bluesky.ts         # Bluesky auto-poster
├── reddit-monitor.ts       # Reddit question finder + response drafter
├── threads-drafter.ts      # Threads poster (draft mode until approved)
├── influencer-finder.ts    # Influencer list builder
└── data/
    └── reddit-drafts-*.json  # Daily Reddit draft outputs

.github/workflows/
├── social-bluesky.yml      # Daily Bluesky post (13:00 UTC)
└── social-reddit-monitor.yml  # Daily Reddit monitor (14:00 UTC)

supabase/migrations/
└── 202606251200_daily_feature.sql  # FOTD tracking table
```

---

## Weekly Cadence Once Running

| Time (UTC) | Action |
|------------|--------|
| 11:00 | SEO article published (existing) |
| 13:00 | FOTD generated → Bluesky auto-posted |
| 13:05 | Threads auto-posted (once approved) |
| 13:10 | X/Twitter auto-posted (Phase 2) |
| 14:00 | Reddit monitor runs → drafts saved |
| 14:30 | GSC report (existing, Mondays) |
| Manual | Human reviews Reddit drafts → posts best ones |
| Manual | Human sends 5-7 influencer DMs (from Claude-generated list) |
| Manual | Human posts TikTok video using FOTD script |
