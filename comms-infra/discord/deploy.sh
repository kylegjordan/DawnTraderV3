#!/usr/bin/env bash
# deploy.sh — install the Helsinki comms estate (204.168.141.77) FROM A REVIEWED SHA. Root.
#
#   deploy.sh --sha <40-hex reviewed sha> [--only <group>[,<group>...]]
#   groups: bridges  the two Discord bridges, their modules, units and drop-in
#           notices  cc-send, dt-push-notice.sh, dt-deploy-drift.sh (+ its log, state, cron)
#           readers  dt-review, dt-backup-sync.sh (+ the shared fetch lock, log, cron)
#   default: all three.
#
# The installer itself comes from the same sha, so no step runs hand-copied code:
#   bash <(git --git-dir=/srv/dawntrader-backup.git cat-file blob <sha>:comms-infra/discord/deploy.sh) \
#     --sha <sha> --only readers
# (Process substitution, NOT `| bash -s`: under -s the script IS stdin, and any command in it
# that reads stdin would swallow the rest of the script.)
#
# ⛔ WHY IT TAKES A SHA (B-CREDENTIALS-PRIVATE-REPO GB-1, #1004). It used to install WHATEVER
# had been copied into /opt/discord-bridges, checking only that the files were present. That
# is how #1008's fix was committed, reviewed, and never installed: nothing tied the installed
# bytes to a reviewed commit. Now every file is read out of the mirror AT THE SHA, the sha must
# be on migration/aws-supabase, and after install EVERY installed file is hashed against its
# blob at that sha. A mismatch fails the run and names the file (exit 3).
# ⛔ --only EXISTS FOR ORDER CONSTRAINTS, not convenience: a reviewed change can be safe to
# install only together with another (GB-8 — #1008's push-notice code goes live only with its
# own-cache fetch). Installing a group installs ALL of that group, from the one sha.
#
# PREREQUISITE (Kyle, for the bridges group): the token env files + the IDs config exist:
#   /etc/langston/discord-cc-bot.env, /etc/langston/discord-langston-bot.env,
#   /etc/dawntrader/discord-comms.env (from discord-comms.env.template)
set -euo pipefail

MIRROR=/srv/dawntrader-backup.git
BRANCH=migration/aws-supabase
BRIDGE_DIR=/opt/discord-bridges
VENV="$BRIDGE_DIR/venv"
UNITS=/etc/systemd/system

# group|repo path|install target|mode — the ONE list. Nothing is installed that is not here,
# and everything here is verified after install.
MANIFEST="
bridges|comms-infra/discord/discord-cc-bridge.py|$BRIDGE_DIR/discord-cc-bridge.py|0755
bridges|comms-infra/discord/discord-langston-bridge.py|$BRIDGE_DIR/discord-langston-bridge.py|0755
bridges|comms-infra/discord/discord_common.py|$BRIDGE_DIR/discord_common.py|0644
bridges|comms-infra/discord/gateway_watchdog.py|$BRIDGE_DIR/gateway_watchdog.py|0644
bridges|comms-infra/discord/langston_queue.py|$BRIDGE_DIR/langston_queue.py|0644
bridges|comms-infra/discord/bridge-failed-notify.sh|$BRIDGE_DIR/bridge-failed-notify.sh|0755
bridges|comms-infra/discord/discord-cc-bridge.service|$UNITS/discord-cc-bridge.service|0644
bridges|comms-infra/discord/discord-langston-bridge.service|$UNITS/discord-langston-bridge.service|0644
bridges|comms-infra/discord/discord-langston-bridge.service.d/self-advance.conf|$UNITS/discord-langston-bridge.service.d/self-advance.conf|0644
bridges|comms-infra/discord/discord-bridge-failed-notify@.service|$UNITS/discord-bridge-failed-notify@.service|0644
notices|comms-infra/discord/cc-send|/usr/local/bin/cc-send|0755
notices|comms-infra/discord/dt-push-notice.sh|/usr/local/bin/dt-push-notice.sh|0755
notices|comms-infra/discord/dt-deploy-drift.sh|/usr/local/bin/dt-deploy-drift.sh|0755
readers|comms-infra/helsinki/dt-review|/usr/local/bin/dt-review|0755
readers|comms-infra/helsinki/dt-backup-sync.sh|/usr/local/bin/dt-backup-sync.sh|0755
"

die() { echo "deploy.sh: $*" >&2; exit 2; }
git_m() { git -c safe.directory="$MIRROR" --git-dir="$MIRROR" "$@"; }

# ---- 0. arguments -------------------------------------------------------------------
SHA=
ONLY=bridges,notices,readers
while [ $# -gt 0 ]; do
  case "$1" in
    --sha)  [ $# -ge 2 ] || die "--sha needs a value"; SHA=$2; shift 2 ;;
    --only) [ $# -ge 2 ] || die "--only needs a value"; ONLY=$2; shift 2 ;;
    *)      die "unknown argument '$1' (usage: deploy.sh --sha <40-hex> [--only bridges,notices,readers])" ;;
  esac
done
[ "$(id -u)" -eq 0 ] || die "run as root"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "--sha must be the FULL 40-hex reviewed sha (got '$SHA')"
IFS=, read -r -a GROUPS_WANTED <<< "$ONLY"
for g in "${GROUPS_WANTED[@]}"; do
  case "$g" in bridges|notices|readers) ;; *) die "unknown group '$g'" ;; esac
done
want() { local g; for g in "${GROUPS_WANTED[@]}"; do [ "$g" = "$1" ] && return 0; done; return 1; }

# ---- 1. the sha: in the mirror, and on the review branch ------------------------------
git_m cat-file -e "$SHA^{commit}" \
  || die "$SHA is not in the mirror yet — wait for the */15 dt-backup-sync run, then re-run"
if ! git_m merge-base --is-ancestor "$SHA" "refs/heads/$BRANCH"; then
  die "$SHA is not on $BRANCH — only reviewed commits on the review branch are installed"
fi

# ---- 2. PRE-FLIGHT: stage every selected file BEFORE touching anything ------------------
# (#995 OBJ-9: under set -e a missing file used to abort MID-DEPLOY, after /usr/local/bin was
# written and before the units and the self-advance drop-in were reinstalled — which silently
# reverted the watchdog. Every file is read out of the sha first; a miss changes nothing.)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
SELECTED=()
MISSING=""
while IFS='|' read -r grp path target mode; do
  [ -n "$grp" ] || continue
  want "$grp" || continue
  SELECTED+=("$grp|$path|$target|$mode")
  mkdir -p "$STAGE/$(dirname "$path")"
  if ! git_m cat-file blob "$SHA:$path" > "$STAGE/$path"; then
    MISSING="$MISSING\n  - $path"
  fi
done <<< "$MANIFEST"
if [ -n "$MISSING" ]; then
  printf "== PRE-FLIGHT FAILED — nothing has been changed. Not at %s:%b\n" "$SHA" "$MISSING" >&2
  exit 2
fi
if want bridges; then
  git_m cat-file blob "$SHA:comms-infra/discord/comms-active.env" > "$STAGE/comms-active.env" \
    || { echo "== PRE-FLIGHT FAILED — comms-active.env not at $SHA; nothing changed" >&2; exit 2; }
  for f in /etc/langston/discord-cc-bot.env /etc/langston/discord-langston-bot.env /etc/dawntrader/discord-comms.env; do
    [ -f "$f" ] || { echo "== PRE-FLIGHT FAILED — MISSING $f; provision before deploying bridges" >&2; exit 2; }
  done
  # CC_BOT_ID is hard-required (load_shared_config raises without it → both bridges crash-loop).
  for k in DISCORD_CHANNEL_ID KYLE_DISCORD_ID CC_BOT_ID; do
    grep -q "^${k}=" /etc/dawntrader/discord-comms.env \
      || { echo "== PRE-FLIGHT FAILED — MISSING $k in /etc/dawntrader/discord-comms.env" >&2; exit 2; }
  done
fi
echo "== pre-flight: ${#SELECTED[@]} files staged from $SHA (groups: $ONLY) =="

install_one() { # repo path, target, mode
  mkdir -p "$(dirname "$2")"
  install -m "$3" "$STAGE/$1" "$2"
}

# ---- 3. bridges ------------------------------------------------------------------------
if want bridges; then
  echo "== bridges: venv =="
  apt-get install -y python3-venv </dev/null >/dev/null 2>&1 || true
  mkdir -p "$BRIDGE_DIR"
  [ -d "$VENV" ] || python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install -U "discord.py>=2.3" >/dev/null
  echo "discord.py: $("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')"
  mkdir -p /etc/dawntrader
  [ -f /etc/dawntrader/comms-active.env ] || cp "$STAGE/comms-active.env" /etc/dawntrader/comms-active.env
fi

# ---- 4. install every selected file ------------------------------------------------------
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  install_one "$path" "$target" "$mode"
  echo "   installed $target"
done
# world-readable so the langston-user bridge service can import discord_common + the venv
if want bridges; then chmod -R a+rX "$BRIDGE_DIR"; fi

# ---- 5. per-group state ------------------------------------------------------------------
add_langston_cron() { # match, line
  if ! sudo -u langston crontab -l 2>/dev/null | grep -Fq "$1"; then
    ( sudo -u langston crontab -l 2>/dev/null; echo "$2" ) | sudo -u langston crontab -
    echo "   installed langston cron: $2"
  else
    echo "   langston cron already present for $1"
  fi
}

if want notices; then
  # dt-deploy-drift.sh runs hourly as langston (it needs that user's staging key), so its log
  # and its main-arm cap stamp directory must be langston-writable BEFORE the first run —
  # otherwise every line is a permission error and the cap silently never engages (#1002).
  touch /var/log/dt-deploy-drift.log
  chown langston:langston /var/log/dt-deploy-drift.log
  mkdir -p /var/lib/dt-deploy-drift
  chown langston:langston /var/lib/dt-deploy-drift
  add_langston_cron dt-deploy-drift.sh '17 * * * * /usr/local/bin/dt-deploy-drift.sh >/dev/null 2>&1'
fi

if want readers; then
  # The lock dt-review and dt-backup-sync.sh share, so their fetches never collide (A4).
  touch "$MIRROR/dt-fetch.lock"
  chown langston:langston "$MIRROR/dt-fetch.lock"
  touch /var/log/dt-backup-sync.log
  chown langston:langston /var/log/dt-backup-sync.log
  add_langston_cron dt-backup-sync.sh '*/15 * * * * /usr/local/bin/dt-backup-sync.sh >/dev/null 2>&1'
  # Langston decision 14 (A9): remove the PRODUCER of the stale refs/remotes/* entries (the
  # configured fetch refspec, which every opportunistic fetch followed and --prune never
  # covered), then delete the ones it left. Both fetchers use explicit refspecs.
  sudo -u langston git --git-dir="$MIRROR" config --unset-all remote.origin.fetch || true
  sudo -u langston git --git-dir="$MIRROR" for-each-ref --format='delete %(refname)' refs/remotes/ \
    | sudo -u langston git --git-dir="$MIRROR" update-ref --stdin
  echo "   mirror: fetch refspec dropped; refs/remotes/* now $(git_m for-each-ref refs/remotes/ | wc -l)"
fi

if want bridges; then
  systemctl daemon-reload
  systemctl enable --now discord-cc-bridge.service discord-langston-bridge.service
fi

# ---- 6. INSTALL-VERIFY GATE: every installed file equals its blob at the sha ---------------
BAD=""
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  want_blob=$(git_m rev-parse "$SHA:$path")
  got_blob=$(git hash-object "$target")
  got_mode=$(stat -c %a "$target")
  if [ "$got_blob" != "$want_blob" ] || [ "0$got_mode" != "$mode" ]; then
    BAD="$BAD\n  - $target: blob $got_blob mode $got_mode, want $want_blob mode $mode ($path)"
  fi
done
if [ -n "$BAD" ]; then
  printf "== INSTALL-VERIFY FAILED at %s:%b\n" "$SHA" "$BAD" >&2
  exit 3
fi
echo "== install-verify: all ${#SELECTED[@]} installed files equal their blobs at $SHA =="

if want bridges; then
  echo "== bridges: status =="
  # deploy.sh never restarts a running bridge: new bridge code takes effect on an explicit
  # `systemctl restart`, done in a window with no queued Langston review.
  sleep 8
  systemctl is-active discord-cc-bridge.service discord-langston-bridge.service || true
fi
echo "Done: $ONLY at $SHA."
