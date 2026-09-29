#!/bin/bash
# Test harness for B-CREDENTIALS-PRIVATE-REPO OBJ-4a: dt-review.
# Runs as langston in /tmp/dtr-test ONLY. Never touches /srv/dawntrader-backup.git except to
# clone FROM it (--shared: reads its objects, writes nothing there).
# Test copies differ from the file under test ONLY in REPO, REMOTE and LOCK_WAIT.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in
#   dt-review            the version under test
#   dt-review.baseline   comms-infra/helsinki/dt-review at ab68732d7 (the verbatim live copy)
#   dt-review.r1         comms-infra/helsinki/dt-review at b4db96b9c (before fresh-reader round 1)
#   dt-review.r2         comms-infra/helsinki/dt-review at b9ca76485 (before fresh-reader round 2)
#   dt-review.r3         comms-infra/helsinki/dt-review at 764ec389b (before fresh-reader round 3)
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
mk_dtr r2       "$GH"                 90 "$T/src/dt-review.r2"
mk_dtr r3       "$GH"                 90 "$T/src/dt-review.r3"
mk_dtr r3_fail  "$T/nonexistent.git"  90 "$T/src/dt-review.r3"
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
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: 0123456789abcdef0123456789abcdef01234567 is not in the mirror (migration/aws-supabase head $(cur), fetched .* ago (DT_REVIEW_FETCH_OK); last fetch ok; other branches last synced " && ok "c: made-up sha -> the not-in-mirror text" || bad c "rc=$RC ${ERR:0:200}"

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

# ---------- F-R6 (amended in round 3, F3-7) / R9: an invalid BRE is the CALLER's error; patterns printed verbatim ----------
run "$T/dtr" grep 'a\{'
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -qF "REFUSED: the pattern is not a valid BRE ('a\\{': Unmatched" && ok "R6/F3-7: an invalid BRE -> exit 2 (the caller's pattern), git's reason quoted" || bad R6 "rc=$RC ${ERR:0:160}"
run "$T/r3" grep 'a\{'
[ $RC -eq 3 ] && ok "F3-7 CONTROL: r3 called a pattern typo 'the mirror or git failed' (exit 3)" || bad F3-7c "rc=$RC"
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
DL1=$(sed -n 1p "$T/o")
case "$DL1" in "DEGRADED: fetch failed (fatal: "*"); content is exact (re-hashed) for $PIN") DOK=1 ;; *) DOK= ;; esac
[ $RC -eq 0 ] && [ -n "$DOK" ] && [ "$DG" = "$WANT" ] && ok "d: pinned read after a failed fetch -> DEGRADED naming git's reason + exact content" || bad d "rc=$RC l1=${DL1:0:160}"
run "$T/dtr_fail" show CLAUDE.md
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: fetch failed; mirror head is $(cur), fetched .* — no head read served" && echo "$ERR" | grep -q "^dt-review: reason: " && ok "d: head read after a failed fetch refused, with git's reason" || bad d2 "rc=$RC ${ERR:0:160}"
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


# ================= round 2 (fresh-reader round 2 on b9ca76485); CONTROLS run the r2 copy =================
# F2-1: an unparseable commit that IS in the mirror must never be "not in the mirror".
BADC=$(printf 'this is not a commit\n' | $M hash-object -t commit --literally -w --stdin)
run "$T/dtr" show "$BADC" CLAUDE.md
[ $RC -eq 3 ] && ! echo "$ERR" | grep -q "not in the mirror" && ok "F2-1: an unparseable commit -> exit 3, never 'not in the mirror'" || bad F2-1 "rc=$RC ${ERR:0:160}"
run "$T/r2" show "$BADC" CLAUDE.md
echo "$ERR" | grep -q "is not in the mirror" && ok "F2-1 CONTROL: r2 called it 'not in the mirror'" || bad F2-1c "rc=$RC ${ERR:0:160}"
# F2-2: a searched file whose blob is MISSING must make grep refuse, not report "0 matches".
MB=$(printf 'never stored %s' "$(date +%s%N)" | $M hash-object --stdin)
MT=$(printf '100644 blob %s\tonly.txt\n' "$MB" | $M mktree --missing)
MC=$($M commit-tree -p "$(cur)" -m "missing blob" "$MT")
run "$T/dtr" grep "@$MC" anything only.txt
[ $RC -eq 3 ] && [ -z "$OUT" ] && ok "F2-2: grep over a missing blob -> exit 3, no result claimed" || bad F2-2 "rc=$RC ${ERR:0:160}"
run "$T/r2" grep "@$MC" anything only.txt
echo "$ERR" | grep -q "# 0 matches" && ok "F2-2 CONTROL: r2 reported '# 0 matches' over a file it could not read" || bad F2-2c "rc=$RC ${ERR:0:160}"
# F2-3: a FORGED blob (bytes that do not hash to its name) must never be served.
X=$(printf 'forged-%s' "$(date +%s%N)" | sha1sum | cut -c1-40)
python3 - "$T/mirror.git/objects" "$X" <<'PY'
import os, sys, zlib
objdir, oid = sys.argv[1:3]
data = b"a forged line\n"
d = os.path.join(objdir, oid[:2]); os.makedirs(d, exist_ok=True)
open(os.path.join(d, oid[2:]), "wb").write(zlib.compress(b"blob %d\0" % len(data) + data))
PY
FT=$(printf '100644 blob %s\tforged.txt\n' "$X" | $M mktree)
FC=$($M commit-tree -p "$(cur)" -m "forged blob" "$FT")
run "$T/dtr" show "$FC" forged.txt
[ $RC -eq 3 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "re-hashes to" && ok "F2-3: a forged blob is caught by the re-hash; nothing served" || bad F2-3 "rc=$RC ${ERR:0:160}"
run "$T/r2" show "$FC" forged.txt
[ $RC -eq 0 ] && echo "$OUT" | grep -q "a forged line" && ok "F2-3 CONTROL: r2 served the forged bytes as exact" || bad F2-3c "rc=$RC"
# F2-5: one mistyped path among good ones; a pin written after the pattern.
run "$T/dtr" grep resolve_review_ref comms-infra no/such/dir
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "path 'no/such/dir' matches no file" && ok "F2-5: one bad path among good ones -> REFUSED before searching" || bad F2-5 "rc=$RC ${ERR:0:160}"
run "$T/r2" grep resolve_review_ref comms-infra no/such/dir
[ $RC -eq 0 ] && ok "F2-5 CONTROL: r2 searched, skipped the bad path silently (rc=0)" || bad F2-5c "rc=$RC"
run "$T/dtr" grep resolve_review_ref comms-infra "@$PIN"
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "a pin goes BEFORE the pattern" && ok "F2-5b: a pin written after the pattern -> refused (exit 2)" || bad F2-5b "rc=$RC ${ERR:0:160}"
# F2-6: path forms are refused before the fetch, never reported as missing or broken.
run "$T/dtr" show ./CLAUDE.md; A=$RC; run "$T/dtr" show comms-infra/; Bb=$RC; run "$T/dtr" show /CLAUDE.md; Cc=$RC; run "$T/dtr" grep x ''; Dd=$RC
[ "$A$Bb$Cc$Dd" = 2222 ] && ok "F2-6: './x', 'dir/', '/x' and an empty grep path -> exit 2" || bad F2-6 "$A$Bb$Cc$Dd"
run "$T/r2" show ./CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "is not in the tree" && ok "F2-6 CONTROL: r2 said './CLAUDE.md' is not in the tree" || bad F2-6c "rc=$RC ${ERR:0:120}"
# F2-11: a config setting must not change the pattern type.
$M config grep.patternType extended
run "$T/dtr" grep 'resolve_review_ref\|zq_never_absent' comms-infra; NA=$RC
run "$T/r2" grep 'resolve_review_ref\|zq_never_absent' comms-infra; NB=$RC
$M config --unset grep.patternType
[ $NA -eq 0 ] && ok "F2-11: BRE alternation still works with grep.patternType=extended set" || bad F2-11 "rc=$NA"
[ $NB -eq 1 ] && ok "F2-11 CONTROL: r2 silently switched to ERE and found nothing" || bad F2-11c "rc=$NB"
# show re-hash, positive: a normal pinned read still serves the exact blob.
run "$T/dtr" show "$PIN" "$P"; [ $RC -eq 0 ] && [ "$(git hash-object --stdin < "$T/o")" = "$WANT" ] && ok "F2-3 positive: a clean pinned read still serves the exact blob" || bad F2-3p "rc=$RC"

# ================= round 3 (fresh-reader round 3 on 764ec389b); CONTROLS run the r3 copy =================
# F3-1: an empty middle segment is the caller's spelling, refused before the fetch.
rm -f "$T/mirror.git/DT_REVIEW_FETCH_OK"
run "$T/dtr" show comms-infra//discord/deploy.sh
[ $RC -eq 2 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "has an empty segment" && [ ! -e "$T/mirror.git/DT_REVIEW_FETCH_OK" ] && ok "F3-1: 'a//b' -> exit 2 before any fetch" || bad F3-1 "rc=$RC ${ERR:0:160}"
run "$T/r3" show comms-infra//discord/deploy.sh
[ $RC -eq 3 ] && ok "F3-1 CONTROL: r3 fetched, then called the spelling 'the mirror or git failed' (exit 3)" || bad F3-1c "rc=$RC ${ERR:0:120}"

# A test commit with awkward names: an empty file, names needing C-quoting, a ':' component.
EB=$(: | $M hash-object -w --stdin)
HB=$(printf 'hello from a test file\n' | $M hash-object -w --stdin)
SUB=$(printf '100644 blob %s\t:colon.txt\0' "$HB" | $M mktree -z)
# One printf per entry: in a printf FORMAT, "\0100644" is the octal escape \0100 ('@'), not NUL.
QT=$( { printf '100644 blob %s\t%s\0' "$EB" empty.txt; printf '100644 blob %s\t%s\0' "$HB" 'q"uote.txt'
        printf '100644 blob %s\t%s\0' "$HB" 'back\slash.txt'; printf '040000 tree %s\t%s\0' "$SUB" d
        printf '100644 blob %s\t%s\0' "$($M rev-parse "$(cur):CLAUDE.md")" CLAUDE.md; } | $M mktree -z)
[ "$($M ls-tree --name-only -z "$QT" | tr '\0' '\n' | grep -c .)" -eq 5 ] && ok "F3 harness: the awkward-names tree has its 5 entries" || bad F3-pre "$($M ls-tree "$QT")"
QC=$($M commit-tree -p "$(cur)" -m "round-3 awkward names (test mirror only)" "$QT")

# F3-2a: a magic pathspec that matches nothing must refuse, not report a measured zero.
run "$T/dtr" grep "@$QC" hello ':(glob)nosuch/**'
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: path ':(glob)nosuch/\*\*' matches no file" && ok "F3-2a: a magic pathspec matching nothing -> REFUSED" || bad F3-2a "rc=$RC ${ERR:0:160}"
run "$T/r3" grep "@$QC" hello ':(glob)nosuch/**'
echo "$ERR" | grep -q "^# 0 matches" && ok "F3-2a CONTROL: r3 reported '# 0 matches' over an empty population" || bad F3-2ac "rc=$RC ${ERR:0:160}"
# F3-2b: a glob whose only match is an EMPTY file is a real, measured zero.
run "$T/dtr" grep "@$QC" hello 'empt*.txt'
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^# 0 matches for 'hello' at $QC" && ok "F3-2b: a glob matching only an empty file -> '# 0 matches' (a measured zero)" || bad F3-2b "rc=$RC ${ERR:0:160}"
run "$T/r3" grep "@$QC" hello 'empt*.txt'
echo "$ERR" | grep -q "matches no file" && ok "F3-2b CONTROL: r3 said the path matches no file while empty.txt exists" || bad F3-2bc "rc=$RC ${ERR:0:160}"
# F3-2c: a negative magic pathspec is proven, and still searches.
run "$T/dtr" grep "@$QC" 'hello from a test' ':!CLAUDE.md'
[ $RC -eq 0 ] && [ "$(tail -n +2 "$T/o" | grep -c .)" -eq 3 ] && ok "F3-2c: ':!CLAUDE.md' is proven and searched (3 hits below the OFF-BRANCH line)" || bad F3-2c "rc=$RC out=${OUT:0:160}"

# F3-3: names that ls-tree C-quotes, and a ':' component below the root.
for NM in 'q"uote.txt' 'back\slash.txt' 'd/:colon.txt'; do
  run "$T/dtr" show "$QC" "$NM"
  L1=$(sed -n 1p "$T/o"); REST=$(tail -n +2 "$T/o" | git hash-object --stdin)
  [ $RC -eq 0 ] && [ "${L1#OFF-BRANCH:}" != "$L1" ] && [ "$REST" = "$HB" ] && ok "F3-3: show '$NM' -> the exact blob" || bad F3-3 "'$NM' rc=$RC ${ERR:0:160}"
  run "$T/r3" show "$QC" "$NM"
  [ $RC -eq 1 ] && echo "$ERR" | grep -q "is not in the tree" && ok "F3-3 CONTROL: r3 said '$NM' is not in the tree" || bad F3-3c "'$NM' rc=$RC ${ERR:0:120}"
done

# F3-4: a correctly stored commit with an fsck oddity (bad timezone) is served, not called tampered.
TZC=$(printf 'tree %s\nauthor t <t@i> 1 +0000\ncommitter t <t@i> 1 -12345\n\nbad timezone\n' "$($M rev-parse "$(cur)^{tree}")" | $M hash-object -t commit --literally -w --stdin)
run "$T/dtr" show "$TZC" CLAUDE.md
REST=$(tail -n +2 "$T/o" | git hash-object --stdin)
[ $RC -eq 0 ] && [ "$REST" = "$($M rev-parse "$(cur):CLAUDE.md")" ] && ok "F3-4: a stored commit with a bad timezone re-hashes and serves the exact blob" || bad F3-4 "rc=$RC ${ERR:0:200}"
run "$T/r3" show "$TZC" CLAUDE.md
[ $RC -eq 3 ] && echo "$ERR" | grep -q "re-hashes to" && ok "F3-4 CONTROL: r3 called a well-stored commit 'NOT the committed content'" || bad F3-4c "rc=$RC ${ERR:0:160}"

# F3-6: under DEGRADED, grep and ls do not claim exactness; the failed variant names its reason.
run "$T/dtr_fail" grep "@$PIN" resolve_review_ref comms-infra
L1=$(sed -n 1p "$T/o")
case "$L1" in "DEGRADED: fetch failed (fatal: "*"); content is as stored (not re-hashed) for $PIN") G6=1 ;; *) G6= ;; esac
[ $RC -eq 0 ] && [ -n "$G6" ] && ok "F3-6: a degraded grep says 'as stored (not re-hashed)' and names git's reason" || bad F3-6 "rc=$RC l1=${L1:0:160}"
run "$T/r3_fail" grep "@$PIN" resolve_review_ref comms-infra
sed -n 1p "$T/o" | grep -q "content is exact" && ok "F3-6 CONTROL: r3 claimed 'content is exact' for an unverified grep" || bad F3-6c "$(sed -n 1p "$T/o" | cut -c1-120)"

# F3-8: a stamp with a leading zero is unreadable, never octal arithmetic.
printf '0999 x\n' > "$T/mirror.git/DT_REVIEW_FETCH_OK"; rm -f "$T/mirror.git/DT_SYNC_PASS"
run "$T/dtr_fail" show CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "stamp unreadable: DT_REVIEW_FETCH_OK" && ok "F3-8: stamp '0999' -> 'stamp unreadable', exit 1" || bad F3-8 "rc=$RC ${ERR:0:200}"
run "$T/r3_fail" show CLAUDE.md
echo "$ERR" | grep -q "Illegal number: 0999" && echo "$ERR" | grep -q "from  —" && ok "F3-8 CONTROL: r3 did octal arithmetic on the stamp and printed an empty age (rc=$RC)" || bad F3-8c "rc=$RC ${ERR:0:160}"
"$T/dtr" ref > "$T/o" 2>&1   # a good fetch rewrites the stamp

# F3-9: a SHORT pin whose prefix only a blob shares is "no such commit", with the freshness data.
SP=$(printf '%s' "$WANT" | cut -c1-12)
run "$T/dtr" show "$SP" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: no commit with prefix $SP is in the mirror (a blob shares the prefix) (migration/aws-supabase head " && ok "F3-9: a short pin shared only by a blob -> exit 1 with freshness" || bad F3-9 "rc=$RC ${ERR:0:200}"
run "$T/r3" show "$SP" CLAUDE.md
[ $RC -eq 2 ] && echo "$ERR" | grep -q "names a blob" && ok "F3-9 CONTROL: r3 told the caller it was their error (exit 2)" || bad F3-9c "rc=$RC ${ERR:0:160}"
# F3-9b: a tag whose target is missing is a broken mirror (exit 3), not a caller error.
BT=$(printf 'object 2222222222222222222222222222222222222222\ntype commit\ntag broken\ntagger t <t@i> 1 +0000\n\nx\n' | $M hash-object -t tag --literally -w --stdin)
run "$T/dtr" show "$BT" CLAUDE.md
[ $RC -eq 3 ] && ok "F3-9b: a tag with a missing target -> exit 3" || bad F3-9b "rc=$RC ${ERR:0:160}"
run "$T/r3" show "$BT" CLAUDE.md
[ $RC -eq 2 ] && ok "F3-9b CONTROL: r3 called it the caller's error (exit 2)" || bad F3-9bc "rc=$RC ${ERR:0:120}"

echo "DTR SUMMARY: $PASSN pass, $FAILN fail"
