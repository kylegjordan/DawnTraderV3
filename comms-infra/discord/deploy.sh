#!/usr/bin/env bash
# deploy.sh — stand up the Discord bridges on the Hetzner Helsinki box (204.168.141.77),
# IN PARALLEL with the live Telegram fabric. Idempotent. Run from CC's machine via ssh,
# or copy to the box and run as root.
#
# PREREQUISITE (Kyle): the two token env files + the IDs config must already exist:
#   /etc/langston/discord-cc-bot.env        (DISCORD_BOT_TOKEN=...)
#   /etc/langston/discord-langston-bot.env  (DISCORD_BOT_TOKEN=...)
#   /etc/dawntrader/discord-comms.env       (from discord-comms.env.template)
#
# This script does NOT touch the Telegram services, their log, or their state.
set -euo pipefail

BRIDGE_DIR=/opt/discord-bridges
VENV="$BRIDGE_DIR/venv"

echo "== 1. system venv prereq =="
apt-get install -y python3-venv >/dev/null 2>&1 || true

echo "== 2. bridge dir + venv =="
mkdir -p "$BRIDGE_DIR"
if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip >/dev/null
"$VENV/bin/pip" install -U "discord.py>=2.3" >/dev/null
echo "discord.py: $("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')"

echo "== 3. code (expects files already scp'd to $BRIDGE_DIR) =="
chmod +x "$BRIDGE_DIR"/discord-cc-bridge.py "$BRIDGE_DIR"/discord-langston-bridge.py 2>/dev/null || true
# world-readable so the langston-user service can import discord_common + the venv
chmod -R a+rX "$BRIDGE_DIR"

echo "== 4. switch config + cc-send =="
mkdir -p /etc/dawntrader
[ -f /etc/dawntrader/comms-active.env ] || cp "$BRIDGE_DIR/comms-active.env" /etc/dawntrader/comms-active.env
install -m 0755 "$BRIDGE_DIR/cc-send" /usr/local/bin/cc-send

echo "== 5. config sanity =="
for f in /etc/langston/discord-cc-bot.env /etc/langston/discord-langston-bot.env /etc/dawntrader/discord-comms.env; do
  if [ ! -f "$f" ]; then echo "MISSING $f — provision before starting services" >&2; exit 1; fi
done
# CC_BOT_ID is hard-required (load_shared_config raises without it → both bridges crash-loop).
for k in DISCORD_CHANNEL_ID KYLE_DISCORD_ID CC_BOT_ID; do
  grep -q "^${k}=" /etc/dawntrader/discord-comms.env || { echo "MISSING $k in /etc/dawntrader/discord-comms.env" >&2; exit 1; }
done

echo "== 6. systemd units =="
cp "$BRIDGE_DIR/discord-cc-bridge.service" /etc/systemd/system/discord-cc-bridge.service
cp "$BRIDGE_DIR/discord-langston-bridge.service" /etc/systemd/system/discord-langston-bridge.service
# self-advance drop-in (B-LANGSTON-QUEUE #345). MUST be reinstalled here or a redeploy drops
# LANGSTON_SELF_ADVANCE=1 (B-DISCORD-INBOUND-LIVENESS #462 — Langston Step-8 catch: the drop-in +
# the Type=notify/WatchdogSec/TimeoutStartSec units live only if deploy.sh installs them from the
# repo-tracked source, else the next run silently reverts the watchdog to Type=simple).
mkdir -p /etc/systemd/system/discord-langston-bridge.service.d
cp "$BRIDGE_DIR/discord-langston-bridge.service.d/self-advance.conf" /etc/systemd/system/discord-langston-bridge.service.d/self-advance.conf
systemctl daemon-reload
systemctl enable --now discord-cc-bridge.service discord-langston-bridge.service

echo "== 7. status =="
# Type=notify: 'active' only after the gateway connects + READY=1, so allow a few seconds.
sleep 8
systemctl is-active discord-cc-bridge.service discord-langston-bridge.service || true
# (Telegram fabric was DECOMMISSIONED 2026-07-02 — B-TELEGRAM-DECOMM #348; no longer checked here.)
echo "Done. Discord bridges live (Type=notify + receive-liveness watchdog, #462)."
