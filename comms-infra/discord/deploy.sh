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
#   copy it to /root/deploy-<sha>.sh on the box, then as root, from /root, with no GIT_DIR set:
#             git hash-object --no-filters /root/deploy-<sha>.sh          # must equal the blob id
#             bash /root/deploy-<sha>.sh --sha <sha> --only readers
# From THIS version on, the installer refuses to run unless its own bytes equal deploy.sh at
# --sha (read through the verified walk below). OLDER installers do not refuse: the one before
# 2026-09-29 installed whatever sat in /opt/discord-bridges, and a1ea15b50's has no self-check.
# So the bridges and notices groups RETIRE the old installer's staging copies from
# /opt/discord-bridges (moved to /root/deploy-retired/<UTC>/), leaving an old installer nothing
# stale to put back.
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
umask 022
# Root never runs git itself (its blob ids are computed below, by python), and the git it runs
# AS LANGSTON must not inherit the caller's repository or config: an exported GIT_DIR would point
# git at a directory another account can write, whose config can run commands.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
      GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM
# Resolve this script's own path BEFORE leaving the caller's directory (a relative $0 would
# otherwise be read against /).
SELF_FILE=$(readlink -f -- "$0" 2>/dev/null || true)
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

# A refusal. Once files are installed it also says so, and what did and did not run after that,
# so a refusal late in the run never reads as "nothing was changed".
INSTALLING=
INSTALLED=
DONE_STEPS=
GROUPS_TXT=
STAGE=
DIED=
state_note() {
  if [ -n "$INSTALLED" ]; then
    echo "deploy.sh: NOTE — the files at $SHA ARE installed and verified ($GROUPS_TXT); completed after that:${DONE_STEPS:- nothing}. Everything after that did NOT run — re-run the same command to finish." >&2
  elif [ -n "$INSTALLING" ]; then
    echo "deploy.sh: NOTE — the install loop was interrupted: some files at $SHA may be installed and others not, and install-verify did NOT run. Re-run the same command." >&2
  fi
}
die() {
  DIED=1
  echo "deploy.sh: $*" >&2
  state_note
  exit 2
}
# ANY other exit that is not 0 — set -e / pipefail on an unguarded command, anywhere, including
# inside a function — still says what state it left (Langston, gate 4a-2: the reorder fixed the
# ORDER of the post-install steps, not their REPORTING). The command's own message is above it.
CUR_TMP=
on_exit() {
  rc=$?
  [ -n "$STAGE" ] && rm -rf "$STAGE"
  [ -n "$CUR_TMP" ] && rm -f "$CUR_TMP"   # a half-written install never lingers beside its target
  if [ $rc -ne 0 ] && [ -z "$DIED" ]; then
    echo "deploy.sh: STOPPED by an unexpected failure (exit $rc) — its own message is above." >&2
    if [ -n "$INSTALLED$INSTALLING" ]; then state_note; else echo "deploy.sh: nothing was installed." >&2; fi
  fi
}
trap on_exit EXIT
# Every read of the mirror runs AS LANGSTON, from /.
git_l() { sudo -u langston git --git-dir="$MIRROR" "$@"; }
# A file's git blob id, computed by root WITHOUT git: sha1("blob <size>\0" + the bytes).
blob_hash() { python3 -c 'import hashlib,sys; d=open(sys.argv[1],"rb").read(); print(hashlib.sha1(b"blob %d\0" % len(d) + d).hexdigest())' "$1"; }
# langston's crontab, read ONCE per call into CRON_TXT. stderr is kept apart: it is never written
# back as a crontab line, and "no crontab" is told apart from a failed read by it alone.
read_cron() {
  local e rc=0
  e=$(mktemp)
  CRON_TXT=$(sudo -u langston crontab -l 2>"$e") || rc=$?
  if [ $rc -ne 0 ]; then
    if [ -z "$CRON_TXT" ] && grep -q "^no crontab for langston" "$e"; then CRON_TXT=""
    else local m; m=$(cat "$e"); rm -f "$e"; die "cannot read langston's crontab (exit $rc): $m — nothing written"; fi
  fi
  rm -f "$e"
}
# /var/log is root:syslog 0775 on this host (measured 2026-09-29), so a log path there can be
# swapped for a symlink by the syslog group: refuse a symlink, never follow one with chown.
no_symlink() { [ ! -L "$1" ] || die "$1 is a symlink — refusing to chown it"; }

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
[ -n "$SELF_FILE" ] && [ -f "$SELF_FILE" ] || die "run this script from a FILE (see HOW TO RUN IT), so its own bytes can be checked against $SELF_PATH at --sha"
# Checked BEFORE the split: `read` takes one line, so "readers<newline>bridges" would pass as
# "readers" while the reports printed both.
[[ "$ONLY" =~ ^[a-z,]+$ ]] || die "--only takes group names separated by commas (got '$ONLY')"
IFS=, read -r -a GROUPS_WANTED <<< "$ONLY"
[ ${#GROUPS_WANTED[@]} -gt 0 ] || die "--only names no group"
for g in "${GROUPS_WANTED[@]}"; do
  case "$g" in bridges|notices|readers) ;; *) die "unknown group '$g'" ;; esac
done
want() { local g; for g in "${GROUPS_WANTED[@]}"; do [ "$g" = "$1" ] && return 0; done; return 1; }
GROUPS_TXT=$(IFS=,; echo "${GROUPS_WANTED[*]}")

# ---- 1. the sha: a commit in the mirror, and on the review branch ----------------------
# stdout and stderr are read SEPARATELY: a warning must never be taken for the answer, and a
# failed read is "not in the mirror" only when git's ONLY message is its not-found line (git
# 2.43 says "could not get object info" for an absent full id) AND the mirror is readable.
ERRF=$(mktemp)
rc=0; t=$(git_l cat-file -t "$SHA" 2>"$ERRF") || rc=$?
terr=$(cat "$ERRF")
if [ $rc -ne 0 ]; then
  # The positive control (the branch head reads cleanly) is what licenses "not in the mirror".
  ctl=$(git_l cat-file -e "refs/heads/$BRANCH^{commit}" 2>&1) && crc=0 || crc=$?
  if [ "$(printf '%s\n' "$terr" | grep -c .)" -eq 1 ] && printf '%s' "$terr" | grep -qE "Not a valid object name|could not get object info" \
     && [ $crc -eq 0 ] && [ -z "$ctl" ]; then
    rm -f "$ERRF"; die "$SHA is not in the mirror yet — wait for the */15 dt-backup-sync run, then re-run"
  fi
  rm -f "$ERRF"; die "cannot read $SHA in the mirror: $terr"
fi
[ "$t" = commit ] || { rm -f "$ERRF"; die "$SHA is a $t, not a commit"; }
rc=0; git_l merge-base --is-ancestor "$SHA" "refs/heads/$BRANCH" 2>"$ERRF" || rc=$?
mb=$(cat "$ERRF"); rm -f "$ERRF"
[ -z "$mb" ] || die "could not tell whether $SHA is on $BRANCH: $mb"
case $rc in
  0) ;;
  1) die "$SHA is not an ancestor of $BRANCH as read from the mirror — only commits on the review branch are installed" ;;
  *) die "could not tell whether $SHA is on $BRANCH (merge-base exit $rc)" ;;
esac

# ---- 2. PRE-FLIGHT: read + VERIFY every selected file from the sha, before any change ----
STAGE=$(mktemp -d)
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
python3 - "$MIRROR" "$SHA" "$STAGE" "${PATHS[@]}" > "$STAGE/.blobs" <<'PY' || { DIED=1; echo "== PRE-FLIGHT FAILED — nothing has been changed." >&2; exit 2; }
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
SELF_GOT=$(blob_hash "$SELF_FILE")
[ "$SELF_GOT" = "$SELF_WANT" ] || die "this installer ($SELF_FILE, blob $SELF_GOT) is not $SELF_PATH at $SHA (blob $SELF_WANT) — run the reviewed copy"

if want bridges; then
  for f in /etc/langston/discord-cc-bot.env /etc/langston/discord-langston-bot.env /etc/dawntrader/discord-comms.env; do
    [ -f "$f" ] || { DIED=1; echo "== PRE-FLIGHT FAILED — MISSING $f; provision before deploying bridges" >&2; exit 2; }
  done
  # CC_BOT_ID is hard-required (load_shared_config raises without it → both bridges crash-loop).
  for k in DISCORD_CHANNEL_ID KYLE_DISCORD_ID CC_BOT_ID; do
    grep -q "^${k}=" /etc/dawntrader/discord-comms.env \
      || { DIED=1; echo "== PRE-FLIGHT FAILED — MISSING $k in /etc/dawntrader/discord-comms.env" >&2; exit 2; }
  done
fi
# What step 7 needs and can be checked now IS checked now, above every mutation, so a refusal
# there can only be a race (the old installer's rule: pre-flight above every mutation).
DRIFT_CRON='17 * * * * /usr/local/bin/dt-deploy-drift.sh >/dev/null 2>&1'
SYNC_CRON='*/15 * * * * /usr/local/bin/dt-backup-sync.sh >/dev/null 2>&1'
cron_conflict() { # match, canonical line: a DIFFERENT uncommented line for the same job refuses
  local other
  other=$(grep -v '^[[:space:]]*#' <<< "$CRON0" | grep -F -- "$1" | grep -vxF -- "$2" || true)
  [ -z "$other" ] || die "langston's crontab has a different $1 line ('$(head -n1 <<< "$other")'); nothing was changed — reconcile it by hand"
}
if want notices || want readers; then read_cron; CRON0=$CRON_TXT; fi
if want notices; then cron_conflict dt-deploy-drift.sh "$DRIFT_CRON"; fi
if want readers; then cron_conflict dt-backup-sync.sh "$SYNC_CRON"; fi
# Files are replaced by RENAME (step 5), so every target directory must be root-owned and not
# writable by group or other: a temporary name inside it must not be raceable.
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  d=$(dirname "$target")
  while [ ! -e "$d" ]; do d=$(dirname "$d"); done
  [ "$(stat -c %u "$d")" = 0 ] && [ $(( 0$(stat -c %a "$d") & 022 )) -eq 0 ] \
    || die "$d (holding $target) is not root-owned with no group/other write — refusing to install there"
done
if want notices; then no_symlink /var/log/dt-deploy-drift.log; fi
if want readers; then no_symlink /var/log/dt-backup-sync.log; fi
echo "== pre-flight: ${#SELECTED[@]} files read from $SHA, every object re-hashed (groups: $GROUPS_TXT) =="

# ---- 3. readers: the mirror's own state, BEFORE any file is installed -------------------
# As langston, under the lock both fetchers take, so it can neither collide with a fetch nor
# leave a half-installed host. flock creates the lock file AS LANGSTON: root never touches a
# path inside a directory another account can write (a symlink there would hand langston a
# root-owned file — the fresh-reader BLOCKER on the first version of this script).
mirror_state() {   # decision 14 (A9) + the reflog; as langston, under the shared lock
  rc=0
  sudo -u langston flock -w 300 -E 75 "$MIRROR/dt-fetch.lock" sh -c '
    set -e
    M=$1
    rc=0; git --git-dir="$M" config --unset-all remote.origin.fetch || rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 5 ] || { echo "cannot drop remote.origin.fetch (git config exit $rc)" >&2; exit 1; }
    git --git-dir="$M" config core.logAllRefUpdates always
    refs=$(git --git-dir="$M" for-each-ref --format="delete %(refname)" refs/remotes/)
    [ -z "$refs" ] || printf "%s\n" "$refs" | git --git-dir="$M" update-ref --no-deref --stdin
  ' sh "$MIRROR" || rc=$?
  case $rc in
    0) ;;
    75) if [ -n "$INSTALLED" ]; then die "the mirror's fetch lock was held for more than 300s"
        else die "the mirror's fetch lock was held for more than 300s — nothing was changed; re-run"; fi ;;
    *) die "could not update the mirror's refspec/refs (exit $rc; see above)" ;;
  esac
  # Asserted, not printed. `config --get` exits 1 for an ABSENT key; any other status is a
  # failed read. The positive control proves the config is readable at all.
  git_l config --get remote.origin.url >/dev/null || die "cannot read the mirror's config"
  rc=0; git_l config --get-all remote.origin.fetch >/dev/null || rc=$?
  [ $rc -eq 1 ] || die "remote.origin.fetch is still set, or unreadable (git config exit $rc)"
  n=$(git_l for-each-ref refs/remotes/ | wc -l)
  [ "$n" -eq 0 ] || die "refs/remotes/* still holds $n refs"
}
if want readers; then
  mirror_state
  echo "   mirror: configured fetch refspec dropped; refs/remotes/* empty; reflog on"
fi

# ---- 4. bridges: the venv ---------------------------------------------------------------
if want bridges; then
  echo "== bridges: venv =="
  apt-get install -y python3-venv </dev/null >/dev/null 2>&1 || true
  mkdir -p "$BRIDGE_DIR"
  [ -d "$VENV" ] || python3 -m venv "$VENV"
  # NOT tied to --sha: pip installs what PyPI serves today. Say so when a version changes.
  v0=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)' 2>/dev/null || echo none)
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install -U "discord.py>=2.3" >/dev/null
  v=$("$VENV/bin/python3" -c 'import discord; print(discord.__version__)')
  if [ "$v" = "$v0" ]; then echo "discord.py: $v (unchanged)"
  else echo "   ⚠ discord.py CHANGED $v0 -> $v — from PyPI, NOT reviewed at this sha; it takes effect at the next bridge restart"; fi
fi

# ---- 5. install every selected file, then VERIFY every one -------------------------------
INSTALLING=1
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  mkdir -p "$(dirname "$target")"
  # Replace by RENAME, never in place: `install` over an existing file truncates its inode, so
  # a script running from it (dt-backup-sync.sh, every 15 min) would read the NEW bytes at its
  # OLD offset. A rename leaves the running copy on its own inode. (Measured, gate 4a-2.)
  CUR_TMP=$(mktemp "$target.deploy.XXXXXX")
  install -m "$mode" "$STAGE/$path" "$CUR_TMP"
  mv -f "$CUR_TMP" "$target"
  CUR_TMP=
  echo "   installed $target"
done
if want bridges; then chmod -R a+rX "$BRIDGE_DIR"; fi

BAD=""
for e in "${SELECTED[@]}"; do
  IFS='|' read -r grp path target mode <<< "$e"
  want_blob=$(blob_of "$path")
  got_blob=$(blob_hash "$target")
  got_mode=$(stat -c %a "$target")
  if [ -z "$want_blob" ] || [ "$got_blob" != "$want_blob" ] || [ "0$got_mode" != "$mode" ]; then
    BAD="$BAD\n  - $target: blob $got_blob mode $got_mode, want ${want_blob:-?} mode $mode ($path)"
  fi
done
if [ -n "$BAD" ]; then
  DIED=1
  printf "== INSTALL-VERIFY FAILED at %s:%b\n" "$SHA" "$BAD" >&2
  exit 3
fi
echo "== install-verify: all ${#SELECTED[@]} installed files equal their verified blobs at $SHA =="
INSTALL_TS=$(date +%s)   # AFTER the last install: a unit that entered active at or before it runs older code
INSTALLED=1

# The old installer's STAGING COPIES in $BRIDGE_DIR are what an old installer would put back:
# retire them (moved, not deleted — recorded in DELETED_COMPONENTS_LOG).
RETIRE=""
if want notices; then RETIRE="$RETIRE cc-send dt-push-notice.sh dt-deploy-drift.sh"; fi
if want bridges; then RETIRE="$RETIRE discord-cc-bridge.service discord-langston-bridge.service discord-bridge-failed-notify@.service discord-langston-bridge.service.d comms-active.env deploy.sh"; fi
RDIR=/root/deploy-retired/$(date -u +%Y%m%dT%H%M%SZ)
for f in $RETIRE; do
  if [ -e "$BRIDGE_DIR/$f" ] || [ -L "$BRIDGE_DIR/$f" ]; then
    mkdir -p "$RDIR"; mv "$BRIDGE_DIR/$f" "$RDIR/"
    echo "   retired stale staging copy $BRIDGE_DIR/$f -> $RDIR/"
  fi
done
DONE_STEPS="$DONE_STEPS retire"

# ---- 6. the comms seed, then the bridge units -------------------------------------------
# These run BEFORE anything after the install that can refuse (crontab, the mirror's lock), so a
# late refusal never leaves new unit files that systemd has not reloaded.
if want bridges || want notices; then
  mkdir -p /etc/dawntrader
  if [ ! -f /etc/dawntrader/comms-active.env ]; then
    install -m 0644 "$STAGE/$SEED_PATH" /etc/dawntrader/comms-active.env
    [ "$(blob_hash /etc/dawntrader/comms-active.env)" = "$(blob_of "$SEED_PATH")" ] \
      || die "the seeded /etc/dawntrader/comms-active.env does not equal $SEED_PATH at $SHA"
    echo "   seeded /etc/dawntrader/comms-active.env from $SHA (verified)"
  fi
  DONE_STEPS="$DONE_STEPS seed"
fi
if want bridges; then
  systemctl daemon-reload
  systemctl enable --now discord-cc-bridge.service discord-langston-bridge.service
  sleep 8
  systemctl is-active discord-cc-bridge.service discord-langston-bridge.service \
    || echo "   ⚠ a bridge is NOT active 8s after enable — journalctl -u <unit> -n 50"
  # deploy.sh never RESTARTS a running bridge: new bridge code runs only after an explicit
  # restart, in a window with no queued Langston review. Say so loudly, per unit.
  for u in discord-cc-bridge.service discord-langston-bridge.service; do
    since=$(systemctl show -p ActiveEnterTimestamp --value "$u")
    since_s=$(date -d "$since" +%s 2>/dev/null || echo 0)
    # A drop-in this manifest does not own changes the unit behind the gate's back.
    for d in "$UNITS/$u.d" "/etc/systemd/system.control/$u.d" "/run/systemd/system.control/$u.d"; do
      [ -d "$d" ] || continue
      for f in "$d"/*; do
        [ -e "$f" ] || continue
        case "$f" in "$UNITS/discord-langston-bridge.service.d/self-advance.conf") continue ;; esac
        echo "   ⚠ UNMANAGED DROP-IN: $f changes $u and is not installed or verified by this script"
      done
    done
    if [ "$since_s" -le "$INSTALL_TS" ]; then
      echo "   ⚠ NOT RESTARTED: $u has run since $since — it still executes the code from BEFORE this install. Restart it in a window with no queued review: systemctl restart $u"
    fi
  done
  DONE_STEPS="$DONE_STEPS units"
fi

# ---- 7. per-group state: logs, crons, the mirror's own state ------------------------------
add_langston_cron() { # match, line — against the crontab read in pre-flight; a change since refuses
  read_cron
  [ "$CRON_TXT" = "$CRON0" ] || die "langston's crontab changed since pre-flight — the $1 cron was NOT written"
  # Presence = the EXACT canonical line (a different line for the same job refused in pre-flight).
  if grep -qxF -- "$2" <<< "$CRON_TXT"; then
    echo "   langston cron already present for $1"
  else
    if [ -n "$CRON_TXT" ]; then printf '%s\n%s\n' "$CRON_TXT" "$2"; else printf '%s\n' "$2"; fi | sudo -u langston crontab -
    read_cron
    grep -F -- "$2" <<< "$CRON_TXT" >/dev/null || die "wrote the $1 cron, but it does not read back"
    CRON0=$CRON_TXT
    echo "   installed langston cron: $2"
  fi
  DONE_STEPS="$DONE_STEPS cron:$1"
}
langston_log() {   # checked in pre-flight too; this re-check is for the race
  no_symlink "$1"
  [ -e "$1" ] || install -o langston -g langston -m 0644 /dev/null "$1"
  chown -h langston:langston "$1"
}
if want notices; then
  # dt-deploy-drift.sh runs hourly as langston, so its log and its main-arm cap stamp
  # directory must be langston-writable BEFORE the first run (#1002). /var/lib is root-owned,
  # so that path cannot be swapped under root by another account.
  langston_log /var/log/dt-deploy-drift.log
  mkdir -p /var/lib/dt-deploy-drift
  chown langston:langston /var/lib/dt-deploy-drift
  add_langston_cron dt-deploy-drift.sh "$DRIFT_CRON"
fi
if want readers; then
  langston_log /var/log/dt-backup-sync.log
  # The OLD fetchers took no lock, so a fetch in flight during step 3 could re-create
  # refs/remotes/*. The new ones are installed now: re-assert the mirror's state.
  mirror_state
  DONE_STEPS="$DONE_STEPS mirror-state"
  add_langston_cron dt-backup-sync.sh "$SYNC_CRON"
fi
echo "Done: $GROUPS_TXT at $SHA."
