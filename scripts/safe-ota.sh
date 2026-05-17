#!/usr/bin/env bash
# safe-ota.sh — Push an OTA update with pre-flight safety checks.
#
# Usage:
#   bash scripts/safe-ota.sh              # defaults to production
#   bash scripts/safe-ota.sh preview      # target preview channel
#
# Checks:
#   1. Must be on main branch
#   2. Working tree must be clean
#   3. Must be in sync with origin/main
#   4. TypeScript must pass
#
# After a bad OTA shipped from a stale worktree in Pour Picks (2026-05-12),
# this script ensures every OTA is from a clean, up-to-date main branch.

set -euo pipefail

CHANNEL="${1:-production}"
ENVIRONMENT="${CHANNEL}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Perfume Picks — Safe OTA Update"
echo "  Target: ${CHANNEL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Must be on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo -e "${RED}✗ Not on main branch (on: ${BRANCH})${NC}"
  echo "  Switch to main before pushing an OTA."
  exit 1
fi
echo -e "${GREEN}✓ On main branch${NC}"

# 2. Clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}✗ Working tree is dirty${NC}"
  echo "  Commit or stash changes before pushing an OTA."
  git status --short
  exit 1
fi
echo -e "${GREEN}✓ Working tree clean${NC}"

# 3. In sync with origin
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo -e "${RED}✗ Not in sync with origin/main${NC}"
  echo "  Local:  ${LOCAL}"
  echo "  Remote: ${REMOTE}"
  echo "  Pull or push first."
  exit 1
fi
echo -e "${GREEN}✓ In sync with origin/main${NC}"

# 4. TypeScript check
echo -e "${YELLOW}Running typecheck...${NC}"
if ! npx tsc --noEmit 2>/dev/null; then
  echo -e "${RED}✗ TypeScript errors found${NC}"
  echo "  Fix type errors before pushing an OTA."
  exit 1
fi
echo -e "${GREEN}✓ TypeScript clean${NC}"

echo ""
echo -e "${GREEN}All checks passed. Publishing OTA...${NC}"
echo ""

eas update --branch="${CHANNEL}" --message="OTA $(date '+%Y-%m-%d %H:%M')"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  OTA published to ${CHANNEL}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
