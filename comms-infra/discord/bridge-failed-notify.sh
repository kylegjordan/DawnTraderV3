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
/usr/local/bin/cc-send --sender "OLD Claude" --notify \
  --message "🚨 **${UNIT} has FAILED-LATCHED** — it crash-looped past its restart limit (a sustained gateway outage, or a real fault) and has STOPPED auto-restarting. It needs a manual restart once the cause is cleared: \`systemctl reset-failed ${UNIT} && systemctl start ${UNIT}\`. (If this is a full Discord outage you'll only see this once Discord is back.)" \
  2>/dev/null || true
exit 0
