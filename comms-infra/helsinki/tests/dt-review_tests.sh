#!/bin/bash
# Test harness for B-CREDENTIALS-PRIVATE-REPO OBJ-4a: dt-review.
# Runs as langston in /tmp/dtr-test ONLY. Never touches /srv/dawntrader-backup.git except to
# clone FROM it (--shared: reads its objects, writes nothing there).
# Test copies differ from the file under test ONLY in REPO, REMOTE and LOCK_WAIT.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in
#   dt-review            the version under test
#   dt-review.baseline   comms-infra/helsinki/dt-review at ab68732d7 (the verbatim live copy)
#   dt-review.r1         comms-infra/helsinki/dt-review at b4db96b9c (before the fresh-reader round)
# and chown -R langston. Run: cd /home/langston && sudo -u langston HOME=/home/langston bash <this>.
# Remove /tmp/dtr-test afterwards.
# Every "CONTROL" line runs the same check against an OLDER copy and must FAIL there: a check
# that the old code also passes proves nothing about the fix.
set -u
T=/tmp/dtr-test
[ "$(id -un)" = langston ] || { echo "run as langston"; exit 9; }
mkdir -p "$T/bin"; cd "$T" || exit 9
rm -rf "$T/mirror.git"
PASSN=0; FAILN=0
ok()  { PASSN=$((PASSN+1)); echo "PASS $1"; }
bad() { FAILN=$((FAILN+1)); echo "FAIL $1 :: $2"; }
export GIT_AUTHOR_NAME=dtr-test GIT_AUTHOR_EMAIL=dtr-test@invalid GIT_COMMITTER_NAME=dtr-test GIT_COMMITTER_EMAIL=dtr-test@invalid

git clone -q --bare --shared /srv/dawntrader-backup.git mirror.git
git --git-dir=mirror.git config remote.origin.url git@github.com:kylegjordan/DawnTraderV3.git
B=migration/aws-supabase
M="git --git-dir=$T/mirror.git"
cur() { $M rev-parse refs/heads/$B; }

mk_dtr() { # name, remote, lockwait, source
  sed -e "s#^REPO=.*#REPO=$T/mirror.git#" -e "s#^REMOTE=.*#REMOTE=$2#" -e "s#^LOCK_WAIT=.*#LOCK_WAIT=$3#" "$4" > "$T/$1"
  chmod +x "$T/$1"
}
GH=git@github.com:kylegjordan/DawnTraderV3.git
mk_dtr dtr      "$GH"                 90 "$T/src/dt-review"
mk_dtr dtr_fail "$T/nonexistent.git"  90 "$T/src/dt-review"
mk_dtr dtr_busy "$GH"                  3 "$T/src/dt-review"
mk_dtr r1       "$GH"                 90 "$T/src/dt-review.r1"
mk_dtr r1_fail  "$T/nonexistent.git"  90 "$T/src/dt-review.r1"
sed -e "s#^REPO=.*#REPO=$T/mirror.git#" "$T/src/dt-review.baseline" > "$T/dtr_base"; chmod +x "$T/dtr_base"

run() { "$@" > "$T/o" 2> "$T/e"; RC=$?; OUT=$(cat "$T/o"); ERR=$(cat "$T/e"); }
# A term that cannot be in the tree: built at run time (a literal here would be committed, and found).
ABSENT="zq""xq_$(date +%s%N)_absent"

# ---------- #920 and the usage paths ----------
run "$T/dtr" grep -i resolve_review_ref
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: dt-review grep takes no flags" && ok "e: grep -i refused (exit 2, empty stdout)" || bad e "rc=$RC err=${ERR:0:120}"
run "$T/dtr_base" grep -i resolve_review_ref
[ $RC -ne 2 ] && [ -n "$OUT" ] && ok "e CONTROL: the baseline does NOT refuse (rc=$RC)" || bad e-ctl "rc=$RC"
run "$T/dtr" grep resolve_review_ref
N=$(printf '%s\n' "$OUT" | grep -c .); [ $RC -eq 0 ] && [ "$N" -ge 1 ] && echo "$ERR" | grep -q "^# grep 'resolve_review_ref' at $(cur)" && ok "e positive: unflagged grep finds $N hits, provenance on stderr" || bad e-pos "rc=$RC n=$N"
run "$T/dtr_base" grep -i comms-infra; BN=$(printf '%s\n' "$OUT" | grep -c .); BRC=$RC
run "$T/dtr" grep -i comms-infra
[ $RC -eq 2 ] && [ -z "$OUT" ] && ok "e2: grep -i comms-infra refused; the baseline gave $BN wrong lines rc=$BRC" || bad e2 "rc=$RC"
rm -f "$T/mirror.git/DT_REVIEW_FETCH_OK"
run "$T/dtr"; R1=$RC; run "$T/dtr" grep; R2=$RC; run "$T/dtr" show a b c; R3=$RC; run "$T/dtr" ls x; R4=$RC; run "$T/dtr" ref x; R5=$RC
[ "$R1$R2$R3$R4$R5" = 22222 ] && [ ! -e "$T/mirror.git/DT_REVIEW_FETCH_OK" ] && ok "e3: 5 usage errors exit 2, no fetch happened" || bad e3 "$R1$R2$R3$R4$R5"

# ---------- F-R1: an EMPTY or bare-@ pin must refuse, never fall through to a head read ----------
run "$T/dtr" show "" CLAUDE.md
[ $RC -eq 2 ] && [ -z "$OUT" ] && ok "R1: show \"\" CLAUDE.md refused (exit 2)" || bad R1 "rc=$RC"
run "$T/r1" show "" CLAUDE.md
[ $RC -eq 0 ] && [ -n "$OUT" ] && ok "R1 CONTROL: r1 served the HEAD for an empty pin (rc=0) — the hit reproduces" || bad R1-ctl "rc=$RC"
run "$T/dtr" ls @; A=$RC; run "$T/dtr" show @abc1234; Bx=$RC
[ "$A$Bx" = 22 ] && ok "R1b: 'ls @' and 'show @<sha>' (no path) are usage errors" || bad R1b "$A$Bx"

# ---------- F-R8: a multi-line pin must refuse before any fetch ----------
run "$T/dtr" show "$(printf 'abc1234\nmain')" CLAUDE.md
[ $RC -eq 2 ] && ok "R8: a multi-line pin refused (exit 2)" || bad R8 "rc=$RC"
run "$T/r1" show "$(printf 'abc1234\nmain')" CLAUDE.md
[ $RC -ne 2 ] && ok "R8 CONTROL: r1 let it through (rc=$RC)" || bad R8-ctl "rc=$RC"

# ---------- (a) pinned exact bytes ----------
PIN=$($M rev-parse "refs/heads/$B~40")
P=1-system-manual/RUNNING_ISSUES.md
WANT=$($M rev-parse "$PIN:$P"); NOW=$($M rev-parse "$(cur):$P")
run "$T/dtr" show "$PIN" "$P"; GOT=$(git hash-object --stdin < "$T/o")
[ $RC -eq 0 ] && [ "$GOT" = "$WANT" ] && [ "$WANT" != "$NOW" ] && ok "a: show $PIN $P = blob $WANT (head differs)" || bad a "rc=$RC got=$GOT want=$WANT"
echo "A_PIN=$PIN A_PATH=$P A_BLOB=$GOT"
run "$T/dtr" show "@$PIN" "$P"; [ "$(git hash-object --stdin < "$T/o")" = "$WANT" ] && ok "a: @-form gives the same blob" || bad a@ x
L5=$(sed -n 5p "$T/o"); F5=$($M cat-file blob "$PIN:$P" | sed -n 5p)
[ "$L5" = "$F5" ] && ok "a: stdout line 5 = file line 5 (no offset)" || bad a-line x
run "$T/dtr" show main CLAUDE.md
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "is not a commit id" && ok "a2: 'show main CLAUDE.md' refused" || bad a2 "rc=$RC"
run "$T/dtr" grep @main foo; [ $RC -eq 2 ] && ok "a2b: 'grep @main' refused" || bad a2b "rc=$RC"

# ---------- F-R3: a pin naming a BLOB must say so, not "not in the mirror" ----------
run "$T/dtr" show "$WANT" CLAUDE.md
[ $RC -eq 2 ] && echo "$ERR" | grep -q "names a blob, not a commit" && ok "R3: a blob id as the pin -> 'names a blob, not a commit' (exit 2)" || bad R3 "rc=$RC ${ERR:0:160}"
run "$T/r1" show "$WANT" CLAUDE.md
echo "$ERR" | grep -q "is not in the mirror" && ok "R3 CONTROL: r1 called an object it holds 'not in the mirror'" || bad R3-ctl "rc=$RC ${ERR:0:160}"

# ---------- F-R7: a hex-NAMED branch must not be served as that object ----------
HEXNAME=abcdef1
$M update-ref "refs/heads/$HEXNAME" "$PIN"
run "$T/dtr" show "$HEXNAME" "$P"
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "resolved to $PIN, which is not that object id" && ok "R7: hex-named branch '$HEXNAME' refused, not served as an object" || bad R7 "rc=$RC ${ERR:0:160}"
run "$T/r1" show "$HEXNAME" "$P"
[ $RC -eq 0 ] && ok "R7 CONTROL: r1 served branch '$HEXNAME' as if it were a commit id" || bad R7-ctl "rc=$RC ${ERR:0:120}"
$M update-ref -d "refs/heads/$HEXNAME"

# ---------- (c) a made-up sha ----------
run "$T/dtr" show 0123456789abcdef0123456789abcdef01234567 CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: 0123456789abcdef0123456789abcdef01234567 is not in the mirror (mirror head $(cur), fetched .* ago (DT_REVIEW_FETCH_OK); last fetch ok)" && ok "c: made-up sha -> the not-in-mirror text" || bad c "rc=$RC ${ERR:0:200}"

# ---------- F-R2: a commit whose TREE is missing -> exit 3, never "not a file" ----------
BROKEN=$(printf 'tree 1111111111111111111111111111111111111111\nauthor t <t@i> 1 +0000\ncommitter t <t@i> 1 +0000\n\nbroken\n' | $M hash-object -t commit --literally -w --stdin)
run "$T/dtr" show "$BROKEN" CLAUDE.md
[ $RC -eq 3 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "tree of $BROKEN is unreadable" && ok "R2: missing tree -> exit 3 'unreadable', no absence claimed" || bad R2 "rc=$RC ${ERR:0:200}"
run "$T/r1" show "$BROKEN" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "is not a file" && ok "R2 CONTROL: r1 reported the present path as 'not a file' (exit 1)" || bad R2-ctl "rc=$RC ${ERR:0:160}"

# ---------- (b) off-branch, and F-R5: off-branch + degraded is ONE header line ----------
TREE=$($M rev-parse "$(cur)^{tree}")
OFF=$($M commit-tree -p "$(cur)" -m "offbranch control (test mirror only)" "$TREE")
$M update-ref refs/heads/scratch/offbranch-test "$OFF"
run "$T/dtr" show "$OFF" CLAUDE.md
L1=$(sed -n 1p "$T/o"); REST=$(tail -n +2 "$T/o" | git hash-object --stdin); CW=$($M rev-parse "$OFF:CLAUDE.md")
[ $RC -eq 0 ] && [ "${L1#OFF-BRANCH: $OFF is not an ancestor}" != "$L1" ] && echo "$ERR" | grep -q "^OFF-BRANCH: $OFF" && [ "$REST" = "$CW" ] && ok "b: off-branch served; header on stdout line 1 AND stderr; rest = exact blob" || bad b "rc=$RC"
"$T/dtr" show "$OFF" CLAUDE.md 2>/dev/null | head -1 | grep -q "^OFF-BRANCH" && ok "b: header survives 2>/dev/null" || bad b2 x
"$T/dtr" show "$OFF" CLAUDE.md 2>&1 >/dev/null | grep -q "^OFF-BRANCH" && ok "b: header survives >/dev/null" || bad b3 x
run "$T/dtr_fail" show "$OFF" CLAUDE.md
L1=$(sed -n 1p "$T/o"); REST=$(tail -n +2 "$T/o" | git hash-object --stdin)
[ $RC -eq 0 ] && echo "$L1" | grep -q "^OFF-BRANCH: .* | DEGRADED: fetch failed" && [ "$REST" = "$CW" ] && ok "R5: off-branch + degraded = ONE stdout header line; everything after it is the exact file" || bad R5 "rc=$RC l1=${L1:0:100}"
run "$T/r1_fail" show "$OFF" CLAUDE.md
[ "$(sed -n 2p "$T/o" | cut -c1-9)" = "DEGRADED:" ] && ok "R5 CONTROL: r1 put TWO header lines on stdout" || bad R5-ctl "$(sed -n 2p "$T/o" | cut -c1-40)"

# ---------- F-R4: a grep path that matches NO file must refuse, not report "0 matches" ----------
run "$T/dtr" grep resolve_review_ref no/such/dir
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: path 'no/such/dir' matches no file" && ok "R4: a mistyped grep path -> REFUSED 'matches no file'" || bad R4 "rc=$RC ${ERR:0:160}"
run "$T/r1" grep resolve_review_ref no/such/dir
echo "$ERR" | grep -q "^# 0 matches" && ok "R4 CONTROL: r1 reported the uncovered path as '# 0 matches'" || bad R4-ctl "${ERR:0:160}"
run "$T/dtr" grep $ABSENT comms-infra
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^# 0 matches for '$ABSENT' at .* in: comms-infra" && ok "R4 positive: a real path with no match is still '# 0 matches', naming the path" || bad R4-pos "rc=$RC ${ERR:0:160}"
run "$T/dtr" grep $ABSENT
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^# 0 matches .*(whole tree)" && ok "grep 0 matches (whole tree): exit 1, empty stdout" || bad grep0 "rc=$RC"

# ---------- F-R6 / R9: exit 3 for git's own failure; patterns printed verbatim ----------
run "$T/dtr" grep 'a\{'
[ $RC -eq 3 ] && echo "$ERR" | grep -q "git grep failed" && ok "R6: an invalid BRE -> exit 3 (git failed), nothing claimed" || bad R6 "rc=$RC"
run "$T/dtr" grep 'x\cy'
echo "$ERR" | grep -qF "grep 'x\\cy' at" && ok "R9: a backslash pattern is printed verbatim (no dash echo escape)" || bad R9 "${ERR:0:120}"
run "$T/r1" grep 'x\cy'
echo "$ERR" | grep -qF "grep 'x\\cy' at" && bad R9-ctl "r1 printed it verbatim too" || ok "R9 CONTROL: r1's dash echo mangled the pattern"

# ---------- the rest of the scope's OBJ-4a outcomes ----------
run "$T/dtr" ls "@$PIN"; LN=$(grep -c . "$T/o"); LW=$($M ls-tree -r --name-only "$PIN" | grep -c .)
[ $RC -eq 0 ] && [ "$LN" = "$LW" ] && ok "ls @pin: $LN paths = ls-tree at the pin" || bad ls "$LN vs $LW"
run "$T/dtr" show "$PIN" no/such/file.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: 'no/such/file.md' is not in the tree at $PIN" && ok "show of a missing path: 'not in the tree' (exit 1)" || bad nofile "rc=$RC ${ERR:0:120}"
run "$T/dtr" show "$PIN" comms-infra
[ $RC -eq 1 ] && echo "$ERR" | grep -q "is a tree, not a file" && ok "show of a directory: 'is a tree, not a file'" || bad dir "rc=$RC ${ERR:0:120}"
run "$T/dtr_fail" show "$PIN" "$P"; DG=$(tail -n +2 "$T/o" | git hash-object --stdin)
[ $RC -eq 0 ] && [ "$(sed -n 1p "$T/o")" = "DEGRADED: fetch failed; content is exact for $PIN (content-addressed)" ] && [ "$DG" = "$WANT" ] && ok "d: pinned read after a failed fetch -> DEGRADED + exact content" || bad d "rc=$RC"
run "$T/dtr_fail" show CLAUDE.md
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: fetch from GitHub failed; mirror head is $(cur) from .* — no head read served" && echo "$ERR" | grep -q "^dt-review: reason: " && ok "d: head read after a failed fetch refused, with git's reason" || bad d2 "rc=$RC ${ERR:0:160}"
run "$T/dtr_fail" show 0123456789abcdef0123456789abcdef01234567 CLAUDE.md
echo "$ERR" | grep -q "last fetch FAILED (" && ok "d: not-in-mirror names 'last fetch FAILED (<reason>)'" || bad d3 "${ERR:0:160}"
( flock "$T/mirror.git/dt-fetch.lock" sleep 12 ) & sleep 1
run "$T/dtr_busy" show CLAUDE.md; BR=$RC; BE=$ERR
run "$T/dtr_busy" show "$PIN" "$P"; BL1=$(sed -n 1p "$T/o")
wait
[ $BR -eq 1 ] && echo "$BE" | grep -q "^REFUSED: mirror busy: the fetch lock was held for more than 3s" && ! echo "$BE" | grep -q "GitHub failed" && ok "busy: head read refused as MIRROR BUSY, not a GitHub failure" || bad busy "rc=$BR ${BE:0:160}"
[ "${BL1#DEGRADED: fetch skipped (mirror busy}" != "$BL1" ] && ok "busy: pinned read DEGRADED 'fetch skipped'" || bad busy2 "$BL1"

# ---------- F-R11: a lock that cannot be opened is a LOCAL fault, never "GitHub failed" ----------
mv "$T/mirror.git/dt-fetch.lock" "$T/lock.saved" 2>/dev/null; mkdir "$T/mirror.git/dt-fetch.lock"
run "$T/dtr" show CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: no fetch was attempted (cannot open the fetch lock" && ! echo "$ERR" | grep -q "GitHub failed" && ok "R11: an unopenable lock -> 'no fetch was attempted', not 'GitHub failed'" || bad R11 "rc=$RC ${ERR:0:160}"
run "$T/r1" show CLAUDE.md
[ $RC -ne 1 ] || echo "$ERR" | grep -q "GitHub failed" && ok "R11 CONTROL: r1 crashed or blamed GitHub (rc=$RC)" || bad R11-ctl "rc=$RC ${ERR:0:120}"
rmdir "$T/mirror.git/dt-fetch.lock"; mv "$T/lock.saved" "$T/mirror.git/dt-fetch.lock" 2>/dev/null

# ---------- F-R12: an unreadable stamp is named, never reported as "no stamp" ----------
echo garbage > "$T/mirror.git/DT_REVIEW_FETCH_OK"
run "$T/dtr_fail" show CLAUDE.md
echo "$ERR" | grep -q "stamp unreadable: DT_REVIEW_FETCH_OK" && ok "R12: a garbage stamp is reported as 'stamp unreadable'" || bad R12 "${ERR:0:200}"

# ---------- stamp + FETCH_HEAD ----------
"$T/dtr" ref > "$T/o" 2>&1
[ "$(awk '{print NF}' "$T/mirror.git/DT_REVIEW_FETCH_OK")" = 2 ] && ok "success stamp rewritten after a good fetch: $(cat "$T/mirror.git/DT_REVIEW_FETCH_OK")" || bad stamp "$(cat "$T/mirror.git/DT_REVIEW_FETCH_OK")"
rm -f "$T/mirror.git/FETCH_HEAD"; "$T/dtr" ref >/dev/null 2>&1
[ ! -e "$T/mirror.git/FETCH_HEAD" ] && ok "dt-review wrote no FETCH_HEAD" || bad fh x

echo "DTR SUMMARY: $PASSN pass, $FAILN fail"
