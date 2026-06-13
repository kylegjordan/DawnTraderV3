# P19-B3b — Step-4 Change List (Langston code review)

> Commit `d9b312780` on `migration/aws-supabase`. 19 files, +445/−98. 474→404 tsc errors; **CI baseline gate green** ("no regressions above baseline"); **full suite 1899/1899** (164 files, +3 new landmine tests). Split-gate Q1–Q5 you APPROVED. **INFRASTRUCTURE NOTE: review from the snippets below — do NOT cd to /mnt/gdrive or run git on the FUSE mount. For anything beyond these, `ssh staging 'cd /home/deploy/dawntrader && git show d9b312780 -- <file>'`.**

## LANDMINE #2 — RTB silent signal-drop (CRITICAL) — your Q3 = 3b + loud catch
`SQESignalInput` gained `riskScore`/`profitRate` (required); reads `confidence` not `ngc`; the **dead `ngc:` insert key was REMOVED** (verified `rtb_signals` has NO `ngc` column — it was a suppressed TS2353 write to a dropped column; cleaner than "keep the column" since there is none). Catch → observable counter.

```ts
// SQESignalInput (ready_to_buy_service.ts) — ADDED:
riskScore: number;
profitRate: number;
// insertData — confidence (not ngc), ngc key removed:
confidence: input.confidence.toString(),
riskScore: input.riskScore.toString(),
expectedReturn: input.profitRate.toString(),
finalScore: (input.finalScore).toString(),
// (removed) ngc: input.ngc.toString()  — rtb_signals has no ngc column

// NEW observable counter (class fields + methods):
recordQueueFailure(symbol, strategy, error): void { this.queueFailureCount++; ...; console.error('[RTB_QUEUE_DROP][CRITICAL] count=...'); }
getQueueFailureStats(): { count, last }

// signal-orchestrator.ts build-site — POPULATE + catch→counter:
riskScore: extendedMetrics.riskScore,
profitRate: extendedMetrics.profitRate,
...
readyToBuyService.queueSQESignal(sqeSignalInput).catch(err => {
  readyToBuyService.recordQueueFailure(rawSignal.symbol, strategyId, err);   // was a bare console.error
});
```
Test: `b3b-landmine-rtb-drop-counter.test.ts` (3 tests, green).

## LANDMINE #1 — VTS substrate (your Q2 = subset; 18 telemetry errors homed)
`Phase10TradeRecord` gained `assetClass: AssetClass` (required; populated at both builders from the open-trade record). `VirtualSignal` gained `netEV?: number`, **attached from `kernelResult.netEV`** — this revived a permanently-dead Net-EV floor check (`signal.netEV !== undefined` was always false). The other 18 vts-runner errors (quantPatternDetected/filterTier/fees/VTSCycleMetrics/snapshot-tuples) untouched → HOME-E.

## THREE decisions that moved during implementation (your eyes, please)
1. **ngc DB column** — you said 3b "keep writing the ngc column from confidence." Reality: `rtb_signals` has **no ngc column** (dropped; the write was a suppressed error). So I REMOVED the write entirely. Same 3b intent (retire ngc), cleaner. OK?
2. **adaptive-scan-manager regime narrowing** — first pass added a runtime `MarketRegime[]` allow-list → it **hardcoded regime string literals**, which the `regime_mapping_integrity` governance test forbids outside config/tests (caught by full-suite run, 5 fails). Re-fixed to the codebase's own convention: `getCurrentMarketRegime() as MarketRegime` (cf. telemetry-repository.ts:117/340). Test now 7/7.
3. **guardrail-policy `lockedByUser`** — my spec wrongly called it "dropped legacy." It is a LIVE jsonb column (schema:353, set by routes.ts:1677). Real error was a missing null-guard on the `| null` select. Fixed with the guard + kept the field (dropped a pre-existing `as any`).

## HOMED (rule 9.4 — named, in RUNNING_ISSUES, NOT fixed here)
- **orchestrator:1051** — `active_signal` ablation emit needs an **integer** `signalId` (FK `trading_signals.id`); orchestrator only has a string SLAL id. Dormant B67 scaffolding (fires empty alternates = no-op), never wired since active-trading off Phase-8. Forcing it = corrupt the integer DB contract (rule-15 patch). Stays **within baseline** (signal-orchestrator TS2322 1→1, no new pair → CI green). Home: ablation active-signal id wiring (P19-B4/ablation work).
- 18 vts-runner telemetry errors → VTS cleanup batch (HOME-E). routes/storage/UI/advisory buckets per the approved triage.

## Mechanical active-path fixes (all real type-alignment, no suppression)
B69 `GLOBAL_KEY` sentinel (module-constants-service) → per-underlying-cap ×3 + factor-ablation-emitter ×1 (was untyped `{}` → ResolutionKey). OHLC `{ohlc,last}` destructure (orchestrator 1360-79). orchestrator import-path `../../`→`../config/strategy-governance.js`. `regime` sourced from MCE cached context (was undefined off extendedMetrics; driftScore/volZ → explicit documented defaults, no real source on this path). `SizedStrategySignal` += finalScore/regimeWeight/hybridScore. getScreenerFilters += assetClass. `RegimeCalculationResult.regimeScore` root-fix (types + market-regime.ts). trailing-exit warmup-status += refreshFailCount/stalenessMs + threaded mode arg. paper-portfolio-manager arg-counts + userId removal. pre-exec-validator null-guard. paper-execution-engine metadata reads. fx5-scanner null-safety + ScanDiagnostics.familyPaths + isBenchmark. guardrail-policy live-branch Phase-21 honest-stub (no broken `global-live-engine` import). storage.ts 3 paper-sim lines (paper_sim_sessions userId, portfolio_state cash/cryptoValue, stoppedBy — dropped columns removed).

**Ask:** approve the diff, OR flag. Specifically your read on the 3 moved decisions above. CI/deploy/governance proceed on your APPROVE.
