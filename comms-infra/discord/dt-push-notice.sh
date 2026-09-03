#!/bin/sh
# dt-push-notice — tell the crew the review branch moved, and shout when the RULES moved.
#
# TWO DIFFERENT URGENCIES, deliberately (Kyle asked which should be automatic — the answer is
# both, but they are not the same event and must not read the same):
#
#   ANY PUSH  -> one quiet line, the sha and nothing else. NO action is required: git itself
#                refuses a push from a clone that is behind, so a normal push cannot hurt anyone
#                who ignores this. Kyle's instruction verbatim: "We don't need all the commentary
#                around what they pushed... They just need to understand that it's been pushed."
#
#   RULES PUSH -> an extra, LOUD line naming the files and demanding pull + reload NOW, even
#                mid-task. This one IS different: a session running stale rules produces no error
#                at all. It just quietly obeys the wrong instructions, and nothing catches it.
#                That asymmetry — silent wrongness vs a loud refusal — is why they differ.
#
# The paths that trigger the loud path (Kyle 2026-07-24, NARROWED 2026-09-03 per #995 —
# Kyle directed, Langston concurred): the instructions (CLAUDE.md), the CONDUCT rules, the
# hooks, and the settings registering them.
#
# REMOVED 2026-09-03, and the reason is mechanical, not a volume complaint:
#   1-system-manual/RUNNING_ISSUES.md — a LEDGER, not rules. Its rationale was never the
#     stale-rules one this loud text asserts; it was number collisions (fresh-rules.mjs).
#     But to prevent one, A's entry must exist at origin BEFORE B reads the max — and the
#     recorded mint gaps (9 min, 10 min, 28 min, "within minutes", "concurrently") say it
#     usually does not. ~16 collisions since 2026-06-21 with this alarm running; its one
#     genuine stale-copy case (19 h) was not caught either. Cost: 202 escalated mid-task
#     interruptions in a fortnight. A session mid-task is not minting — it mints at file
#     time, behind the §7.1 fetch gate, with the ROUTINE notice and fresh-rules.mjs still
#     covering that boundary. It STAYS in fresh-rules.mjs (Langston condition 1); the real
#     fix is per-session number blocks, B-ISSUE-BLOCK-GUARD #745, governance queue row 10.
#   1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md — an archive CLAUDE.md §4 defines as
#     never operative. It cannot make a session run stale rules.
# ADDED: CONDUCT.md — load-conduct.mjs injects it into EVERY session start from the LOCAL
#   working copy with no origin read, and it was on NEITHER this list nor fresh-rules.mjs.
#
# HOW IT KNOWS WHICH FILES CHANGED, with no local repo and no credentials: the GitHub compare
# API on a public repo. Deliberately NOT the local backup mirror — that is langston-owned, and
# this runs as root, which trips git's dubious-ownership guard and returns empty (the exact
# false-empty that made the backup gate look like a reproduction failure on 2026-07-24).

BRANCH=migration/aws-supabase
export GIT_SSH_COMMAND="ssh -i /home/langston/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
REMOTE=git@github.com:kylegjordan/DawnTraderV3.git
API=https://api.github.com/repos/kylegjordan/DawnTraderV3/compare
STATE=/var/lib/dt-push-notice/last-sha
LOG=/var/log/dt-push-notice.log
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$(dirname "$STATE")"

SHA=$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" 2>>"$LOG" | awk '{print $1}')
[ -z "$SHA" ] && { echo "$TS FAIL could not read remote ref" >> "$LOG"; exit 1; }

PREV=$(cat "$STATE" 2>/dev/null)

# First run: record and stay silent. Announcing an already-happened push is how a notice
# teaches people to ignore it.
if [ -z "$PREV" ]; then
  echo "$SHA" > "$STATE"; echo "$TS INIT $SHA (silent - first run)" >> "$LOG"; exit 0
fi
[ "$SHA" = "$PREV" ] && exit 0

# ── DRIFT CHECK (added 2026-09-03, #995 OBJ-9, Langston: he asked for it and the reason is
# that deploy-time convergence CANNOT REACH BETWEEN DEPLOYS — proven the same hour, when the
# tree held this file and $BRIDGE_DIR did not). deploy.sh installs from $BRIDGE_DIR, not from
# the tree, and nothing in the repo performs or verifies the scp that populates it. So the
# repo is source-of-truth VIA A RUNBOOK STEP, and a runbook step is exactly what goes unrun.
# Compared against the backup mirror, which self-pulls from GitHub every 15 min, so this needs
# no credential and no working copy. FAIL-QUIET BY DESIGN: any error here (mirror missing,
# fetch behind, sha unreadable) leaves DRIFT empty and the notice proceeds untouched — a
# broken drift check must never suppress the notice it rides on.
MIRROR=/srv/dawntrader-backup.git
DRIFT=""
if [ -d "$MIRROR" ]; then
  LIVE_SHA=$(sha256sum /usr/local/bin/dt-push-notice.sh 2>/dev/null | cut -d" " -f1)
  TREE_SHA=$(git --git-dir="$MIRROR" show "origin/$BRANCH:comms-infra/discord/dt-push-notice.sh" 2>/dev/null | sha256sum | cut -d" " -f1)
  # ⛔ ONLY CLAIM DRIFT WHEN THE MIRROR IS NEWER THAN THE LIVE FILE. The mirror pulls on a
  # */15 cron, so for up to 15 minutes after ANY edit the tree copy is legitimately older and
  # the comparison is not yet valid — reporting then is a FALSE ALARM ON EVERY EDIT, which is
  # a self-inflicted noise source in the batch whose whole subject is noise. Observed
  # immediately: this check fired on its own install and would have fired for 13 minutes.
  # The two sides must be comparable before a difference means anything.
  MIRROR_AT=$(stat -c %Y "$MIRROR/FETCH_HEAD" 2>/dev/null || echo 0)
  LIVE_AT=$(stat -c %Y /usr/local/bin/dt-push-notice.sh 2>/dev/null || echo 0)
  if [ -n "$LIVE_SHA" ] && [ -n "$TREE_SHA" ] && [ "$LIVE_SHA" != "$TREE_SHA" ]      && [ "$MIRROR_AT" -gt "$LIVE_AT" ]; then
    DRIFT="
⚠️ DRIFT: /usr/local/bin/dt-push-notice.sh on Helsinki does NOT match the tree copy at
comms-infra/discord/dt-push-notice.sh. One of them was edited without the other. The tree is
source of truth (§7.1): reconcile, scp into /opt/discord-bridges/, then re-run deploy.sh."
  fi
fi



echo "$SHA" > "$STATE"
SHORT=$(echo "$SHA" | cut -c1-9)

# Which files moved? Failure here must NOT suppress the ordinary notice.
FILES=$(curl -s --max-time 25 "$API/$PREV...$SHA" 2>/dev/null \
  | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    for f in d.get('files',[]): print(f['filename'])
except Exception: pass
" 2>/dev/null)

RULES=$(echo "$FILES" | grep -E '^(CLAUDE\.md|CONDUCT\.md|\.claude/hooks/|\.claude/settings\.local\.json)')

MSG="OLD Claude / NEW Claude / ANALYST Claude — review branch moved to ${SHORT}. Pull before you push. (If this is your own push, ignore it.)${DRIFT}"

if [ -n "$RULES" ]; then
  LIST=$(echo "$RULES" | sed 's/^/  - /')
  MSG="$MSG

★★ THE RULES CHANGED IN THIS PUSH — PULL AND RELOAD NOW, even if you are mid-task:
$LIST
A session running stale rules throws NO error — it just quietly obeys the wrong instructions.
Run BOTH commands, in this order:
  git fetch origin && git checkout origin/$BRANCH -- <the paths above>
  git reset --quiet -- <the same paths>
then RE-READ them.
The reset is NOT optional and NOT tidying: git checkout <ref> -- <path> writes the INDEX as
well as the working tree, so without it you are left holding ORIGINS content STAGED under a
path you recognise as your own, and your next commit ships it as yours (#753).
(Your session-start hook does both steps for you at your next start/resume/compaction — this
notice exists because that may be hours away, and you should not wait.)"
  echo "$TS ANNOUNCED $SHA RULES-CHANGED" >> "$LOG"
else
  echo "$TS ANNOUNCED $SHA (was $PREV)" >> "$LOG"
fi

cc-send --sender "Push notice" --message "$MSG" >> "$LOG" 2>&1
