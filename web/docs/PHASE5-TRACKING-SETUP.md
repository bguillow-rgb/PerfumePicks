# Phase 5 — Tracking & Weekly Audit Setup

Run this once before launching content. After this, every Wave 1 article ships with full measurement.

## 1. Google Analytics 4 (10 min)

1. Open [analytics.google.com](https://analytics.google.com).
2. Admin → Create property → "Stick Picks Web". Time zone: your local. Currency: USD.
3. Property → Data Streams → Add Stream → Web → URL `https://stickpicks.app`, name "Stick Picks".
4. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`).
5. Add to your env:
   ```
   PUBLIC_GA4_ID=G-XXXXXXXXXX
   ```
   - Local dev: put it in `web/.env.local` (gitignored).
   - Production: set it as a build env var on whatever platform you deploy from. For the current GitHub Pages flow, you'll need to either build locally with the env set, or move to a build-on-push host (Netlify / Cloudflare Pages / Vercel) that injects build env vars.
6. Build + deploy. Open the live site. Within 30 seconds GA4's Realtime view should show your visit.
7. Configure the **AI-referrer report** in GA4:
   - Reports → Acquisition → Traffic acquisition.
   - Add a comparison: Session source/medium contains any of `chatgpt.com / chat.openai.com / perplexity.ai / gemini.google.com / claude.ai / copilot.microsoft.com`.
   - Save as a custom report titled "AI Referrer Traffic".

## 2. Google Search Console (15 min)

1. Open [search.google.com/search-console](https://search.google.com/search-console).
2. Add property → URL prefix: `https://stickpicks.app/`.
3. Verification → choose **HTML tag** method. Copy the `content="..."` value (just the value, not the full tag).
4. Add to your env:
   ```
   PUBLIC_GSC_VERIFICATION=<the value>
   ```
5. Build + deploy. Wait 2-3 minutes for the new HTML to propagate, then click Verify.
6. Submit your sitemap: Sitemaps → enter `sitemap-index.xml` → Submit.
7. Verify the sitemap reads as "Success" within 10 minutes. (If "Couldn't fetch", wait 30 minutes and retry — GitHub Pages can be slow on first crawl.)

Alternative: **DNS verification** is more durable (works even if you change hosts). Add a `TXT` record to your domain DNS with the value Google provides. Slower setup but never has to be re-done.

## 3. IndexNow (5 min)

IndexNow is a search-engine-agnostic ping protocol. Bing, Yandex, Naver, and Seznam consume it directly. Google announced support in 2023 and consumes IndexNow signals via Bing's index, so pinging IndexNow effectively pings them all.

1. Generate a key:
   ```bash
   cd web
   bash scripts/generate-indexnow-key.sh
   ```
   Output:
   - Generates `public/<key>.txt` (the verification file).
   - Prints the key — copy it.
2. Add to your env:
   ```
   PUBLIC_INDEXNOW_KEY=<the key>
   ```
3. Commit `public/<key>.txt` (it's safe to commit — public by design).
4. Build + deploy.
5. After each future deploy with new content, run:
   ```bash
   PUBLIC_INDEXNOW_KEY=<key> bash scripts/indexnow-ping.sh
   ```
   This pings all sitemap URLs. Engines typically re-crawl within 24-48 hours instead of the usual 7-14 day default schedule.

## 4. AI-referrer tracking (already wired)

No setup. GA4 captures referrer headers automatically. View in Reports → Acquisition → Traffic acquisition → filter by Session source/medium.

Optionally use third-party AI-citation monitoring tools (Peec.ai, Otterly, ALLMO) that crawl ChatGPT/Perplexity/Gemini answers for your domain mentions. These add visibility into citations that don't drive a click (≥50% of AI citations) — but they cost money. Wait until you have 1,000+ monthly clicks before subscribing.

## 5. Weekly audit loop

Scheduled separately via the `scheduled-tasks` MCP — runs once a week, pulls GSC data, diffs against last week, surfaces movers.

To use the weekly audit you need to give Claude access to your GSC data each Monday. Simplest workflow:
1. Monday morning: log in to GSC.
2. Performance → Search results → last 28 days → Export (Excel or Google Sheets).
3. Drop the file path / URL into the next week's audit prompt.

Claude diffs vs the prior week and outputs a prioritized action list (queries gaining/losing impressions, falling CTRs, indexation changes, schema errors). The scheduled task fires the prompt every Monday at 8:57 AM local time.

## What to do post-setup

| Day | Action |
|---|---|
| Day 0 | Complete steps 1-3 above. Deploy. |
| Day 1 | Verify GA4 fires (check Realtime). Verify GSC reads sitemap. |
| Day 2 | Submit a request indexing for the homepage in GSC URL Inspection tool. |
| Day 3-7 | Check GSC daily for first index events. |
| Week 2 | First weekly audit fires. Should now have a baseline. |
| Week 4 | Wave 1 article publication begins (if not already). Re-run IndexNow ping after each publish. |
