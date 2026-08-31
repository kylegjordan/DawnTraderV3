#!/bin/bash
# ============================================================
# REPLIT → GITHUB PUSH SCRIPT
# ============================================================
# Handles Replit's automatic checkpoint system which pre-commits
# changes before the user's push script runs.
#
# Usage: bash REPLIT_PUSH_SCRIPT.sh "Your commit message here"
#
# What this script does:
# 1. Checks if there are uncommitted changes → commits them
# 2. If checkpoint already committed → amends the commit message
# 3. Pushes to GitHub regardless
# ============================================================

set -e

# ── Configuration ──
BRANCH="dawntrader-v4"
REMOTE="origin"

# ── Get commit message from argument ──
if [ -z "$1" ]; then
  echo "❌ ERROR: No commit message provided."
  echo ""
  echo "Usage: bash REPLIT_PUSH_SCRIPT.sh \"Your commit message here\""
  echo ""
  echo "Example:"
  echo "  bash REPLIT_PUSH_SCRIPT.sh \"Batch 7B-hotfix: Fix 11 broken imports\""
  exit 1
fi

COMMIT_MSG="$1"

echo "============================================================"
echo " REPLIT → GITHUB PUSH"
echo "============================================================"
echo ""

# ── Step 1: Check for uncommitted changes ──
echo "📋 Step 1: Checking working tree status..."
CHANGES=$(git status --porcelain 2>/dev/null | head -20)

if [ -n "$CHANGES" ]; then
  echo "   Found uncommitted changes — committing now..."
  git add -A
  git commit -m "$COMMIT_MSG"
  echo "   ✅ Changes committed."
else
  echo "   No uncommitted changes (Replit checkpoint likely already committed)."

  # ── Step 2: Check if local is ahead of remote ──
  echo ""
  echo "📋 Step 2: Checking if local is ahead of remote..."

  # Fetch latest remote state
  git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null || true

  LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null)
  REMOTE_HEAD=$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo "none")

  if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    echo "   ⚠️  Local and remote are already at the same commit."
    echo "   Nothing to push. Are you sure the changes were applied?"
    echo ""
    echo "   Local HEAD:  $LOCAL_HEAD"
    echo "   Remote HEAD: $REMOTE_HEAD"
    exit 0
  fi

  echo "   Local is ahead of remote — amending commit message..."
  git commit --amend -m "$COMMIT_MSG"
  echo "   ✅ Commit message updated."
fi

# ── Step 3: Push to GitHub ──
echo ""
echo "📋 Step 3: Pushing to GitHub..."
git push "$REMOTE" "$BRANCH"

echo ""
echo "============================================================"
echo " ✅ PUSH COMPLETE"
echo "============================================================"
echo ""
echo " Branch:  $BRANCH"
echo " Commit:  $(git rev-parse --short HEAD)"
echo " Message: $COMMIT_MSG"
echo ""
echo " Next: Run 'git pull' in your clone repo to sync."
echo "============================================================"
