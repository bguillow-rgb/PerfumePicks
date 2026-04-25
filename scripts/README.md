# Perfume Picks — data pipeline

Mirrors the StickPicks / Pour Picks scraper pattern. Run **in tranches**, one
brand or aggregator at a time, never the entire catalog at once.

## Pipeline

```
scrape-{source}.ts         → scripts/data/{source}-raw.json
        │
        ▼
merge-scraped-sources.ts   → scripts/data/merged-candidates.json
        │
        ▼
enrich-catalog-llm.ts      → scripts/data/enriched-candidates.json
        │
        ▼
insert-enriched-catalog.ts → Supabase `brands` + `fragrances` + `fragrance_prices`
        │
        ▼
similarity-precompute.ts   → updates `fragrances.similar_fragrance_ids` + `dupe_of`
```

## Tranche order (planned)

1. **Niche luxury** — Tom Ford, Creed, Maison Francis Kurkdjian, Le Labo, Byredo, Kilian, Frederic Malle, Amouage  *(~150–250 fragrances)*
2. **Designer luxury** — Chanel, Dior, YSL, Guerlain, Hermès, Valentino  *(~200–300)*
3. **Cult / indie** — Diptyque, Maison Margiela, Jo Malone, Aerin, Memo, Nishane  *(~150)*
4. **Aggregator price sweep** — Sephora + Nordstrom + Luckyscent + FragranceX (no new fragrances; fills `fragrance_prices` rows for existing catalog)
5. **Fragrantica enrichment pass** — accords, top_accords, community longevity/sillage/projection, similar_fragrance_ids
6. **Similarity precompute** — `similar_fragrance_ids` + dupe flags, computed offline

Each tranche = scrape → merge → enrich → insert → spot-check → next.

## Required env

```
ANTHROPIC_API_KEY              # for enrich-catalog-llm.ts
SUPABASE_URL                   # for insert-enriched-catalog.ts (use service-role key)
SUPABASE_SERVICE_ROLE_KEY
```

## Run a tranche end-to-end (example)

```bash
# 1. Scrape — one brand at a time
ANTHROPIC_API_KEY=sk-... npx tsx scripts/scrape-tomford.ts
npx tsx scripts/scrape-creed.ts
npx tsx scripts/scrape-mfk.ts

# 2. Merge + dedupe
npx tsx scripts/merge-scraped-sources.ts

# 3. LLM enrich (resumable; safe to re-run)
ANTHROPIC_API_KEY=sk-... npx tsx scripts/enrich-catalog-llm.ts --resume

# 4. Insert
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/insert-enriched-catalog.ts

# 5. Recompute similarity (run after every insert)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/similarity-precompute.ts
```
