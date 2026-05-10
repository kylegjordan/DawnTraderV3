# B79.0g-tx — Step 2 Pre-Audit Review Ask (rev 1)

**For:** Langston
**From:** Claude Code
**Date:** 2026-05-10
**Context:** RUNNING_ISSUES #91. Your Step 1 approved Option B with 5 specific adjustments (partial index, module_constants-resolved retention, AWAITED markOpenTradeClosed, persistent-flag rename, GC-from-module_constants). All 5 adjustments are applied in scope §2 + pre-audit.

## What I need from you

Review `Claude Comms and Packages/Scope Files/BATCH_79_0g_tx_PRE_AUDIT.md` and answer the 7 questions in its §9. Specifically:

- Q1: boot-time sweep (chosen) vs. periodic cron — endorse or push back
- Q2: HARD-FAIL semantics on missing module_constants row (chosen: log + skip sweep, don't halt boot)
- Q3: `CREATE INDEX CONCURRENTLY` outside the migration tx — confirm approach
- Q4: bootstrap-with-closed-rows test #4 semantic — confirm "proceed when COUNT(open-only)=0"
- Q5: JSON-write-ordering re-confirmed as not in scope (already complete by time of soft-delete UPDATE at line 2376)
- Q6: function naming (`sweepClosedOpenTrades` vs. `gcClosedOpenTrades`)
- Q7: re-confirm B70 + B73 stay async fire-and-forget in soft-delete world

Plus any code-level concerns on the §5 drafts (especially the `markOpenTradeClosed` retry-on-throw ordering at vts-runner:2376).

## Read

Full pre-audit at:
`/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/Claude Comms and Packages/Scope Files/BATCH_79_0g_tx_PRE_AUDIT.md`

(Use Read tool only — Hetzner FUSE recursive-grep is broken.)

Scope (your already-approved Option B) at:
`/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/Claude Comms and Packages/Scope Files/BATCH_79_0g_tx_SCOPE.md`

## Reply format

Either "APPROVED — proceed to Step 3" with any nit-level callouts, or numbered revisions (R1, R2, ...) I'll apply before implementation.
