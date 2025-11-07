#!/bin/bash
# Phase 3B: Git Push Filter - Large File Protection
# Prevents accidental push of large files and database dumps
# Usage: Install as pre-push hook: cp scripts/git-push-filter.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -e

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Thresholds (in bytes)
MAX_FILE_SIZE=$((100 * 1024 * 1024))    # 100 MB - hard limit
WARN_FILE_SIZE=$((50 * 1024 * 1024))     # 50 MB - warning for SQL dumps

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Git Push Filter - Scanning for large files..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get list of files to be pushed
REMOTE="$1"
URL="$2"

# Check if we have a remote branch to compare against
if git rev-parse --verify @{u} >/dev/null 2>&1; then
    # Compare with upstream branch
    FILES=$(git diff --name-only @{u}..HEAD)
else
    # No upstream, check all tracked files
    FILES=$(git ls-files)
fi

# Track if any issues found
FOUND_VIOLATIONS=0
FOUND_WARNINGS=0

# Check each file
while IFS= read -r file; do
    # Skip if file doesn't exist (deleted files)
    if [ ! -f "$file" ]; then
        continue
    fi
    
    # Get file size (cross-platform compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        FILESIZE=$(stat -f%z "$file" 2>/dev/null || echo 0)
    else
        # Linux
        FILESIZE=$(stat -c%s "$file" 2>/dev/null || echo 0)
    fi
    
    # Get file extension
    EXT="${file##*.}"
    BASENAME=$(basename "$file")
    
    # Hard limit: Block files > 100 MB
    if [ "$FILESIZE" -gt "$MAX_FILE_SIZE" ]; then
        SIZE_MB=$(echo "scale=2; $FILESIZE / 1024 / 1024" | bc)
        echo -e "${RED}❌ BLOCKED: $file (${SIZE_MB} MB)${NC}"
        echo -e "${RED}   Files larger than 100 MB cannot be pushed${NC}"
        FOUND_VIOLATIONS=1
    
    # Warning: SQL dumps and archives > 50 MB
    elif [[ "$file" =~ \.(sql|dump|backup|tar\.gz|sql\.gz)$ ]] && [ "$FILESIZE" -gt "$WARN_FILE_SIZE" ]; then
        SIZE_MB=$(echo "scale=2; $FILESIZE / 1024 / 1024" | bc)
        echo -e "${YELLOW}⚠️  WARNING: $file (${SIZE_MB} MB)${NC}"
        echo -e "${YELLOW}   Database dumps > 50 MB should not be committed${NC}"
        echo -e "${YELLOW}   Consider adding to .gitignore or using Git LFS${NC}"
        FOUND_WARNINGS=1
    
    # Warning: Any file 50-100 MB
    elif [ "$FILESIZE" -gt "$WARN_FILE_SIZE" ]; then
        SIZE_MB=$(echo "scale=2; $FILESIZE / 1024 / 1024" | bc)
        echo -e "${YELLOW}⚠️  WARNING: $file (${SIZE_MB} MB)${NC}"
        echo -e "${YELLOW}   Large file detected (50-100 MB)${NC}"
        echo -e "${YELLOW}   Consider if this file should be committed${NC}"
        FOUND_WARNINGS=1
    fi
    
done <<< "$FILES"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Result summary
if [ $FOUND_VIOLATIONS -eq 1 ]; then
    echo -e "${RED}❌ Push BLOCKED - Files exceed 100 MB limit${NC}"
    echo ""
    echo "Remediation options:"
    echo "  1. Remove large files from commit"
    echo "  2. Add files to .gitignore"
    echo "  3. Use Git LFS for large files"
    echo "  4. Store files externally (S3, file server, etc.)"
    echo ""
    echo "To remove file from commit:"
    echo "  git rm --cached <filename>"
    echo "  git commit --amend"
    echo ""
    exit 1
elif [ $FOUND_WARNINGS -eq 1 ]; then
    echo -e "${YELLOW}⚠️  Warnings found - Review large files before pushing${NC}"
    echo ""
    echo "Continue with push? (y/N): "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Push cancelled by user${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Proceeding with push...${NC}"
else
    echo -e "${GREEN}✅ No large files detected - Push allowed${NC}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
