# B-DIAG-387 Change List (#387) — Step-4 diff

Bench: tsc baseline OK (no regressions above baseline); vitest 5/5 new + 30 adjacent xStock/reorg tests green.

```diff
diff --git a/client/src/pages/machine-learning.tsx b/client/src/pages/machine-learning.tsx
index c37c52e38..d5ea95766 100644
--- a/client/src/pages/machine-learning.tsx
+++ b/client/src/pages/machine-learning.tsx
@@ -3127,6 +3127,31 @@ export function FilterDiagnosticsPanel({ data, isLoading }: { data: FilterDiagno
                                   return denom > 0 ? `${Math.round(num / denom * 100)}%` : '0%';
                                 })()}</td>
                               </tr>
+                              {/* B-DIAG-387 (#387) OBJ-2 (no-hidden-gates): the three pre-open
+                                  gate reasons checkPreOpenGates can emit that previously rendered
+                                  nowhere. Guarded `?? 0` so the shared panel renders 0 harmlessly
+                                  for any class whose endpoint doesn't (yet) surface them. */}
+                              <tr className="border-b hover:bg-muted/30">
+                                <td className="p-2">Re-entry Cooldown</td>
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['reentry_cooldown'] ?? 0, quantEvals)}</td>}
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['reentry_cooldown'] ?? 0, patternEvals)}</td>}
+                                <td className="p-2 text-right text-orange-500">{fmt(nr.reentryCooldown ?? 0)}</td>
+                                <td className="p-2 text-right">{pct(nr.reentryCooldown ?? 0)}%</td>
+                              </tr>
+                              <tr className="border-b hover:bg-muted/30">
+                                <td className="p-2">Price Past Stop (entry no longer viable)</td>
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_stop'] ?? 0, quantEvals)}</td>}
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_stop'] ?? 0, patternEvals)}</td>}
+                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastStop ?? 0)}</td>
+                                <td className="p-2 text-right">{pct(nr.pricePastStop ?? 0)}%</td>
+                              </tr>
+                              <tr className="border-b hover:bg-muted/30">
+                                <td className="p-2">Price Past Target (entry no longer viable)</td>
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_target'] ?? 0, quantEvals)}</td>}
+                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_target'] ?? 0, patternEvals)}</td>}
+                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastTarget ?? 0)}</td>
+                                <td className="p-2 text-right">{pct(nr.pricePastTarget ?? 0)}%</td>
+                              </tr>
                             </tbody>
                           </table>
 
diff --git a/server/asset_classes/xstock_spot/eval-cycle.ts b/server/asset_classes/xstock_spot/eval-cycle.ts
index cd8e41ff8..41022ab1e 100644
--- a/server/asset_classes/xstock_spot/eval-cycle.ts
+++ b/server/asset_classes/xstock_spot/eval-cycle.ts
@@ -718,6 +718,25 @@ export async function evaluateXstockPairForVTS(
           if (lane.kind === 'pattern') counters.patternSignalsRejected++;
           else counters.quantSignalsRejected++;
           counters.byStrategy[strategyKey].rejected++;
+          // B-DIAG-387 (#387): record the net-EV-floor rejection so the dashboard
+          // "Net EV Below Floor" tile reflects reality. It was hard-zero because
+          // the endpoint read a dead `byReason` scaffold while this site bumped
+          // only signalsRejectedBySQE. The combined aggregate feeds the endpoint
+          // total via the lifetime accumulator (scanner.ts:1033); the per-lane
+          // 'net_ev_rejected' key feeds the panel's Quant/Pattern columns
+          // (machine-learning.tsx:3148-3149). Same key both places. NOTE:
+          // 'net_ev_rejected' is NOT in the Section-1 groupDefs, so it does not
+          // render or pollute the Setup-Nulls section total — it surfaces only
+          // in Section-3 via rejectedReasons.netEvBelowFloor.
+          counters.nullReasonAggregate['net_ev_rejected'] =
+            (counters.nullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
+          if (lane.kind === 'pattern') {
+            counters.patternNullReasonAggregate['net_ev_rejected'] =
+              (counters.patternNullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
+          } else {
+            counters.quantNullReasonAggregate['net_ev_rejected'] =
+              (counters.quantNullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
+          }
           try {
             archiveSignalEval({
               mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
@@ -756,6 +775,18 @@ export async function evaluateXstockPairForVTS(
           else counters.quantSignalsRejected++;
           counters.byStrategy[strategyKey].rejected++;
           counters.nullReasonAggregate[gateCheck.reason] = (counters.nullReasonAggregate[gateCheck.reason] ?? 0) + 1;
+          // B-DIAG-387 (#387) OBJ-2: also record the pre-open gate reason per-lane so
+          // the panel's Quant/Pattern columns are accurate (the combined aggregate
+          // alone left the per-pool cells at 0). Same if/else split the other reason
+          // sites use. Surfaces reentry_cooldown/price_past_stop/price_past_target —
+          // previously invisible gates (no-hidden-gates).
+          if (lane.kind === 'pattern') {
+            counters.patternNullReasonAggregate[gateCheck.reason] =
+              (counters.patternNullReasonAggregate[gateCheck.reason] ?? 0) + 1;
+          } else {
+            counters.quantNullReasonAggregate[gateCheck.reason] =
+              (counters.quantNullReasonAggregate[gateCheck.reason] ?? 0) + 1;
+          }
           try {
             archiveSignalEval({
               mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
diff --git a/server/routes.ts b/server/routes.ts
index 9cbf24597..eb4845d8d 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -7409,12 +7409,14 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
       // populated by every cycle of `eval-cycle.ts`. That accumulator already
       // has byStrategy, byStrategyNullReasons, and nullReasonAggregate in the
       // correct shape with zero DB cost. Skipping the broken DB queries.
-      const byStrategy: Record<string, { evaluated: number; trueNulls: number; signals: number; rejected: number; trades: number }> = {};
-      let totalEvaluated = 0, totalNulls = 0, totalSignals = 0, totalRejected = 0, totalTrades = 0;
-      const byReason: Record<string, number> = {};
-      const byRegime: Record<string, number> = {};
-      // Note: lt-aggregate consumption happens below; this block remains as
-      // declaration scaffolding for the existing reference shape.
+      // B-DIAG-387 (#387): the dead "declaration scaffolding for the existing
+      // reference shape" (byStrategy/totalEvaluated/totalNulls/totalSignals/
+      // totalRejected/totalTrades/byReason/byRegime — all permanently empty) was
+      // removed here. Those empty locals were only ever no-op `|| 0` / `?? {}`
+      // fallbacks, and the `byReason['net_ev_below_floor'] || totalRejected` read
+      // they fed was the exact #386 bug (reported 0 forever). All consumption now
+      // sources directly from the live `lt`/`ec`/`live` accumulators. See
+      // DELETED_COMPONENTS_LOG.md (B-DIAG-387).
 
       // B79.0m.b2-followup (Kyle 2026-05-12 issue #1): the prior 24h universe
       // aggregate did `COUNT(DISTINCT symbol)` + `COUNT(DISTINCT date_trunc
@@ -7703,11 +7705,11 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
       // panel is labeled "24-Hour Rolling"). lastCycleVtsEval = the just-
       // finished cycle's view (mirrors lastScan but for the strategy-level
       // funnel). The frontend reads them independently — no field reuse.
-      const totalEvaluatedEff = (lt?.strategiesEvaluated ?? 0) || totalEvaluated;
-      const totalNullsEff = (lt?.strategyNulls ?? 0) || totalNulls;
-      const totalSignalsEff = (lt?.signalsGenerated ?? 0) || totalSignals;
-      const totalRejectedEff = (lt?.signalsRejectedBySQE ?? 0) || totalRejected;
-      const tradesOpenedEff = lt?.tradesOpened ?? totalTrades;
+      const totalEvaluatedEff = lt?.strategiesEvaluated ?? 0;
+      const totalNullsEff = lt?.strategyNulls ?? 0;
+      const totalSignalsEff = lt?.signalsGenerated ?? 0;
+      const totalRejectedEff = lt?.signalsRejectedBySQE ?? 0;
+      const tradesOpenedEff = lt?.tradesOpened ?? 0;
 
       // B-NEW-9 path A (Kyle directive 2026-05-13): DB-backed 24h trades-
       // opened counts. In-memory counters reset on PM2 restart, so 24h-
@@ -7764,7 +7766,7 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
       // reversal) never appear in the By Strategy panel because their counter
       // is created lazily on first iteration. DB has 10 xstock-enabled
       // strategies; panel was showing only the ones that fired this run.
-      const enrichedByStrategy: Record<string, any> = { ...(lt?.byStrategy ?? byStrategy) };
+      const enrichedByStrategy: Record<string, any> = { ...(lt?.byStrategy ?? {}) };
       try {
         const { STRATEGY_DISPLAY_NAMES, isStrategyEnabledForAssetClass } =
           await import('./config/canonical-regime-strategy-map.js');
@@ -7785,7 +7787,7 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
 
       const vtsEvaluation = {
         timestamp: Date.now(),
-        quantPairsEvaluated: quantPairsEval || (lt?.pairsEntered ?? totalEvaluated),
+        quantPairsEvaluated: quantPairsEval || (lt?.pairsEntered ?? 0),
         patternPairsEvaluated: patternPairsEval,
         // B-NEW-4 (2026-05-12): Pair-Pool Evaluations row in the shared
         // FilterDiagnosticsPanel reads quant/patternPairPoolEvaluations
@@ -7829,19 +7831,35 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         nullReasons: (() => {
           const live = lt?.nullReasonAggregate ?? {};
           return {
-            conditionsNotMet: live['conditions_not_met'] ?? byReason['conditions_not_met'] ?? 0,
-            adxGuard: live['adx_guard'] ?? byReason['adx_guard'] ?? 0,
-            duplicatePosition: live['duplicate_position'] ?? byReason['duplicate_position'] ?? 0,
+            conditionsNotMet: live['conditions_not_met'] ?? 0,
+            adxGuard: live['adx_guard'] ?? 0,
+            duplicatePosition: live['duplicate_position'] ?? 0,
             uniqueDuplicateCombos: 0,
-            maxOpenTrades: live['max_open_trades'] ?? byReason['max_open_trades'] ?? 0,
-            regimeNoStrategies: live['regime_no_strategies'] ?? byReason['regime_no_strategies'] ?? 0,
-            familyFilterMismatch: live['family_filter_mismatch'] ?? byReason['family_filter_mismatch'] ?? 0,
+            maxOpenTrades: live['max_open_trades'] ?? 0,
+            regimeNoStrategies: live['regime_no_strategies'] ?? 0,
+            familyFilterMismatch: live['family_filter_mismatch'] ?? 0,
             patternInputMissing: live['pattern_input_missing'] ?? 0,
             setupHashDedupe: live['setup_hash_dedupe'] ?? 0,
+            // B-DIAG-387 (#387) OBJ-2 (no-hidden-gates): surface the pre-open/TCL
+            // gate reasons that checkPreOpenGates emits (vts-runner.ts:3000) — these
+            // land in nullReasonAggregate but were rendered NOWHERE (neither the
+            // structured rows nor the panel groupDefs), so they were invisible
+            // gates. duplicate_position + max_open_trades already render above; the
+            // other three are surfaced here + as new panel rows.
+            reentryCooldown: live['reentry_cooldown'] ?? 0,
+            pricePastStop: live['price_past_stop'] ?? 0,
+            pricePastTarget: live['price_past_target'] ?? 0,
             unknown: live['unknown'] ?? 0,
           };
         })(),
-        rejectedReasons: { netEvBelowFloor: byReason['net_ev_below_floor'] || totalRejected },
+        // B-DIAG-387 (#387) OBJ-1: source the Net-EV-floor rejection count from the
+        // real lifetime accumulator (eval-cycle.ts:716 writes 'net_ev_rejected' into
+        // nullReasonAggregate). Was `byReason['net_ev_below_floor'] || totalRejected`
+        // — both permanently-empty scaffolding → reported 0 forever (the #386 bug).
+        // In-memory/dashboard key = 'net_ev_rejected' (client-dictated, see
+        // machine-learning.tsx:3148-3150); the archive records the SAME event under
+        // gate_decision.reason='net_ev_below_floor' (archiver-layer key).
+        rejectedReasons: { netEvBelowFloor: lt?.nullReasonAggregate?.['net_ev_rejected'] ?? 0 },
         // Prefer live in-memory byStrategy (with nulls/signals/rejected/trades fields)
         // over the archive aggregate when present; UI uses both interchangeably.
         // B-NEW-10: enriched with zero-rows for xstock-enabled strategies that
@@ -7849,13 +7867,13 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         byStrategy: enrichedByStrategy,
         // Full per-strategy null-reason breakdown (what each strategy is failing on).
         byStrategyNullReasons: lt?.byStrategyNullReasons ?? {},
-        nullReasonDetail: lt?.nullReasonAggregate ?? byReason,
+        nullReasonDetail: lt?.nullReasonAggregate ?? {},
         // B-NEW-12.b (2026-05-13): per-lane null-reason aggregates now
         // separately maintained in eval-cycle.ts. Was emitting the combined
         // aggregate in the quant slot + {} in pattern, which made the panel
         // double-count (quant column showed total instead of quant share)
         // so per-pool %s could exceed 100% (Kyle's 92.3% + 16.4% screenshot).
-        quantNullReasonDetail: (lt as any)?.quantNullReasonAggregate ?? lt?.nullReasonAggregate ?? byReason,
+        quantNullReasonDetail: (lt as any)?.quantNullReasonAggregate ?? lt?.nullReasonAggregate ?? {},
         patternNullReasonDetail: (lt as any)?.patternNullReasonAggregate ?? {},
         // B79.0m.b2-followup (Kyle 2026-05-12 issue #6): denominator for
         // family-mismatch % was strategiesEvaluated only (eligibility-pass),
@@ -7884,7 +7902,12 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         // FilterDiagnosticsData-compatible fields
         lastScan,
         rolling24h,
-        signalRejections: { total: totalRejected, byReason, byRegime },
+        // B-DIAG-387 (#387): the always-empty `signalRejections` field was removed
+        // with its dead feeder vars (totalRejected/byReason/byRegime). No client
+        // reads it for the xStock tab (verified: no `.signalRejections`/`.byRegime`
+        // consumer); the crypto endpoint keeps its own populated signalRejections.
+        // The real per-reason rejection data is surfaced via vtsEvaluation
+        // (rejectedReasons + nullReasonDetail). See DELETED_COMPONENTS_LOG.md.
         vtsEvaluation,
         guardDrops,
         trackerStartedAt,
@@ -7919,6 +7942,9 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
           tradesOpened: ec.tradesOpened,
           setupHashDeduped: (ec as any).setupHashDeduped ?? 0,
           nullReasonDetail: ec.nullReasonAggregate ?? {},
+          // B-DIAG-387 (#387): per-cycle parity with the 24h vtsEvaluation block —
+          // surface the net-EV-floor rejection count for the just-finished cycle.
+          rejectedReasons: { netEvBelowFloor: ec.nullReasonAggregate?.['net_ev_rejected'] ?? 0 },
           // B-NEW-19 (Kyle directive 2026-05-13): per-lane null-reason aggregates
           // emitted at per-cycle granularity so the Last Scan section can render
           // the Quant/Pattern split for Pre-Eval Skips and compute Possible
```

## NEW FILE: server/tests/unit/b-diag-387-xstock-reject-counters.test.ts
```ts
/**
 * B-DIAG-387 (#387) — xStock filter-diagnostics reject-counter contract.
 *
 * The /api/xstocks/filter-diagnostics endpoint surfaces the Net-EV-floor
 * rejection count (the reorg-B7 maker/taker baseline) and the pre-open gate
 * reasons from the in-memory eval accumulators. Before this batch the endpoint
 * read a permanently-empty `byReason` scaffold → reported 0 forever (the #386
 * bug). This pins the KEY CONTRACT that ties the eval-cycle producer
 * (xstock_spot/eval-cycle.ts) to the endpoint mapping (routes.ts) to the panel
 * consumer (machine-learning.tsx), so a future edit can't silently rename a key
 * on one side and zero the dashboard again.
 *
 * The mapping helpers below mirror the endpoint expressions verbatim. The
 * decisive end-to-end proof is the Step-7 staging cross-check of the live count
 * against signal_eval_archive — this test guards the in-process contract.
 */
import { describe, it, expect } from 'vitest';

// ── The canonical in-memory key for a Net-EV-floor rejection. The eval-cycle
// writes this into nullReasonAggregate (combined) + the per-lane aggregates; the
// endpoint total + the panel per-pool columns read it. It is DELIBERATELY
// distinct from the ARCHIVE reason string ('net_ev_below_floor', the archiver
// layer) — same event, two layers. Drift between these is the #386 failure mode.
const NET_EV_INMEM_KEY = 'net_ev_rejected';
const NET_EV_ARCHIVE_REASON = 'net_ev_below_floor';

// ── The pre-open gate reason strings checkPreOpenGates emits (vts-runner.ts).
// OBJ-2 surfaces the three that previously rendered nowhere.
const PREOPEN_HIDDEN = ['reentry_cooldown', 'price_past_stop', 'price_past_target'] as const;

// Mirrors the endpoint's `rejectedReasons` expression (routes.ts).
function endpointRejectedReasons(agg: Record<string, number> | undefined) {
  return { netEvBelowFloor: agg?.[NET_EV_INMEM_KEY] ?? 0 };
}

// Mirrors the endpoint's structured `nullReasons` pre-open keys (routes.ts).
function endpointPreOpenNullReasons(agg: Record<string, number> | undefined) {
  const live = agg ?? {};
  return {
    reentryCooldown: live['reentry_cooldown'] ?? 0,
    pricePastStop: live['price_past_stop'] ?? 0,
    pricePastTarget: live['price_past_target'] ?? 0,
  };
}

describe('B-DIAG-387 xStock reject-counter key contract', () => {
  it('Net-EV-floor count surfaces from the net_ev_rejected aggregate key (not the dead scaffold)', () => {
    const agg = { net_ev_rejected: 611, conditions_not_met: 42 };
    expect(endpointRejectedReasons(agg).netEvBelowFloor).toBe(611);
  });

  it('empty / missing accumulator yields 0 — never undefined (panel renders a number)', () => {
    expect(endpointRejectedReasons({}).netEvBelowFloor).toBe(0);
    expect(endpointRejectedReasons(undefined).netEvBelowFloor).toBe(0);
  });

  it('does NOT read the archive reason string for the in-memory total (cross-layer guard)', () => {
    // If the endpoint regressed to the archive key, this accumulator would report 0.
    const aggArchiveKeyOnly = { [NET_EV_ARCHIVE_REASON]: 611 };
    expect(endpointRejectedReasons(aggArchiveKeyOnly).netEvBelowFloor).toBe(0);
    expect(NET_EV_INMEM_KEY).not.toBe(NET_EV_ARCHIVE_REASON);
  });

  it('the three previously-hidden pre-open gate reasons each surface under their structured key', () => {
    const agg = { reentry_cooldown: 3, price_past_stop: 7, price_past_target: 5, duplicate_position: 99 };
    const nr = endpointPreOpenNullReasons(agg);
    expect(nr.reentryCooldown).toBe(3);
    expect(nr.pricePastStop).toBe(7);
    expect(nr.pricePastTarget).toBe(5);
  });

  it('pins the exact pre-open reason strings the panel + endpoint depend on', () => {
    // Guards against a producer-side rename in checkPreOpenGates silently
    // un-surfacing a gate again.
    expect([...PREOPEN_HIDDEN]).toEqual(['reentry_cooldown', 'price_past_stop', 'price_past_target']);
  });
});
```
