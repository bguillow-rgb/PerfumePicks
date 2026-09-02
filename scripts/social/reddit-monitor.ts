/**
 * Reddit Monitor — finds fragrance questions and drafts helpful responses
 *
 * Does NOT auto-post. Outputs a JSON draft file for human review.
 * Human reviews, picks the best ones, and posts manually.
 *
 * Voice: real community member, knowledgeable, no promotion unless it
 * genuinely fits. Follows perfume-picks-social skill voice rules.
 *
 * Usage:
 *   npx ts-node scripts/social/reddit-monitor.ts
 *   npx ts-node scripts/social/reddit-monitor.ts --subreddits r/fragrance,r/Frugal_Fragrance
 *   npx ts-node scripts/social/reddit-monitor.ts --limit 20
 *
 * Env vars required:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *   ANTHROPIC_API_KEY
 *
 * Env vars optional:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (for catalog lookups)
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
}

interface DraftResponse {
  post_id: string;
  subreddit: string;
  post_title: string;
  post_url: string;
  post_author: string;
  post_score: number;
  post_body_preview: string;
  category: string;
  draft_response: string;
  include_app_mention: boolean;
  confidence: 'high' | 'medium' | 'low';
  generated_at: string;
  // Human fills these:
  approved?: boolean;
  posted?: boolean;
  posted_at?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID ?? '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET ?? '';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME ?? '';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD ?? '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OUTPUT_DIR = path.join(__dirname, 'data');

const args = process.argv.slice(2);
const limitArg = parseInt(args.find((_, i) => args[i - 1] === '--limit') ?? '30');
const subredditsArg = args.find((_, i) => args[i - 1] === '--subreddits') ?? null;

const SUBREDDITS = subredditsArg
  ? subredditsArg.split(',').map(s => s.replace(/^r\//, ''))
  : ['fragrance', 'Frugal_Fragrance', 'DesiFragranceAddicts', 'fragrance_recommendations'];

// Categories of posts we're interested in
const RELEVANT_CATEGORIES = [
  'recommendation_request',  // "What should I buy", "looking for something that smells like..."
  'dupe_question',           // "cheaper alternative to X", "dupe for Y"
  'blind_buy_help',          // "is X worth buying blind?"
  'beginner_question',       // "just getting into fragrance"
  'fragrance_discussion',    // general discussion we can add value to
] as const;

type PostCategory = typeof RELEVANT_CATEGORIES[number];

// ─── Reddit API ───────────────────────────────────────────────────────────────

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
    body: new URLSearchParams({
      grant_type: 'password',
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
  });

  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  redditToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return redditToken;
}

async function redditGet(endpoint: string): Promise<unknown> {
  const token = await getRedditToken();
  const res = await fetch(`https://oauth.reddit.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'PerfumePicks/1.0 (by u/PerfumePicks)',
    },
  });
  if (!res.ok) throw new Error(`Reddit API error ${res.status} on ${endpoint}`);
  return res.json();
}

async function getNewPosts(subreddit: string, limit = 25): Promise<RedditPost[]> {
  const data = await redditGet(`/r/${subreddit}/new.json?limit=${limit}&sort=new`) as {
    data: { children: Array<{ data: RedditPost }> };
  };
  return data.data.children.map(c => c.data);
}

async function getHotPosts(subreddit: string, limit = 25): Promise<RedditPost[]> {
  const data = await redditGet(`/r/${subreddit}/hot.json?limit=${limit}`) as {
    data: { children: Array<{ data: RedditPost }> };
  };
  return data.data.children.map(c => c.data);
}

// ─── Post filtering ───────────────────────────────────────────────────────────

function classifyPost(post: RedditPost): PostCategory | null {
  const text = (post.title + ' ' + post.selftext).toLowerCase();

  const dupePatterns = ['dupe', 'alternative', 'cheaper', 'similar to', 'smells like', 'inspired by', 'clone'];
  if (dupePatterns.some(p => text.includes(p))) return 'dupe_question';

  const recPatterns = ['recommend', 'suggest', 'looking for', 'what should i', 'help me find', 'what fragrance', 'which fragrance', 'need a fragrance'];
  if (recPatterns.some(p => text.includes(p))) return 'recommendation_request';

  const blindBuyPatterns = ['blind buy', 'worth it', 'worth buying', 'should i get', 'should i buy'];
  if (blindBuyPatterns.some(p => text.includes(p))) return 'blind_buy_help';

  const beginnerPatterns = ['new to fragrance', 'just started', 'getting into', 'beginner', 'first fragrance'];
  if (beginnerPatterns.some(p => text.includes(p))) return 'beginner_question';

  // Only include general discussion if it has decent engagement
  if (post.score > 10 && post.num_comments > 3) return 'fragrance_discussion';

  return null;
}

function isRecentEnough(post: RedditPost, hoursBack = 24): boolean {
  return Date.now() / 1000 - post.created_utc < hoursBack * 3600;
}

// ─── Response generation ──────────────────────────────────────────────────────

async function generateResponse(anthropic: Anthropic, post: RedditPost, category: PostCategory): Promise<{
  response: string;
  include_app_mention: boolean;
  confidence: 'high' | 'medium' | 'low';
}> {
  const bodyPreview = post.selftext.slice(0, 800);

  const prompt = `You are an experienced fragrance enthusiast participating in r/${post.subreddit} on Reddit. You are knowledgeable, specific, and helpful. You do NOT represent a brand. You participate as a genuine community member.

Reddit post:
Title: ${post.title}
Body: ${bodyPreview || '(no body text — title only post)'}
Category: ${category}

Write a helpful response following these rules:
1. Be specific and opinionated — give a real recommendation or take, not "it depends"
2. Sound like a real community member, not a brand representative
3. No promotional tone. You're here to help, not market
4. 2-5 sentences typically. Can be longer if the question warrants it
5. No hashtags. No em dashes. No "Great question!" opener
6. You can mention the Perfume Picks app ONLY if it directly helps them (e.g., they want to track their collection, find dupes, get recommendations) — and only if it flows naturally. NOT as a drop at the end
7. Use fragrance vocabulary naturally when it helps (you can use "drydown", "longevity", etc. in community context — just don't sound like a reviewer scoring bottles)

Return JSON:
{
  "response": "...",
  "include_app_mention": true/false,
  "confidence": "high/medium/low"  // how confident you are this response adds real value
}

Confidence guide:
- high: you have specific, relevant fragrance knowledge that directly answers their question
- medium: you can add some value but the response is somewhat generic
- low: the question is too vague, outside your knowledge, or already well-answered by obvious things`;

  const result = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = result.content[0].type === 'text' ? result.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { response: text.trim(), include_app_mention: false, confidence: 'low' };
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required.\nCreate a Reddit app at reddit.com/prefs/apps (script type).');
  }
  if (!ANTHROPIC_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required.');
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const drafts: DraftResponse[] = [];
  const seenIds = new Set<string>();

  console.log(`Monitoring subreddits: r/${SUBREDDITS.join(', r/')}`);

  for (const subreddit of SUBREDDITS) {
    console.log(`\nFetching r/${subreddit}...`);

    let posts: RedditPost[] = [];
    try {
      const [newPosts, hotPosts] = await Promise.all([
        getNewPosts(subreddit, 25),
        getHotPosts(subreddit, 25),
      ]);
      posts = [...newPosts, ...hotPosts].filter(p => !seenIds.has(p.id));
      posts.forEach(p => seenIds.add(p.id));
    } catch (err) {
      console.warn(`  Failed to fetch r/${subreddit}: ${(err as Error).message}`);
      continue;
    }

    const relevant = posts
      .filter(p => isRecentEnough(p, 36))
      .map(p => ({ post: p, category: classifyPost(p) }))
      .filter((x): x is { post: RedditPost; category: PostCategory } => x.category !== null);

    console.log(`  Found ${relevant.length} relevant posts out of ${posts.length}`);

    for (const { post, category } of relevant.slice(0, limitArg)) {
      console.log(`  → [${category}] ${post.title.slice(0, 70)}`);

      try {
        const { response, include_app_mention, confidence } = await generateResponse(anthropic, post, category);

        drafts.push({
          post_id: post.id,
          subreddit: post.subreddit,
          post_title: post.title,
          post_url: `https://www.reddit.com${post.permalink}`,
          post_author: post.author,
          post_score: post.score,
          post_body_preview: post.selftext.slice(0, 300),
          category,
          draft_response: response,
          include_app_mention,
          confidence,
          generated_at: new Date().toISOString(),
        });

        // Respect Reddit API rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.warn(`    Draft failed: ${(err as Error).message}`);
      }
    }
  }

  // Sort by confidence then engagement
  drafts.sort((a, b) => {
    const confScore = { high: 3, medium: 2, low: 1 };
    return confScore[b.confidence] - confScore[a.confidence];
  });

  // Save to file
  const date = new Date().toISOString().split('T')[0];
  const filename = path.join(OUTPUT_DIR, `reddit-drafts-${date}.json`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(drafts, null, 2));

  // Summary
  const highConf = drafts.filter(d => d.confidence === 'high').length;
  const medConf = drafts.filter(d => d.confidence === 'medium').length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Drafted ${drafts.length} responses:`);
  console.log(`  High confidence: ${highConf}`);
  console.log(`  Medium confidence: ${medConf}`);
  console.log(`  Low confidence: ${drafts.length - highConf - medConf}`);
  console.log(`\nSaved to: ${filename}`);
  console.log(`\nReview the drafts, set "approved": true on the ones you like,`);
  console.log(`then post them manually or via reddit-poster.ts (Phase 2).`);

  // Print high-confidence drafts to console for quick review
  const highDrafts = drafts.filter(d => d.confidence === 'high').slice(0, 3);
  if (highDrafts.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('HIGH CONFIDENCE DRAFTS (top 3):');
    for (const draft of highDrafts) {
      console.log(`\n[r/${draft.subreddit}] ${draft.post_title.slice(0, 70)}`);
      console.log(`URL: ${draft.post_url}`);
      console.log(`Response:\n${draft.draft_response}`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
