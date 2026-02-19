#!/bin/bash
# ============================================================
# DawnTrader — GitHub Push Script (Source Code Only)
# Pushes source code to GitHub, excludes runtime data
#
# Safety features:
#   - Blocks commits containing files > 90MB
#   - Auto-unstages known large-file patterns that slip past .gitignore
#   - Shows exactly what will be committed before pushing
#
# Usage: bash scripts/github-push.sh "Your commit message"
#    or: bash scripts/github-push.sh  (auto-generates message)
# ============================================================
set -e

BRANCH="dawntrader-v4"
REMOTE="origin"
REPO_DIR="/home/runner/workspace"
MAX_FILE_SIZE_MB=90
MAX_FILE_SIZE_BYTES=$((MAX_FILE_SIZE_MB * 1024 * 1024))

cd "$REPO_DIR"

# --- Commit message ---
if [ -n "$1" ]; then
  COMMIT_MSG="$1"
else
  COMMIT_MSG="DawnTrader update $(date '+%Y-%m-%d %H:%M:%S UTC')"
fi

echo "=========================================="
echo " DawnTrader GitHub Push (Source Code)"
echo "=========================================="
echo "Branch:  $BRANCH"
echo "Message: $COMMIT_MSG"
echo ""

# --- Step 1: Ensure correct branch ---
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "[1/7] Switching to branch: $BRANCH"
  git stash --include-untracked -q 2>/dev/null || true
  git checkout "$BRANCH"
  git stash pop -q 2>/dev/null || true
else
  echo "[1/7] Already on branch: $BRANCH"
fi

# --- Step 2: Stage files ---
echo "[2/7] Staging source files..."
git add -A

# --- Step 3: Check for large files in staging ---
echo "[3/7] Checking for oversized files (>${MAX_FILE_SIZE_MB}MB)..."
LARGE_FILES_FOUND=false

for filepath in $(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null); do
  if [ -f "$filepath" ]; then
    filesize=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null || echo "0")
    if [ "$filesize" -gt "$MAX_FILE_SIZE_BYTES" ]; then
      size_mb=$((filesize / 1024 / 1024))
      git reset HEAD -- "$filepath" 2>/dev/null || true
      echo "  ⚠ REMOVED from staging: $filepath (${size_mb}MB > ${MAX_FILE_SIZE_MB}MB limit)"
      LARGE_FILES_FOUND=true
    fi
  fi
done

if [ "$LARGE_FILES_FOUND" = true ]; then
  echo "  Large files were auto-removed. Consider adding them to .gitignore."
  echo ""
fi

# --- Step 4: Unstage known non-source file types ---
echo "[4/7] Filtering out non-source file types..."
REMOVED_COUNT=0

# Build a single grep pattern for all dangerous extensions/paths
DANGER_PATTERNS='\.ndjson$|\.sql$|\.sqlite$|\.db$|\.dump$|\.bak$|\.tar\.gz$|\.trace$|\.trace\.json$|\.trace\.ndjson$|\.trace\.zip$|^diagnostic-reports/|^logs/|^data/|^backups/|^backup_'

STAGED_MATCHES=$(git diff --cached --name-only 2>/dev/null | grep -E "$DANGER_PATTERNS" 2>/dev/null || true)

if [ -n "$STAGED_MATCHES" ]; then
  while IFS= read -r match; do
    git reset HEAD -- "$match" 2>/dev/null || true
    echo "  Unstaged: $match"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
  done <<< "$STAGED_MATCHES"
  echo "  Removed $REMOVED_COUNT non-source files from staging."
  echo ""
fi

# --- Step 5: Check if anything remains to commit ---
if git diff --cached --quiet 2>/dev/null; then
  echo ""
  echo "No source code changes to push. Repository is up to date."
  echo "(Large/runtime files were excluded — this is expected.)"
  exit 0
fi

# --- Step 6: Show what will be committed and commit ---
echo "[5/7] Changes to commit:"
git diff --cached --stat | tail -20
echo ""

STAGED_COUNT=$(git diff --cached --name-only | wc -l)
echo "  Total files: $STAGED_COUNT"
echo ""

echo "[6/7] Committing..."
git commit -m "$COMMIT_MSG" || {
  echo "  Nothing to commit."
  exit 0
}

# --- Step 7: Push ---
echo "[7/7] Pushing to GitHub..."
if git push "$REMOTE" "$BRANCH" 2>&1; then
  echo ""
  echo "=========================================="
  echo " ✓ Push complete!"
  echo "=========================================="
  echo "Branch: $BRANCH"
  echo "Remote: $(git remote get-url $REMOTE)"
  echo "Files:  $STAGED_COUNT"
  echo "Time:   $(date '+%Y-%m-%d %H:%M:%S UTC')"
else
  PUSH_EXIT=$?
  echo ""
  echo "=========================================="
  echo " ✗ Push FAILED"
  echo "=========================================="
  echo ""
  echo "If the error mentions a large file in history, run:"
  echo ""
  echo "  # Option A: git-filter-repo (preferred)"
  echo "  pip install git-filter-repo"
  echo "  git filter-repo --strip-blobs-bigger-than 90M --force"
  echo "  git remote add origin https://github.com/kylegjordan/DawnTraderV3.git"
  echo "  git push origin $BRANCH --force"
  echo ""
  echo "  # Option B: filter-branch (fallback)"
  echo "  git stash --include-untracked"
  echo "  git filter-branch --force --index-filter \\"
  echo "    'git rm --cached --ignore-unmatch PATH/TO/LARGE/FILE' \\"
  echo "    --prune-empty --tag-name-filter cat -- --all"
  echo "  git reflog expire --expire=now --all"
  echo "  git gc --prune=now --aggressive"
  echo "  git stash pop"
  echo "  git push origin $BRANCH --force"
  echo ""
  exit $PUSH_EXIT
fi
