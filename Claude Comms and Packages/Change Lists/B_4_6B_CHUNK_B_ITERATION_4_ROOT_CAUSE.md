# B-4.6-B chunk-B iteration 4 — THE residual-stall root cause + fix (Step-9 iteration, review before push)

**From:** Claude New (CC-B) · 2026-06-12 ~02:45Z · NOT pushed.
**Where this sits:** your Step-4 APPROVE-TO-PUSH covered the yields (shipped `ff0b0e36e`, verified working — all four segments collapsed to <17ms max spans, counters/cadence unchanged). But ELD max stayed 283-566ms/interval. Iterations 2-3 (measurement-only, shipped `7a28ac307` + `31e39bbf6`) ran the chunk-A R1 escalation and then a 50ms stall watchdog. This file is the attribution chain + the root-cause fix, in-batch per Kyle's fix-dependencies-found mandate.

## The attribution chain (each step evidence, not inference)

1. **Iteration 2 cleared the named suspects:** GC max 19-47ms/interval (kind=4 MarkSweepCompact, count 65-93 — healthy churn, no single pause near the stall); `crypto_main_filter_pair` max 45-59ms (await-polluted at that); `crypto_pattern_pair` ≤3ms. ELD max still 286-451ms.
2. **Iteration 3 watchdog bracketed the block exactly:** `[4.6B][STALL]` fires every ~30s (the sweep cadence), gap 211-397ms. Window 02:20:06.691→07.138 sits between the LAST :06 line `[19H][DIAG] Scan diagnostics stored` (out.log:5693249) and the FIRST :07 line `[19F][VTS_PARITY]` (:5693250).
3. **The code between those two log statements** is `fx5-scanner.ts:1540` → `this.persistDiagnostics()` (Batch 44), whose body is: `JSON.stringify({lastScan, history: <full 24h window>, ...})` + **`fs.writeFileSync`** — EVERY 30s cycle.
4. **Magnitude confirmed on staging:** today's file was **24MB at 02:28** (daily files run 20-30MB). A 24MB sync stringify+write per sweep = the 200-700ms block; the size slides with the 24h window, explaining the soak's 184-704ms range and the day-shape. **Bonus finding:** `logs/fx5_diagnostics/` holds **1.6GB** of daily files nothing ever reads or prunes (rehydrate touches only today+yesterday; the 4.6-A cleanup hit a different dir).
5. This also re-homes the cron-miss family: the watchdog-proven once-per-sweep block is the timer-starvation source the soak attributed to the prefetch loop. **PREVIOUSLY/NOW for the record: the soak's "crypto_prefetch cumulative back-to-back run = root cause of the spike" was PARTIAL** — the prefetch was a real contiguous-block contributor (now fixed by yields), but the interval MAX was this writeFileSync all along (it sat between two log lines no instrument covered).

## The fix (fx5-scanner.ts only — full new methods in inbox copy)

`persistDiagnostics()`: per-cycle **JSONL append, async** — `fs.promises.appendFile(diagnostics_<date>.jsonl, JSON.stringify(oneCycleRecord) + '\n')`, ~8KB/line, fire-and-forget with `.catch` log (same pattern as the adjacent `dataAggregator.capture`). O(1) per cycle; zero sync stringify of the window; zero sync write. Plus a **date-flip retention sweep** (async readdir+unlink, keep only today+yesterday `.jsonl`) — clears the 1.6GB legacy accumulation on first post-deploy cycle and prevents regrowth.

`rehydrateDiagnostics()`: reads the JSONL line-per-cycle format (per-line parse, torn-final-line tolerant; boot-time sync read acceptable — cold-start-warmup principle). **Disclosed one-time cost:** legacy `.json` files are not parsed — ≤24h diagnostics-history gap in the panel at the format-change deploy; window refills naturally.

**Restart-survival guarantee unchanged** (same DIAG_DIR, same 24h window semantics, same in-memory history/dedupe/sort path — only the disk format and write mechanics change). Consumers of `scanDiagnosticsHistory` (diagnostics getter/panel) untouched.

## Bench
tsc baseline gate OK; scan-yield tests 5/5. (No existing unit suite covers persist/rehydrate — they are fs-side-effect methods; the live verify below is the behavioral check.)

## Post-deploy verify plan (the batch's acceptance evidence)
(1) `[4.6B][STALL]` lines STOP (or drop under 150ms threshold); (2) ELD max_ms per interval falls toward the <50ms gate — your PROCEED caveat-2 re-check; (3) `.jsonl` file grows by one line per cycle; retention sweep logs the legacy-file removal (~70 files); (4) rehydrate line on next restart shows the window refilling; (5) counters/cadence unchanged.

## The ask
Step-9 iteration verdict: APPROVE-TO-PUSH or revisions. Note the watchdog + GC observer + the two extra spans stay in (instrument value proved itself; trivial overhead; [4.6B][STALL] becomes the permanent tripwire for ANY future ≥150ms blocker).
