#!/usr/bin/env bash
set -euo pipefail

TARGET=/etc/ssh/sshd_config.d/10-dawntrader-key-only.conf
BACKUP_BASE=/var/backups/dawntrader-ssh
SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=$SOURCE_DIR/10-dawntrader-key-only.conf
ACTION=${1:-}
shift || true

LAPTOP_ADDRESS=
PEER_ADDRESS=
STATE_DIR=
while (($#)); do
  case "$1" in
    --laptop-address) LAPTOP_ADDRESS=${2:?}; shift 2 ;;
    --peer-address) PEER_ADDRESS=${2:?}; shift 2 ;;
    --state-dir) STATE_DIR=${2:?}; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo 'run as root' >&2; exit 77; }

require_addresses() {
  [[ -n $LAPTOP_ADDRESS && -n $PEER_ADDRESS ]] || {
    echo '--laptop-address and --peer-address are required' >&2
    exit 64
  }
}

effective_value() {
  local user=$1 address=$2 key=$3
  /usr/sbin/sshd -T -C "user=$user,host=$(hostname -f),addr=$address" |
    awk -v wanted="$key" '$1 == wanted { print $2; found=1 } END { if (!found) exit 1 }'
}

verify_context() {
  local user=$1 address=$2
  [[ $(effective_value "$user" "$address" passwordauthentication) == no ]]
  [[ $(effective_value "$user" "$address" kbdinteractiveauthentication) == no ]]
  [[ $(effective_value "$user" "$address" pubkeyauthentication) == yes ]]
  if [[ $user == root ]]; then
    [[ $(effective_value "$user" "$address" permitrootlogin) == prohibit-password ]]
  fi
  printf 'CONTEXT_OK user=%s address=%s\n' "$user" "$address"
}

verify_all() {
  require_addresses
  /usr/sbin/sshd -t
  systemctl show ssh.service -p ExecStart -p FragmentPath --no-pager
  ss -ltnp '( sport = :22 )'
  [[ -r /etc/ssh/sshd_config && -d /etc/ssh/sshd_config.d ]]
  set +e
  census=$(grep -RniE '^[[:space:]]*(Include|Match|AuthorizedKeysFile|AuthorizedKeysCommand|PasswordAuthentication|KbdInteractiveAuthentication|PubkeyAuthentication|PermitRootLogin)[[:space:]]' \
    /etc/ssh/sshd_config /etc/ssh/sshd_config.d)
  census_status=$?
  set -e
  ((census_status <= 1)) || { echo 'SSH configuration census failed to read its bounded sources' >&2; exit 1; }
  printf '%s\n' "$census"
  verify_context root "$LAPTOP_ADDRESS"
  verify_context root "$PEER_ADDRESS"
  verify_context langston 127.0.0.1
  verify_context coltrane 127.0.0.1
  verify_context nova 127.0.0.1
  verify_context sync 127.0.0.1
  [[ -f $TARGET ]]
  [[ $(sha256sum "$TARGET" | awk '{print $1}') == $(sha256sum "$SOURCE" | awk '{print $1}') ]]
  echo SSH_HARDENING_VERIFIED
}

case "$ACTION" in
  verify)
    verify_all
    ;;
  install)
    require_addresses
    [[ -f $SOURCE ]]
    session_count=$(ss -Htn state established '( sport = :22 )' | awk -v addr="$LAPTOP_ADDRESS" '$5 ~ ("^" addr ":[0-9]+$") {count++} END {print count+0}')
    ((session_count >= 2)) || {
      echo "need two established recovery sessions from $LAPTOP_ADDRESS; found $session_count" >&2
      exit 1
    }
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    STATE_DIR=$BACKUP_BASE/$stamp
    install -d -o root -g root -m 0700 "$STATE_DIR"
    if [[ -e $TARGET ]]; then
      cp -a -- "$TARGET" "$STATE_DIR/original.conf"
      : > "$STATE_DIR/had-target"
    fi
    sha256sum "$SOURCE" > "$STATE_DIR/source.sha256"
    install -o root -g root -m 0644 "$SOURCE" "$TARGET"
    if ! /usr/sbin/sshd -t; then
      if [[ -f $STATE_DIR/had-target ]]; then cp -a -- "$STATE_DIR/original.conf" "$TARGET"; else rm -f -- "$TARGET"; fi
      /usr/sbin/sshd -t
      echo 'syntax failed; original state restored before reload' >&2
      exit 1
    fi
    systemctl reload ssh.service
    verify_all
    printf 'SSH_HARDENING_INSTALLED state=%s held_sessions=%s\n' "$STATE_DIR" "$session_count"
    ;;
  rollback)
    require_addresses
    [[ -n $STATE_DIR ]] || { echo '--state-dir is required for rollback' >&2; exit 64; }
    resolved=$(realpath -e -- "$STATE_DIR")
    [[ $resolved == "$BACKUP_BASE"/* ]] || { echo 'rollback state is outside the bounded backup root' >&2; exit 1; }
    if [[ -f $resolved/had-target ]]; then
      [[ -f $resolved/original.conf ]]
      cp -a -- "$resolved/original.conf" "$TARGET"
    else
      rm -f -- "$TARGET"
    fi
    /usr/sbin/sshd -t
    systemctl reload ssh.service
    echo SSH_HARDENING_ROLLED_BACK
    ;;
  *)
    echo 'usage: manage-ssh-hardening.sh install|verify|rollback --laptop-address IP --peer-address IP [--state-dir DIR]' >&2
    exit 64
    ;;
esac
