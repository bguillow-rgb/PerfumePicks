# Perfume Picks — Marketing & Content Site

The public-facing site at https://perfumepicks.app. Built with Astro,
deployed through GitHub Pages from `/docs`.

## Local development

```bash
cd web
npm install
npm run dev    # http://localhost:4321
```

## Build

```bash
npm run build
```

Output is in `web/dist`.

## Deploy

GitHub Pages serves `/docs` from `main`. Day-to-day deploy is one
script + one push:

```bash
cd web
npm run build
bash scripts/deploy-to-docs.sh
cd ..
git add docs && git commit -m "publish: <what changed>" && git push
```

GitHub Pages picks up the change and rebuilds in ~60 sec.

The repo must be **public** OR on a paid GitHub plan for Pages to
work. After the first publish, verify Pages is configured at:
Settings → Pages → Source = "Deploy from a branch", Branch = `main`,
Folder = `/docs`.

(Optional, after publishing new articles) ping IndexNow so search
engines re-crawl quickly:

```bash
PUBLIC_INDEXNOW_KEY=<your-key> bash scripts/indexnow-ping.sh
```

## Structure

```
web/
├── public/                 # static assets copied verbatim to dist/
│   ├── CNAME
│   ├── robots.txt          # allows AI crawlers explicitly
│   ├── llms.txt            # canonical content index for LLMs
│   ├── favicon.png
│   └── icon-512.png
├── src/
│   ├── consts.ts           # single source of truth for SITE config
│   ├── content/
│   │   ├── config.ts       # collection schemas (articles, pillar)
│   │   ├── articles/       # detail-tier posts (markdown/MDX)
│   │   └── pillar/         # pillar pages (markdown/MDX)
│   ├── components/
│   │   ├── schema/         # JSON-LD components per schema type
│   │   ├── QuickAnswer.astro
│   │   ├── FAQ.astro
│   │   └── Footer.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── ArticleLayout.astro
│   └── pages/
│       ├── index.astro
│       ├── about.astro
│       ├── features.astro
│       ├── support.astro
│       ├── privacy.astro
│       ├── terms.astro
│       ├── delete-account.astro
│       ├── 404.astro
│       └── articles/
│           ├── index.astro
│           └── [...slug].astro
└── astro.config.mjs        # sitemap + MDX integrations
```

## SEO / AEO infrastructure

This site is set up against the SEO/Content/ASO playbook in `~/.claude/CLAUDE.md`.

- **Schema** — JSON-LD on every page: `Organization` + `WebSite` (global),
  `MobileApplication` (homepage, with `applicationSubCategory: Fragrance`),
  `AboutPage` + `Person` (about page), `Article` + `Speakable` (articles),
  `BreadcrumbList`, `FAQPage`.
- **AEO** — `llms.txt` at root, `robots.txt` allows AI crawlers, every page
  has a Quick Answer block (id="quick-answer") that Speakable schema points
  at, FAQ at the bottom of content pages with `FAQPage` schema.
- **E-E-A-T** — `/about` is the entity anchor with founder bio and editorial
  standards. Articles are bylined and dated.
- **Sitemap** — generated automatically on each build by `@astrojs/sitemap`.

## Affiliate disclosure

Some fragrance detail pages and articles include "Buy from" links to
retailers (FragranceX, Sephora, Amazon Luxury Beauty, others). These are
affiliate links — see the footer and `/terms` for the disclosure language.
Pages that include affiliate links must surface that fact near the link
itself, per FTC guidance.

## Adding a new article

Create a markdown file under `src/content/articles/`. Frontmatter is enforced
by `src/content/config.ts`.

```markdown
---
title: "How long does a fragrance really last on skin?"
description: "Field-tested answer for collectors comparing longevity across families and bottle batches."
targetQuery: "how long does perfume last on skin"
relatedQueries:
  - "fragrance longevity by family"
  - "edp vs edt longevity"
quickAnswer: "Modern eau de parfum typically lasts 6 to 10 hours on skin under everyday conditions, while eau de toilette drops to 3 to 6 hours. Niche orientals and amber-heavy compositions can push past 12 hours, and oils last longer than alcohol-based sprays."
publishedAt: "2026-05-01"
author: "Bob Guillow"
relatedSlugs:
  - "fragrance-families-explained"
faqs:
  - q: "Why does the same fragrance smell different on different people?"
    a: "Skin chemistry, hydration, and diet shift the dry-down. Heat and friction speed up the top notes, so an active day exposes the heart and base sooner than a desk day."
---

Body content here. Use H2 questions like "What happens in the first hour?" —
these become AI extraction targets.
```
