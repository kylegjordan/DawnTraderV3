#!/usr/bin/env bash
set -euo pipefail

TARGET=${1:?target host required}
COUNT=${2:-6}
[[ $COUNT =~ ^[0-9]+$ ]] && ((COUNT >= 6)) || { echo 'count must be at least maxretry+1 (6)' >&2; exit 64; }

private_dir=$(mktemp -d)
cleanup() { rm -rf -- "$private_dir"; }
trap cleanup EXIT
chmod 0700 "$private_dir"
ssh-keygen -q -t ed25519 -N '' -f "$private_dir/disposable" -C dawntrader-fail2ban-proof

for ((attempt=1; attempt<=COUNT; attempt++)); do
  ssh -F /dev/null -i "$private_dir/disposable" -o IdentityAgent=none -o IdentitiesOnly=yes \
    -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o BatchMode=yes \
    -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=4 \
    "dawntrader-invalid-user@$TARGET" true >/dev/null 2>&1 || true
done
echo "INVALID_ATTEMPTS_SENT target=$TARGET count=$COUNT"
