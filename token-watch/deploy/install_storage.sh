#!/bin/sh
# token-watch — install B-TOKEN-WATCH-STORAGE from a REVIEWED commit. (P9)  Run as root on staging:
#     sh install_storage.sh <full-40-char-sha>
#
# ⛔ FROM GIT BLOBS, NEVER A WORKING TREE. Every file is read with `git cat-file blob <sha>:<path>` out of the
#    app's clone (fetched first), so what lands is exactly what was reviewed. (A working-tree copy is how seven of
#    the live modules came to carry Windows line endings — harmless to Python, but not what the repo holds.)
# ⛔ THE SHA MUST BE ON origin/migration/aws-supabase. A commit that was never pushed was never reviewed.
# ⛔ NOT dt-deploy, AND NOTHING IS RESTARTED. token-watch is not part of the app. The long-running receiver is not
#    restarted: receiver.py is byte-identical at the ref, and the collector modules it imports differ from the live
#    copies only in carriage-return bytes (pre-audit A6). Only the units' definitions are reloaded.
# Writes /opt/token-watch/INSTALLED: the sha, each file's sha256, the actor and a UTC time (#1004 is attribution).
set -eu
SHA=${1:-}
ACTOR=cc-infra
REPO=/home/deploy/dawntrader
DEST=/opt/token-watch
UNITS=/etc/systemd/system
fail() { echo "FAIL $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || fail "give the full 40-character sha"

g() { runuser -u deploy -- git -C "$REPO" "$@"; }
g fetch -q origin migration/aws-supabase
g merge-base --is-ancestor "$SHA" origin/migration/aws-supabase || fail "$SHA is not on origin/migration/aws-supabase"

FILES="ops/alert_mint.py ops/cold_offbox.py ops/store_watch.py ops/unit_failed.py"
UNIT_FILES="token-watch-cold-offbox.service token-watch-cold-offbox.timer token-watch-store-watch.service
token-watch-store-watch.timer token-watch-failed@.service token-watch-tier.service token-watch-receiver.service
token-watch-followup.service token-watch-summary.service"

stage=$(mktemp -d /root/tw-install.XXXXXX)
trap 'rm -rf "$stage"' EXIT
install -d -o root -g root -m 0755 "$DEST/ops"
record="{\"sha\":\"$SHA\",\"actor\":\"$ACTOR\",\"installed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"files\":{"
sep=""
for f in $FILES; do
  g cat-file blob "$SHA:token-watch/$f" > "$stage/x"
  install -o root -g root -m 0644 "$stage/x" "$DEST/$f"
  record="$record$sep\"$f\":\"$(sha256sum "$DEST/$f" | cut -d' ' -f1)\""; sep=","
done
for u in $UNIT_FILES; do
  g cat-file blob "$SHA:token-watch/systemd/$u" > "$stage/x"
  install -o root -g root -m 0644 "$stage/x" "$UNITS/$u"
  record="$record$sep\"systemd/$u\":\"$(sha256sum "$UNITS/$u" | cut -d' ' -f1)\""
done
echo "$record}}" > "$stage/INSTALLED"
install -o root -g root -m 0644 "$stage/INSTALLED" "$DEST/INSTALLED"
CR=$(printf '\r')
for f in $FILES; do grep -q "$CR" "$DEST/$f" && fail "$DEST/$f carries a carriage return"; done
for u in $UNIT_FILES; do grep -q "$CR" "$UNITS/$u" && fail "$UNITS/$u carries a carriage return"; done
systemctl daemon-reload
for u in token-watch-cold-offbox.service token-watch-store-watch.service; do   # a template cannot be verified bare
  systemd-analyze verify "$UNITS/$u" || fail "systemd-analyze rejects $u"
done
echo "INSTALLED $SHA by $ACTOR. Timers are NOT enabled by this script: enable them after the first runs by hand"
echo "(pre-audit P10):  systemctl enable --now token-watch-cold-offbox.timer token-watch-store-watch.timer"
cat "$DEST/INSTALLED"
