#!/bin/sh
# token-watch — install B-TOKEN-WATCH-STORAGE from a REVIEWED commit. (P9)  Run as root on staging:
#     sh install_storage.sh <full-40-char-sha>
#
# ⛔ FROM GIT BLOBS, NEVER A WORKING TREE. Every file is read with `git cat-file blob <sha>:<path>` out of the
#    app's clone (fetched first), so what lands is exactly what was reviewed. The worktree is never consulted.
# ⛔ THE SHA MUST BE ON origin/migration/aws-supabase. A commit that was never pushed was never reviewed.
# ⛔ EVERYTHING IS CHECKED BEFORE ANYTHING IS INSTALLED, AND `INSTALLED` IS WRITTEN LAST (Langston, Step 4): a check
#    that fails leaves the live tree untouched and no record claiming success.
# ⛔ THE COLLECTOR FILES THE OPS JOBS LOAD ARE PINNED TOO (Step 4 condition 2, r3): the whole IMPORT CLOSURE, not
#    the direct imports — config.py (the root, the cap and the warn line), tier.py (the one-hour guard), liveness.py
#    (the size check), and store.py and provenance.py, which tier.py and liveness.py load on every run.
#    tests/test_ops_boundary.py computes the closure from the code and FAILS if PINNED below drifts from it.
#    Before overwriting each, the live copy
#    is compared with the blob IGNORING CARRIAGE RETURNS, and any other difference REFUSES the install: pre-audit A6
#    measured them as differing only in CR bytes, so pinning them changes no behaviour. If that ever stops being true,
#    something was edited on the box and must be understood first.
# ⛔ NOT dt-deploy, AND NOTHING IS RESTARTED. token-watch is not part of the app. The long-running receiver keeps the
#    code it loaded: receiver.py is byte-identical at the ref, and its imports differ only in CR bytes (A6).
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

OPS="ops/alert_mint.py ops/cold_offbox.py ops/store_watch.py ops/unit_failed.py"
PINNED="config.py liveness.py provenance.py store.py tier.py"
UNIT_FILES="token-watch-cold-offbox.service token-watch-cold-offbox.timer token-watch-store-watch.service
token-watch-store-watch.timer token-watch-failed@.service token-watch-tier.service token-watch-receiver.service
token-watch-followup.service token-watch-summary.service"
CR=$(printf '\r')

stage=$(mktemp -d /root/tw-install.XXXXXX)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/ops" "$stage/units"

# ── 1. stage every file from its blob ───────────────────────────────────────
for f in $OPS $PINNED; do g cat-file blob "$SHA:token-watch/$f" > "$stage/$f"; done
for u in $UNIT_FILES; do g cat-file blob "$SHA:token-watch/systemd/$u" > "$stage/units/$u"; done

# ── 2. check everything before touching the live tree ───────────────────────
for f in $OPS $PINNED; do grep -q "$CR" "$stage/$f" && fail "the blob for $f carries a carriage return"; done
for u in $UNIT_FILES; do grep -q "$CR" "$stage/units/$u" && fail "the blob for $u carries a carriage return"; done
for f in $PINNED; do
  [ -f "$DEST/$f" ] || fail "$DEST/$f is missing: this is not the install it expects"
  tr -d '\r' < "$DEST/$f" | cmp -s - "$stage/$f" \
    || fail "$DEST/$f differs from the blob by more than carriage returns; it was edited on the box — stop and look"
done
for f in $OPS; do python3 -m py_compile "$stage/$f" || fail "$f does not compile"; done

# ── 3. install ──────────────────────────────────────────────────────────────
install -d -o root -g root -m 0755 "$DEST/ops"
for f in $OPS $PINNED; do install -o root -g root -m 0644 "$stage/$f" "$DEST/$f"; done
for u in $UNIT_FILES; do install -o root -g root -m 0644 "$stage/units/$u" "$UNITS/$u"; done
systemctl daemon-reload
for u in token-watch-cold-offbox.service token-watch-store-watch.service; do   # a template cannot be verified bare
  systemd-analyze verify "$UNITS/$u" || fail "systemd-analyze rejects $u — files are in place but NOT recorded"
done

# ── 4. the record, last ─────────────────────────────────────────────────────
record="{\"sha\":\"$SHA\",\"actor\":\"$ACTOR\",\"installed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"files\":{"
sep=""
for f in $OPS $PINNED; do record="$record$sep\"$f\":\"$(sha256sum "$DEST/$f" | cut -d' ' -f1)\""; sep=","; done
for u in $UNIT_FILES; do record="$record$sep\"systemd/$u\":\"$(sha256sum "$UNITS/$u" | cut -d' ' -f1)\""; done
echo "$record}}" > "$stage/INSTALLED"
install -o root -g root -m 0644 "$stage/INSTALLED" "$DEST/INSTALLED"
echo "INSTALLED $SHA by $ACTOR. Timers are NOT enabled by this script: enable them after the first runs by hand"
echo "(pre-audit P10):  systemctl enable --now token-watch-cold-offbox.timer token-watch-store-watch.timer"
cat "$DEST/INSTALLED"
