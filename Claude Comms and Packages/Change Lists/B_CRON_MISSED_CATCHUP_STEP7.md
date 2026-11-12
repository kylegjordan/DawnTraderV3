# B-CRON-MISSED-CATCHUP — Step 7 first-pass staging verification

**Batch:** `B-CRON-MISSED-CATCHUP` · **Issue:** `#691` · **Owner:** ANALYST Codex · **Deployed and verified ref:** `4e66ea904edf690e144035c959cbd335241f7651` · **Deploy recorded:** `2026-11-12T07:22:17Z` · **Evidence cutoff:** `2026-11-12T07:29:14Z`.

## Verdict

Step 7 passes at the deployed ref. The deterministic staging harness exercised the real durable occurrence runner, ledger, audit writer and alert store with synthetic side-effect-free jobs; the six production schedules armed cleanly; both production schedules whose five-minute cadence became due during the verification window completed once with matching durable and audit boundaries; and the runtime remained on the deployed build with no unfinished production occurrence.

This is the registered finite proof from the approved scope and pre-audit. It does not wait for a natural wall-clock step or for all four slower schedules to become due.

## 1. Exact deployed object and process health

- `/home/deploy/dawntrader-deploy.record` names exact SHA `4e66ea904edf690e144035c959cbd335241f7651`, restart `695`, deploy time `2026-11-12T07:22:17Z`, actor claim `codex-c`, and migration time `767 ms`.
- `dist/BUILD_SHA` is the same full SHA.
- `dt-deploy` applied `2026-11-12-b-cron-missed-catchup.sql` and asserted `ENGINE RESUMED` before writing the record.
- The live liveness response at `2026-11-12T07:29:14.015Z` returned `engineExpected=true`, `engineRunning=true`, and the same `buildSha`.
- PM2 showed one `dawntrader` process online at restart count `695`; the count did not advance after the deploy.

## 2. Registered exact-ref staging harness

Command, executed as the staging `deploy` user with the app environment loaded:

```text
npx tsx server/scripts/b-cron-missed-catchup-harness.ts --execute --expect-sha 4e66ea904edf690e144035c959cbd335241f7651 --by codex-c
```

The harness refused any other `HEAD` or `dist/BUILD_SHA` before mutation. Run ID `b551a434-9a38-41f9-bcbf-77545ad6adfa` returned `ok=true` and retained:

- **11/11 distinct durable occurrence identities:** 6 `succeeded`, 3 `skipped`, 1 `failed`, 1 `indeterminate`; every identity count was exactly one.
- **Natural/missed race:** one durable `succeeded` row and one business-core call. The second contender returned `duplicate` inside the harness assertion.
- **Bounded queue:** two older boundaries recorded `skipped`; the newest boundary executed once.
- **Unsafe historical Q-D:** recorded `skipped` and made zero core calls.
- **Synthetic failure:** recorded `failed`, called the core once and retained one `error` audit row. The emitted `[CRON-RECOVERY][CORE_FAIL]` was the expected injected failure, not a production failure.
- **Crash reconciliation:** the prior `running` row became `indeterminate`; the prior `claimed` row resumed and became `succeeded`.
- **Shared lane:** exact order `scheduled-start, scheduled-end, manual`.
- **Compatible terminal stream:** 7 executed-only `scheduled_tasks_audit` rows: 6 success rows and the one expected error row; skips and the indeterminate row did not masquerade as fires.
- **Exact stale-alert recovery:** alert `88ae89d2-2f33-49fc-8bca-77b80d7ff7c6` persisted `resolved_by_claimed=cron-recovery` and `resolved_by_transport=engine`, with the exact occurrence and policy version in its evidence. Five expected synthetic skip/fail/indeterminate alerts were resolved by operator `codex-c` during harness cleanup.

## 3. Production schedule census and natural fires

At the deployed ref, an anchored code census for executable lines matching `cronRegistry.register({` outside tests and scripts found **6 production registration sites** across five owners: feed integrity, formula audit, two awareness schedules, xStock Q-D probe, and xStock universe discovery.

The post-restart application log independently carried **6 production registration lines** and the authoritative next-fire values for the same six jobs. Boot smoke reported `total=6 ok=6 disabled=0 failed=0`; the independent boot+5-minute smoke again produced 6/6 `OK` job lines.

Only the two five-minute schedules became due between deploy and the evidence cutoff:

| production job | durable boundary | actual start | terminal state | durable lag at claim | audit result |
|---|---|---|---|---:|---|
| `xstock_qd_probe_cron` | `2026-11-12T07:25:00Z` | `2026-11-12T07:25:00.100Z` | `succeeded` | 11 ms | same boundary/start, `success`, source `cron` |
| `feed_integrity_cron` | `2026-11-12T07:25:00Z` | `2026-11-12T07:25:16.286Z` | `succeeded` | 12 ms before its configured jitter | same boundary/start, `success`, source `cron` |

The remaining four were not claimed as fired: their observed next fires were awareness state `08:00Z`, awareness reflection `12:00Z`, formula audit `2026-11-13T03:00Z`, and universe discovery `2026-11-13T06:00Z`. Their Step 7 evidence is arm and next-fire health, exactly as pre-registered for cadences not due during the session.

## 4. Duplicate, unfinished-state and log checks

- The post-deploy database population contained **13 occurrence rows / 13 distinct `(job_name, scheduled_for)` identities**: the 11 retained harness identities plus the two due production identities. Duplicate-identity groups were `0`.
- Production `claimed|running` rows were `0`, against a positive control of one retained harness `indeterminate` row in the same post-deploy population.
- Across both PM2 streams from `2026-11-12T07:22:00Z` through the `2026-11-12T07:28:26Z` log read, the instrument counted 6 registration lines, 6 boot-smoke job lines and 6 boot+5-minute job lines. It found `0` recovery-error, arm-smoke-unhandled or duplicate-registration lines. The same error-stream/window instrument found **765** known `[B79.0f][COLLISION_RESOLVE]` lines as its positive control, so the zero was not an unread stream or empty window.
- PM2 remained online at restart `695`, matching the deploy record; no later restart occurred during verification.

## 5. Exact-ref CI

GitHub Actions run `43173570525` has head SHA `4e66ea904edf690e144035c959cbd335241f7651`. Its four jobs passed individually: Build, TypeScript Check (baseline gate), Test Suite and Docker Build.

## 6. UI judgement

UI is **N/A and is not represented as checked**. The approved scope and pre-audit explicitly establish that this batch changes server-side scheduled-occurrence admission and has no user-facing scheduler screen; no staging page can exercise this mechanism. The registered Step 7 substitute is the exact-ref harness plus runtime logs, durable database read-back, health and CI above.

## 7. Fresh-reader challenge and re-derivation

The claim-only reader identified three load-bearing alternatives that mattered:

1. “Six schedules operating” could hide four schedules that never became due. Re-derived at the scope and runtime objects: the closure condition is one natural fire per cadence available during the session. Exactly two five-minute schedules were due and fired; the other four are claimed only as armed with observed future next-fire times.
2. A proof could bypass the real timer-listener edge. Re-derived at the harness and scope: the registered staging harness deliberately calls the real occurrence runner with injected missed contexts, proving admission, uniqueness, execution policy, durable state, audit and alert handling. It does not claim to reproduce a host clock step; listener boundary reconstruction and event wiring remain covered by the focused source-contract/unit suite.
3. A deduplicated summary could hide duplicate business calls. Re-derived from the harness's raw race results, durable rows and call map: the natural/missed race produces one success, one duplicate result, one identity and one core call.

`REVIEWER: claim-only · asked which objects settle Step 7 and what other states remain consistent · found cadence wording, timer-edge and hidden-duplicate alternatives; all three re-derived and the verdict narrowed to the measured population · re-derived y`

## 8. Exact reviewer reproduction commands

Run these on staging unless the command names the local review clone. They are read-only except for the harness command in section 2, whose retained synthetic rows are already present; rerunning that command creates a new isolated run ID and resolves only its own synthetic alerts.

Exact build, deploy record, process restart count and liveness:

```bash
cd /home/deploy/dawntrader
git rev-parse HEAD
cat dist/BUILD_SHA
cat /home/deploy/dawntrader-deploy.record
pm2 jlist | jq -c '.[] | select(.name == "dawntrader") | {status:.pm2_env.status,restart_time:.pm2_env.restart_time,pm_uptime:.pm2_env.pm_uptime}'
curl -sf http://localhost:5000/api/health/liveness
```

Exact executable registration census at the deployed ref, from a review clone:

```bash
git grep -n -E '^[[:space:]]*cronRegistry\.register\(\{' 4e66ea904edf690e144035c959cbd335241f7651 -- server ':(exclude)server/tests/**' ':(exclude)server/scripts/**'
```

Exact durable-identity and audit read-back, after loading `/home/deploy/dawntrader/.env` and invoking `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1`:

```sql
SELECT job_name, scheduled_for, first_source, status, claimed_at, started_at,
       completed_at, lag_ms, reason, metadata->>'harness_run_id' AS harness_run_id
FROM scheduled_job_occurrences
WHERE claimed_at >= '2026-11-12T07:22:17Z'::timestamptz
  AND claimed_at <= '2026-11-12T07:29:14.015Z'::timestamptz
ORDER BY claimed_at, job_name, scheduled_for;

SELECT count(*) AS rows, count(DISTINCT (job_name, scheduled_for)) AS identities,
       count(*) FILTER (WHERE status IN ('claimed','running')
         AND metadata->>'harness_run_id' IS NULL) AS production_unfinished,
       count(*) FILTER (WHERE status = 'indeterminate'
         AND metadata->>'harness_run_id' = 'b551a434-9a38-41f9-bcbf-77545ad6adfa') AS harness_indeterminate_control
FROM scheduled_job_occurrences
WHERE claimed_at >= '2026-11-12T07:22:17Z'::timestamptz
  AND claimed_at <= '2026-11-12T07:29:14.015Z'::timestamptz;

SELECT job_name, scheduled_for, count(*) AS n
FROM scheduled_job_occurrences
WHERE claimed_at >= '2026-11-12T07:22:17Z'::timestamptz
  AND claimed_at <= '2026-11-12T07:29:14.015Z'::timestamptz
GROUP BY job_name, scheduled_for HAVING count(*) > 1;

SELECT task_name, scheduled_for, fired_at, status, meta->>'trigger_source' AS trigger_source
FROM scheduled_tasks_audit
WHERE fired_at >= '2026-11-12T07:22:17Z'::timestamptz
  AND fired_at <= '2026-11-12T07:29:14.015Z'::timestamptz
  AND (task_name IN ('xstock_qd_probe_cron','feed_integrity_cron')
       OR task_name LIKE 'b_cron_harness_%')
ORDER BY fired_at, task_name;
```

Exact two-stream log instrument. It excludes the harness's one deliberately injected failure from the production-recovery-error count, while retaining the harness in the database proof above:

```python
from pathlib import Path
start, end = "2026-11-12 07:22:00", "2026-11-12 07:28:26"
lines = []
for path in ("/var/log/dawntrader/out.log", "/var/log/dawntrader/error.log"):
    with Path(path).open(errors="replace") as stream:
        lines.extend(line.rstrip("\n") for line in stream if start <= line[:19] <= end)
checks = {
    "registration": lambda s: "[CRON-REGISTRY] Registered job=" in s,
    "boot_jobs": lambda s: "[CRON-ARM-SMOKE] label=boot job=" in s,
    "boot_plus_5m_jobs": lambda s: "[CRON-ARM-SMOKE] label=boot+5min job=" in s,
    "production_recovery_errors": lambda s: "[CRON-RECOVERY]" in s and ("FAIL" in s or "ERROR" in s) and "b_cron_harness_" not in s,
    "arm_smoke_unhandled": lambda s: "[CRON-ARM-SMOKE]" in s and "unhandled" in s.lower(),
    "duplicate_registration": lambda s: "[CRON-REGISTRY] Duplicate registration" in s,
    "collision_positive_control": lambda s: "[B79.0f][COLLISION_RESOLVE]" in s,
}
for name, predicate in checks.items():
    print(f"{name}={sum(predicate(line) for line in lines)}")
```

The exact-ref CI read is:

```bash
gh run view 43173570525 --json headSha,status,conclusion,jobs
```

## Next step

Step 8 sends this exact deployed-object proof to Coltrane for an independent second-pass verification.
