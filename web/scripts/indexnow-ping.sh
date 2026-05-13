#!/usr/bin/env bash
# Ping IndexNow with all URLs in the sitemap so search engines re-crawl
# quickly. Run after each deploy.
#
# Requires: PUBLIC_INDEXNOW_KEY env var set (run generate-indexnow-key.sh
# once first), curl, and a populated dist/sitemap-0.xml from a recent build.
#
# Usage:  bash scripts/indexnow-ping.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${PUBLIC_INDEXNOW_KEY:-}" ]; then
  echo "ERROR: PUBLIC_INDEXNOW_KEY not set. Run generate-indexnow-key.sh first."
  exit 1
fi

SITE="https://perfumepicks.app"
SITEMAP="dist/sitemap-0.xml"

if [ ! -f "$SITEMAP" ]; then
  echo "ERROR: $SITEMAP not found. Run 'npm run build' first."
  exit 1
fi

# Extract URLs from the sitemap. Astro sitemap format: <loc>URL</loc>.
URLS=$(grep -oE '<loc>[^<]+</loc>' "$SITEMAP" | sed -E 's|<loc>([^<]+)</loc>|"\1"|' | paste -sd, -)

PAYLOAD=$(cat <<EOF
{
  "host": "perfumepicks.app",
  "key": "$PUBLIC_INDEXNOW_KEY",
  "keyLocation": "$SITE/$PUBLIC_INDEXNOW_KEY.txt",
  "urlList": [$URLS]
}
EOF
)

echo "==> Pinging IndexNow with $(echo "$URLS" | tr ',' '\n' | wc -l | tr -d ' ') URLs"

# IndexNow accepts pings from any participating engine; api.indexnow.org
# fans out. Bing also has its own endpoint.
RESPONSE=$(curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}")

CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$CODE" = "200" ] || [ "$CODE" = "202" ]; then
  echo "==> IndexNow accepted (HTTP $CODE)"
else
  echo "==> IndexNow returned HTTP $CODE"
  echo "$BODY"
  exit 1
fi
