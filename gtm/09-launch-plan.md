# Launch Plan

The 6-week GTM sequence to take Perfume Picks from App Store submission to scaling. Solo-founder-realistic: every item is something one person (with Claude) can execute. Channels are sequenced so organic, paid, and earned reinforce each other.

> Timelines per the SEO/ASO playbook: ASO rankings move in 1–3 weeks; conversion changes show in ~2 weeks of a clean A/B test; authority/citation lift takes ~90 days. Set expectations accordingly — don't expect a hockey stick week one.

---

## Phase 0 — Pre-submission (foundation)

- [ ] App Store listing assembled from `03-app-store-listing.md` (name, subtitle, keyword field, description, promo text).
- [ ] Screenshot set + app preview video produced (hybrid UI + caption; sources in `/ux-shots/`).
- [ ] Privacy nutrition label verified against actual data flows (Supabase, PostHog, Sentry, RevenueCat).
- [ ] RevenueCat products live and tested ($2.99/mo, $24.99/yr, 7-day trial) — including guest purchase path.
- [ ] `web/src/consts.ts` → set `appStoreUrl` ready to flip the moment the listing is live (this switches the site's "coming soon" CTA to a real download link).
- [ ] Waitlist capture live on perfumepicks.app; email A1 wired.
- [ ] Apple Search Ads account created; campaigns drafted from `06-ads.md` (don't enable yet).
- [ ] Custom Product Pages (CPP-DNA, CPP-Dupes, CPP-Wardrobe) built.

## Phase 1 — Submission & soft signals (Week 1–2)

- [ ] Submit to App Review.
- [ ] Pre-launch waitlist posts (`05-social-launch-posts.md` → Pre-launch) on X, Threads, Instagram, plus value-led Reddit posts (respect each sub's rules).
- [ ] Seed the website blog — the 6 existing articles in `web/src/content/articles/` are live; confirm they're indexed (GSC URL inspection). These are the organic top-of-funnel.
- [ ] Line up the press list (9to5Mac, MacStories, AppAdvice, fragrance YouTubers/Substacks). Draft outreach from `07-press-kit.md`.

## Phase 2 — Launch (Week 2–3, on approval)

- [ ] Flip `appStoreUrl` in `consts.ts`, rebuild + deploy the site (`npm run build && bash scripts/deploy-to-docs.sh && git push`).
- [ ] Launch-day posts across all platforms (`05-social-launch-posts.md` → Launch Day).
- [ ] Send waitlist email A3.
- [ ] Send press kit to the media list; offer the founder for comment.
- [ ] Post to relevant communities: r/fragrance, r/Colognes, r/fragranceideas, Product Hunt (consider a PH launch), Indie Hackers, Hacker News (Show HN, value-first).
- [ ] Enable Apple Search Ads **Brand** campaign + a small **Discovery** budget. Don't over-spend before CVR data exists.

## Phase 3 — Optimize (Week 3–5)

- [ ] Start the first **Product Page Optimization** A/B test: icon and/or first screenshot (biggest levers). Let it reach significance (~2 weeks).
- [ ] Weekly Search Ads search-term harvest → graduate converters to Exact + update the keyword field. Add negatives.
- [ ] Begin week-1/2 feature-drop social cadence (DNA, dupes, SOTD, cost-per-wear, Wrapped).
- [ ] Onboarding email sequence (B1–B4) live and firing.
- [ ] Respond to every App Store review (templates in `03`).
- [ ] First weekly metrics review (see below).

## Phase 4 — Scale (Week 5–6+)

- [ ] Scale spend on winning Search Ads ad groups + creatives; expand to Meta/TikTok with the best-performing message (likely DNA or dupes).
- [ ] Pitch fragrance creators for honest reviews / "what's your archetype" collabs (gift Pro codes, not paid scripts — keep it credible).
- [ ] Listicle/round-up outreach: "best fragrance apps 2026" posts — get Perfume Picks added where Scentbird/Fragrantica are listed.
- [ ] Publish 1–2 new SEO articles targeting harvested keywords (e.g. "best perfume dupes," "how to organize a fragrance collection") per the content playbook — each linking to /download.
- [ ] Stand up the recurring weekly ASO + SEO audit loop (offer to schedule it).

---

## Channel priority (where to spend energy first)

1. **App Store organic (ASO)** — free, compounding. Get metadata + screenshots right; iterate with Search Ads data.
2. **Communities (Reddit / fragrance forums)** — the audience is concentrated and high-intent. Value-first, never spammy.
3. **Organic social (X / IG / TikTok)** — the "what's your archetype" + dupe hooks are made to travel.
4. **Apple Search Ads** — the highest-intent paid channel and the keyword research engine. Start small, scale on data.
5. **Earned media / creators** — slower, but the credibility multiplier for a solo indie app.
6. **Paid social (Meta/TikTok)** — only once you know which message converts and your trial→paid economics work.

---

## Success metrics (review weekly; never fabricate)

**Acquisition:** App Store impressions, product page views, search-term performance (App Store Connect), CPI (Search Ads).
**Conversion:** impression → install rate; product page → install (watch PPO test results).
**Activation:** % who complete DNA reveal; % who add ≥5 bottles; % who log a wear in week 1.
**Monetization:** trial starts, trial → paid conversion, MRR (RevenueCat).
**Engagement:** D1/D7 retention, wears logged/user, scans/user (PostHog).
**Quality:** rating average + volume, crash-free rate (Sentry), moderation flags.
**Earned:** press mentions, creator reviews, "best fragrance app" listicle inclusions, AI-citation/brand mentions.

**The two numbers that matter most early:** (1) DNA-reveal completion rate (activation) and (2) trial → paid conversion (does the dupe/Living-DNA value prop actually convert). Optimize everything else in service of those.
