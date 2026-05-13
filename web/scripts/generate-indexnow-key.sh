#!/usr/bin/env bash
# Generate an IndexNow key and write the verification file.
#
# IndexNow lets you ping search engines (Bing, Yandex, Naver,
# Seznam — and Google now consumes IndexNow signals indirectly via
# Bing) when URLs change, so they re-crawl quickly instead of
# waiting for their normal schedule.
#
# Run once. The key persists; commit the generated key file.
#
# Usage:  bash scripts/generate-indexnow-key.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Generate a 32-char hex key (IndexNow accepts 8-128 chars, hex).
KEY=$(openssl rand -hex 16)
KEY_FILE="public/${KEY}.txt"

# The key file's contents must match the key itself.
echo "$KEY" > "$KEY_FILE"

echo "==> IndexNow key generated"
echo ""
echo "Key:        $KEY"
echo "Key file:   $KEY_FILE"
echo ""
echo "Next steps:"
echo "  1. Add to your env:    export PUBLIC_INDEXNOW_KEY=\"$KEY\""
echo "  2. Add to your CI/host env vars too (Netlify, GitHub Actions, etc.)"
echo "  3. Commit $KEY_FILE so the key file ships with /docs"
echo "  4. Run scripts/indexnow-ping.sh after each deploy to ping new URLs"
