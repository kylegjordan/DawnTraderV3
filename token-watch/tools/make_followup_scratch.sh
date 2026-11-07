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
# The tree is tokenwatch:tokenwatch 0700, OUTSIDE /var/lib/token-watch, so the store-size watch never counts it.
# Every copy runs under nice -n 19 / ionice -c3 (the trading app shares this disk). Exit 0 prints the copy's bytes.
set -euo pipefail
SRC=/var/lib/token-watch
DST=/var/lib/token-watch-scratch
FLOOR=$((10 * 1024 * 1024 * 1024))

[[ $EUID -eq 0 ]] || { echo "REFUSED: run as root (it creates $DST owned by tokenwatch)" >&2; exit 2; }
[[ "$(systemctl is-enabled token-watch-followup.timer || true)" == disabled ]] || { echo "REFUSED: the follow-up timer is not disabled" >&2; exit 2; }
[[ "$(systemctl is-active token-watch-followup.timer || true)" == inactive ]] || { echo "REFUSED: the follow-up timer is active" >&2; exit 2; }
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

install -d -o tokenwatch -g tokenwatch -m 0700 "$DST" "$DST/due" "$DST/observations" "$DST/provenance" "$DST/provenance/follow-up"
for d in "${DIRS[@]}"; do nice -n 19 ionice -c3 cp -a "$SRC/$d" "$DST/$d"; done
for f in "${FILES[@]}"; do nice -n 19 ionice -c3 cp -a "$SRC/$f" "$DST/$f"; done
chown -R tokenwatch:tokenwatch "$DST"
echo "done: $(du -sb "$DST" | cut -f1) B in $DST; free now $(df -B1 --output=avail / | tail -1 | tr -d ' ') B"
