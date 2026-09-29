#!/bin/bash
# dt-backup-sync.sh tests (B-CREDENTIALS-PRIVATE-REPO OBJ-4a / A5). As langston, in
# /tmp/dtr-test/bs ONLY. "GitHub" is a local bare repo we can push to at a chosen instant;
# a wrapper `git` fires the push at that instant. cc-send is stubbed by a script that records
# whether it inherited fd 9 (the lock). The test copies differ from the file under test ONLY in
# REPO, LOG, LOCK_WAIT, RETRY_AFTER and the cc-send stub (plus the named variants below).
# The test "GitHub" and the test mirror each have their OWN object store (both borrow the live
# mirror's objects read-only through --shared, so a new commit made in one is NOT readable in the
# other until it is fetched). Round 3 found that the earlier harness cloned the mirror FROM the
# test GitHub, so every GitHub commit was readable in the mirror and a stale mirror was never
# actually tested.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in
#   dt-backup-sync.sh         the version under test
#   dt-backup-sync.baseline   comms-infra/helsinki/dt-backup-sync.sh at ab68732d7 (the live copy)
#   dt-backup-sync.r1         the same path at b4db96b9c (before fresh-reader round 1)
#   dt-backup-sync.r2         the same path at b9ca76485 (before fresh-reader round 2)
#   dt-backup-sync.r3         the same path at 764ec389b (before fresh-reader round 3)
#   dt-backup-sync.r4         the same path at 2767d358a (what Langston approved with conditions at gate 4a-2)
# and chown -R langston. Run: cd /home/langston && sudo -u langston HOME=/home/langston bash <this>.
# Remove /tmp/dtr-test afterwards. "CONTROL" lines must FAIL on the older copy they name.
set -u
T=/tmp/dtr-test/bs
[ "$(id -un)" = langston ] || { echo "run as langston"; exit 9; }
rm -rf "$T"; mkdir -p "$T/bin"; cd "$T" || exit 9
export GIT_AUTHOR_NAME=bs-test GIT_AUTHOR_EMAIL=bs-test@invalid GIT_COMMITTER_NAME=bs-test GIT_COMMITTER_EMAIL=bs-test@invalid
B=migration/aws-supabase
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }
R=/usr/bin/git

$R clone -q --bare --shared /srv/dawntrader-backup.git src.git
$R clone -q --bare --shared /srv/dawntrader-backup.git mirror.git
$R --git-dir="$T/mirror.git" config remote.origin.url "$T/src.git"

cat > "$T/bin/ccsend" <<EOF
#!/bin/bash
[ -e /proc/\$\$/fd/9 ] && touch $T/fd9-ccsend
echo WOULD-POST "\$@" >> $T/posted
echo WOULD-POST "\$@"
[ -z "\${CCSEND_FAIL:-}" ] || { echo "cc-send: simulated failure" >&2; exit 1; }
EOF
chmod +x "$T/bin/ccsend"

mk() { # name source lockwait [extra sed expression]
  sed -e "s#^REPO=.*#REPO=$T/mirror.git#" -e "s#^LOG=.*#LOG=$T/sync.log#" \
      -e "s#^LOCK_WAIT=.*#LOCK_WAIT=$3#" -e "s#^RETRY_AFTER=.*#RETRY_AFTER=1#" \
      -e "s#cc-send --sender#$T/bin/ccsend --sender#" ${4:+-e "$4"} "$2" > "$T/$1"
  chmod +x "$T/$1"
}
S=/tmp/dtr-test/src
mk bs_new  $S/dt-backup-sync.sh       2
mk bs_base $S/dt-backup-sync.baseline 2
mk bs_r1   $S/dt-backup-sync.r1       2
mk bs_r2   $S/dt-backup-sync.r2       2
mk bs_r3   $S/dt-backup-sync.r3       2
mk bs_r4   $S/dt-backup-sync.r4       2
mk bs_new_norepo $S/dt-backup-sync.sh 2 "s#^REPO=.*#REPO=$T/no-such-mirror.git#"
mk bs_r3_norepo  $S/dt-backup-sync.r3 2 "s#^REPO=.*#REPO=$T/no-such-mirror.git#"
mk bs_new_user   $S/dt-backup-sync.sh 2 "s#!= langston ]#!= nosuchuser ]#"
mk bs_r3_user    $S/dt-backup-sync.r3 2 "s#= langston ]#= nosuchuser ]#"

cat > "$T/bin/git" <<'EOF'
#!/bin/bash
R=/usr/bin/git
T=__T__
B=__B__
advance() {
  h=$($R --git-dir=$T/src.git rev-parse refs/heads/$B)
  n=$($R --git-dir=$T/src.git commit-tree -p "$h" -m "adv $(date +%s%N)" "$($R --git-dir=$T/src.git rev-parse "$h^{tree}")")
  $R --git-dir=$T/src.git update-ref refs/heads/$B "$n"
}
sibling() {  # GitHub force-pushed to a commit that does NOT contain its previous head
  h=$($R --git-dir=$T/src.git rev-parse refs/heads/$B)
  n=$($R --git-dir=$T/src.git commit-tree -p "$h~1" -m "sibling $(date +%s%N)" "$($R --git-dir=$T/src.git rev-parse "$h^{tree}")")
  $R --git-dir=$T/src.git update-ref refs/heads/$B "$n"
}
rewind() {  # GitHub force-pushed back to the parent of its head
  $R --git-dir=$T/src.git update-ref refs/heads/$B "$($R --git-dir=$T/src.git rev-parse refs/heads/$B~1)"
}
# The subcommand is the first argument that is not a global option ("-c k=v" and "-C dir"
# take a value): the scripts under test call `git -c gc.auto=0 ... fetch`.
sub=; skip=
for a in "$@"; do
  if [ -n "$skip" ]; then skip=; continue; fi
  case "$a" in -c|-C) skip=1 ;; -*) ;; *) sub=$a; break ;; esac
done
M=${DTT_MODE:-}
case "$sub" in
  ls-remote)
    [ -e /proc/$$/fd/9 ] && touch $T/fd9-lsremote
    # reread_empty: the SECOND read answers exit 0 with no branch (checked BEFORE the real read)
    if [ "$M" = reread_empty ] && [ -e $T/fired ]; then exit 0; fi
    if [ "$M" = before_lsremote ] && [ ! -e $T/fired ]; then touch $T/fired; advance; fi
    $R "$@"; rc=$?
    case "$M" in after_lsremote|reread_empty|after_lsremote_push|after_lsremote_rewind)
      [ ! -e $T/fired ] && { touch $T/fired; advance; } ;;
    sibling_then_push)
      [ ! -e $T/fired ] && { touch $T/fired; sibling; } ;;
    esac
    exit $rc ;;
  fetch)
    [ "$M" = noop_fetch ] && exit 0
    [ "$M" = noop_fetch_push ] && { advance; exit 0; }
    [ "$M" = fail_fetch ] && { echo "fatal: simulated fetch failure" >&2; exit 1; }
    $R "$@"; rc=$?
    [ "$M" = after_lsremote_push ] && advance
    [ "$M" = after_lsremote_rewind ] && rewind
    [ "$M" = sibling_then_push ] && advance
    exit $rc ;;
  clone)
    [ "$M" = clone_fail ] && { echo "fatal: simulated clone failure" >&2; exit 128; }
    exec $R "$@" ;;
  ls-tree)
    [ "$M" = lstree_empty ] && exit 0
    exec $R "$@" ;;
  cat-file)
    if [ "$M" = catfile_dies ]; then
      for a in "$@"; do case "$a" in --batch-check*) exit 1 ;; esac; done
    fi
    exec $R "$@" ;;
  *) exec $R "$@" ;;
esac
EOF
sed -i -e "s#__T__#$T#" -e "s#__B__#$B#" "$T/bin/git"
chmod +x "$T/bin/git"
export PATH="$T/bin:$PATH"

run() { rm -f "$T/fired" "$T/fd9-ccsend" "$T/fd9-lsremote" "$T/posted"; : > "$T/sync.log"; DTT_MODE=$1 "$T/$2" > "$T/out" 2>&1; RC=$?; LOGL=$(grep -v '^fatal\|^error\|^warning' "$T/sync.log" | tail -1); }
has() { [ "${LOGL#* $1}" != "$LOGL" ]; }
posted() { [ -s "$T/posted" ]; }
# Make the SAME object in both stores (fixed dates -> the same ids), for states a fetch cannot build.
both() { for g in src mirror; do "$@" "$T/$g.git"; done; }
mkbroken() { # tree-line msg replaced-name gitdir -> BRK; fixed dates give the same id in both stores
  local g=$4 h
  h=$($R --git-dir="$g" rev-parse refs/heads/$B)
  NT=$( { $R --git-dir="$g" ls-tree "$h" | grep -v "$(printf '\t')$3\$"; printf '%s\n' "$1"; } | $R --git-dir="$g" mktree --missing)
  BRK=$(GIT_AUTHOR_DATE="1700000000 +0000" GIT_COMMITTER_DATE="1700000000 +0000" $R --git-dir="$g" commit-tree -p "$h" -m "$2" "$NT")
  $R --git-dir="$g" update-ref refs/heads/$B "$BRK"
  echo "$BRK" >> "$T/brk.ids"
}
brk_same() { [ "$(sort -u "$T/brk.ids" | wc -l)" -eq 1 ]; }

run none bs_new
[ $RC -eq 0 ] && has PASS && [ -s "$T/mirror.git/DT_SYNC_PASS" ] && ok "B1 normal run PASS: $LOGL" || bad B1 "rc=$RC $LOGL"
read -r E1 I1 < "$T/mirror.git/DT_SYNC_PASS"
[ "$(date -u -d "@$E1" +%Y-%m-%dT%H:%M:%SZ)" = "$I1" ] && ok "B7 DT_SYNC_PASS is ONE instant: '$E1 $I1'" || bad B7 "$E1 $I1"

run before_lsremote bs_base
[ $RC -eq 1 ] && has FAIL-REPRODUCE && posted && ok "B2 CONTROL: the baseline raises the historical false alarm" || bad B2c "rc=$RC $LOGL"
run none bs_new >/dev/null
run after_lsremote bs_new
[ $RC -eq 0 ] && has PASS && ! posted && ok "B2 new: a push landing mid-run -> PASS, no page" || bad B2 "rc=$RC $LOGL"
[ ! -e "$T/fd9-lsremote" ] && ok "F3-B6a: the re-read's ls-remote did not inherit the lock fd" || bad F3-B6a "fd 9 was open in ls-remote"
run after_lsremote bs_r3
[ -e "$T/fd9-lsremote" ] && ok "F3-B6a CONTROL: r3's re-read inherited the lock fd" || bad F3-B6ac "no fd 9 seen"
run before_lsremote bs_new
[ $RC -eq 0 ] && has PASS && ok "B2b new: a push just before ls-remote -> PASS" || bad B2b "rc=$RC $LOGL"

# B3 / F3-B1: GitHub moved and the fetch did nothing, so GitHub's head is NOT in the mirror.
PREV=$(cat "$T/mirror.git/DT_SYNC_PASS")
( rm -f "$T/fired"; DTT_MODE=before_lsremote git ls-remote "$T/src.git" >/dev/null; rm -f "$T/fired" )   # advance GitHub once
SRCNOW=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
if $R --git-dir="$T/mirror.git" cat-file -e "$SRCNOW"; then bad B3-pre "the harness still shares GitHub's objects with the mirror"; else ok "B3 harness: GitHub's new head is NOT readable in the test mirror"; fi
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && posted && echo "$LOGL" | grep -q "did not move the branch" && [ "$(cat "$T/mirror.git/DT_SYNC_PASS")" = "$PREV" ] && ok "B3/F3-B1: a mirror behind GitHub FAILs (FAIL-REPRODUCE), pages; DT_SYNC_PASS unchanged" || bad B3 "rc=$RC $LOGL"
run noop_fetch bs_r3
[ $RC -eq 1 ] && has FAIL-INFRA && ok "B3/F3-B1 CONTROL: r3 paged a stale mirror as 'NOT a verdict' (FAIL-INFRA)" || bad B3c "rc=$RC $LOGL"
run none bs_new >/dev/null   # catch the mirror up again

# F-B6: GitHub force-pushed BACK to an ancestor while the mirror keeps the newer commit.
X=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$X~1"
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "B6 a force-push BACK that the fetch did not follow is not waved through" || bad B6 "rc=$RC $LOGL"
run noop_fetch bs_r1
[ $RC -eq 0 ] && has PASS && ok "B6 CONTROL: r1 PASSED a mirror holding a commit GitHub no longer has" || bad B6-ctl "rc=$RC $LOGL"
# F3-B3: the same rewind, then a push lands AFTER the no-op fetch (GitHub's new head is absent).
run noop_fetch_push bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && echo "$LOGL" | grep -q "did not move the branch" && ok "F3-B3: a no-op fetch is not rescued by 'GitHub moved again'" || bad F3-B3 "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$X~1"
run noop_fetch_push bs_r3
[ $RC -eq 0 ] && has PASS && ok "F3-B3 CONTROL: r3 PASSED a fetch that did nothing ($(echo "$LOGL" | grep -o 'GitHub moved again' | head -1))" || bad F3-B3c "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$X"
run none bs_new >/dev/null

# F3-B3 positives: two pushes in one run; a rewind during the run. Both are GitHub as served.
run after_lsremote_push bs_new
[ $RC -eq 0 ] && has PASS && echo "$LOGL" | grep -q "a push landed during the run" && ok "F3-B3p: a push before AND after the fetch -> PASS, noted" || bad F3-B3p "rc=$RC $LOGL"
run none bs_new >/dev/null
run after_lsremote_rewind bs_new
[ $RC -eq 0 ] && has PASS && ok "F3-B3r: a rewind DURING the run -> PASS (the verdict no longer turns on where the target is)" || bad F3-B3r "rc=$RC $LOGL"
run none bs_new >/dev/null
run after_lsremote_rewind bs_r3
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "F3-B3r CHANGED: r3 failed this same case (its verdict depended on the rewind target being in the mirror)" || bad F3-B3rc "rc=$RC $LOGL"
run none bs_new >/dev/null

# F-B1: the known file's blob is MISSING; the commit and trees are fine. Built in BOTH stores.
H=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
FAKE=$(printf 'never stored %s' "$H" | $R hash-object --stdin)
rm -f "$T/brk.ids"; both mkbroken "$(printf '100644 blob %s\tCLAUDE.md' "$FAKE")" "missing CLAUDE.md blob" CLAUDE.md
brk_same && ok "B1b harness: the broken commit has one id in both stores" || bad B1b-pre "$(cat "$T/brk.ids")"
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "B1b a mirror MISSING the known file's content FAILs (re-hash): $LOGL" || bad B1b "rc=$RC $LOGL"
run noop_fetch bs_r1
[ $RC -eq 0 ] && has PASS && ok "B1b CONTROL: r1 PASSED it (it read only the tree entry)" || bad B1b-ctl "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$H"; $R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$H"

run fail_fetch bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA git fetch failed twice" && grep -q "NOT a verdict on the backup either way" "$T/sync.log" && ok "B4 a failed fetch -> FAIL-INFRA, worded as no verdict, with git's line" || bad B4 "rc=$RC $LOGL"
[ "$(grep -c 'simulated fetch failure' "$T/sync.log")" -ge 2 ] && ok "B4 git's own message is logged for both attempts" || bad B4b x
[ ! -e "$T/fd9-ccsend" ] && posted && ok "F3-B6b: the page sent while holding the lock did not inherit the lock fd" || bad F3-B6b "fd 9 open in cc-send"
run fail_fetch bs_r3
[ -e "$T/fd9-ccsend" ] && ok "F3-B6b CONTROL: r3's page inherited the lock fd" || bad F3-B6bc "no fd 9 seen"

( flock "$T/mirror.git/dt-fetch.lock" sleep 6 ) & sleep 1
run none bs_new; wait
[ $RC -eq 1 ] && has "FAIL-INFRA the fetch lock was held" && ok "B5 lock held -> FAIL-INFRA naming the lock" || bad B5 "rc=$RC $LOGL"

$R --git-dir="$T/mirror.git" config remote.origin.url "$T/nonexistent.git"
run none bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA could not read GitHub" && ok "B6b unreadable GitHub -> FAIL-INFRA (after one retry)" || bad B6b "rc=$RC $LOGL"
$R --git-dir="$T/mirror.git" config remote.origin.url "$T/src.git"
( cd "$T" && $R init -q --bare empty.git )
$R --git-dir="$T/mirror.git" config remote.origin.url "$T/empty.git"
run none bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA GitHub answered but has NO branch" && ok "B6c a source with no such branch is named as that, not as 'could not read'" || bad B6c "rc=$RC $LOGL"
$R --git-dir="$T/mirror.git" config remote.origin.url "$T/src.git"


# ================= round 2 (CONTROLS run the r2 copy, b9ca76485) =================
run none bs_new >/dev/null
# F2-B1: GitHub answers the RE-READ with no branch; that must never be a PASS.
run reread_empty bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA GitHub answered the re-read with NO branch" && ok "F2-B1: an empty re-read -> FAIL-INFRA, not a PASS" || bad F2-B1 "rc=$RC $LOGL"
run none bs_new >/dev/null
run reread_empty bs_r2
[ $RC -eq 0 ] && has PASS && ok "F2-B1 CONTROL: r2 PASSED with an empty re-read ($(echo "$LOGL" | grep -o 'GitHub moved again, to [^,]*'))" || bad F2-B1c "rc=$RC $LOGL"
run none bs_new >/dev/null
# F2-B3: an object of the head's tree OTHER than the known file is missing. Built in BOTH stores.
H=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
FAKE=$(printf 'also never stored %s' "$H" | $R hash-object --stdin)
rm -f "$T/brk.ids"; both mkbroken "$(printf '100644 blob %s\tzz-missing.txt' "$FAKE")" "a missing non-known blob" zz-missing.txt
brk_same && ok "F2-B3 harness: the broken commit has one id in both stores" || bad F2-B3-pre "$(cat "$T/brk.ids")"
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && echo "$LOGL" | grep -q "missing-objects=1" && ok "F2-B3: a missing object anywhere in the head's tree FAILs (missing-objects=1)" || bad F2-B3 "rc=$RC $LOGL"
run noop_fetch bs_r2
[ $RC -eq 0 ] && has PASS && ok "F2-B3 CONTROL: r2 PASSED it (only the known file was checked)" || bad F2-B3c "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$H"; $R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$H"


# ================= round 3 (CONTROLS run the r3 copy, 764ec389b) =================
run none bs_new >/dev/null
# F3-B2: the object check must PROVE it ran; a dead or silent instrument is never "0 missing".
run catfile_dies bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA the object check could not complete" && ok "F3-B2a: cat-file answering nothing -> FAIL-INFRA, not PASS" || bad F3-B2a "rc=$RC $LOGL"
run catfile_dies bs_r3
[ $RC -eq 0 ] && has PASS && ok "F3-B2a CONTROL: r3 PASSED without checking a single object" || bad F3-B2ac "rc=$RC $LOGL"
run lstree_empty bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA the object check could not complete: listing the head's tree returned no objects" && ok "F3-B2b: an empty tree listing -> FAIL-INFRA" || bad F3-B2b "rc=$RC $LOGL"
run lstree_empty bs_r3
[ $RC -eq 0 ] && has PASS && ok "F3-B2b CONTROL: r3 PASSED an empty listing" || bad F3-B2bc "rc=$RC $LOGL"
# F3-B4: a clone failure is not evidence about objects -> FAIL-INFRA.
run clone_fail bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA the reproduction clone failed" && ok "F3-B4: a clone failure -> FAIL-INFRA with git's line" || bad F3-B4 "rc=$RC $LOGL"
run clone_fail bs_r3
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "F3-B4 CONTROL: r3 called a clone failure a reproduction verdict" || bad F3-B4c "rc=$RC $LOGL"
# F3-B5: a missing mirror, and the wrong user, page.
run none bs_new_norepo
[ $RC -eq 1 ] && has "FAIL-REPRODUCE the mirror $T/no-such-mirror.git does not exist" && posted && ok "F3-B5a: a missing mirror -> FAIL-REPRODUCE and a page" || bad F3-B5a "rc=$RC $LOGL"
run none bs_r3_norepo
[ $RC -eq 1 ] && ! posted && ok "F3-B5a CONTROL: r3 logged it and paged nobody" || bad F3-B5ac "rc=$RC $LOGL"
run none bs_new_user
[ $RC -eq 2 ] && posted && ok "F3-B5b: the wrong user -> exit 2 and a page" || bad F3-B5b "rc=$RC $LOGL"
run none bs_r3_user
[ $RC -eq 2 ] && ! posted && ok "F3-B5b CONTROL: r3 refused and paged nobody" || bad F3-B5bc "rc=$RC $LOGL"

# ================= Langston's gate 4a-2 conditions (APPROVED WITH CONDITIONS on 2767d358a); CONTROLS run r4 =================
run none bs_new >/dev/null
# G2-1a: GitHub force-pushed to a commit NOT containing the pre-fetch head, then moved again: this
# box cannot tell that from a bad ref -> FAIL-INFRA (not a verdict), never "backup not valid".
run sibling_then_push bs_new
[ $RC -eq 1 ] && has FAIL-INFRA && grep -q "a rewind-and-move during the run and a bad ref look the same from here" "$T/sync.log" && ok "G2-1a: undecidable rewind-and-move -> FAIL-INFRA" || bad G2-1a "rc=$RC $LOGL"
run none bs_new >/dev/null
run sibling_then_push bs_r4
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "G2-1a CONTROL: r4 called it 'backup NOT valid'" || bad G2-1ac "rc=$RC $LOGL"
run none bs_new >/dev/null
# G2-1b: the same, when GitHub's pre-fetch head was never fetched (the other undecidable arm).
( rm -f "$T/fired"; DTT_MODE=before_lsremote git ls-remote "$T/src.git" >/dev/null; rm -f "$T/fired" )
run sibling_then_push bs_new
[ $RC -eq 1 ] && has FAIL-INFRA && grep -q "the mirror does not hold" "$T/sync.log" && ok "G2-1b: pre-fetch head never held + GitHub moved again -> FAIL-INFRA" || bad G2-1b "rc=$RC $LOGL"
run none bs_new >/dev/null
( rm -f "$T/fired"; DTT_MODE=before_lsremote git ls-remote "$T/src.git" >/dev/null; rm -f "$T/fired" )
run sibling_then_push bs_r4
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "G2-1b CONTROL: r4 called it 'backup NOT valid'" || bad G2-1bc "rc=$RC $LOGL"
run none bs_new >/dev/null
# G2-1c: the known file renamed away -> the check could not run -> FAIL-INFRA.
H=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
KB=$($R --git-dir="$T/src.git" rev-parse "$H:CLAUDE.md")
rm -f "$T/brk.ids"; both mkbroken "$(printf '100644 blob %s\tCLAUDE-renamed.md' "$KB")" "CLAUDE.md renamed" CLAUDE.md
brk_same && ok "G2-1c harness: the rename commit has one id in both stores" || bad G2-1c-pre "$(cat "$T/brk.ids")"
run noop_fetch bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA CLAUDE.md is not in the head's tree" && ok "G2-1c: a renamed known file -> FAIL-INFRA, not a verdict" || bad G2-1c "rc=$RC $LOGL"
run noop_fetch bs_r4
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "G2-1c CONTROL: r4 called the backup NOT valid" || bad G2-1cc "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$H"; $R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$H"
# G2-3: a page that fails is logged.
CCSEND_FAIL=1; export CCSEND_FAIL
run fail_fetch bs_new
grep -q "PAGE FAILED (cc-send exit 1: cc-send: simulated failure) — the alarm above did NOT reach Discord" "$T/sync.log" && ok "G2-3: a failed page is logged with cc-send's own line" || bad G2-3 "$(tail -2 "$T/sync.log")"
run fail_fetch bs_r4
! grep -q "PAGE FAILED" "$T/sync.log" && posted && ok "G2-3 CONTROL: r4's failed page left no trace in the log" || bad G2-3c "$(tail -2 "$T/sync.log")"
unset CCSEND_FAIL
# G2-2: an exported GIT_OBJECT_DIRECTORY must not point the gate at another store. The mirror is
# MISSING a blob that only the test GitHub holds; a decoy object dir reaches GitHub's store.
run none bs_new >/dev/null
H=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
OB=$(printf 'only in the test GitHub %s' "$H" | $R --git-dir="$T/src.git" hash-object -w --stdin)
rm -f "$T/brk.ids"; both mkbroken "$(printf '100644 blob %s\tzz-only-in-src.txt' "$OB")" "a blob only GitHub holds" zz-only-in-src.txt
brk_same && ok "G2-2 harness: one commit id in both stores" || bad G2-2-pre "$(cat "$T/brk.ids")"
mkdir -p "$T/decoy-objects/info"; printf '%s\n' "$T/src.git/objects" > "$T/decoy-objects/info/alternates"
GIT_OBJECT_DIRECTORY="$T/decoy-objects"; export GIT_OBJECT_DIRECTORY
run noop_fetch bs_new; NRC=$RC; NL=$LOGL
run noop_fetch bs_r4; RRC=$RC; RL=$LOGL
unset GIT_OBJECT_DIRECTORY
[ $NRC -eq 1 ] && [ "${NL#* FAIL-REPRODUCE}" != "$NL" ] && echo "$NL" | grep -q "missing-objects=1" && ok "G2-2: with GIT_OBJECT_DIRECTORY exported, the gate still checks the MIRROR (missing-objects=1)" || bad G2-2 "rc=$NRC $NL"
[ $RRC -eq 0 ] && [ "${RL#* PASS}" != "$RL" ] && ok "G2-2 CONTROL: r4 checked the decoy store and logged PASS for a mirror missing a blob" || bad G2-2c "rc=$RRC $RL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$H"; $R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$H"

run none bs_new
[ $RC -eq 0 ] && has PASS && ok "positive: a healthy mirror still PASSes after all of the above" || bad Fp "rc=$RC $LOGL"

echo "BSYNC SUMMARY: $PASSN pass, $FAILN fail"
