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
scp "$SRC" "$HELSINKI:$DEST"
ssh "$HELSINKI" "chmod 750 '$DEST' && chown root:root '$DEST' && bash -n '$DEST' && echo 'deployed + syntax-OK: '\$(ls -la '$DEST')"
