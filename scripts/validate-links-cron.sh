#!/bin/bash
# Weekly affiliate link-health validation (Perfume Picks).
#
# Re-checks every retailer link not validated in the last 7 days and marks dead
# ones (HTTP 404/410, or absent from a Shopify retailer's live products.json) so
# the app hides them. See scripts/validate-retailer-links.ts for the logic.
#
# Scheduled by ~/Library/LaunchAgents/com.perfumepicks.link-validator.plist.
# launchd runs with a minimal PATH, so node (via nvm) is added explicitly.
set -euo pipefail

export PATH="/Users/bobguillow/.nvm/versions/node/v20.20.2/bin:$PATH"
cd /Users/bobguillow/PerfumePicks

echo "=== $(date '+%Y-%m-%d %H:%M:%S') validate-retailer-links --stale-days 7 ==="
npx tsx scripts/validate-retailer-links.ts --stale-days 7
echo "=== done $(date '+%Y-%m-%d %H:%M:%S') ==="
