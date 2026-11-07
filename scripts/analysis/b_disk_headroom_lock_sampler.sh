#!/usr/bin/env bash
# B-DISK-HEADROOM P4 — READ-ONLY. Samples lock waits on the one-minute bar tables across a proof night's sweep.
#
#   bash b_disk_headroom_lock_sampler.sh <until ISO-UTC> <log path>
#
# Every 10 s, one read-only query: every lock on the three bar parents or their children that is waiting or ACCESS
# EXCLUSIVE, every session waiting on any lock, and every active session whose query names a bar table. Each row carries
# query_start, state_change and pg_blocking_pids, so a wait's LENGTH and its BLOCKER are read from one sample, not
# inferred from how many samples it appeared in (Langston Step 4 B3). Each sample writes a `# tick` line first, so a
# quiet sample is distinguishable from a missing one. It stops at <until>, or 10 min after the night's sweep process
# has exited, whichever is first. It writes only its own log.
# Why (scope §3): dropPartition is a bare DROP (b75-retention-sweep.ts:505) with no lock_timeout, so the DROP takes
# ACCESS EXCLUSIVE on the PARENT and queues behind any open read; later reads queue behind the DROP.
# Row: t | pid | wait_event_type | wait_event | state | lock mode | granted | relation | query_start | state_change |
#      blocking pids | query (120 chars)
set -euo pipefail
UNTIL="${1:?until ISO-UTC}"; LOG="${2:?log path}"
END=$(date -u -d "$UNTIL" +%s)
cd /home/deploy/dawntrader
set -a; . ./.env; set +a
SQL=$(cat <<'Q'
BEGIN TRANSACTION READ ONLY;
SELECT now()::timestamptz(0) AS t, a.pid, a.wait_event_type, a.wait_event, a.state, l.mode, l.granted, c.relname,
       a.query_start::timestamptz(0), a.state_change::timestamptz(0), pg_blocking_pids(a.pid)::text,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 120) AS q
  FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE c.relname ~ '^(xstock_spot|crypto_spot|xstock_perp)_ohlc_1m'
   AND (NOT l.granted OR l.mode = 'AccessExclusiveLock' OR a.wait_event_type = 'Lock')
UNION ALL
SELECT now()::timestamptz(0), a.pid, a.wait_event_type, a.wait_event, a.state, NULL, NULL, NULL,
       a.query_start::timestamptz(0), a.state_change::timestamptz(0), pg_blocking_pids(a.pid)::text,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 120)
  FROM pg_stat_activity a WHERE a.wait_event_type = 'Lock'
UNION ALL
-- the positive control: the sweep's own export/drop session is visible here for minutes while it reads the proof child,
-- so a log with no such row on a proof night means the sampler was blind, not that nothing waited.
SELECT now()::timestamptz(0), a.pid, a.wait_event_type, a.wait_event, 'ACTIVE-ON-BARS', NULL, NULL, NULL,
       a.query_start::timestamptz(0), a.state_change::timestamptz(0), pg_blocking_pids(a.pid)::text,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 120)
  FROM pg_stat_activity a
 WHERE a.state = 'active' AND a.pid <> pg_backend_pid() AND a.query ~ '(xstock_spot|crypto_spot|xstock_perp)_ohlc_1m';
ROLLBACK;
Q
)
echo "# sampler start $(date -u +%FT%TZ) until $UNTIL; db role $(psql "$DATABASE_URL" -X -q -A -t -c 'select current_user')" >> "$LOG"
seen_sweep=0; gone_since=0; announced=0
while (( $(date -u +%s) < END )); do
  if P=$(pgrep -af b75-retention-sweep); then
    seen_sweep=1; gone_since=0
    if (( announced == 0 )); then echo "# sweep process seen: ${P:0:600}" >> "$LOG"; announced=1; fi
  elif (( seen_sweep == 1 )); then
    (( gone_since == 0 )) && gone_since=$(date -u +%s)
    (( $(date -u +%s) - gone_since > 600 )) && { echo "# sweep exited; sampler stop $(date -u +%FT%TZ)" >> "$LOG"; exit 0; }
  fi
  echo "# tick $(date -u +%FT%TZ)" >> "$LOG"
  psql "$DATABASE_URL" -X -q -A -t -F '|' -c "$SQL" >> "$LOG" 2>&1 || echo "# sample failed $(date -u +%FT%TZ)" >> "$LOG"
  sleep 10
done
echo "# sampler stop (until reached) $(date -u +%FT%TZ)" >> "$LOG"
