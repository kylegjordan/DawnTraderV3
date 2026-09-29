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
#    (3 times since 09-02, each with a commit 0-3 s before the tick).
#  - IN SYNC means, after the fetch, the mirror's branch EQUALS GitHub's head as read before
#    the fetch, OR equals a second read taken after it, OR the fetch MOVED the branch to a
#    descendant of the first read (a push landed between the read and the fetch; a fetch can
#    only write what GitHub served). A fetch that exits 0 WITHOUT moving the branch is not in
#    sync unless GitHub reads the same head. A rewind DURING a run therefore passes (the mirror
#    is GitHub as served at fetch time) and the next run follows it; a rewind BETWEEN runs is
#    simply fetched. Either way the dropped commits stay recoverable only because deploy.sh
#    turns on the mirror's reflog (core.logAllRefUpdates).
#  - The fetch AND the reproduction clone hold the lock dt-review also takes: a dt-review
#    fetch landing between them would otherwise move the branch and fail a good backup.
#  - Every step's exit status is checked. A step that could not complete is FAIL-INFRA,
#    worded as "not a verdict either way" with git's own first line — never an asserted cause.
#  - Reproduction = a --shared clone FROM the mirror (nothing is copied, so /tmp space is not
#    a dependency), its HEAD equal to the mirror, EVERY object of the head's tree present, and
#    the known file's blob RE-HASHED from its bytes. A clone that fails is FAIL-INFRA: its exit
#    says nothing about objects; the tree check is what does, and that check must PROVE it ran
#    (a listing of at least one line, and an answer for every line) or it is FAIL-INFRA too,
#    never a zero. History behind the head is not walked — that would read the whole 460 MB
#    pack every 15 minutes.
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

# `9>&-` on every child here and below: no child (an ssh master, a backgrounded helper, a
# detached gc) may inherit the lock and hold it after this script exits.
page() { cc-send --sender "Backup gate" --message "$1" 2>/dev/null 9>&-; }
# The gate could not complete. NOT a verdict on the backup, in either direction.
gate_fail() {
  log "FAIL-INFRA $1 — the gate could not complete; NOT a verdict on the backup either way"
  page "Backup sync could not complete at $TS: $1. This is NOT a verdict on the backup either way — investigate before trusting or distrusting it."
  exit 1
}
# The gate completed and the backup did not reproduce.
repro_fail() {
  log "FAIL-REPRODUCE $1"
  page "BACKUP REPRODUCTION FAIL at $TS: $1. The backup could not reproduce the commit — treat it as NOT valid until fixed."
  exit 1
}

if [ "$(id -un)" != langston ]; then
  log "REFUSED: run as $(id -un); must run as langston (a root fetch leaves root-owned objects in langston's repository)"
  page "Backup sync REFUSED at $TS: it ran as $(id -un), not langston, so the backup was NOT checked. Fix the cron entry."
  exit 2
fi
# A missing or unreadable mirror is the worst backup state: it pages like any other failure.
if ! cd "$REPO" 2>/dev/null; then
  if [ -e "$REPO" ]; then repro_fail "the mirror $REPO exists but cannot be entered as langston"
  else repro_fail "the mirror $REPO does not exist"; fi
fi

# GitHub's head. ls-remote's exit status is kept, so "could not read GitHub" and "GitHub
# has no such branch" are different results. Sets SRC_RC, SRC_OUT (the sha or empty), SRC_ERR.
read_src() {
  out=$(git ls-remote origin "refs/heads/$BRANCH" 2>&1 9>&-)
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
# The branch BEFORE the fetch, read under the lock: a fetch that exits 0 must be seen to act.
MIR0=$(git rev-parse --verify --quiet "refs/heads/$BRANCH^{commit}")
do_fetch() {
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

# 3. In sync? The rule is stated in the header. Every "no" below is carried into the final
#    FAIL-REPRODUCE with its reason; a walk or a read that itself fails is FAIL-INFRA.
# 0 = yes, 1 = no; anything else (or any message from git) is FAIL-INFRA, never a "no".
anc() {
  am=$(git merge-base --is-ancestor "$1" "$2" 2>&1 9>&-)
  arc=$?
  [ -z "$am" ] || gate_fail "could not compare $1 with $2: $(first_line "$am")"
  case $arc in 0|1) return $arc ;; *) gate_fail "could not compare $1 with $2 (merge-base exit $arc)" ;; esac
}
# 0 = the object is in the mirror; 1 = a CLEAN no (exit 1, no message, measured on git 2.43).
present() {
  pe=$(git cat-file -e "$1" 2>&1 9>&-)
  prc=$?
  [ $prc -eq 0 ] && return 0
  [ $prc -eq 1 ] && [ -z "$pe" ] && return 1
  gate_fail "could not check whether $1 is in the mirror: $(first_line "$pe")"
}
SRC2=
NOTE=
SYNC=
if [ "$SRC" = "$MIR" ]; then
  SYNC=1
else
  read_src_retry
  [ "$SRC_RC" -eq 0 ] || gate_fail "the mirror ($MIR) differs from GitHub's head read before the fetch ($SRC), and the re-read failed: $SRC_ERR"
  [ -n "$SRC_OUT" ] || gate_fail "GitHub answered the re-read with NO branch $BRANCH"
  SRC2=$SRC_OUT
  if [ "$MIR" = "$SRC2" ]; then
    SYNC=1
  elif [ "$MIR" = "$MIR0" ]; then
    NOTE=" (the fetch exited 0 but did not move the branch off $MIR0, a head GitHub showed neither before nor after it)"
  elif ! present "$SRC"; then
    NOTE=" (the fetch moved the branch to $MIR, but the mirror does not hold $SRC, GitHub's head read before the fetch)"
  elif anc "$SRC" "$MIR"; then
    SYNC=1
    NOTE=" (a push landed during the run: the fetch moved the branch from ${MIR0:-nothing} to $MIR, which contains GitHub's earlier head; GitHub has since moved to $SRC2, which the next run fetches)"
  else
    NOTE=" (the fetch moved the branch to $MIR, which does not contain $SRC, GitHub's head read before the fetch)"
  fi
fi

# 4. Reproduction: clone FROM the mirror (still under the lock), and re-hash the known file.
TMP=$(mktemp -d) || gate_fail "cannot create a temporary directory"
CERR=$(git clone --quiet --shared --no-checkout --branch "$BRANCH" "$REPO" "$TMP/r" 2>&1 9>&-)
crc=$?
if [ $crc -ne 0 ]; then
  rm -rf "$TMP"
  gate_fail "the reproduction clone failed (exit $crc): $(first_line "$CERR") — github=$SRC mirror=$MIR"
fi
REP_C=$(git -C "$TMP/r" rev-parse --verify --quiet HEAD)
REP_B=$(git -C "$TMP/r" rev-parse --verify --quiet "HEAD:$KNOWN")
REHASH=
if [ -n "$REP_B" ]; then   # an unreadable blob is logged as that, never as the empty blob's hash
  if git -C "$TMP/r" cat-file blob "$REP_B" > "$TMP/known" 2> "$TMP/known.err" 9>&-; then
    REHASH=$(git hash-object --no-filters --stdin < "$TMP/known" 9>&-)
  else REHASH="unreadable($(sed -n 1p "$TMP/known.err"))"; fi
fi
# Every object the head's tree names must exist. The check must PROVE it ran: a listing that
# exits 0 with at least one line and no message, and cat-file answering EVERY line with a
# well-formed "<oid> <type>" or "<oid> missing". Anything else is OBJ_ERR (FAIL-INFRA), never 0.
# A gitlink (a submodule commit) lives in another repository by definition and is not asked.
MISSING=
OBJ_ERR=
if git -C "$TMP/r" ls-tree -r -t --format='%(objecttype) %(objectname)' HEAD > "$TMP/ls" 2> "$TMP/ls.err" 9>&-; then
  awk '$1 != "commit" {print $2}' "$TMP/ls" > "$TMP/want"
  NW=$(wc -l < "$TMP/want")
  if [ -s "$TMP/ls.err" ]; then OBJ_ERR="listing the head's tree printed: $(sed -n 1p "$TMP/ls.err")"
  elif [ "$NW" -lt 1 ]; then OBJ_ERR="listing the head's tree returned no objects"
  elif git -C "$TMP/r" cat-file --batch-check='%(objectname) %(objecttype)' < "$TMP/want" > "$TMP/got" 2> "$TMP/got.err" 9>&-; then
    NG=$(wc -l < "$TMP/got")
    NOK=$(grep -c -E '^[0-9a-f]{40} (blob|tree)$' "$TMP/got")
    NMISS=$(grep -c -E '^[0-9a-f]{40} missing$' "$TMP/got")
    if [ -s "$TMP/got.err" ]; then OBJ_ERR="cat-file printed: $(sed -n 1p "$TMP/got.err")"
    elif [ "$NG" -ne "$NW" ] || [ $((NOK + NMISS)) -ne "$NW" ]; then
      OBJ_ERR="cat-file answered $NG lines ($NOK present, $NMISS missing) for $NW objects"
    else MISSING=$NMISS; fi
  else OBJ_ERR="cat-file exited non-zero: $(sed -n 1p "$TMP/got.err")"; fi
else OBJ_ERR="could not list the head's tree: $(sed -n 1p "$TMP/ls.err")"; fi
rm -rf "$TMP"
# git's own housekeeping, now, synchronously, inside the lock (it is off during the fetches).
git -c gc.autoDetach=false gc --auto --quiet 2>>"$LOG" 9>&- || log "WARN gc --auto failed (see the lines above); the gate result is unaffected"
exec 9>&-

[ -z "$OBJ_ERR" ] || gate_fail "the object check could not complete: $OBJ_ERR — github=$SRC mirror=$MIR reproduced=$REP_C"
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
