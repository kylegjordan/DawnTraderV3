#!/bin/bash
# ============================================================
# DawnTrader — GitHub Push Script (Source Code Only)
# Pushes source code to GitHub, excludes runtime data via .gitignore
# Usage: bash scripts/github-push.sh "Your commit message"
#   or:  bash scripts/github-push.sh  (auto-generates message)
# ============================================================

set -e

BRANCH="dawntrader-v3-clean"
REMOTE="origin"
REPO_DIR="/home/runner/workspace"

cd "$REPO_DIR"

if [ -n "$1" ]; then
    COMMIT_MSG="$1"
else
    COMMIT_MSG="DawnTrader update $(date '+%Y-%m-%d %H:%M:%S UTC')"
fi

echo "=========================================="
echo "  DawnTrader GitHub Push (Source Code)"
echo "=========================================="
echo "Branch: $BRANCH"
echo "Message: $COMMIT_MSG"
echo ""

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
SWITCHED=false
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "[1/5] Stashing changes and switching to branch: $BRANCH"
    git stash --include-untracked -q 2>/dev/null || true
    git checkout "$BRANCH"
    git stash pop -q 2>/dev/null || true
    SWITCHED=true
else
    echo "[1/5] Already on branch: $BRANCH"
fi

echo "[2/5] Staging source files..."
git add -A

if git diff --cached --quiet 2>/dev/null; then
    echo ""
    echo "No changes to push. Repository is up to date."
    exit 0
fi

echo "[3/5] Changes to commit:"
git diff --cached --stat | tail -10

echo "[4/5] Committing..."
git commit -m "$COMMIT_MSG" 2>/dev/null || true

echo "[5/5] Pushing to GitHub..."
git push "$REMOTE" "$BRANCH" 2>&1

echo ""
echo "=========================================="
echo "  Push complete!"
echo "=========================================="
echo "Branch: $BRANCH"
echo "Remote: $(git remote get-url $REMOTE)"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S UTC')"
