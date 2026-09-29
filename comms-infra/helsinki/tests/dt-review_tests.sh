#!/bin/bash
# Test harness for B-CREDENTIALS-PRIVATE-REPO OBJ-4a (dt-review, dt-backup-sync.sh).
# Runs as langston in /tmp/dtr-test ONLY. Never touches /srv/dawntrader-backup.git except to
# clone FROM it (--shared: reads its objects, writes nothing there). cc-send is stubbed.
# Test copies differ from the committed files ONLY in config/stub lines, listed per copy.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in dt-review and dt-backup-sync.sh at
# the sha under test, plus the BASELINES dt-review.baseline and dt-backup-sync.baseline = the same paths at
# 7f3a8dc89 (the verbatim live copies), and chown -R langston. Run: cd /home/langston && sudo -u langston
# HOME=/home/langston bash <this file>. Remove /tmp/dtr-test afterwards.
set -u
T=/tmp/dtr-test
[ "$(id -un)" = langston ] || { echo "run as langston"; exit 9; }
mkdir -p "$T/bin"; cd "$T" || exit 9
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }

git clone -q --bare --shared /srv/dawntrader-backup.git mirror.git
git --git-dir=mirror.git config remote.origin.url git@github.com:kylegjordan/DawnTraderV3.git
B=migration/aws-supabase
HEADSHA=$(git --git-dir=mirror.git rev-parse refs/heads/$B)
cur() { git --git-dir=mirror.git rev-parse refs/heads/$B; }
export GIT_AUTHOR_NAME=dtr-test GIT_AUTHOR_EMAIL=dtr-test@invalid GIT_COMMITTER_NAME=dtr-test GIT_COMMITTER_EMAIL=dtr-test@invalid

mk_dtr() { # name, remote, lockwait, source
  sed -e "s#^REPO=.*#REPO=$T/mirror.git#" -e "s#^REMOTE=.*#REMOTE=$2#" -e "s#^LOCK_WAIT=.*#LOCK_WAIT=$3#" "$4" > "$T/$1"
  chmod +x "$T/$1"
}
mk_dtr dtr git@github.com:kylegjordan/DawnTraderV3.git 90 "$T/src/dt-review"
mk_dtr dtr_fail "$T/nonexistent.git" 90 "$T/src/dt-review"
mk_dtr dtr_busy git@github.com:kylegjordan/DawnTraderV3.git 3 "$T/src/dt-review"
sed -e "s#^REPO=.*#REPO=$T/mirror.git#" "$T/src/dt-review.baseline" > "$T/dtr_base"; chmod +x "$T/dtr_base"

run() { # cmd... -> sets OUT ERR RC
  "$@" > "$T/o" 2> "$T/e"; RC=$?; OUT=$(cat "$T/o"); ERR=$(cat "$T/e")
}

# ---------- dt-review ----------
# e: #920 reproduction, known-present term
run "$T/dtr" grep -i resolve_review_ref
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: dt-review grep takes no flags" && ok "e new: grep -i refused (exit 2, empty stdout)" || bad e "rc=$RC out=${OUT:0:80} err=${ERR:0:120}"
run "$T/dtr_base" grep -i resolve_review_ref
[ $RC -ne 2 ] && [ -n "$OUT" ] && ok "e MUTATION CONTROL: baseline does NOT refuse (rc=$RC, stdout '${OUT:0:60}')" || bad e-ctl "rc=$RC"
run "$T/dtr" grep resolve_review_ref
N=$(printf '%s\n' "$OUT" | grep -c . ); [ $RC -eq 0 ] && [ "$N" -ge 1 ] && echo "$ERR" | grep -q "^# grep 'resolve_review_ref' at $(cur)" && ok "e control: unflagged grep finds $N hits, provenance on stderr" || bad e-pos "rc=$RC n=$N err=${ERR:0:120}"
# e2
run "$T/dtr_base" grep -i comms-infra
BN=$(printf '%s\n' "$OUT" | grep -c .); BRC=$RC
run "$T/dtr" grep -i comms-infra
[ $RC -eq 2 ] && [ -z "$OUT" ] && ok "e2: grep -i comms-infra refused; baseline gave $BN lines rc=$BRC" || bad e2 "rc=$RC"
# e3: usage errors touch nothing
rm -f "$T/mirror.git/DT_REVIEW_FETCH_OK"
run "$T/dtr"; R1=$RC; run "$T/dtr" grep; R2=$RC; run "$T/dtr" show a b c; R3=$RC; run "$T/dtr" ls x; R4=$RC; run "$T/dtr" ref x; R5=$RC
[ $R1$R2$R3$R4$R5 = 22222 ] && [ ! -e "$T/mirror.git/DT_REVIEW_FETCH_OK" ] && ok "e3: 5 usage errors exit 2 and no fetch stamp was written" || bad e3 "$R1$R2$R3$R4$R5"
# identity
( cd / && sudo -n true 2>/dev/null ) && :
# a: pinned exact bytes, for a file changed after the pin
PIN=$(git --git-dir=mirror.git rev-parse "refs/heads/$B~40")
P=1-system-manual/RUNNING_ISSUES.md
WANT=$(git --git-dir=mirror.git rev-parse "$PIN:$P"); NOW=$(git --git-dir=mirror.git rev-parse "$HEADSHA:$P")
run "$T/dtr" show "$PIN" "$P"
GOT=$(git hash-object --stdin < "$T/o")
[ $RC -eq 0 ] && [ "$GOT" = "$WANT" ] && [ "$WANT" != "$NOW" ] && ok "a: show $PIN $P = blob $WANT (head blob differs: $NOW)" || bad a "rc=$RC got=$GOT want=$WANT now=$NOW"
echo "A_PIN=$PIN A_PATH=$P A_BLOB=$GOT"
run "$T/dtr" show "@$PIN" "$P"; GOT2=$(git hash-object --stdin < "$T/o")
[ "$GOT2" = "$WANT" ] && ok "a: @-form gives the same blob" || bad a@ "$GOT2"
# a line number from stdout is the file's line number (the +1 trap is gone)
L5=$(sed -n 5p "$T/o"); F5=$(git --git-dir=mirror.git cat-file blob "$PIN:$P" | sed -n 5p)
[ "$L5" = "$F5" ] && ok "a: stdout line 5 = file line 5 (no offset)" || bad a-line "differs"
# a2
run "$T/dtr" show main CLAUDE.md
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "is not a commit id" && ok "a2: 'show main CLAUDE.md' refused" || bad a2 "rc=$RC"
run "$T/dtr" grep @main foo
[ $RC -eq 2 ] && ok "a2b: 'grep @main' refused" || bad a2b "rc=$RC"
# c
run "$T/dtr" show 0123456789abcdef0123456789abcdef01234567 CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: 0123456789abcdef0123456789abcdef01234567 is not in the mirror (mirror head $(cur), fetched .* ago (DT_REVIEW_FETCH_OK); last fetch ok)" && ok "c: made-up sha -> not-in-mirror text" || bad c "rc=$RC err=${ERR:0:200}"
# b: an off-branch commit, built in the TEST mirror only
TREE=$(git --git-dir=mirror.git rev-parse "$HEADSHA^{tree}")
OFF=$(git --git-dir=mirror.git commit-tree -p "$HEADSHA" -m "offbranch control (test mirror only)" "$TREE")
git --git-dir=mirror.git update-ref refs/heads/scratch/offbranch-test "$OFF"
run "$T/dtr" show "$OFF" CLAUDE.md
L1=$(sed -n 1p "$T/o"); REST=$(tail -n +2 "$T/o" | git hash-object --stdin); CW=$(git --git-dir=mirror.git rev-parse "$OFF:CLAUDE.md")
[ $RC -eq 0 ] && [ "${L1#OFF-BRANCH: $OFF is not an ancestor}" != "$L1" ] && echo "$ERR" | grep -q "^OFF-BRANCH: $OFF" && [ "$REST" = "$CW" ] && ok "b: off-branch served, header on stdout line 1 AND stderr, rest = exact blob" || bad b "rc=$RC l1=${L1:0:80}"
"$T/dtr" show "$OFF" CLAUDE.md 2>/dev/null | head -1 | grep -q "^OFF-BRANCH" && ok "b: header survives 2>/dev/null" || bad b-2 x
"$T/dtr" show "$OFF" CLAUDE.md 2>&1 >/dev/null | grep -q "^OFF-BRANCH" && ok "b: header survives >/dev/null (stderr copy)" || bad b-3 x
run "$T/dtr" grep "@$OFF" resolve_review_ref comms-infra
[ $RC -eq 0 ] && [ "$(sed -n 1p "$T/o" | cut -c1-11)" = "OFF-BRANCH:" ] && ok "b: pinned grep off-branch carries the header" || bad b-grep "rc=$RC"
run "$T/dtr" ls "@$PIN"; LN=$(grep -c . "$T/o"); LW=$(git --git-dir=mirror.git ls-tree -r --name-only "$PIN" | grep -c .)
[ $RC -eq 0 ] && [ "$LN" = "$LW" ] && ok "ls @pin: $LN paths = ls-tree at the pin" || bad ls "$LN vs $LW"
# not a file
run "$T/dtr" show "$PIN" no/such/file.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: 'no/such/file.md' is not a file" && echo "$ERR" | grep -q "git said:" && ok "show of a missing path refused with git's own words" || bad nofile "rc=$RC"
# grep: no match
run "$T/dtr" grep zzqqxx_no_such_term_91
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^# 0 matches" && ok "grep 0 matches: exit 1, empty stdout, '# 0 matches' on stderr" || bad grep0 "rc=$RC"
# d: forced fetch failure
run "$T/dtr_fail" show "$PIN" "$P"; DG=$(tail -n +2 "$T/o" | git hash-object --stdin)
[ $RC -eq 0 ] && [ "$(sed -n 1p "$T/o")" = "DEGRADED: fetch failed; content is exact for $PIN (content-addressed)" ] && [ "$DG" = "$WANT" ] && ok "d: pinned read after failed fetch -> DEGRADED + exact content" || bad d "rc=$RC l1=$(sed -n 1p "$T/o")"
run "$T/dtr_fail" show CLAUDE.md
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: fetch from GitHub failed; mirror head is $(cur) from .* — no head read served" && echo "$ERR" | grep -q "^dt-review: reason: " && ok "d: head read after failed fetch refused, with git's reason" || bad d2 "rc=$RC err=${ERR:0:160}"
run "$T/dtr_fail" show 0123456789abcdef0123456789abcdef01234567 CLAUDE.md
echo "$ERR" | grep -q "last fetch FAILED (" && ok "d: not-in-mirror names 'last fetch FAILED (<reason>)'" || bad d3 "${ERR:0:160}"
# busy: hold the lock
( flock "$T/mirror.git/dt-fetch.lock" sleep 12 ) & sleep 1
run "$T/dtr_busy" show CLAUDE.md; BR=$RC; BE=$ERR
run "$T/dtr_busy" show "$PIN" "$P"; BL1=$(sed -n 1p "$T/o")
wait
[ $BR -eq 1 ] && echo "$BE" | grep -q "^REFUSED: mirror busy: the fetch lock was held for more than 3s" && ! echo "$BE" | grep -q "GitHub failed" && ok "busy: head read refused as MIRROR BUSY, not as a GitHub failure" || bad busy "rc=$BR ${BE:0:160}"
[ "${BL1#DEGRADED: fetch skipped (mirror busy}" != "$BL1" ] && ok "busy: pinned read DEGRADED 'fetch skipped'" || bad busy2 "$BL1"
# stamp is written on success, and age() names it
[ -s "$T/mirror.git/DT_REVIEW_FETCH_OK" ] && ok "success stamp written: $(cat "$T/mirror.git/DT_REVIEW_FETCH_OK")" || bad stamp none
# no FETCH_HEAD written by dt-review
rm -f "$T/mirror.git/FETCH_HEAD"; "$T/dtr" ref >/dev/null 2>&1
[ ! -e "$T/mirror.git/FETCH_HEAD" ] && ok "dt-review wrote no FETCH_HEAD" || bad fh "FETCH_HEAD exists"

echo "DTR SUMMARY: $PASSN pass, $FAILN fail"
