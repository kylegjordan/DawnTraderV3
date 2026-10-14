#!/usr/bin/env bash
set -euo pipefail

TARGET=/etc/fail2ban/jail.d/dawntrader-sshd.local
BACKUP_BASE=/var/backups/dawntrader-fail2ban
PINNED_VERSION=1.0.2-3ubuntu0.1
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=$SOURCE_DIR/dawntrader-sshd.local
ACTION=${1:-}
shift || true
STATE_DIR=
LAPTOP_ADDRESS=
PEER_ADDRESS=
while (($#)); do
  case "$1" in
    --state-dir) STATE_DIR=${2:?}; shift 2 ;;
    --laptop-address) LAPTOP_ADDRESS=${2:?}; shift 2 ;;
    --peer-address) PEER_ADDRESS=${2:?}; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo 'run as root' >&2; exit 77; }

require_addresses() {
  [[ $LAPTOP_ADDRESS =~ ^[0-9a-fA-F:.]+$ && $PEER_ADDRESS =~ ^[0-9a-fA-F:.]+$ ]] || {
    echo '--laptop-address and --peer-address must be literal IP addresses' >&2
    exit 64
  }
  [[ $LAPTOP_ADDRESS != "$PEER_ADDRESS" ]] || { echo 'laptop and peer addresses must differ' >&2; exit 64; }
}

render_config() {
  sed "s/__LAPTOP_ADDRESS__/$LAPTOP_ADDRESS/g" "$SOURCE"
}

verify_filter_positive_control() {
  local output matched
  output=$(fail2ban-regex systemd-journal sshd)
  matched=$(sed -nE 's/.* ([0-9]+) matched.*/\1/p' <<<"$output" | tail -n 1)
  [[ -n $matched && $matched -gt 0 ]] || {
    echo 'the real SSH journal produced no fail2ban filter match; positive control failed' >&2
    exit 1
  }
  printf 'FILTER_MATCH_POSITIVE_CONTROL matched=%s\n' "$matched"
}

verify() {
  require_addresses
  [[ $(dpkg-query -W -f='${Version}' fail2ban) == "$PINNED_VERSION" ]]
  fail2ban-client -t
  systemctl is-enabled --quiet fail2ban.service
  systemctl is-active --quiet fail2ban.service
  fail2ban-client status sshd
  [[ $(fail2ban-client get sshd bantime) == 600 ]]
  [[ $(fail2ban-client get sshd findtime) == 600 ]]
  [[ $(fail2ban-client get sshd maxretry) == 5 ]]
  fail2ban-client get sshd journalmatch | grep -Eq '_COMM=sshd|_SYSTEMD_UNIT=ssh\.service'
  ignore_set=$(fail2ban-client get sshd ignoreip)
  grep -Fwq "$LAPTOP_ADDRESS" <<<"$ignore_set"
  ! grep -Fwq "$PEER_ADDRESS" <<<"$ignore_set"
  verify_filter_positive_control
  diff -u <(render_config) "$TARGET"
  echo FAIL2BAN_SSHD_VERIFIED
}

case "$ACTION" in
  verify)
    verify
    ;;
  install)
    require_addresses
    [[ -f $SOURCE ]]
    available=$(apt-cache policy fail2ban | awk '/Candidate:/ {print $2}')
    [[ $available == "$PINNED_VERSION" ]] || {
      echo "pinned fail2ban version unavailable: expected $PINNED_VERSION, candidate $available" >&2
      exit 1
    }
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    STATE_DIR=$BACKUP_BASE/$stamp
    install -d -o root -g root -m 0700 "$STATE_DIR"
    if dpkg-query -W fail2ban >/dev/null 2>&1; then
      dpkg-query -W -f='${Version}\n' fail2ban > "$STATE_DIR/original-version"
    fi
    if systemctl is-enabled --quiet fail2ban.service; then : > "$STATE_DIR/was-enabled"; fi
    if [[ -e $TARGET ]]; then cp -a -- "$TARGET" "$STATE_DIR/original.local"; : > "$STATE_DIR/had-target"; fi
    DEBIAN_FRONTEND=noninteractive apt-get install -y "fail2ban=$PINNED_VERSION"
    render_config > "$STATE_DIR/rendered.local"
    install -o root -g root -m 0644 "$STATE_DIR/rendered.local" "$TARGET"
    fail2ban-client -t
    systemctl enable --now fail2ban.service
    systemctl restart fail2ban.service
    verify
    printf 'FAIL2BAN_INSTALLED state=%s version=%s\n' "$STATE_DIR" "$PINNED_VERSION"
    ;;
  rollback)
    [[ -n $STATE_DIR ]] || { echo '--state-dir is required for rollback' >&2; exit 64; }
    resolved=$(realpath -e -- "$STATE_DIR")
    [[ $resolved == "$BACKUP_BASE"/* ]] || { echo 'rollback state is outside the bounded backup root' >&2; exit 1; }
    if systemctl is-active --quiet fail2ban.service; then
      fail2ban-client set sshd unbanip --all >/dev/null
    fi
    if [[ -f $resolved/had-target ]]; then
      cp -a -- "$resolved/original.local" "$TARGET"
    else
      rm -f -- "$TARGET"
    fi
    if [[ -f $resolved/original-version ]]; then
      original_version=$(cat "$resolved/original-version")
      DEBIAN_FRONTEND=noninteractive apt-get install -y "fail2ban=$original_version"
      fail2ban-client -t
      systemctl restart fail2ban.service
      if [[ ! -f $resolved/was-enabled ]]; then systemctl disable fail2ban.service; fi
    else
      systemctl disable --now fail2ban.service
      DEBIAN_FRONTEND=noninteractive apt-get remove -y fail2ban
    fi
    echo FAIL2BAN_ROLLED_BACK
    ;;
  *)
    echo 'usage: manage-fail2ban.sh install|verify --laptop-address IP --peer-address IP | rollback --state-dir DIR' >&2
    exit 64
    ;;
esac
