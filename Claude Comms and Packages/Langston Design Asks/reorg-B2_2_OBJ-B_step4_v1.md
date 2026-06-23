# reorg-B2.2 OBJ-B — Step-4 code-diff review (NEW Claude → Langston)

**INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git status/log on the gdrive mount. The full diff + the new test are EMBEDDED below — read them here (local FS, fast). Use `ssh staging` only if you want to inspect deployed state (nothing deployed yet — post-window).**

## What this is
OBJ-B = the per-`(strategy, assetClass)` re-key of the guard-eval tracker, so the two VTS Filter-Diagnostics tabs (crypto / xStock) each show ONLY their class's reward-vs-risk / reachability / stop-distance / invalid-ATR drops (Kyle no-hidden-gates, per class). Implements the design you and I locked at Step-1/2 (`P19_REORG_B2_2_SCOPE.md` + `_PRE_AUDIT.md`). Nothing deploys now — A+B bundle deploys post-window.

## Bench (done, this session)
- `node scripts/check-tsc-baseline.mjs` → **OK, no regressions above baseline.**
- New test `reorg-b2-2-guard-eval-rekey.test.ts` → **6/6 pass.**
- Full `npx vitest run` → 178 files pass; the 9 failing files are the **pre-existing no-DB-in-bench** set (all abort at a top-level `beforeAll`/`prefetchModule` → `db.select()` pg-pool connect). PROVEN identical on the clean baseline via `git stash` (net_expectancy, b63-item12, directive-11.7S fail the same way with my changes removed). None are mine; reorg-B2.1 closed CI-4-green with the same files, so CI (which has the DB) stays green.

## How each of your Step-1/2 FLAGs is discharged in code (please confirm against the diff)
- **FLAG-1 (keySchema guard, incl. unversioned legacy = mismatch):** `_KEY_SCHEMA = 'strategy::assetClass/v1'` written into the checkpoint; reload **discards-and-loud-logs** when `d.keySchema !== _KEY_SCHEMA`, and `d?.keySchema ?? 'UNVERSIONED'` makes an OBJ-A-era no-keySchema checkpoint hit that branch. On discard we also do NOT restore `_startedAt` (clean fresh window). Test: "unversioned legacy checkpoint is DISCARDED on reload" asserts empty stats + null startedAt + console.error called.
- **FLAG-2 (aggregate sums RAW, re-derives ratios — never averages):** `getGuardEvalStats()` folds composite buckets per strategy via `_accumulate` (raw fields + Math.min/max), then `_derive` recomputes meanRR/rrSuppressionRate from the summed raw. Test "summed-raw re-derivation, NOT an average of per-class ratios" pins 52/102 vs the wrong 0.75.
- **FLAG-3 (distinct no-evaluations state ≠ 0%):** the UI card renders "No guard evaluations recorded for this asset class yet…" when `guardDrops` is empty; per-class endpoint returns `{}` for a class with zero evals (test "a class with no evaluations yields an empty map").
- **FLAG-4 / Nits:** raw `/api/diagnostics/guard-eval-stats` is additive — `stats` (strategy aggregate, unchanged shape) + new `statsByClass` field (schema bumped v2→v3). Drop-reason labels use the real `GuardDropReason` enum via `formatFilterName` (no raw key leaks). SIM gets the singleton-liveness + re-key entry at close; no System-Manual content change (display/data-quality only).

## Specific things to hold me to
1. The composite key uses `lastIndexOf('::')` so a strategy name is never mis-split. OK?
2. `recordGuardEval` 5th arg typed `AssetClass` — all 18 sites pass the in-scope `assetClass` (verified each site sits right after `getPerClassTargetGate(assetClass)`).
3. Both endpoints fetch guard stats inside a try/catch so a tracker import failure degrades to `{}` (never 500s the whole diagnostics payload). OK?

---

## FULL DIFF (server + client)

```diff
warning: in the working copy of 'server/routes.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'server/strategies/guard-eval-tracker.ts', LF will be replaced by CRLF the next time Git touches it
diff --git a/client/src/pages/machine-learning.tsx b/client/src/pages/machine-learning.tsx
index 63150e350..c37c52e38 100644
--- a/client/src/pages/machine-learning.tsx
+++ b/client/src/pages/machine-learning.tsx
@@ -177,6 +177,28 @@ interface FilterDiagnosticsData {
   };
   vtsEvaluation?: any;
   lastCycleVtsEval?: any;
+  // reorg-B2.2 OBJ-B: per-class reward-vs-risk / reachability guard-drop stats, keyed by strategy and
+  // scoped to THIS tab's asset class (crypto tab → crypto_spot, xStock tab → xstock_spot). Absent/empty =
+  // no guard evaluations recorded for this class yet (rendered as a distinct "no evaluations" state).
+  guardDrops?: Record<string, GuardDropRecord>;
+  trackerStartedAt?: string | null;
+}
+
+// reorg-B2.2 OBJ-B: one strategy's shared-guard suppression for a single asset class. Raw counters + the
+// two derived ratios (computed server-side from raw — never re-derived in the UI).
+interface GuardDropRecord {
+  evals: number;        // total guard evaluations (the suppression denominator)
+  passes: number;
+  atrDrops: number;     // dropped by invalid ATR
+  stopDrops: number;    // dropped by stop-distance
+  rrDrops: number;      // dropped by RR < per-class minRR (the #372 suppression signal)
+  reachDrops: number;   // dropped by reachability > per-class reachAtrMax
+  rrEvals: number;      // evals that reached the RR check (meanRR denominator)
+  rrSum: number;
+  rrMin: number;
+  rrMax: number;
+  meanRR: number;
+  rrSuppressionRate: number; // rrDrops / total evals
 }
 
 interface B63DbsSnapshot {
@@ -1945,6 +1967,11 @@ export function FilterDiagnosticsPanel({ data, isLoading }: { data: FilterDiagno
       failed_correlation: 'Correlation',
       already_active: 'Already Active',
       passed_all_filters: 'Passed All',
+      // reorg-B2.2 OBJ-B: the GuardDropReason enum values (no raw enum key leaks to the UI).
+      rr_below_min: 'Reward-vs-Risk',
+      unreachable: 'Unreachable',
+      stop_distance: 'Stop Distance',
+      invalid_atr: 'Invalid ATR',
     };
     return names[key] || key;
   };
@@ -2197,6 +2224,72 @@ export function FilterDiagnosticsPanel({ data, isLoading }: { data: FilterDiagno
         </CardContent>
       </Card>
 
+      {/* reorg-B2.2 OBJ-B: Reward-vs-Risk / Reachability Gate (per strategy, this asset class).
+          The shared post-signal-build guard (RR + reachability + stop-distance + invalid-ATR) lives at
+          signal generation — its drops aren't part of the IMF/scan-phase filter breakdown above. Surfaced
+          here per class (Kyle's no-hidden-gates). Distinct "no evaluations" state ≠ a misleading 0%. */}
+      <Card>
+        <CardHeader className="py-3">
+          <CardTitle className="text-lg flex items-center justify-between">
+            <span>Reward-vs-Risk / Reachability Gate</span>
+            <span className="text-sm font-normal text-muted-foreground">
+              per strategy{data.trackerStartedAt ? ` · since ${new Date(data.trackerStartedAt).toLocaleString()}` : ''}
+            </span>
+          </CardTitle>
+        </CardHeader>
+        <CardContent className="p-0">
+          {(() => {
+            const gd = data.guardDrops;
+            const rows = gd ? Object.entries(gd) : [];
+            if (rows.length === 0) {
+              return (
+                <div className="p-4 text-muted-foreground text-center">
+                  No guard evaluations recorded for this asset class yet — the reward-vs-risk / reachability gate hasn't evaluated a signal here.
+                </div>
+              );
+            }
+            // Most-suppressed first (the #372 calibration read: which strategies the per-class minRR cuts).
+            rows.sort((a, b) => b[1].rrSuppressionRate - a[1].rrSuppressionRate);
+            return (
+              <div className="overflow-x-auto">
+                <table className="w-full text-sm">
+                  <thead>
+                    <tr className="border-b bg-muted/50">
+                      <th className="text-left p-2 font-medium">Strategy</th>
+                      <th className="text-right p-2 font-medium">Evals</th>
+                      <th className="text-right p-2 font-medium">Passed</th>
+                      <th className="text-right p-2 font-medium">{formatFilterName('rr_below_min')}</th>
+                      <th className="text-right p-2 font-medium">{formatFilterName('unreachable')}</th>
+                      <th className="text-right p-2 font-medium">{formatFilterName('stop_distance')}</th>
+                      <th className="text-right p-2 font-medium">{formatFilterName('invalid_atr')}</th>
+                      <th className="text-right p-2 font-medium">Mean RR</th>
+                      <th className="text-right p-2 font-medium">RR Suppression</th>
+                    </tr>
+                  </thead>
+                  <tbody>
+                    {rows.map(([strategy, s]) => (
+                      <tr key={strategy} className="border-b hover:bg-muted/30">
+                        <td className="p-2 font-medium">{strategy}</td>
+                        <td className="p-2 text-right">{fmt(s.evals)}</td>
+                        <td className="p-2 text-right text-green-600">{fmt(s.passes)}</td>
+                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>{fmt(s.rrDrops)}</td>
+                        <td className={`p-2 text-right ${getRejectionColor(s.reachDrops, s.evals)}`}>{fmt(s.reachDrops)}</td>
+                        <td className="p-2 text-right text-muted-foreground">{fmt(s.stopDrops)}</td>
+                        <td className="p-2 text-right text-muted-foreground">{fmt(s.atrDrops)}</td>
+                        <td className="p-2 text-right">{s.rrEvals > 0 ? s.meanRR.toFixed(2) : '—'}</td>
+                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>
+                          {s.evals > 0 ? `${(s.rrSuppressionRate * 100).toFixed(1)}%` : '—'}
+                        </td>
+                      </tr>
+                    ))}
+                  </tbody>
+                </table>
+              </div>
+            );
+          })()}
+        </CardContent>
+      </Card>
+
       {/* TABLE 1: Last Scan Stats */}
       <Card>
         <CardHeader className="py-3">
diff --git a/server/routes.ts b/server/routes.ts
index b2cd734dc..83ba60ef5 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -7864,15 +7864,30 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         familyMismatchDenominatorTotal: (quantStrategyEvalsLt + patternStrategyEvalsLt) + (lt?.nullReasonAggregate?.['family_filter_mismatch'] ?? 0),
       };
 
+      // reorg-B2.2 OBJ-B: per-class reward-vs-risk / reachability guard drops for xstock_spot — the same
+      // shared FilterDiagnosticsPanel renders data.guardDrops, so the xStock tab shows ONLY its class's
+      // suppression (Kyle's no-hidden-gates, per class).
+      let guardDrops: Record<string, unknown> = {};
+      let trackerStartedAt: string | null = null;
+      try {
+        const { getGuardEvalStatsByClass, getGuardEvalStartedAt } = await import('./strategies/guard-eval-tracker.js');
+        guardDrops = getGuardEvalStatsByClass('xstock_spot');
+        trackerStartedAt = getGuardEvalStartedAt();
+      } catch (err) {
+        console.warn('[reorg-B2.2][xstocks-filter-diagnostics] Could not get per-class guard-drop stats:', err);
+      }
+
       res.json({
         ok: true,
         timestamp: new Date().toISOString(),
-        schema: 'xstocks-filter-diagnostics/v2.0',
+        schema: 'xstocks-filter-diagnostics/v2.1',
         // FilterDiagnosticsData-compatible fields
         lastScan,
         rolling24h,
         signalRejections: { total: totalRejected, byReason, byRegime },
         vtsEvaluation,
+        guardDrops,
+        trackerStartedAt,
         // B79.0m.b iteration 2: lastCycleVtsEval is the just-finished cycle's
         // strategy-level funnel (distinct from the 24h `vtsEvaluation` panel).
         lastCycleVtsEval: ec ? {
@@ -8737,13 +8752,14 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
   // In-memory counters; reset on restart. Read this over a VTS window to bring Kyle the suppression numbers.
   apiRouter.get('/diagnostics/guard-eval-stats', authenticateToken, async (_req: AuthenticatedRequest, res) => {
     try {
-      const { getGuardEvalStats, getGuardEvalStartedAt } = await import('./strategies/guard-eval-tracker.js');
+      const { getGuardEvalStats, getGuardEvalStatsPerClass, getGuardEvalStartedAt } = await import('./strategies/guard-eval-tracker.js');
       res.json({
         ok: true,
-        schema: 'guard-eval-stats/v2',
-        description: 'reorg-B2.1/B2.2 per-strategy shared-guard suppression (rrSuppressionRate = rrDrops/evals over TOTAL evals — #372). trackerStartedAt = window start, persisted across restarts (#373 wipe-detection stamp).',
+        schema: 'guard-eval-stats/v3',
+        description: 'reorg-B2.1/B2.2 shared-guard suppression. stats = STRATEGY-LEVEL aggregate (summed across asset classes, ratios re-derived from raw — the #372 read, unchanged shape). statsByClass = reorg-B2.2 per-(assetClass→strategy) breakdown (additive). rrSuppressionRate = rrDrops/evals over TOTAL evals. trackerStartedAt = window start, persisted across restarts (#373 wipe-detection stamp).',
         trackerStartedAt: getGuardEvalStartedAt(),
         stats: getGuardEvalStats(),
+        statsByClass: getGuardEvalStatsPerClass(),
       });
     } catch (error: any) {
       console.error('[reorg-B2.1] Error fetching guard-eval stats:', error);
diff --git a/server/routes/vts.ts b/server/routes/vts.ts
index 07e7d86dd..d6cd137b7 100644
--- a/server/routes/vts.ts
+++ b/server/routes/vts.ts
@@ -1573,6 +1573,19 @@ router.get('/filter-diagnostics', requireAuth, async (_req: Request, res: Respon
     // Batch 52: PairFailureTracker cooldown REMOVED (Kyle directive 2026-04-06)
     // cooldownState no longer included in API response
 
+    // reorg-B2.2 OBJ-B: the per-class reward-vs-risk / reachability guard drops for THIS class (crypto_spot),
+    // so the crypto Filter-Diagnostics tab can show which strategies the per-class minRR/reachability gate
+    // suppresses (Kyle's no-hidden-gates). The shared FilterDiagnosticsPanel renders data.guardDrops.
+    let guardDrops: Record<string, unknown> = {};
+    let trackerStartedAt: string | null = null;
+    try {
+      const { getGuardEvalStatsByClass, getGuardEvalStartedAt } = await import('../strategies/guard-eval-tracker.js');
+      guardDrops = getGuardEvalStatsByClass('crypto_spot');
+      trackerStartedAt = getGuardEvalStartedAt();
+    } catch (err) {
+      console.warn('[reorg-B2.2][API] Could not get per-class guard-drop stats:', err);
+    }
+
     res.json({
       ok: true,
       lastScan,
@@ -1580,7 +1593,9 @@ router.get('/filter-diagnostics', requireAuth, async (_req: Request, res: Respon
       signalRejections,
       vtsEvaluation,
       lastCycleVtsEval,
-      schema: 'filter-diagnostics/v1.4',
+      guardDrops,
+      trackerStartedAt,
+      schema: 'filter-diagnostics/v1.5',
     });
   } catch (error) {
     console.error('[19H][API] Filter diagnostics failed:', error);
diff --git a/server/services/strategy-engine.ts b/server/services/strategy-engine.ts
index 9d2ffcc11..e8335dd5f 100644
--- a/server/services/strategy-engine.ts
+++ b/server/services/strategy-engine.ts
@@ -298,7 +298,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(atr, entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, finalTarget, _effATR, _gate);
-        recordGuardEval('vwap_pullback', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('vwap_pullback', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -432,7 +432,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(abcdAtr, entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('abcd_long', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('abcd_long', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -565,7 +565,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('sma_trend_ride', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('sma_trend_ride', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -676,7 +676,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(atr, entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('breakout', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('breakout', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -776,7 +776,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(atr, entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('mean_reversion', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('mean_reversion', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -884,7 +884,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(atr, entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('range_trade', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('range_trade', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -986,7 +986,7 @@ export class StrategyEngine {
         const _gate = getPerClassTargetGate(assetClass);
         const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
         const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-        recordGuardEval('vwap_bounce', _gr.rr, _gr.pass, _gr.dropReason);
+        recordGuardEval('vwap_bounce', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
         if (!_gr.pass) { setNullReason('guard_fail'); return null; }
       }
 
@@ -1607,7 +1607,7 @@ export class StrategyEngine {
       const _gate = getPerClassTargetGate(assetClass);
       const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
       const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-      recordGuardEval('dhma', _gr.rr, _gr.pass, _gr.dropReason);
+      recordGuardEval('dhma', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
       if (!_gr.pass) { setNullReason('guard_fail'); return null; }
     }
 
diff --git a/server/strategies/adaptive-flow.ts b/server/strategies/adaptive-flow.ts
index 06c8f32d5..fbadcfac7 100644
--- a/server/strategies/adaptive-flow.ts
+++ b/server/strategies/adaptive-flow.ts
@@ -177,7 +177,7 @@ export function detectAdaptiveFlow(
   // ── Global guards ──────────────────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('adaptive_flow', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('adaptive_flow', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards rejected signal`);
     setNullReason('guard_fail');
diff --git a/server/strategies/defensive-hedge.ts b/server/strategies/defensive-hedge.ts
index 1d032e3ad..06b36d9c3 100644
--- a/server/strategies/defensive-hedge.ts
+++ b/server/strategies/defensive-hedge.ts
@@ -238,7 +238,7 @@ export function detectDefensiveHedge(
   // ── Global guards ──────────────────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('defensive_hedge', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('defensive_hedge', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards rejected signal`);
     setNullReason('guard_fail');
diff --git a/server/strategies/guard-eval-tracker.ts b/server/strategies/guard-eval-tracker.ts
index 8cb158445..f4337ed77 100644
--- a/server/strategies/guard-eval-tracker.ts
+++ b/server/strategies/guard-eval-tracker.ts
@@ -15,6 +15,7 @@
 import fs from 'fs';
 import path from 'path';
 import type { GuardDropReason } from './strategy-helpers.js'; // the guard owns the reason taxonomy (type-only, no runtime coupling)
+import type { AssetClass } from '@shared/asset-classes'; // reorg-B2.2 OBJ-B: per-class composite key (type-only)
 
 export interface GuardEvalRecord {
   evals: number;        // total guard evaluations (the denominator for rrSuppressionRate)
@@ -29,12 +30,44 @@ export interface GuardEvalRecord {
   rrMax: number;
 }
 
+// reorg-B2.2 OBJ-B: keyed by the COMPOSITE `${strategy}::${assetClass}` (was strategy-only in reorg-B2.1).
+// The per-class split is what lets the two VTS Filter-Diagnostics tabs (crypto / xStock) each show ONLY
+// their class's reward-vs-risk / reachability drops (Kyle's no-hidden-gates, per class). The strategy-level
+// #372 aggregate is preserved by SUMMING across classes on read (getGuardEvalStats) — never lost.
 const _stats = new Map<string, GuardEvalRecord>();
 
 function _blank(): GuardEvalRecord {
   return { evals: 0, passes: 0, atrDrops: 0, stopDrops: 0, rrDrops: 0, reachDrops: 0, rrEvals: 0, rrSum: 0, rrMin: Infinity, rrMax: -Infinity };
 }
 
+// Composite-key helpers. `::` separates strategy from assetClass; strategy keys are simple snake_case and
+// asset-class values are crypto_spot / xstock_spot, so a lastIndexOf split is unambiguous and future-safe.
+function _key(strategy: string, assetClass: string): string { return `${strategy}::${assetClass}`; }
+function _parseKey(key: string): { strategy: string; assetClass: string } {
+  const i = key.lastIndexOf('::');
+  return i < 0 ? { strategy: key, assetClass: 'unknown' } : { strategy: key.slice(0, i), assetClass: key.slice(i + 2) };
+}
+
+/** A read-snapshot record: the raw counters plus the two derived ratios. */
+type DerivedRecord = GuardEvalRecord & { meanRR: number; rrSuppressionRate: number };
+
+/** Derive the two ratios from RAW fields — the ONE place the #372 numbers are computed, so any caller
+ *  (aggregate, per-class, per-(strategy,assetClass)) is byte-consistent. meanRR over rrEvals (RR-reached
+ *  only — unskewed); rrSuppressionRate over TOTAL evals (Langston: "how much does minRR suppress total
+ *  output", denominator = all generated signals). NEVER average pre-derived ratios (FLAG-2). */
+function _derive(r: GuardEvalRecord): DerivedRecord {
+  return { ...r, meanRR: r.rrEvals > 0 ? r.rrSum / r.rrEvals : 0, rrSuppressionRate: r.evals > 0 ? r.rrDrops / r.evals : 0 };
+}
+
+/** Sum the RAW counters of `from` into `into` (min/max via Math.min/max). Used to fold per-class buckets
+ *  back to the strategy-level #372 aggregate WITHOUT ever touching a derived ratio (FLAG-2). */
+function _accumulate(into: GuardEvalRecord, from: GuardEvalRecord): void {
+  into.evals += from.evals; into.passes += from.passes; into.atrDrops += from.atrDrops;
+  into.stopDrops += from.stopDrops; into.rrDrops += from.rrDrops; into.reachDrops += from.reachDrops;
+  into.rrEvals += from.rrEvals; into.rrSum += from.rrSum;
+  into.rrMin = Math.min(into.rrMin, from.rrMin); into.rrMax = Math.max(into.rrMax, from.rrMax);
+}
+
 // ── reorg-B2.2 OBJ-A: PERSISTENCE ──────────────────────────────────────────────────────────────────
 // The tracker must SURVIVE restarts (Kyle 2026-06-21: a restart should PAUSE+RESUME the suppression
 // window, not reset it) and be crash/OOM/reboot-proof (Langston's robustness flag). Checkpoint to a JSON
@@ -45,9 +78,24 @@ function _blank(): GuardEvalRecord {
 const _CKPT_PATH = path.join(process.cwd(), 'logs', 'guard-eval-checkpoint.json');
 let _startedAt: string | null = null;
 
+// reorg-B2.2 OBJ-B (FLAG-1): the checkpoint carries the KEY SCHEMA it was written under. When the key
+// format changes (here: strategy-only → `strategy::assetClass`), an old checkpoint's buckets have the WRONG
+// cardinality — loading them would create orphan/phantom buckets that silently corrupt the #372 aggregate
+// (the exact failure #373 guards). So reload DISCARDS-and-loud-logs on ANY mismatch, INCLUDING an
+// unversioned legacy checkpoint (reorg-B2.1/OBJ-A wrote no keySchema field) — "no field" is treated as a
+// mismatch, never as "matches because there's nothing to compare". Bump this string on any future key change.
+const _KEY_SCHEMA = 'strategy::assetClass/v1';
+
 (function _reloadCheckpoint(): void {
   try {
     const d = JSON.parse(fs.readFileSync(_CKPT_PATH, 'utf-8'));
+    // FLAG-1 key-schema guard — discard-and-loud-log on mismatch (incl. unversioned legacy = mismatch).
+    // We do NOT restore _startedAt either: a stale-cardinality checkpoint can't seed an honest window start,
+    // so this is a clean fresh window (harmless at the A+B bundle deploy — no in-flight window state to lose).
+    if (!d || d.keySchema !== _KEY_SCHEMA) {
+      console.error(`[guard-eval-tracker] checkpoint keySchema mismatch (got ${d?.keySchema ?? 'UNVERSIONED'}, expected ${_KEY_SCHEMA}) — DISCARDING stale-cardinality checkpoint; starting a fresh window.`);
+      return;
+    }
     if (d && typeof d.startedAt === 'string') _startedAt = d.startedAt;
     if (d && d.stats && typeof d.stats === 'object') {
       for (const [k, v] of Object.entries(d.stats as Record<string, GuardEvalRecord>)) {
@@ -77,7 +125,7 @@ function _writeCheckpoint(): void {
     // torn partial from a reboot/OOM mid-write (which would throw in JSON.parse and silently wipe the window
     // — the literal reboot-proof scenario this checkpoint claims to protect). Same dir = same fs = atomic.
     const tmp = _CKPT_PATH + '.tmp';
-    fs.writeFileSync(tmp, JSON.stringify({ startedAt: _startedAt, savedAt: new Date().toISOString(), stats: Object.fromEntries(_stats) }));
+    fs.writeFileSync(tmp, JSON.stringify({ keySchema: _KEY_SCHEMA, startedAt: _startedAt, savedAt: new Date().toISOString(), stats: Object.fromEntries(_stats) }));
     fs.renameSync(tmp, _CKPT_PATH);
   } catch { /* best-effort: a missed checkpoint loses < one cadence of evals; the RATE is unaffected */ }
 }
@@ -92,10 +140,11 @@ export function getGuardEvalStartedAt(): string | null { return _startedAt; }
 
 /** Record one guard evaluation for a strategy. `rr` is the computed reward-to-risk (for the suppression
  *  distribution); `pass` + `dropReason` capture the verdict. Cheap O(1), no I/O. */
-export function recordGuardEval(strategy: string, rr: number, pass: boolean, dropReason: GuardDropReason): void {
+export function recordGuardEval(strategy: string, rr: number, pass: boolean, dropReason: GuardDropReason, assetClass: AssetClass): void {
   if (_startedAt === null) _startedAt = new Date().toISOString(); // window start (restored across restarts)
-  let r = _stats.get(strategy);
-  if (!r) { r = _blank(); _stats.set(strategy, r); }
+  const key = _key(strategy, assetClass); // reorg-B2.2 OBJ-B: per-class composite bucket
+  let r = _stats.get(key);
+  if (!r) { r = _blank(); _stats.set(key, r); }
   r.evals++;
   // RR distribution is meaningful ONLY for evals that REACHED the RR check — the atr-null + stop-distance
   // guards short-circuit BEFORE it (their `rr` never gates anything), so including their rr would skew
@@ -114,13 +163,46 @@ export function recordGuardEval(strategy: string, rr: number, pass: boolean, dro
   else if (dropReason === 'unreachable') r.reachDrops++;
 }
 
-/** Snapshot the per-strategy stats (for the diagnostics surface that feeds the #372 calibration). */
-export function getGuardEvalStats(): Record<string, GuardEvalRecord & { meanRR: number; rrSuppressionRate: number }> {
-  const out: Record<string, GuardEvalRecord & { meanRR: number; rrSuppressionRate: number }> = {};
+/** Snapshot the STRATEGY-LEVEL aggregate (the #372 calibration surface) — SUMS the per-class buckets back
+ *  to one record per strategy and re-derives the ratios from the summed raw fields (FLAG-2). With the
+ *  reorg-B2.2 re-key this is byte-identical to the pre-re-key per-strategy read (one class → sum is a no-op;
+ *  two classes → the honest combined suppression). The shape is unchanged, so the existing #372 consumer is
+ *  untouched. */
+export function getGuardEvalStats(): Record<string, DerivedRecord> {
+  const agg = new Map<string, GuardEvalRecord>();
+  for (const [k, r] of _stats.entries()) {
+    const { strategy } = _parseKey(k);
+    let a = agg.get(strategy);
+    if (!a) { a = _blank(); agg.set(strategy, a); }
+    _accumulate(a, r);
+  }
+  const out: Record<string, DerivedRecord> = {};
+  for (const [strategy, a] of agg.entries()) out[strategy] = _derive(a);
+  return out;
+}
+
+/** reorg-B2.2 OBJ-B: the per-strategy stats for ONE asset class (feeds that class's VTS Filter-Diagnostics
+ *  tab — the crypto tab passes `crypto_spot`, the xStock tab `xstock_spot`). Returns ONLY strategies that
+ *  recorded ≥1 guard eval on this class (an absent strategy = "no evaluations", rendered distinctly — never
+ *  a misleading 0% — FLAG-3). */
+export function getGuardEvalStatsByClass(assetClass: string): Record<string, DerivedRecord> {
+  const out: Record<string, DerivedRecord> = {};
+  for (const [k, r] of _stats.entries()) {
+    const p = _parseKey(k);
+    if (p.assetClass !== assetClass) continue;
+    out[p.strategy] = _derive(r);
+  }
+  return out;
+}
+
+/** reorg-B2.2 OBJ-B: the full per-(assetClass → strategy) breakdown — the additive v2 field on the raw
+ *  `/api/diagnostics/guard-eval-stats` endpoint (backward-compatible; the strategy-level `stats` aggregate
+ *  above is unchanged). */
+export function getGuardEvalStatsPerClass(): Record<string, Record<string, DerivedRecord>> {
+  const out: Record<string, Record<string, DerivedRecord>> = {};
   for (const [k, r] of _stats.entries()) {
-    // meanRR over rrEvals (RR-reached only — unskewed); rrSuppressionRate over TOTAL evals (Langston: the
-    // right framing for "how much does minRR suppress total output", denominator = all generated signals).
-    out[k] = { ...r, meanRR: r.rrEvals > 0 ? r.rrSum / r.rrEvals : 0, rrSuppressionRate: r.evals > 0 ? r.rrDrops / r.evals : 0 };
+    const { strategy, assetClass } = _parseKey(k);
+    (out[assetClass] ??= {})[strategy] = _derive(r);
   }
   return out;
 }
diff --git a/server/strategies/inside-bar-reversal.ts b/server/strategies/inside-bar-reversal.ts
index d79c87608..b649c2eaf 100644
--- a/server/strategies/inside-bar-reversal.ts
+++ b/server/strategies/inside-bar-reversal.ts
@@ -190,7 +190,7 @@ export function detectInsideBarReversal(
   // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('inside_bar_reversal', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('inside_bar_reversal', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards failed for ${direction}. Skipping.`);
     setNullReason('guard_fail');
diff --git a/server/strategies/morning-star.ts b/server/strategies/morning-star.ts
index b35b602b0..4ed05a09e 100644
--- a/server/strategies/morning-star.ts
+++ b/server/strategies/morning-star.ts
@@ -175,7 +175,7 @@ export function detectMorningStar(
   // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
     setNullReason('guard_fail');
diff --git a/server/strategies/orb.ts b/server/strategies/orb.ts
index ec761681f..881dc2db7 100644
--- a/server/strategies/orb.ts
+++ b/server/strategies/orb.ts
@@ -296,7 +296,7 @@ export function detectORB(
     const _gate = getPerClassTargetGate(assetClass);
     const _effATR = clampEffectiveATR(atr, entryPrice);
     const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-    recordGuardEval('orb', _gr.rr, _gr.pass, _gr.dropReason);
+    recordGuardEval('orb', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
     if (!_gr.pass) { setNullReason('guard_fail'); return null; }
   }
 
diff --git a/server/strategies/pivot-shift.ts b/server/strategies/pivot-shift.ts
index f311bf895..3cd6fe5d7 100644
--- a/server/strategies/pivot-shift.ts
+++ b/server/strategies/pivot-shift.ts
@@ -182,7 +182,7 @@ export function detectPivotShift(
   // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('pivot_shift', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('pivot_shift', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
     setNullReason('guard_fail');
diff --git a/server/strategies/reverse-impulse.ts b/server/strategies/reverse-impulse.ts
index 726863e76..0e54f8e7b 100644
--- a/server/strategies/reverse-impulse.ts
+++ b/server/strategies/reverse-impulse.ts
@@ -176,7 +176,7 @@ export function detectReverseImpulse(
   // ── Global guards ──────────────────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('reverse_impulse', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('reverse_impulse', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards rejected signal`);
     setNullReason('guard_fail');
diff --git a/server/strategies/strong-bull-trend.ts b/server/strategies/strong-bull-trend.ts
index f9dcb6d71..b8a06dd0b 100644
--- a/server/strategies/strong-bull-trend.ts
+++ b/server/strategies/strong-bull-trend.ts
@@ -174,7 +174,7 @@ export function detectStrongBullTrend(
     const _gate = getPerClassTargetGate(assetClass);
     const _effATR = clampEffectiveATR(atr, entryPrice);
     const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
-    recordGuardEval(STRATEGY_KEY, _gr.rr, _gr.pass, _gr.dropReason);
+    recordGuardEval(STRATEGY_KEY, _gr.rr, _gr.pass, _gr.dropReason, assetClass);
     if (!_gr.pass) { setNullReason('guard_fail'); return null; }
   }
 
diff --git a/server/strategies/support-bounce.ts b/server/strategies/support-bounce.ts
index 0bca13fc3..550b9d1fb 100644
--- a/server/strategies/support-bounce.ts
+++ b/server/strategies/support-bounce.ts
@@ -264,7 +264,7 @@ export function detectSupportBounce(
   // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('support_bounce', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('support_bounce', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
     setNullReason('guard_fail');
diff --git a/server/strategies/volatility-edge.ts b/server/strategies/volatility-edge.ts
index 52d92e5e6..7a80d164e 100644
--- a/server/strategies/volatility-edge.ts
+++ b/server/strategies/volatility-edge.ts
@@ -189,7 +189,7 @@ export function detectVolatilityEdge(
   // ── Global guards ──────────────────────────────────────────
   const gate = getPerClassTargetGate(assetClass);
   const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
-  recordGuardEval('volatility_edge', _gr.rr, _gr.pass, _gr.dropReason);
+  recordGuardEval('volatility_edge', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
   if (!_gr.pass) {
     console.log(`${LOG_PREFIX} Global guards rejected signal`);
     setNullReason('guard_fail');

```

## NEW TEST — server/tests/unit/reorg-b2-2-guard-eval-rekey.test.ts

```ts
/**
 * reorg-B2.2 OBJ-B — guard-eval-tracker per-(strategy, assetClass) re-key.
 *
 * Verifies: (1) the strategy-level #372 aggregate is preserved by SUMMING raw fields across classes and
 * RE-DERIVING the ratios (FLAG-2 — never averaging per-class ratios); (2) getGuardEvalStatsByClass splits
 * by class; (3) getGuardEvalStatsPerClass returns the full nested breakdown; (4) the checkpoint keySchema
 * guard DISCARDS an unversioned legacy (strategy-only) checkpoint on reload (FLAG-1) but reloads a matching
 * one. fs is mocked so the checkpoint path is fully controlled and never touches disk.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Controls what the checkpoint file "contains" at module load. null => ENOENT (fresh window).
const h = vi.hoisted(() => ({ fileContent: null as string | null }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const stub = {
    ...actual,
    readFileSync: (..._args: any[]) => {
      if (h.fileContent === null) { const e: any = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return h.fileContent;
    },
    writeFileSync: () => {},
    mkdirSync: () => {},
    renameSync: () => {},
    unlinkSync: () => {},
  };
  return { ...stub, default: { ...(actual as any).default, ...stub } };
});

const CRYPTO = 'crypto_spot' as any;
const XSTOCK = 'xstock_spot' as any;

describe('reorg-B2.2 OBJ-B — guard-eval-tracker per-class re-key', () => {
  beforeEach(() => {
    h.fileContent = null;
    vi.resetModules();
  });

  it('aggregates per-strategy across classes, re-deriving ratios from summed raw (FLAG-2)', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    // crypto_spot: 2 passes @ rr 3.0, 1 rr_below_min @ rr 1.0
    t.recordGuardEval('morning_star', 3.0, true, null, CRYPTO);
    t.recordGuardEval('morning_star', 3.0, true, null, CRYPTO);
    t.recordGuardEval('morning_star', 1.0, false, 'rr_below_min', CRYPTO);
    // xstock_spot: 1 rr_below_min @ rr 2.0
    t.recordGuardEval('morning_star', 2.0, false, 'rr_below_min', XSTOCK);

    const agg = t.getGuardEvalStats();
    expect(Object.keys(agg)).toEqual(['morning_star']); // one row per strategy, classes folded
    const m = agg.morning_star;
    expect(m.evals).toBe(4);
    expect(m.passes).toBe(2);
    expect(m.rrDrops).toBe(2);
    expect(m.rrEvals).toBe(4);
    expect(m.rrSum).toBeCloseTo(9.0); // 3+3+1+2
    expect(m.meanRR).toBeCloseTo(9.0 / 4); // re-derived from summed raw
    expect(m.rrSuppressionRate).toBeCloseTo(2 / 4);
    expect(m.rrMin).toBeCloseTo(1.0);
    expect(m.rrMax).toBeCloseTo(3.0);
  });

  it('FLAG-2: summed-raw re-derivation, NOT an average of per-class ratios', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    // crypto: 100 evals, 50 rr_below_min → 50% suppression
    for (let i = 0; i < 50; i++) t.recordGuardEval('s', 4.0, true, null, CRYPTO);
    for (let i = 0; i < 50; i++) t.recordGuardEval('s', 1.0, false, 'rr_below_min', CRYPTO);
    // xstock: 2 evals, 2 rr_below_min → 100% suppression
    t.recordGuardEval('s', 1.0, false, 'rr_below_min', XSTOCK);
    t.recordGuardEval('s', 1.0, false, 'rr_below_min', XSTOCK);

    const agg = t.getGuardEvalStats();
    // Correct (raw): 52 drops / 102 evals ≈ 0.5098. Averaging the ratios would wrongly give (0.5+1.0)/2 = 0.75.
    expect(agg.s.rrSuppressionRate).toBeCloseTo(52 / 102, 5);
    expect(agg.s.rrSuppressionRate).not.toBeCloseTo(0.75, 2);
  });

  it('splits stats by asset class (getGuardEvalStatsByClass + getGuardEvalStatsPerClass)', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    t.recordGuardEval('orb', 3.0, true, null, CRYPTO);
    t.recordGuardEval('orb', 1.0, false, 'rr_below_min', XSTOCK);

    const crypto = t.getGuardEvalStatsByClass('crypto_spot');
    const xstock = t.getGuardEvalStatsByClass('xstock_spot');
    expect(Object.keys(crypto)).toEqual(['orb']);
    expect(crypto.orb.passes).toBe(1);
    expect(crypto.orb.rrDrops).toBe(0);
    expect(xstock.orb.passes).toBe(0);
    expect(xstock.orb.rrDrops).toBe(1);

    const per = t.getGuardEvalStatsPerClass();
    expect(per.crypto_spot.orb.passes).toBe(1);
    expect(per.xstock_spot.orb.rrDrops).toBe(1);
  });

  it('FLAG-3 support: a class with no evaluations yields an empty map (UI renders "no evaluations")', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    t.recordGuardEval('orb', 3.0, true, null, CRYPTO);
    expect(t.getGuardEvalStatsByClass('xstock_spot')).toEqual({});
  });

  it('FLAG-1: an unversioned legacy checkpoint is DISCARDED on reload, not loaded as orphan buckets', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Legacy reorg-B2.1/OBJ-A format: strategy-only keys, NO keySchema field.
    h.fileContent = JSON.stringify({
      startedAt: '2026-06-20T00:00:00.000Z',
      stats: { morning_star: { evals: 99, passes: 0, atrDrops: 0, stopDrops: 0, rrDrops: 99, reachDrops: 0, rrEvals: 99, rrSum: 99, rrMin: 1, rrMax: 1 } },
    });
    vi.resetModules();
    const t = await import('../../strategies/guard-eval-tracker.js');
    expect(Object.keys(t.getGuardEvalStats())).toHaveLength(0); // discarded — no phantom buckets
    expect(t.getGuardEvalStartedAt()).toBeNull();                // fresh window, not the stale stamp
    expect(errSpy).toHaveBeenCalled();                           // loud-logged
    errSpy.mockRestore();
  });

  it('a checkpoint with the matching keySchema reloads its composite buckets', async () => {
    h.fileContent = JSON.stringify({
      keySchema: 'strategy::assetClass/v1',
      startedAt: '2026-06-20T00:00:00.000Z',
      stats: { 'orb::crypto_spot': { evals: 5, passes: 5, atrDrops: 0, stopDrops: 0, rrDrops: 0, reachDrops: 0, rrEvals: 5, rrSum: 20, rrMin: 4, rrMax: 4 } },
    });
    vi.resetModules();
    const t = await import('../../strategies/guard-eval-tracker.js');
    const crypto = t.getGuardEvalStatsByClass('crypto_spot');
    expect(crypto.orb.evals).toBe(5);
    expect(crypto.orb.meanRR).toBeCloseTo(4.0);
    expect(t.getGuardEvalStartedAt()).toBe('2026-06-20T00:00:00.000Z');
  });
});

```
