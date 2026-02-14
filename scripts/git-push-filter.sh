#!/bin/bash
# Phase 3B: Git Push Filter - Large File Protection (LFS-Aware)
# Prevents accidental push of large files unless tracked by Git LFS
# Usage: Install as pre-push hook: cp scripts/git-push-filter.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

MAX_FILE_SIZE=$((100 * 1024 * 1024))
WARN_FILE_SIZE=$((50 * 1024 * 1024))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Git Push Filter - Scanning for large files..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

REMOTE="$1"
URL="$2"

is_lfs_tracked() {
    local filepath="$1"
    local attr_result
    attr_result=$(git check-attr filter -- "$filepath" 2>/dev/null)
    if echo "$attr_result" | grep -q "filter: lfs"; then
        return 0
    fi
    return 1
}

if git rev-parse --verify @{u} >/dev/null 2>&1; then
    FILES=$(git diff --name-only @{u}..HEAD 2>/dev/null)
else
    FILES=$(git ls-files 2>/dev/null)
fi

FOUND_VIOLATIONS=0
FOUND_WARNINGS=0
LFS_COUNT=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    if [ ! -f "$file" ]; then
        continue
    fi

    FILESIZE=$(stat -c%s "$file" 2>/dev/null || echo 0)

    if [ "$FILESIZE" -gt "$WARN_FILE_SIZE" ]; then
        SIZE_MB=$(( FILESIZE / 1024 / 1024 ))

        if is_lfs_tracked "$file"; then
            LFS_COUNT=$((LFS_COUNT + 1))
            echo -e "${CYAN}📦 LFS: $file (${SIZE_MB} MB) — handled by Git LFS${NC}"
            continue
        fi

        if [ "$FILESIZE" -gt "$MAX_FILE_SIZE" ]; then
            echo -e "${RED}❌ BLOCKED: $file (${SIZE_MB} MB)${NC}"
            echo -e "${RED}   Files larger than 100 MB must use Git LFS${NC}"
            FOUND_VIOLATIONS=1
        else
            echo -e "${YELLOW}⚠️  WARNING: $file (${SIZE_MB} MB)${NC}"
            echo -e "${YELLOW}   Large file detected (50-100 MB)${NC}"
            FOUND_WARNINGS=1
        fi
    fi

done <<< "$FILES"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $LFS_COUNT -gt 0 ]; then
    echo -e "${CYAN}📦 $LFS_COUNT file(s) handled by Git LFS${NC}"
fi

if [ $FOUND_VIOLATIONS -eq 1 ]; then
    echo -e "${RED}❌ Push BLOCKED - Untracked large files found${NC}"
    echo ""
    echo "Fix: Add these file patterns to .gitattributes for LFS tracking:"
    echo "  git lfs track \"path/to/pattern\""
    echo ""
    exit 1
elif [ $FOUND_WARNINGS -eq 1 ]; then
    echo -e "${YELLOW}⚠️  Warnings found (non-blocking)${NC}"
    echo -e "${GREEN}✅ Proceeding with push...${NC}"
else
    echo -e "${GREEN}✅ All clear - Push allowed${NC}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
