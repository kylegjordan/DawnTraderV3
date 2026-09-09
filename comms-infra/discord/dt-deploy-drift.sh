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
# -n IS LOAD-BEARING: without it ssh READS STDIN, and in the resolve loop stdin is the list
# being iterated. Measured by Langston on this host, same key, 3 ids in: 1 of 3 resolved
# without -n, 3 of 3 with it. The loop that could never resolve became one that resolves one.
SSH_OPTS="-n -i $SSH_ID -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

# ⛔ THE ACTOR IS A MACHINE IDENTITY, NOT A SESSION (#987/#1004): an hourly robot must not
#   claim a roster name, and the gate cannot catch it because it passes.
# ⛔⛔ STEP-6 INSTALL ORDER IS A PRECONDITION, NOT A NOTE. `deploy-drift-monitor` must be
#   PRESENT IN THE DEPLOYED SOURCE before this cron is installed — the CLI is `tsx
#   scripts/system-alerts.ts`, i.e. source-run, so staging enforces whatever tree it is at.
#   Install the cron first and every ZERO run's resolve is refused → FAILED_N>0 → mints
#   `deploy-drift-measurement-failed-resolve` → whose key starts `deploy-drift-` → the next
#   ZERO picks it up → refused → re-mints. UNCLEARABLE, live.
#   ⚠️ STALE AS OF #1021 (round-3): the sweep no longer selects
#     'deploy-drift-measurement-failed-*' at all, so that key is never picked up and this
#     particular loop cannot form. THE INSTALL-ORDER PRECONDITION BELOW STILL STANDS on its
#     own merits; only the mechanism sentence above is dead. Left in place rather than deleted
#     because it records why the precondition exists.
#   ORDER: deploy the actor, verify with a RETURNING `grep -c deploy-drift-monitor` on the
#   staging worktree, and only then install the cron.
ACTOR="deploy-drift-monitor"
ALERTS="/var/log/dawntrader/system-alerts.jsonl"
MAIN_STAMP="/var/lib/dt-deploy-drift/main-arm.stamp"
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
    --base)
      shift
      # A missing value must REFUSE. `${1:-}` left it empty and the run proceeded against
      # the REAL deployment while looking like a test.
      [ -z "${1:-}" ] && { echo "dt-deploy-drift: --base requires a sha" >&2; exit 2; }
      BASE_OVERRIDE="$1"; DRY=1 ;;
    # A mistyped flag must REFUSE, not run live. Without this, `--dryrun` (one hyphen
    # short) leaves DRY=0 and the "a test can never mint" guarantee is void.
    *) echo "dt-deploy-drift: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# `; return 0` IS LOAD-BEARING. The last command was the [ "$DRY" = "1" ] test, FALSE on a
# live run, so log() returned 1 — and log() is the last line of this script, so a run that
# measured, minted and logged correctly exited 1, identical to fail_measurement. This
# file's own header says success is read off the exit status; that was false of its own.
log() { echo "$TS $*" >> "$LOG"; [ "$DRY" = "1" ] && echo "LOG: $TS $*"; return 0; }

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
    # THE OPERAND IS IN THE KEY. One key for every failure pins the FIRST operand's body and
    # replays it for every later, different failure — this file's own stale-magnitude lesson.
  # NOTHING MAY SIT BETWEEN A LINE-CONTINUATION AND ITS ARGUMENTS. A comment here ENDS the
  #   logical line, so mint_alert ran with ZERO ARGUMENTS and every MEASUREMENT FAILED path
  #   was STORE-SILENT -- this batch's own subject, rebuilt inside the batch, by the comment
  #   that explained the fix. `bash -n` exits 0 on it. Langston extracted the block and RAN
  #   it; that is what caught it, and running it is now the only check that would.
  mint_alert \
    "deploy-drift-measurement-failed-$operand" \
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
# STATED PROPERTY, not an accident of ordering (Langston): a scratch-dir failure here is
# STORE-SILENT, because mint_alert is not defined until further down. It logs and exits 1.
# That is acceptable only because it cannot be confused with a clean run -- the exit status
# is 1 and nothing is minted, so no row ever claims a reading that did not happen.
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
# THE READ IS SPLIT FROM THE PARSE. Previously the remote command was
#   test -r … && grep … | cut … || echo __NO_RECORD__
# and the || bound to a PIPELINE whose status is cut's, so a record present but carrying no
# sha= line exited 0, the sentinel never fired, RECORD came back empty and [ -n "$RECORD" ]
# SKIPPED the comparison. Absent-as-valid inside the check that cites #546. Parsing locally
# removes the remote pipeline from the status path entirely.
RECORD_RAW="$(ssh $SSH_OPTS "$STAGING_SSH" 'cat /home/deploy/dawntrader-deploy.record' 2>>"$LOG")"
RECORD_RC=$?
[ $RECORD_RC -ne 0 ] && fail_measurement "deploy_record" "could not read the deploy record (ssh exit $RECORD_RC). An unreadable record is NOT agreement."
RECORD="$(echo "$RECORD_RAW" | grep -E '^sha=' | tail -1 | cut -d= -f2)"
# FINDING 6 of my six: a rebase rewrites committer dates, so publish a magnitude it cannot
# rewrite alongside the one it can.
DEPLOYED_AT="$(echo "$RECORD_RAW" | grep -E '^deployed_at=' | tail -1 | cut -d= -f2)"
[ -z "$RECORD" ] && fail_measurement "deploy_record" "the deploy record carries no sha= line, so the base cannot be corroborated against dist/BUILD_SHA. Not treated as agreement."
# An UNREADABLE record is not agreement. Before this guard, a missing or renamed record
# returned empty and the comparison was skipped, so the base read as verified when it was
# never checked -- the #546 shape inside the check that cites #546.
if [ -z "$BASE_OVERRIDE" ] && [ "$RECORD" != "$DEPLOYED" ]; then
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

READ="$(python3 - "$WORK/cmp.json" "$WORK/rtlist.txt" <<'PY'
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("PARSE_ERROR %s" % e); raise SystemExit(0)

status = d.get('status')
# VALIDATE AGAINST THE KNOWN SET, NOT AGAINST None. GitHub's ERROR bodies carry their own
# `status` field -- a 404 returns {"message":"Not Found","status":"404"} -- so a
# `status is None` guard NEVER FIRES on the case it was written for. With total_commits
# absent, `total = ... or 0` then made the zero test true and a 404 RENDERED AS ZERO:
# all-clear, from an instrument that could see nothing at all. That is this batch's own
# subject, and it survived two reviews; my own end-to-end test on a garbage sha caught it.
VALID = ('identical', 'ahead', 'behind', 'diverged')
if status not in VALID:
    print("PARSE_ERROR compare returned status=%r (not one of %s); api_message=%r"
          % (status, "|".join(VALID), d.get("message") or "(none)"))
    raise SystemExit(0)

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
# ── THE PREDICATE: WHICH CHANGED PATHS CAN ALTER THE RUNNING SYSTEM AFTER THE RESTART ──────
# ⛔⛔ NOT "what the deploy EXECUTES". #1016's fix sentence says that, and taken literally it
#   selects EVERY TRACKED FILE: dt-deploy.sh:204 is `git reset --hard "$SHA"`, which rewrites
#   the whole working tree before anything runs. A criterion that admits everything is not a
#   gate. DO NOT "simplify" this back to that sentence.
# ⇒ THE CRITERION IS FOUR SINKS. Every entry below names the one it feeds and the line that
#   carries it there. An entry with no sink does not belong here.
# ⚠️ AND IT IS A JUDGEMENT, said out loud: #1016's wording hid one inside what looked like a
#   mechanical derivation. B-DRIFT-RUNTIME-PREDICATE, #1016, Step 2 audit.

# SINK 1 — what ends up in dist/, the bundle pm2 re-execs.  dt-deploy.sh:213 `npm run build`
#   = `vite build` + `esbuild server/index.ts --bundle`.
SINK1_PREFIXES = ('server/', 'client/', 'shared/')
SINK1_FILES    = ('vite.config.ts', 'tsconfig.json', 'tailwind.config.ts', 'postcss.config.js')
# ⚠️ NO root 'index.html' entry: it does not exist. `vite.config.ts:18` sets root=<repo>/client,
#   so the only such tracked path is client/index.html, already covered by the SINK1 prefix.
#   As a prefix entry it would match nothing while READING as coverage.

# SINK 2 — what the database SCHEMA becomes.  dt-deploy.sh:223 `npm run db:migrate`
#   = `tsx scripts/db-migrate.ts` over drizzle/migrations/**.
# ⛔ MANIFEST.txt is NOT an ordinary file in that directory: db-migrate.ts:140-148 THROWS on
#   manifest/filesystem drift, and :152-156 validates on EVERY invocation — before filtering
#   by what is already applied — so a drifted manifest FAILS A DEPLOY THAT HAD NO MIGRATIONS
#   TO RUN. It aborts at :223, AFTER the build at :213 has overwritten dist/.
SINK2_PREFIXES = ('drizzle/migrations/',)
SINK2_FILES    = ('scripts/db-migrate.ts',)

# SINK 3 — what the process RESOLVES at runtime.  dt-deploy.sh:202-207, a conditional
#   `npm ci` triggered by a package-lock.json diff. (package.json defines no pre/post
#   lifecycle hooks, so `npm ci`/`npm run` add no hidden file reads.)
SINK3_FILES = ('package-lock.json', 'package.json')

# SINK 4 — what the process READS OFF DISK at runtime.
# ★ esbuild bundles IMPORTS, never readFile TARGETS, so these reach no other sink. Enumerated
#   by CALL SHAPE (readFileSync / fs.readFile / readdirSync / createReadStream / require /
#   dynamic import / static json import) across 586 tracked .ts under server/+shared/, tests
#   excluded — see the Step-2 audit. Reader cited per entry; re-derive, do not trust the list.
SINK4_FILES = (
    'audit/coherency_rules.yaml',                                  # guardrail-policy.ts:191; module singleton :742; THROWS :197. THE CORE-FOUR RISK ENVELOPE.
    'config/vts.json',                                             # vts-runner.ts:519 — targetProfit / stopLoss / minVolume24h / strategies[]
    '1-system-manual/authority-baseline-v1.json',                  # authority-baseline.ts:88, boot via boot_orchestrator.ts:76
    '1-system-manual/audits/b-new-42/dividend-calendar-seed.json', # price-discontinuity-detector.ts:157 — live service
    'bridge/canonical/phase9_predictive-learning.json',            # recalibrate-predictive-weights.ts:221,:273 (NOT regime-archiver.ts:26 — that is a declaration)
    'bridge/canonical/mapping-regime-strategy.json',               # routes.ts:2083-2085 reads from DISK; strategy-mapper.ts:22 is a bundled static import
    'data/models/ara_model.json',                                  # training-audit-service.ts:159. SINGLE FILE, never a data/models/** prefix — it is the only tracked file there.
    'replit.md',                                                   # context-loader.ts:88, boot via index.ts:624 (a DYNAMIC import — invisible to an `import … from` census)
)
# ⛔ PERMANENT LIMIT, NOT A GAP TO CLOSE: a path built at runtime from a variable is
#   unreachable by any grep, so this list is a FLOOR. Four such sites exist; three target
#   logs/ (gitignored ⇒ untracked ⇒ cannot qualify) and the fourth is the ara_model entry.
# ⛔ scripts/analysis/* is OUT and scripts/db-migrate.ts is IN — a SINK test, not a folder
#   test, and not an exclusion list (an exclusion list is the same folder convention renamed).
# ⛔ DELIBERATELY NOT COUPLED TO scripts/governance-checker/config.mjs:92 CODE_PREFIXES,
#   which is wider (adds scripts/, drizzle/). It answers "is this COMMIT code-bearing" for
#   doc-set grading (checker.mjs:85); this answers "does this need a DEPLOY". No import, no
#   shared constant — a future edit to either for its own reasons must not move the other.

def runtime(f):
    if f.startswith(SINK1_PREFIXES):
        return '/tests/' not in f and not f.endswith('.test.ts')
    if f.startswith(SINK2_PREFIXES):
        # ⛔ A ROLLBACK .sql REACHES NO SINK AND MUST NOT OPEN THE GATE. db-migrate.ts:118
        #   filters `!includes('rollback')` out of the executed set, and :120-125 THROWS if
        #   one is even LISTED in the manifest — they are never run. MEASURED: 87 of the 247
        #   tracked migration .sql are rollbacks, so without this a rollback-only range fires
        #   the alert on a file that can never execute. This mirrors db-migrate's own filter
        #   deliberately: if that filter changes, this one is wrong and must follow it.
        return 'rollback' not in f.lower()
    return f in SINK1_FILES or f in SINK2_FILES or f in SINK3_FILES or f in SINK4_FILES

# ⛔⛔ A RENAME IS CHECKED ON *BOTH* NAMES. Renaming a sink file OUT of its path (say
#   config/vts.json -> config/vts-old.json) leaves only the new, unmatched name in
#   files[].filename, so the gate would report all-clear on a state it could not see —
#   this batch's own subject. `previous_filename` is present on renamed entries.
# ⚠️ I scoped this out at Step 4 as a stated limit; Langston ruled that wrong — it is one
#   `or`, and stating a limit you can close in one line is not a disposition.
# ★ The CURRENT filename is what gets reported, so a rename shows the path a reader can
#   still find; qualifying on either name only decides WHETHER it is reported.
def qualifies(entry):
    if runtime(entry['filename']):
        return True
    prev = entry.get('previous_filename')
    return bool(prev) and runtime(prev)

runtime_files = [f['filename'] for f in files if qualifies(f)]
files_capped = len(files) >= 300

# commits[0] of page 1 is the ANCESTRALLY first commit in the range. On a fast-forward-only
# branch (§7.1) that is also the date-oldest; stated as an assumption about the branch's
# shape, not proved here.
if not commits:
    print("PARSE_ERROR status=%s total=%d but commits[] empty" % (status, total)); raise SystemExit(0)

oldest = commits[0]['commit']['committer']['date']
age_h = (datetime.datetime.now(datetime.timezone.utc)
         - datetime.datetime.fromisoformat(oldest.replace('Z', '+00:00'))).total_seconds() / 3600.0

# THE FILE LIST DOES NOT RIDE THE POSITIONAL LINE. `set -- $READ` word-splits, and this repo
# has tracked paths containing spaces (1,653 of them), so a filename on that line could shift
# a scalar. It does not: only len(runtime_files) rides the line, and the LIST is written here
# to its own file and read back with `head -12 | paste -sd,` -- SAFE BY CONSTRUCTION.
# ⚠️ THIS COMMENT USED TO SAY "safe today only because runtime() filters to three space-free
#   prefixes -- safe by a coincidence of the filter, not by construction." THAT REASON IS NOW
#   FALSE: the predicate admits fifteen exact-match paths as well, and the coincidence was
#   never what made it safe -- the separate file was. Langston caught the stale reason at
#   Step 4. A header comment that records a false REASON is a first-class false source, even
#   when its conclusion still holds.
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(runtime_files))
print("OK %s %d %.2f %s %d %d" % (status, total, age_h, oldest, len(runtime_files), 1 if files_capped else 0))
PY
)"

# THE FOURTH OUTCOME THAT MUST NOT EXIST. If the reader produced nothing -- python3 absent,
# the heredoc failing, an uncaught IndexError on an empty commits[] -- then `set -- $READ`
# leaves no positionals and $3 kills the script under `set -u`, with no alert and no log
# line, and the cron entry discards stderr. That is an instrument reporting an absence it
# was never able to detect: this batch's own subject, rebuilt inside the fix.

case "$READ" in
  # RESTORED r5. r4 deleted this arm believing the two case blocks were duplicates — they were
  #   DISJOINT, and the dedup matched on the opening line alone. The explanation above survived
  #   over a block that no longer handled the case it described. Same shape as the comment that
  #   broke mint_alert: an edit in a comment region destroying a live statement, invisible to
  #   `bash -n`. One block now, so the comment cannot be orphaned from the arm again.
  ""|" ") fail_measurement "compare_reader" "the compare reader produced no output at all (python3 missing, the heredoc failing, or an uncaught exception outside its json guard)" ;;
  PARSE_ERROR*) fail_measurement "compare_api" "${READ#PARSE_ERROR }" ;;
  ANOMALY*)
    set -- $READ
    # SAME GUARD, SAME REASON, TWENTY LINES UP. The class member Langston named got the
    # count guard and the one he did not name did not -- fix-follows-pointer landing on
    # the very commit that recorded it. A truncated "ANOMALY behind" would read $3 under
    # `set -u` and die with no mint, no log line, and stderr discarded by cron.
    [ $# -eq 3 ] || fail_measurement "compare_reader" "malformed ANOMALY result, $# field(s): ${READ:0:120}"
    fail_measurement "direction_anomaly" "compare status=$2 — the deployed sha carries $3 commit(s) absent from $BRANCH. This is an anomaly (force-push? deploy of an unmerged ref?), not a distance."
    ;;
esac

# ── main ARM: MEASURED, LOGGED, NEVER FIRED ON ────────────────────────────────────────
# Plan row 4.55 asks for it. Deployed-vs-main is a GOVERNANCE-BACKLOG number, not a runtime-risk
# number — main advances only at batch close — so firing on it would desensitise the alert we
# `main` advances only at batch close, so hourly was 24 calls/day for a number that NEVER
# FIRES, against a 60/hr unauthenticated budget shared with the */2 push notice on the same
# IP — and exhaustion converts into MEASUREMENT FAILED noise. Once a day is enough for a
# governance-backlog figure.
MAIN_TODAY="$(date -u +%Y-%m-%d)"
if [ "$(cat "$MAIN_STAMP" 2>/dev/null)" != "$MAIN_TODAY" ]; then
  MAIN_SHA="$(git ls-remote "$REMOTE" refs/heads/main 2>>"$LOG" | cut -f1)"
  if [ -n "$MAIN_SHA" ] && fetch "$API/$DEPLOYED...$MAIN_SHA?page=1&per_page=100" "$WORK/main.json"; then
    # VALIDATE AGAINST THE SAME KNOWN SET AS THE PRIMARY READER. json.load SUCCEEDS on an
    # error body, so an emptiness test catches only the throw — the case that actually happens
    # returns "404 None" or "None None", both non-empty, both of which stamped the day and
    # logged a line that reads like a status. My own MISTAKE line named this class and the fix
    # had travelled only to the instance Langston pointed at.
    MAIN_READ="$(python3 -c "
import json
d=json.load(open('$WORK/main.json'))
s=d.get('status')
print('%s %s' % (s, d.get('total_commits')) if s in ('identical','ahead','behind','diverged') else 'INVALID %s %s' % (s, d.get('message')))" 2>>"$LOG")"
    # STAMP ON A PARSED STATUS, NEVER ON THE FETCH ALONE. If the parse errored, $() was empty,
    # the line logged as `main_arm  (logged only...)` with nothing in it, the daily budget was
    # spent and the stamp was written anyway -- so the reading was lost AND the retry suppressed.
    if [ -n "$MAIN_READ" ] && [ "${MAIN_READ#INVALID}" = "$MAIN_READ" ]; then
      log "main_arm $MAIN_READ (logged only, never fires)"
      if ! echo "$MAIN_TODAY" > "$MAIN_STAMP" 2>/dev/null; then
        log "main_arm STAMP_UNWRITABLE ($MAIN_STAMP) — the daily cap is NOT in effect"
      fi
    else
      # NOT STAMPED: a failed reading must not spend the day's budget AND suppress the retry.
      log "main_arm FAILED ${MAIN_READ:-(empty)} — not stamped; the next run retries"
    fi
  fi
fi

# ── CLEARING IS A FUNCTION, NOT A BRANCH BODY (#1021) ────────────────────────────────
# ⛔⛔ IT LIVED INSIDE `if READ = ZERO` AND THAT WAS THE DEFECT. THREE of the four terminal
#   exits mean "there is no drift to report" and only ONE of them cleared the rows — so a
#   deploy that GENUINELY FIXED the drift left every rung OPEN the moment any non-runtime
#   commit moved the head, and the clearing path became unreachable.
# ★ MEASURED, not reasoned: probe c588d5cb minted 2026-09-08T20:26Z stayed `active` across
#   NINE consecutive unattended runs, every one logging NO_RUNTIME_PATHS.
# ⇒ A condition that has genuinely cleared, still reported as open, is #402's own shape
#   inside the batch built to detect it.
# ⚠️ THE SAFETY ARGUMENT, CORRECTED -- MY FIRST VERSION SAID "age and runtime-count only FALL
#   on a deploy. Nothing oscillates a row back open." THE SECOND CLAUSE IS FALSE.
#   AGE: true. The oldest commit in the range only changes on a deploy, so it cannot oscillate.
#   RUNTIME-COUNT: FALSE. runtime_files is derived from the GitHub compare DEPLOYED...HEAD
#     -- the runtime_files comprehension guarded by qualifies() -- so
#     pushing one server/ file RAISES it with no deploy at all. Hour N doc-only -> cleared;
#     hour N+1 a server/ push -> the rung mints AGAIN as a brand-new row, because `resolved` is
#     terminal and does not block a fresh mint (system-alerts.ts:503-511).
# ★ THE BEHAVIOUR IS STILL RIGHT -- at hour N there genuinely was no runtime drift, and at
#   hour N+1 there genuinely is -- so a NEW row is the correct report. What was wrong was the
#   REASON, and this file grades a false stated reason as a defect in its own right (see the
#   RUNTIME_N-is-not-a-scalar note, and the set -- $READ shape guard).
# ⚠️ CONSEQUENCE, STATED RATHER THAN DISCOVERED: clearing hourly means each clear->recur cycle
#   APPENDS a new rung row instead of reusing one. Roughly one new row per deploy per rung
#   reached. The old code held it to one row forever only because clearing was near-unreachable.
# ⛔ $1 IS THE CONDITION NAME AND IT GOES INTO THE EVIDENCE STRING. A resolve must say WHICH
#   condition discharged it.
# ⚠️ MY FIRST VERSION OF THIS COMMENT GAVE A STALE REASON AND A FRESH READER CAUGHT IT.
#   It said `resolved_by` "CANNOT distinguish a cron resolve from a hand-typed one". That was
#   true when Langston ruled on row 762170b7 -- and it stopped being true at #987, which made
#   `deploy-drift-monitor` a CANONICAL MACHINE ACTOR (system-alerts.ts:215, tag=machine) that
#   no session identity can claim. So the actor field IS a discriminator now.
# ★ THE EVIDENCE PREFIX IS STILL WORTH HAVING, FOR A DIFFERENT AND BETTER REASON: it names
#   WHICH of the three conditions discharged the row, which the actor field can never carry.
#   Three clearing paths under one actor are indistinguishable without it.
#   (Recording the correction rather than quietly restating it: this file punishes exactly
#    this class -- a stale asserted reason -- at :364-369 and :568-582.)
clear_open_rows() {
  local COND="$1"
  # READ THE STORE, NOT THE CLI LIST. `cmdList` prints padded text carrying id and title and
  # NOT dedupe_key (scripts/system-alerts.ts:256-272), so matching on a title substring would
  # catch any future alert titled that way BY ANY AUTHOR. §10.5's sanctioned read is the store
  # itself, which carries the true key. ~800 rows; trivial.
  # ⛔⛔ THE SENTINEL IS THE ONLY THING THAT CAN DETECT A CLEAN-BOUNDARY TRUNCATION.
  #   The unparseable-line counter below catches a MID-LINE cut. A cut at a NEWLINE boundary
  #   yields a shorter but FULLY PARSEABLE store: dropped=0, the run logs resolved=N failed=0,
  #   and every row past the cut stays open while reading as swept -- #1021's symptom for a
  #   third time, and invisible to every check that inspects the CONTENT.
  # ★ Appending the sentinel INSIDE the same ssh costs no extra round-trip, and && means it is
  #   emitted only if cat itself succeeded. Requiring it as the LAST line makes a short read
  #   IMPOSSIBLE to mistake for a complete one, rather than merely likely to be noticed.
  #   (Langston, Step-4 residual on #1021 -- his construction, and it is this project's own
  #    rule 29 preference for impossible over intercepted.)
  ssh $SSH_OPTS "$STAGING_SSH" "cat $ALERTS && echo __DT_STORE_EOF__" > "$WORK/alerts.jsonl" 2>>"$LOG"
  local LIST_RC=$?
  # An unreachable store is NOT "nothing to clear". Unchecked, it logged resolved=0 —
  # "nothing to clear" for "could not look", which is this job's own subject.
  [ $LIST_RC -ne 0 ] && fail_measurement "alert_store" "could not read the alert store to clear drift rows (ssh exit $LIST_RC). Rows may still be open."

  # ⛔⛔ QUOTED HEREDOC, NOT `python3 -c "..."` — AND THAT IS A STRUCTURAL FIX, NOT A STYLE CHOICE.
  #   The old form put this python inside a DOUBLE-QUOTED shell string, where a backtick is
  #   COMMAND SUBSTITUTION and `#` does NOT protect it (the `#` is python's, the quoting is bash's).
  # ★ MEASURED TWICE IN ONE SESSION, 2026-09-09, BOTH TIMES BY ME, THE SECOND TIME IN THE COMMENT
  #   BLOCK I HAD JUST ADDED WARNING ABOUT THE FIRST:
  #     run 1 -> executed fail_measurement (no args, tripped set -u at :93) and `resolved`
  #     run 2 -> executed `file-gate-undecidable`
  #   ⛔ AND THE SECOND ONE FAILED SILENTLY IN THE WORST DIRECTION: the broken parse emitted an
  #     EMPTY list, so the run logged `resolved=0 failed=0` — which reads as "nothing to clear"
  #     when it means "the parse died." That is precisely the confusion the comment four lines
  #     below this one exists to prevent, produced by the code that carries the comment.
  # ⛔ `bash -n` PASSES ON BOTH — command substitution is valid syntax. Only RUNNING it shows them.
  # ★★ A COMMENT SAYING "no backticks" IS AN INTERCEPTION, AND IT FAILED TWICE IN ONE FILE IN ONE
  #   HOUR. Rule 29: PREFER IMPOSSIBLE OVER INTERCEPTED. Inside <<'PYEOF' (quoted delimiter) the
  #   shell performs NO expansion at all — backticks, $VAR and $(...) are ordinary characters — so
  #   this class cannot recur here regardless of what anyone writes in the comments.
  # ⚠️ THE PRICE, STATED: a quoted heredoc expands nothing, so the path can no longer be
  #   interpolated. It is passed through argv instead, which is the safer shape anyway.
  # ⛔ NO TRAILING BACKSLASH ON THIS LINE. A "\" here continues the COMMAND LINE into the
  #   heredoc body, swallowing the first script line as an argv entry. MEASURED: it made
  #   "import json, sys" an argument, the script began at "seen={}", and the run died with
  #   NameError: name 'sys' is not defined -- surfacing as "could not parse the alert store",
  #   i.e. a MEASUREMENT FAILED that looked like a store problem and was a quoting problem.
  # ★ The existing heredoc at :233 already had the correct shape. I did not copy it.
  python3 - "$WORK/alerts.jsonl" <<'PYEOF' > "$WORK/open.txt" 2>>"$LOG"
import json, sys
seen={}
skipped=0
dropped=0
# THE STORE MUST END WITH THE SENTINEL THE FETCH APPENDED. Anything else means the read was
# cut short -- and a cut at a newline boundary is otherwise INDISTINGUISHABLE from a complete
# store, because every line left in it parses.
_lines = open(sys.argv[1], encoding='utf-8', errors='replace').read().split('\n')
while _lines and not _lines[-1].strip():
    _lines.pop()
if not _lines or _lines[-1].strip() != '__DT_STORE_EOF__':
    print('TRUNCATED_STORE no sentinel at EOF', file=sys.stderr)
    sys.exit(3)
_lines.pop()   # drop the sentinel; it is not a row
for line in _lines:
    line=line.strip()
    if not line: continue
    try: d=json.loads(line)
    except Exception:
        # COUNTED, NOT SILENT. The justification below for counting id-less rows applies here
        # verbatim: an ssh cat that TRUNCATES exits 0, so a PARTIAL store reads as a complete
        # one and the run logs resolved=N failed=0 while rows it never saw stay open. That is
        # this file's own header thesis -- exit 0 means the command RAN -- one layer down.
        dropped += 1
        continue
    k=d.get('dedupe_key') or ''
    # TWO PREFIXES. This job mints THREE keys:
    # (ANCHORS, NOT LINE NUMBERS -- every :NNN written in this batch was already wrong when the
    #  commit landed, because the inserts above them shifted every line below.)
    #   deploy-drift-measurement-failed-<operand>  minted in fail_measurement   -> NOT swept
    #   deploy-drift-file-gate-undecidable         minted at the CAPPED branch  -> swept
    #   deploy-drift-rung-<N>                      minted at the rung ladder    -> swept
    # The file-gate row says "there IS drift and the file gate is saturated" - it is a rung-like
    # report, not a measurement failure. The original broad 'deploy-drift-' selector cleared it on
    # ZERO; narrowing to rungs alone cleared it from NOWHERE, and addAlert suppresses a re-mint
    # while a non-terminal row with that key exists (system-alerts.ts:503-511), so it would have
    # become ONE PERMANENTLY-ACTIVE ROW carrying a mint-time snapshot forever - #1021's own defect,
    # in a sibling key, created by the fix for #1021.
    # Measurement-failure rows are excluded on purpose: a later good reading does not discharge an
    # earlier failed one. A measurement failure is discharged by someone LOOKING.
    if not (k.startswith('deploy-drift-rung-') or k == 'deploy-drift-file-gate-undecidable'):
        continue
    rid=d.get('id')
    if rid: seen[rid]=d.get('state')
    else: skipped += 1
for i,s in seen.items():
    if s!='resolved': print(i)
# A skipped row cannot be resolved by ANY path, so nothing is lost -- but the run would
# otherwise log resolved=N failed=0 and exit clean while a row it could not touch stays open.
if skipped: print('SKIPPED %d' % skipped, file=sys.stderr)
if dropped:
    # BLOCKER-1 (Langston, Step-4 on #1021). I ADDED THE COUNTER AND NOT THE FAILURE, which
    # is the same silence one level up: REPRODUCED with a synthetic store whose last line is
    # truncated -> 'UNPARSEABLE 1' on stderr, three ids emitted, EXIT 0, and the run then logs
    # resolved=3 failed=0. A PARTIAL STORE READING AS A COMPLETE ONE -- verbatim the sentence
    # in the fail_measurement message this exit routes to.
    # WHY dropped FAILS AND skipped DOES NOT, and it is not symmetry: a SKIPPED row has no id,
    # so it is unresolvable by ANY path and nothing is lost by noting it. A DROPPED line may be
    # a resolvable OPEN RUNG the run never saw. Fail closed, exactly as LIST_RC does.
    print('UNPARSEABLE %d' % dropped, file=sys.stderr)
    sys.exit(3)
PYEOF
  [ $? -ne 0 ] && fail_measurement "alert_store" "could not parse the alert store while clearing drift rows. Rows may still be open, and an empty result here would otherwise read as nothing-to-clear."

  local RESOLVED_N=0; local FAILED_N=0
  while read -r ID; do
    [ -z "$ID" ] && continue
    if [ "$DRY" = "1" ]; then echo "WOULD RESOLVE $ID (cond=$COND)"; RESOLVED_N=$((RESOLVED_N+1)); continue; fi
    # --evidence is a DISCHARGE, not a pointer (#447): it states what was observed.
    # The leading $COND is the machine-recognisable discriminator — see the header above.
    ssh $SSH_OPTS "$STAGING_SSH" \
      "cd /home/deploy/dawntrader && npm run --silent system-alerts -- resolve $ID --by $ACTOR --evidence '$COND at $TS deployed=$DEPLOYED head=$HEAD_SHA'" >> "$LOG" 2>&1
    # COUNT RESOLUTIONS, NOT ITERATIONS. A resolve is a claim about a row (#987/#1000).
    if [ $? -eq 0 ]; then RESOLVED_N=$((RESOLVED_N+1)); else FAILED_N=$((FAILED_N+1)); fi
  done < "$WORK/open.txt"

  log "$COND resolved=$RESOLVED_N failed=$FAILED_N"
  [ "$FAILED_N" -gt 0 ] && fail_measurement "resolve" "$FAILED_N drift row(s) could not be resolved — they remain open and will read as current drift that is not there."
  return 0
}

if [ "$READ" = "ZERO" ]; then
  log "ZERO deployed=$DEPLOYED head=$HEAD_SHA — clearing open drift rows"
  clear_open_rows ZERO
  exit 0
fi

set -- $READ                # OK status total age_h oldest_iso runtime_count capped  (the file list moved to $WORK/rtlist.txt)
# ENUMERATING THE BAD SHAPES CANNOT CLOSE THIS; ONLY REQUIRING THE GOOD ONE CAN. The case
# arm above lists known-BAD prefixes, but the reader 60 lines up validates against a
# known-GOOD set -- so any non-empty, unmatched, SHORT result fell through to `set --` and
# died on $3 under `set -u`: no mint, no log line, cron discards stderr. Measured: a
# tab-only READ and a truncated "OK ahead" both did exactly that. One line closes it by
# construction rather than by extending a list of things that have gone wrong so far.
[ $# -eq 7 ] && [ "$1" = "OK" ] || fail_measurement "compare_reader" "the compare reader returned $# field(s) leading with ${1:-<empty>}; expected exactly 7 leading with OK. Output was: ${READ:0:120}"
TOTAL="$3"; AGE_H="$4"; OLDEST="$5"; RUNTIME_N="$6"; CAPPED="$7"
# The list comes from its own file, so no filename can ever shift a scalar.
LIST="$(head -12 "$WORK/rtlist.txt" 2>/dev/null | paste -sd, -)"

AGE_INT="${AGE_H%.*}"

# ── THE RUNG: A BOUNDED, MONOTONE AGE BUCKET ON THE DEDUPE KEY ────────────────────────
# Four rungs, escalate only, return-to-zero resolves all. This is entirely PRODUCER-side:
# dedupe keys are the producer's to choose, so it alters no consumer contract — which is the
# property the withdrawn "resolve-and-re-mint per acked run" design lacked.
# An ack then silences ONE RUNG; worsening drift crosses into a new key and re-mints on its own.
# ⛔ THE GATE LANGSTON RULED, WHICH THE CODE DID NOT HAVE UNTIL NOW. His words: "gate on DOES
#   THE RANGE TOUCH RUNTIME PATHS AT ALL; magnitude = age of the oldest undeployed commit."
#   I built the magnitude and not the gate, and the alert BODY described the gate as though it
#   existed. Caught at Step 7 by the job firing in production on 10 commits with ZERO runtime
#   files — a gap made entirely of governance commits, which carries no runtime risk and is
#   exactly what #1001 was NOT about.
# ⚠️ CAPPED IS NOT ZERO. At the 300-file cap the gate is UNDECIDABLE, and his separate ruling
#   is that the file gate may never gate EMISSION in that case — only annotate it. So the gate
#   passes on capped, and the body says UNDECIDABLE rather than a number.
if [ "$CAPPED" != "1" ] && [ "$RUNTIME_N" -eq 0 ]; then
  log "NO_RUNTIME_PATHS age=${AGE_INT}h total=$TOTAL — the range touches no runtime file, so there is nothing to be behind ON. Not reported."
  # "Nothing to be behind ON" is exactly the state in which an OPEN row is wrong. This is the
  # exit that produced the defect: after a deploy, one documentation commit routes every
  # subsequent run here, and before #1021 none of them cleared anything.
  #
  # ⛔⛔ WHY THIS EXIT NEEDS NO deployed_at CORROBORATION, THOUGH BELOW_FLOOR DOES.
  #   I asked whether a revert or a force-push could clear a rung here with no deploy, since
  #   files[] is the NET diff. Langston's answer (Step-4, #1021) is that the hazard is already
  #   closed ~350 lines up and I could not see it from here:
  #     - the compare is the THREE-DOT form, $API/$DEPLOYED...$HEAD_SHA, so it is MERGE-BASE
  #       relative. When status=='ahead' the merge base IS $DEPLOYED, hence files[] is exactly
  #       diff(deployed_tree, head_tree) -- a statement about TREES, not about commits.
  #     - a force-push that removes $DEPLOYED from head's ancestry yields status 'behind' or
  #       'diverged', which the compare reader routes to ANOMALY and then fail_measurement,
  #       exiting BEFORE any clearing exit is reachable.
  #     - a force-push that rewrites only commits AFTER $DEPLOYED leaves the two trees
  #       genuinely identical on runtime paths -- the same state as a revert, and clearing is
  #       CORRECT in both.
  # ★ So "files[] is the net diff" is NOT the hole I thought it was; it is the property that
  #   makes the predicate right.
  #
  # ⚠️ AND THE PART NEITHER OF US HAD WRITTEN DOWN, stated here because BELOW_FLOOR's
  #   equivalent is stated at its own site: RUNTIME_N==0 USED TO ONLY SUPPRESS A REPORT. IT NOW
  #   DISCHARGES A RUNG. That is the identical authority-escalation argument made for the
  #   committer date -- a declared FLOOR promoted from "withholds an alarm" to "cancels one".
  #   A false negative in the runtime predicate used to cost ONE MISSED ALERT; it now costs an
  #   ESCALATION-LADDER RESET. Accepted, because that false-negative class is enumerated and
  #   bounded -- but accepted EXPLICITLY, not by omission.
  clear_open_rows NO_RUNTIME_PATHS
  exit 0
fi
# ⛔ A NEGATIVE AGE IS A BROKEN READING, NOT A SMALL ONE. "-0.50" truncates to "-0", which
#   passes [ -0 -ge 4 ] as a valid integer and would route to BELOW_FLOOR -- which now CLEARS.
#   Clock skew or a future-dated commit must not discharge a rung.
# ⛔⛔ PLACEMENT IS THE WHOLE POINT, AND I GOT IT WRONG FIRST (round-3, #1021).
#   I originally put this immediately after AGE_INT is computed -- i.e. BEFORE the
#   NO_RUNTIME_PATHS exit. fail_measurement exits 1, so ONE future-dated commit would have
#   hard-failed the job EVERY HOUR: no drift reported, and clear_open_rows never reached from
#   ANY of the three exits, leaving open rungs open for an unrelated reason.
# ★ THAT IS #1021'S OWN SYMPTOM, RE-CREATED BY THE DEFENCE AGAINST #1021 -- the second time
#   in one batch that a correction reproduced the defect it was correcting.
# ★ It belongs HERE, after NO_RUNTIME_PATHS has had its chance to clear: that exit does not
#   read the age operand at all (its test is CAPPED != 1 AND RUNTIME_N == 0, which never mentions the age), so a bad date has no
#   business blocking it. Everything the guard was written to prevent still holds, because the
#   rung ladder and BELOW_FLOOR are both below this line.
# ⚠️ THE RESIDUAL THIS PLACEMENT ACCEPTS, STATED RATHER THAN GLOSSED: a run with a negative
#   age, CAPPED=0 and RUNTIME_N=0 still clears via NO_RUNTIME_PATHS with an untrusted age in
#   scope. Deliberate: that exit does not consult the age, so its conclusion (the range touches
#   no runtime file) is unaffected by a bad date. The alternative was taking the whole
#   instrument offline every hour, which is strictly worse.
case "$AGE_INT" in
  -*) fail_measurement "age" "computed a NEGATIVE range age (${AGE_H}h) — clock skew or a future-dated commit. An age that cannot be trusted must not decide a rung, and must not discharge one on the strength of the age itself." ;;
esac

if   [ "$AGE_INT" -ge 72 ]; then RUNG=4
elif [ "$AGE_INT" -ge 24 ]; then RUNG=3
elif [ "$AGE_INT" -ge 8 ];  then RUNG=2
elif [ "$AGE_INT" -ge 4 ];  then RUNG=1
else
  # THE FLOOR, not the boundaries, was the problem. Rung 1 previously fired at total>=1,
  # so a row went active the moment anyone pushed and cleared only on a deploy-to-head —
  # with our push cadence there would nearly always be an active row, and an always-on row
  # carries no information. The floor sits above the routine deploy interval; 8/24/72
  # above it are arbitrary-but-labelled and trigger REPORTING, not action.
  log "BELOW_FLOOR age=${AGE_INT}h total=$TOTAL runtime=$RUNTIME_N — under the 4h floor, not reported"
  # ⛔⛔ BELOW_FLOOR CLEARS ONLY WITH CORROBORATION FROM THE DEPLOY RECORD (round-2, #1021).
  #   The age operand is COMMITTER DATE, and this file says TWICE -- at the DEPLOYED_AT derivation (FINDING 6 of my six) and in the rung
  #   body (a rebase CANNOT rewrite this) -- that a rebase rewrites
  #   it and that the age is then UNDER-stated. Before this batch an under-stated age only ever
  #   SUPPRESSED REPORTING; letting it CLEAR would promote a known-rewritable operand into one
  #   that affirmatively discharges a rung -- a force-push on the review branch could resolve a
  #   72h rung with no deploy at all, and escalation would restart from rung 1.
  # ★ So we require the operand a rebase CANNOT rewrite: deployed_at from the deploy record.
  #   Under the floor AND a deploy within the window = a real deploy just happened.
  # ⚠️ THE WINDOW'S REASON, CORRECTED (Langston CONDITION-2). I first justified 14400s as
  #   "symmetry with the 4h floor", which is a FALSE STATED REASON of exactly the class this
  #   file grades as a defect. The real derivation: the window only has to span DEPLOY -> NEXT
  #   RUN, i.e. ONE CRON INTERVAL. Every value in [1h, floor] behaves identically on every
  #   constructible case but one -- a rung minted for genuine >=4h runtime drift AFTER a
  #   deploy, then a force-push shortening the age inside that same window, which would clear
  #   falsely. Narrowing to ~90 min shrinks that false-clear surface ~2.7x; Langston would take
  #   it and did not require it, so 14400 stands with its reason now true rather than tidy.
  DEPLOY_AGE_S=""
  if [ -n "$DEPLOYED_AT" ]; then
    DEPLOY_EPOCH="$(date -u -d "$DEPLOYED_AT" +%s 2>/dev/null)"
    [ -n "$DEPLOY_EPOCH" ] && DEPLOY_AGE_S=$(( $(date -u +%s) - DEPLOY_EPOCH ))
  fi
  if [ -n "$DEPLOY_AGE_S" ] && [ "$DEPLOY_AGE_S" -ge 0 ] && [ "$DEPLOY_AGE_S" -lt 14400 ]; then
    log "BELOW_FLOOR corroborated by deploy record (deployed_at=$DEPLOYED_AT, ${DEPLOY_AGE_S}s ago) — clearing"
    clear_open_rows BELOW_FLOOR
  else
    # NOT an error, and NOT silent: say which operand withheld the clearing.
    log "BELOW_FLOOR NOT clearing — deploy record does not corroborate (deployed_at=${DEPLOYED_AT:-<absent>}, age=${DEPLOY_AGE_S:-<unreadable>}s). A rewritable committer date may not discharge a rung on its own."
  fi
  exit 0
fi

# ⛔ THE FILE GATE ANNOTATES; IT NEVER GATES EMISSION (Langston). When the file list is at its
# cap the AGE operand is still measured and sound, so the alert fires at its rung and carries
# runtime_path: UNDECIDABLE. 300 is a CAP, not a measurement — a saturated gauge cannot order
# anything, so it must not become a rung.
# ⛔⛔ MANIFEST NOTE — UNCAPPED ONLY, AND THE REASON HERE USED TO BE THE OPPOSITE ONE.
# ⚠️ IT SAID: "computed before the branch, because PRESENCE is decidable even when the list
#   is capped; only ABSENCE is undecidable." That was true of the ORIGINAL single-clause
#   note, which tested presence alone. It became FALSE in the same commit that gated the
#   note on 'no .sql beside it' — BECAUSE THAT SECOND CLAUSE IS AN ABSENCE, read off a list
#   that truncates at 300. Under a cap the note would assert 'no migration .sql beside it'
#   from a list that simply stopped early, and point at a deploy abort on that basis.
# ★ REACHABILITY MEASURED, so this is not hypothetical: 24h = 54 commits / 43 files,
#   72h = 168 commits / 151 files ⇒ about six days at this cadence saturates 300. The top
#   rung has no ceiling and the row persists until a deploy, SO THE CAP IS HIT EXACTLY WHEN
#   A DEPLOY HAS STALLED — which is exactly when a migration is most likely to be waiting.
# ⇒ GATED ON CAPPED=0. Under a cap the body already says runtime_path: UNDECIDABLE, which
#   is the honest answer; appending a confident absence-claim to it is worse than silence.
#   (Langston, Step-4 r3 — FINDING-3's own class, a comment left carrying the old reason,
#   recreated in the very commit that fixed FINDING-3.)
# ★ ROLLBACK-ONLY RANGES DO FIRE IT, DELIBERATELY: rollbacks never reach rtlist.txt, so
#   MANIFEST + rollback-only looks like MANIFEST-alone here — and db-migrate :120-125 THROWS
#   if a rollback is even LISTED in the manifest, so that shape earns exactly this look.
# ⛔⛔ IT IS NOT A VERDICT, AND IT FIRES ONLY ON THE DISCRIMINATING CASE. An earlier draft
#   asserted "HARD DEPLOY FAILURE" on any range containing MANIFEST.txt.
# ⚠️ MEASURED, and my first figure was a WRONG INTERSECTION (Langston, rule 29(a)): I wrote
#   "84 of 109 touch both", but 84 is simply the count of MANIFEST-touching commits. The TRUE
#   intersection since 2026-06-01 is 78 of 109 — plus 6 MANIFEST-ONLY and 31 .sql-without-
#   MANIFEST. Verify: comm -12 on the two `git log --format=%H` lists, NOT two `wc -l`s.
# ⇒ SO THE MANIFEST IN THE RANGE IS THE ORDINARY CASE (78 of them), and a self-consistent
#   migration commit deploys fine — `dt-deploy.sh:204` resets to the target sha, so manifest
#   and .sql arrive together. A note on all 78 trains the reader straight past it.
# ★ THE DISCRIMINATING CASE IS THE 6: MANIFEST.txt PRESENT WITH NO .sql BESIDE IT. That is
#   what "a manifest line whose .sql was never `git add -f`'d" looks like from the range —
#   they are gitignored (§7.1), so a forgotten force-add leaves the manifest alone in the diff.
# ⚠️ I had written that this mode "CANNOT be seen from the range". That was too strong (#453)
#   and Langston struck it: only the OTHER mode — a stale untracked .sql on staging that
#   `reset --hard` does not remove — is genuinely invisible here.
MANIFEST_NOTE=""
if [ "$CAPPED" != "1" ] \
   && grep -qx 'drizzle/migrations/MANIFEST\.txt' "$WORK/rtlist.txt" 2>/dev/null \
   && ! grep -qE '^drizzle/migrations/.*\.sql$' "$WORK/rtlist.txt" 2>/dev/null; then
  MANIFEST_NOTE="
  ⚠️ MANIFEST.txt is undeployed WITH NO MIGRATION .sql BESIDE IT — the uncommon shape, and
     the one worth a look. Migration .sql files are gitignored and force-added, so a manifest
     line whose .sql was never 'git add -f'd looks exactly like this. If that is the case here
     the deploy ABORTS: db-migrate validates the manifest against the filesystem on every run
     (db-migrate.ts:152-156) and throws on drift (:140-148), failing at dt-deploy.sh:223 AFTER
     the build has already replaced dist/. If the manifest change is a reorder or a comment,
     ignore this."
fi

if [ "$CAPPED" = "1" ]; then
  RUNTIME_LINE="runtime_path: UNDECIDABLE — the changed-file list is at its 300 cap, so whether runtime code is undeployed cannot be determined from it. The age below is unaffected.${MANIFEST_NOTE}"
  mint_alert "deploy-drift-file-gate-undecidable" \
    "Deploy drift: runtime-path gate UNDECIDABLE (file list capped)" \
    "The compare returned a changed-file list at its 300 cap at $TS, so the runtime-path gate could not be evaluated. The age reading is sound and is reported separately. deployed=$DEPLOYED head=$HEAD_SHA. HOW THIS ROW CLEARS: the same sweep as the rung rows -- but it is minted ONLY under the cap, and under a cap NO_RUNTIME_PATHS is unreachable by construction while BELOW_FLOOR is practically unreachable (a 300-file range is not under 4h old at this cadence), so IN PRACTICE THIS ROW CLEARS ONLY ON deployed==head. Said here because the rung body carries the exception list and this row -- the one the exception most applies to -- carried nothing."
else
  # A clipped enumeration beside a full count, unmarked, reads as the whole set.
  SHOWN="$(head -12 "$WORK/rtlist.txt" 2>/dev/null | grep -c .)"
  RUNTIME_LINE="runtime files undeployed: $RUNTIME_N${LIST:+ (showing $SHOWN of $RUNTIME_N) — $LIST}${MANIFEST_NOTE}"
fi

# ── THE BODY: EVERY MAGNITUDE CARRIES ITS STAMP ───────────────────────────────────────
# A re-surfaced alert replays its MINT-TIME snapshot: alert 03fad8a4 showed 67.8% for eight
# days while the live gauge read 76.9%. Drift moves hourly, so an UNSTAMPED number in a
# re-surfacing body is wrong on nearly every surfacing. A magnitude may sit here only if it
# carries its observation timestamp and the two shas it was computed from.
mint_alert "deploy-drift-rung-$RUNG" \
  "Deploy drift rung $RUNG: staging is ${AGE_INT}h behind the review branch" \
"AS AT $TS, deployed $DEPLOYED vs $BRANCH head $HEAD_SHA:

  oldest undeployed commit: $OLDEST  (${AGE_INT}h by COMMITTER DATE — the primary reading)
  last deploy:              ${DEPLOYED_AT:-unknown}  (a rebase CANNOT rewrite this. If the
                            two disagree materially, the committer dates were rewritten and
                            the age above is under-stated.)
  commits behind:           $TOTAL
  $RUNTIME_LINE

The age is an UPPER BOUND on the age of the oldest RUNTIME-touching commit: the gate asks
whether the range touches runtime paths at all, and the magnitude is the oldest commit in the
range. It over-states rather than under-states, which is the safe direction for a reporting
trigger. It is NOT 'the oldest runtime commit'.

⛔ RESOLVE this row, do not ACK it. An ack silences THIS RUNG only (#982 — there is no unack
verb); worsening drift crosses into a new rung and re-mints on its own.

HOW THIS ROW CLEARS: the hourly run clears open RUNG rows (and the file-gate-undecidable
row) whenever it concludes there is nothing to report -- deployed==head (ZERO), the range
touches no runtime file (NO_RUNTIME_PATHS), or the gap is under the 4h floor AND the deploy
record corroborates a deploy inside that window (BELOW_FLOOR). The resolve evidence names
which one. It does NOT clear measurement-failure rows: a later good reading does not
discharge an earlier failed one.
WHEN IT WILL NOT CLEAR, because a promise the code cannot keep is the defect this text
replaced. NOT a closed list -- ANY measurement failure exits before the clearing is reached,
so a bad compare, an unreadable deploy record or an untrustworthy age all leave it open:
  - at the 300-file cap the runtime count is UNDECIDABLE, so NO_RUNTIME_PATHS is not reached
    and this row will NOT clear -- which is exactly the long doc-only stall case;
  - under the floor with NO corroborating deployed_at in the record: a committer date is
    rewritable by a rebase, so the age alone may not discharge a rung.

HISTORY: before 2026-09-09 clearing happened ONLY on deployed==head. A deploy followed by any
documentation commit therefore left this row open indefinitely, reading as live drift that was
already fixed (#1021) -- measured at nine consecutive unattended runs.

Current value — never read the numbers above as current, they are stamped: $LOG on Helsinki."

log "RUNG=$RUNG age=${AGE_INT}h total=$TOTAL runtime=$RUNTIME_N capped=$CAPPED deployed=$DEPLOYED head=$HEAD_SHA"
