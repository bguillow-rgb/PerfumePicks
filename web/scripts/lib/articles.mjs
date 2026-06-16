// Shared helpers for the content pipeline (daily-post.mjs, seed-content.mjs).
// Pure Node, no Astro imports, so the scripts stay portable.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Tokens too generic to signal topical relatedness on this site — every article
// is about fragrance/perfume collecting, so those words carry no signal.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with',
  'you', 'your', 'how', 'can', 'get', 'is', 'are', 'do', 'does', 'no',
  'what', 'why', 'when', 'who', 'will', 'us', 'usa', 'guide', '2026',
  'without', 'best', 'perfume', 'perfumes', 'fragrance', 'fragrances', 'scent',
]);

function tokens(s) {
  return new Set(
    (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(
      (w) => w.length > 2 && !STOP.has(w)
    )
  );
}

// Read every article's frontmatter from a content dir into a light object.
// Body is excluded — callers that need it read the file themselves.
export function readArticleMeta(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const raw = readFileSync(join(dir, f), 'utf8');
      const fm = raw.split('---')[1] || '';
      const str = (key) =>
        (fm.match(new RegExp(`${key}:\\s*"([^"]+)"`)) ||
          fm.match(new RegExp(`${key}:\\s*'([^']+)'`)) ||
          [])[1] || '';
      // relatedQueries is a YAML list; pull the quoted items under it.
      const rqBlock = (fm.match(/relatedQueries:([\s\S]*?)\n[a-zA-Z]/) || [])[1] || '';
      const relatedQueries = [...rqBlock.matchAll(/-\s*"([^"]+)"|-\s*'([^']+)'/g)].map(
        (m) => m[1] || m[2]
      );
      return {
        slug: f.replace(/\.md$/, ''),
        title: str('title'),
        targetQuery: str('targetQuery'),
        tier: (fm.match(/tier:\s*"?([a-z]+)"?/) || [])[1] || 'detail',
        relatedQueries,
      };
    });
}

// Score every other article by token overlap (title + targetQuery + related
// queries) and return the top `max` slugs. Falls back to the highest-scoring
// siblings when nothing shares signal, so the mesh is never empty once two+
// articles exist.
export function computeRelated(target, all, max = 4) {
  const tt = tokens(
    [target.title, target.targetQuery, (target.relatedQueries || []).join(' ')].join(' ')
  );
  const scored = all
    .filter((a) => a.slug !== target.slug)
    .map((a) => {
      const at = tokens(
        [a.title, a.targetQuery, (a.relatedQueries || []).join(' ')].join(' ')
      );
      let overlap = 0;
      for (const w of tt) if (at.has(w)) overlap++;
      return { slug: a.slug, score: overlap };
    })
    .sort((x, y) => y.score - x.score || x.slug.localeCompare(y.slug));
  const withSignal = scored.filter((s) => s.score > 0).slice(0, max).map((s) => s.slug);
  return withSignal.length ? withSignal : scored.slice(0, max).map((s) => s.slug);
}

// Rewrite the relatedSlugs block in a raw markdown file. The frontmatter always
// orders relatedSlugs immediately before faqs, so we splice between them.
export function setRelatedSlugs(raw, slugs) {
  const list = slugs.length
    ? '\n' + slugs.map((s) => `  - ${JSON.stringify(s)}`).join('\n')
    : ' []';
  return raw.replace(/relatedSlugs:[\s\S]*?(?=\nfaqs:)/, `relatedSlugs:${list}`);
}
