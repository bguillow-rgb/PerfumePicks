#!/usr/bin/env bash
# Build the Astro site and replace the contents of ../docs with the build.
# GitHub Pages on this repo is configured to serve /docs from the main
# branch, so this is the publish step.
#
# Run from web/:  bash scripts/deploy-to-docs.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Safety gates — this script does `rm -rf ../docs`. If anything is off,
# refuse to run. These checks prevent nuking the wrong directory if the
# script is ever invoked from an unexpected cwd or copied to another repo.
if [ "$(basename "$PWD")" != "web" ]; then
  echo "ERROR: must be run from inside web/ (cwd: $PWD)"
  exit 1
fi
if [ ! -f "package.json" ] || ! grep -q '"perfumepicks-web"' package.json; then
  echo "ERROR: package.json missing or not perfumepicks-web (cwd: $PWD)"
  exit 1
fi
if [ ! -d "../.git" ] && [ ! -f "../.git" ]; then
  echo "ERROR: parent is not a git repo / worktree (cwd: $PWD)"
  exit 1
fi

echo "==> Building Astro site"
npm run build

DOCS_DIR="../docs"

echo "==> Replacing $DOCS_DIR with fresh build"
# Preserve nothing — public/CNAME is rebuilt into dist by Astro and copied
# below. This is intentionally destructive: if you have manual files in
# /docs that aren't in /web, move them into /web first.
rm -rf "$DOCS_DIR"
mkdir -p "$DOCS_DIR"
cp -R dist/. "$DOCS_DIR"/

echo "==> /docs now contains:"
ls "$DOCS_DIR"

echo ""
echo "Done. Commit the changes in /docs and push to publish."
