#!/usr/bin/env bash
# token-watch — run ONE replay arm in its own systemd unit and record how it ended, KILL included.
# (B-TOKEN-WATCH-FOLLOWUP-MEMORY P1; answers Langston's Step-4 r1 question (iii): a kill is recorded by the unit's
#  own Result, never inferred from a missing output file.)
#
#   bash tools/run_followup_arm.sh <arm> <run dir> <bodies.sqlite> <now ISO> <result dir> [--trace]
#
# As root on staging. The unit: User=tokenwatch, MemoryMax=512M, IPAddressDeny=any, CPUQuota=40%, the harness at
# /opt/token-watch-p1 (the reviewed tree). After it ends, `systemctl show` gives Result (success | exit-code |
# oom-kill | ...), ExecMainStatus and MemoryPeak; they are written to <result dir>/<arm>-unit.txt beside the
# harness's own <arm>.json. Exit: the harness's exit status, or 137 on an OOM kill.
set -euo pipefail
ARM="$1"; RUN="$2"; BODIES="$3"; NOW="$4"; OUT="$5"; TRACE="${6:-}"
HARNESS=/opt/token-watch-p1/tools/measure_followup_memory.py
[[ $EUID -eq 0 ]] || { echo "REFUSED: run as root (systemd-run)" >&2; exit 2; }
[[ -f "$HARNESS" ]] || { echo "REFUSED: $HARNESS is not installed" >&2; exit 2; }
case "$ARM" in all_shed|live|x4) ;; *) echo "REFUSED: arm must be all_shed|live|x4" >&2; exit 2 ;; esac
install -d -o tokenwatch -g tokenwatch -m 0700 "$OUT"
UNIT="tw-p1-$ARM-$(date -u +%Y%m%dT%H%M%S)"
EXTRA=()
[[ "$TRACE" == "--trace" ]] && EXTRA=(--trace "$OUT/$ARM-trace")
set +e
systemd-run --wait --unit="$UNIT" --uid=tokenwatch --gid=tokenwatch -p RemainAfterExit=yes   -p MemoryMax=512M -p IPAddressDeny=any -p CPUQuota=40%   -E TOKEN_WATCH_ROOT="$RUN" -E PYTHONUNBUFFERED=1 -E PYTHONDONTWRITEBYTECODE=1   /usr/bin/python3 "$HARNESS" run --arm "$ARM" --run-root "$RUN" --bodies "$BODIES" --now "$NOW"   --out "$OUT/$ARM.json" "${EXTRA[@]}" > "$OUT/$ARM-unit.txt" 2>&1
RC=$?
set -e
# systemd-run --wait prints "Finished with result: <Result>" and the memory peak itself; `show` adds the unit's fields.
systemctl show "$UNIT" -p Result -p ExecMainStatus -p ExecMainCode -p MemoryPeak -p MemoryMax >> "$OUT/$ARM-unit.txt"
systemctl stop "$UNIT" || true
systemctl reset-failed "$UNIT" 2>&1 || true
cat "$OUT/$ARM-unit.txt"
grep -q "oom-kill" "$OUT/$ARM-unit.txt" && exit 137
exit "$RC"
