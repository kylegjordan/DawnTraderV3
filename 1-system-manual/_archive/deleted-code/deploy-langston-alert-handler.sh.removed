#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# B-NEW-46 — Reproducible deploy of langston-alert-handler.sh to Helsinki.
#
# Avoids the "scp from laptop and pray" mode that bit B-NEW-45 (Langston Q1).
# Run from any machine with SSH access to the Helsinki agent box.
#
#   bash infra/helsinki/deploy-langston-alert-handler.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HELSINKI=root@204.168.141.77
SRC="$(cd "$(dirname "$0")" && pwd)/langston-alert-handler.sh"
DEST=/usr/local/bin/langston-alert-handler.sh

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: source not found at $SRC" >&2
  exit 1
fi

echo "Deploying $SRC -> $HELSINKI:$DEST"
# Strip any CR (Windows CRLF line endings) on the way over so the remote bash
# doesn't choke on `\r` — the source may be edited on a Windows mirror.
# Owner root, group langston, mode 750: the dispatcher runs this via
# `sudo -u langston`, so langston must be able to execute it. root:root + 750
# would put langston in "others" (no x) → setsid Permission denied. root:langston
# + 750 lets langston execute via the group bit while keeping it non-world.
tr -d '\r' < "$SRC" | ssh "$HELSINKI" "cat > '$DEST' && chown root:langston '$DEST' && chmod 750 '$DEST' && bash -n '$DEST' && echo 'deployed + syntax-OK: '\$(ls -la '$DEST')"
