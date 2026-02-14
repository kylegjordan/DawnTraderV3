#!/bin/bash
# Phase 3B: Git Push Filter - Large File Protection
# Safety check: blocks any file over 100 MB that slips past .gitignore
# Usage: Install as pre-push hook: cp scripts/git-push-filter.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MAX_FILE_SIZE=$((100 * 1024 * 1024))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Git Push Filter - Scanning for large files..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if git rev-parse --verify @{u} >/dev/null 2>&1; then
    FILES=$(git diff --name-only @{u}..HEAD 2>/dev/null)
else
    FILES=$(git ls-files 2>/dev/null)
fi

FOUND_VIOLATIONS=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue

    FILESIZE=$(stat -c%s "$file" 2>/dev/null || echo 0)

    if [ "$FILESIZE" -gt "$MAX_FILE_SIZE" ]; then
        SIZE_MB=$(( FILESIZE / 1024 / 1024 ))
        echo -e "${RED}❌ BLOCKED: $file (${SIZE_MB} MB)${NC}"
        FOUND_VIOLATIONS=1
    fi
done <<< "$FILES"

if [ $FOUND_VIOLATIONS -eq 1 ]; then
    echo -e "${RED}❌ Push BLOCKED - Files exceed 100 MB${NC}"
    echo "Add these files to .gitignore and try again."
    exit 1
else
    echo -e "${GREEN}✅ All clear - Push allowed${NC}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit 0
