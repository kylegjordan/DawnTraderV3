#!/usr/bin/env bash
# How many wake-watcher READERS are running for one session alias — a diagnostic (B-TOKEN-BURN-CUT Step 7).
# Since B-WAKE-ARM-EXCLUSIVE (#1140) the filter holds the ONE reader predicate and the lease is what prevents a second
# reader; this script only asks the filter (`--count`), so the predicate cannot drift between two copies (Langston C4).
#   0  -> no reader. A leased arm decides for itself whether to start (it refuses with WATCHER-* when it must not).
#   1  -> running.
#   2+ -> duplicates: only possible from arms older than the lease (a WATCHER-OLD-ARM refusal names them).
# Limit (carried from the filter): readers are counted only under an interpreter named python.exe; the filter refuses
#   to arm under any other, so the blind spot cannot hide a reader. Production readers only (a test's `--lease-root`
#   readers are a separate domain).
# Limit 2: between a failed pipeline and the next, a loop sleeps 30 s with no reader, so 0 is not proof the loop is dead.
A="${1:?usage: cc-wake-count.sh <ALIAS>}"
python "$(dirname "$0")/cc-wake-filter.py" "$A" --count
