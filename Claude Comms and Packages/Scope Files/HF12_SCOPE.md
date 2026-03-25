# HF12 Scope — Regime Archive Startup Catch-Up Fix

**Batch**: HF12
**Type**: Hotfix (Code)
**Phase**: 11.7E — Predictive Learning Feedback Loop (Archival)
**Author**: Claude Code
**Reviewed by**: Langston (consensus reached 2026-03-17)
**Status**: STAGED

---

## Problem Statement

The regime archive weekly cron job (Sunday 00:45 UTC) failed to fire on 2026-03-16. The scheduler uses `node-schedule`, which runs in-process — if the Replit server is sleeping at the scheduled time, the job silently misses with no retry or catch-up. This creates gaps in the regime performance archive timeline that feeds the Predictive Learning Feedback Loop.

## Root Cause

`node-schedule` is a JavaScript-level cron library. Jobs only execute while the Node.js process is alive. Replit's free-tier servers sleep after inactivity, and there is no external cron (system `crontab -l` returns "no crontab for root"). When the server sleeps through the Sunday 00:45 UTC window, the archive job is simply skipped.

## Fix (Consensus: Claude Code + Langston)

1. **Startup catch-up check** — On server boot, read the archive manifest. If the most recent archive is >7 days old (or no archives exist), run `archiveRegimeMetrics()` immediately. This ensures missed runs are recovered on the next server wake.

2. **Scheduler status API endpoint** — New read-only `GET /api/vts/regime-archive/scheduler-status` returns: scheduler init state, next scheduled run times, catch-up results, and overdue status. Provides operational visibility into the scheduler's health.

## Files Modified

| File | Lines Changed | Description |
|------|--------------|-------------|
| `server/core/archival/archival-scheduler.ts` | ~90 added | Catch-up function, state tracking, enhanced status |
| `server/routes/regime-archive.ts` | ~20 added | New scheduler-status GET endpoint |

## Post-Deploy Actions

1. Verify server starts cleanly (no TypeScript errors)
2. Check logs for `[11.7E][CatchUp]` output
3. Trigger manual archive via `POST /api/vts/regime-archive/trigger`
4. Hit `GET /api/vts/regime-archive/scheduler-status` to confirm endpoint works
5. Confirm test baseline holds (~790 pass / ~91 fail)

## Follow-Up

- HF12B governance batch: Update CCPI (last commit, completed directives) + add Operational Model section to SYSTEM_MANUAL.md
