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

require_addresses() {
  [[ $LAPTOP_ADDRESS =~ ^[0-9a-fA-F:.]+$ && $PEER_ADDRESS =~ ^[0-9a-fA-F:.]+$ ]] || {
    echo '--laptop-address and --peer-address must be literal IP addresses' >&2
    exit 64
  }
  [[ $LAPTOP_ADDRESS != "$PEER_ADDRESS" ]] || { echo 'laptop and peer addresses must differ' >&2; exit 64; }
}

held_laptop_sessions() {
  ss -Htn state established '( sport = :22 )' |
    count_laptop_sessions "$LAPTOP_ADDRESS"
}

count_laptop_sessions() {
  local address=$1
  awk -v addr="$address" '
    {
      peer=$4
      if (substr(peer, 1, length(addr) + 1) == addr ":" ||
          substr(peer, 1, length(addr) + 3) == "[" addr "]:") count++
    }
    END { print count + 0 }
  '
}

render_config() {
  sed "s/__LAPTOP_ADDRESS__/$LAPTOP_ADDRESS/g" "$SOURCE"
}

package_snapshot() {
  dpkg-query -W -f='${binary:Package}\t${Version}\n' | LC_ALL=C sort
}

existing_dependency_transitions() {
  awk '
    $1 == "Inst" && $3 ~ /^\[/ {
      package=$2
      sub(/:.*/, "", package)
      if (package != "fail2ban") print $0
    }
  '
}

ban_snapshot() {
  fail2ban-client get sshd banip | tr ' ' '\n' | sed '/^$/d' | LC_ALL=C sort -u
}

reconcile_bans() {
  local prior=$1 current extra missing address
  current=$(mktemp)
  extra=$(mktemp)
  missing=$(mktemp)
  ban_snapshot > "$current"
  comm -13 "$prior" "$current" > "$extra"
  comm -23 "$prior" "$current" > "$missing"
  while IFS= read -r address; do [[ -z $address ]] || fail2ban-client set sshd unbanip "$address" >/dev/null; done < "$extra"
  while IFS= read -r address; do [[ -z $address ]] || fail2ban-client set sshd banip "$address" >/dev/null; done < "$missing"
  ban_snapshot > "$current"
  local result=0
  cmp -s "$prior" "$current" || result=$?
  rm -f -- "$current" "$extra" "$missing"
  return "$result"
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

if [[ $ACTION == self-test ]]; then
  temp=$(mktemp -d)
  trap 'rm -rf -- "$temp"' EXIT
  printf '%s\n' 10.0.0.1 10.0.0.2 > "$temp/prior"
  printf '%s\n' 10.0.0.1 10.0.0.2 10.0.0.3 > "$temp/current"
  comm -13 "$temp/prior" "$temp/current" > "$temp/extra"
  comm -23 "$temp/prior" "$temp/current" > "$temp/missing"
  [[ $(cat "$temp/extra") == 10.0.0.3 && ! -s $temp/missing ]]
  printf '%s\n' 10.0.0.2 > "$temp/current"
  comm -13 "$temp/prior" "$temp/current" > "$temp/extra"
  comm -23 "$temp/prior" "$temp/current" > "$temp/missing"
  [[ ! -s $temp/extra && $(cat "$temp/missing") == 10.0.0.1 ]]
  sample_sessions=$'0 0 10.0.0.5:22 83.25.118.232:53001\n0 0 [2001:db8::5]:22 [2001:db8::9]:53002\n0 0 10.0.0.5:22 192.0.2.1:53003'
  [[ $(count_laptop_sessions 83.25.118.232 <<<"$sample_sessions") == 1 ]]
  [[ $(count_laptop_sessions 2001:db8::9 <<<"$sample_sessions") == 1 ]]
  safe_simulation=$'Inst fail2ban [1.0.2-2] (1.0.2-3ubuntu0.1 Ubuntu:24.04/noble-updates [all])\nInst python3-pyinotify (0.9.6-3 Ubuntu:24.04/noble [all])'
  [[ -z $(existing_dependency_transitions <<<"$safe_simulation") ]]
  unsafe_simulation=$'Inst fail2ban [1.0.2-2] (1.0.2-3ubuntu0.1 Ubuntu:24.04/noble-updates [all])\nInst python3-systemd [234-3build3] (235-1 Ubuntu:24.04/noble-updates [amd64])'
  [[ $(existing_dependency_transitions <<<"$unsafe_simulation") == Inst\ python3-systemd* ]]
  echo FAIL2BAN_STATE_SELF_TEST_OK
  exit 0
fi

[[ $EUID -eq 0 ]] || { echo 'run as root' >&2; exit 77; }

case "$ACTION" in
  verify)
    verify
    ;;
  install)
    require_addresses
    [[ -f $SOURCE ]]
    session_count=$(held_laptop_sessions)
    ((session_count >= 2)) || {
      echo "need two established authenticated recovery sessions from $LAPTOP_ADDRESS; found $session_count" >&2
      exit 1
    }
    available=$(apt-cache policy fail2ban | awk '/Candidate:/ {print $2}')
    [[ $available == "$PINNED_VERSION" ]] || {
      echo "pinned fail2ban version unavailable: expected $PINNED_VERSION, candidate $available" >&2
      exit 1
    }
    simulation=$(apt-get -s install --allow-downgrades "fail2ban=$PINNED_VERSION")
    if grep -Eq '^Remv ' <<<"$simulation"; then
      echo 'fail2ban package transaction would remove a package; refusing' >&2
      exit 1
    fi
    dependency_transitions=$(existing_dependency_transitions <<<"$simulation")
    if [[ -n $dependency_transitions ]]; then
      echo 'fail2ban package transaction would change an existing dependency; refusing before mutation:' >&2
      printf '%s\n' "$dependency_transitions" >&2
      exit 1
    fi
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    STATE_DIR=$BACKUP_BASE/$stamp
    install -d -o root -g root -m 0700 "$STATE_DIR"
    package_snapshot > "$STATE_DIR/packages.before"
    if dpkg-query -W fail2ban >/dev/null 2>&1; then
      dpkg-query -W -f='${Version}\n' fail2ban > "$STATE_DIR/original-version"
    fi
    systemctl is-enabled fail2ban.service > "$STATE_DIR/enabled.before" 2>&1 || true
    systemctl is-active fail2ban.service > "$STATE_DIR/active.before" 2>&1 || true
    if systemctl is-active --quiet fail2ban.service && fail2ban-client status sshd >/dev/null 2>&1; then
      ban_snapshot > "$STATE_DIR/bans.before"
    else
      : > "$STATE_DIR/bans.before"
    fi
    if [[ -e $TARGET ]]; then cp -a -- "$TARGET" "$STATE_DIR/original.local"; : > "$STATE_DIR/had-target"; fi
    DEBIAN_FRONTEND=noninteractive apt-get install --allow-downgrades -y "fail2ban=$PINNED_VERSION"
    package_snapshot > "$STATE_DIR/packages.after"
    comm -13 <(cut -f1 "$STATE_DIR/packages.before") <(cut -f1 "$STATE_DIR/packages.after") > "$STATE_DIR/added-packages"
    render_config > "$STATE_DIR/rendered.local"
    install -o root -g root -m 0644 "$STATE_DIR/rendered.local" "$TARGET"
    fail2ban-client -t
    systemctl enable --now fail2ban.service
    systemctl restart fail2ban.service
    verify
    printf 'FAIL2BAN_INSTALLED state=%s version=%s held_sessions=%s\n' "$STATE_DIR" "$PINNED_VERSION" "$session_count"
    ;;
  rollback)
    [[ -n $STATE_DIR ]] || { echo '--state-dir is required for rollback' >&2; exit 64; }
    resolved=$(realpath -e -- "$STATE_DIR")
    [[ $resolved == "$BACKUP_BASE"/* ]] || { echo 'rollback state is outside the bounded backup root' >&2; exit 1; }
    for required in packages.before enabled.before active.before bans.before added-packages; do
      [[ -f $resolved/$required ]] || { echo "rollback state missing $required" >&2; exit 1; }
    done

    if [[ -f $resolved/had-target ]]; then
      [[ -f $resolved/original.local ]]
      cp -a -- "$resolved/original.local" "$TARGET"
    else
      rm -f -- "$TARGET"
    fi

    if [[ -f $resolved/original-version ]]; then
      original_version=$(cat "$resolved/original-version")
      DEBIAN_FRONTEND=noninteractive apt-get install --allow-downgrades -y "fail2ban=$original_version"
      fail2ban-client -t
      if [[ $(cat "$resolved/active.before") == active ]]; then
        systemctl restart fail2ban.service
        if fail2ban-client status sshd >/dev/null 2>&1; then reconcile_bans "$resolved/bans.before"; fi
      else
        systemctl stop fail2ban.service
      fi
      if [[ $(cat "$resolved/enabled.before") == enabled ]]; then
        systemctl enable fail2ban.service
      else
        systemctl disable fail2ban.service
      fi
    else
      systemctl disable --now fail2ban.service || true
      mapfile -t added < "$resolved/added-packages"
      if ((${#added[@]})); then
        DEBIAN_FRONTEND=noninteractive apt-get purge -y "${added[@]}"
      fi
    fi

    package_snapshot > "$resolved/packages.restored"
    cmp -s "$resolved/packages.before" "$resolved/packages.restored" || {
      echo 'rollback package inventory differs from the captured pre-state' >&2
      exit 1
    }
    [[ $(systemctl is-enabled fail2ban.service 2>&1 || true) == "$(cat "$resolved/enabled.before")" ]]
    [[ $(systemctl is-active fail2ban.service 2>&1 || true) == "$(cat "$resolved/active.before")" ]]
    if [[ -f $resolved/had-target ]]; then
      cmp -s "$resolved/original.local" "$TARGET"
    else
      [[ ! -e $TARGET ]]
    fi
    echo FAIL2BAN_ROLLED_BACK_EXACT
    ;;
  *)
    echo 'usage: manage-fail2ban.sh install|verify --laptop-address IP --peer-address IP | rollback --state-dir DIR | self-test' >&2
    exit 64
    ;;
esac
