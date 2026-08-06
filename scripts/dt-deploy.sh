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
USAGE="Usage: dt-deploy <full-40-char-sha> --by <session: CC-A|CC-B|CC-C|kyle-direct|langston> [--pre-restart '<npm script>']"
shift $(( $# > 0 ? 1 : 0 ))
while [ $# -gt 0 ]; do
  case "$1" in
    --by)          [ $# -ge 2 ] || { echo "dt-deploy: REFUSED — --by needs a value. $USAGE" >&2; exit 1; }; BY="$2"; shift 2 ;;
    --pre-restart) [ $# -ge 2 ] || { echo "dt-deploy: REFUSED — --pre-restart needs a value. $USAGE" >&2; exit 1; }; PRE_RESTART="$2"; shift 2 ;;
    *)             echo "dt-deploy: REFUSED — unrecognised argument: $1. $USAGE" >&2; exit 1 ;;
  esac
done

fail() { echo "dt-deploy: REFUSED — $*" >&2; exit 1; }
# Step-8 (Langston): a no-op migrate is structurally unverifiable from outside —
# so the tool TIMESTAMPS its own chain, making every run its own transcript.
say() { echo "[$(date -u +%FT%T.%3NZ)] dt-deploy: $*"; }

# ── argument: a NAMED full sha, nothing else (OBJ-1; #621's lesson) ──────────
[ -n "$SHA" ] || fail "no sha given. $USAGE"
echo "$SHA" | grep -qE '^[0-9a-f]{40}$' || fail "'$SHA' is not a full 40-char sha. Deploys name their exact commit — no branches, no short forms, no HEAD."

# ── --by is REQUIRED (#656): the record must say WHICH SESSION deployed ──────
# Refuse-not-guess: an unattributed deploy defeats the record's bypass check.
# Tight charset keeps the record line parseable (no spaces/newlines injected).
[ -n "$BY" ] || fail "no --by given. Every deploy names its session — the observed unix identity is the same for all of them, so without the claim the record cannot attribute this deploy. $USAGE"
echo "$BY" | grep -qE '^[A-Za-z0-9_-]{2,24}$' || fail "'--by $BY' must be 2-24 chars of [A-Za-z0-9_-] (e.g. CC-B, kyle-direct)."

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
