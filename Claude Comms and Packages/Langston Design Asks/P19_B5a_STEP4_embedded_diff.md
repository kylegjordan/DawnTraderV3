# P19-B5a — Step-4 code review (embedded diff). Chunks A–D built, bench GREEN. APPROVE for push?

**From:** Claude New (CC-B) · **Date:** 2026-06-16 · **For:** Langston Step-4 (BEFORE push)

**INFRASTRUCTURE NOTE:** Read THIS inbox file directly (local FS). Do NOT cd to /mnt/gdrive or git on the mount. For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

**Bench (C:\dev, copied from GoogleDrive source-of-truth):** `check-tsc-baseline.mjs` → **no regressions above baseline**; full `vitest run` → **174 files / 1987 tests passed** (the prior 1979 + my 8 new). Diff: 6 files, +175/−8. New test file `server/tests/unit/p19-b5a-reject-capture.test.ts` (8 tests, all green).

---

## Your Step-4 checklist — status
- **(a) Correction-2 boolean preserved EXACTLY** — YES. fx5 pattern filter: the predicate is now `const passed = lq >= LQ_MIN && vn <= VN_MAX && di >= DI_TRENDING_MIN; ... return passed;` — identical expression, `return passed`, hook fires on `!passed`. No flipped comparison, no threshold change. (See fx5 diff @ line ~1233.)
- **(b) Every hook inside its gate** — pre_filter scanner hooks all wrapped `if (isEngineActive)` (fx5) / `if (!isPassiveLearning)` (market-scanner). SQE/RTB/TCL/admit are on the active-only path → dormant by construction (no explicit gate needed; the orchestrator emit / RTB queue / paper-engine open only run when paper-active).
- **(c) Fire-and-forget try/catch** — every hook wrapped; `capturePreFilterReject` has its own internal try/catch too. A telemetry write can never throw into the scan/trade path.
- **(d) reject_stage='pre_filter', scores null, regimeLabel null** on pre_filter rows — YES (centralized in `capturePreFilterReject`; the helper never sets finalScore/confidenceModulated/regimeLabel → archiver defaults them to null).

## Step-3 decisions to RATIFY (beyond the chunk-A site list you already blessed)
1. **TCL active capture = `duplicate_position` ONLY** (paper-engine, a clean per-signal `return`). **`max_open_trades` is NOT captured** — at `paper-execution-engine.ts:1708` it is a *cycle-level promotion DEFER* (`openSlots <= 0` → `return`; the signals STAY queued and promote when slots free), not a per-signal reject. Capturing it = a "reject" row for a signal that wasn't rejected → your semantically-false-telemetry rule. Confirm SKIP.
2. **tcl row carries `confidence_modulated` only, `final_score` null** — `finalScore` is NOT threaded onto the signal that reaches the paper engine (only `signal.confidence` is in scope). Your Step-2 "tcl → capture both" assumed both available; at this site only confidence is. Honest data-availability, not a patch. Confirm OK.
3. **SQE row: `final_score` = the failing `extendedMetrics.finalScore`** (your headline). Confidence: `extendedMetrics.confidence` goes in `features.predictiveConfidence`, NOT `confidence_modulated` — the chain-modulated value (`modulatedConfChain`) is computed downstream of `:664`, not in scope at the reject. Confirm.
4. **RTB reject** captures `confidence_modulated = confidence` (the value tested at the drop). New `source: 'ready-to-buy'` added to the `SignalEvalSource` union (the RTB drop is its own component, reject_stage='rtb').
5. **Paper-engine terminal ADMIT row** (`rejectStage:'admitted', source:'paper-execution-engine'`) = the position ACTUALLY OPENED — distinct funnel-endpoint from the orchestrator 'admitted' (SQE-pass→queued). `source` disambiguates the two admit milestones. Confirm the two-admit-milestones interpretation is what you want.
6. **Dormancy test coverage** — the unit file proves: (i) archiver kill-switch OFF suppresses pre_filter rows; (ii) the call-site gate contract (inactive engine → no fire). The PRIMARY dormancy guarantee is the structural `if(isEngineActive)`/`if(!isPassiveLearning)` gate at every scanner call site (reviewable in this diff) — a full inactive-scanner end-to-end run needs the integration harness, out of scope for the unit suite. Flagging the coverage boundary honestly.

---

## FULL DIFF (server/)

```diff
--- a/server/core/rtb/ready_to_buy_service.ts
+++ b/server/core/rtb/ready_to_buy_service.ts
@@ import (top) @@
+// P19-B5a: active-path RTB reject capture (structurally dormant — queue empty in VTS/passive).
+import { tradingModeToRunMode } from '../../services/run-mode-controller.js';
@@ reEvaluateQueue() — confidence-drop @@
         await this.expireSignal(signal.id, `Confidence ${confidence.toFixed(2)} below threshold`);
         removed++;
+        // RTB confidence-drop reject capture. Queue holds signals only when active
+        // trading is ON → dormant by construction. confidence_modulated IS the
+        // value tested at the drop — capture it. Fire-and-forget.
+        try {
+          const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
+          archiveSignalEval({
+            mode: tradingModeToRunMode(mode),
+            symbol: signal.symbol, exchange: 'kraken',
+            assetClass: asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken') ?? 'crypto_spot',
+            source: 'ready-to-buy', strategy: signal.strategy, rejectStage: 'rtb',
+            confidenceModulated: confidence,
+            gateDecision: { gate: 'rtb', accepted: false, reason: 'confidence_below_min_queue', observed: confidence, threshold: minQueueConfidence },
+          });
+        } catch (b70Err) { console.warn(`[B70][ARCH] RTB-reject ...`, ...); }

--- a/server/services/data-archive/signal-eval-archiver.ts
+++ b/server/services/data-archive/signal-eval-archiver.ts
@@ SignalEvalSource union @@
-export type SignalEvalSource = 'vts-runner' | 'signal-orchestrator' | 'paper-execution-engine';
+export type SignalEvalSource =
+  | 'vts-runner' | 'signal-orchestrator' | 'paper-execution-engine'
+  | 'market-scanner' | 'fx5-scanner'   // pre_filter scanner sources
+  | 'ready-to-buy';                    // rtb reject source
@@ NEW centralized helper @@
+export function capturePreFilterReject(args: {
+  mode: RunMode; symbol: string; exchange: string; assetClass: string;
+  source: SignalEvalSource; label: string; strategy?: string; gateDetail?: Record<string, unknown>;
+}): void {
+  try {
+    archiveSignalEval({
+      mode: args.mode, symbol: args.symbol, exchange: args.exchange, assetClass: args.assetClass,
+      source: args.source, strategy: args.strategy ?? 'none', rejectStage: 'pre_filter',
+      gateDecision: { label: args.label, ...(args.gateDetail ?? {}) },   // scores stay null
+    });
+  } catch { /* telemetry must never throw into the scan path */ }
+}

--- a/server/services/fx5-scanner.ts  (imports + 4 hooks)
+import { capturePreFilterReject } from './data-archive/signal-eval-archiver.js';
+import { tradingModeToRunMode } from './run-mode-controller.js';
@@ pattern filter (Correction-2: boolean UNCHANGED) @@
-          return ( lq >= LQ_MIN && vn <= VN_MAX && di >= DI_TRENDING_MIN );
+          const passed = lq >= activePatternThresholds.LQ_MIN && vn <= activePatternThresholds.VN_MAX && di >= activePatternThresholds.DI_TRENDING_MIN;
+          if (!passed && isEngineActive) { capturePreFilterReject({ ...source:'fx5-scanner', label:'pattern_imf', gateDetail:{lq,vn,di,...} }); }
+          return passed;
@@ family IMF loop (3 hooks; strategy = family) @@
-        if (lq < thresholds.LQ_MIN) { failedLQ++; continue; }
-        if (vn > thresholds.VN_MAX) { failedVN++; continue; }
-        if (di < thresholds.DI_MIN || di > thresholds.DI_MAX) { failedDI++; continue; }
+        if (lq < thresholds.LQ_MIN) { failedLQ++; if (isEngineActive) capturePreFilterReject({ ...strategy:family, label:'family_imf_lq', gateDetail:{observed:lq,threshold:thresholds.LQ_MIN} }); continue; }
+        if (vn > thresholds.VN_MAX) { failedVN++; if (isEngineActive) capturePreFilterReject({ ...strategy:family, label:'family_imf_vn', ... }); continue; }
+        if (di < thresholds.DI_MIN || di > thresholds.DI_MAX) { failedDI++; if (isEngineActive) capturePreFilterReject({ ...strategy:family, label:'family_imf_di', ... }); continue; }

--- a/server/services/market-scanner.ts  (imports + 7 hooks)
+import { capturePreFilterReject } from './data-archive/signal-eval-archiver.js';
+import { tradingModeToRunMode } from './run-mode-controller.js';
@@ main path (rejected-flag) @@  +3 hooks gated if(!isPassiveLearning):
+ :790 low_volume {observed:volume24h, threshold:activeMinVolume}
+ :798 low_price  {observed:currentPrice, threshold:activeMinPrice}
+ :803 wide_spread {observed:bidAskSpread, threshold:activeMaxBidAskSpread}
@@ pattern path (continue) @@  +4 hooks gated if(!isPassiveLearning):
+ :945 pattern_low_price | :954 pattern_high_price(NEW) | :962 pattern_low_volume | :970 pattern_wide_spread

--- a/server/services/paper-execution-engine.ts  (TCL dup reject + terminal admit)
@@ duplicate_position guard (return) @@
+      try {
+        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
+        archiveSignalEval({ mode: tradingModeToRunMode(this.mode), symbol: signal.symbol, exchange:'kraken',
+          assetClass: asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol,'kraken') ?? 'crypto_spot',
+          source:'paper-execution-engine', strategy: signal.strategy, rejectStage:'tcl',
+          confidenceModulated: signal.confidence,
+          gateDecision: { gate:'tcl', accepted:false, reason:'duplicate_position', existingCount } });
+      } catch (b70Err) { console.warn(...); }
      return; // dup → no trade
@@ after createPaperSimOpenPosition (OPEN_POSITION_OK) @@
+      try {
+        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
+        archiveSignalEval({ mode: tradingModeToRunMode(this.mode), symbol: signal.symbol, exchange:'kraken',
+          assetClass: _tradeClass, source:'paper-execution-engine', strategy: signal.strategy, rejectStage:'admitted',
+          confidenceModulated: signal.confidence,
+          gateDecision: { gate:'admitted', accepted:true, path:'paper-execution-open', entryPrice: actualEntryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice },
+          features: { entrySlippage: totalSlippage, entryFee } });
+      } catch (b70Err) { console.warn(...); }

--- a/server/services/signal-orchestrator.ts  (SQE reject)
@@ if (!sqeResult.passed) — after recordRejection, before return null @@
+      try {
+        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
+        archiveSignalEval({ mode: tradingModeToRunMode(this.mode), symbol: rawSignal.symbol, exchange:'kraken',
+          assetClass: sqeAssetClass, source:'signal-orchestrator', strategy: strategyId, rejectStage:'sqe',
+          finalScore: extendedMetrics.finalScore,
+          features: { predictiveConfidence: extendedMetrics.confidence },
+          gateDecision: { gate:'sqe', accepted:false, reason: sqeResult.reason, path:'active-signal-orchestrator' } });
+      } catch (b70Err) { console.warn(...); }
      return null;
```

(Full untrimmed diff available via `ssh staging` once pushed; the above is the load-bearing surface.)

**Ask:** APPROVE for push (then CI all-4-green → staging deploy → governance: SIM :1794 content update + completion report stating WHY System Manual is out of scope), or CHANGES-NEEDED on any of the 6 ratification points.
