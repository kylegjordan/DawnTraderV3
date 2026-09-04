#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# dt-deploy — THE sanctioned staging deploy path (B-DEPLOY-LOCK, #649, #140)
# ═════════════════════════════════════════════════════════════════════════════
# Scope: B_DEPLOY_LOCK_SCOPE.md rev 4 (Langston Step-1 APPROVED)
# Pre-audit: B_DEPLOY_LOCK_PRE_AUDIT.md (Step-2 APPROVED)
#
# Usage:  dt-deploy <full-40-char-sha> --by <session> [--pre-restart '<npm script>']
#
# --by (#656, Kyle-directed hotfix): every session reaches this box as the SAME
# unix identity (root -> su deploy), so the observed identity cannot attribute
# a deploy to a session. The flag is REQUIRED — refuse-not-guess, the
# CREW_SESSION precedent — and is recorded as deployed_by_claimed (a CLAIM,
# per #447: never dressed as proven; the observed identity stays alongside it
# as deployed_via).
#
# Chain (OBJ-1): lock → fetch → sha-on-branch check → DIRTY-WORKTREE FAIL-LOUD
#   → reset to the NAMED sha → conditional npm ci (lockfile diff, BEFORE build)
#   → build (writes dist/BUILD_SHA) → db:migrate → optional --pre-restart
#   → pm2 restart → POST-CONDITIONS asserted at the objects → record written
#   ONLY after assertions pass.
#
# The lock (OBJ-2/3/4): /home/deploy/dawntrader-deploy.lock — OUTSIDE the repo
# so no reset can touch the lock protecting it. mkdir is the atomic primitive.
# A second invocation is REFUSED (never queued) naming holder+sha+since. A
# stale lock is broken ONLY via the #540 tier-3 protocol, stated in the
# refusal text — never automatically.
#
# What this deliberately does NOT do:
#   - push anything (staging is TERMINAL — §7.1; this script contains no push
#     and never will)
#   - pm2 save (#652 — homed to P19-B12, NOT absorbed here; renumbered from a colliding #650)
#   - break its own stale lock
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/home/deploy/dawntrader"
LOCK_DIR="/home/deploy/dawntrader-deploy.lock"
RECORD="/home/deploy/dawntrader-deploy.record"
BRANCH="origin/migration/aws-supabase"
LIVENESS_URL="http://localhost:5000/api/health/liveness"

SHA="${1:-}"
PRE_RESTART=""
BY=""
USAGE="Usage: dt-deploy <full-40-char-sha> --by <cc-a|cc-b|cc-c|cc-infra|kyle|langston> [--pre-restart '<npm script>']"
shift $(( $# > 0 ? 1 : 0 ))
while [ $# -gt 0 ]; do
  case "$1" in
    # Step-4 (#656 review): a value matching -* is a swallowed FLAG, not a value
    # (an unset $SESSION in the documented full form collapses to exactly that —
    # the deploy would proceed with --pre-restart silently skipped); a repeat is
    # two claims with one silently discarded (refuse-not-guess, both arms).
    --by)          [ $# -ge 2 ] || { echo "dt-deploy: REFUSED — --by needs a value. $USAGE" >&2; exit 1; }
                   case "$2" in -*) echo "dt-deploy: REFUSED — --by value looks like a flag (${#2} chars, not echoed; an unset variable in a scripted call collapses to this). $USAGE" >&2; exit 1 ;; esac
                   [ -z "$BY" ] || { echo "dt-deploy: REFUSED — duplicate --by (${#BY} then ${#2} chars, neither echoed): two claims, refusing to pick one." >&2; exit 1; }
                   BY="$2"; shift 2 ;;
    --pre-restart) [ $# -ge 2 ] || { echo "dt-deploy: REFUSED — --pre-restart needs a value. $USAGE" >&2; exit 1; }
                   case "$2" in -*) echo "dt-deploy: REFUSED — --pre-restart value looks like a flag (${#2} chars, not echoed). $USAGE" >&2; exit 1 ;; esac
                   [ -z "$PRE_RESTART" ] || { echo "dt-deploy: REFUSED — duplicate --pre-restart." >&2; exit 1; }
                   PRE_RESTART="$2"; shift 2 ;;
    # B-DEPLOY-ACTOR-ALLOWLIST P2: the '=' form of a KNOWN flag fell to the
    # catch-all below, which echoed the WHOLE RAW TOKEN — the fourth echo site,
    # found at Step 2 and absent from the original three. Named here so the
    # message stays useful without carrying a user value: ${1%%=*} is the flag
    # name only, everything from the first '=' stripped.
    --by=*|--pre-restart=*)
                   echo "dt-deploy: REFUSED — ${1%%=*} takes a SPACE-separated value, not '='. $USAGE" >&2; exit 1 ;;
    *)             echo "dt-deploy: REFUSED — unrecognised argument (${#1} chars, not echoed). $USAGE" >&2; exit 1 ;;
  esac
done

fail() { echo "dt-deploy: REFUSED — $*" >&2; exit 1; }
# Step-8 (Langston): a no-op migrate is structurally unverifiable from outside —
# so the tool TIMESTAMPS its own chain, making every run its own transcript.
say() { echo "[$(date -u +%FT%T.%3NZ)] dt-deploy: $*"; }

# ── argument: a NAMED full sha, nothing else (OBJ-1; #621's lesson) ──────────
[ -n "$SHA" ] || fail "no sha given. $USAGE"
echo "$SHA" | grep -qE '^[0-9a-f]{40}$' || fail "'$SHA' is not a full 40-char sha. Deploys name their exact commit — no branches, no short forms, no HEAD."

# ── --by is REQUIRED (#656) and now CANONICAL (B-DEPLOY-ACTOR-ALLOWLIST) ─────
# Refuse-not-guess: an unattributed deploy defeats the record's bypass check.
#
# WHAT CHANGED AND WHY IT IS AN EXTENSION, NOT A BUG FIX. The original check was
# CHARSET-ONLY and its comment said why: keep the record's key=value line
# parseable. It did that correctly and never claimed to check identity. Since
# then #987 built ONE canonical actor table for the alert side, so the deploy
# side can stop being free text without minting a second list.
#
# THE SET IS DERIVED, NOT HAND-LISTED. ALERT_ACTORS tags every entry
# roster|machine|human. The DEPLOY set is the NON-MACHINE entries — 4 roster +
# 2 human = the six below — because governance-checker, its heartbeat and the
# soak verifier ACK ALERTS and have never deployed anything. Hand-listing six
# would be right today and silently wrong the first time a machine actor is
# added; server/tests/unit/dt-deploy-actor-parity.test.ts asserts the derivation.
#
# PARSEABILITY IS PRESERVED, AND IT MOVED FROM A REGEX TO A PROPERTY OF THE
# TABLE (that test asserts it): every canonical value is [A-Za-z0-9_-]+, so no
# space, no newline and no '=' can reach the record line. The three matter for
# three different reasons — '=' because the reader splits on it, space because
# of the note four lines below, and NEWLINE because $BY is interpolated into a
# heredoc at the record write: a newline would append a whole extra
# field=value LINE that the reader's '^sha=' grep would then match. That is
# record FORGERY, not a mangled name, and it is why the gate is not optional.
# The old {2,24} length bound was a PROXY for this and is not part of it.
#
# The observed deployed_via line DOES carry spaces — the record is read by
# splitting each line at its '=' , never sourced (Step-4 #656: stated, not
# implied; the one by-name reader uses `cut -d= -f2`).
#
# NORMALISE IS TOTAL: canonical value, or refuse. There is deliberately NO
# pass-through arm for input that "already looks canonical" — that arm is the
# only way a raw string could reach the record (Langston, Step-1). An unknown
# key, '@', '*' and a newline-bearing key all yield the empty string under
# ${A[$k]:-} — verified on this box, bash 5.2.21, not assumed from the manual.
declare -A DEPLOY_ACTORS=(
  # the SIX deploy-set canonical values, mapping to themselves
  [cc-a]=cc-a  [cc-b]=cc-b  [cc-c]=cc-c  [cc-infra]=cc-infra
  [kyle]=kyle  [langston]=langston
  # the SEVEN aliases — every target is inside the six; none collides with a
  # canonical value; none points at a machine actor. Union 6+7=13.
  [cc-a-old-claude]=cc-a
  [cc-analyst]=cc-c
  [cc-c-analyst]=cc-c
  [infra-claude]=cc-infra
  ["langston (reviewer)"]=langston
  [langston-reviewer]=langston
  [kyle-direct]=kyle
)
DEPLOY_ACTOR_LIST="cc-a | cc-b | cc-c | cc-infra | kyle | langston"

[ -n "$BY" ] || fail "no --by given. Every deploy names its session — the observed unix identity is the same for all of them, so without the claim the record cannot attribute this deploy. $USAGE"
# trim + lowercase, then EXACT lookup. Never a prefix, never a regex (#987 L3).
BY_KEY=$(printf '%s' "$BY" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
BY_CANON="${DEPLOY_ACTORS[$BY_KEY]:-}"
# The refusal NEVER echoes the rejected value (#987): the caller typed it, and an
# echoed value is itself a path to a record surface. Length + the set is enough.
# Step-4 CONDITION 3 (Langston): this principle now holds for EVERY refusal in
# this script, not just --by. It previously read as a general statement 78 lines
# below a live counterexample at :59, which echoed a raw --pre-restart value —
# fix-follows-pointer: the fix reached the four sites Step 2 named and missed the
# fifth, two lines away in the same `case`. :59 is de-echoed and the parity test
# now asserts all five, so the prose and the code agree.
[ -n "$BY_CANON" ] || fail "--by refused (${#BY} chars, not echoed). Accepted: $DEPLOY_ACTOR_LIST."
# The CANONICAL value is what gets recorded — at the lock holder and at the
# record — never the raw input. NOTE: 'kyle-direct', which this script itself
# advertised until now, therefore lands in the record as 'kyle'.
BY="$BY_CANON"

# ── THE LOCK (OBJ-2/3/4) — atomic mkdir; refuse, never queue ─────────────────
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  HOLDER=$(cat "$LOCK_DIR/holder" 2>/dev/null || echo "unknown")
  HSHA=$(cat "$LOCK_DIR/sha" 2>/dev/null || echo "unknown")
  SINCE=$(cat "$LOCK_DIR/since" 2>/dev/null || echo "unknown")
  HPID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "unknown")
  cat >&2 <<REFUSAL
dt-deploy: REFUSED — a deploy is already in progress.
  holder : $HOLDER (pid $HPID)
  sha    : $HSHA
  since  : $SINCE
A second deploy would silently replace theirs mid-verification (#647 class:
the loser is not told they lost). This refusal IS the system working.

If you believe this lock is STALE, do NOT delete it on that belief. The #540
tier-3 protocol is the ONLY sanctioned break, ALL THREE conditions:
  1. reported-blocking (someone is actually refused — you, now), AND
  2. no live deploy process: 'ps -p $HPID' empty across SEVERAL samples, AND
  3. lock mtime frozen >= 60s across a re-check:
     'stat -c %Y $LOCK_DIR' twice, 60s apart, identical.
Only then: rm -rf $LOCK_DIR — and say so in Discord #general in the same breath.
REFUSAL
  exit 2
fi
# C-7: INT/TERM/HUP too — an ssh disconnect mid-deploy must not strand the
# lock and force the manual tier-3 path this tool exists to make rare.
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM HUP
# holder = the SESSION CLAIM plus the observed unix identity (#656 revised
# #447's wording, not its principle: the claim is labelled a claim, the
# observed identity rides alongside — nothing claimed is dressed as proven).
echo "$BY ($(whoami)@$(hostname) via ${SUDO_USER:-direct})" > "$LOCK_DIR/holder"
echo "$SHA"        > "$LOCK_DIR/sha"
date -u +%FT%TZ    > "$LOCK_DIR/since"
echo "$$"          > "$LOCK_DIR/pid"

cd "$APP_DIR"

# ── fetch, then prove the sha is REAL and ON THE REVIEW BRANCH ───────────────
say "fetch"; git fetch origin
git cat-file -e "$SHA^{commit}" 2>/dev/null || fail "sha $SHA does not exist at origin"
git merge-base --is-ancestor "$SHA" "$BRANCH" || fail "sha $SHA is not on $BRANCH — staging deploys only reviewed refs (§7.1)"

# ── OBJ-7: NEVER reset through a dirty worktree — fail loud, discard nothing ─
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "dt-deploy: REFUSED — the worktree is DIRTY and reset --hard would DESTROY this:" >&2
  echo "$DIRTY" >&2
  echo "Disposition is a human call: commit it, stash it, or name it disposable — then rerun." >&2
  exit 3
fi

# ── conditional npm ci — F5: BEFORE build, on lockfile diff ──────────────────
DEPLOYED_SHA=$(git rev-parse HEAD)
git reset --hard "$SHA"
if ! git diff --quiet "$DEPLOYED_SHA" "$SHA" -- package-lock.json 2>/dev/null; then
  echo "dt-deploy: package-lock.json differs ($DEPLOYED_SHA -> $SHA) — npm ci"
  npm ci
else
  echo "dt-deploy: lockfile unchanged — npm ci skipped"
fi

# ── build (stamps the identity the post-condition asserts) ───────────────────
say "build begin"; npm run build
say "build end"
# C-4: the stamp is written BY the build script (identity is a property of the
# artifact, not of the deployer) — here we only ASSERT it matches the sha we
# reset to. A mismatch means the build did not build this worktree. Fail loud.
STAMPED=$(cat dist/BUILD_SHA 2>/dev/null || true)
[ "$STAMPED" = "$SHA" ] || fail "dist/BUILD_SHA is '$STAMPED', expected $SHA — the build did not stamp this worktree's sha"

# ── F1: the SYSTEM_MANUAL:12734 invariant — migrate BETWEEN build and restart ─
say "db:migrate begin"; MIG_T0=$(date +%s%3N); MIG_AT=$(date -u +%FT%TZ)
npm run db:migrate
MIG_MS=$(( $(date +%s%3N) - MIG_T0 )); say "db:migrate end (${MIG_MS}ms)"

# ── optional batch-specific step (F1) ────────────────────────────────────────
if [ -n "$PRE_RESTART" ]; then
  echo "dt-deploy: --pre-restart: npm run $PRE_RESTART"
  npm run "$PRE_RESTART"
fi

# ── restart + THE CONTIGUOUS CHECK-FAILURE WINDOW clock (pre-audit §3) ───────
WINDOW_START=$(date +%s)
say "pm2 restart"; pm2 restart dawntrader

# ── POST-CONDITIONS (CC-A's rule): asserted AT THE OBJECTS, record only after ─
# 1. live HEAD == requested sha — read from the clone, not this script's belief
LIVE_HEAD=$(git -C "$APP_DIR" rev-parse HEAD)
[ "$LIVE_HEAD" = "$SHA" ] || fail "post-condition FAILED: live HEAD $LIVE_HEAD != requested $SHA. NOTHING RECORDED."

# 2+3+4. process online, BUILD-IDENTITY response (never a bare 200 — a stale
#        process serves 200 perfectly well), and ENGINE RESUMED (a deploy that
#        leaves the engine down is not a finished deploy — Step-2).
DEADLINE=$(( $(date +%s) + 240 ))
ENGINE_OK=""
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  J=$(curl -sf --max-time 5 "$LIVENESS_URL" 2>/dev/null || true)
  # BLOCKER-1 (Langston Step-4, verified by execution): under pipefail, a
  # no-match grep exits 1 and a failing substitution trips set -e — and the
  # app is ALWAYS still booting on the first poll, so without || true this
  # loop died on iteration one, on every real deploy, ever.
  # patterns tolerate an optional space after the colon (Langston: a serializer
  # that ever emits `"engineExpected": true` would otherwise fail-closed a
  # HEALTHY deploy for 240s — right direction, expensive discovery).
  BS=$(echo "$J" | grep -o '"buildSha": *"[0-9a-f]*"' | cut -d'"' -f4 || true)
  EXPECTED=$(echo "$J" | grep -o '"engineExpected": *[a-z]*' | cut -d: -f2 | tr -d ' ' || true)
  RUNNING=$(echo "$J" | grep -o '"engineRunning": *[a-z]*' | cut -d: -f2 | tr -d ' ' || true)
  if [ "$BS" = "$SHA" ]; then
    # BLOCKER-3: FAIL-CLOSED — EXPECTED must be a literal true/false. An absent
    # or renamed field must fail the assertion, never satisfy it.
    if [ "$EXPECTED" = "false" ]; then ENGINE_OK=1; break; fi
    if [ "$EXPECTED" = "true" ] && [ "$RUNNING" = "true" ]; then ENGINE_OK=1; break; fi
  fi
  sleep 5
done
WINDOW_END=$(date +%s)
WINDOW=$(( WINDOW_END - WINDOW_START ))
[ -n "$ENGINE_OK" ] || fail "post-condition FAILED, check-failure window ${WINDOW}s at abort: buildSha=$BS (want $SHA) engineExpected=$EXPECTED engineRunning=$RUNNING. The deploy is NOT finished. NOTHING RECORDED."

# ── the record — written ONLY now, after every assertion passed (OBJ-6) ──────
# C-5: filter by process NAME — jlist carries pm2-logrotate too, and grep|head
# measured whichever serialised first (correct today by ordering luck only).
RESTART_TIME=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys;a=json.load(sys.stdin);print([p['pm2_env']['restart_time'] for p in a if p['name']=='dawntrader'][0])" 2>/dev/null || true)
cat > "$RECORD" <<EOF
sha=$SHA
restart_time=${RESTART_TIME:-unknown}
deployed_at=$(date -u +%FT%TZ)
deployed_by_claimed=$BY
deployed_via=$(whoami)@$(hostname) via ${SUDO_USER:-direct}
check_failure_window_s=$WINDOW
migrate_ran_at=$MIG_AT
migrate_ms=$MIG_MS
EOF
echo "dt-deploy: OK — $SHA live, engine resumed, identity asserted."
# Langston (Step-4b): this script BOUNDS the window, it does not measure the
# bands — the 240s poll deadline is BELOW the watchdog's 300s never-fires
# bound, so a success here is STRUCTURALLY incapable of reaching the 300-600s
# intermittent band (a slower deploy fails out above, window printed there).
# The old ">= 300s" warning was unreachable on every success path and is gone.
echo "dt-deploy: contiguous check-failure window: ${WINDOW}s — BOUNDED by the 240s poll deadline, structurally below the watchdog's 300s never-fires bound"
cat "$RECORD"
