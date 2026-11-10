# B-CREDENTIALS-PRIVATE-REPO — DRIFT PARSE CAPTURE INCREMENT

**Owner:** INFRA Codex (`codex-infra`) · **Issue:** `#1117` under parent `#1023` · **Change class:** `non_architecture` · **Sequence:** lands before OBJ-4 drift conversion; that conversion is this diagnostic's named removal point.

## STEP 3 — IMPLEMENTATION

The hourly deploy-drift monitor already fails loud when GitHub's compare endpoint returns a non-empty body that is not JSON, but it deleted the only diagnostic body at process exit. Three occurrences in 33 hours therefore left the distance undefined without enough evidence to identify whether GitHub, transport, or the local reader produced the bytes.

This increment changes only that parse-failure path:

- `comms-infra/discord/dt-deploy-drift.sh`
  - records curl's HTTP status as diagnostic text only; curl exit status and parsed body remain authoritative;
  - persists a non-empty body only after the JSON parser rejects it;
  - writes atomically as `0600` under a `0700`, current-user-owned persistent directory;
  - names the saved path and retention result in the alert detail;
  - deletes matching diagnostics older than 14 days and leaves unrelated files alone;
  - refuses a symlinked evidence directory and reports capture failure inside the same measurement-failed alert;
  - leaves empty responses, curl failures and successful JSON on the existing scratch-only path.
- `comms-infra/discord/deploy.sh` creates `/var/lib/dt-deploy-drift/failed-compare` as `langston:langston 0700` before the hourly cron is installed.
- `scripts/analysis/test-deploy-drift-parse-capture.sh` drives the committed production entry point with stubbed network commands. Its load-bearing fixture is non-empty and syntactically non-JSON; it also proves exact bytes, retention, unrelated-file preservation, alert-path disclosure, HTTP-status non-control, empty/success non-capture, modes and symlink refusal.
- `comms-infra/helsinki/tests/deploy_tests.sh` extends the notices-install assertion to the evidence directory's owner, group and mode.
- `1-system-manual/RUNNING_ISSUES.md` replaces the stale conflicting-rulings text with Langston's final ruling and Coltrane's re-confirmation, and records the third occurrence.

## STEP-3 VERIFICATION

- Linux isolated fixture on Helsinki, private temporary directory removed by the same remote command: **19 passed, 0 failed**.
- Windows Git Bash fixture: **16 passed, 0 failed**; POSIX mode and symlink assertions explicitly defer to the Linux run.
- Existing drift-shape guard: expected PASS/FAIL outcomes unchanged.
- Existing runtime-predicate suite: **34 cases, 0 failures**; control still separates the fixed predicate from the old prefix-only form.
- `bash -n`: monitor, installer and new fixture all parse.

## REVIEW GATE

**STEP: 3 of 11 · NEXT STEP: 4 of 11.** Coltrane reviews the exact pushed ref. No live file is installed at Step 3, the later OBJ-4 conversion is unchanged, and neither Langston nor a second worker is enabled.
