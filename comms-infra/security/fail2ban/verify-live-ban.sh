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

ruleset_contains() {
  local ruleset=$1 address=$2
  grep -Fw "$address" "$ruleset" >/dev/null
}

if [[ $ACTION == self-test ]]; then
  temp=$(mktemp -d)
  trap 'rm -rf -- "$temp"' EXIT
  for i in $(seq 1 10000); do printf 'unrelated rule %s\n' "$i"; done > "$temp/ruleset"
  printf 'ip saddr 192.0.2.44 drop\n' >> "$temp/ruleset"
  ruleset_contains "$temp/ruleset" 192.0.2.44
  ! ruleset_contains "$temp/ruleset" 192.0.2.45
  if ! ruleset_contains "$temp/ruleset" 192.0.2.44; then
    echo 'mutation failure: a present peer was accepted as absent' >&2
    exit 1
  fi
  echo LIVE_BAN_RULESET_SELF_TEST_OK
  exit 0
fi

[[ $EUID -eq 0 ]] || { echo 'run as root' >&2; exit 77; }
[[ -n $PEER_ADDRESS && -n $LAPTOP_ADDRESS ]] || { echo 'both source addresses are required' >&2; exit 64; }

ruleset=$(mktemp)
trap 'rm -f -- "$ruleset"' EXIT
capture_ruleset() {
  nft list ruleset > "$ruleset"
}

banned=$(fail2ban-client get sshd banip)
case "$ACTION" in
  status)
    grep -Fwq "$PEER_ADDRESS" <<<"$banned"
    ! grep -Fwq "$LAPTOP_ADDRESS" <<<"$banned"
    capture_ruleset
    ruleset_contains "$ruleset" "$PEER_ADDRESS"
    printf 'LIVE_BAN_OBSERVED peer=%s laptop_unbanned=%s\n' "$PEER_ADDRESS" "$LAPTOP_ADDRESS"
    ;;
  unban)
    fail2ban-client set sshd unbanip "$PEER_ADDRESS"
    banned=$(fail2ban-client get sshd banip)
    ! grep -Fwq "$PEER_ADDRESS" <<<"$banned"
    capture_ruleset
    ! ruleset_contains "$ruleset" "$PEER_ADDRESS"
    printf 'LIVE_BAN_REMOVED peer=%s\n' "$PEER_ADDRESS"
    ;;
  *) echo 'usage: verify-live-ban.sh status|unban --peer-address IP --laptop-address IP' >&2; exit 64 ;;
esac
