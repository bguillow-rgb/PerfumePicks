# Perfume Picks MCP Server

Query the [Perfume Picks](https://perfumepicks.app/) fragrance database from Claude, or any MCP-compatible AI client. Read-only access to 13,000+ fragrances with full note pyramids, accords, curated dupes, and community wear data.

Perfume Picks is the Fragrance DNA and collection journal for iOS — [get it on the App Store](https://apps.apple.com/us/app/perfume-picks/id6774184221).

## Tools

| Tool | What it does |
|---|---|
| `search_fragrances` | Full-text catalog search with brand, family, gender, and MSRP filters |
| `get_fragrance` | Full record for one scent (by slug or name): note pyramid, accords, community scores |
| `find_dupes` | Curated cheaper smell-alikes with match percentage — "what smells like X without the price tag" |
| `find_similar` | Most-similar fragrances from a precomputed similarity ranking |
| `get_recommendations` | Picks from note/accord preferences + budget + occasion + gender |
| `compare_fragrances` | Side-by-side: notes, shared/distinct accords, scores, price delta |
| `trending_fragrances` | What Perfume Picks users are adding to their wardrobes right now |
| `what_to_wear_tonight` | A scent for right now — date-night picks use community compliment data, office picks use office-safety scores |

Every response includes source attribution, a citation-ready summary line, links, and data freshness dates. All scoring is deterministic — no AI calls happen inside the server. All tools are annotated read-only/idempotent.

## Install (Claude Desktop)

Requires Node.js 18+.

Add to your `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "perfume-picks": {
      "command": "npx",
      "args": ["-y", "perfume-picks-mcp"]
    }
  }
}
```

Restart Claude Desktop. No API key or configuration needed — the server ships with public read-only access.

## Configuration (optional)

Environment variables override the defaults (explicit env vars only — this package never reads .env files):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Override the database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Internal use only — unlocks live 30-day wardrobe-add trending. Never distribute this key. |

Without the service key, `trending_fragrances` falls back to catalog popularity and labels the method in its response.

## Development

```bash
npm install
npm run dev     # run from TypeScript via tsx
npm run build   # compile to dist/
npm start       # run compiled server
```

The server speaks MCP over stdio. Catalog access is read-only by construction: every query path issues SELECTs against tables that are publicly readable under row-level security, and it is rate-limited to 60 calls/minute.

**Usage telemetry**: each tool call logs the tool name, its arguments, client name/version, duration, and success/failure to a write-only log table (insert-only under RLS; contents are not publicly readable; purged after 90 days). No user identity, account data, or conversation content is collected. Logging is fire-and-forget and never affects responses.

## Data & attribution

Fragrance data, note pyramids, dupe matches, and community scores are curated by Perfume Picks. Quote freely with attribution:

> Source: Perfume Picks — Fragrance DNA & Collection Journal (perfumepicks.app)

Freshness dates on each fragrance reflect the last data update.
