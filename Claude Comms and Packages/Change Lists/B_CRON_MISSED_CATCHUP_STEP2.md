# B-CRON-MISSED-CATCHUP — Step 2 change list

**Workflow step:** 2 of 11 — pre-implementation audit and implementation plan

**Reviewer:** Coltrane

**Change class:** architecture

## Review object

- `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_PRE_AUDIT.md`

## What changed

The merged audit/plan reads the registry, node-cron 4.2.1 event ordering, all six schedule wrappers and cores, bootstrap/manual entry points, fire-evidence/alert consumers, staging logs/database, System Impact Map/System Manual, ledger/reports, canonical corpus and introducing commits.

It settles these implementation boundaries:

1. a separate durable `scheduled_job_occurrences` ledger uniquely keyed by job and true scheduled boundary;
2. one per-job execution lane shared by natural, missed, boot and manual callers, with durable occurrence identity limited to real schedules;
3. true natural boundaries from `TaskContext.date` and missed boundaries reconstructed from the library's advanced event date;
4. explicit six-job age/backlog/input-honesty policy;
5. no automatic retry after a core reaches `running`; uncertain crash work becomes `indeterminate`;
6. success/error-only compatibility in `scheduled_tasks_audit`, with corrected boundary/start clocks;
7. exact-occurrence `cron_stale` resolution only after exact successful recovery, and an invariant that never touches `cron_verifier_blind`;
8. a deterministic, side-effect-free staging harness that closes Step 7 without changing the host clock or blocking unrelated deployments.

## Coltrane Step-1 gate incorporated

Natural callbacks do not keep their old direct execution path. Every natural and missed event enters the same durable admission and serialization runner, so the natural/missed race cannot execute the same occurrence twice.

## Load-bearing one-pass reader

The fresh-reader record is in pre-audit §7. Its concrete hit was re-derived at the audited ref: node-cron can overlap adjacent missed/natural occurrences, and boot/manual callers reach the same cores outside scheduled wrappers. The plan now routes every production caller through one per-job lane and states that a new ledger is the smallest compatibility-preserving choice rather than the only theoretically possible schema.

## Review ask

Please review the merged audit/plan against the pushed ref and either approve Step 2 or return one consolidated blocker/change list. In particular, test the natural/missed shared-runner boundary, whether the new ledger is the smallest safe correctness store, the six policy limits, crash-state treatment, and exact stale-alert resolution without touching `cron_verifier_blind`.
