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
# ⛔ THE BOX-EDIT GUARD COMPARES EACH LIVE FILE WITH THE *PREVIOUS* REVIEWED INSTALL (amendment 1, P9(1), Langston r2).
#    It used to compare with the NEW blob, which made any install that CHANGES a pinned file refuse itself. Now: the
#    sha in /opt/token-watch/INSTALLED is the last reviewed install, and every live file that existed then must equal
#    its blob AT THAT SHA, ignoring carriage returns — any other difference means it was edited on the box, and the
#    install stops before touching anything. No INSTALLED record, or an unreadable sha, refuses too.
# ★ CORE (amendment 1, P9(4)): collector files an install changes that are NOT in the ops import closure (PINNED must
#   equal that closure exactly — tests/test_ops_boundary.py). follow_up.py is the first. TOOLS: the one-time
#   operator tools this batch runs as tokenwatch. Both get the same CR, compile, guard and record treatment, and the
#   four lists are asserted disjoint.
# ⛔ NOT dt-deploy, AND THIS SCRIPT RESTARTS NOTHING. token-watch is not part of the app. The long-running receiver
#    keeps the code it loaded until it is restarted BY HAND -- and whether that is owed is decided per install from
#    its import closure (receiver.py imports budget, provenance, config, store). ⚠️ At the B-TOKEN-WATCH-FOLLOWUP-MEMORY
#    P12 install it IS owed: store.py and budget.py changed (Langston, P12 Step 4). The older wording here ("byte-
#    identical, imports differ only in CR bytes", A6) was true of the storage batch's install and false of this one.
# Writes /opt/token-watch/INSTALLED: the sha, each file's sha256, the actor and a UTC time. ⚠️ The actor is TWO
#    fields, never one (Langston, Step-4 part 3 C-2, after #1004 — never name a field we cannot prove):
#    `actor_declared` is the constant below, a CLAIM; `actor_transport` is what the box observed (SUDO_USER, else
#    logname, else "unknown"). Every session reaches this box as root, so neither proves which session ran it.
set -eu
SHA=${1:-}
ACTOR_DECLARED=cc-infra
ACTOR_TRANSPORT=${SUDO_USER:-$(logname 2>/dev/null || echo unknown)}
REPO=/home/deploy/dawntrader
DEST=/opt/token-watch
UNITS=/etc/systemd/system
fail() { echo "FAIL $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || fail "give the full 40-character sha"

g() { runuser -u deploy -- git -C "$REPO" "$@"; }
g fetch -q origin migration/aws-supabase
g merge-base --is-ancestor "$SHA" origin/migration/aws-supabase || fail "$SHA is not on origin/migration/aws-supabase"

OPS="ops/alert_mint.py ops/cold_offbox.py ops/feed_watch.py ops/store_watch.py ops/unit_failed.py"
PINNED="config.py liveness.py provenance.py store.py tier.py"
# P12 (B-TOKEN-WATCH-FOLLOWUP-MEMORY): the plan row named summary.py + budget.py; promote.py (P2b-2 F-f, streamed
# read) and obs_fold.py (P7, new; summary imports it) are imported by follow_up/summary too, so all five are installed
# together - a follow-up importing a NEW store/summary beside an OLD promote is a mixed tree.
CORE="follow_up.py summary.py budget.py promote.py obs_fold.py"
# B-TOKEN-WATCH-FOLLOWUP-MEMORY added four of these six tools (its docstrings tell the operator to run them from
# /opt/token-watch/tools)
# (Langston, P11 Step 4 C-1: a documented tool the installer never placed cannot be run as documented)
TOOLS="tools/backfill_consumed_from.py tools/due_census.py tools/census_cold_versions.py tools/drain_closed_journals.py
tools/backlog_census.py tools/move_followup_cursor.py tools/derive_obs_window.py"
UNIT_FILES="token-watch-cold-offbox.service token-watch-cold-offbox.timer token-watch-store-watch.service
token-watch-store-watch.timer token-watch-failed@.service token-watch-tier.service token-watch-receiver.service
token-watch-followup.service token-watch-summary.service token-watch-feed-watch.service token-watch-feed-watch.timer
token-watch-followup.timer token-watch-summary.timer token-watch-tier.timer"
ALL="$OPS $PINNED $CORE $TOOLS"
# the four lists are disjoint: a file in two would be installed, guarded and recorded twice
DUP=$(printf '%s\n' $ALL | sort | uniq -d)
[ -z "$DUP" ] || fail "a file is in two of OPS/PINNED/CORE/TOOLS: $DUP"
CR=$(printf '\r')

stage=$(mktemp -d /root/tw-install.XXXXXX)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/ops" "$stage/tools" "$stage/units" "$stage/prev"

# ── 1. stage every file from its blob ───────────────────────────────────────
for f in $ALL; do g cat-file blob "$SHA:token-watch/$f" > "$stage/$f"; done
for u in $UNIT_FILES; do g cat-file blob "$SHA:token-watch/systemd/$u" > "$stage/units/$u"; done

# ── 2. check everything before touching the live tree ───────────────────────
for f in $ALL; do grep -q "$CR" "$stage/$f" && fail "the blob for $f carries a carriage return"; done
for u in $UNIT_FILES; do grep -q "$CR" "$stage/units/$u" && fail "the blob for $u carries a carriage return"; done
[ -f "$DEST/INSTALLED" ] || fail "$DEST/INSTALLED is missing: no previous reviewed install to compare the box with"
PREV=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha"])' "$DEST/INSTALLED") \
  || fail "cannot read the previous sha from $DEST/INSTALLED"
echo "$PREV" | grep -Eq '^[0-9a-f]{40}$' || fail "the previous sha in $DEST/INSTALLED is not a full sha: $PREV"
g merge-base --is-ancestor "$PREV" origin/migration/aws-supabase || fail "previous sha $PREV is not on the branch"
# ⛔ A RESOURCE CAP MAY NOT BE INSTALLED AHEAD OF THE CODE IT WAS MEASURED ON (Langston, B-TOKEN-WATCH-FOLLOWUP-MEMORY
#    P3 Step 4 C-4): a unit whose MemoryMax= line is NEW or CHANGED against the previous install must run a script
#    this install also places, or the cap lands on whatever old file is on the box (the 2026-09-02 summary.py,
#    measured nowhere). An unchanged cap on a script this installer never places (the receiver's) is not touched.
# Langston's P12 rider, folded early: EVERY ExecStart* line (a oneshot may carry several), EVERY /opt/token-watch
# script on them (an argument must not shadow the executable), and an INDENTED MemoryMax= (systemd honours it).
for u in $UNIT_FILES; do
  new_cap=$(grep -E '^[[:space:]]*MemoryMax=' "$stage/units/$u" | tr -d ' \t' || true)
  [ -n "$new_cap" ] || continue
  old_cap=""                                          # a unit new at this sha had no cap before
  if g cat-file -e "$PREV:token-watch/systemd/$u"; then
    old_cap=$(g cat-file blob "$PREV:token-watch/systemd/$u" | grep -E '^[[:space:]]*MemoryMax=' | tr -d ' \t' || true)
  fi
  [ "$new_cap" = "$old_cap" ] && continue
  scripts=$(grep -E '^[[:space:]]*ExecStart[A-Za-z]*=' "$stage/units/$u" | grep -oE '/opt/token-watch/[^ ]+\.py' | sed 's#^/opt/token-watch/##' || true)
  [ -n "$scripts" ] || fail "$u gains or changes MemoryMax= but no ExecStart line names an /opt/token-watch script"
  for script in $scripts; do
    printf '%s\n' $ALL | grep -qx "$script" || fail "$u gains or changes MemoryMax= (\"$new_cap\") but $script is not installed by this run (not in OPS/PINNED/CORE/TOOLS): a cap may not land ahead of the code it was measured on"
  done
done
for f in $PINNED; do [ -f "$DEST/$f" ] || fail "$DEST/$f is missing: this is not the install it expects"; done
for f in $ALL; do
  [ -f "$DEST/$f" ] || continue                       # new in this install (e.g. ops/feed_watch.py): nothing to guard
  prev="$stage/prev/$(echo "$f" | tr / _)"
  g cat-file blob "$PREV:token-watch/$f" > "$prev" 2>"$stage/prev.err" \
    || fail "$DEST/$f is live but has no blob at the previous install $PREV ($(cat "$stage/prev.err")) — stop and look"
  tr -d '\r' < "$DEST/$f" | cmp -s - "$prev" \
    || fail "$DEST/$f differs from its blob at the previous install $PREV by more than carriage returns — it was edited on the box, OR an earlier install copied files and then failed before writing INSTALLED (its 'NOT recorded' FAIL line says so) — stop and look"
done
# ⛔ THE SAME BOX-EDIT GUARD FOR THE UNIT FILES (Langston, P12 Step 4 CHANGES-4): units used to be installed over
#    whatever was on the box and hashed only afterwards. P12 is the first install to bring timers under the
#    installer (hand-placed until now), so every live unit file must equal its blob at the previous install, ignoring
#    carriage returns -- and a live unit with NO blob at that sha was never reviewed, which refuses too.
for u in $UNIT_FILES; do
  [ -f "$UNITS/$u" ] || continue                      # new on this box: nothing to guard
  prevu="$stage/prev/unit_$u"
  g cat-file blob "$PREV:token-watch/systemd/$u" > "$prevu" 2>"$stage/prev.err" \
    || fail "$UNITS/$u is live but has no blob at the previous install $PREV ($(cat "$stage/prev.err")) — stop and look"
  tr -d '\r' < "$UNITS/$u" | cmp -s - "$prevu" \
    || fail "$UNITS/$u differs from its blob at the previous install $PREV by more than carriage returns — it was edited on the box — stop and look"
done
# ALL, not OPS+CORE+TOOLS (Langston C-1): the guard rewrite makes a CHANGED pinned file installable, so a syntax
# error in store.py must stop here, not install clean and surface as every timer failing at import.
for f in $ALL; do python3 -m py_compile "$stage/$f" || fail "$f does not compile"; done

# ── 3. install ──────────────────────────────────────────────────────────────
install -d -o root -g root -m 0755 "$DEST/ops" "$DEST/tools"
for f in $ALL; do install -o root -g root -m 0644 "$stage/$f" "$DEST/$f"; done
for u in $UNIT_FILES; do install -o root -g root -m 0644 "$stage/units/$u" "$UNITS/$u"; done
systemctl daemon-reload
for u in token-watch-cold-offbox.service token-watch-store-watch.service token-watch-feed-watch.service token-watch-followup.service token-watch-summary.service; do   # a template cannot be verified bare
  systemd-analyze verify "$UNITS/$u" || fail "systemd-analyze rejects $u — files are in place but NOT recorded: INSTALLED still names $PREV, so the next run's guard will report every changed file as edited on the box. Fix the unit and re-run this sha, or restore the files from $PREV"
done

# ── 4. the record, last ─────────────────────────────────────────────────────
record="{\"sha\":\"$SHA\",\"previous_sha\":\"$PREV\",\"actor_declared\":\"$ACTOR_DECLARED\",\"actor_transport\":\"$ACTOR_TRANSPORT\",\"installed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"files\":{"
sep=""
for f in $ALL; do record="$record$sep\"$f\":\"$(sha256sum "$DEST/$f" | cut -d' ' -f1)\""; sep=","; done
for u in $UNIT_FILES; do record="$record$sep\"systemd/$u\":\"$(sha256sum "$UNITS/$u" | cut -d' ' -f1)\""; done
echo "$record}}" > "$stage/INSTALLED"
install -o root -g root -m 0644 "$stage/INSTALLED" "$DEST/INSTALLED"
echo "INSTALLED $SHA (declared $ACTOR_DECLARED, via $ACTOR_TRANSPORT). Timers are NOT enabled by this script: enable them after the first runs by hand"
echo "(pre-audit P10):  systemctl enable --now token-watch-cold-offbox.timer token-watch-store-watch.timer"
echo "Feed watch (amendment 1): drill the mint step (A7) and resolve the drill row FIRST, then:"
echo "  systemctl enable --now token-watch-feed-watch.timer"
cat "$DEST/INSTALLED"
