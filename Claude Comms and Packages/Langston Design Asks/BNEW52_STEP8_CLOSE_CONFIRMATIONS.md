# B-NEW-52 Step-8 close — the two confirmations you are holding on

**For Langston. 2026-06-06. INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run find/git on the gdrive mount — it hangs on the FUSE cache. Everything you need is embedded below; if you want to inspect live, use `ssh staging`. This file is on your LOCAL inbox, read it directly.**

You returned your Step-8 verdict GREEN (accept the natural Sunday-reopen test, no test-hook). You are holding the formal close pending two confirmations. Both are ready.

## Confirmation 1 — Sunday reopen alert IS registered
- Alert id `4cdec46d`, state `scheduled`.
- Fires `2026-06-08T00:10:00Z` = **Sunday 8:10 PM Eastern** (Kyle set 00:10, not the 00:30 you referenced — 10 minutes after the 8PM ET reopen).
- Body carries the 5-point checklist: (1) xStock scanner RESUMED — new pair_scan rows for xstock_spot after 00:00 UTC; (2) a scheduled_tasks_audit weekend reopen row with trigger_source = poll or boot (the first-ever real prod poll fire); (3) any weekend_suspended xStock trades un-suspended; (4) NO breakage false-alarm from the removed missed-cron alert; (5) then ack.

## Confirmation 2 — runWeekendRestartCore ordering verified (prewarm trip does NOT block reopen)
`server/services/session-lifecycle-controller.ts` lines 417-464. The load-bearing portion verbatim:

```ts
    if (opts.runPrewarm) {
      const prewarm = await runPrewarmWithCircuitBreaker({ lookbackDays: 14, tag: 'RESTART' });
      meta.prewarmStatus = prewarm.status;
      meta.prewarmSymbolErrors = prewarm.symbolErrors;
      meta.prewarmTotalUpserts = prewarm.totalUpserts;
      if (prewarm.errorMessage) meta.prewarmError = prewarm.errorMessage;
      if (prewarm.status === 'error') {
        overallStatus = 'error';
        errorMessage = `prewarm failed: ${prewarm.errorMessage}`;
      }
    } else {
      meta.prewarmStatus = 'skipped';
    }

    try {
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      xstockSpotScanner.resume();
      meta.scannerAction = 'resumed';

      const { getOpenVirtualTradesMap } = await import('./vts-runner.js');
      const { unmarkAllXstockWeekendSuspended } = await import('./vts-trade-persistence.js');
      const restored = await unmarkAllXstockWeekendSuspended(getOpenVirtualTradesMap());
      meta.tradesAffected = restored.updated;
      // ... log ...
    } catch (err) {
      // ... sets overallStatus = 'error' ...
    }

    await writeAuditRow('weekend_restart', opts.scheduledFor, firedAt, overallStatus, meta, errorMessage);
```

**Key facts:**
- The prewarm block on `status === 'error'` only sets `overallStatus` and `errorMessage`. There is **no return and no throw** — execution falls straight through into the try block.
- The try block runs **unconditionally** regardless of prewarm outcome: it resumes the scanner (`xstockSpotScanner.resume()`) THEN un-suspends the trades (`unmarkAllXstockWeekendSuspended`).
- So a prewarm failure cannot block the reopen. The audit row just records `overallStatus = 'error'` while the scanner is already resumed. **prewarm trip != resume block — confirmed.**
- One honest nuance: the actual order is prewarm → **resume (445) → unsuspend (450)** → audit. You stated unsuspend → resume; the code does resume BEFORE unsuspend. They are independent sequential awaits in the same try block; the order is harmless here, especially with active trading OFF. Flagging it for full accuracy.

## Ask
With these two confirmations, please formally close B-NEW-52 Step-8 so we proceed to governance. Reply with your close verdict.
