/**
 * Threads Auto-Poster / Drafter
 *
 * Posts the daily FOTD to Threads using Meta's Threads API (launched June 2024).
 * Falls back to draft mode (saves to file) if no credentials are configured.
 *
 * Setup required:
 *   1. Create a Meta Developer app at developers.facebook.com
 *   2. Add the "Threads API" product to your app
 *   3. Submit for Meta App Review (allow 1-2 weeks)
 *   4. Generate a long-lived user access token
 *
 * API docs: https://developers.facebook.com/docs/threads
 *
 * Usage:
 *   npx ts-node scripts/social/threads-drafter.ts
 *   npx ts-node scripts/social/threads-drafter.ts --dry-run
 *   npx ts-node scripts/social/threads-drafter.ts --text "Custom post"
 *
 * Env vars:
 *   THREADS_ACCESS_TOKEN  — long-lived user access token
 *   THREADS_USER_ID       — your Threads user ID (numeric)
 *
 * Without those env vars, runs in draft mode and saves to data/threads-drafts-DATE.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN ?? '';
const USER_ID = process.env.THREADS_USER_ID ?? '';
const FOTD_PATH = path.join(__dirname, 'data', 'fotd-latest.json');
const OUTPUT_DIR = path.join(__dirname, 'data');
const THREADS_API = 'https://graph.threads.net/v1.0';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const textOverride = args.find((_, i) => args[i - 1] === '--text') ?? null;

// ─── Threads API ──────────────────────────────────────────────────────────────

/**
 * Step 1: Create a media container
 * Step 2: Publish the container
 * (Threads API is a two-step process)
 */
async function createContainer(text: string): Promise<string> {
  const params = new URLSearchParams({
    media_type: 'TEXT',
    text,
    access_token: ACCESS_TOKEN,
  });

  const res = await fetch(`${THREADS_API}/${USER_ID}/threads`, {
    method: 'POST',
    body: params,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads create container failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

async function publishContainer(containerId: string): Promise<{ id: string }> {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: ACCESS_TOKEN,
  });

  const res = await fetch(`${THREADS_API}/${USER_ID}/threads_publish`, {
    method: 'POST',
    body: params,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads publish failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<{ id: string }>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Get post text
  let postText: string;
  let fragranceName = '';

  if (textOverride) {
    postText = textOverride;
  } else if (fs.existsSync(FOTD_PATH)) {
    const fotd = JSON.parse(fs.readFileSync(FOTD_PATH, 'utf-8'));
    postText = fotd.posts?.threads;
    fragranceName = `${fotd.brand_name} ${fotd.fragrance_name}`;
    if (!postText) throw new Error('fotd-latest.json has no posts.threads field');
    console.log(`Using FOTD: ${fragranceName}`);
  } else {
    throw new Error(`No FOTD file at ${FOTD_PATH}. Run fotd-generator.ts first.`);
  }

  console.log('\nPost text:');
  console.log('─'.repeat(60));
  console.log(postText);
  console.log('─'.repeat(60));
  console.log(`Length: ${postText.length} chars`);

  // Check if we're in draft mode (no credentials)
  const hasCredentials = ACCESS_TOKEN && USER_ID;

  if (isDryRun || !hasCredentials) {
    if (!hasCredentials) {
      console.log('\n[DRAFT MODE] THREADS_ACCESS_TOKEN or THREADS_USER_ID not set.');
      console.log('Saving draft for manual posting.\n');
      console.log('To enable auto-posting:');
      console.log('  1. Create Meta Developer app at developers.facebook.com');
      console.log('  2. Add Threads API product');
      console.log('  3. Submit for App Review');
      console.log('  4. Set THREADS_ACCESS_TOKEN and THREADS_USER_ID env vars\n');
    } else {
      console.log('\n[DRY RUN] Would post to Threads. Skipping.');
    }

    // Save draft
    const date = new Date().toISOString().split('T')[0];
    const filename = path.join(OUTPUT_DIR, `threads-drafts-${date}.json`);
    const existing = fs.existsSync(filename)
      ? JSON.parse(fs.readFileSync(filename, 'utf-8'))
      : [];

    existing.push({
      fragrance_name: fragranceName,
      post_text: postText,
      generated_at: new Date().toISOString(),
      posted: false,
    });

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(existing, null, 2));
    console.log(`Draft saved to ${filename}`);
    return;
  }

  // Auto-post
  console.log('\nCreating Threads container...');
  const containerId = await createContainer(postText);
  console.log(`Container created: ${containerId}`);

  // Small delay recommended by Meta before publishing
  await new Promise(r => setTimeout(r, 2000));

  console.log('Publishing...');
  const result = await publishContainer(containerId);
  console.log(`\nPosted to Threads! Post ID: ${result.id}`);
  console.log(`View at: https://www.threads.net/@perfumepicks`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
