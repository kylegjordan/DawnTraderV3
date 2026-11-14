#!/bin/bash
# Test harness for B-CREDENTIALS-PRIVATE-REPO OBJ-4a: dt-review.
# Runs as langston in /tmp/dtr-test ONLY. Never touches /srv/dawntrader-backup.git except to
# clone FROM it (--shared: reads its objects, writes nothing there).
# Test copies differ from the file under test ONLY in REPO, REMOTE, LOCK_WAIT and (the pin-fetch
# copies, mk_pin) PIN_FETCH_TIMEOUT.
# SETUP (as root on Helsinki): mkdir -p /tmp/dtr-test/src, then copy in
#   dt-review            the version under test
#   dt-review.baseline   comms-infra/helsinki/dt-review at ab68732d7 (the verbatim live copy)
#   dt-review.r1         comms-infra/helsinki/dt-review at b4db96b9c (before fresh-reader round 1)
#   dt-review.r2         comms-infra/helsinki/dt-review at b9ca76485 (before fresh-reader round 2)
#   dt-review.r3         comms-infra/helsinki/dt-review at 764ec389b (before fresh-reader round 3)
#   dt-review.r4         comms-infra/helsinki/dt-review at 2767d358a (what Langston approved with conditions at gate 4a-1)
#   dt-review.r5         comms-infra/helsinki/dt-review at 3b7b46f59 (gate 4a-1 conditions folded; before gate 4a-2 condition 2)
#   dt-review.r6         comms-infra/helsinki/dt-review at 445b6a505 (the copy installed 2026-09-29, before B-DTREVIEW-ABSENCE-PROVENANCE)
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
mk_dtr r4       "$GH"                 90 "$T/src/dt-review.r4"
mk_dtr r5       "$GH"                 90 "$T/src/dt-review.r5"
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
# B-DTREVIEW-ABSENCE-PROVENANCE: a FULL made-up id is now asked of the REAL origin first. GitHub's
# own refusal is the positive control that the "did not serve" class matches its spelling.
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: origin did not serve commit id 0123456789abcdef0123456789abcdef01234567 (git: fatal: remote error: upload-pack: not our ref 0123456789abcdef0123456789abcdef01234567); the mirror does not hold it either (migration/aws-supabase head $(cur), fetched .* ago (DT_REVIEW_FETCH_OK); last fetch ok; other branches last synced " && ! echo "$ERR" | grep -qi "does not have" && ok "c: made-up full id -> origin (GitHub) did not serve it, git's own line quoted" || bad c "rc=$RC ${ERR:0:260}"

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
echo "$L1" | grep -q "^OFF-BRANCH: $OFF is not an ancestor of $B; it is on mirror branch scratch/offbranch-test — " && ok "b: the header names the mirror branch that holds it (#1181 condition 2)" || bad b-where "l1=${L1:0:200}"
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
echo "$ERR" | grep -q "^REFUSED: 0123456789abcdef0123456789abcdef01234567 is not in the mirror, and no origin check was made: the branch fetch was FAILED (" && ! echo "$ERR" | grep -q "origin did not serve" && ok "d: branch fetch failed -> 'no origin check was made', never origin's refusal (#1181)" || bad d4 "${ERR:0:200}"
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
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: no commit with prefix $SP is in the mirror (a blob shares the prefix); no origin check was made: a short id cannot be fetched by id — give the full 40-character id (migration/aws-supabase head " && ok "F3-9: a short pin shared only by a blob -> exit 1 with freshness, and says no origin check was made (#1181 R1)" || bad F3-9 "rc=$RC ${ERR:0:200}"
run "$T/r3" show "$SP" CLAUDE.md
[ $RC -eq 2 ] && echo "$ERR" | grep -q "names a blob" && ok "F3-9 CONTROL: r3 told the caller it was their error (exit 2)" || bad F3-9c "rc=$RC ${ERR:0:160}"
# F3-9b: a tag whose target is missing is a broken mirror (exit 3), not a caller error.
BT=$(printf 'object 2222222222222222222222222222222222222222\ntype commit\ntag broken\ntagger t <t@i> 1 +0000\n\nx\n' | $M hash-object -t tag --literally -w --stdin)
run "$T/dtr" show "$BT" CLAUDE.md
[ $RC -eq 3 ] && ok "F3-9b: a tag with a missing target -> exit 3" || bad F3-9b "rc=$RC ${ERR:0:160}"
run "$T/r3" show "$BT" CLAUDE.md
[ $RC -eq 2 ] && ok "F3-9b CONTROL: r3 called it the caller's error (exit 2)" || bad F3-9bc "rc=$RC ${ERR:0:120}"

# ================= Langston's gate 4a-1 conditions (APPROVED WITH CONDITIONS on 2767d358a); CONTROLS run r4 =================
# G1-C1: EVERY read states its integrity basis — on-branch and fetch-ok too, not only under a loud header.
run "$T/dtr" grep resolve_review_ref comms-infra
[ $RC -eq 0 ] && echo "$ERR" | grep -q "^# grep 'resolve_review_ref' at $(cur) — on migration/aws-supabase; content is as stored (not re-hashed) (" && ok "G1-C1: an on-branch, fetch-ok grep says 'as stored (not re-hashed)'" || bad G1-C1 "rc=$RC ${ERR:0:200}"
run "$T/r4" grep resolve_review_ref comms-infra
[ $RC -eq 0 ] && ! echo "$ERR" | grep -q "not re-hashed" && ok "G1-C1 CONTROL: r4 said nothing about integrity on the same read (its stderr; stdout is search hits, which include this test's own line)" || bad G1-C1c "rc=$RC"
run "$T/dtr" ls "@$PIN"
echo "$ERR" | grep -q "content is as stored (not re-hashed)" && ok "G1-C1: ls says it too" || bad G1-C1l "${ERR:0:160}"
run "$T/dtr" show "$PIN" "$P"
[ $RC -eq 0 ] && echo "$ERR" | grep -q "; content is exact (re-hashed) (" && ok "G1-C1: show says 'exact (re-hashed)'" || bad G1-C1s "${ERR:0:200}"
# G1-C2: a blob pin (full or short) prints no raw git "error:" ahead of dt-review's own refusal.
run "$T/dtr" show "$WANT" CLAUDE.md; A=$ERR; ARC=$RC
run "$T/dtr" show "$SP" CLAUDE.md; Bq=$ERR; BRC=$RC
! printf '%s\n%s\n' "$A" "$Bq" | grep -q "^error:" && [ $ARC -eq 2 ] && [ $BRC -eq 1 ] && ok "G1-C2: blob pins refuse (2 / 1) with no unattributed git 'error:' line" || bad G1-C2 "rc=$ARC/$BRC ${A:0:120} | ${Bq:0:120}"
run "$T/r4" show "$WANT" CLAUDE.md
echo "$ERR" | head -1 | grep -q "^error:" && ok "G1-C2 CONTROL: r4 printed git's raw 'error:' first" || bad G1-C2c "${ERR:0:160}"
# G1-C3: the branch-name refusal gives the true reason (a name can move), not a mutable invariant.
run "$T/dtr" show main CLAUDE.md
[ $RC -eq 2 ] && echo "$ERR" | grep -q "a name can move and a pin cannot" && ! echo "$ERR" | grep -q "every ref in the mirror" && ok "G1-C3: the refusal states why (a name can move)" || bad G1-C3 "rc=$RC ${ERR:0:200}"

# ================= Langston's gate 4a-2 condition 2, applied to the reader; CONTROL runs r5 (3b7b46f59) =================
# G2-R: --git-dir does not stop an exported GIT_OBJECT_DIRECTORY from redirecting reads. A commit
# in the test mirror names a blob the mirror does NOT hold; a decoy object dir reaches a side
# store that does. The reader must read the MIRROR (exit 3), not the decoy.
rm -rf "$T/side.git" "$T/decoy-objects"; git init -q --bare "$T/side.git"
SB=$(printf 'only in a side store %s\n' "$(date +%s%N)" | git --git-dir="$T/side.git" hash-object -w --stdin)
ST=$(printf '100644 blob %s\tside.txt\n' "$SB" | $M mktree --missing)
SC=$($M commit-tree -p "$(cur)" -m "names a blob only a side store holds (test mirror only)" "$ST")
mkdir -p "$T/decoy-objects/info"; printf '%s\n%s\n' "$T/mirror.git/objects" "$T/side.git/objects" > "$T/decoy-objects/info/alternates"
GIT_OBJECT_DIRECTORY="$T/decoy-objects" run "$T/dtr" show "$SC" side.txt; NRC=$RC; NOUT=$OUT
GIT_OBJECT_DIRECTORY="$T/decoy-objects" run "$T/r5" show "$SC" side.txt; RRC=$RC; ROUT=$OUT
[ $NRC -eq 3 ] && [ -z "$NOUT" ] && ok "G2-R: with GIT_OBJECT_DIRECTORY exported, the reader still reads the mirror (exit 3, nothing served)" || bad G2-R "rc=$NRC out=${NOUT:0:80}"
[ $RRC -eq 0 ] && echo "$ROUT" | grep -q "only in a side store" && ok "G2-R CONTROL: r5 served a blob from a store that is NOT the mirror" || bad G2-Rc "rc=$RRC out=${ROUT:0:120}"
rm -rf "$T/side.git" "$T/decoy-objects"

# ==========================================================================================
# B-DTREVIEW-ABSENCE-PROVENANCE (#1181): a missed FULL-id pin is asked of origin by id.
# Langston condition 3: these run on a SYNTHETIC origin ($PO) and a test mirror ($PM) that share NO
# object store with anything (--no-local --single-branch clone, no alternates), so a "kept by gc" or
# "served" result cannot come from an alternate. Every case states its before-call absence first.
# Each CONTROL runs the copy installed 2026-09-29 (r6, 445b6a505) on the same input.
# ==========================================================================================
PO=$T/po.git; PM=$T/pm.git; PW=$T/pw
rm -rf "$PO" "$PM" "$PW"
git init -q --bare "$PO"; git init -q -b "$B" "$PW"
( cd "$PW" && echo base > CLAUDE.md && git add CLAUDE.md && git commit -qm base && git push -q "$PO" "HEAD:refs/heads/$B" \
  && git checkout -qb side && echo side > CLAUDE.md && git commit -qam side && git push -q "$PO" side \
  && git tag sidetag && git push -q "$PO" sidetag \
  && git checkout -qb gone && echo gone > CLAUDE.md && git commit -qam gone && git push -q "$PO" gone && git push -q "$PO" :refs/heads/gone ) \
  || bad pin-setup "could not build the synthetic origin"
S=$(git -C "$PW" rev-parse side); X=$(git -C "$PW" rev-parse gone); BLOB=$(git -C "$PW" rev-parse "$B:CLAUDE.md")
PM_="git --git-dir=$PM"
mkpm() {   # a fresh test mirror holding ONLY the review branch, configured like the real one
  rm -rf "$PM"
  git clone -q --bare --no-local --single-branch --branch "$B" "file://$PO" "$PM" || bad pin-mkpm "clone failed"
  $PM_ config --unset-all remote.origin.fetch; $PM_ config core.logAllRefUpdates always
}
absent() { $PM_ cat-file -e "$1" 2>"$T/ce"; [ $? -ne 0 ]; }   # stderr KEPT in a file, not discarded
mk_pin() { # name remote pintimeout source
  sed -e "s#^REPO=.*#REPO=$PM#" -e "s#^REMOTE=.*#REMOTE=$2#" -e "s#^LOCK_WAIT=.*#LOCK_WAIT=90#" -e "s#^PIN_FETCH_TIMEOUT=.*#PIN_FETCH_TIMEOUT=$3#" "$4" > "$T/$1"
  chmod +x "$T/$1"
}
mk_pin dtp      "file://$PO"                60    "$T/src/dt-review"
mk_pin dtp_fail "file://$T/nonexistent.git" 60    "$T/src/dt-review"
mk_pin dtp_to   "file://$PO"                0.001 "$T/src/dt-review"
mk_pin r6p      "file://$PO"                60    "$T/src/dt-review.r6"
nrefs() { $PM_ for-each-ref | wc -l; }

# T1 — the #1181 case run FORWARD: a side-branch commit the mirror has not synced is SERVED.
mkpm; absent "$S" && ok "T1 pre: $S is absent from the test mirror before the call" || bad T1-pre "present"
N0=$(nrefs); t0=$(date +%s%N)
run "$T/dtp" show "$S" CLAUDE.md; t1=$(date +%s%N)
L1=$(sed -n 1p "$T/o"); REST=$(tail -n +2 "$T/o")
[ $RC -eq 0 ] && [ "$REST" = side ] && echo "$L1" | grep -q "^OFF-BRANCH: $S is not an ancestor of $B; it is on NO branch the mirror holds (all-branch sync " && ok "T1: served after asking origin, header says ON NO BRANCH the mirror holds" || bad T1 "rc=$RC l1=${L1:0:200} err=${ERR:0:200}"
[ "$($PM_ rev-parse --verify --quiet refs/dt-review/pins/$S)" = "$S" ] && ok "T1: anchored at refs/dt-review/pins/$S" || bad T1-ref x
# Langston C-2: exactly ONE new ref (the pin), and NO tag, although origin has a tag on $S.
[ "$(nrefs)" -eq $((N0 + 1)) ] && [ "$($PM_ for-each-ref refs/tags | wc -l)" -eq 0 ] && ok "T1/C-2: exactly one new ref, zero tags (origin has sidetag on $S)" || bad T1-tags "refs $N0 -> $(nrefs); tags: $($PM_ for-each-ref refs/tags)"
echo "T9 timing: T1 pin read took $(( (t1 - t0) / 1000000 )) ms (synthetic local origin)"
mkpm; run "$T/r6p" show "$S" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: $S is not in the mirror (" && ok "T1 CONTROL: r6 refuses the same commit as 'not in the mirror'" || bad T1-ctl "rc=$RC ${ERR:0:160}"
mkpm; $PM_ fetch -q "file://$PO" "$S:refs/x/control" 2>"$T/fe"
[ "$($PM_ for-each-ref refs/tags | wc -l)" -ge 1 ] && ok "T1/C-2 CONTROL: the same by-id fetch WITHOUT --no-tags writes the tag" || bad T1-tagctl "tags=$($PM_ for-each-ref refs/tags | wc -l) $(cat "$T/fe")"

# T2 — a commit whose branch was DELETED at origin (force-pushed away) is served, and says so.
mkpm; absent "$X" && ok "T2 pre: $X absent" || bad T2-pre present
run "$T/dtp" show "$X" CLAUDE.md; L1=$(sed -n 1p "$T/o")
[ $RC -eq 0 ] && echo "$L1" | grep -q "^OFF-BRANCH: $X is not an ancestor of $B; it is on NO branch the mirror holds (all-branch sync .*): pushed since that sync, or force-pushed away; the mirror cannot tell which — " && ok "T2: deleted-branch commit served with the ON NO BRANCH header" || bad T2 "rc=$RC l1=${L1:0:220}"
run "$T/dtp" show "$S" CLAUDE.md
$PM_ update-ref refs/heads/side2 "$S"
run "$T/dtp" show "$S" CLAUDE.md; L1=$(sed -n 1p "$T/o")
[ $RC -eq 0 ] && echo "$L1" | grep -q "^OFF-BRANCH: $S is not an ancestor of $B; it is on mirror branch side2 — " && ok "T2: a commit on a mirror branch names that branch" || bad T2-on "rc=$RC l1=${L1:0:200}"
$PM_ update-ref refs/heads/side3 "$S"
run "$T/dtp" show "$S" CLAUDE.md; L1=$(sed -n 1p "$T/o")
[ $RC -eq 0 ] && echo "$L1" | grep -q "^OFF-BRANCH: $S is not an ancestor of $B; it is on 2 mirror branches: side2 side3 — " && ok "T2: a commit on two mirror branches is counted and both are named (Step-4 condition 2)" || bad T2-two "rc=$RC l1=${L1:0:200}"
for n in 4 5 6 7 8; do $PM_ update-ref "refs/heads/side$n" "$S"; done
run "$T/dtp" show "$S" CLAUDE.md; L1=$(sed -n 1p "$T/o")
[ $RC -eq 0 ] && echo "$L1" | grep -q "^OFF-BRANCH: $S is not an ancestor of $B; it is on 7 mirror branches, including side2 side3 side4 side5 side6 — " && ok "T2: past five holders, the count and the first five" || bad T2-many "rc=$RC l1=${L1:0:220}"

# T3 — a made-up FULL id: origin did not serve it. Never "does not have".
F=0123456789abcdef0123456789abcdef01234567
mkpm; absent "$F" && ok "T3 pre: $F absent" || bad T3-pre present
run "$T/dtp" show "$F" CLAUDE.md
[ $RC -eq 1 ] && [ -z "$OUT" ] && echo "$ERR" | grep -q "^REFUSED: origin did not serve commit id $F (git: .*not our ref $F); the mirror does not hold it either (" && ! echo "$ERR" | grep -qi "does not have" && ok "T3: made-up full id -> origin did not serve it, git's line quoted" || bad T3 "rc=$RC ${ERR:0:220}"
[ -z "$($PM_ for-each-ref refs/dt-review)" ] && ok "T3: no pin ref written" || bad T3-ref "$($PM_ for-each-ref refs/dt-review)"
run "$T/r6p" show "$F" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: $F is not in the mirror (" && ok "T3 CONTROL: r6 says 'not in the mirror', no origin check" || bad T3-ctl "rc=$RC ${ERR:0:160}"

# T4 — a SHORT id of a commit the mirror lacks: no fetch, and the refusal says why.
SS=$(printf '%s' "$S" | cut -c1-12)
mkpm; absent "$S" && ok "T4 pre: $S absent" || bad T4-pre present
run "$T/dtp" show "$SS" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: no commit with prefix $SS is in the mirror; no origin check was made: a short id cannot be fetched by id — give the full 40-character id (" && ok "T4: short id -> no origin check, asks for the full id" || bad T4 "rc=$RC ${ERR:0:220}"
[ -z "$($PM_ for-each-ref refs/dt-review)" ] && absent "$S" && ok "T4: nothing fetched, no pin ref" || bad T4-ref x
run "$T/r6p" show "$SS" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: $SS is not in the mirror (" && ok "T4 CONTROL: r6 gives the bare 'not in the mirror'" || bad T4-ctl "rc=$RC ${ERR:0:160}"

# T5 — origin unreachable: the branch fetch fails, so NO origin check -> never "did not serve".
mkpm; absent "$S" && ok "T5 pre: $S absent" || bad T5-pre present
run "$T/dtp_fail" show "$S" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: $S is not in the mirror, and no origin check was made: the branch fetch was FAILED (" && ! echo "$ERR" | grep -q "origin did not serve" && ok "T5: unreachable origin -> 'no origin check was made'" || bad T5 "rc=$RC ${ERR:0:220}"

# T6 — the pin fetch times out: the timeout wording, never origin's refusal; and the lock is free
# right after. NOTE (Langston, Step 4): this does NOT show `9>&-` — coreutils `timeout` group-kills, so
# the lock frees even when fd 9 IS inherited (he measured flock -n succeeding in both arms). T11 is
# the case that discriminates.
mkpm; absent "$S" && ok "T6 pre: $S absent" || bad T6-pre present
run "$T/dtp_to" show "$S" CLAUDE.md
[ $RC -eq 1 ] && echo "$ERR" | grep -q "^REFUSED: $S is not in the mirror, and the origin check timed out after 0.001s (" && ! echo "$ERR" | grep -q "origin did not serve" && ok "T6: pin fetch timeout -> timeout wording" || bad T6 "rc=$RC ${ERR:0:220}"
flock -n "$PM/dt-fetch.lock" true && ok "T6: the fetch lock is free immediately after the timed-out call (liveness only; T11 shows 9>&-)" || bad T6-lock "lock still held"

# T7 — the anchor survives gc and dt-backup-sync's prune; the mirror never goes shallow.
mkpm; absent "$S" && ok "T7 pre: $S absent" || bad T7-pre present
run "$T/dtp" show "$S" CLAUDE.md
$PM_ reflog expire --expire=now --all; $PM_ gc --quiet --prune=now
$PM_ cat-file -e "$S" && ok "T7: pinned commit survives reflog expiry + gc --prune=now" || bad T7 "gone after gc"
[ "$($PM_ rev-parse --is-shallow-repository)" = false ] && ok "T7: the mirror is not shallow" || bad T7-shallow x
$PM_ update-ref -d "refs/dt-review/pins/$S"; $PM_ reflog expire --expire=now --all; $PM_ gc --quiet --prune=now
absent "$S" && ok "T7 CONTROL: with the pin ref removed, the same expiry + gc drops it" || bad T7-ctl "still present"
mkpm; run "$T/dtp" show "$S" CLAUDE.md
$PM_ fetch --quiet --prune "file://$PO" "+refs/heads/*:refs/heads/*"
[ "$($PM_ rev-parse --verify --quiet refs/dt-review/pins/$S)" = "$S" ] && ok "T7: a dt-backup-sync-shaped --prune fetch leaves the pin ref" || bad T7-prune x

# T8 — a FULL id of a BLOB the mirror holds: not fetched, refused as before.
mkpm; $PM_ cat-file -e "$BLOB" && ok "T8 pre: blob $BLOB present" || bad T8-pre absent
run "$T/dtp" show "$BLOB" CLAUDE.md
[ $RC -eq 2 ] && echo "$ERR" | grep -q "names a blob, not a commit" && [ -z "$($PM_ for-each-ref refs/dt-review)" ] && ok "T8: present full-id blob -> refused, origin not asked" || bad T8 "rc=$RC ${ERR:0:160}"

# T10 — the shipped pin-fetch command carries every bound (C-1, C-2): read off the file under test.
PF=$(grep -B2 'refs/dt-review/pins/$PIN" 2>&1 9>&-)' "$T/src/dt-review")
echo "$PF" | grep -q "GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2'" \
  && echo "$PF" | grep -q 'timeout "$PIN_FETCH_TIMEOUT"' && echo "$PF" | grep -q -- '--no-tags' \
  && ! echo "$PF" | grep -q -- '--depth' && ok "T10: the pin fetch has GIT_SSH_COMMAND, its timeout, --no-tags, 9>&-, and no --depth" || bad T10 "${PF:0:300}"

# T11 — `9>&-` reaches the ssh GRANDCHILD (Langston Step-4 condition 1). A stand-in `ssh` first on PATH
# records its own open fds, then runs git's remote command locally. The ssh:// remote makes git go
# through it for BOTH fetches (branch, then pin). No line may show fd 9 (the lock). CONTROL: the same
# copy with `9>&-` removed from the PIN fetch line only — its line must show fd 9.
mkdir -p "$T/fakebin"
cat > "$T/fakebin/ssh" <<'STUB'
#!/bin/sh
printf '%s\n' "$(ls /proc/$$/fd | tr '\n' ' ')" >> "$FDLOG"
for a; do last=$a; done
exec sh -c "$last"
STUB
chmod +x "$T/fakebin/ssh"
mk_pin dtp_ssh "ssh://stub$PO" 60 "$T/src/dt-review"
sed 's#"$PIN:refs/dt-review/pins/$PIN" 2>&1 9>&-)#"$PIN:refs/dt-review/pins/$PIN" 2>\&1)#' "$T/dtp_ssh" > "$T/dtp_ssh_leak"; chmod +x "$T/dtp_ssh_leak"
cmp -s "$T/dtp_ssh" "$T/dtp_ssh_leak" && bad T11-mut "the control mutation did not apply"
mkpm; absent "$S" && ok "T11 pre: $S absent" || bad T11-pre present
rm -f "$T/fd.log"; FDLOG=$T/fd.log PATH="$T/fakebin:$PATH" run "$T/dtp_ssh" show "$S" CLAUDE.md
NL=$(grep -c . "$T/fd.log"); L9=$(grep -cw 9 "$T/fd.log")
[ $RC -eq 0 ] && [ "$NL" -eq 2 ] && [ "$L9" -eq 0 ] && ok "T11: both ssh grandchildren (branch + pin fetch) were started WITHOUT fd 9 ($(tr '\n' '|' < "$T/fd.log"))" || bad T11 "rc=$RC lines=$NL with-9=$L9 log=$(cat "$T/fd.log") err=${ERR:0:160}"
mkpm; rm -f "$T/fd.log"; FDLOG=$T/fd.log PATH="$T/fakebin:$PATH" run "$T/dtp_ssh_leak" show "$S" CLAUDE.md
[ "$(sed -n 2p "$T/fd.log" | grep -cw 9)" -eq 1 ] && [ "$(sed -n 1p "$T/fd.log" | grep -cw 9)" -eq 0 ] && ok "T11 CONTROL: without 9>&- on the pin fetch, its ssh grandchild holds fd 9" || bad T11-ctl "log=$(cat "$T/fd.log")"
rm -rf "$T/fakebin" "$T/fd.log"
rm -rf "$PO" "$PM" "$PW"

echo "DTR SUMMARY: $PASSN pass, $FAILN fail"
