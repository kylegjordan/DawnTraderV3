#!/usr/bin/env bash
# dt-deploy-drift.sh — B-DEPLOY-DRIFT-LINE (#1002), CC-A, 2026-09-05.
#
# WHY THIS EXISTS. Every deploy check we own compares the deployment against ITSELF:
# dt-deploy.sh:191 gates the deploy EVENT on branch membership, and daily_deploy_check.sh
# compares record.sha to dist/BUILD_SHA and to the staging clone's local HEAD. The REVIEW
# BRANCH is not an operand of any of them, so none can see the branch advancing after a
# deploy. Staging sat 55 commits behind with active-execution-engine.ts and
# signal-orchestrator.ts undeployed while paper trading was live, and every check read green.
#
# RUNS ON HELSINKI, AS langston, HOURLY. The `staging` host alias lives in
# /home/langston/.ssh/config and resolves ONLY for that user — as root it fails with
# "Could not resolve hostname staging" (measured at Step 2).
#
# NO CLONE, NO FETCH, NO WORKING COPY: git ls-remote for the branch head, the GitHub compare
# API for the range, one ssh read for the deployed sha. That deletes stale-ref risk by
# construction rather than by remembering to fetch.
set -uo pipefail

REPO="kylegjordan/DawnTraderV3"
API="https://api.github.com/repos/$REPO/compare"
BRANCH="migration/aws-supabase"
REMOTE="https://github.com/$REPO.git"
LOG="/var/log/dt-deploy-drift.log"

# ⛔ EXPLICIT HOST + IDENTITY, NOT THE `staging` ALIAS. The alias lives in
# /home/langston/.ssh/config, so it resolves ONLY when the process HOME is langston's.
# `sudo -u langston bash <script>` does NOT set HOME, so ssh reads /root/.ssh/config and the
# alias vanishes — caught by this job's own --dry-run, which correctly reported
# MEASUREMENT FAILED rather than a clean zero. An alias that depends on ambient environment
# is a hidden operand; the explicit form has none.
STAGING_SSH="deploy@188.245.193.8"
SSH_ID="/home/langston/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_ID -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --dry-run performs every read and writes NOTHING TO THE ALERT STORE. It still appends to
# $LOG and creates a scratch dir -- the guarantee is "cannot mint or resolve", not "cannot
# write at all", and the weaker claim is the true one. It exists because this job's first
DRY=0
BASE_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    # VERIFICATION ONLY, AND IT REFUSES TO WRITE. A drift instrument whose "zero" cannot be
    # distinguished from "always zero" is untestable, so the job must be pointable at a range
    # with a KNOWN non-zero answer. Forcing --dry-run here means a test can never mint.
    --base) shift; BASE_OVERRIDE="${1:-}"; DRY=1 ;;
    # A mistyped flag must REFUSE, not run live. Without this, `--dryrun` (one hyphen
    # short) leaves DRY=0 and the "a test can never mint" guarantee is void.
    *) echo "dt-deploy-drift: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "$TS $*" >> "$LOG"; [ "$DRY" = "1" ] && echo "LOG: $TS $*"; }

# ── MEASUREMENT FAILED IS A FIRST-CLASS OUTCOME, NOT A SILENT ZERO ────────────────────
# Three outcomes, never two: measured · zero · MEASUREMENT FAILED. The third NEVER renders
# as the second. Langston hit the reason live during this batch's own review: his curl -o
# got EACCES on a root-owned /tmp file, -s swallowed it, and -w HTTP:%{http_code} printed
# 200 on a transfer whose WRITE FAILED — he nearly ruled on a seven-week-old unrelated
# document. CC-A independently hit the same trap the same hour on the same host.
# ⇒ SUCCESS IS READ OFF THE EXIT STATUS. An HTTP 200 means the fetch happened, not that the
#   bytes landed. That is "exit 0 means the command RAN" one layer down — this job's own subject.
fail_measurement() {
  local operand="$1" detail="$2"
  log "MEASUREMENT_FAILED operand=$operand detail=$detail"
  mint_alert \
    "deploy-drift-measurement-failed" \
    "Deploy drift: MEASUREMENT FAILED ($operand)" \
    "The deploy-drift job could not complete a reading at $TS.

FAILED OPERAND: $operand
DETAIL: $detail

This is NOT a report that drift is zero. The job could not see. Distance is UNDEFINED until
this clears. Full reading history: $LOG on Helsinki.

RESOLVE this row (do not ack) once the operand is readable again — see #982: an ack silences
one rung; only a resolve clears it."
  exit 1
}

# Private scratch. NEVER a fixed /tmp path: two sessions collided on shared /tmp on this
# host inside one hour during this batch's own audit (#979, plan row 2.6).
WORK="$(mktemp -d /tmp/dt-drift-XXXXXX)" || { log "MEASUREMENT_FAILED operand=scratch detail=mktemp"; exit 1; }
trap 'rm -rf "$WORK"' EXIT

# ── MINT / RE-MINT ────────────────────────────────────────────────────────────────────
# The alert store lives on STAGING, so the supported write path is `ssh staging` + the CLI.
# This is a FREQUENCY INCREASE on the existing lock-free append, not a new writer class
# (Langston's correction) — it still lands on #647 / B-ALERT-QUEUE-INTEGRITY.
#
# SEVERITY: info. THE REASON IS THE CATEGORY, NOT THE SEVERITY — health_check is not in
# ALWAYS_DELIVER_CATEGORIES (server/services/system-alerts.ts:121-124), so shouldDeliverToDiscord()
# at :131-134 returns false and nothing is posted to #general. Delivery is CLASS-driven;
# severity-only delivery was the pre-2026-07-10 behaviour and B-GOV-INTEGRITY-1 changed it
# because 117 of 254 info alerts never reached Discord.
# ⚠️ A LATER CATEGORY CHANGE SILENTLY RE-ARMS DISCORD. Anyone reasoning from "info is quiet"
#    will not look here. That is why the reason is recorded as the class.
mint_alert() {
  # Strip apostrophes: title/body land inside a SINGLE-QUOTED remote command, and the
  # PARSE_ERROR detail is a python exception message, which can contain one. An unescaped
  # quote would break the remote command and the failure would be invisible.
  local q="'" 
  local key="${1//$q/}" title="${2//$q/}" body="${3//$q/}"
  local at; at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # triggers_at MUST be a real ISO-8601 stamp. fireDue compares it as a STRING
  # (system-alerts.ts:536), so the literal "now" is never <= an ISO timestamp and such a row
  # can NEVER fire. Measured at Step 2; filed separately, not fixed here.
  if [ "$DRY" = "1" ]; then
    echo "── WOULD MINT ──────────────────────────────────────────────"
    echo "dedupe_key: $key"
    echo "category:   health_check   severity: info   triggers_at: $at"
    echo "title:      $title"
    echo "body:"
    echo "$body" | sed 's/^/  /'
    echo "────────────────────────────────────────────────────────────"
    return 0
  fi
  ssh $SSH_OPTS "$STAGING_SSH" \
    "cd /home/deploy/dawntrader && npm run --silent system-alerts -- add \
       --triggers-at '$at' --category health_check --severity info \
       --dedupe-key '$key' --title '$title' --body '$body'" >> "$LOG" 2>&1
  local rc=$?
  # An ssh failure here means the alert was NEVER FILED. Saying so in the log is the only
  # trace left; swallowing it would make an unfiled alert look like a filed one.
  [ $rc -ne 0 ] && echo "$TS MINT_FAILED rc=$rc key=$key" >> "$LOG"
  return $rc
}

# ── OPERAND 1: the deployed sha ───────────────────────────────────────────────────────
DEPLOYED="$(ssh $SSH_OPTS -o ConnectTimeout=20 "$STAGING_SSH" \
  'cat /home/deploy/dawntrader/dist/BUILD_SHA' 2>>"$LOG")"
[ $? -ne 0 ] && fail_measurement "deployed_sha" "ssh to staging failed (exit status non-zero)"
[ -z "$DEPLOYED" ] && fail_measurement "deployed_sha" "dist/BUILD_SHA read back empty"

if [ -n "$BASE_OVERRIDE" ]; then
  echo "TEST MODE: base overridden $DEPLOYED -> $BASE_OVERRIDE (dry-run forced, no write possible)"
  DEPLOYED="$BASE_OVERRIDE"
fi

# The deploy RECORD must agree with what was BUILT. If they disagree the distance has an
# ambiguous base and any number derived from it is meaningless (#546).
RECORD=""
if [ -z "$BASE_OVERRIDE" ]; then
RECORD="$(ssh $SSH_OPTS "$STAGING_SSH" \
  "test -r /home/deploy/dawntrader-deploy.record && grep -E '^sha=' /home/deploy/dawntrader-deploy.record | tail -1 | cut -d= -f2 || echo __NO_RECORD__" 2>>"$LOG")"
fi
# An UNREADABLE record is not agreement. Before this guard, a missing or renamed record
# returned empty and the comparison was skipped, so the base read as verified when it was
# never checked -- the #546 shape inside the check that cites #546.
if [ "$RECORD" = "__NO_RECORD__" ]; then
  fail_measurement "deploy_record" "the deploy record is missing or unreadable, so the base sha cannot be corroborated against dist/BUILD_SHA. Not treated as agreement."
fi
if [ -n "$RECORD" ] && [ "$RECORD" != "$DEPLOYED" ]; then
  fail_measurement "base_ambiguous" "dist/BUILD_SHA=$DEPLOYED disagrees with record.sha=$RECORD — publishing which two shas disagree, never a number derived from them"
fi

# ── OPERAND 2: the branch head ────────────────────────────────────────────────────────
HEAD_SHA="$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" 2>>"$LOG" | cut -f1)"
[ $? -ne 0 ] || [ -z "$HEAD_SHA" ] && fail_measurement "branch_head" "git ls-remote failed or returned empty"

# ── THE COMPARE ───────────────────────────────────────────────────────────────────────
# ⛔⛔ THE PAGINATION PARAMETER IS LOAD-BEARING AND MUST NOT BE REMOVED AS REDUNDANT.
# WITHOUT it the API returns a TRAILING WINDOW of the range, not the first page — measured
# on a 2,486-commit range: commits[0] was position 2,237, dating 2026-09-03 when the true
# oldest was 2026-07-20. The age would read 2 days against a truth of 47, and it would
# under-state MOST when the gap is LARGEST — the alarm fading out as the problem grows.
# WITH any pagination parameter the API returns page 1, oldest-first. `per_page=100` is
# numerically SMALLER than the implicit cap, so it cannot change how many are dropped —
# only which end we are handed.
fetch() {
  local url="$1" out="$2"
  curl -sS --max-time 25 -o "$out" "$url" 2>>"$LOG"
  return $?   # EXIT STATUS, never the HTTP code — see fail_measurement's header
}

fetch "$API/$DEPLOYED...$HEAD_SHA?page=1&per_page=100" "$WORK/cmp.json" \
  || fail_measurement "compare_api" "curl exit status non-zero (the bytes did not land; an HTTP 200 would not have told us)"
[ -s "$WORK/cmp.json" ] || fail_measurement "compare_api" "compare response empty"

READ="$(python3 - "$WORK/cmp.json" <<'PY'
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("PARSE_ERROR %s" % e); raise SystemExit(0)

status = d.get('status')            # identical | ahead | behind | diverged
if status is None:
    print("PARSE_ERROR no status field (rate limited or 404/422?)"); raise SystemExit(0)

total   = d.get('total_commits') or 0
commits = d.get('commits') or []
files   = d.get('files') or []

# DIRECTION IS READ, NEVER INFERRED FROM A SIGN. `behind`/`diverged` means the deployed sha
# carries commits absent from the branch — an ANOMALY, not a distance — so it is its own
# outcome and never a drift magnitude.
if status in ('behind', 'diverged'):
    print("ANOMALY %s %d" % (status, total)); raise SystemExit(0)
if status == 'identical' or total == 0:
    print("ZERO"); raise SystemExit(0)

# The FILE array is capped at 300 regardless of pagination (measured: 300 returned against a
# local truth of 761), and no Link header or `truncated` flag is emitted. So a full list is
# only trustworthy below the cap.
RUNTIME = ('server/', 'client/', 'shared/')
def runtime(f):
    return f.startswith(RUNTIME) and '/tests/' not in f and not f.endswith('.test.ts')

names = [f['filename'] for f in files]
runtime_files = [f for f in names if runtime(f)]
files_capped = len(files) >= 300

# commits[0] of page 1 is the ANCESTRALLY first commit in the range. On a fast-forward-only
# branch (§7.1) that is also the date-oldest; stated as an assumption about the branch's
# shape, not proved here.
oldest = commits[0]['commit']['committer']['date']
age_h = (datetime.datetime.now(datetime.timezone.utc)
         - datetime.datetime.fromisoformat(oldest.replace('Z', '+00:00'))).total_seconds() / 3600.0

print("OK %s %d %.2f %s %d %d %s" % (
    status, total, age_h, oldest, len(runtime_files),
    1 if files_capped else 0, ','.join(runtime_files[:12])))
PY
)"

# THE FOURTH OUTCOME THAT MUST NOT EXIST. If the reader produced nothing -- python3 absent,
# the heredoc failing, an uncaught IndexError on an empty commits[] -- then `set -- $READ`
# leaves no positionals and $3 kills the script under `set -u`, with no alert and no log
# line, and the cron entry discards stderr. That is an instrument reporting an absence it
# was never able to detect: this batch's own subject, rebuilt inside the fix.
case "$READ" in
  ""|" ") fail_measurement "compare_reader" "the compare reader produced no output at all (python3 missing, or an uncaught exception outside its json guard)" ;;
esac

case "$READ" in
  PARSE_ERROR*) fail_measurement "compare_api" "${READ#PARSE_ERROR }" ;;
  ANOMALY*)
    set -- $READ
    fail_measurement "direction_anomaly" "compare status=$2 — the deployed sha carries $3 commit(s) absent from $BRANCH. This is an anomaly (force-push? deploy of an unmerged ref?), not a distance."
    ;;
esac

# ── main ARM: MEASURED, LOGGED, NEVER FIRED ON ────────────────────────────────────────
# Plan row 4.55 asks for it. Deployed-vs-main is a GOVERNANCE-BACKLOG number, not a runtime-risk
# number — main advances only at batch close — so firing on it would desensitise the alert we
# actually need.
MAIN_SHA="$(git ls-remote "$REMOTE" refs/heads/main 2>>"$LOG" | cut -f1)"
if [ -n "$MAIN_SHA" ] && fetch "$API/$DEPLOYED...$MAIN_SHA?page=1&per_page=100" "$WORK/main.json"; then
  MAIN_READ="$(python3 -c "
import json,sys
d=json.load(open('$WORK/main.json'))
print('%s %s' % (d.get('status'), d.get('total_commits')))" 2>>"$LOG")"
  log "main_arm $MAIN_READ (logged only, never fires)"
fi

if [ "$READ" = "ZERO" ]; then
  log "ZERO deployed=$DEPLOYED head=$HEAD_SHA — resolving any open drift rows"
  ssh $SSH_OPTS "$STAGING_SSH" \
    "cd /home/deploy/dawntrader && npm run --silent system-alerts -- list --state active" \
    > "$WORK/active.txt" 2>>"$LOG"
  # RETURN TO ZERO RESOLVES EVERY RUNG — the level is cleared, not just the current one.
  # ⛔ PARSE THE TEXT, NOT JSON. `system-alerts list` prints padded human-readable lines
  #   carrying `id=<uuid>` (cmdList, scripts/system-alerts.ts:256-272) and has no --json
  #   flag. An earlier revision json.load()ed this and swallowed the exception, so the
  #   resolve loop was a PERMANENT SILENT NO-OP while the alert body promised operators
  #   that deploying would clear it. Caught before install; it had no test because both
  #   evidence runs were non-zero and never reached this branch.
  # The list output carries no dedupe_key, so rows are matched on the TITLE this job mints.
  RESOLVED_N=0
  while read -r ID; do
    [ -z "$ID" ] && continue
    if [ "$DRY" = "1" ]; then
      echo "WOULD RESOLVE $ID"
    else
      ssh $SSH_OPTS "$STAGING_SSH" \
        "cd /home/deploy/dawntrader && npm run --silent system-alerts -- resolve $ID --by cc-a --evidence '#1002'" >> "$LOG" 2>&1
    fi
    RESOLVED_N=$((RESOLVED_N + 1))
  done <<EOF
$(grep -E "Deploy drift" "$WORK/active.txt" 2>/dev/null | grep -oE "id=[0-9a-f-]{36}" | cut -d= -f2)
EOF
  log "ZERO resolved=$RESOLVED_N drift rows"
  exit 0
  exit 0
fi

set -- $READ                # OK status total age_h oldest_iso runtime_count capped list
TOTAL="$3"; AGE_H="$4"; OLDEST="$5"; RUNTIME_N="$6"; CAPPED="$7"; LIST="${8:-}"

# ── THE RUNG: A BOUNDED, MONOTONE AGE BUCKET ON THE DEDUPE KEY ────────────────────────
# Four rungs, escalate only, return-to-zero resolves all. This is entirely PRODUCER-side:
# dedupe keys are the producer's to choose, so it alters no consumer contract — which is the
# property the withdrawn "resolve-and-re-mint per acked run" design lacked.
# An ack then silences ONE RUNG; worsening drift crosses into a new key and re-mints on its own.
AGE_INT="${AGE_H%.*}"
if   [ "$AGE_INT" -ge 72 ]; then RUNG=4
elif [ "$AGE_INT" -ge 24 ]; then RUNG=3
elif [ "$AGE_INT" -ge 8 ];  then RUNG=2
else                             RUNG=1
fi

# ⛔ THE FILE GATE ANNOTATES; IT NEVER GATES EMISSION (Langston). When the file list is at its
# cap the AGE operand is still measured and sound, so the alert fires at its rung and carries
# runtime_path: UNDECIDABLE. 300 is a CAP, not a measurement — a saturated gauge cannot order
# anything, so it must not become a rung.
if [ "$CAPPED" = "1" ]; then
  RUNTIME_LINE="runtime_path: UNDECIDABLE — the changed-file list is at its 300 cap, so whether runtime code is undeployed cannot be determined from it. The age below is unaffected."
  mint_alert "deploy-drift-file-gate-undecidable" \
    "Deploy drift: runtime-path gate UNDECIDABLE (file list capped)" \
    "The compare returned a changed-file list at its 300 cap at $TS, so the runtime-path gate could not be evaluated. The age reading is sound and is reported separately. deployed=$DEPLOYED head=$HEAD_SHA"
else
  RUNTIME_LINE="runtime files undeployed: $RUNTIME_N${LIST:+ — $LIST}"
fi

# ── THE BODY: EVERY MAGNITUDE CARRIES ITS STAMP ───────────────────────────────────────
# A re-surfaced alert replays its MINT-TIME snapshot: alert 03fad8a4 showed 67.8% for eight
# days while the live gauge read 76.9%. Drift moves hourly, so an UNSTAMPED number in a
# re-surfacing body is wrong on nearly every surfacing. A magnitude may sit here only if it
# carries its observation timestamp and the two shas it was computed from.
mint_alert "deploy-drift-rung-$RUNG" \
  "Deploy drift rung $RUNG: staging is ${AGE_INT}h behind the review branch" \
"AS AT $TS, deployed $DEPLOYED vs $BRANCH head $HEAD_SHA:

  oldest undeployed commit: $OLDEST  (${AGE_INT}h — this is the PRIMARY reading)
  commits behind:           $TOTAL
  $RUNTIME_LINE

The age is an UPPER BOUND on the age of the oldest RUNTIME-touching commit: the gate asks
whether the range touches runtime paths at all, and the magnitude is the oldest commit in the
range. It over-states rather than under-states, which is the safe direction for a reporting
trigger. It is NOT 'the oldest runtime commit'.

⛔ RESOLVE this row, do not ACK it. An ack silences THIS RUNG only (#982 — there is no unack
verb); worsening drift crosses into a new rung and re-mints on its own. Deploying clears every
rung on the next run.

Current value — never read the numbers above as current, they are stamped: $LOG on Helsinki."

log "RUNG=$RUNG age=${AGE_INT}h total=$TOTAL runtime=$RUNTIME_N capped=$CAPPED deployed=$DEPLOYED head=$HEAD_SHA"
