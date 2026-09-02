/**
 * Influencer Outreach List Builder
 *
 * Searches Reddit and Fragrantica for active fragrance community members
 * who would be good Perfume Picks collaborators, then drafts personalized
 * outreach messages for each.
 *
 * IMPORTANT: This does NOT send DMs automatically. Instagram and TikTok
 * have aggressive anti-automation ToS that ban accounts. The output is a
 * prioritized spreadsheet-ready list + drafted DM for each influencer.
 * A human reviews and sends via the native app.
 *
 * Sources searched:
 *   - Reddit: active users in r/fragrance with helpful post history
 *   - TikTok hashtag search (via public API): #perfumecollection, #fragrancetok
 *   - Instagram is NOT scraped (ToS violation) — add handles manually
 *
 * Usage:
 *   npx ts-node scripts/social/influencer-finder.ts
 *   npx ts-node scripts/social/influencer-finder.ts --platform reddit
 *   npx ts-node scripts/social/influencer-finder.ts --limit 20
 *
 * Env vars:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *   ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Influencer {
  handle: string;
  platform: 'reddit' | 'instagram' | 'tiktok' | 'youtube';
  profile_url: string;
  estimated_reach: string;
  niche_fit: 'high' | 'medium' | 'low';
  why_good_fit: string;
  recent_content_sample: string;
  drafted_dm: string;
  outreach_status: 'pending' | 'sent' | 'responded' | 'partnership';
  notes: string;
  discovered_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID ?? '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET ?? '';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME ?? '';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD ?? '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OUTPUT_DIR = path.join(__dirname, 'data');

const args = process.argv.slice(2);
const platformFilter = args.find((_, i) => args[i - 1] === '--platform') ?? 'all';
const limitArg = parseInt(args.find((_, i) => args[i - 1] === '--limit') ?? '20');

// ─── Reddit helpers ───────────────────────────────────────────────────────────

let redditToken: string | null = null;
let tokenExpiry = 0;

async function getRedditToken(): Promise<string> {
  if (redditToken && Date.now() < tokenExpiry) return redditToken;
  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PerfumePicks/1.0 (by u/PerfumePicks)',
    },
    body: new URLSearchParams({ grant_type: 'password', username: REDDIT_USERNAME, password: REDDIT_PASSWORD }),
  });
  const data = await res.json() as { access_token: string; expires_in: number };
  redditToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return redditToken;
}

async function redditGet(endpoint: string): Promise<unknown> {
  const token = await getRedditToken();
  const res = await fetch(`https://oauth.reddit.com${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'PerfumePicks/1.0 (by u/PerfumePicks)' },
  });
  if (!res.ok) throw new Error(`Reddit API ${res.status} on ${endpoint}`);
  return res.json();
}

async function getTopCommenters(subreddit: string): Promise<string[]> {
  // Get top posts and extract active commenters
  const data = await redditGet(`/r/${subreddit}/top.json?t=month&limit=10`) as {
    data: { children: Array<{ data: { id: string } }> };
  };

  const commenters = new Set<string>();
  for (const post of data.data.children.slice(0, 5)) {
    try {
      const comments = await redditGet(`/r/${subreddit}/comments/${post.data.id}.json?limit=20`) as [
        unknown,
        { data: { children: Array<{ data: { author: string; score: number; body: string } }> } }
      ];
      const topComments = comments[1].data.children
        .filter(c => c.data.score > 5 && c.data.author !== '[deleted]' && !c.data.author.startsWith('AutoModerator'));
      for (const c of topComments.slice(0, 10)) {
        commenters.add(c.data.author);
      }
      await new Promise(r => setTimeout(r, 300));
    } catch {
      // skip
    }
  }

  return Array.from(commenters);
}

async function getUserInfo(username: string): Promise<{
  commentKarma: number;
  linkKarma: number;
  recentFragrancePosts: string[];
}> {
  const data = await redditGet(`/user/${username}/overview.json?limit=10`) as {
    data: { children: Array<{ data: { body?: string; title?: string; subreddit: string; score: number } }> };
  };

  const fragranceSubs = ['fragrance', 'Frugal_Fragrance', 'DesiFragranceAddicts', 'fragrance_recommendations'];
  const recentFragrancePosts = data.data.children
    .filter(c => fragranceSubs.includes(c.data.subreddit))
    .map(c => c.data.body ?? c.data.title ?? '')
    .filter(t => t.length > 0)
    .slice(0, 3);

  const aboutData = await redditGet(`/user/${username}/about.json`) as {
    data: { comment_karma: number; link_karma: number };
  };

  return {
    commentKarma: aboutData.data.comment_karma,
    linkKarma: aboutData.data.link_karma,
    recentFragrancePosts,
  };
}

// ─── DM drafting ──────────────────────────────────────────────────────────────

async function draftOutreachDM(anthropic: Anthropic, influencer: {
  handle: string;
  platform: string;
  why_good_fit: string;
  recent_content_sample: string;
}): Promise<string> {
  const prompt = `Write a short, genuine outreach DM from the Perfume Picks app to a fragrance community influencer.

Influencer handle: ${influencer.handle}
Platform: ${influencer.platform}
Why they're a good fit: ${influencer.why_good_fit}
Sample of their recent content: ${influencer.recent_content_sample}

DM guidelines:
- 3-5 sentences max. Short and human.
- Reference something specific about their content or community contributions
- Pitch a collaboration: free app access, early features, content partnership
- No corporate language. Sound like a fragrance enthusiast who built an app.
- No "I hope this message finds you well" or similar filler
- End with a clear, low-commitment ask (just asking if they're interested)

Return just the DM text, nothing else.`;

  const result = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return result.content[0].type === 'text' ? result.content[0].text.trim() : '';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY required');

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const influencers: Influencer[] = [];

  // Load existing list to avoid duplicates
  const outputFile = path.join(OUTPUT_DIR, 'influencer-list.json');
  const existing: Influencer[] = fs.existsSync(outputFile)
    ? JSON.parse(fs.readFileSync(outputFile, 'utf-8'))
    : [];
  const existingHandles = new Set(existing.map(i => `${i.platform}:${i.handle}`));

  if (platformFilter === 'all' || platformFilter === 'reddit') {
    if (!REDDIT_CLIENT_ID) {
      console.log('Skipping Reddit (no credentials). Set REDDIT_CLIENT_ID etc. to enable.');
    } else {
      console.log('Finding active Reddit fragrance community members...');
      const subreddits = ['fragrance', 'Frugal_Fragrance'];

      for (const sub of subreddits) {
        console.log(`  Scanning r/${sub}...`);
        try {
          const commenters = await getTopCommenters(sub);
          const newCommenters = commenters.filter(u => !existingHandles.has(`reddit:${u}`));

          for (const username of newCommenters.slice(0, 8)) {
            try {
              console.log(`    → u/${username}`);
              const info = await getUserInfo(username);

              if (info.commentKarma < 100) continue; // skip low-karma accounts
              if (info.recentFragrancePosts.length === 0) continue; // not active in fragrance

              const contentSample = info.recentFragrancePosts[0]?.slice(0, 200) ?? '';
              const whyGoodFit = `Active r/${sub} contributor with ${info.commentKarma} comment karma, posts frequently about fragrance`;

              const dm = await draftOutreachDM(anthropic, {
                handle: username,
                platform: 'reddit',
                why_good_fit: whyGoodFit,
                recent_content_sample: contentSample,
              });

              influencers.push({
                handle: username,
                platform: 'reddit',
                profile_url: `https://www.reddit.com/user/${username}`,
                estimated_reach: `${info.commentKarma} karma`,
                niche_fit: info.commentKarma > 1000 ? 'high' : 'medium',
                why_good_fit: whyGoodFit,
                recent_content_sample: contentSample,
                drafted_dm: dm,
                outreach_status: 'pending',
                notes: '',
                discovered_at: new Date().toISOString(),
              });

              existingHandles.add(`reddit:${username}`);
              await new Promise(r => setTimeout(r, 500));
            } catch (err) {
              console.warn(`    Skipped u/${username}: ${(err as Error).message}`);
            }
          }
        } catch (err) {
          console.warn(`  Failed r/${sub}: ${(err as Error).message}`);
        }
      }
    }
  }

  // Manually curated handles can be added here for Instagram/TikTok/YouTube
  // These must be populated by human research — no scraping ToS-compliant sources
  console.log('\nNote: Instagram and TikTok influencers must be added manually.');
  console.log('Add them directly to the influencer-list.json file with platform="instagram" or "tiktok".');
  console.log('Common sources: Fragrantica reviewer pages, TikTok #fragrancetok tag, Instagram #perfumecollection\n');

  // Merge with existing
  const merged = [
    ...existing.filter(i => i.outreach_status !== 'pending' || !influencers.find(n => n.handle === i.handle && n.platform === i.platform)),
    ...influencers,
  ].slice(0, 500); // cap at 500 total

  // Sort: high niche fit first, then pending outreach
  merged.sort((a, b) => {
    const fitScore = { high: 3, medium: 2, low: 1 };
    if (fitScore[b.niche_fit] !== fitScore[a.niche_fit]) return fitScore[b.niche_fit] - fitScore[a.niche_fit];
    const statusScore = { pending: 3, sent: 2, responded: 1, partnership: 0 };
    return statusScore[b.outreach_status] - statusScore[a.outreach_status];
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2));

  console.log(`\nInfluencer list updated: ${merged.length} total (${influencers.length} new)`);
  console.log(`Saved to: ${outputFile}`);

  // Print this week's targets
  const thisWeek = merged.filter(i => i.outreach_status === 'pending' && i.niche_fit !== 'low').slice(0, 7);
  if (thisWeek.length > 0) {
    console.log(`\nThis week's outreach targets (${thisWeek.length}):`);
    for (const inf of thisWeek) {
      console.log(`\n  [${inf.platform}] ${inf.handle} — ${inf.niche_fit} fit`);
      console.log(`  Profile: ${inf.profile_url}`);
      console.log(`  DM draft:\n  ${inf.drafted_dm.replace(/\n/g, '\n  ')}`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
