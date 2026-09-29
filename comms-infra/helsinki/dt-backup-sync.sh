#!/bin/sh
# Pull GitHub -> the Hetzner backup, then PROVE it by reproduction (not by comparing
# refs). A ref is a 41-byte pointer; it was written correctly while objects were missing.
#
# Runs as the langston user (the repo owner) and REFUSES otherwise: a root fetch leaves
# root-owned objects that break every later langston fetch. The backup doubles as
# Langston's reader (see dt-review). Installed by comms-infra/discord/deploy.sh from a
# reviewed sha (B-CREDENTIALS-PRIVATE-REPO OBJ-4a).
#
# B-CREDENTIALS-PRIVATE-REPO, 2026-09-29 (pre-audit A3, A4, A5, and a fresh-reader round):
#  - GitHub's head is read BEFORE the fetch. It used to be read after, so a push landing
#    between the two made github != mirror and raised a false "BACKUP REPRODUCTION FAIL"
#    (3 times since 09-02, each with a commit 0-3 s before the tick). A mirror AHEAD of that
#    earlier read passes only if a second read shows GitHub at or beyond the mirror. (That
#    covers a rewind DURING a run. A rewind BETWEEN runs is simply fetched; the dropped commits
#    stay recoverable only because deploy.sh turns on the mirror's reflog, core.logAllRefUpdates.)
#  - The fetch AND the reproduction clone hold the lock dt-review also takes: a dt-review
#    fetch landing between them would otherwise move the branch and fail a good backup.
#  - Every step's exit status is checked. A step that could not complete is FAIL-INFRA,
#    worded as "not a verdict either way" with git's own first line — never an asserted cause.
#  - Reproduction = a --shared clone FROM the mirror (its exit checked; nothing is copied, so
#    /tmp space is not a dependency), its HEAD equal to the mirror, EVERY object of the head's
#    tree present, and the known file's blob RE-HASHED from its bytes. (A local clone's exit
#    says nothing about objects; the tree check is what does. History behind the head is not
#    walked here — that would read the whole 460 MB pack every 15 minutes.)
#  - git's automatic gc is OFF for the fetches (it could delete packs under a running clone);
#    `gc --auto` runs HERE instead, synchronously, inside the lock, after the reproduction.
#  - On PASS, DT_SYNC_PASS is written atomically as "<epoch> <iso>" of ONE instant. That, not
#    FETCH_HEAD's mtime, is the mirror's age: a failed fetch truncates and touches FETCH_HEAD.
#  - One delayed retry on ls-remote and on the fetch: this key saw 13 transient publickey
#    denials since 09-02 (GB-10), each of which used to page as an infra failure.
REPO=/srv/dawntrader-backup.git
LOG=/var/log/dt-backup-sync.log
BRANCH=migration/aws-supabase
KNOWN=CLAUDE.md
LOCK="$REPO/dt-fetch.lock"
PASS_STAMP="$REPO/DT_SYNC_PASS"
LOCK_WAIT=300
RETRY_AFTER=20
FETCH_TIMEOUT=600
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2'
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log() { printf '%s %s\n' "$TS" "$*" >> "$LOG"; }
first_line() { printf '%s\n' "$1" | sed -n '/./{p;q;}'; }

# The gate could not complete. NOT a verdict on the backup, in either direction.
gate_fail() {
  log "FAIL-INFRA $1 — the gate could not complete; NOT a verdict on the backup either way"
  cc-send --sender "Backup gate" --message "Backup sync could not complete at $TS: $1. This is NOT a verdict on the backup either way — investigate before trusting or distrusting it." 2>/dev/null
  exit 1
}
# The gate completed and the backup did not reproduce.
repro_fail() {
  log "FAIL-REPRODUCE $1"
  cc-send --sender "Backup gate" --message "BACKUP REPRODUCTION FAIL at $TS: $1. The backup could not reproduce the commit — treat it as NOT valid until fixed." 2>/dev/null
  exit 1
}

[ "$(id -un)" = langston ] || { log "REFUSED: run as $(id -un); must run as langston (a root fetch leaves root-owned objects in langston's repository)"; exit 2; }
cd "$REPO" || { log "FAIL cannot cd $REPO"; exit 1; }

# GitHub's head. ls-remote's exit status is kept, so "could not read GitHub" and "GitHub
# has no such branch" are different results. Sets SRC_RC, SRC_OUT (the sha or empty), SRC_ERR.
read_src() {
  out=$(git ls-remote origin "refs/heads/$BRANCH" 2>&1)
  SRC_RC=$?
  SRC_OUT=
  SRC_ERR=
  if [ $SRC_RC -ne 0 ]; then SRC_ERR=$(first_line "$out"); return; fi
  SRC_OUT=$(printf '%s\n' "$out" | awk -v r="refs/heads/$BRANCH" '$2 == r {print $1}')
}
read_src_retry() {
  read_src
  if [ "$SRC_RC" -ne 0 ]; then sleep "$RETRY_AFTER"; read_src; fi
}

# 1. GitHub's head, BEFORE the fetch.
read_src_retry
[ "$SRC_RC" -eq 0 ] || gate_fail "could not read GitHub's $BRANCH head (ls-remote, after one retry): $SRC_ERR"
[ -n "$SRC_OUT" ] || gate_fail "GitHub answered but has NO branch $BRANCH — the source itself is missing"
SRC=$SRC_OUT

# 2. The fetch, under the lock shared with dt-review, held through the reproduction clone.
#    A failed redirection on `exec` is fatal in dash, so the lock file is checked first.
touch "$LOCK" 2>/dev/null
{ [ -f "$LOCK" ] && [ -w "$LOCK" ]; } || gate_fail "cannot open the fetch lock $LOCK (not a writable regular file)"
exec 9>>"$LOCK"
flock -w "$LOCK_WAIT" -E 75 9
rc=$?
if [ $rc -eq 75 ]; then gate_fail "the fetch lock was held for more than ${LOCK_WAIT}s"
elif [ $rc -ne 0 ]; then gate_fail "flock exited $rc"; fi
do_fetch() {   # `9>&-`: no child (e.g. a detached gc --auto) may inherit the lock
  FERR=$(timeout "$FETCH_TIMEOUT" git -c gc.auto=0 -c maintenance.auto=false fetch --prune --quiet origin "+refs/heads/*:refs/heads/*" 2>&1 9>&-)
  frc=$?
  [ -n "$FERR" ] && printf '%s\n' "$FERR" >> "$LOG"
  return $frc
}
if ! do_fetch; then
  sleep "$RETRY_AFTER"
  do_fetch || gate_fail "git fetch failed twice (exit $frc): $(first_line "$FERR")"
fi

MIR=$(git rev-parse --verify --quiet "refs/heads/$BRANCH^{commit}")
[ -n "$MIR" ] || repro_fail "after a successful fetch the mirror's $BRANCH does not resolve to a commit: $(first_line "$(git rev-parse --verify "refs/heads/$BRANCH^{commit}" 2>&1)")"

# 3. In sync: the mirror equals GitHub's head as read before the fetch; or it is AHEAD of
#    that read AND a second read shows GitHub at or beyond the mirror (a push landed during
#    the run). A mirror GitHub has moved BACK from (a force-push) fails.
# 0 = yes, 1 = no; anything else (or any message from git) means the walk itself failed,
# which is FAIL-INFRA, never a "no".
anc() {
  am=$(git merge-base --is-ancestor "$1" "$2" 2>&1)
  arc=$?
  [ -z "$am" ] || gate_fail "could not compare $1 with $2: $(first_line "$am")"
  case $arc in 0|1) return $arc ;; *) gate_fail "could not compare $1 with $2 (merge-base exit $arc)" ;; esac
}
SRC2=
NOTE=
if [ "$SRC" = "$MIR" ]; then
  SYNC=1
else
  read_src_retry
  [ "$SRC_RC" -eq 0 ] || gate_fail "the mirror ($MIR) differs from GitHub's head read before the fetch ($SRC), and the re-read failed: $SRC_ERR"
  [ -n "$SRC_OUT" ] || gate_fail "GitHub answered the re-read with NO branch $BRANCH"
  SRC2=$SRC_OUT
  SYNC=
  if [ "$MIR" = "$SRC2" ]; then
    SYNC=1
  elif anc "$SRC" "$MIR"; then
    # Is GitHub's newer head in the mirror? Only a CLEAN "no" (exit 1, no message) may be read
    # as "not yet fetched"; anything else is a failed read.
    ce=$(git cat-file -e "$SRC2" 2>&1)
    crc=$?
    if [ $crc -eq 0 ]; then
      anc "$MIR" "$SRC2" && SYNC=1
      [ -n "$SYNC" ] || NOTE=" (GitHub MOVED BACK during the run: the mirror holds $MIR, which GitHub's latest $SRC2 does not contain; the next run re-syncs)"
    elif [ $crc -eq 1 ] && [ -z "$ce" ]; then
      SYNC=1; NOTE=" (GitHub moved again, to $SRC2, during the run; the mirror holds exactly what GitHub served at fetch time)"
    else
      gate_fail "could not check whether GitHub's latest $SRC2 is in the mirror: $(first_line "$ce")"
    fi
  fi
fi

# 4. Reproduction: clone FROM the mirror (still under the lock), and re-hash the known file.
TMP=$(mktemp -d) || gate_fail "cannot create a temporary directory"
CERR=$(git clone --quiet --shared --no-checkout --branch "$BRANCH" "$REPO" "$TMP/r" 2>&1 9>&-)
crc=$?
if [ $crc -ne 0 ]; then
  rm -rf "$TMP"
  case "$CERR" in
    *"No space left"*|*"Permission denied"*|*"$TMP"*) gate_fail "the reproduction clone failed for a LOCAL reason (exit $crc): $(first_line "$CERR")" ;;
  esac
  repro_fail "a clone FROM the mirror failed (exit $crc): $(first_line "$CERR") — github=$SRC mirror=$MIR"
fi
REP_C=$(git -C "$TMP/r" rev-parse --verify --quiet HEAD)
REP_B=$(git -C "$TMP/r" rev-parse --verify --quiet "HEAD:$KNOWN")
REHASH=
[ -n "$REP_B" ] && REHASH=$(git -C "$TMP/r" cat-file blob "$REP_B" | git hash-object --no-filters --stdin)
# Every object the head's tree names must exist (the clone's exit status cannot say so).
MISSING=$(git -C "$TMP/r" ls-tree -r -t --object-only HEAD 2>&1 | git -C "$TMP/r" cat-file --batch-check='%(objectname) %(objecttype)' 2>&1 | grep -c ' missing$')
rm -rf "$TMP"
# git's own housekeeping, now, synchronously, inside the lock (it is off during the fetches).
git -c gc.autoDetach=false gc --auto --quiet 2>>"$LOG" 9>&- || log "WARN gc --auto failed (see the lines above); the gate result is unaffected"
exec 9>&-

if [ -n "$SYNC" ] && [ "$MIR" = "$REP_C" ] && [ -n "$REP_B" ] && [ "$REHASH" = "$REP_B" ] && [ "$MISSING" = 0 ]; then
  NOW=$(date -u +%s)
  tmp="$PASS_STAMP.tmp.$$"
  if printf '%s %s\n' "$NOW" "$(date -u -d "@$NOW" +%Y-%m-%dT%H:%M:%SZ)" > "$tmp" && mv -f "$tmp" "$PASS_STAMP"; then
    log "PASS github=$SRC${SRC2:+ github-reread=$SRC2} reproduced=$REP_C $KNOWN=$REP_B (re-hashed)$NOTE"
  else
    rm -f "$tmp"
    gate_fail "the backup reproduced, but $PASS_STAMP could not be written"
  fi
else
  repro_fail "github=$SRC${SRC2:+ github-reread=$SRC2} mirror=$MIR reproduced=$REP_C $KNOWN blob=$REP_B re-hashed=$REHASH missing-objects=$MISSING in-sync=${SYNC:-no}$NOTE"
fi
