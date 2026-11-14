#!/bin/bash
# B-LANGSTON-CLAUDEMD-RESIDUAL, #1197 rider (P13) — install langston-index-guard on Helsinki from a REVIEWED commit.
# Run as root:   bash install-index-guard.sh <full-40-char-sha>     (read this script from that sha's blob first)
#
# ⛔ FROM GIT BLOBS IN THE MIRROR, NEVER A WORKING TREE (the install-fence.sh pattern); the sha must be on the branch.
# ⛔ ORDER:
#    1. stage + compile + no-CR; the guard's own suite AND its mutation check run from the blobs, as langston, on a
#       fixture - nothing is installed unless both pass;
#    2. C-3: the ratchet state must be readable AS LANGSTON (the hook runs as him; a 0600 state would turn the
#       fail-closed hook into a block on every growing index save);
#    3. refuse while a langston `claude` process is live (managed settings apply to the next invoke at once);
#    4. the writer (read_ratchet gained `subject`, C-2) then its --self-test; then the guard; then the log
#       (root:langston 0620, chattr +a - he can append, not truncate or delete; C-1); then managed-settings.json LAST,
#       written to a temp file, json-checked, renamed - so the hook is never referenced before it exists;
#    5. the record: sha, every installed sha256, the CLI version and the tool set enumerated at it (C-5).
# Rollback (also written into the record): rm /etc/claude-code/managed-settings.json (the hook stops at the next
# invoke), restore the writer from the backup dir. The guard and the log can stay; nothing calls them without (1).
set -euo pipefail
SHA=${1:-}
MIRROR=/srv/dawntrader-backup.git
GUARD=/opt/langston-memory/bin/langston-index-guard
WRITER=/usr/local/bin/langston-memory-write
WATCH=/usr/local/bin/langston-size-watch
LOG=/var/log/langston-index-guard.jsonl
MANAGED=/etc/claude-code/managed-settings.json
STATE=/opt/langston-memory/state/ratchet-state.json
TS=$(date -u +%Y%m%dT%H%M%SZ)
BK=/root/langston-memory-backup/pre-index-guard-$TS
REC=/root/langston-memory-backup/INDEX-GUARD-INSTALLED
fail() { echo "FAIL $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || fail "give the full 40-character sha"
git -C "$MIRROR" merge-base --is-ancestor "$SHA" migration/aws-supabase || fail "$SHA is not on migration/aws-supabase in the mirror"

# ── 1. stage, compile, test from the blobs ──────────────────────────────────
# ⛔ TWO DIRECTORIES (Langston R-3 review): what root INSTALLS is staged root-only in $ST and never handed to the account
#    the guard constrains; the tests run on a COPY in $TT, langston-owned. Installing from a langston-owned file would let
#    that account rewrite a binary systemd runs as root between the test and the install.
ST=$(mktemp -d /root/lig-install.XXXXXX); TT=$(mktemp -d /var/tmp/lig-test.XXXXXX)
trap 'rm -rf "$ST" "$TT"' EXIT
chmod 700 "$ST" "$TT"
for f in langston-index-guard langston-memory-write test_index_guard.py mutate_index_guard.py langston-size-watch \
         test_size_watch_alerts.py mutate_size_watch_alerts.py; do
  git -C "$MIRROR" cat-file blob "$SHA:comms-infra/langston-memory/bin/$f" > "$ST/$f"
done
git -C "$MIRROR" cat-file blob "$SHA:comms-infra/codex/coltrane-size-watch" > "$ST/coltrane-size-watch"
CR=$(printf '\r')
for f in "$ST"/*; do
  python3 -c "import sys; compile(open(sys.argv[1],'rb').read(), sys.argv[1], 'exec')" "$f" || fail "$f does not compile"
  grep -q "$CR" "$f" && fail "the blob $f carries a carriage return"
done
cp "$ST"/* "$TT"/; chown -R langston:langston "$TT"
echo "== guard suite + mutation check, from a copy of the blobs, as langston, on a fixture"
(cd "$TT" && sudo -u langston python3 test_index_guard.py | tail -1) || fail "test_index_guard.py failed"
(cd "$TT" && sudo -u langston python3 mutate_index_guard.py) || fail "a mutant survived (or the baseline failed)"
# R-3: the size watch is the guard's reader; its suite and mutants run from the blobs too (as langston, private HOME dir)
echo "== size watch suite + mutation check, from the blobs"
(cd "$TT" && sudo -u langston HOME="$TT" COLTRANE_WATCH_PATH="$TT/coltrane-size-watch" python3 test_size_watch_alerts.py | tail -1) \
  || fail "test_size_watch_alerts.py failed"
(cd "$TT" && sudo -u langston HOME="$TT" COLTRANE_WATCH_PATH="$TT/coltrane-size-watch" python3 -I mutate_size_watch_alerts.py | tail -1) \
  || fail "a size watch mutant survived"

# ── 2. C-3: the state readable as langston ──────────────────────────────────
sudo -u langston test -r "$STATE" || fail "$STATE is not readable as langston - the hook would refuse every growing save"
# R-1 (Langston Step 4): assert the thing itself, not two of its inputs - the staged writer's read_ratchet, run AS
# LANGSTON against the live home with the index as subject, must establish every leg (state, ceiling, watched list,
# every watched file present, the subject watched). Any `unknown` here would make the hook refuse every growing save.
UNK=$(cd "$TT" && sudo -u langston python3 -I -c '
import importlib.machinery, importlib.util, os, sys
sys.dont_write_bytecode = True
l = importlib.machinery.SourceFileLoader("lmw", "langston-memory-write"); s = importlib.util.spec_from_loader(l.name, l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
i = "/home/langston/.claude/projects/-home-langston/memory/MEMORY.md"
r = m.read_ratchet(os.path.getsize(i), subject=i)
print(r["unknown"] if r["unknown"] else "OK total=%d ceiling=%d" % (r["total"], r["ceiling_bytes"]))') \
  || fail "read_ratchet as langston did not run"
echo "read_ratchet as langston, index as subject: $UNK"
case "$UNK" in OK*) ;; *) fail "the ratchet is not established as langston: $UNK" ;; esac

# ── 3. no live invoke ───────────────────────────────────────────────────────
pgrep -u langston -f '/usr/bin/claude' >/dev/null && fail "a langston claude process is live - retry when idle"

# ── 4. install, writer first, managed settings last ─────────────────────────
mkdir -p "$BK"; chmod 700 "$BK"
cp -p "$WRITER" "$BK/langston-memory-write"
cp -p "$WATCH" "$BK/langston-size-watch"
[ -e "$MANAGED" ] && cp -p "$MANAGED" "$BK/managed-settings.json"
install -o root -g root -m 0755 "$ST/langston-memory-write" "$WRITER.new" && mv "$WRITER.new" "$WRITER"
python3 "$WRITER" --self-test | tail -1 | grep -q "self-test PASSED" || { cp -p "$BK/langston-memory-write" "$WRITER"; fail "writer --self-test failed; old writer restored"; }
install -o root -g root -m 0755 "$ST/langston-size-watch" "$WATCH.new" && mv "$WATCH.new" "$WATCH"
"$WATCH" --status >/dev/null || { cp -p "$BK/langston-size-watch" "$WATCH"; fail "langston-size-watch --status failed; old watch restored"; }
install -d -o root -g root -m 0755 "$(dirname "$GUARD")"
install -o root -g root -m 0755 "$ST/langston-index-guard" "$GUARD.new" && mv "$GUARD.new" "$GUARD"
if [ ! -e "$LOG" ]; then install -o root -g langston -m 0620 /dev/null "$LOG"; fi
chown root:langston "$LOG"; chmod 0620 "$LOG"; chattr +a "$LOG"
sudo -u langston sh -c ": >> '$LOG'" || fail "langston cannot append to $LOG"
install -d -o root -g root -m 0755 /etc/claude-code
printf '%s\n' "{\"hooks\":{\"PreToolUse\":[{\"matcher\":\"*\",\"hooks\":[{\"type\":\"command\",\"command\":\"$GUARD\"}]}]}}" > "$MANAGED.tmp"
python3 -m json.tool "$MANAGED.tmp" >/dev/null || fail "managed settings json does not parse"
chmod 0644 "$MANAGED.tmp"; mv "$MANAGED.tmp" "$MANAGED"

# ── 5. the record ───────────────────────────────────────────────────────────
{
  echo "installed $TS from $SHA (B-LANGSTON-CLAUDEMD-RESIDUAL #1197 rider)"
  sha256sum "$WRITER" "$WATCH" "$GUARD" "$MANAGED"
  # Langston (5a40fc1f4 re-review, note 3): the headroom at install, so a first refusal is read as the guard working
  echo "loaded set at install: $UNK - growing index saves past that headroom are REFUSED from day one, by design"
  echo "claude $(/usr/bin/claude --version 2>&1 | head -1); guard enumerated for $(grep -o 'CLI_VERSION_ENUMERATED = "[^"]*"' "$GUARD")"
  echo "rollback: rm $MANAGED; cp -p $BK/langston-memory-write $WRITER; cp -p $BK/langston-size-watch $WATCH"
} | tee -a "$REC"
echo "INSTALLED. Live proof (P13) is a real index save by Langston producing one row in $LOG."
