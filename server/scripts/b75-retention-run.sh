#!/bin/sh
# B-XSTOCK-SNAPSHOT-RETENTION — the only supported B75 cron/manual entry path.
#
# The prior in-process O_EXCL file was reclaimed solely by age and unlinked on
# every release.  A live run crossing six hours could therefore overlap its
# successor and later delete the successor's lock.  This launcher keeps one
# stable inode, holds a kernel flock on an inherited descriptor for the entire
# process, and never unlinks or age-reclaims it.  The kernel releases only this
# holder's lock when the last inherited descriptor closes, including crashes.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
LOCK_FILE=${B75_SWEEP_LOCK_FILE:-/tmp/b75-retention-sweep.lock}

exec 9>>"$LOCK_FILE"
if ! /usr/bin/flock -n 9; then
  echo "[B75 sweep] another run still holds the kernel lock — skipping this invocation"
  exit 0
fi

export B75_SWEEP_LOCK_HELD=1
cd "$ROOT_DIR"

# Process-level lock tests execute a harmless fixture through the production
# launcher.  Production can never select this branch accidentally: both the
# test environment and an explicit executable are required.
if [ "${NODE_ENV:-}" = "test" ] && [ -n "${B75_SWEEP_TEST_EXEC:-}" ]; then
  exec "$B75_SWEEP_TEST_EXEC" "$@"
fi

exec /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts "$@"
