#!/bin/sh
# Pull GitHub -> the Hetzner backup, then PROVE it by reproduction (not by comparing
# refs). A ref is a 41-byte pointer; it was written correctly while objects were missing.
#
# Runs as the langston user (the repo owner) so git does not trip its dubious-ownership
# guard. The backup doubles as Langston's reader (see dt-review). Installed by
# comms-infra/discord/deploy.sh from a reviewed sha (B-CREDENTIALS-PRIVATE-REPO OBJ-4a).
#
# B-CREDENTIALS-PRIVATE-REPO, 2026-09-29 (pre-audit A3, A4, A5):
#  - GitHub's head is read BEFORE the fetch. It used to be read after, so a push landing
#    between the two made github != mirror and raised a false "BACKUP REPRODUCTION FAIL"
#    (3 times since 09-02, each with a commit 0-3 s before the tick). PASS now also allows
#    the mirror to be AHEAD of that earlier read (the push arrived during the run).
#  - The fetch holds the lock dt-review also takes, and its exit status is checked: a
#    failed fetch is FAIL-INFRA, never a reproduction verdict.
#  - On PASS it writes DT_SYNC_PASS ("<epoch> <iso>"). That, not FETCH_HEAD's mtime, is the
#    mirror's age: a failed fetch truncates and touches FETCH_HEAD.
#  - One delayed retry on ls-remote and on the fetch: this key saw 13 transient publickey
#    denials since 09-02 (GB-10), each of which used to page as an infra failure.
REPO=/srv/dawntrader-backup.git
LOG=/var/log/dt-backup-sync.log
BRANCH=migration/aws-supabase
KNOWN=1-system-manual/PHASE_19_PLAN.md
LOCK="$REPO/dt-fetch.lock"
PASS_STAMP="$REPO/DT_SYNC_PASS"
LOCK_WAIT=300
RETRY_AFTER=20
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

infra_fail() {
  echo "$TS FAIL-INFRA $1 — access/lock/network problem, NOT a reproduction verdict" >> "$LOG"
  cc-send --sender "Backup gate" --message "Backup sync INFRA failure at $TS: $1. Access/lock/network problem, NOT proof the backup is bad — investigate before trusting or distrusting it." 2>/dev/null
  exit 1
}

cd "$REPO" || { echo "$TS FAIL cannot cd $REPO" >> "$LOG"; exit 1; }

src_head() {
  git ls-remote origin "refs/heads/$BRANCH" 2>>"$LOG" | awk '{print $1}'
}

# 1. GitHub's head, BEFORE the fetch.
SRC=$(src_head)
if [ -z "$SRC" ]; then
  sleep "$RETRY_AFTER"
  SRC=$(src_head)
fi
[ -n "$SRC" ] || infra_fail "could not read GitHub's $BRANCH head (ls-remote, after one retry)"

# 2. The fetch, under the lock shared with dt-review. A failed redirection on `exec` is
#    fatal in dash, so the lock file is checked with an external command first.
touch "$LOCK" 2>/dev/null
[ -w "$LOCK" ] || infra_fail "cannot open the fetch lock $LOCK"
exec 9>>"$LOCK"
flock -w "$LOCK_WAIT" 9 || infra_fail "the fetch lock was held for more than ${LOCK_WAIT}s"
if ! git fetch --prune --quiet origin "+refs/heads/*:refs/heads/*" 2>>"$LOG"; then
  sleep "$RETRY_AFTER"
  git fetch --prune --quiet origin "+refs/heads/*:refs/heads/*" 2>>"$LOG" \
    || infra_fail "git fetch failed twice (git's message is in $LOG)"
fi
exec 9>&-

MIR=$(git rev-parse --verify "refs/heads/$BRANCH" 2>>"$LOG")
[ -n "$MIR" ] || infra_fail "could not read the mirror's $BRANCH after the fetch"

# 3. The mirror must equal GitHub's head as read before the fetch, or be AHEAD of it (a
#    push landed during the run). Anything else is re-checked against a fresh read once.
in_sync() {
  [ "$1" = "$MIR" ] || git merge-base --is-ancestor "$1" "$MIR" 2>>"$LOG"
}
if ! in_sync "$SRC"; then
  SRC2=$(src_head)
  if [ -n "$SRC2" ] && in_sync "$SRC2"; then
    SRC=$SRC2
  fi
fi

# 4. Reproduction: clone FROM the mirror and read a known file.
TMP=$(mktemp -d)
git clone --quiet --branch "$BRANCH" "$REPO" "$TMP/r" 2>>"$LOG"
REP_C=$(cd "$TMP/r" 2>/dev/null && git rev-parse HEAD 2>>"$LOG")
REP_B=$(cd "$TMP/r" 2>/dev/null && git rev-parse "HEAD:$KNOWN" 2>>"$LOG")
rm -rf "$TMP"

if in_sync "$SRC" && [ "$MIR" = "$REP_C" ] && [ -n "$REP_B" ]; then
  echo "$TS PASS github=$SRC reproduced=$REP_C blob=$REP_B" >> "$LOG"
  printf '%s %s\n' "$(date -u +%s)" "$TS" > "$PASS_STAMP"
else
  echo "$TS FAIL-REPRODUCE github=$SRC mirror=$MIR reproduced=$REP_C blob=$REP_B" >> "$LOG"
  cc-send --sender "Backup gate" --message "BACKUP REPRODUCTION FAIL at $TS: github=$SRC mirror=$MIR reproduced=$REP_C. The backup could not reproduce the commit — treat it as NOT valid until fixed." 2>/dev/null
  exit 1
fi
