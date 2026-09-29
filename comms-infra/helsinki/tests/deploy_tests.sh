#!/bin/bash
# deploy.sh tests (B-CREDENTIALS-PRIVATE-REPO P1b). As ROOT, but every path deploy.sh writes is
# redirected into /tmp/dtr-test/dep by sed on a TEST COPY; apt-get, systemctl and the venv are
# stubbed; the langston cron calls are replaced by an echo. The live mirror is only cloned FROM.
# Because deploy.sh refuses to run unless its own bytes equal deploy.sh at --sha, the test copy is
# committed into the TEST mirror as a child of the sha under test, and that commit is installed.
# Args: <full sha under test> <old sha that predates comms-infra/helsinki/>
# SETUP: /tmp/dtr-test/src/deploy.r1 = comms-infra/discord/deploy.sh at b4db96b9c and deploy.r2 = the same
# path at b9ca76485 (before fresh-reader rounds 1 and 2), for the CONTROL lines, which must FAIL on them.
set -u
SHA=$1; OLD=$2
T=/tmp/dtr-test/dep
B=migration/aws-supabase
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 9; }
rm -rf "$T"; mkdir -p "$T"/{bin,opt/venv/bin,units,log,lib,etc,stub}; chown -R langston:langston "$T"
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }
L() { sudo -u langston env GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@i GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@i git --git-dir="$T/mirror.git" "$@"; }
cd /

sudo -u langston HOME=/home/langston sh -c "cd $T && git clone -q --bare --shared /srv/dawntrader-backup.git mirror.git \
  && git --git-dir=mirror.git fetch -q git@github.com:kylegjordan/DawnTraderV3.git +refs/heads/$B:refs/heads/$B"
L config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
L update-ref refs/remotes/origin/stale-planted "$SHA"

redirect() { # source -> stdout: every write path under $T, cron calls echoed
  sed -e "s#^MIRROR=.*#MIRROR=$T/mirror.git#" -e "s#^BRIDGE_DIR=.*#BRIDGE_DIR=$T/opt#" -e "s#^UNITS=.*#UNITS=$T/units#" \
      -e "s#/usr/local/bin/#$T/bin/#g" -e "s#/var/log/#$T/log/#g" -e "s#/var/lib/dt-deploy-drift#$T/lib/dt-deploy-drift#g" \
      -e "s#/etc/dawntrader/comms-active.env#$T/etc/comms-active.env#g" -e "s#mkdir -p /etc/dawntrader#mkdir -p $T/etc#" \
      -e "s#/root/deploy-retired#$T/retired#g" -e "s#sudo -u langston crontab#$T/stub/fakecrontab#g" "$1"
}
L cat-file blob "$SHA:comms-infra/discord/deploy.sh" > "$T/deploy.orig"
redirect "$T/deploy.orig" > "$T/deploy.sh"
redirect /tmp/dtr-test/src/deploy.r1 > "$T/deploy.r1"
chown langston:langston "$T"/deploy.*
LEFT=$(grep -nE '/usr/local/bin|/var/log|/var/lib|/etc/systemd/system/|/etc/dawntrader/comms-active|/srv/dawntrader|mkdir -p /etc/dawntrader|/root/deploy-retired' "$T/deploy.sh" | grep -v '^[0-9]*:[[:space:]]*#')
[ -z "$LEFT" ] && ok "test copy: no live write path left in executable lines" || bad redirect "$LEFT"

# TC = the sha under test, with the test copy AS comms-infra/discord/deploy.sh; on the branch.
tree_with() { # base-commit path blob mode -> new tree id
  sudo -u langston sh -c "export GIT_INDEX_FILE=$T/idx.\$\$; git --git-dir=$T/mirror.git read-tree $1 && git --git-dir=$T/mirror.git update-index --cacheinfo $4,$3,$2 && git --git-dir=$T/mirror.git write-tree; rm -f \$GIT_INDEX_FILE"
}
TB=$(L hash-object -w "$T/deploy.sh")
TC=$(L commit-tree -p "$SHA" -m "test: redirected deploy.sh" "$(tree_with "$SHA" comms-infra/discord/deploy.sh "$TB" 100755)")
L update-ref "refs/heads/$B" "$TC"

printf '#!/bin/sh\necho "stub $(basename $0) $*"\n' > "$T/stub/apt-get"; cp "$T/stub/apt-get" "$T/stub/systemctl"
printf '#!/bin/sh\nexit 0\n' > "$T/opt/venv/bin/pip"; printf '#!/bin/sh\necho 2.9.9-stub\n' > "$T/opt/venv/bin/python3"
# fakecrontab: langston's crontab lives in $T/crontab.txt; FAKECRON=fail makes the READ fail.
cat > "$T/stub/fakecrontab" <<EOF2
#!/bin/sh
if [ "\$1" = -l ]; then
  [ "\${FAKECRON:-}" = fail ] && { echo "crontab: simulated read failure" >&2; exit 2; }
  [ -f $T/crontab.txt ] || { echo "no crontab for langston" >&2; exit 1; }
  cat $T/crontab.txt
else
  cat > $T/crontab.txt
fi
EOF2
chmod +x "$T"/stub/* "$T"/opt/venv/bin/*
export PATH="$T/stub:$PATH"
run() { bash "$@" > "$T/out" 2>&1; RC=$?; }

# ---- the installer must be the reviewed copy ----
run "$T/deploy.sh" --sha "$SHA" --only readers
[ $RC -eq 2 ] && grep -q "is not comms-infra/discord/deploy.sh at $SHA" "$T/out" && ok "D0 self-check: a copy whose bytes differ from deploy.sh at --sha is refused" || bad D0 "rc=$RC $(tail -2 "$T/out")"
bash <(cat "$T/deploy.sh") --sha "$TC" --only readers > "$T/out" 2>&1; RC=$?
[ $RC -eq 2 ] && grep -q "run this script from a FILE" "$T/out" && ok "D0b process substitution (no file to check) is refused" || bad D0b "rc=$RC"

# ---- F-D1 (the BLOCKER): a symlinked lock must never hand langston a root-owned file ----
echo "root-owned victim" > "$T/victim"; chown root:root "$T/victim"; chmod 0644 "$T/victim"
rm -f "$T/mirror.git/dt-fetch.lock"; sudo -u langston ln -s "$T/victim" "$T/mirror.git/dt-fetch.lock"
run "$T/deploy.sh" --sha "$TC" --only readers
[ "$(stat -c %U "$T/victim")" = root ] && [ "$(cat "$T/victim")" = "root-owned victim" ] && ok "D1-BLOCKER: symlinked lock -> the root-owned target is untouched (rc=$RC)" || bad D1b "owner=$(stat -c %U "$T/victim") rc=$RC"
run "$T/deploy.r1" --sha "$SHA" --only readers
[ "$(stat -c %U "$T/victim")" = langston ] && ok "D1-BLOCKER CONTROL: r1 handed the root-owned target to langston" || bad D1b-ctl "owner=$(stat -c %U "$T/victim")"
rm -f "$T/mirror.git/dt-fetch.lock"; chown root:root "$T/victim"
L update-ref "refs/heads/$B" "$TC"
L config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'; L update-ref refs/remotes/origin/stale-planted "$SHA"

# ---- D1: readers, normally ----
run "$T/deploy.sh" --sha "$TC" --only readers
V1=$(git hash-object "$T/bin/dt-review"); W1=$(L rev-parse "$TC:comms-infra/helsinki/dt-review")
[ $RC -eq 0 ] && [ "$V1" = "$W1" ] && grep -q "install-verify: all 2 installed files equal their verified blobs" "$T/out" && ok "D1 readers installed + verified (dt-review $V1)" || bad D1 "rc=$RC $(tail -3 "$T/out")"
[ -f "$T/mirror.git/dt-fetch.lock" ] && [ ! -L "$T/mirror.git/dt-fetch.lock" ] && [ "$(stat -c %U "$T/mirror.git/dt-fetch.lock")" = langston ] && ok "D1 the fetch lock is a langston-owned regular file (created by flock as langston)" || bad D1c x
[ -z "$(L config --get-all remote.origin.fetch)" ] && [ "$(L for-each-ref refs/remotes/ | wc -l)" -eq 0 ] && grep -q "fetch refspec dropped; refs/remotes/\* empty" "$T/out" && ok "D1 decision 14 asserted: refspec dropped, refs/remotes/* empty" || bad D1d x

# ---- F-D2: a FORGED object in the mirror must never be installed ----
X=$(printf 'forged-%s' "$(date +%s%N)" | sha1sum | cut -c1-40)
FORGED="$T/forged-content"; printf '#!/bin/sh\necho TAMPERED\n' > "$FORGED"
python3 - "$T/mirror.git/objects" "$X" "$FORGED" <<'PY'
import os, sys, zlib
objdir, oid, src = sys.argv[1:4]
data = open(src, "rb").read()
d = os.path.join(objdir, oid[:2]); os.makedirs(d, exist_ok=True)
open(os.path.join(d, oid[2:]), "wb").write(zlib.compress(b"blob %d\0" % len(data) + data))
PY
chown -R langston:langston "$T/mirror.git/objects"
TC2=$(L commit-tree -p "$TC" -m "test: forged dt-review blob" "$(tree_with "$TC" comms-infra/helsinki/dt-review "$X" 100755)")
L update-ref "refs/heads/$B" "$TC2"
BEFORE=$(git hash-object "$T/bin/dt-review")
run "$T/deploy.sh" --sha "$TC2" --only readers
[ $RC -eq 2 ] && grep -q "re-hashes to" "$T/out" && grep -q "PRE-FLIGHT FAILED — nothing has been changed" "$T/out" && [ "$(git hash-object "$T/bin/dt-review")" = "$BEFORE" ] && ok "D2: a forged blob is caught by the re-hash BEFORE install; nothing changed" || bad D2 "rc=$RC $(tail -3 "$T/out")"
run "$T/deploy.r1" --sha "$TC2" --only readers
cmp -s "$T/bin/dt-review" "$FORGED" && ok "D2 CONTROL: r1 INSTALLED the forged bytes (its gate fired only afterwards, rc=$RC)" || bad D2-ctl "rc=$RC"
L update-ref "refs/heads/$B" "$TC"

# ---- refusals ----
run "$T/deploy.sh" --sha "${TC:0:12}" --only readers; [ $RC -eq 2 ] && grep -q "FULL 40-hex" "$T/out" && ok "D3 short sha refused" || bad D3a "$RC"
OFFC=$(L commit-tree -p "$TC" -m off "$(L rev-parse "$TC^{tree}")")
run "$T/deploy.sh" --sha "$OFFC" --only readers; [ $RC -eq 2 ] && grep -q "is not an ancestor of $B as read from the mirror" "$T/out" && ok "D3 off-branch sha refused" || bad D3b "$RC $(cat "$T/out")"
run "$T/deploy.sh" --sha 0123456789abcdef0123456789abcdef01234567; [ $RC -eq 2 ] && grep -q "not in the mirror yet" "$T/out" && ok "D3 absent sha refused" || bad D3c "$RC $(cat "$T/out")"
run "$T/deploy.sh" --sha "$TC" --only readers,frobs; [ $RC -eq 2 ] && grep -q "unknown group 'frobs'" "$T/out" && ok "D3 unknown group refused" || bad D3d "$RC"
run "$T/deploy.sh" --sha "$TC" --only ""; A=$RC; run "$T/deploy.sh" --sha "$TC" --only ,; Bb=$RC
[ "$A$Bb" = 22 ] && ok "D3 --only '' and --only , refused (no silent no-op)" || bad D3e "$A$Bb"
run "$T/deploy.sh" --only readers; [ $RC -eq 2 ] && ok "D3 missing --sha refused" || bad D3f "$RC"

# ---- pre-flight: a sha that predates comms-infra/helsinki/ -> exit 2, nothing changed ----
cp "$T/bin/dt-review" "$T/before.dtr"
run "$T/deploy.sh" --sha "$OLD" --only readers
[ $RC -eq 2 ] && grep -q "PRE-FLIGHT FAILED — nothing has been changed" "$T/out" && grep -q "comms-infra/helsinki/dt-review" "$T/out" && cmp -s "$T/bin/dt-review" "$T/before.dtr" && ok "D4 pre-flight names the missing files and changes nothing" || bad D4 "rc=$RC $(tail -3 "$T/out")"

# ---- bridges and notices ----
run "$T/deploy.sh" --sha "$TC" --only bridges
[ $RC -eq 0 ] && grep -q "install-verify: all 11 installed files equal their verified blobs" "$T/out" && [ -f "$T/units/discord-langston-bridge.service.d/self-advance.conf" ] && [ -f "$T/opt/crew-status-post.py" ] && ok "D5 bridges: 11 files installed + verified (crew-status-post.py included)" || bad D5 "rc=$RC $(tail -5 "$T/out")"
grep -q "^COMMS_BACKEND=discord" "$T/etc/comms-active.env" && ok "D5 a fresh host is seeded with COMMS_BACKEND=discord" || bad D5s "$(grep COMMS_BACKEND "$T/etc/comms-active.env")"
grep -q "NOT RESTARTED: discord-langston-bridge.service" "$T/out" && ! grep -q "stub systemctl restart" "$T/out" && ok "D5 the running bridges are named NOT RESTARTED; no restart issued" || bad D5b x
run "$T/deploy.sh" --sha "$TC" --only notices
[ $RC -eq 0 ] && grep -q "install-verify: all 3 installed files equal their verified blobs" "$T/out" && [ "$(stat -c %U "$T/log/dt-deploy-drift.log")" = langston ] && ok "D6 notices: 3 files installed + verified; drift log langston-owned" || bad D6 "rc=$RC $(tail -3 "$T/out")"


# ================= round 2 (fresh-reader round 2 on b9ca76485) =================
# F2-D4: the crontab is read ONCE; a failed read never becomes an empty crontab.
printf '# langston crontab\n*/15 * * * * /usr/local/bin/dt-backup-sync.sh >/dev/null 2>&1\n5 4 * * * /usr/local/bin/other-job\n' > "$T/crontab.txt"
cp "$T/crontab.txt" "$T/crontab.before"
run "$T/deploy.sh" --sha "$TC" --only readers
cmp -s "$T/crontab.txt" "$T/crontab.before" && grep -q "langston cron already present for dt-backup-sync.sh" "$T/out" && ok "F2-D4: an existing cron line is found; the crontab is untouched" || bad F2-D4a "$(tail -2 "$T/out")"
printf '5 4 * * * /usr/local/bin/other-job\n' > "$T/crontab.txt"
run "$T/deploy.sh" --sha "$TC" --only readers
grep -q "other-job" "$T/crontab.txt" && grep -q "dt-backup-sync.sh" "$T/crontab.txt" && ok "F2-D4: a missing line is ADDED; the other lines are kept" || bad F2-D4b "$(cat "$T/crontab.txt")"
printf '5 4 * * * /usr/local/bin/other-job\n' > "$T/crontab.txt"; cp "$T/crontab.txt" "$T/crontab.before"
FAKECRON=fail bash "$T/deploy.sh" --sha "$TC" --only readers > "$T/out" 2>&1; RC=$?
[ $RC -eq 2 ] && grep -q "cannot read langston's crontab" "$T/out" && cmp -s "$T/crontab.txt" "$T/crontab.before" && ok "F2-D4: a failed crontab read -> refused, crontab untouched" || bad F2-D4c "rc=$RC $(tail -2 "$T/out")"
FAKECRON=fail bash "$T/deploy.r1" --sha "$SHA" --only readers > "$T/out" 2>&1
grep -q "other-job" "$T/crontab.txt" && bad F2-D4-ctl "r1 kept it" || ok "F2-D4 CONTROL: r1 WIPED langston's crontab on a failed read ($(wc -l < "$T/crontab.txt") line(s) left)"
cp "$T/crontab.before" "$T/crontab.txt"
L update-ref "refs/heads/$B" "$TC"
# F2-D7: a log path that is a symlink is refused, never chowned through.
echo "root-owned log victim" > "$T/victim2"; chown root:root "$T/victim2"
rm -f "$T/log/dt-backup-sync.log"; ln -s "$T/victim2" "$T/log/dt-backup-sync.log"
run "$T/deploy.sh" --sha "$TC" --only readers
[ $RC -eq 2 ] && grep -q "is a symlink — refusing to chown it" "$T/out" && [ "$(stat -c %U "$T/victim2")" = root ] && ok "F2-D7: a symlinked log is refused; the target stays root-owned" || bad F2-D7 "rc=$RC owner=$(stat -c %U "$T/victim2")"
run "$T/deploy.r1" --sha "$SHA" --only readers
[ "$(stat -c %U "$T/victim2")" = langston ] && ok "F2-D7 CONTROL: r1 chowned the symlink's root-owned target to langston" || bad F2-D7c "owner=$(stat -c %U "$T/victim2")"
rm -f "$T/log/dt-backup-sync.log"; L update-ref "refs/heads/$B" "$TC"
# F2-D5: a relative path to the installer works.
( cd "$T" && bash ./deploy.sh --sha "$TC" --only readers > "$T/out" 2>&1 ); RC=$?
[ $RC -eq 0 ] && ok "F2-D5: run by a relative path, the self-check still finds the file" || bad F2-D5 "rc=$RC $(tail -2 "$T/out")"
redirect /tmp/dtr-test/src/deploy.r2 > "$T/deploy.r2"
( cd "$T" && bash ./deploy.r2 --sha "$TC" --only readers > "$T/out" 2>&1 ); RC=$?
[ $RC -eq 2 ] && grep -q "run this script from a FILE" "$T/out" && ok "F2-D5 CONTROL: r2 falsely refused a relative path" || bad F2-D5c "rc=$RC"
[ "$(L config --get core.logAllRefUpdates)" = always ] && ok "F2-B5: the mirror's reflog is on (core.logAllRefUpdates=always)" || bad F2-B5 "$(L config --get core.logAllRefUpdates)"
# F2-D1: the old installer's staging copies are retired, not left for an old installer.
for f in cc-send dt-push-notice.sh dt-deploy-drift.sh discord-cc-bridge.service deploy.sh; do echo stale > "$T/opt/$f"; done
mkdir -p "$T/opt/discord-langston-bridge.service.d"; echo stale > "$T/opt/discord-langston-bridge.service.d/self-advance.conf"
run "$T/deploy.sh" --sha "$TC" --only notices
[ $RC -eq 0 ] && [ ! -e "$T/opt/cc-send" ] && [ ! -e "$T/opt/dt-push-notice.sh" ] && ls "$T"/retired/*/cc-send >/dev/null 2>&1 && [ -e "$T/opt/deploy.sh" ] && ok "F2-D1: notices retires its 3 stale staging copies (bridges' copies untouched)" || bad F2-D1a "rc=$RC $(ls "$T/opt")"
mkdir -p "$T/units/discord-langston-bridge.service.d"; echo "[Service]" > "$T/units/discord-langston-bridge.service.d/override.conf"
run "$T/deploy.sh" --sha "$TC" --only bridges
[ $RC -eq 0 ] && [ ! -e "$T/opt/deploy.sh" ] && [ ! -e "$T/opt/discord-cc-bridge.service" ] && [ ! -e "$T/opt/discord-langston-bridge.service.d" ] && ok "F2-D1: bridges retires the units, the drop-in dir and the old deploy.sh" || bad F2-D1b "rc=$RC $(ls "$T/opt")"
grep -q "UNMANAGED DROP-IN: $T/units/discord-langston-bridge.service.d/override.conf" "$T/out" && ok "F2-D9: an unmanaged drop-in is named loudly" || bad F2-D9 x
grep -q "discord.py: 2.9.9-stub (unchanged)" "$T/out" && ok "F2-D10: an unchanged discord.py is reported as unchanged" || bad F2-D10 "$(grep discord.py "$T/out")"
rm -f "$T/units/discord-langston-bridge.service.d/override.conf"

echo "DEPLOY SUMMARY: $PASSN pass, $FAILN fail"
