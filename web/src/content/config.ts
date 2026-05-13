import { defineCollection, z } from 'astro:content';

// Single articles collection. Tier flag distinguishes pillar (3,000-5,000
// words, broad keyword), cluster (1,500-2,500 words, mid-funnel subtopic),
// and detail (800-1,500 words, long-tail).
//
// All three tiers render through src/pages/articles/[...slug].astro and
// share the same ArticleLayout, with optional tier-specific styling.
const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tier: z.enum(['pillar', 'cluster', 'detail']),
    // Exact query the article ranks for. Surface-level ASO discipline:
    // every article must commit to one primary intent.
    targetQuery: z.string(),
    relatedQueries: z.array(z.string()).default([]),
    // 40-60 word direct answer at the top. Marked as the Speakable
    // element so AI engines and voice assistants extract it cleanly.
    quickAnswer: z.string().min(40, 'quickAnswer should be 40-60 words'),
    publishedAt: z.string().transform((s) => new Date(s)),
    updatedAt: z
      .string()
      .transform((s) => new Date(s))
      .optional(),
    author: z.string().default('Bob Guillow'),
    // Internal-link targets in the cluster topology. The article's
    // ArticleLayout renders these as a "Related" block at the bottom.
    relatedSlugs: z.array(z.string()).default([]),
    // FAQ pairs rendered at the bottom and emitted as FAQPage schema.
    faqs: z
      .array(z.object({ q: z.string(), a: z.string() }))
      .default([]),
    // Set false for stub / draft content. The articles index and dynamic
    // route both filter by this.
    published: z.boolean().default(true),
  }),
});

export const collections = { articles };
