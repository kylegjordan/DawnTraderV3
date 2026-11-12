# B-CRON-MISSED-CATCHUP — Step 11 claim-only reader repair

Date: 2026-11-12
Owner: ANALYST Codex (CC-C stand-in)
Status: Step 3 repair complete; return to Step 4 review
Base runtime: `4e66ea904edf690e144035c959cbd335241f7651`

## Why completion stopped

The required claim-only Step 11 reader was given only the completion claim and
asked to name alternate states consistent with the proposed proof. The reader
found four concrete states in which the claim could be false. Each was
re-derived against the implementation and repaired before any completion report
was allowed to leave the draft stage.

## Re-derived defects and structural repairs

1. **Exact stale-alert resolution could be lost.** A successful recovered
   occurrence tried the exact resolution once. A temporary alert-store failure,
   or an alert written just after that attempt, could leave the exact row open.
   Successful missed recoveries now retain a durable pending-resolution marker
   in the occurrence ledger. Every scheduled, auxiliary and startup lock holder
   retries it; the marker clears only after the exact alert row is resolved.
   Exact scheduled-boundary alerts are one-shot, so an in-flight verifier cannot
   recreate the same immutable occurrence after its resolution.
2. **The verifier could certify the wrong evidence.** It used the latest start
   time without requiring success, so an error or an older boundary starting
   late could make a missed boundary appear healthy. It now reads only the
   latest successful scheduled boundary across the audit stream and occurrence
   ledger.
3. **Eligibility could expire before core work began.** The catch-up policy was
   decided before lock wait and pre-run work. It is now decided under the job
   lock and rechecked at actual core start; an occurrence that ages out becomes
   an explicit skip and never enters the job core.
4. **Q-D's business clock had changed accidentally.** The wrapper passed the
   historical scheduled boundary into a job that reads current snapshots. Q-D
   now uses actual start time for market state, freshness and bucketing while
   retaining the scheduled boundary as the durable occurrence identity.

## Verification at the repair boundary

- Focused runner, alert-store, verifier and Formula Health suites: 4 files,
  90 tests passed, including retry, one-shot and already-resolved branches.
- TypeScript baseline gate: 324 current known errors versus 324 baseline errors;
  no new or changed error.
- New controls exercise temporary resolution failure, alert-mint ordering,
  start-time expiry, successful-boundary filtering and the Q-D clock split.
- `git diff --check`: clean.

## Honest residual carried forward

The deterministic staging race proves one core execution inside one process and
the database uniqueness constraint is separately exercised. It does not imitate
a second operating-system process losing its database-lock session while the
core is already running. That destructive fault is not required by the
registered scope and will be stated as a proof limit rather than represented as
covered.

## Claim-only reader record

`REVIEWER: claim-only · name the objects and alternate states consistent with the completion mechanism · HIT — durable stale-resolve retry absent; verifier used fired-at/error-compatible evidence; eligibility not rechecked at start; Q-D business clock regressed to scheduled boundary; staging race did not establish separate-process/mid-core-lock-loss behavior · re-derived yes`

The reader record identifies the challenge; every defect and repair above was
independently re-derived from the code before implementation.
