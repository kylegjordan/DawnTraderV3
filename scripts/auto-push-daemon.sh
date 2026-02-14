#!/bin/bash
# ============================================================
# DawnTrader — Auto-Push Daemon (One-Way Push to GitHub)
# Monitors for changes and auto-pushes every N minutes
# Usage: bash scripts/auto-push-daemon.sh [interval_minutes]
# Default interval: 15 minutes
# Stop: kill $(cat /tmp/auto-push.pid)
# ============================================================

INTERVAL_MINUTES="${1:-15}"
INTERVAL_SECONDS=$((INTERVAL_MINUTES * 60))
BRANCH="dawntrader-v3"
REMOTE="origin"
REPO_DIR="/home/runner/workspace"
LOG_FILE="/tmp/auto-push.log"
PID_FILE="/tmp/auto-push.pid"
LOCK_FILE="/tmp/auto-push.lock"
MAX_RETRIES=3

cd "$REPO_DIR"

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Auto-push daemon already running (PID: $OLD_PID)"
        echo "Stop it first: kill $OLD_PID"
        exit 1
    fi
fi

echo $$ > "$PID_FILE"

cleanup() {
    rm -f "$PID_FILE" "$LOCK_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Daemon stopped" | tee -a "$LOG_FILE"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo "================================================" | tee -a "$LOG_FILE"
echo "  DawnTrader Auto-Push Daemon Started" | tee -a "$LOG_FILE"
echo "  PID: $$" | tee -a "$LOG_FILE"
echo "  Interval: every ${INTERVAL_MINUTES} minutes" | tee -a "$LOG_FILE"
echo "  Branch: ${BRANCH}" | tee -a "$LOG_FILE"
echo "  Log: ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "  Started: $(date '+%Y-%m-%d %H:%M:%S UTC')" | tee -a "$LOG_FILE"
echo "================================================" | tee -a "$LOG_FILE"

push_to_github() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S UTC')

    if [ -f "$LOCK_FILE" ]; then
        echo "[$timestamp] Push already in progress, skipping" | tee -a "$LOG_FILE"
        return 0
    fi
    touch "$LOCK_FILE"

    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"
    fi

    git add -A 2>/dev/null

    if git diff --cached --quiet 2>/dev/null; then
        echo "[$timestamp] No changes to push" | tee -a "$LOG_FILE"
        rm -f "$LOCK_FILE"
        return 0
    fi

    local changed_count=$(git diff --cached --numstat | wc -l)
    local deleted_count=$(git diff --cached --diff-filter=D --name-only | wc -l)

    if [ "$deleted_count" -gt 50 ]; then
        echo "[$timestamp] WARNING: $deleted_count files would be deleted — skipping push (safety check)" | tee -a "$LOG_FILE"
        git reset HEAD 2>/dev/null
        rm -f "$LOCK_FILE"
        return 1
    fi

    echo "[$timestamp] Changes detected: $changed_count files" | tee -a "$LOG_FILE"

    local msg="Auto-push: $timestamp ($changed_count files)"
    local retry=0

    if git commit -m "$msg" 2>/dev/null; then
        while [ $retry -lt $MAX_RETRIES ]; do
            if git push "$REMOTE" "$BRANCH" 2>&1 | tee -a "$LOG_FILE"; then
                echo "[$timestamp] Push successful" | tee -a "$LOG_FILE"
                rm -f "$LOCK_FILE"
                return 0
            fi
            retry=$((retry + 1))
            echo "[$timestamp] Push failed, retry $retry/$MAX_RETRIES (waiting 30s)" | tee -a "$LOG_FILE"
            sleep 30
        done
        echo "[$timestamp] Push FAILED after $MAX_RETRIES retries" | tee -a "$LOG_FILE"
    else
        echo "[$timestamp] Commit failed (no changes?)" | tee -a "$LOG_FILE"
    fi

    rm -f "$LOCK_FILE"
}

while true; do
    push_to_github
    sleep "$INTERVAL_SECONDS"
done
