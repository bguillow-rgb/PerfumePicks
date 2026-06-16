// Daily SEO post generator. Researches current high-intent keywords in this
// site's vertical via the Claude API + web search, picks ONE target query not
// already covered, writes a schema-compliant article to
// src/content/articles/<slug>.md, then refreshes the relatedSlugs internal-link
// mesh across all articles. It does NOT build, commit, or deploy — the GitHub
// Actions workflow does that after this script writes the files.
//
// Usage:  ANTHROPIC_API_KEY=... node scripts/daily-post.mjs
// Exit 0 + no file written means "nothing new to publish today" (not an error).
import { writeFileSync, existsSync } from 'node:fs';
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
  console.error('daily-post: ANTHROPIC_API_KEY is not set. Aborting.');
  process.exit(1);
}

const SITE = loadSite(join(WEB_DIR, 'src/consts.ts'));

// Existing articles: dedupe + give the model the current cluster map.
const existing = readArticleMeta(ARTICLES_DIR);
const existingSlugs = new Set(existing.map((a) => a.slug));
const existingList =
  existing.map((a) => `- ${a.slug} | "${a.title}" | target: ${a.targetQuery}`).join('\n') ||
  '(none yet)';

const today = new Date().toISOString().slice(0, 10);

let article;
try {
  article = await generateArticle({
    apiKey: API_KEY,
    model: MODEL,
    site: SITE,
    tier: 'detail',
    existingList,
    existingSlugs,
    today,
  });
} catch (e) {
  console.error(`daily-post: generation failed: ${e.message}`);
  process.exit(1);
}

if (existingSlugs.has(article.slug)) {
  console.log(`daily-post: slug "${article.slug}" already exists — nothing new to publish today.`);
  process.exit(0);
}
if (existsSync(join(ARTICLES_DIR, `${article.slug}.md`))) {
  console.log(`daily-post: ${article.slug}.md already exists — skipping.`);
  process.exit(0);
}

article.fallbackAuthor = SITE.author;
await publishArticle({ article, articlesDir: ARTICLES_DIR, today });
console.log(`daily-post: wrote ${article.slug}.md`);
console.log(`  title:   ${article.title}`);
console.log(`  target:  ${article.targetQuery}`);
console.log(`  related: ${article.relatedSlugs.join(', ') || '(none)'}`);

// New article changes the cluster, so older articles can now link to it.
relinkDir(ARTICLES_DIR);
console.log('daily-post: refreshed relatedSlugs mesh');

// Emit the new slug for the workflow (GitHub Actions reads stdout / file).
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `slug=${article.slug}\nwrote=true\n`, { flag: 'a' });
}
