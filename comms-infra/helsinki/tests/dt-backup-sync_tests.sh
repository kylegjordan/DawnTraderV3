#!/bin/bash
# dt-backup-sync.sh tests (B-CREDENTIALS-PRIVATE-REPO OBJ-4a / A5). As langston, in
# /tmp/dtr-test/bs ONLY. "GitHub" is a local bare repo we can push to at a chosen instant;
# a wrapper `git` fires the push at that instant. cc-send is stubbed to echo. The test copies
# differ from the committed script ONLY in REPO, LOG, LOCK_WAIT, RETRY_AFTER and the cc-send stub.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in dt-review and dt-backup-sync.sh at
# the sha under test, plus the BASELINES dt-review.baseline and dt-backup-sync.baseline = the same paths at
# 7f3a8dc89 (the verbatim live copies), and chown -R langston. Run: cd /home/langston && sudo -u langston
# HOME=/home/langston bash <this file>. Remove /tmp/dtr-test afterwards.
set -u
T=/tmp/dtr-test/bs
[ "$(id -un)" = langston ] || { echo "run as langston"; exit 9; }
rm -rf "$T"; mkdir -p "$T/bin"; cd "$T" || exit 9
export GIT_AUTHOR_NAME=bs-test GIT_AUTHOR_EMAIL=bs-test@invalid GIT_COMMITTER_NAME=bs-test GIT_COMMITTER_EMAIL=bs-test@invalid
B=migration/aws-supabase
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }

/usr/bin/git clone -q --bare --shared /srv/dawntrader-backup.git src.git
/usr/bin/git clone -q --bare --shared "$T/src.git" mirror.git

mk() { # name source lockwait
  sed -e "s#^REPO=.*#REPO=$T/mirror.git#" -e "s#^LOG=.*#LOG=$T/sync.log#" \
      -e "s#^LOCK_WAIT=.*#LOCK_WAIT=$3#" -e "s#^RETRY_AFTER=.*#RETRY_AFTER=1#" \
      -e "s#cc-send --sender#echo WOULD-POST --sender#" "$2" > "$T/$1"
  chmod +x "$T/$1"
}
mk bs_new /tmp/dtr-test/src/dt-backup-sync.sh 2
mk bs_base /tmp/dtr-test/src/dt-backup-sync.baseline 2

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

run() { rm -f "$T/fired"; : > "$T/sync.log"; DTT_MODE=$1 "$T/$2" > "$T/out" 2>&1; RC=$?; LOGL=$(tail -1 "$T/sync.log"); }

run none bs_new
[ $RC -eq 0 ] && [ "${LOGL#* PASS }" != "$LOGL" ] && [ -s "$T/mirror.git/DT_SYNC_PASS" ] && ok "B1 normal run PASS, DT_SYNC_PASS='$(cat "$T/mirror.git/DT_SYNC_PASS")'" || bad B1 "rc=$RC $LOGL"

# The historical false alarm: a push between the baseline's fetch and its ls-remote.
run before_lsremote bs_base
[ $RC -eq 1 ] && [ "${LOGL#* FAIL-REPRODUCE }" != "$LOGL" ] && grep -q "WOULD-POST" "$T/out" && ok "B2 CONTROL: baseline reproduces the false alarm (FAIL-REPRODUCE + page)" || bad B2c "rc=$RC $LOGL"
# The new script's own gap: a push between its ls-remote and its fetch.
run after_lsremote bs_new
[ $RC -eq 0 ] && [ "${LOGL#* PASS }" != "$LOGL" ] && ! grep -q WOULD-POST "$T/out" && ok "B2 new: push landing mid-run -> PASS, no page" || bad B2 "rc=$RC $LOGL"
run before_lsremote bs_new
[ $RC -eq 0 ] && [ "${LOGL#* PASS }" != "$LOGL" ] && ok "B2b new: push just before ls-remote -> PASS" || bad B2b "rc=$RC $LOGL"

# True negative: GitHub moved and the mirror did NOT (fetch is a no-op). Must still FAIL.
PREV=$(cat "$T/mirror.git/DT_SYNC_PASS")
rm -f "$T/fired"; DTT_MODE=before_lsremote /usr/bin/true
( cd "$T" && PATH="$T/bin:$PATH" DTT_MODE=before_lsremote git ls-remote "$T/src.git" >/dev/null )   # advance GitHub once
run noop_fetch bs_new
[ $RC -eq 1 ] && [ "${LOGL#* FAIL-REPRODUCE }" != "$LOGL" ] && grep -q WOULD-POST "$T/out" && [ "$(cat "$T/mirror.git/DT_SYNC_PASS")" = "$PREV" ] && ok "B3 wrong mirror head still FAILs and pages; DT_SYNC_PASS unchanged" || bad B3 "rc=$RC $LOGL"

run fail_fetch bs_new
[ $RC -eq 1 ] && [ "${LOGL#* FAIL-INFRA git fetch failed twice}" != "$LOGL" ] && [ "$(cat "$T/mirror.git/DT_SYNC_PASS")" = "$PREV" ] && ok "B4 failed fetch -> FAIL-INFRA (after one retry), DT_SYNC_PASS unchanged" || bad B4 "rc=$RC $LOGL"
[ "$(grep -c 'simulated fetch failure' "$T/sync.log")" -eq 2 ] && ok "B4 git's own message is in the log, twice (one retry)" || bad B4b "$(grep -c 'simulated' "$T/sync.log")"

( flock "$T/mirror.git/dt-fetch.lock" sleep 6 ) & sleep 1
run none bs_new; wait
[ $RC -eq 1 ] && [ "${LOGL#* FAIL-INFRA the fetch lock was held}" != "$LOGL" ] && ok "B5 lock held -> FAIL-INFRA naming the lock" || bad B5 "rc=$RC $LOGL"

/usr/bin/git --git-dir="$T/mirror.git" config remote.origin.url "$T/nonexistent.git"
run none bs_new
[ $RC -eq 1 ] && [ "${LOGL#* FAIL-INFRA could not read GitHub}" != "$LOGL" ] && ok "B6 unreadable GitHub -> FAIL-INFRA (after one retry)" || bad B6 "rc=$RC $LOGL"
/usr/bin/git --git-dir="$T/mirror.git" config remote.origin.url "$T/src.git"

echo "BSYNC SUMMARY: $PASSN pass, $FAILN fail"
