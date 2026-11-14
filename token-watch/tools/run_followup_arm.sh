#!/usr/bin/env bash
# token-watch — run ONE replay arm in its own systemd unit and record how it ended, KILL included.
# (B-TOKEN-WATCH-FOLLOWUP-MEMORY P1; answers Langston's Step-4 r1 question (iii): a kill is recorded by the unit's
#  own Result, never inferred from a missing output file.)
#
#   bash tools/run_followup_arm.sh <arm> <run dir> <bodies.sqlite> <now ISO> <result dir> [--trace] [--n N] [--shape FILE]
#   arm xn needs --n (the derived N, written down before the run); arm sept needs --shape (the reference day's shape).
#   (Step 7, 2026-11-14: the runner accepted only all_shed|live|x4, so the two §6 arms could not be run through it.)
#
# As root on staging. The unit: User=tokenwatch, MemoryMax=512M, IPAddressDeny=any, CPUQuota=40%, the harness at
# /opt/token-watch-p1 (the reviewed tree). After it ends, `systemctl show` gives Result (success | exit-code |
# oom-kill | ...), ExecMainStatus and MemoryPeak; they are written to <result dir>/<arm>-unit.txt beside the
# harness's own <arm>.json. Exit: the harness's exit status, or 137 on an OOM kill.
set -euo pipefail
ARM="$1"; RUN="$2"; BODIES="$3"; NOW="$4"; OUT="$5"; shift 5
EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --trace) EXTRA+=(--trace "$OUT/$ARM-trace"); shift ;;
    --n|--shape) [[ $# -ge 2 && -n "$2" ]] || { echo "REFUSED: $1 needs a value" >&2; exit 2; }; EXTRA+=("$1" "$2"); shift 2 ;;
    *) echo "REFUSED: unknown option $1" >&2; exit 2 ;;
  esac
done
HARNESS=/opt/token-watch-p1/tools/measure_followup_memory.py
[[ $EUID -eq 0 ]] || { echo "REFUSED: run as root (systemd-run)" >&2; exit 2; }
[[ -f "$HARNESS" ]] || { echo "REFUSED: $HARNESS is not installed" >&2; exit 2; }
case "$ARM" in all_shed|live|x4|xn|sept) ;; *) echo "REFUSED: arm must be all_shed|live|x4|xn|sept" >&2; exit 2 ;; esac
# the harness also refuses these (exit 2 with a void record); refusing here first starts no unit at all
[[ "$ARM" != xn || " ${EXTRA[*]} " == *" --n "* ]] || { echo "REFUSED: arm xn needs --n" >&2; exit 2; }
[[ "$ARM" != sept || " ${EXTRA[*]} " == *" --shape "* ]] || { echo "REFUSED: arm sept needs --shape" >&2; exit 2; }
install -d -o tokenwatch -g tokenwatch -m 0700 "$OUT"
UNIT="tw-p1-$ARM-$(date -u +%Y%m%dT%H%M%S)"
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
