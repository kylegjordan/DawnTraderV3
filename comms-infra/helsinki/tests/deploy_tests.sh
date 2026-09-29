#!/bin/bash
# deploy.sh tests (B-CREDENTIALS-PRIVATE-REPO P1b). As ROOT, but every path deploy.sh writes is
# redirected into /tmp/dtr-test/dep by sed on a TEST COPY; apt-get, systemctl and the venv are
# stubbed; the two langston cron calls are replaced by an echo. The live mirror is only cloned FROM.
# Args: <full sha under test> <old sha that predates comms-infra/helsinki/>
set -u
SHA=$1; OLD=$2
T=/tmp/dtr-test/dep
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 9; }
rm -rf "$T"; mkdir -p "$T"/{bin,opt/venv/bin,units,log,lib,etc,stub}; chown -R langston:langston "$T"
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }

# test mirror (as langston): a --shared clone of the live mirror, fetched up to the sha under test,
# with the stale-ref producer and a stale ref planted so decision 14 has something to remove.
sudo -u langston HOME=/home/langston sh -c "cd $T && git clone -q --bare --shared /srv/dawntrader-backup.git mirror.git \
  && git --git-dir=mirror.git fetch -q git@github.com:kylegjordan/DawnTraderV3.git +refs/heads/migration/aws-supabase:refs/heads/migration/aws-supabase \
  && git --git-dir=mirror.git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' \
  && git --git-dir=mirror.git update-ref refs/remotes/origin/stale-planted \$(git --git-dir=mirror.git rev-parse refs/heads/migration/aws-supabase)"

git --git-dir=/tmp/dtr-test/dep/mirror.git -c safe.directory='*' cat-file blob "$SHA:comms-infra/discord/deploy.sh" > "$T/deploy.orig"
sed -e "s#^MIRROR=.*#MIRROR=$T/mirror.git#" -e "s#^BRIDGE_DIR=.*#BRIDGE_DIR=$T/opt#" -e "s#^UNITS=.*#UNITS=$T/units#" \
    -e "s#/usr/local/bin/#$T/bin/#g" -e "s#/var/log/#$T/log/#g" -e "s#/var/lib/dt-deploy-drift#$T/lib/dt-deploy-drift#g" \
    -e "s#/etc/dawntrader/comms-active.env#$T/etc/comms-active.env#g" -e "s#mkdir -p /etc/dawntrader#mkdir -p $T/etc#" \
    -e "s#^  add_langston_cron #  echo CRON-SKIPPED-IN-TEST #" "$T/deploy.orig" > "$T/deploy.sh"
printf '#!/bin/sh\necho "stub $(basename $0) $*"\n' > "$T/stub/apt-get"; cp "$T/stub/apt-get" "$T/stub/systemctl"
printf '#!/bin/sh\nexit 0\n' > "$T/opt/venv/bin/pip"; printf '#!/bin/sh\necho 2.9.9-stub\n' > "$T/opt/venv/bin/python3"
chmod +x "$T"/stub/* "$T"/opt/venv/bin/*
export PATH="$T/stub:$PATH"
LEFT=$(grep -nE '/usr/local/bin|/var/log|/var/lib|/etc/systemd|/etc/dawntrader/comms-active|/srv/dawntrader' "$T/deploy.sh" | grep -v '^[0-9]*:#')
[ -z "$LEFT" ] && ok "test copy: no live write path left in executable lines" || bad redirect "$LEFT"

run() { bash "$T/deploy.sh" "$@" > "$T/out" 2>&1; RC=$?; }
M="git --git-dir=$T/mirror.git -c safe.directory=*"

# D1: readers
run --sha "$SHA" --only readers
V1=$(git hash-object "$T/bin/dt-review"); W1=$($M rev-parse "$SHA:comms-infra/helsinki/dt-review")
V2=$(git hash-object "$T/bin/dt-backup-sync.sh"); W2=$($M rev-parse "$SHA:comms-infra/helsinki/dt-backup-sync.sh")
[ $RC -eq 0 ] && [ "$V1" = "$W1" ] && [ "$V2" = "$W2" ] && grep -q "install-verify: all 2 installed files equal" "$T/out" && ok "D1 readers installed + verified (2 files; dt-review $V1)" || bad D1 "rc=$RC $(tail -3 "$T/out")"
[ "$(stat -c %a "$T/bin/dt-review")" = 755 ] && [ "$(stat -c %U "$T/mirror.git/dt-fetch.lock")" = langston ] && ok "D1 mode 755; fetch lock langston-owned" || bad D1b x
[ -z "$($M config --get-all remote.origin.fetch)" ] && [ "$($M for-each-ref refs/remotes/ | wc -l)" -eq 0 ] && ok "D1 decision 14: fetch refspec dropped, refs/remotes/* emptied (was 1 planted)" || bad D1c "$($M for-each-ref refs/remotes/)"
grep -q "CRON-SKIPPED-IN-TEST dt-backup-sync.sh" "$T/out" && ok "D1 cron call reached (stubbed)" || bad D1d x

# D2 MUTATION: an installer that installs nothing must be caught by the verify gate.
echo "not the reviewed bytes" > "$T/bin/dt-review"; echo "stale" > "$T/bin/dt-backup-sync.sh"
sed 's#^  install -m "\$3" "\$STAGE/\$1" "\$2"#  : noop-mutation#' "$T/deploy.sh" > "$T/deploy.mut"
grep -q "noop-mutation" "$T/deploy.mut" || bad D2setup "mutation did not apply"
bash "$T/deploy.mut" --sha "$SHA" --only readers > "$T/out" 2>&1; RC=$?
[ $RC -eq 3 ] && grep -q "INSTALL-VERIFY FAILED" "$T/out" && grep -q "$T/bin/dt-review: blob" "$T/out" && grep -q "$T/bin/dt-backup-sync.sh: blob" "$T/out" && ok "D2 MUTATION: no-op install -> exit 3 naming both files" || bad D2 "rc=$RC $(tail -4 "$T/out")"

# D3 refusals
run --sha "${SHA:0:12}" --only readers; [ $RC -eq 2 ] && grep -q "FULL 40-hex" "$T/out" && ok "D3 short sha refused" || bad D3a "$RC"
OFFC=$(sudo -u langston sh -c "cd $T && GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@i GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@i git --git-dir=mirror.git commit-tree -p $SHA -m off \$(git --git-dir=mirror.git rev-parse $SHA^{tree})")
run --sha "$OFFC" --only readers; [ $RC -eq 2 ] && grep -q "is not on migration/aws-supabase" "$T/out" && ok "D3 off-branch sha refused" || bad D3b "$RC $(cat "$T/out")"
run --sha 0123456789abcdef0123456789abcdef01234567; [ $RC -eq 2 ] && grep -q "not in the mirror yet" "$T/out" && ok "D3 absent sha refused" || bad D3c "$RC"
run --sha "$SHA" --only readers,frobs; [ $RC -eq 2 ] && grep -q "unknown group 'frobs'" "$T/out" && ok "D3 unknown group refused" || bad D3d "$RC"
run --only readers; [ $RC -eq 2 ] && ok "D3 missing --sha refused" || bad D3e "$RC"

# D4 PRE-FLIGHT: a sha that predates comms-infra/helsinki/ -> exit 2, nothing changed
cp "$T/bin/dt-review" "$T/before.dtr"
run --sha "$OLD" --only readers
[ $RC -eq 2 ] && grep -q "PRE-FLIGHT FAILED — nothing has been changed" "$T/out" && grep -q "comms-infra/helsinki/dt-review" "$T/out" && cmp -s "$T/bin/dt-review" "$T/before.dtr" && ok "D4 pre-flight names the missing files and changes nothing" || bad D4 "rc=$RC $(tail -3 "$T/out")"

# D5 bridges group (units, modules, seed env) with systemctl/apt/venv stubbed
run --sha "$SHA" --only bridges
[ $RC -eq 0 ] && grep -q "install-verify: all 10 installed files equal" "$T/out" && [ -f "$T/units/discord-langston-bridge.service.d/self-advance.conf" ] && [ -f "$T/etc/comms-active.env" ] && ok "D5 bridges: 10 files installed + verified, drop-in and seed env present" || bad D5 "rc=$RC $(tail -5 "$T/out")"
grep -q "stub systemctl enable --now discord-cc-bridge.service discord-langston-bridge.service" "$T/out" && ! grep -q "stub systemctl restart" "$T/out" && ok "D5 enable --now reached; no restart issued" || bad D5b x

# D6 notices group
run --sha "$SHA" --only notices
[ $RC -eq 0 ] && grep -q "install-verify: all 3 installed files equal" "$T/out" && [ "$(stat -c %U "$T/log/dt-deploy-drift.log")" = langston ] && ok "D6 notices: 3 files installed + verified; drift log langston-owned" || bad D6 "rc=$RC $(tail -3 "$T/out")"

echo "DEPLOY SUMMARY: $PASSN pass, $FAILN fail"
