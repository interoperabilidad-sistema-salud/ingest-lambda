#!/bin/bash
set -e
echo "=== Empaquetando Lambda Ingest ==="

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
STAGING="$DIST/staging"
ZIP="$DIST/lambda-ingest.zip"

rm -rf "$DIST"
mkdir -p "$STAGING"

cp -r "$ROOT/src" "$STAGING/src"
cp "$ROOT/package.json" "$STAGING/"
cp "$ROOT/package-lock.json" "$STAGING/"

(cd "$STAGING" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

(cd "$STAGING" && zip -qr "$ZIP" .)

rm -rf "$STAGING"
echo "✅ $ZIP ($(du -sh "$ZIP" | cut -f1))"
