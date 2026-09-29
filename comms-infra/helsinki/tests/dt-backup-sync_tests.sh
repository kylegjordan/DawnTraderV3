#!/bin/bash
# dt-backup-sync.sh tests (B-CREDENTIALS-PRIVATE-REPO OBJ-4a / A5). As langston, in
# /tmp/dtr-test/bs ONLY. "GitHub" is a local bare repo we can push to at a chosen instant;
# a wrapper `git` fires the push at that instant. cc-send is stubbed to echo. The test copies
# differ from the file under test ONLY in REPO, LOG, LOCK_WAIT, RETRY_AFTER and the cc-send stub.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in
#   dt-backup-sync.sh         the version under test
#   dt-backup-sync.baseline   comms-infra/helsinki/dt-backup-sync.sh at ab68732d7 (the live copy)
#   dt-backup-sync.r1         the same path at b4db96b9c (before the fresh-reader round)
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
$R clone -q --bare --shared "$T/src.git" mirror.git

mk() { # name source lockwait
  sed -e "s#^REPO=.*#REPO=$T/mirror.git#" -e "s#^LOG=.*#LOG=$T/sync.log#" \
      -e "s#^LOCK_WAIT=.*#LOCK_WAIT=$3#" -e "s#^RETRY_AFTER=.*#RETRY_AFTER=1#" \
      -e "s#cc-send --sender#echo WOULD-POST --sender#" "$2" > "$T/$1"
  chmod +x "$T/$1"
}
mk bs_new  /tmp/dtr-test/src/dt-backup-sync.sh       2
mk bs_base /tmp/dtr-test/src/dt-backup-sync.baseline 2
mk bs_r1   /tmp/dtr-test/src/dt-backup-sync.r1       2

cat > "$T/bin/git" <<EOF
#!/bin/bash
R=/usr/bin/git
advance() {
  h=\$(\$R --git-dir=$T/src.git rev-parse refs/heads/$B)
  n=\$(\$R --git-dir=$T/src.git commit-tree -p "\$h" -m adv "\$(\$R --git-dir=$T/src.git rev-parse "\$h^{tree}")")
  \$R --git-dir=$T/src.git update-ref refs/heads/$B "\$n"
}
case "\$1" in
  ls-remote)
    if [ "\${DTT_MODE:-}" = before_lsremote ] && [ ! -e $T/fired ]; then touch $T/fired; advance; fi
    \$R "\$@"; rc=\$?
    if [ "\${DTT_MODE:-}" = after_lsremote ] && [ ! -e $T/fired ]; then touch $T/fired; advance; fi
    exit \$rc ;;
  fetch)
    [ "\${DTT_MODE:-}" = noop_fetch ] && exit 0
    [ "\${DTT_MODE:-}" = fail_fetch ] && { echo "fatal: simulated fetch failure" >&2; exit 1; }
    exec \$R "\$@" ;;
  *) exec \$R "\$@" ;;
esac
EOF
chmod +x "$T/bin/git"
export PATH="$T/bin:$PATH"

run() { rm -f "$T/fired"; : > "$T/sync.log"; DTT_MODE=$1 "$T/$2" > "$T/out" 2>&1; RC=$?; LOGL=$(grep -v '^fatal\|^error\|^warning' "$T/sync.log" | tail -1); }
has() { [ "${LOGL#* $1}" != "$LOGL" ]; }

run none bs_new
[ $RC -eq 0 ] && has PASS && [ -s "$T/mirror.git/DT_SYNC_PASS" ] && ok "B1 normal run PASS: $LOGL" || bad B1 "rc=$RC $LOGL"
read -r E1 I1 < "$T/mirror.git/DT_SYNC_PASS"
[ "$(date -u -d "@$E1" +%Y-%m-%dT%H:%M:%SZ)" = "$I1" ] && ok "B7 DT_SYNC_PASS is ONE instant: '$E1 $I1'" || bad B7 "$E1 $I1"

run before_lsremote bs_base
[ $RC -eq 1 ] && has FAIL-REPRODUCE && grep -q "WOULD-POST" "$T/out" && ok "B2 CONTROL: the baseline raises the historical false alarm" || bad B2c "rc=$RC $LOGL"
run after_lsremote bs_new
[ $RC -eq 0 ] && has PASS && ! grep -q WOULD-POST "$T/out" && ok "B2 new: a push landing mid-run -> PASS, no page" || bad B2 "rc=$RC $LOGL"
run before_lsremote bs_new
[ $RC -eq 0 ] && has PASS && ok "B2b new: a push just before ls-remote -> PASS" || bad B2b "rc=$RC $LOGL"

# True negative: GitHub moved and the mirror did not (the fetch is a no-op).
PREV=$(cat "$T/mirror.git/DT_SYNC_PASS")
( rm -f "$T/fired"; DTT_MODE=before_lsremote git ls-remote "$T/src.git" >/dev/null; rm -f "$T/fired" )   # advance GitHub once
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && grep -q WOULD-POST "$T/out" && [ "$(cat "$T/mirror.git/DT_SYNC_PASS")" = "$PREV" ] && ok "B3 a mirror behind GitHub FAILs and pages; DT_SYNC_PASS unchanged" || bad B3 "rc=$RC $LOGL"
run none bs_new >/dev/null   # catch the mirror up again

# F-B6: GitHub force-pushed BACK to an ancestor while the mirror keeps the newer commit.
X=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$X~1"
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "B6 a force-push BACK is not waved through (FAIL-REPRODUCE)" || bad B6 "rc=$RC $LOGL"
run noop_fetch bs_r1
[ $RC -eq 0 ] && has PASS && ok "B6 CONTROL: r1 PASSED a mirror holding a commit GitHub no longer has" || bad B6-ctl "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$X"
run none bs_new >/dev/null

# F-B1: the known file's blob is MISSING; the commit and trees are fine.
H=$($R --git-dir="$T/src.git" rev-parse refs/heads/$B)
FAKE=$(printf 'never stored %s' "$H" | $R hash-object --stdin)
NT=$( { $R --git-dir="$T/src.git" ls-tree "$H" | grep -v "	CLAUDE.md$"; printf '100644 blob %s\tCLAUDE.md\n' "$FAKE"; } | $R --git-dir="$T/src.git" mktree --missing)
NC=$($R --git-dir="$T/src.git" commit-tree -p "$H" -m "missing CLAUDE.md blob" "$NT")
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$NC"
$R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$NC"
run noop_fetch bs_new
[ $RC -eq 1 ] && has FAIL-REPRODUCE && ok "B1b a mirror MISSING the known file's content FAILs (re-hash): $LOGL" || bad B1b "rc=$RC $LOGL"
run noop_fetch bs_r1
[ $RC -eq 0 ] && has PASS && ok "B1b CONTROL: r1 PASSED it (it read only the tree entry)" || bad B1b-ctl "rc=$RC $LOGL"
$R --git-dir="$T/src.git" update-ref refs/heads/$B "$H"; $R --git-dir="$T/mirror.git" update-ref refs/heads/$B "$H"

run fail_fetch bs_new
[ $RC -eq 1 ] && has "FAIL-INFRA git fetch failed twice" && grep -q "NOT a verdict on the backup either way" "$T/sync.log" && ok "B4 a failed fetch -> FAIL-INFRA, worded as no verdict, with git's line" || bad B4 "rc=$RC $LOGL"
[ "$(grep -c 'simulated fetch failure' "$T/sync.log")" -ge 2 ] && ok "B4 git's own message is logged for both attempts" || bad B4b x

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

echo "BSYNC SUMMARY: $PASSN pass, $FAILN fail"
