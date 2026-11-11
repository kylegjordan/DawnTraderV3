# B-XSTOCK-SNAPSHOT-RETENTION — Step 2 change list

**Workflow step:** 2 of 11 — pre-implementation audit and implementation plan

**Reviewer:** Coltrane

**Change class:** architecture

## Review object

- `Claude Comms and Packages/Scope Files/B_XSTOCK_SNAPSHOT_RETENTION_PRE_AUDIT.md`

## What changed

The merged audit/plan reads the live cache and prewarm writers, the complete B75 archive/evidence/rehydrate stack, every direct snapshot consumer, staging runtime and database state, the System Impact Map/System Manual, ledger/reports, canonical corpus and git origins.

It settles these implementation boundaries:

1. one ranked snapshot lane inside B75's existing state machine;
2. 30 complete UTC days plus the newest 240/60 rows per symbol;
3. deterministic day + ordered-key-digest object labels;
4. source/export/download count, ordered-key digest, full-row digest and compressed checksum proof;
5. a short writer-excluding compare/proven-key-delete transaction;
6. one existing B75 scheduler behind a shared kernel-held cron/manual lock, plus a manual `--snapshot-only` mode for the supervised initial backlog;
7. explicit recent-hot, historical-rehydrate and dormant consumer classes;
8. ordinary VACUUM/ANALYZE once per table/run after its object loop, reported honestly with no physical-shrink promise.

## Coltrane correction incorporated

The first review found that B75's current six-hour timestamp lock can unlink a still-live backlog run and that the old holder can later remove its successor's lock. The plan now replaces that path with a stable kernel-held `flock` shared by cron and manual invocations: the operating system releases it on exit/crash, and application code neither age-reclaims nor unlinks it. Red process tests cover a live holder beyond six hours, crash recovery, successor safety and cron/manual contention.

The plan also settles vacuum frequency as zero for a no-delete table and exactly once per table per invocation after the complete object loop, never once per object.

## Load-bearing claims for review

The host instruction prohibited a fresh subagent reader, so these are explicitly **NOT RE-READ** before Coltrane:

- complete writer/reader/deleter/scheduler census;
- safety and boundedness of the `LOCK TABLE ... IN SHARE MODE` final transaction;
- deterministic label behaviour for newly eligible keys versus same-key content resurrection;
- canonical digest equivalence and microsecond preservation;
- the prewarm non-resurrection invariant;
- exact eligible counts/object distribution;
- historical-reader horizon classification.

## Review ask

Please review the merged document against the pushed ref and either approve Step 2 or return one consolidated blocker/change list. In particular, test whether another state of the world fits the writer/scheduler census, whether a same-day later eligible population can make progress without weakening closed-out-copy refusal, and whether the locked single-statement delete can race any writer or manifest transition.
