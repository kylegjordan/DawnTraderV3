#!/bin/sh
# B-XSTOCK-BAR-AVAILABILITY R7 — the only supported cron/manual entry path for the unattended
# verdict runner. Same shape as b75-retention-run.sh: one stable lock inode, a kernel flock held
# on an inherited descriptor for the whole process, never unlinked or age-reclaimed, so a run that
# outlives its successor's start cannot overlap it (the gate read alone can take ~11 minutes).

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
LOCK_FILE=${XSTOCK_VERDICT_LOCK_FILE:-/tmp/xstock-bar-availability-verdict.lock}

exec 9>>"$LOCK_FILE"
if ! /usr/bin/flock -n 9; then
  echo "[xstock-bar-verdict-runner] another run still holds the kernel lock — skipping this invocation"
  exit 0
fi

cd "$ROOT_DIR"
exec /usr/bin/npx tsx server/scripts/b-xstock-bar-availability-verdict-runner.ts "$@"
