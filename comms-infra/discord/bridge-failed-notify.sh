#!/usr/bin/env bash
# bridge-failed-notify.sh — OnFailure page for the Discord bridges (B-DISCORD-INBOUND-LIVENESS #462).
#
# Fired by systemd `OnFailure=` when a bridge unit latches `failed` — i.e. it crash-looped past its
# StartLimit (a sustained gateway-unreachable outage, or a real fault). WITHOUT this, a StartLimit
# latch is SILENT (nobody watches systemd unit-state cross-network — the exact fail-quiet this batch
# exists to kill). This converts the silent latch into a LOUD page so a human looks.
#
# Best-effort by nature: it posts via `cc-send` (a fresh REST invocation, independent of the failed
# daemon). It REACHES Kyle when the alert path is up (a gateway-only network partition, or a code
# fault) — the cases where silent-forever-restart/latch would be worst. It CANNOT reach him during a
# full Discord outage (REST also down) — but then Kyle can't use Discord either, so nothing is lost.
set -u
UNIT="${1:-a Discord bridge}"
# ⛔ SAY WHAT HAPPENED (B-LANGSTON-RELIEF, 2026-10-17): OnFailure fires on ANY failure, and a planned restart whose stop
#    timed out paged "crash-looped past its restart limit" while the bridge was already back up. The unit's own
#    Result and state decide the wording, and the page is no longer posted under a session's name (it said "OLD
#    Claude", who had nothing to do with it).
RESULT=$(systemctl show -p Result --value "$UNIT" 2>/dev/null || echo unknown)
STATE=$(systemctl is-active "$UNIT" 2>/dev/null || true)
if [ "$RESULT" = "start-limit-hit" ] || [ "$STATE" = "failed" ]; then
  MSG="🚨 **${UNIT} has FAILED-LATCHED** (result: ${RESULT}) — it crash-looped past its restart limit (a sustained gateway outage, or a real fault) and has STOPPED auto-restarting. It needs a manual restart once the cause is cleared: \`systemctl reset-failed ${UNIT} && systemctl start ${UNIT}\`. (If this is a full Discord outage you'll only see this once Discord is back.)"
  NOTIFY="--notify"
else
  MSG="⚠️ **${UNIT} recorded a failure** (result: ${RESULT}) but is **${STATE:-unknown}** again — it was restarted. If nobody planned a restart, look at why it stopped: \`journalctl -u ${UNIT} -n 80\`."
  NOTIFY=""
fi
/usr/local/bin/cc-send --sender "Bridge watchdog" $NOTIFY --message "$MSG" 2>/dev/null || true
exit 0
