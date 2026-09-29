#!/usr/bin/env bash
# deploy.sh — install the Helsinki comms estate (204.168.141.77) FROM A REVIEWED SHA. Root.
#
#   deploy.sh --sha <40-hex reviewed sha> [--only <group>[,<group>...]]
#   groups: bridges  the two Discord bridges, their modules, units, drop-in, crew-status-post
#           notices  cc-send, dt-push-notice.sh, dt-deploy-drift.sh (+ its log, state, cron)
#           readers  dt-review, dt-backup-sync.sh (+ their log, cron; the mirror's refspec)
#   default: all three.
#
# HOW TO RUN IT — the installer must itself be the reviewed copy, so it is brought from a
# machine that holds the reviewed sha (GitHub is the source of truth), checked, then run:
#   laptop:   git show <sha>:comms-infra/discord/deploy.sh > deploy-<sha>.sh
#             git rev-parse <sha>:comms-infra/discord/deploy.sh          # note this blob id
#   copy it to /root/deploy-<sha>.sh on the box, then as root:
#             git hash-object /root/deploy-<sha>.sh                       # must equal the blob id
#             bash /root/deploy-<sha>.sh --sha <sha> --only readers
# The script also refuses to run unless its own bytes equal deploy.sh at --sha (read through
# the verified walk below), so an old or hand-edited installer cannot install a new sha.
#
# ⛔ WHY IT TAKES A SHA (B-CREDENTIALS-PRIVATE-REPO GB-1, #1004). It used to install WHATEVER
# had been copied into /opt/discord-bridges, checking only that files were present. That is
# how #1008's fix was committed, reviewed and never installed, and how B-LANGSTON-QUEUE-2's
# langston_queue.py ran for eleven weeks without ever being committed.
# ⛔ WHY IT RE-HASHES EVERY OBJECT (fresh-reader round, 2026-09-29). The mirror it reads is
# writable by the langston account, and until A11 is fixed most of its packs are owned by the
# coltrane account. Git does not re-verify an object's hash when it walks a tree or streams a
# blob, so a rewritten object would be installed and then "verified" against the same store.
# So: every object on the path commit -> trees -> blob is read AS LANGSTON and re-hashed HERE,
# as root, and must equal its id; the commit must equal --sha. Nothing is installed otherwise.
# Root never runs git inside that repository either: its config could run commands as root.
# ⛔ --only EXISTS FOR ORDER CONSTRAINTS, not convenience (GB-8: #1008's push-notice code goes
# live only with its own-cache fetch). A group always installs ALL of its files, from one sha.
#
# PREREQUISITE (Kyle, for the bridges group): the token env files + the IDs config exist:
#   /etc/langston/discord-cc-bot.env, /etc/langston/discord-langston-bot.env,
#   /etc/dawntrader/discord-comms.env (from discord-comms.env.template)
set -euo pipefail
cd /

MIRROR=/srv/dawntrader-backup.git
BRANCH=migration/aws-supabase
BRIDGE_DIR=/opt/discord-bridges
VENV="$BRIDGE_DIR/venv"
UNITS=/etc/systemd/system
SELF_PATH=comms-infra/discord/deploy.sh
SEED_PATH=comms-infra/discord/comms-active.env

# group|repo path|install target|mode — the ONE list. Nothing is installed that is not here,
# and everything here is verified after install. (Modes match the live files, 2026-09-29.)
MANIFEST="
bridges|comms-infra/discord/discord-cc-bridge.py|$BRIDGE_DIR/discord-cc-bridge.py|0755
bridges|comms-infra/discord/discord-langston-bridge.py|$BRIDGE_DIR/discord-langston-bridge.py|0755
bridges|comms-infra/discord/discord_common.py|$BRIDGE_DIR/discord_common.py|0755
bridges|comms-infra/discord/gateway_watchdog.py|$BRIDGE_DIR/gateway_watchdog.py|0755
bridges|comms-infra/discord/langston_queue.py|$BRIDGE_DIR/langston_queue.py|0755
bridges|comms-infra/discord/crew-status-post.py|$BRIDGE_DIR/crew-status-post.py|0755
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
# Every read of the mirror runs AS LANGSTON, from /.
git_l() { sudo -u langston git --git-dir="$MIRROR" "$@"; }

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
[ -f "$0" ] || die "run this script from a FILE (see HOW TO RUN IT), so its own bytes can be checked against $SELF_PATH at --sha"
IFS=, read -r -a GROUPS_WANTED <<< "$ONLY"
[ ${#GROUPS_WANTED[@]} -gt 0 ] || die "--only names no group"
for g in "${GROUPS_WANTED[@]}"; do
  case "$g" in bridges|notices|readers) ;; *) die "unknown group '$g'" ;; esac
done
want() { local g; for g in "${GROUPS_WANTED[@]}"; do [ "$g" = "$1" ] && return 0; done; return 1; }

# ---- 1. the sha: a commit in the mirror, and on the review branch ----------------------
t=$(git_l cat-file -t "$SHA" 2>&1) || {
  case "$t" in
    *"Not a valid object name"*|*"could not get object info"*)
      die "$SHA is not in the mirror yet — wait for the */15 dt-backup-sync run, then re-run" ;;
    *) die "cannot read $SHA in the mirror: $t" ;;
  esac
}
[ "$t" = commit ] || die "$SHA is a $t, not a commit"
rc=0; mb=$(git_l merge-base --is-ancestor "$SHA" "refs/heads/$BRANCH" 2>&1) || rc=$?
case $rc in
  0) ;;
  1) die "$SHA is not on $BRANCH — only reviewed commits on the review branch are installed" ;;
  *) die "could not tell whether $SHA is on $BRANCH (merge-base exit $rc): $mb" ;;
esac

# ---- 2. PRE-FLIGHT: read + VERIFY every selected file from the sha, before any change ----
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
SELECTED=()
PATHS=("$SELF_PATH")
while IFS='|' read -r grp path target mode; do
  [ -n "$grp" ] || continue
  want "$grp" || continue
  SELECTED+=("$grp|$path|$target|$mode")
  PATHS+=("$path")
done <<< "$MANIFEST"
if want bridges || want notices; then PATHS+=("$SEED_PATH"); fi

# The walk: commit (must hash to --sha) -> root tree -> each path component -> blob. Every
# object is read as langston and re-hashed by root; a mismatch or a missing path stops the run
# with nothing changed. Prints "<path> <blob id>" for each staged file.
python3 - "$MIRROR" "$SHA" "$STAGE" "${PATHS[@]}" > "$STAGE/.blobs" <<'PY' || { echo "== PRE-FLIGHT FAILED — nothing has been changed." >&2; exit 2; }
import hashlib, os, subprocess, sys
mirror, sha, stage = sys.argv[1:4]
paths = sys.argv[4:]
cat = subprocess.Popen(["sudo", "-u", "langston", "git", "--git-dir=" + mirror, "cat-file", "--batch"],
                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd="/")
def die(msg):
    sys.stderr.write("   " + msg + "\n")
    sys.exit(2)
cache = {}
def get(oid, want):
    if oid in cache:
        return cache[oid]
    cat.stdin.write((oid + "\n").encode()); cat.stdin.flush()
    hdr = cat.stdout.readline().decode().rstrip("\n").split(" ")
    if len(hdr) != 3:
        die("object %s: %s" % (oid, " ".join(hdr)))
    o, typ, size = hdr[0], hdr[1], int(hdr[2])
    data = cat.stdout.read(size); cat.stdout.read(1)
    if typ != want:
        die("object %s is a %s, expected a %s" % (oid, typ, want))
    got = hashlib.sha1(("%s %d\0" % (typ, size)).encode() + data).hexdigest()
    if got != oid:
        die("object %s (%s) re-hashes to %s: the mirror's copy is NOT the reviewed content" % (oid, typ, got))
    cache[oid] = data
    return data
def entries(tree):
    out, i = {}, 0
    while i < len(tree):
        sp = tree.index(b" ", i); nul = tree.index(b"\0", sp)
        out[tree[sp + 1:nul]] = (tree[i:sp].decode(), tree[nul + 1:nul + 21].hex())
        i = nul + 21
    return out
first = get(sha, "commit").split(b"\n", 1)[0]
if not first.startswith(b"tree "):
    die("commit %s has no tree line" % sha)
root = first[5:].decode()
bad = []
for path in paths:
    cur, comps = root, path.split("/")
    for k, c in enumerate(comps):
        ent = entries(get(cur, "tree")).get(c.encode())
        if ent is None:
            bad.append(path); break
        mode, oid = ent
        if k < len(comps) - 1:
            if mode != "40000":
                bad.append(path); break
            cur = oid
        else:
            if mode not in ("100644", "100755"):
                die("%s is not a regular file at %s (mode %s)" % (path, sha, mode))
            data = get(oid, "blob")
            dst = os.path.join(stage, path)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as f:
                f.write(data)
            print(path, oid)
if bad:
    die("not at %s: %s" % (sha, ", ".join(bad)))
PY
blob_of() { awk -v p="$1" '$1 == p {print $2}' "$STAGE/.blobs"; }

# The installer itself must be the copy at --sha.
SELF_WANT=$(blob_of "$SELF_PATH")
SELF_GOT=$(git hash-object "$0")
[ "$SELF_GOT" = "$SELF_WANT" ] || die "this installer ($0, blob $SELF_GOT) is not $SELF_PATH at $SHA (blob $SELF_WANT) — run the reviewed copy"

if want bridges; then
  for f in /etc/langston/discord-cc-bot.env /etc/langston/discord-langston-bot.env /etc/dawntrader/discord-comms.env; do
    [ -f "$f" ] || { echo "== PRE-FLIGHT FAILED — MISSING $f; provision before deploying bridges" >&2; exit 2; }
  done
  # CC_BOT_ID is hard-required (load_shared_config raises without it → both bridges crash-loop).
  for k in DISCORD_CHANNEL_ID KYLE_DISCORD_ID CC_BOT_ID; do
    grep -q "^${k}=" /etc/dawntrader/discord-comms.env \
      || { echo "== PRE-FLIGHT FAILED — MISSING $k in /etc/dawntrader/discord-comms.env" >&2; exit 2; }
  done
fi
echo "== pre-flight: ${#SELECTED[@]} files read from $SHA, every object re-hashed (groups: $ONLY) =="

# ---- 3. readers: the mirror's own state, BEFORE any file is installed -------------------
# As langston, under the lock both fetchers take, so it can neither collide with a fetch nor
# leave a half-installed host. flock creates the lock file AS LANGSTON: root never touches a
# path inside a directory another account can write (a symlink there would hand langston a
# root-owned file — the fresh-reader BLOCKER on the first version of this script).
if want readers; then
  sudo -u langston flock -w 300 "$MIRROR/dt-fetch.lock" sh -c '
    set -e
    M=$1
    rc=0; git --git-dir="$M" config --unset-all remote.origin.fetch || rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 5 ] || { echo "cannot drop remote.origin.fetch (git config exit $rc)" >&2; exit 1; }
    refs=$(git --git-dir="$M" for-each-ref --format="delete %(refname)" refs/remotes/)
    [ -z "$refs" ] || printf "%s\n" "$refs" | git --git-dir="$M" update-ref --no-deref --stdin
  ' sh "$MIRROR" || die "could not update the mirror's refspec/refs (see above) — nothing installed"
  # Langston decision 14 (A9), asserted rather than printed: the stale-ref producer is gone.
  if git_l config --get-all remote.origin.fetch >/dev/null; then die "remote.origin.fetch is still set"; fi
  n=$(git_l for-each-ref refs/remotes/ | wc -l)
  [ "$n" -eq 0 ] || die "refs/remotes/* still holds $n refs"
  echo "   mirror: configured fetch refspec dropped; refs/remotes/* empty"
fi

# ---- 4. bridges: the venv ---------------------------------------------------------------
if want bridges; then
  echo "== bridges: venv =="
  apt-get install -y python3-venv </dev/null >/dev/null 2>&1 || true
  mkdir -p "$BRIDGE_DIR"
  [ -d "$VENV" ] || python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install -U "discord.py>=2.3" >/dev/null
  v=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')
  echo "discord.py: $v"
fi

# ---- 5. install every selected file, then VERIFY every one -------------------------------
INSTALL_TS=$(date +%s)
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  mkdir -p "$(dirname "$target")"
  install -m "$mode" "$STAGE/$path" "$target"
  echo "   installed $target"
done
if want bridges; then chmod -R a+rX "$BRIDGE_DIR"; fi

BAD=""
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  want_blob=$(blob_of "$path")
  got_blob=$(git hash-object "$target")
  got_mode=$(stat -c %a "$target")
  if [ -z "$want_blob" ] || [ "$got_blob" != "$want_blob" ] || [ "0$got_mode" != "$mode" ]; then
    BAD="$BAD\n  - $target: blob $got_blob mode $got_mode, want ${want_blob:-?} mode $mode ($path)"
  fi
done
if [ -n "$BAD" ]; then
  printf "== INSTALL-VERIFY FAILED at %s:%b\n" "$SHA" "$BAD" >&2
  exit 3
fi
echo "== install-verify: all ${#SELECTED[@]} installed files equal their verified blobs at $SHA =="

# ---- 6. per-group state, after the files are verified ------------------------------------
add_langston_cron() { # match, line — a commented-out line does not count as present
  if sudo -u langston crontab -l 2>/dev/null | grep -v '^[[:space:]]*#' | grep -Fq "$1"; then
    echo "   langston cron already present for $1"
  else
    { sudo -u langston crontab -l 2>/dev/null || true; echo "$2"; } | sudo -u langston crontab -
    echo "   installed langston cron: $2"
  fi
}
if want bridges || want notices; then
  mkdir -p /etc/dawntrader
  [ -f /etc/dawntrader/comms-active.env ] || install -m 0644 "$STAGE/$SEED_PATH" /etc/dawntrader/comms-active.env
fi
if want notices; then
  # dt-deploy-drift.sh runs hourly as langston, so its log and its main-arm cap stamp
  # directory must be langston-writable BEFORE the first run (#1002). /var/log and /var/lib
  # are root-owned, so these paths cannot be swapped under root by another account.
  touch /var/log/dt-deploy-drift.log
  chown langston:langston /var/log/dt-deploy-drift.log
  mkdir -p /var/lib/dt-deploy-drift
  chown langston:langston /var/lib/dt-deploy-drift
  add_langston_cron dt-deploy-drift.sh '17 * * * * /usr/local/bin/dt-deploy-drift.sh >/dev/null 2>&1'
fi
if want readers; then
  touch /var/log/dt-backup-sync.log
  chown langston:langston /var/log/dt-backup-sync.log
  add_langston_cron dt-backup-sync.sh '*/15 * * * * /usr/local/bin/dt-backup-sync.sh >/dev/null 2>&1'
fi

# ---- 7. bridges: units -------------------------------------------------------------------
if want bridges; then
  systemctl daemon-reload
  systemctl enable --now discord-cc-bridge.service discord-langston-bridge.service
  # deploy.sh never RESTARTS a running bridge: new bridge code runs only after an explicit
  # restart, in a window with no queued Langston review. Say so loudly, per unit.
  for u in discord-cc-bridge.service discord-langston-bridge.service; do
    since=$(systemctl show -p ActiveEnterTimestamp --value "$u")
    since_s=$(date -d "$since" +%s 2>/dev/null || echo 0)
    if [ "$since_s" -lt "$INSTALL_TS" ]; then
      echo "   ⚠ NOT RESTARTED: $u has run since $since — it still executes the code from BEFORE this install. Restart it in a window with no queued review: systemctl restart $u"
    fi
  done
fi
echo "Done: $ONLY at $SHA."
