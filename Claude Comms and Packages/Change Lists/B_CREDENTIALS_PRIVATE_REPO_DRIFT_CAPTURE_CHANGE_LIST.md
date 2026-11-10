# B-CREDENTIALS-PRIVATE-REPO — DRIFT PARSE CAPTURE INCREMENT

**Owner:** INFRA Codex (`codex-infra`) · **Issue:** `#1117` under parent `#1023` · **Change class:** `non_architecture` · **Sequence:** lands before OBJ-4 drift conversion; that conversion is this diagnostic's named removal point.

**Review range:** `89ea0e4dc80fb55c9d4cce0f85275ddb4b1cb673..origin/migration/aws-supabase` · **Initial implementation commit:** `1247381ec999d8041b2cb2e924100816ccae6083`; the fresh-reader corrections are later commits inside the same review range · **Graded ref:** the exact 40-character `origin/migration/aws-supabase` ref named in the Discord dispatch, verified equal to the branch head immediately before dispatch.

## STEP 4 DISPATCH HEADER — THREE REQUIRED FIELDS

| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `non_architecture` (verbatim from `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md`) |
| **ii** | **THAT CLASS'S DOC SET, ROW BY ROW** | complete current-state table below; no row is omitted |
| **iii** | **THE STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md`; PROCEED WITH CONDITIONS recorded in scope §2 at `8309ba598`. The later #1117 diagnostic ruling is Langston message `1568852057245487189`, re-confirmed by Coltrane at 2026-11-10T11:20:29Z. |

| document | required / judged for `non_architecture` | state at this increment |
|---|---|---|
| batch `SCOPE` | REQUIRED | **present** — `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` |
| batch `PRE_AUDIT` | REQUIRED | **present** — field iii above |
| `COMPLETION_REPORT` | REQUIRED | **absent — due at parent Step 11**; the interim `B_CREDENTIALS_PRIVATE_REPO_PROGRESS_REPORT.md` is present but is not mislabelled as completion |
| `BATCH_CATALOG.md` | REQUIRED | **absent — due at parent close** |
| `PHASE_HISTORY.md` | REQUIRED | **absent — due at parent close** |
| `PHASE_19_PLAN.md` | REQUIRED (scope ledger) | **absent for this parent — due at Step 10 if its carried row still applies** |
| shared `MEMORY.md` + own `MEMORY_CC_INFRA.md` | REQUIRED | **present** — shared memory is unchanged because no shared invariant changed; own position records this increment |
| four session task lists | REQUIRED | **absent for this increment — due at parent Step 10/close**; only CC-INFRA is mine to edit |
| Langston `/home/langston/MEMORY.md` | REQUIRED | **present for the parent OBJ-4a read-path work**; **no change for this increment**, which does not enable or update Langston while he is off |
| Observation column | REQUIRED judgement | **N/A** — this diagnostic has binary production-entry and install checks, not an observation window; Step 7 verifies the installed path |
| `SYSTEM_IMPACT_MAP.md` | judged: applicable | **present for the parent's existing read-path components; increment update due at Step 10** if the persistent evidence state is installed |
| `SYSTEM_MANUAL.md` | judged: N/A for this increment | **N/A** — no trading architecture, strategy, regime, filter, signal pipeline or quantitative rule changes |
| `RUNNING_ISSUES.md` | judged: applicable | **present and updated** — stale conflict removed; final ruling, third event and seven-event positive control recorded on `#1117` |
| `SPRINT_TO_LIVE_PLAN.md` | judged: applicable | **present** — parent row 0 remains IN FLIGHT; close/status correction remains due with the parent |
| `MISTAKE_PATTERNS.md` | judged: N/A for this increment | **N/A** — no new repeated mistake pattern was found |
| `DELETED_COMPONENTS_LOG.md` | judged: N/A for this increment | **N/A** — this increment removes no component; OBJ-4 conversion is the future rule-18 removal point |
| `LANGSTON_ARCHITECTURE.md` §6 | judged: applicable if installed | **present for the parent read-path work; increment update due at Step 10** after the installed-state result is known |
| `CLAUDE.md` §7/§7.1 and workflow files | judged: N/A for this increment | **N/A** — no standing workflow, repository-source or deployment rule changes |
| `CHANGES_AND_FIXES.md` | judged: N/A | **N/A** — no trading-system behaviour changes |

## STEP 3 — IMPLEMENTATION

The hourly deploy-drift monitor already fails loud when GitHub's compare endpoint returns a non-empty body that is not JSON, but it deleted the only diagnostic body at process exit. Three occurrences in 33 hours therefore left the distance undefined without enough evidence to identify whether GitHub, transport, or the local reader produced the bytes.

This increment changes only that parse-failure path:

- `comms-infra/discord/dt-deploy-drift.sh`
  - records curl's HTTP status as diagnostic text only; curl exit status and parsed body remain authoritative;
  - persists a non-empty body only after the JSON parser rejects it;
  - writes atomically as `0600` under a `0700`, current-user-owned persistent directory;
  - names the saved path and retention result in the alert detail;
  - deletes matching diagnostics older than 14 days on every hourly run and leaves unrelated files alone, bounding expiry to 14 days plus at most one scheduling interval;
  - applies that same bound to interrupted `.body.tmp` publications, so a power loss between copy and rename cannot leave evidence indefinitely;
  - refuses a symlinked evidence directory and reports capture failure inside the same measurement-failed alert;
  - checks ownership before changing mode, so a wrong-owner directory is refused untouched;
  - leaves empty responses, curl failures, syntactically valid responses rejected by validation, and successful JSON on the existing scratch-only path;
  - accepts path/retention overrides only after an explicit fixture-mode switch; the installed path ignores ambient overrides.
- `comms-infra/discord/deploy.sh` refuses state/evidence symlinks both in pre-flight and at the mutation boundary, then creates `/var/lib/dt-deploy-drift/failed-compare` as `langston:langston 0700` through directory file descriptors opened with `O_NOFOLLOW` before the hourly cron is installed.
- `scripts/analysis/test-deploy-drift-parse-capture.sh` drives the committed production entry point with stubbed network commands. Its load-bearing fixture is non-empty and syntactically non-JSON; it also proves exact bytes, completed and interrupted-publication retention, unrelated-file preservation, alert-path disclosure, HTTP-status non-control, empty/success non-capture, modes, symlink refusal, wrong-owner refusal, and that ambient overrides are ignored without the explicit switch.
- `comms-infra/helsinki/tests/deploy_tests.sh` adds planted pre-flight and execution-time installer symlinks and proves the root-owned target's owner, mode and contents remain unchanged.
- `1-system-manual/RUNNING_ISSUES.md` replaces the stale conflicting-rulings text with Langston's final ruling and Coltrane's re-confirmation, and records the third occurrence.

## STEP-3 VERIFICATION

- Linux isolated fixture on Helsinki, private temporary directory removed by the same remote command: **39 passed, 0 failed**.
- Windows Git Bash fixture: **27 passed, 0 failed**; POSIX mode, owner, symlink and no-test-mode assertions explicitly defer to the Linux run.
- Root installer regression suite from committed suite blob `0b73e04b23c510a64ec7dcb245f2061c2bcfb661` at reviewed ref `1accff5589667e2d06b6b8f9d715c402599d8e30`: **63 passed, 0 failed**, including planted pre-flight and post-pre-flight symlink controls. The first launch was rejected as evidence because its private parent blocked the `langston` subprocess; the valid rerun granted traversal only to the `langston` group and independently required a `0 fail` summary instead of trusting the suite's exit status.
- Existing drift-shape guard: expected PASS/FAIL outcomes unchanged.
- Existing runtime-predicate suite: **34 cases, 0 failures**; control still separates the fixed predicate from the old prefix-only form.
- `bash -n`: monitor, installer and new fixture all parse.

## LOAD-BEARING DIFF SNIPPETS

### MODIFIED — production ignores ambient path and retention overrides

After (`origin/migration/aws-supabase` at dispatch):

```sh
TEST_MODE="${DT_DRIFT_TEST_MODE:-0}"
case "$TEST_MODE" in
  0|1) ;;
  *) echo "dt-deploy-drift: DT_DRIFT_TEST_MODE must be 0 or 1" >&2; exit 2 ;;
esac
if [ "$TEST_MODE" = "1" ]; then
  LOG="${DT_DRIFT_LOG:-/var/log/dt-deploy-drift.log}"
  STATE_DIR="${DT_DRIFT_STATE_DIR:-/var/lib/dt-deploy-drift}"
  FAILED_COMPARE_DIR="${DT_DRIFT_FAILED_COMPARE_DIR:-$STATE_DIR/failed-compare}"
  FAILED_COMPARE_RETENTION_MINUTES="${DT_DRIFT_FAILED_COMPARE_RETENTION_MINUTES:-20160}"
else
  LOG="/var/log/dt-deploy-drift.log"
  STATE_DIR="/var/lib/dt-deploy-drift"
  FAILED_COMPARE_DIR="$STATE_DIR/failed-compare"
  FAILED_COMPARE_RETENTION_MINUTES="20160"
fi
```

### MODIFIED — HTTP status is captured as diagnostic text, not control flow

Before (`89ea0e4dc`):

```sh
fetch() {
  local url="$1" out="$2"
  curl -sS --max-time 25 -o "$out" "$url" 2>>"$LOG"
  return $?   # EXIT STATUS, never the HTTP code — see fail_measurement's header
}

fetch "$API/$DEPLOYED...$HEAD_SHA?page=1&per_page=100" "$WORK/cmp.json" \
  || fail_measurement "compare_api" "curl exit status non-zero (the bytes did not land; an HTTP 200 would not have told us)"
```

After (graded ref at dispatch):

```sh
fetch() {
  local url="$1" out="$2" status_out="${3:-}"
  if [ -n "$status_out" ]; then
    curl -sS --max-time 25 -o "$out" -w '%{http_code}\n' "$url" > "$status_out" 2>>"$LOG"
  else
    curl -sS --max-time 25 -o "$out" "$url" 2>>"$LOG"
  fi
  return $?   # EXIT STATUS, never the HTTP code — see fail_measurement's header
}
```

### MODIFIED — only the parser-rejection arm invokes persistence

Before (`89ea0e4dc`):

```sh
case "$READ" in
  ""|" ") fail_measurement "compare_reader" "the compare reader produced no output at all (python3 missing, the heredoc failing, or an uncaught exception outside its json guard)" ;;
  PARSE_ERROR*) fail_measurement "compare_api" "${READ#PARSE_ERROR }" ;;
  ANOMALY*)
    set -- $READ
    [ $# -eq 3 ] || fail_measurement "compare_reader" "malformed ANOMALY result, $# field(s): ${READ:0:120}"
```

After (graded ref at dispatch):

```sh
case "$READ" in
  ""|" ") fail_measurement "compare_reader" "the compare reader produced no output at all (python3 missing, the heredoc failing, or an uncaught exception outside its json guard)" ;;
  JSON_PARSE_ERROR*)
    CAPTURE_ERROR_FILE="$WORK/compare-capture.error"
    if SAVED_BODY="$(capture_failed_compare "$WORK/cmp.json" 2>"$CAPTURE_ERROR_FILE")"; then
      CAPTURE_DETAIL="saved_body=$SAVED_BODY"
    else
      CAPTURE_ERROR="$(tr '\n' ' ' < "$CAPTURE_ERROR_FILE" | sed 's/[[:space:]]*$//')"
      CAPTURE_DETAIL="saved_body=FAILED(${CAPTURE_ERROR:-unknown capture error})"
    fi
    fail_measurement "compare_api" "${READ#JSON_PARSE_ERROR }; http_status=$COMPARE_HTTP_STATUS; $CAPTURE_DETAIL; retention_minutes=$FAILED_COMPARE_RETENTION_MINUTES"
    ;;
  PARSE_ERROR*)
    fail_measurement "compare_api" "${READ#PARSE_ERROR }; http_status=$COMPARE_HTTP_STATUS; saved_body=NOT_APPLICABLE(valid JSON rejected by response validation)"
    ;;
```

### NEW — bounded, owner-checked, atomic evidence publication

```sh
prepare_failed_compare_dir() {
  [ ! -L "$FAILED_COMPARE_DIR" ] || { echo "diagnostic directory is a symlink" >&2; return 1; }
  mkdir -p -- "$FAILED_COMPARE_DIR" || { echo "cannot create diagnostic directory" >&2; return 1; }
  local owner
  owner="$(stat -c %U -- "$FAILED_COMPARE_DIR" 2>/dev/null)"
  [ "$owner" = "$(id -un)" ] || { echo "diagnostic directory owner is $owner, expected $(id -un)" >&2; return 1; }
  chmod 0700 -- "$FAILED_COMPARE_DIR" || { echo "cannot set diagnostic directory mode" >&2; return 1; }
}
```

The publication block is exact:

```sh
capture_failed_compare() {
  local src="$1" stamp path tmp cleanup
  [ -s "$src" ] || { echo "source body is empty" >&2; return 1; }
  prepare_failed_compare_dir || return 1
  stamp="${TS//:/-}"
  path="$FAILED_COMPARE_DIR/compare-$stamp-$$.body"
  tmp="$path.tmp"
  umask 077
  cp -- "$src" "$tmp" || { rm -f -- "$tmp"; echo "cannot copy response body" >&2; return 1; }
  chmod 0600 -- "$tmp" || { rm -f -- "$tmp"; echo "cannot set response-body mode" >&2; return 1; }
  mv -- "$tmp" "$path" || { rm -f -- "$tmp"; echo "cannot publish response body" >&2; return 1; }
}
```

The every-run retention function is separately load-bearing and exact:

```sh
prune_failed_compares() {
  [ -e "$FAILED_COMPARE_DIR" ] || return 0
  prepare_failed_compare_dir || return 1
  find "$FAILED_COMPARE_DIR" -maxdepth 1 -type f \
    \( -name 'compare-*.body' -o -name 'compare-*.body.tmp' \) \
    -mmin "+$FAILED_COMPARE_RETENTION_MINUTES" -delete
}
```

It runs before the network operands on every invocation:

```sh
if ! PRUNE_ERROR="$(prune_failed_compares 2>&1)"; then
  log "RETENTION_CLEANUP_FAILED path=$FAILED_COMPARE_DIR detail=${PRUNE_ERROR:-unknown cleanup error}"
fi
```

The capture re-runs the same cleanup and exposes its result:

```sh
cleanup="ok"
prune_failed_compares || cleanup="FAILED"
printf '%s;retention_cleanup=%s' "$path" "$cleanup"
```

### MODIFIED — installer creates the runtime boundary before scheduling

Before (`89ea0e4dc`):

```sh
if want notices; then
  langston_log /var/log/dt-deploy-drift.log
  mkdir -p /var/lib/dt-deploy-drift
  chown langston:langston /var/lib/dt-deploy-drift
  add_langston_cron dt-deploy-drift.sh "$DRIFT_CRON"
fi
```

After (graded ref at re-dispatch):

```sh
if want notices; then
  langston_log /var/log/dt-deploy-drift.log
  no_symlink /var/lib/dt-deploy-drift
  mkdir -p /var/lib/dt-deploy-drift
  chown langston:langston /var/lib/dt-deploy-drift
  no_symlink /var/lib/dt-deploy-drift/failed-compare
  install_private_dir_nofollow /var/lib/dt-deploy-drift/failed-compare langston langston 0700
  no_symlink /var/lib/dt-deploy-drift/failed-compare
  add_langston_cron dt-deploy-drift.sh "$DRIFT_CRON"
fi
```

`install_private_dir_nofollow` opens both parent and leaf with `O_DIRECTORY|O_NOFOLLOW`, then uses `fchown` and `fchmod` on the pinned leaf descriptor. A swap after the shell refusal therefore cannot redirect root's ownership or mode change.

## STEP 4 SEND-BACK CORRECTIONS

Coltrane's first code read at exact ref `c956d2b3f7f4d146954298b86664b73ac3343fb8` sent back three items. This re-dispatch folds all three without changing the diagnostic's scope:

1. Root installer: pre-flight refusal, mutation-boundary refusal and descriptor-pinned `O_NOFOLLOW` creation now prevent a planted evidence-leaf symlink from redirecting root's owner/mode changes. Installer fixtures plant the link both before pre-flight and after pre-flight, and prove the target owner, mode and bytes do not change.
2. Interrupted publication: every-run retention now matches both `compare-*.body` and `compare-*.body.tmp`; the fixture plants an aged temporary publication and an unrelated file, proving only the evidence file is removed.
3. Missing executable controls: the Linux fixture now proves wrong-owner refusal without changing owner/mode and runs the production entry point without `DT_DRIFT_TEST_MODE=1` under an unprivileged account, proving ambient log/state/evidence/retention overrides are ignored.

Coltrane also settled the residual: **no per-incident alert refresh is required.** The alert path identifies the first unresolved incident; each later failure writes its current saved path to the full log, which is the authoritative index for the protected directory's incident population.

## JUDGEMENT CALLS FOR COLTRANE TO ATTACK

1. Is current-user ownership plus directory `0700` and file `0600` the right boundary for evidence produced by the existing `langston` job, or does the installer need a different owner/root boundary?
2. Is pruning on every hourly run, with expiry at 14 days plus at most one scheduling interval, sufficiently bounded when cleanup failure is logged and reported by the capture result but does not replace the underlying parse-failure verdict?
3. Does `curl` exit status + parser result remain the correct authority when a syntactically valid JSON body arrives with HTTP 503, with the status recorded but not promoted into control flow?
4. Is the explicit fixture-mode gate sufficient to keep path/retention overrides out of the installed run?
5. Does the production-entry fixture discriminate all claimed non-persistence branches, including a curl failure after partial bytes, empty bytes, valid JSON with an unknown status, valid JSON with empty commits, and valid JSON with HTTP 503?
6. **Settled by Coltrane:** the alert store's normal dedupe may retain the first non-terminal `compare_api` path. The alert path is explicitly the first incident; the full log is the authoritative index for later incident files. No per-incident alert refresh is added.

## FRESH-READER RECORD

`REVIEWER: claim-only · name the objects that settle parse-only, secure, bounded persistence and status-non-control, then name consistent alternate states · HIT — valid JSON rejected by semantic validation also persisted; cleanup ran only on another capture; ambient overrides could redirect the fixture surfaces; alert dedupe can retain the first path; live remains the old uninstalled file · re-derived y.`

Re-derivation and disposition: the first three mechanism hits are corrected in the code and discriminated by the 39-check Linux production-entry fixture (including the prior behaviours as controls). The dedupe hit was reproduced against the real alert library: two same-key adds returned one row whose body stayed `first-path`, not the second body; Coltrane accepted that behavior with the explicit first-path/log-index record above. The live difference is expected at Step 4 and is not cited as a defect: this change is deliberately not installed before review and CI.

## REVIEW GATE

**STEP: 6 of 11 COMPLETE · NEXT STEP: 7 of 11.** Coltrane returned **PROCEED** at exact graded ref `1accff5589667e2d06b6b8f9d715c402599d8e30` on 2026-11-10T12:18:30Z. CI run `42813966403` is green per job at that exact ref: TypeScript Check, Test Suite, Build and Docker Build all succeeded. The reviewed `notices` group was installed on Helsinki from installer blob `fdc59239b13c03c6a1ff559234a96fca30e6f4fa`: all 3 live file blobs match the reviewed objects, the evidence leaf is `langston:langston 0700`, and the canonical cron remained single and unchanged. Rollback is `/root/deploy-rollback/B-CREDENTIALS-PRIVATE-REPO-drift-20261110T122500Z`; stale staging copies moved to `/root/deploy-retired/20261110T122514Z`. Crew readback remains Codex mode with Langston disabled/inactive, zero Langston worker units, and Coltrane active. The delivery card stays CI + Deploy until Step 7 verifies the installed path.
