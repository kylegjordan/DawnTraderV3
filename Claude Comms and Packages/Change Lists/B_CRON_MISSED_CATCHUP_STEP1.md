# B-CRON-MISSED-CATCHUP — STEP 1 REVIEW LIST

**Batch:** `B-CRON-MISSED-CATCHUP` · **Issue:** `#691` · **Owner:** ANALYST Codex · **Reviewer:** Coltrane

## Review ref

The pushed commit carrying this file is the exact review ref named in the Discord dispatch. The scope draft is commit `a7195156e`; the review ref contains those exact scope bytes plus this packet and the current position record.

## Added

- `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_SCOPE.md`
  - declares `change-class: architecture`;
  - sets seven numbered objectives with executable verification criteria;
  - covers both proven miss mechanisms: wall-clock step and blocked event loop;
  - records that node-cron 4.2.1 advances to the next boundary before emitting its missed event, so the true missed boundary must be reconstructed and validated;
  - requires one durable claim per job and boundary, per-job serialization, crash-state evidence and no blind retry of uncertain side effects;
  - requires a six-job age/backlog/idempotency matrix so an old Q-D event cannot put current data into a historical bucket and universe discovery cannot burst provider calls;
  - preserves the six jobs' business purpose, cadence, timezone, jitter, overlap and job-specific evidence;
  - settles the false `cron_stale` auto-clear claim while preserving the separately manual-only `cron_verifier_blind` alert;
  - replaces a natural multi-day wait with a deterministic exact-ref staging harness that does not alter the host clock or block unrelated deployments;
  - records the direct System Impact Map, System Manual, current-code, live-database and full provenance reads.

## Updated

- `1-system-manual/SPRINT_TO_LIVE_PLAN.md`
  - moves pre-sprint stage 3 item 7 from queued to Step 1 with Coltrane.
- `1-system-manual/CC_C_SESSION_TASK_LIST.md`
  - records the correct sequence after the closed snapshot-retention batch and the true two-mechanism recovery boundary.
- `.claude/memory/MEMORY_CC_C.md`
  - records the active review wait and preserves every unrelated event wait and alert.

## Board

- Existing item `PVTI_lAHODmulEM4BfQP4zg_6eIE` is in Scope.
- Owner remains Analyst; type Batch; issue `#691`.
- `Blocked on` is set to the board's reviewer option (`Langston`) at dispatch; Coltrane is the active reviewer for this Codex shift.

## Reviewer questions

1. Is `architecture` the correct class for changing the cross-cutting execution contract of all six node-cron jobs and their durable evidence?
2. Is reconstructing the missed boundary as the calendar occurrence immediately before the library's advanced event date the correct dependency-specific contract, including multiple consecutive misses?
3. Does the durable-claim boundary honestly provide one admitted attempt while refusing to claim exactly-once external side effects across an unclassified crash?
4. Is the per-job FIFO plus explicit age/backlog/idempotency matrix the correct way to prevent a thundering herd and historical Q-D fabrication?
5. Should recovery decisions extend `scheduled_tasks_audit`, or should Step 2 prefer a narrow separate ledger so claims/skips cannot be mistaken for successful fires?
6. Is the stale-alert rule correct: resolve only the exact occurrence with evidence, correct every promise to match the rule, and never touch `cron_verifier_blind`?
7. Does the deterministic fake-job staging harness provide sufficient Step-7 proof without changing the host clock, calling real external/destructive jobs, or imposing a deployment-blocking observation window?
