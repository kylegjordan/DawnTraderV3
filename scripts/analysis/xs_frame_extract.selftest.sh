#!/usr/bin/env bash
# Self-test for xs_frame_extract.sh (3n.q7 inc-2 P4): runs it against a scratch log folder through the five cases the
# plan names and asserts each. No alerts are raised (NO_ALERT=1); nothing outside the scratch folder is touched.
set -u
S="$(cd "$(dirname "$0")" && pwd)/xs_frame_extract.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/logs" "$T/arch"
for d in 17 18 19; do
  f="$T/logs/error__2026-09-${d}_00-00-00.log"
  printf 'x\n2026-09-%s 01:00:00 +00:00: [3n.q7][XS_FRAME] MDB/USD pos=p frame=ok\nother\n2026-09-%s 01:00:01 +00:00: [3n.q7][XS_FRAME_RECONCILE_BROKEN] emitted=1 invoked=2\n' "$d" "$d" > "$f"
  touch -d "2026-09-${d} 00:00:00 UTC" "$f"
done
printf 'live\n' > "$T/logs/error.log"
printf '2026-09-22T14:38:49: PM2 log: App [dawntrader:0] exited with code [0]\n2026-09-22T14:38:49: PM2 log: App [dawntrader:0] starting in -fork mode-\nnoise\n' > "$T/pm2.log"
printf 'sha=abc\ndeployed_at=2026-09-22T14:39:00Z\n' > "$T/rec"
printf 'aaa abc deploy <d> 1790087913 +0000\treset: moving to abc\n' > "$T/reflog"
run() { LOG_DIR="$T/logs" ARCHIVE="$T/arch" PM2_LOG="$T/pm2.log" DEPLOY_RECORD="$T/rec" REFLOG="$T/reflog" NO_ALERT=1 NOW_EPOCH=$(date -u -d '2026-09-30 12:00' +%s) bash "$S"; }
ok=1; check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; ok=0; fi; }

run; check "run1 exits 0" "$?" 0
check "run1 extracts the 3 rotated files, never the live log" "$(wc -l < "$T/arch/manifest.tsv")" 3
check "run1 keeps both XS_FRAME line kinds and nothing else" "$(gzip -dc "$T/arch/error__2026-09-17_00-00-00.xs.gz" | wc -l)" 2
check "run1 archives both restart markers" "$(grep -c 'App \[dawntrader' "$T/arch/boundaries.log")" 2
check "run1 archives the deploy record verbatim" "$(grep -c 'sha=abc' "$T/arch/boundaries.log")" 1
check "run1 archives the reflog deploy line" "$(grep -c 'reset: moving to abc' "$T/arch/boundaries.log")" 1
# two deploys inside one cadence: the record keeps only the last; the reflog keeps both
printf 'abc def deploy <d> 1790100000 +0000\treset: moving to def\nabc ghi deploy <d> 1790100100 +0000\treset: moving to ghi\n' >> "$T/reflog"
run; check "run2 is idempotent (manifest unchanged)" "$(wc -l < "$T/arch/manifest.tsv")" 3
check "run2 archives BOTH intra-cadence deploys from the reflog, each once" "$(grep -c 'reset: moving to ' "$T/arch/boundaries.log")" 3
echo "error__2026-09-16_00-00-00.log" >> "$T/arch/last_seen.txt"
run; check "run3: a file seen last run and gone unextracted is a GAP (exit 3)" "$?" 3
rm "$T"/logs/error__2026-09-1[78]_00-00-00.log; touch -d '2026-09-30 04:00 UTC' "$T/logs/error__2026-09-19_00-00-00.log"
run; check "run4 exits 0 (extracted files leaving is not a gap; oldest 8 h is between cadence and 2x cadence)" "$?" 0
check "run4 raises the pre-loss reach rung" "$(grep -c 'reach below 2x cadence' "$T/arch/runs.log")" 1
touch -d '2026-09-30 11:00 UTC' "$T/logs/error__2026-09-19_00-00-00.log"
run; check "run4b: oldest younger than ONE cadence is a realized GAP (exit 3; Langston Step-4 attack 3)" "$?" 3
check "run4b names the sub-cadence rotation" "$(grep -c 'rotation faster than the extraction cadence' "$T/arch/runs.log")" 1
printf 'short\n' > "$T/pm2.log"
run >/dev/null; check "run5 detects pm2.log shrinking" "$(grep -c 'pm2.log shrank' "$T/arch/runs.log")" 1
# the reflog arms (Langston P4 r4: he exercised both by hand; kept proven here)
printf 'aaa abc deploy <d> 1790087913 +0000\treset: moving to abc\n' > "$T/reflog"
run >/dev/null; check "run6 detects the reflog shrinking (reach alert)" "$(grep -c 'reflog shrank' "$T/arch/runs.log")" 1
check "run6 re-reads the shrunk reflog from its start" "$(grep -c 'reset: moving to ' "$T/arch/boundaries.log")" 4
mv "$T/reflog" "$T/reflog.gone"; run; check "run7: an unreadable reflog is a GAP (exit 3)" "$?" 3
mv "$T/reflog.gone" "$T/reflog"
rm "$T/rec"; run; check "run8: an unreadable deploy record is a GAP (exit 3)" "$?" 3
[ "$ok" = 1 ] && echo "SELF-TEST PASS" || { echo "SELF-TEST FAIL"; exit 1; }
