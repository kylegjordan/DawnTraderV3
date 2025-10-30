#!/usr/bin/env bash
# Phase 31.I: CI check to prevent hardcoded UUIDs
set -euo pipefail

echo "🔍 Phase 31.I: Checking for hardcoded UUIDs..."

# Search for UUID patterns in TypeScript/JavaScript files
# Exclude: fixtures, seeds, test data, migrations, and documentation
if rg -n "\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b" \
  --type-add 'code:*.{ts,tsx,js,jsx}' \
  --type code \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/*.test.{ts,tsx,js,jsx}' \
  --glob '!**/fixtures/**' \
  --glob '!**/seeds/**' \
  --glob '!**/testdata/**' \
  --glob '!**/migrations/**' \
  --glob '!**/*.md' \
  server/ client/ shared/ 2>/dev/null \
  | tee /dev/stderr | grep .
then
  echo ""
  echo "❌ HARDCODED UUIDs DETECTED"
  echo "   Use environment variables, config files, or SystemUserCache instead."
  echo "   See server/utils/system-user-cache.ts for examples."
  exit 1
fi

echo "✅ No hardcoded UUIDs found in source code."
exit 0
