#!/usr/bin/env bash
# token-watch — build the P1 scratch tree: the MINIMAL FAITHFUL COPY of the store that the follow-up pass reads.
# (B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, finding A6; #1132.)
#
#   bash tools/make_followup_scratch.sh            # as root, on staging
#
# What is copied (A6's table, read-site per row in the pre-audit):
#   births, dead, state, study, public            all
#   due/                                          the 48 buckets 2026-09-30T14 .. 2026-10-02T13 only
#   observations/                                 the newest three: 2026-09-28, -29, -30 (there are none after 09-30)
#   provenance/                                   the four correction files at its top level; raw/ is not read
# Not copied: provenance/raw, provenance/follow-up (the capture writes this run's bodies there), cold, offbox.
#
# ⛔ REFUSES unless the follow-up timer is disabled AND inactive (A6: the copy is taken while the pass is off, so the
#    cursor and last_seen it copies are a still picture).
# ⛔ REFUSES if the scratch tree already exists (it never overwrites a capture in progress), or if free space on /
#    would fall under 10 GiB after the copy.
# ⛔ THE COPY RUNS UNDER THE STORE'S OWN periodic_lock (Langston, Step 4 B-1), through tools/locked_copy.py as
#    tokenwatch. The follow-up is not the only writer: summary and feed-watch (hourly), tier and cold-offbox (daily)
#    take that lock, and each creates and removes state/periodic.lock and budget.json.<pid>.<hex>.tmp; a file renamed
#    away between listdir and open makes `cp -a` fail and the script die on a partial tree that every retry refuses.
#    The RECEIVER takes no lock by design and only appends whole fsync'd lines (store.py:114-117), so a concurrent
#    copy sees whole records; it is not gated.
# ⛔ THE LOCK IS NOT COPIED (B-2): state/periodic.lock and any state/*.tmp are removed from the copy, or the replay's
#    own run_hour would skip (a lock under 30 min old) or log a steal (over it).
# ★ deploy gets READ access to THE CAPTURE LOG ONLY (R-1, narrowed at Step 4 r2): traverse (--x) on the tree's root
#    and r-- on a pre-created capture-log.jsonl (0640). NOT the data: `config.harden` chmods every follow-up body and
#    its folder (0600/0700) on each write, which collapses any ACL mask there within seconds; and a readable mask
#    over the copied births/dead/state/study would grant deploy the census production deliberately denies it
#    (summary.py:8-15). The capture opens its log with a plain append and never hardens it.
# The tree is tokenwatch:tokenwatch 0700, OUTSIDE /var/lib/token-watch, so the store-size watch never counts it.
# Every copy runs under nice -n 19 / ionice -c3 (the trading app shares this disk). Exit 0 prints the copy's bytes.
set -euo pipefail
SRC=/var/lib/token-watch
DST=/var/lib/token-watch-scratch
FLOOR=$((10 * 1024 * 1024 * 1024))

[[ $EUID -eq 0 ]] || { echo "REFUSED: run as root (it creates $DST owned by tokenwatch)" >&2; exit 2; }
[[ "$(systemctl is-enabled token-watch-followup.timer || true)" == disabled ]] || { echo "REFUSED: the follow-up timer is not disabled" >&2; exit 2; }
[[ "$(systemctl is-active token-watch-followup.timer || true)" == inactive ]] || { echo "REFUSED: the follow-up timer is active" >&2; exit 2; }
# A RUNNING follow-up is refused. "inactive" and "failed" both mean no process: the service's last state is the
# 2026-09-30 13:05:17Z OOM kill (Result: oom-kill) this batch exists to measure, and it stays "failed" until reset.
case "$(systemctl is-active token-watch-followup.service || true)" in
  active|activating|deactivating|reloading) echo "REFUSED: a follow-up run is in progress (started by hand?)" >&2; exit 2 ;;
esac
[[ ! -e "$DST" ]] || { echo "REFUSED: $DST already exists; remove it deliberately first" >&2; exit 2; }

BUCKETS=()
h=$(date -u -d "2026-09-30 14:00" +%s); end=$(date -u -d "2026-10-02 13:00" +%s)
while (( h <= end )); do BUCKETS+=("due/$(date -u -d "@$h" +%Y-%m-%dT%H).jsonl"); h=$((h + 3600)); done
(( ${#BUCKETS[@]} == 48 )) || { echo "REFUSED: built ${#BUCKETS[@]} bucket names, expected 48" >&2; exit 2; }
for b in "${BUCKETS[@]}"; do [[ -f "$SRC/$b" ]] || { echo "REFUSED: $SRC/$b is missing" >&2; exit 3; }; done

FILES=("${BUCKETS[@]}" observations/2026-09-28.jsonl observations/2026-09-29.jsonl observations/2026-09-30.jsonl
       provenance/creator-stake.jsonl provenance/gaps.jsonl provenance/mint-corrections.jsonl
       provenance/pool-sol-corrections.jsonl)
for f in "${FILES[@]:48}"; do [[ -f "$SRC/$f" ]] || { echo "REFUSED: $SRC/$f is missing" >&2; exit 3; }; done
DIRS=(births dead state study public)

need=$(( $(du -sb "${DIRS[@]/#/$SRC/}" | awk '{s+=$1} END {print s}') + $(cd "$SRC" && du -cb "${FILES[@]}" | tail -1 | cut -f1) ))
free=$(df -B1 --output=avail / | tail -1 | tr -d ' ')
(( free - need >= FLOOR )) || { echo "REFUSED: free $free - copy $need is under the 10 GiB floor" >&2; exit 4; }
echo "copying $need B (free before: $free B)"

HERE=$(cd "$(dirname "$0")/.." && pwd)
install -d -o tokenwatch -g tokenwatch -m 0700 "$DST" "$DST/due" "$DST/observations" "$DST/provenance" "$DST/provenance/follow-up"
runuser -u tokenwatch -- env TOKEN_WATCH_ROOT="$SRC" PYTHONDONTWRITEBYTECODE=1 \
  python3 "$HERE/tools/locked_copy.py" "$DST" "${DIRS[@]}" "${FILES[@]}"
rm -f "$DST/state/periodic.lock"
find "$DST/state" -maxdepth 1 -name '*.tmp' -print -delete
setfacl -m u:deploy:--x "$DST"
install -o tokenwatch -g tokenwatch -m 0640 /dev/null "$DST/capture-log.jsonl"
setfacl -m u:deploy:r-- "$DST/capture-log.jsonl"
echo "done: $(du -sb "$DST" | cut -f1) B in $DST; free now $(df -B1 --output=avail / | tail -1 | tr -d ' ') B"
