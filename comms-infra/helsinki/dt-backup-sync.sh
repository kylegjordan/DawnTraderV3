#!/bin/sh
# Pull GitHub -> the Hetzner backup, then PROVE it by reproduction (not by comparing
# refs). A ref is a 41-byte pointer; it was written correctly while objects were missing.
#
# Runs as the langston user (the repo owner) so git does not trip its dubious-ownership
# guard. The backup doubles as Langston's whole-tree-search fallback (see dt-review).
REPO=/srv/dawntrader-backup.git
LOG=/var/log/dt-backup-sync.log
BRANCH=migration/aws-supabase
KNOWN=1-system-manual/PHASE_19_PLAN.md
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cd "$REPO" || { echo "$TS FAIL cannot cd $REPO" >> "$LOG"; exit 1; }
git fetch --prune --quiet origin "+refs/heads/*:refs/heads/*" 2>>"$LOG"

SRC=$(git ls-remote origin "refs/heads/$BRANCH" 2>>"$LOG" | awk '{print $1}')
MIR=$(git rev-parse "$BRANCH" 2>>"$LOG")

# CC-A 2026-07-23: an all-empty FAIL line is ambiguous — a genuine reproduction
# failure and the gate being unable to read its own inputs need OPPOSITE responses.
# Split them: no SRC/MIR = infra/access problem (NOT a verdict on the backup).
if [ -z "$SRC" ] || [ -z "$MIR" ]; then
  echo "$TS FAIL-INFRA could not read github('$SRC') or repo('$MIR') — access/ownership problem, NOT a reproduction verdict" >> "$LOG"
  cc-send --sender "Backup gate" --message "Backup sync INFRA failure at $TS: could not read GitHub or the local repo (github='$SRC' repo='$MIR'). Access/ownership problem, NOT proof the backup is bad — investigate before trusting or distrusting it." 2>/dev/null
  exit 1
fi

TMP=$(mktemp -d)
git clone --quiet --branch "$BRANCH" "$REPO" "$TMP/r" 2>>"$LOG"
REP_C=$(cd "$TMP/r" 2>/dev/null && git rev-parse HEAD 2>/dev/null)
REP_B=$(cd "$TMP/r" 2>/dev/null && git rev-parse "HEAD:$KNOWN" 2>/dev/null)
rm -rf "$TMP"

if [ "$SRC" = "$MIR" ] && [ "$SRC" = "$REP_C" ] && [ -n "$REP_B" ]; then
  echo "$TS PASS reproduced=$REP_C blob=$REP_B" >> "$LOG"
else
  echo "$TS FAIL-REPRODUCE github=$SRC mirror=$MIR reproduced=$REP_C blob=$REP_B" >> "$LOG"
  cc-send --sender "Backup gate" --message "BACKUP REPRODUCTION FAIL at $TS: github=$SRC mirror=$MIR reproduced=$REP_C. The backup could not reproduce the commit — treat it as NOT valid until fixed." 2>/dev/null
  exit 1
fi
