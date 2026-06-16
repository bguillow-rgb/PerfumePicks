// "Publish one article" pipeline: compute its relatedSlugs from the current
// cluster, write the markdown file, and refresh the relatedSlugs mesh across all
// articles. Used by daily-post.mjs and seed-content.mjs so both produce
// identical on-disk output. This site is monolingual (English only).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarkdown } from './build-md.mjs';
import { readArticleMeta, computeRelated, setRelatedSlugs } from './articles.mjs';

// Write the article with computed relatedSlugs. Returns { wrote: true }.
export async function publishArticle({ article, articlesDir, today }) {
  if (!existsSync(articlesDir)) mkdirSync(articlesDir, { recursive: true });

  article.author = article.author || article.fallbackAuthor;
  article.publishedAt = article.publishedAt || today;
  article.tier = article.tier || 'detail';

  const meta = readArticleMeta(articlesDir);
  article.relatedSlugs = computeRelated(
    {
      slug: article.slug,
      title: article.title,
      targetQuery: article.targetQuery,
      relatedQueries: article.relatedQueries,
    },
    meta
  );

  writeFileSync(join(articlesDir, `${article.slug}.md`), buildMarkdown(article), 'utf8');
  return { wrote: true };
}

// Recompute and rewrite the relatedSlugs block in every file of a content dir.
export function relinkDir(dir) {
  const meta = readArticleMeta(dir);
  for (const a of meta) {
    const related = computeRelated(a, meta);
    const p = join(dir, `${a.slug}.md`);
    const raw = readFileSync(p, 'utf8');
    const next = setRelatedSlugs(raw, related);
    if (next !== raw) writeFileSync(p, next, 'utf8');
  }
}
