# B-NEW-51 — Cron-fire-evidence verifier: cadence-aware staleness + root-level alert dedup

**Phase:** 24-adjacent operational. **Mode:** active trading OFF. **Drafted:** 2026-06-02 (CC), Kyle directive ("fix it now, real fix not a patch"). **Step-1 reviewer:** Langston (he diagnosed the live symptom + handed it to CC).

## Problem (two distinct root causes)

The B-NEW-49 cron-fire-evidence verifier has been emitting a `weekend_shutdown appears silently stopped (stale_fire_evidence)` alert **every 15 minutes since ~12:11Z today** (16+ identical alerts), each auto-routed to Langston via the B-NEW-46 relay. Kyle: this desensitizes us to alerts. Two independent bugs:

1. **Staleness model is calendar-blind.** The verifier computes `expected_by = lastFire + intervalSeconds × 1.5`. For `weekend_shutdown` (`0 20 * * 5` America/New_York, weekly = 604800s) that's `lastFire(2026-05-23) + 10.5 days = 2026-06-02T12:00Z` — i.e. it expects the **weekend** timer to have fired by **Tuesday**. The interval×1.5 model is correct for fixed-interval jobs (every-5-min, hourly, daily) but WRONG for any cron-calendar schedule whose occurrences aren't evenly spaced from the last fire. It produces false "stale" for healthy weekly/infrequent schedules mid-cycle.
   - *Note:* `weekend_shutdown` genuinely DID miss its 2026-05-29/30 occurrence (last real fire 2026-05-23) — but that miss predates the B-NEW-36/49/50 fixes (deployed 05-31 → 06-01) and there's been no weekend since, so it cannot yet self-clear. A cadence-aware verifier still flags it (correct — May 29 was missed) but the **dedup (root cause 2) is what stops the every-15-min spam**.

2. **No alert dedup.** `addAlert()` always creates a new UUID entry — there is NO suppression of repeats. The verifier re-runs every 15 min and re-`addAlert`s the SAME condition each cycle → 96 alerts/day for one stuck schedule + a Langston invoke per cycle. This is the desensitization root cause and affects EVERY alert source, not just this verifier.

## Fix (structural, NO PATCHES)

**Fix 1 — cadence-aware staleness (`cron-fire-evidence-verifier.ts` + new helper in `cron-next-fire.ts`).**
- Add `computePrevFire(expression, timezone, from)` to `cron-next-fire.ts` — mirrors the existing `computeNextFire` but calls cron-parser's `.prev()` (the trusted introspection path from B-NEW-50; node-cron's getNextRun stays untrusted). Failure-safe → null on parse error.
- Verifier: for each registered job, compute `prevOccurrence = computePrevFire(job.expression, job.timezone, now)`. A job is **stale** iff: `prevOccurrence` exists AND `prevOccurrence < now − FIRE_LATENCY_GRACE` AND (`lastFire == null` OR `lastFire < prevOccurrence − FIRE_LATENCY_GRACE`). `FIRE_LATENCY_GRACE` = small fixed window (proposed 10 min) for the gap between a fire and its evidence-row write. This correctly handles weekly / daily / sub-hourly schedules via the calendar, eliminating the interval×1.5 false-positives.
- Keep a conservative **boot-grace**: skip a job if process uptime < a small window (proposed 5 min) so we don't race boot-time evidence writes. (Replaces the old interval-derived boot-grace, which is no longer meaningful.)
- Fallback: if `computePrevFire` returns null (unparseable expression — shouldn't happen, registry requires a valid expression), retain the old interval×1.5 model for that job so we never go blind.

**Fix 2 — root-level alert dedup (`system-alerts.ts`).**
- Add optional `dedupe_key?: string` to `AddAlertOptions` + `SystemAlert` (schema_version stays 1 — additive optional field; readers already tolerate extra fields).
- In `addAlert`, when `dedupe_key` is provided: under the existing file lock, scan current alerts for one with the SAME `dedupe_key` in a NON-terminal state (`scheduled` | `active` | `acknowledged`). If found → return that existing alert WITHOUT appending (deduped, no-op write). Only append if none exists or the prior is `resolved`. No `dedupe_key` → today's behavior exactly (backward-compatible; zero change for all other callers).
- Verifier passes `dedupe_key = cron_stale:${jobName}:${prevOccurrence.toISOString()}`. Same missed occurrence → same key → one alert total across all 15-min cycles. If the schedule fires next occurrence → not stale → no alert. If a NEW occurrence is later missed → new key → exactly one new alert.

**Deploy cleanup (one-time):** `resolve` the existing active/scheduled `weekend_shutdown` `stale_fire_evidence` alerts (the ~16 legacy entries with no dedupe_key) so the current stream stops cleanly the moment we deploy. Scripted resolve by id, `--by cc-session-2026-06-02`.

## Out of scope
- The genuine weekend_shutdown firing confirmation — that's the natural June 5-6 weekend test (poll-reconcile B-NEW-36 protects the outcome regardless; active trading OFF). NOT this batch.
- node-cron's getNextRun bug — already handled in B-NEW-50.
- Changing the verifier cadence (stays 15-min setInterval) or the dispatcher.

## Files
- `server/services/cron-next-fire.ts` — NEW `computePrevFire`.
- `server/services/cron-fire-evidence-verifier.ts` — cadence-aware staleness + dedupe_key.
- `server/services/system-alerts.ts` — `dedupe_key` field + dedup in `addAlert`.
- Tests: `cron-next-fire.test.ts` (+prev cases), `cron-fire-evidence-verifier.test.ts` (cadence + dedupe_key + boot-grace + interval-fallback), `system-alerts` dedup tests (new or existing file).

## Verification
- Local: tsc 493 baseline (0 net new); new + existing vitest green.
- Staging: deploy → resolve legacy alerts → on the next verifier cycle expect **exactly ONE** new (deduped) `weekend_shutdown` stale alert — the 2026-05-29 miss is genuine (Langston Step-1 §42), and legacy entries carry no `dedupe_key` so the first keyed alert appends — then **ZERO** on every subsequent cycle (dedup suppresses). That single alert is legitimate, not a regression. Confirm via PM2 log (`STALE ... dedupe_key=...` once, then deduped/healthy) + alert-file count for the key = 1.
- §9.3 not applicable (no UI surface).

## Blast radius
LOW-MEDIUM. The dedup change touches the shared `addAlert` but is gated on the new optional param (no existing caller passes it → identical behavior). The verifier rewrite changes WHEN it alerts, not the alert mechanism. No DB migration. No trading-path code. Crypto/xStock-agnostic (operational infra).
