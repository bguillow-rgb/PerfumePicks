// One-shot content seeder. Builds out the cluster fast:
//   --count N   generate N new detail articles (default 10), deduping against
//               existing + each other.
//   --pillar    generate ONE comprehensive pillar article (3000-5000 words).
//   --topic "…" optional theme hint to bias the batch toward a cluster gap.
// At least one of --count / --pillar must be given. Run manually (or via the
// seed-content workflow) — NOT on the daily cron.
//
// Usage:  ANTHROPIC_API_KEY=... node scripts/seed-content.mjs --count 12 --pillar --topic "fragrance storage"
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { loadSite, generateArticle } from './lib/generate.mjs';
import { readArticleMeta } from './lib/articles.mjs';
import { publishArticle, relinkDir } from './lib/publish.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, '..');
const ARTICLES_DIR = join(WEB_DIR, 'src/content/articles');

const MODEL = process.env.DAILY_POST_MODEL || 'claude-sonnet-4-6';
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('seed-content: ANTHROPIC_API_KEY is not set. Aborting.');
  process.exit(1);
}

// Args
const args = process.argv.slice(2);
const wantPillar = args.includes('--pillar');
const countArg = args.indexOf('--count');
const count = countArg >= 0 ? parseInt(args[countArg + 1], 10) || 0 : wantPillar ? 0 : 10;
if (!wantPillar && count <= 0) {
  console.error('seed-content: pass --count N and/or --pillar.');
  process.exit(1);
}
const topicArg = args.indexOf('--topic');
const topicHint = topicArg >= 0 ? (args[topicArg + 1] || '').trim() || undefined : undefined;

const SITE = loadSite(join(WEB_DIR, 'src/consts.ts'));
const today = new Date().toISOString().slice(0, 10);

// Track the live set in memory so each generation dedupes against the ones we
// just wrote in this run (the model is told the current slug + topic list).
let meta = readArticleMeta(ARTICLES_DIR);
const slugSet = new Set(meta.map((a) => a.slug));
const listFor = () =>
  meta.map((a) => `- ${a.slug} | "${a.title}" | target: ${a.targetQuery}`).join('\n') || '(none yet)';

let wrote = 0;

async function seedOne(tier) {
  let article;
  try {
    article = await generateArticle({
      apiKey: API_KEY,
      model: MODEL,
      site: SITE,
      tier,
      existingList: listFor(),
      existingSlugs: slugSet,
      today,
      topicHint: tier === 'detail' ? topicHint : undefined,
    });
  } catch (e) {
    console.error(`seed-content: ${tier} generation failed: ${e.message}`);
    return;
  }
  if (slugSet.has(article.slug) || existsSync(join(ARTICLES_DIR, `${article.slug}.md`))) {
    console.log(`seed-content: duplicate slug "${article.slug}" — skipping.`);
    return;
  }
  article.fallbackAuthor = SITE.author;
  await publishArticle({ article, articlesDir: ARTICLES_DIR, today });
  slugSet.add(article.slug);
  meta = readArticleMeta(ARTICLES_DIR);
  wrote++;
  console.log(`seed-content: [${tier}] ${article.slug} — ${article.title}`);
}

if (wantPillar) {
  // One canonical hub per site — don't seed a second pillar.
  if (meta.some((a) => a.tier === 'pillar')) {
    console.log('seed-content: a pillar already exists — skipping --pillar.');
  } else {
    await seedOne('pillar');
  }
}

for (let i = 0; i < count; i++) {
  await seedOne('detail');
}

// Final mesh refresh so every article (new + old) links to the full set.
relinkDir(ARTICLES_DIR);
console.log(`seed-content: done — wrote ${wrote} article(s) + refreshed mesh`);
