// Assemble an article markdown file (frontmatter + body) from a plain object.
// Shared by daily-post.mjs and seed-content.mjs so every generated file matches
// the content-collection schema exactly. Field order matters: relatedSlugs is
// kept immediately before faqs (setRelatedSlugs in articles.mjs relies on it).

// Strip web-search citation markup the model can leave behind (<cite ...>text
// </cite>) while keeping the inner text. Also collapse the stray [n] artifacts.
export const stripCites = (s) =>
  String(s ?? '')
    .replace(/<\/?cite[^>]*>/gi, '')
    .replace(/\[\d+(?:-\d+)*\]/g, '');

const yamlStr = (s) => JSON.stringify(stripCites(s)); // double-quoted, escaped
const yamlList = (arr) =>
  (arr || []).length ? '\n' + arr.map((x) => `  - ${yamlStr(x)}`).join('\n') : ' []';
const yamlFaqs = (faqs) =>
  (faqs || []).length
    ? '\n' + faqs.map((f) => `  - q: ${yamlStr(f.q)}\n    a: ${yamlStr(f.a)}`).join('\n')
    : ' []';

export function buildMarkdown(a) {
  return [
    '---',
    `title: ${yamlStr(a.title)}`,
    `description: ${yamlStr(a.description)}`,
    `tier: ${yamlStr(a.tier || 'detail')}`,
    `targetQuery: ${yamlStr(a.targetQuery)}`,
    `relatedQueries:${yamlList(a.relatedQueries)}`,
    `quickAnswer: ${yamlStr(a.quickAnswer)}`,
    `publishedAt: ${yamlStr(a.publishedAt)}`,
    `author: ${yamlStr(a.author)}`,
    `relatedSlugs:${yamlList(a.relatedSlugs)}`,
    `faqs:${yamlFaqs(a.faqs)}`,
    `published: ${a.published === false ? 'false' : 'true'}`,
    '---',
    '',
    stripCites(a.bodyMarkdown).trim(),
    '',
  ].join('\n');
}
