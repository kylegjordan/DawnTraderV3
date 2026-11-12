# B-CRON-MISSED-CATCHUP — Step 3 change list

**Workflow step:** 3 of 11 — implementation

**Batch:** `B-CRON-MISSED-CATCHUP` · **Issue:** `#691` · **Change class:** architecture

## Implementation object

- `drizzle/migrations/2026-11-12-b-cron-missed-catchup.sql`
- `drizzle/migrations/2026-11-12-b-cron-missed-catchup-rollback.sql`
- `shared/schema.ts`
- `server/services/cron-registry.ts`
- `server/services/cron-occurrence-runner.ts`
- `server/services/scheduled-jobs-audit.ts`
- `server/services/cron-fire-evidence-verifier.ts`
- `server/services/system-alerts.ts`
- `server/jobs/formula-auto-audit.ts`
- `server/jobs/feed-integrity-auto-check.ts`
- `server/services/awareness-scheduler.ts`
- `server/services/xstock-qd-probe-cron.ts`
- `server/services/xstock-universe-cron.ts`
- `server/routes.ts`
- `server/scripts/b-cron-missed-catchup-harness.ts`
- `server/tests/unit/b-cron-missed-catchup.test.ts`
- `server/tests/unit/b-cron-missed-catchup-alert-store.test.ts`
- `server/tests/unit/b-formula-health-audit-freshness.test.ts`
- `.tsc-baseline.json`

## What changed

1. Added the append-in-identity `scheduled_job_occurrences` ledger with a database-enforced `(job_name, scheduled_for)` identity, explicit claim/start/terminal states, microsecond schedule timestamps, process/attempt identity, policy evidence and guarded rollback.
2. Extended the central registry with the six-job recovery contract and added one per-job lane shared by natural, missed, boot and manual callers. Scheduled work is boundary-ordered; auxiliary work retains its queue position; a checked-out PostgreSQL connection holds the per-job advisory lock across admission and core execution.
3. Implemented the approved v1 age/backlog/input-honesty policy. Every admitted scheduled identity is either executed once or durably skipped with its reason; claim uncertainty runs no core; after-start uncertainty becomes `indeterminate` and is never automatically retried.
4. Reconstructed node-cron 4.2.1 missed boundaries from the library's advanced event date and fenced that source ordering in tests. Natural callbacks use `TaskContext.date`, so completed audit rows now separate the true schedule boundary from actual core start.
5. Refactored all six production wrappers through the common runner while preserving cadence, timezone, enablement, feed jitter, Q-D `noOverlap`, formula counts, Q-D coverage fields and discovery evidence. The feed/awareness boot calls and formula/feed/reflection/universe manual routes now share the same per-job serialization lane without creating false scheduled identities.
6. Added exact-occurrence stale-alert recovery through canonical machine actor `cron-recovery` and transport `engine`. Only a durable `succeeded` result for the same job/boundary resolves its `cron_stale` row, with occurrence ID, policy version and terminal time as evidence; failures, skips and indeterminate rows remain open, and `cron_verifier_blind` is untouched.
7. Added an exact-ref, operator-gated staging harness using only synthetic side-effect-free jobs. It exercises the real ledger, lock, audit and alert paths and retains the durable read-back while resolving only its expected synthetic failure alerts.
8. Added mutation-oriented tests for true natural/missed clocks, UTC/non-UTC reconstruction, invalid schedules, duplicates, natural/missed races, FIFO/backlog cap, all six lag policies, feed/session guards, claim refusal, cross-process contention, shared auxiliary serialization, cross-job independence, crash reconciliation, audit/terminal failures, exact alert-store attribution and the six-site registration census.
9. Re-synced three pre-existing TypeScript error-message orderings changed by the new schema export. The baseline remains 324 errors across 43 files; no error count or file was added.

## Verification run during implementation

- `node scripts/check-tsc-baseline.mjs` — PASS: current 324, baseline 324, no regression above baseline.
- `npx vitest run server/tests/unit/b-cron-missed-catchup.test.ts server/tests/unit/b-cron-missed-catchup-alert-store.test.ts` — PASS: 31/31.
- `npm run build` — PASS; only the repository's pre-existing CSS, chunk-size and duplicate-member warnings were reported.
- Relevant existing scheduler/formula/alert suites were run; one formula source-contract assertion still described the retired direct audit writer, was updated to the common-runner contract, and its focused suite then passed 21/21.
- `git -c core.whitespace=cr-at-eol diff --check` — PASS. The override tells Git to treat the repository's existing CRLF endings as line endings rather than added trailing spaces.

## Deliberately unchanged

- No job business logic, cadence, threshold, formula, discovery rule or Q-D metric changed.
- `scheduled_tasks_audit` remains success/error-only and failure-safe; it is not the correctness claim.
- `cron_verifier_blind` remains manual-only.
- `.claude/launch.json` remains untracked and untouched.
