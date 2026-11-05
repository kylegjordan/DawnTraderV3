#!/bin/bash
# B-LANGSTON-MEMORY-WRITE-FENCE P5 — install the fence on Helsinki, from a REVIEWED commit. Run as root:
#     bash install-fence.sh <full-40-char-sha>            (the script itself is read from that sha's blob by the caller)
#
# ⛔ FROM GIT BLOBS IN THE MIRROR, NEVER A WORKING TREE: every installed file is `git cat-file blob <sha>:<path>`
#    out of /srv/dawntrader-backup.git, and the sha must be on migration/aws-supabase there.
# ⛔ ORDER IS THE SAFETY (pre-audit P5, Langston r2/Step 4):
#    1. pre-flight: the NEW fence check, --dry-run, against the live home (it reports, mints nothing);
#    2. the root side first — spool dirs, spool service, allowlist, fence check, units — and the spool .path ENABLED,
#       so the moment the new writer turns his calls into spooled requests, something is there to answer them;
#    3. then, holding the OLD writer's lock (/home/langston/.memory-write.lock, flock) so no old-version write can run
#       across the move: back up, chown/chmod every fenced path to its table row (ensure_fence REFUSES a foreign owner
#       by design - "never adopted" - so this one-time migration is what it expects), install the writer, and ARM
#       the fence with one root call that writes nothing (a stale --expect-sha: ensure_fence runs under the lock first,
#       then exit 4). No two writer versions run across the lock move;
#    4. the old lock file is deleted; --self-test; the real fence check; the live proofs;
#    5. the record LAST (#1004: a root-side install outside the deploy tree must have provenance).
# Rollback (written into the record): chattr -i the four +i files, chown -R langston:langston the home's memory files
# and .memory-archive/, restore the writer from the backup, disable the two units.
set -euo pipefail
SHA=${1:-}
MIRROR=/srv/dawntrader-backup.git
HOME_L=/home/langston
ARCH=$HOME_L/.memory-archive
OLD_LOCK=$HOME_L/.memory-write.lock
SPOOL=/var/spool/langston-memory
UNITS=/etc/systemd/system
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/root/langston-memory-backup/pre-fence-$TS
REC=/root/langston-memory-backup/FENCE-INSTALLED
fail() { echo "FAIL $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || fail "give the full 40-character sha"
git -C "$MIRROR" merge-base --is-ancestor "$SHA" migration/aws-supabase || fail "$SHA is not on migration/aws-supabase in the mirror"
G=$(id -g langston); [ "$G" -gt 0 ] || fail "no langston group"

# ── stage every file from its blob, compile-check the python ────────────────
ST=$(mktemp -d /root/lmw-fence-install.XXXXXX); trap 'rm -rf "$ST"' EXIT
b() { git -C "$MIRROR" cat-file blob "$SHA:$1" > "$ST/$2"; }
b comms-infra/langston-memory/bin/langston-memory-write writer
b comms-infra/langston-memory/bin/langston-memory-spoold spoold
b comms-infra/langston-memory/bin/langston_memory_allowlist.py langston_memory_allowlist.py
b comms-infra/langston-memory/bin/langston-memory-fence-check fence-check
for u in langston-memory-spoold.path langston-memory-spoold.service langston-memory-fence-check.service \
         langston-memory-fence-check.timer; do b "comms-infra/systemd/$u" "$u"; done
for f in writer spoold langston_memory_allowlist.py fence-check; do
  python3 -c "import sys; compile(open(sys.argv[1],'rb').read(), sys.argv[1], 'exec')" "$ST/$f" || fail "$f does not compile"
done
CR=$(printf '\r'); for f in "$ST"/*; do grep -q "$CR" "$f" && fail "the blob $f carries a carriage return"; done

# ── 1. pre-flight ───────────────────────────────────────────────────────────
echo "== pre-flight: fence check --dry-run against the live home (reports only)"
python3 -I "$ST/fence-check" --dry-run || true
PH=$(cat /proc/sys/fs/protected_hardlinks); PS=$(cat /proc/sys/fs/protected_symlinks)
echo "fs.protected_hardlinks=$PH fs.protected_symlinks=$PS (read from /proc/sys)"

# ── 2. the root side first ──────────────────────────────────────────────────
install -d -o root -g "$G" -m 0750 "$SPOOL"
install -d -o root -g "$G" -m 1730 "$SPOOL/in" "$SPOOL/tmp"
install -d -o root -g "$G" -m 0750 "$SPOOL/out"
install -o root -g root -m 0755 "$ST/spoold" /usr/local/sbin/langston-memory-spoold
install -o root -g root -m 0644 "$ST/langston_memory_allowlist.py" /usr/local/sbin/langston_memory_allowlist.py
install -o root -g root -m 0755 "$ST/fence-check" /usr/local/sbin/langston-memory-fence-check
for u in langston-memory-spoold.path langston-memory-spoold.service langston-memory-fence-check.service \
         langston-memory-fence-check.timer; do install -o root -g root -m 0644 "$ST/$u" "$UNITS/$u"; done
systemctl daemon-reload
systemd-analyze verify "$UNITS/langston-memory-spoold.service" "$UNITS/langston-memory-fence-check.service" \
  || fail "systemd-analyze rejects a unit"
systemctl enable --now langston-memory-spoold.path
systemctl is-active --quiet langston-memory-spoold.path || fail "the spool .path is not active"

# ── 3. under the OLD writer's lock: back up, migrate, install, arm ──────────
exec 9>>"$OLD_LOCK"
flock -w 300 9 || fail "could not take the old writer's lock in 300 s - a write is running; nothing migrated"
install -d -m 0700 "$BK"
cp -a /usr/local/bin/langston-memory-write "$BK/langston-memory-write.old"
( cd "$HOME_L" && stat -c '%U:%G %a %n' MEMORY.md MEMORY-ARCHIVE.md .memory-archive .memory-archive/* ) > "$BK/ownership-before.txt"
sha256sum "$HOME_L/MEMORY.md" "$ARCH/compose-state.json" > "$BK/sha-before.txt"
# RE-RUNNABLE (fixed 2026-11-05 after the first install): a path already carrying the immutable flag is already
# fenced by a previous run's ensure_fence - chown/chmod on it fails with EPERM, so it is SKIPPED, not changed.
mig() {  # <path> <owner:group> <mode>
  if lsattr -d "$1" 2>/dev/null | cut -c5 | grep -q i; then echo "already fenced (+i), left as is: $1"; return 0; fi
  chown "$2" "$1"; chmod "$3" "$1"
}
mig "$ARCH" root:"$G" 0750
find "$ARCH" -mindepth 1 -maxdepth 1 -type f -print0 | while IFS= read -r -d '' f; do
  [ "$f" = "$ARCH/compose-state.json" ] && continue; mig "$f" root:"$G" 0640; done
mig "$ARCH/compose-state.json" root:root 0600
for f in MEMORY.md MEMORY-ARCHIVE.md; do mig "$HOME_L/$f" root:"$G" 0640; done
install -o root -g "$G" -m 0750 "$ST/writer" /usr/local/bin/langston-memory-write
echo "== arm: one root call that writes nothing (stale --expect-sha; ensure_fence runs under the lock, then exit 4)"
set +e
printf 'fence install arm - never written\n' | /usr/local/bin/langston-memory-write --expect-sha "$(printf '0%.0s' $(seq 64))" \
  --ledger-delta 0 --retractions-delta 0 --part 00-legacy.md --by cc-infra --reason "fence install: arm ensure_fence (expected exit 4)"
ARM=$?
set -e
[ "$ARM" = 4 ] || fail "the arming call exited $ARM, not 4 - look before continuing (lock still held by this shell)"
cmp -s <(sha256sum "$HOME_L/MEMORY.md" | cut -d' ' -f1) <(grep "MEMORY.md" "$BK/sha-before.txt" | cut -d' ' -f1) \
  || fail "MEMORY.md changed during the install - it must not"
exec 9>&-
rm -f "$OLD_LOCK"

# ── 4. proofs ───────────────────────────────────────────────────────────────
echo "== flags after arming"; lsattr "$HOME_L/MEMORY.md" "$HOME_L/MEMORY-ARCHIVE.md" "$ARCH/compose-state.json"
echo "== self-test"; /usr/local/bin/langston-memory-write --self-test | tail -3
echo "== the real fence check"; set +e; python3 -I /usr/local/sbin/langston-memory-fence-check; FC=$?; set -e; echo "fence-check exit $FC"
echo "== live proof 1: as langston, a direct append to MEMORY.md is refused"
sudo -u langston sh -c "printf x >> $HOME_L/MEMORY.md" && fail "langston could append to MEMORY.md" || echo "refused (expected)"
echo "== live proof 2: as langston, a stale write round-trips through the spool with exit 4, verbatim"
set +e
printf 'proof - never written\n' | sudo -u langston /usr/local/bin/langston-memory-write --expect-sha "$(printf 'f%.0s' $(seq 64))" \
  --ledger-delta 0 --retractions-delta 0 --part 00-legacy.md --reason "fence install: spool round-trip proof (expected exit 4)"
P2=$?
set -e
[ "$P2" = 4 ] || fail "the spool round trip exited $P2, not 4"
systemctl enable --now langston-memory-fence-check.timer

# ── 5. the record, last ─────────────────────────────────────────────────────
{
  echo "sha=$SHA installed_at=$(date -u +%FT%TZ) actor=cc-infra"
  for f in /usr/local/bin/langston-memory-write /usr/local/sbin/langston-memory-spoold /usr/local/sbin/langston_memory_allowlist.py \
           /usr/local/sbin/langston-memory-fence-check $UNITS/langston-memory-spoold.path $UNITS/langston-memory-spoold.service \
           $UNITS/langston-memory-fence-check.service $UNITS/langston-memory-fence-check.timer; do sha256sum "$f"; done
  echo "fs.protected_hardlinks=$PH fs.protected_symlinks=$PS (read from /proc/sys at install)"
  echo "fence-check exit at install: $FC"
  echo "C-15: the reader-trust chain (A10) is a LATENT single point of failure, not a live one: langston cannot write"
  echo "  /opt/langston-memory/bin/__pycache__ (EACCES) and langston-recall execs the reader as a script. Do NOT loosen"
  echo "  those modes to 'fix' a fence-check page about them."
  echo "backup: $BK (old writer, ownership-before, sha-before)"
  echo "rollback: chattr -i MEMORY.md MEMORY-ARCHIVE.md .memory-archive/compose-state.json; chown -R langston:langston"
  echo "  $ARCH $HOME_L/MEMORY.md $HOME_L/MEMORY-ARCHIVE.md (modes 0700/0600); cp -a $BK/langston-memory-write.old"
  echo "  /usr/local/bin/langston-memory-write; systemctl disable --now langston-memory-spoold.path langston-memory-fence-check.timer"
} > "$REC.tmp"
install -o root -g root -m 0644 "$REC.tmp" "$REC"; rm -f "$REC.tmp"
install -d -m 0755 /etc/langston; install -o root -g root -m 0644 "$REC" /etc/langston/memory-fence-installed
echo "INSTALLED $SHA"; cat "$REC"
