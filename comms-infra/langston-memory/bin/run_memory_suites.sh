#!/bin/bash
# run_memory_suites.sh — every hand-run suite of langston-memory-write, together, one line each (B-LANGSTON-TWO-WORKERS
# #1248, Langston Step 4 part 2 C-3). WHY: nothing ran them together, and a signature change in 2a336946a sat broken
# 11-05 -> 11-06 because one suite was never run. ROOT ONLY (the writer refuses other uids, and a root run executes the
# reader, so this directory must be root-owned):
#   mkdir -m 700 /root/lmw-suites && cp comms-infra/langston-memory/bin/* /root/lmw-suites/ && \
#     bash /root/lmw-suites/run_memory_suites.sh
# Prints one line per suite (PASS / FAIL + the exit code + the suite's own last line) and exits non-zero if any failed.
# Judged by exit code, never by grepping output.
set -u
[ "$(id -u)" = 0 ] || { echo "REFUSED: run as root (see the header)"; exit 2; }
cd "$(dirname "$0")" || exit 2
chmod 700 langston-memory-write 2>/dev/null
fail=0
for t in test_ledger_split.py test_memory_fence.py test_memory_trim.py test_memory_retry.py mutate_memory_retry.py; do
  out=$(timeout 1800 python3 "$t" 2>&1); rc=$?
  last=$(printf '%s\n' "$out" | grep -v '^\s*$' | tail -1)
  if [ "$rc" = 0 ]; then echo "PASS $t  | $last"; else echo "FAIL $t (exit $rc) | $last"; fail=1; fi
done
exit $fail
