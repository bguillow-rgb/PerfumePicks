/**
 * Bluesky Auto-Poster
 *
 * Posts the daily FOTD to Bluesky using the AT Protocol (no SDK needed — raw fetch).
 * Reads from scripts/social/data/fotd-latest.json (written by fotd-generator.ts).
 *
 * Usage:
 *   npx ts-node scripts/social/post-bluesky.ts
 *   npx ts-node scripts/social/post-bluesky.ts --dry-run   (print post, don't send)
 *   npx ts-node scripts/social/post-bluesky.ts --text "Custom post text"
 *
 * Env vars required:
 *   BSKY_IDENTIFIER   — e.g. perfumepicks.bsky.social
 *   BSKY_APP_PASSWORD — generate at bsky.social Settings → App Passwords
 *
 * Run fotd-generator.ts first, or pass --text for a one-off post.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BskySession {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BskyPostRecord {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs?: string[];
  facets?: BskyFacet[];
}

interface BskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string; tag?: string }>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BSKY_HOST = 'https://bsky.social';
const IDENTIFIER = process.env.BSKY_IDENTIFIER ?? '';
const APP_PASSWORD = process.env.BSKY_APP_PASSWORD ?? '';
const FOTD_PATH = path.join(__dirname, 'data', 'fotd-latest.json');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const textOverride = args.find((_, i) => args[i - 1] === '--text') ?? null;

// ─── AT Protocol helpers ──────────────────────────────────────────────────────

async function bskyFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BSKY_HOST}/xrpc/${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bluesky API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

async function createSession(): Promise<BskySession> {
  return bskyFetch('com.atproto.server.createSession', {
    method: 'POST',
    body: JSON.stringify({ identifier: IDENTIFIER, password: APP_PASSWORD }),
  }) as Promise<BskySession>;
}

/**
 * Detect URLs and hashtags in text and return facet annotations.
 * Bluesky requires byte-level offsets (UTF-8).
 */
function buildFacets(text: string): BskyFacet[] {
  const facets: BskyFacet[] = [];
  const encoder = new TextEncoder();

  // URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const before = encoder.encode(text.slice(0, match.index)).length;
    const after = encoder.encode(text.slice(0, match.index + match[0].length)).length;
    facets.push({
      index: { byteStart: before, byteEnd: after },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }],
    });
  }

  // Hashtags
  const hashtagRegex = /#(\w+)/g;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const before = encoder.encode(text.slice(0, match.index)).length;
    const after = encoder.encode(text.slice(0, match.index + match[0].length)).length;
    facets.push({
      index: { byteStart: before, byteEnd: after },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: match[1] }],
    });
  }

  return facets;
}

async function createPost(session: BskySession, text: string): Promise<{ uri: string; cid: string }> {
  const facets = buildFacets(text);
  const record: BskyPostRecord = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
    ...(facets.length > 0 ? { facets } : {}),
  };

  return bskyFetch('com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  }) as Promise<{ uri: string; cid: string }>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!IDENTIFIER || !APP_PASSWORD) {
    throw new Error('BSKY_IDENTIFIER and BSKY_APP_PASSWORD env vars are required.\nGenerate an app password at bsky.social → Settings → App Passwords.');
  }

  // Get post text
  let postText: string;

  if (textOverride) {
    postText = textOverride;
  } else if (fs.existsSync(FOTD_PATH)) {
    const fotd = JSON.parse(fs.readFileSync(FOTD_PATH, 'utf-8'));
    postText = fotd.posts?.bluesky;
    if (!postText) throw new Error(`fotd-latest.json exists but has no posts.bluesky field`);
    console.log(`Using FOTD: ${fotd.brand_name} ${fotd.fragrance_name}`);
  } else {
    throw new Error(`No FOTD file found at ${FOTD_PATH}. Run fotd-generator.ts first.`);
  }

  // Validate length
  if (postText.length > 300) {
    console.warn(`Post is ${postText.length} chars (Bluesky limit ~300). Truncating.`);
    postText = postText.slice(0, 297) + '...';
  }

  console.log('\nPost text:');
  console.log('─'.repeat(60));
  console.log(postText);
  console.log('─'.repeat(60));
  console.log(`Length: ${postText.length} chars`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would post to Bluesky. Skipping.');
    return;
  }

  console.log('\nAuthenticating with Bluesky...');
  const session = await createSession();
  console.log(`Authenticated as @${session.handle}`);

  console.log('Posting...');
  const result = await createPost(session, postText);
  console.log(`\nPosted! URI: ${result.uri}`);
  console.log(`View at: https://bsky.app/profile/${session.handle}/post/${result.uri.split('/').pop()}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
