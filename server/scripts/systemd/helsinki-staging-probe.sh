#!/bin/bash
# B-STAGING-LIVENESS-WATCH OBJ-3 — Helsinki-side HOST-DOWN probe (#512 residual).
# The staging-side watchdog + alerts jsonl die WITH the staging box; this probe
# runs on the Helsinki box (which already hosts the Discord bridges) and closes
# the full-host-down class: 3 consecutive probe failures -> Discord #general via
# cc-send --notify (Kyle phone push). Recovery posts once and re-arms.
# Install (Helsinki, as root):
#   cp helsinki-staging-probe.sh /usr/local/bin/ && chmod +x /usr/local/bin/helsinki-staging-probe.sh
#   cp helsinki-staging-probe.{service,timer} /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now helsinki-staging-probe.timer
set -u

TARGET_URL="${PROBE_TARGET_URL:-https://188.245.193.8.sslip.io/}"
STATE_FILE="${PROBE_STATE_FILE:-/var/lib/helsinki-staging-probe.state}"
THRESHOLD=3

read -r FAILS ALERTED < "$STATE_FILE" 2>/dev/null || { FAILS=0; ALERTED=0; }

if curl -s -o /dev/null -m 15 --retry 1 "$TARGET_URL"; then
  if [ "$ALERTED" = "1" ]; then
    cc-send --sender "NEW Claude" --message "STAGING HOST RECOVERED — the Helsinki probe reaches the staging box again (was down >= ${THRESHOLD} consecutive checks)." || true
  fi
  echo "0 0" > "$STATE_FILE"
  exit 0
fi

FAILS=$((FAILS + 1))
echo "probe FAIL (${FAILS}/${THRESHOLD})" >&2
if [ "$FAILS" -ge "$THRESHOLD" ] && [ "$ALERTED" != "1" ]; then
  cc-send --notify --sender "NEW Claude" --message "STAGING HOST DOWN — the Helsinki probe cannot reach the staging box (${THRESHOLD} consecutive failures, ~$((THRESHOLD * 5)) min). The on-box watchdog and alert file are down WITH it — this is the external leg. Investigate the server (power/network/TLS edge)." || true
  ALERTED=1
fi
echo "$FAILS $ALERTED" > "$STATE_FILE"
