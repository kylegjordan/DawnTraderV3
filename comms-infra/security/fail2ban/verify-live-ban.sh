#!/usr/bin/env bash
set -euo pipefail

PEER_ADDRESS=
LAPTOP_ADDRESS=
ACTION=${1:-status}
shift || true
while (($#)); do
  case "$1" in
    --peer-address) PEER_ADDRESS=${2:?}; shift 2 ;;
    --laptop-address) LAPTOP_ADDRESS=${2:?}; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
[[ $EUID -eq 0 ]] || { echo 'run as root' >&2; exit 77; }
[[ -n $PEER_ADDRESS && -n $LAPTOP_ADDRESS ]] || { echo 'both source addresses are required' >&2; exit 64; }

banned=$(fail2ban-client get sshd banip)
case "$ACTION" in
  status)
    grep -Fwq "$PEER_ADDRESS" <<<"$banned"
    ! grep -Fwq "$LAPTOP_ADDRESS" <<<"$banned"
    nft list ruleset | grep -Fwq "$PEER_ADDRESS"
    printf 'LIVE_BAN_OBSERVED peer=%s laptop_unbanned=%s\n' "$PEER_ADDRESS" "$LAPTOP_ADDRESS"
    ;;
  unban)
    fail2ban-client set sshd unbanip "$PEER_ADDRESS"
    banned=$(fail2ban-client get sshd banip)
    ! grep -Fwq "$PEER_ADDRESS" <<<"$banned"
    ! nft list ruleset | grep -Fwq "$PEER_ADDRESS"
    printf 'LIVE_BAN_REMOVED peer=%s\n' "$PEER_ADDRESS"
    ;;
  *) echo 'usage: verify-live-ban.sh status|unban --peer-address IP --laptop-address IP' >&2; exit 64 ;;
esac
