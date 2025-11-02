#!/usr/bin/env bash
# Phase 41F-J.1: Build Pipeline Hardening Script
# This script replaces the package.json modifications that cannot be done programmatically

set -e

echo "🧹 Clearing TypeScript and module caches..."
rm -rf .tsx-cache node_modules/.cache/tsx dist 2>/dev/null || true

echo "🔨 Building TypeScript project..."
npx tsc --project tsconfig.json

echo "✅ Build complete. Compiled files in ./dist"
echo ""
echo "To run the compiled server:"
echo "  NODE_ENV=production node dist/server/index.js"
