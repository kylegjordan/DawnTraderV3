#!/usr/bin/env bash
# Gated auto-update for Langston's Claude Code runtime.
#
# WHY THIS IS A SCRIPT AND NOT AN INSTRUCTION (Kyle 2026-09-05: "modify the
# daily model check to include software checks for Langston... if so, then the
# update runs"). The daily check is a scheduled Claude SESSION following written
# instructions. An upgrade re-derived from prose every morning is an upgrade
# whose gates depend on a session remembering them. This puts the logic in one
# versioned, testable place; the routine's only job is to run it and report.
#
# ⛔⛔ THE GATES ARE THE POINT, NOT THE UPGRADE. This touches the runtime for
#    EVERY review Langston performs. An upgrade that installs cleanly and
#    breaks his file loading is worse than no upgrade, because it fails
#    SILENTLY — he keeps answering, just without his instructions or his
#    retraction ledger. That is the #651 failure mode, which sat undetected for
#    months. So:
#      1. ENGINE CHECK BEFORE      — node must satisfy the new package's engines
#      2. ROLLBACK ANCHOR BEFORE   — the exact pinned reinstall command
#      3. CANARY AFTER             — three answers only his AUTO-LOADED files
#                                    can supply; a generic "OK" proves nothing
#      4. AUTO-ROLLBACK ON FAILURE — and it exits NON-ZERO so the routine reports
#
# ⛔ THE CANARY IS THE WHOLE SAFETY PROPERTY. It asks for the RETRACTION COUNT
#    (only in MEMORY.md) and the RECALL COMMAND NAME (only in CLAUDE.md). If a
#    new version changed how @imports load, a plain "are you there" ping would
#    pass while his memory silently vanished.
#
# USAGE:  langston-cli-update.sh [--check-only]
# EXIT :  0 no-op or success · 1 upgraded-then-rolled-back · 2 gate refused

set -uo pipefail

PKG="@anthropic-ai/claude-code"
CLAUDE="/usr/bin/claude"
LOG="/var/log/langston-cli-update.log"

say() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

CUR=$(sudo -u langston "$CLAUDE" --version 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+')
LATEST=$(npm view "$PKG" version 2>/dev/null)

if [ -z "$CUR" ] || [ -z "$LATEST" ]; then
  say "REFUSED: could not read current ($CUR) or latest ($LATEST) version. Nothing attempted."
  exit 2
fi

say "current=$CUR latest=$LATEST"
if [ "$CUR" = "$LATEST" ]; then
  say "NO-OP: already current."
  exit 0
fi
[ "${1:-}" = "--check-only" ] && { say "CHECK-ONLY: update available $CUR -> $LATEST"; exit 0; }

# ── GATE 1: engine ──────────────────────────────────────────────────────────
NODE_HAVE=$(node --version 2>/dev/null | tr -d 'v')
NODE_NEED=$(npm view "$PKG@$LATEST" engines.node 2>/dev/null | grep -oE '[0-9]+' | head -1)
NODE_MAJOR=${NODE_HAVE%%.*}
if [ -n "$NODE_NEED" ] && [ "${NODE_MAJOR:-0}" -lt "$NODE_NEED" ]; then
  say "REFUSED: node $NODE_HAVE < required major $NODE_NEED for $PKG@$LATEST. NOT upgrading."
  exit 2
fi
say "gate 1 OK: node $NODE_HAVE satisfies >=$NODE_NEED"

# ── GATE 2: rollback anchor, recorded BEFORE anything changes ───────────────
say "gate 2 OK: rollback anchor = npm install -g $PKG@$CUR"

# ── UPGRADE ─────────────────────────────────────────────────────────────────
if ! npm install -g "$PKG@$LATEST" >>"$LOG" 2>&1; then
  say "FAILED: npm install errored. Version now: $(sudo -u langston $CLAUDE --version 2>&1 | head -1)"
  npm install -g "$PKG@$CUR" >>"$LOG" 2>&1
  exit 1
fi
NEW=$(sudo -u langston "$CLAUDE" --version 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+')
say "installed: $NEW"

# ── GATE 3: THE CANARY — his auto-loaded files must still reach him ─────────
CANARY=$(mktemp)
cat > "$CANARY" <<'EOF'
Reply with exactly two lines and nothing else:
1) the number of retraction entries currently in your reviewer ledger
2) the name of the archive-recall command your instructions tell you to run before any verdict
EOF
chmod 644 "$CANARY"
OUT=$(cd /home/langston && sudo -u langston HOME=/home/langston sh -c \
  "set -a; . /etc/langston/oauth.env; set +a; exec timeout 180 $CLAUDE -p --model 'claude-opus-5[1m]' --permission-mode bypassPermissions" \
  < "$CANARY" 2>&1)
rm -f "$CANARY"

# Both must be present. A bare "OK" is NOT acceptance — see the header.
if echo "$OUT" | grep -q "langston-recall" && echo "$OUT" | grep -qE '(^|[^0-9])[0-9]+([^0-9]|$)'; then
  say "gate 3 OK: canary returned his loaded-file answers -> $(echo "$OUT" | tr '\n' ' ' | cut -c1-120)"
  say "SUCCESS: $CUR -> $NEW, files verified loading."
  exit 0
fi

say "CANARY FAILED after upgrade to $NEW. Output: $(echo "$OUT" | tr '\n' ' ' | cut -c1-200)"
say "AUTO-ROLLBACK -> $CUR"
npm install -g "$PKG@$CUR" >>"$LOG" 2>&1
say "rolled back to: $(sudo -u langston $CLAUDE --version 2>&1 | head -1)"
exit 1
