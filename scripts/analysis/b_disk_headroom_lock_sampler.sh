#!/usr/bin/env bash
# B-DISK-HEADROOM P4 — READ-ONLY. Samples lock waits on the one-minute bar tables across a proof night's sweep.
#
#   b_disk_headroom_lock_sampler.sh <until ISO-UTC> <log path>
#
# Every 10 s, one read-only query: every session waiting on a lock, plus every lock held or wanted on the three bar
# parents or their children, with the waiting/holding query's first 120 characters. It stops at <until>, or 10 min
# after the night's sweep process (b75-retention-sweep) has exited, whichever is first. It writes only its own log.
# Why (scope §3): dropPartition is a bare DROP (b75-retention-sweep.ts:504-505) with no lock_timeout, so the DROP takes
# ACCESS EXCLUSIVE on the PARENT and queues behind any open read; later reads queue behind the DROP.
set -euo pipefail
UNTIL="${1:?until ISO-UTC}"; LOG="${2:?log path}"
END=$(date -u -d "$UNTIL" +%s)
cd /home/deploy/dawntrader
set -a; . ./.env; set +a
SQL=$(cat <<'Q'
BEGIN TRANSACTION READ ONLY;
SELECT now()::timestamptz(0) AS t, a.pid, a.wait_event_type, a.wait_event, a.state, l.mode, l.granted,
       c.relname, left(regexp_replace(a.query, '\s+', ' ', 'g'), 120) AS q
  FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE c.relname ~ '^(xstock_spot|crypto_spot|xstock_perp)_ohlc_1m'
   AND (NOT l.granted OR l.mode = 'AccessExclusiveLock' OR a.wait_event_type = 'Lock')
UNION ALL
SELECT now()::timestamptz(0), a.pid, a.wait_event_type, a.wait_event, a.state, NULL, NULL, NULL,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 120)
  FROM pg_stat_activity a WHERE a.wait_event_type = 'Lock'
UNION ALL
-- the positive control: the sweep's own export/drop session is visible here for minutes while it reads the proof child,
-- so a log with no such row on a proof night means the sampler was blind, not that nothing waited.
SELECT now()::timestamptz(0), a.pid, a.wait_event_type, a.wait_event, 'ACTIVE-ON-BARS', NULL, NULL, NULL,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 120)
  FROM pg_stat_activity a
 WHERE a.state = 'active' AND a.pid <> pg_backend_pid() AND a.query ~ '(xstock_spot|crypto_spot|xstock_perp)_ohlc_1m';
ROLLBACK;
Q
)
echo "# sampler start $(date -u +%FT%TZ) until $UNTIL" >> "$LOG"
seen_sweep=0; gone_since=0
while (( $(date -u +%s) < END )); do
  if pgrep -f b75-retention-sweep >/dev/null; then seen_sweep=1; gone_since=0
  elif (( seen_sweep == 1 )); then
    (( gone_since == 0 )) && gone_since=$(date -u +%s)
    (( $(date -u +%s) - gone_since > 600 )) && { echo "# sweep exited; sampler stop $(date -u +%FT%TZ)" >> "$LOG"; exit 0; }
  fi
  psql "$DATABASE_URL" -X -q -A -t -F '|' -c "$SQL" >> "$LOG" 2>&1 || echo "# sample failed $(date -u +%FT%TZ)" >> "$LOG"
  sleep 10
done
echo "# sampler stop (until reached) $(date -u +%FT%TZ)" >> "$LOG"
