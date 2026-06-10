# B-4.6-B pre-audit — RAW APPENDIX: scan-loop sync-segment + shared-state enumeration (2026-06-10)

> Produced by a read-only exploration sweep of the three per-pair loops; spot-verified items marked ✔. **STATUS: RAW LEADS for the Step-2 pre-audit — every shared-state item below gets a direct-read verification + a C1 verdict (immutable-during-cycle / mutation-harmless / needs-cycle-local-snapshot) in B_4_6B_PRE_AUDIT.md before any chunking diff is written.** One agent error already caught + corrected: xStock SCAN_INTERVAL_SECONDS = 30 (scanner.ts:75 ✔, central-clock tick % 30 — the report's "10s" was wrong; live log confirms 30s cadence).

## LOOP 1 — crypto AdaptiveScan (market-scanner.ts `collectAdaptiveBatch()` ~497-996; ~300 pairs; called from fx5-scanner runCycle)
- Pre-DBS fetch loop ~663-694: batched 10-concurrent via Promise.all; per-pair SYNC compute = computeATR14 + computeDirectionalBias ×2 (the agent flags this as a no-yield CPU zone within each batch-of-10).
- Main filter loop ~699-836: mostly sync per-pair checks; existing awaits = ohlcCache.getOHLCData (667), passesHistoryFilter (785; also 936 in the 19F pattern loop ~882-956).
- Shared-state reads: ohlcCache, activeFilterPool.getSymbolsRaw (mutated by signal-orchestrator — cross-lane), adaptiveScanManager, storage.getActiveTrades, module counters (reb210*), SCANNER_PARAMS; dbsCache is FUNCTION-LOCAL (safe).
- Cross-lane writes: setCostMetrics → shared cost-cache (read by MCE + cost-model consumers); adaptiveScanManager.recordScanResult → telemetry.

## LOOP 2 — xStock scan cycle (xstock_spot/scanner.ts `runCycle()` loop ~855-897 → eval-cycle.ts `evaluateXstockPairForVTS()` ~266-703; 75 pairs; every 30s ✔)
- Per-pair SYNC compute (inside the eval): mce.computeContext (346), scanPatterns (418), callStrategyDetect (509), computeRealHybridScore/computeFinalScore/computeNetExpectancyKernel (594-614).
- Existing awaits per pair: evaluateXstockPairForVTS itself + global/pattern/family-IMF filter evals (311/314/357) + archiver dynamic imports (545/639/684).
- Shared-state reads: MCE singleton cache, cost-cache (getCachedCostMetrics 609), module-constants cache, db; loop-local prefetched maps (ohlcBatch/tickerEnrichment/depth — safe).
- Guard: `isScanning` re-entrancy flag (scanner.ts ~305) — a chunked cycle stays self-exclusive ✔.

## LOOP 3 — VTS eval loop (vts-runner.ts `runPhase10SimulationCycle()` ~3107-3699, pair loop ~3288-3648; 115-155 pairs; 60s beat w/ item-4 lifecycle guard)
- Per-pair SYNC compute: mce.computeContext (3346), scanPatterns ×2 (3383/3447), getStrategiesForRegime (3421); per-strategy await generatePhase10Signal (3587).
- Existing awaits per pair: fetchOHLCForPair (3309) + generatePhase10Signal (3587).
- Shared-state reads (the C1 hot list): **openVirtualTrades module-level Map** (3291 size-cap check + 3543 duplicate-position scan — ALSO WRITTEN by signal generation mid-cycle → read-write interleave risk if other lanes touch it), lastSetupHash Map, btcOhlcCache module array, priceCache, ohlcCache, vtsService.updateMarketPrice (3480, cross-lane write), hybridConfluenceBuffer (NOW source-namespaced per item-4 D1b — cross-lane risk reduced by design ✔), module-constants cache, fx5Scanner.getLastScanDiagnostics (3264); function-local: vtsSymbolFamilies/blockedDupCombos/hybridDedupeSet/outerLoopDetectedPatterns (safe).

## Carry-forward into the pre-audit verdict table (Langston C1)
Priority items needing explicit verdicts: (1) openVirtualTrades (read+written same cycle; what other lanes touch it?); (2) MCE computeContext internal cache (all 3 loops share it — TTL semantics under interleave); (3) cost-cache write(L1)/read(L2) ordering if L1 and L2 interleave mid-sweep; (4) activeFilterPool mutation by signal-orchestrator mid-loop; (5) btcOhlcCache refresh timing vs per-pair reads. Existing awaits PROVE each loop already tolerates interleave at those points today — the C1 question is only about the NEW yield points between them (Langston C2: elapsed-time-triggered ~20ms).
