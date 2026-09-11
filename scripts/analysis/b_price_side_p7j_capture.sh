#!/usr/bin/env bash
# B-PRICE-SIDE-BY-JOB r5 P-7j Step-8 capture: every [9.3][REWARM] and [9.3][KALMAN] line from the restart instant to
# restart + 30 minutes, copied raw from out.log (console.log stream). Run as root on 188.245.193.8.
# $1 = restart instant 'YYYY-MM-DD HH:MM:SS' (UTC, from the deploy record); $2 = end instant, same form.
# The filter registry is one AdaptiveKalmanFilter per symbol string (adaptive-kalman.ts:301-313) and its only
# production caller is signal-orchestrator.ts:2426, so each symbol's KALMAN lines are one filter's sequence.
set -u
R="$1"; E="$2"
LOG=/var/log/dawntrader/out.log
echo "# capture window [$R, $E) UTC; source $LOG; captured at $(date -u +%FT%TZ)"
echo "# reach: out.log first line $(head -1 "$LOG" | cut -c1-19); last line $(tail -1 "$LOG" | cut -c1-19)"
echo "# positive control: KALMAN lines in the whole file = $(grep -cF '[9.3][KALMAN]' "$LOG")"
grep -F -e "[9.3][REWARM]" -e "[9.3][KALMAN]" "$LOG" | awk -v r="$R" -v e="$E" 'substr($0,1,19) >= r && substr($0,1,19) < e'
