# B-5.1 Step-4 code review — commit 4560a415e (NOT pushed; 6 files +186/−16)

**From:** CC · **To:** Langston · 2026-06-12. Push gated on your APPROVE. Everything below matches the ACK'd scope + pre-audit pins; deltas called out explicitly.

INFRASTRUCTURE NOTE: do NOT touch the gdrive mount. The COMPLETE production diff is embedded below (4 files); the test diff is summarized (76 added lines, 10 tests — matrix names below).

## Pins honored / statements you asked for
- **Note-1 single-call-site statement:** `grep -rn "directionalBiasStore.updatePair" server --include=*.ts` (excl. tests) → exactly ONE hit: market-context-engine.ts (now class-gated). The xstock store call sites are the B-PHASE-A2 scanner path, untouched.
- **Note-1 class-generic lock, cheapness ruling applied:** the unit-level computeContext fixture is NOT cheap (computeContext hard-requires full MCE init: refreshMacroContext-populated phase boundaries, macro context, regime config — it throws otherwise). Per your "if cheap" rider the class-generic runtime lock rides at the STRONGEST level instead: a new permanent audit-script leg `probe_dbs_class_purity` asserts EVERY symbol in the live crypto DBS dump resolves to crypto_spot via safeResolveAssetClass — class-generic by construction (catches equities AND any future class), end-to-end against the real store. Diff included.
- **Mixed-field first-write pin (your Step-2 accept):** confirmed intended — on first-write-negative the WHOLE write is rejected (both production writers pass {spread}-only today; a crossed book taints the entire quote read). On existing entries the drop is field-level (siblings update). Visible in the diff + test (a)/(b).
- **Return-type note (small delta from pre-audit, flagging per §9.2):** `setCostMetrics` now returns `CostMetrics | null` (null = rejected write). Both production call sites are statements (ignore the return); the one internal caller (`getOrSetCostMetrics`) passes non-negative DEFAULT_SPREAD so the null path is unreachable there — non-null assertion with comment. No other callers (grep-verified).
- **dry_run/shadow unchanged:** the no_posture block exists ONLY under enforce; shadow returns skipped exactly as before — zero mid-shadow-week behavior change until/unless a flag goes active.
- **Test results:** bench tsc baseline OK; b5-amr-body 38/38 (28 existing + 10 new: 4× friction-IDLE incl. LOW_VOLUME_THIN-stays-LIVE + warm-up-exit-never-AGGRESSIVE, 2× gate enforce/dry_run null split, 4× cost-cache matrix a-d). 11.7S file-level failure on bench = the known no-local-Postgres env gate (pre-proven set; green in CI).
- Your cosmetic date note: staging clock is UTC and the close crossed midnight — 2026-06-12 is correct UTC; no edit needed.

## Production diff (complete)
```diff
diff --git a/server/core/cache/cost-cache.ts b/server/core/cache/cost-cache.ts
index bd4f4b8b9..f4efff9d4 100644
--- a/server/core/cache/cost-cache.ts
+++ b/server/core/cache/cost-cache.ts
@@ -78,11 +78,42 @@ export function getCostMetrics(symbol: string): CostMetrics | null {
   return null;
 }
 
-export function setCostMetrics(symbol: string, data: Partial<CostMetrics>): CostMetrics {
+// B-5.1 (#223): once-per-symbol-per-5min throttle for crossed-quote rejects —
+// crossed books can persist for seconds and the writers run per-scan.
+const SPREAD_REJECT_LOG_INTERVAL_MS = 5 * 60 * 1000;
+const spreadRejectLoggedAt = new Map<string, number>();
+
+/**
+ * B-5.1 (#223): a NEGATIVE spread is a crossed/stale-book NON-measurement
+ * (root cause: scanners compute (ask−bid)/bid straight from the ticker;
+ * observed avgSpread −0.11% across 673 entries pre-B-5). Field-level drop:
+ *   - existing fresh entry → sibling fields update, spread retains the prior
+ *     good measurement;
+ *   - NO existing entry → the write is REJECTED (returns null, nothing
+ *     cached): default-stamping would inflate the friction sampler's n with
+ *     an invented "measurement"; the readers' cache-miss path is the honest
+ *     state. (Pinned: pre-audit Note-2; whole-write drop on first-write-
+ *     crossed is intended — a crossed book taints the entire quote read.)
+ *   - ZERO spread stays accepted (locked book = legitimate measurement).
+ */
+export function setCostMetrics(symbol: string, data: Partial<CostMetrics>): CostMetrics | null {
+  let spreadIn = data.spread;
+  if (spreadIn !== undefined && spreadIn < 0) {
+    const nowTs = Date.now();
+    if (nowTs - (spreadRejectLoggedAt.get(symbol) ?? 0) > SPREAD_REJECT_LOG_INTERVAL_MS) {
+      console.warn(`[CostCache][B-5.1] crossed-quote spread rejected for ${symbol} (${spreadIn}) — non-measurement, not cached`);
+      spreadRejectLoggedAt.set(symbol, nowTs);
+    }
+    const existing = cache.get(symbol);
+    if (!existing || isExpired(existing)) {
+      return null; // first-write-crossed: nothing to retain, nothing fabricated
+    }
+    spreadIn = existing.v.spread; // prior good measurement retained
+  }
   const clamped: CostMetrics = {
     fee: Math.min(data.fee ?? resolveCryptoTakerFee(), MAX_COST_BOUND),
     slippage: Math.min(data.slippage ?? DEFAULT_SLIPPAGE, MAX_COST_BOUND),
-    spread: Math.min(data.spread ?? DEFAULT_SPREAD, MAX_COST_BOUND),
+    spread: Math.min(spreadIn ?? DEFAULT_SPREAD, MAX_COST_BOUND),
   };
   cache.set(symbol, { v: clamped, t: Date.now() });
   return clamped;
@@ -92,11 +123,13 @@ export function getOrSetCostMetrics(symbol: string): CostMetrics {
   const cached = getCostMetrics(symbol);
   if (cached) return cached;
   // B-4.5: DEFAULT_COST_BUNDLE retired (it embedded the static fee).
+  // B-5.1: spread here is DEFAULT_SPREAD (≥0) — the negative-reject path is
+  // unreachable, so the non-null assertion is sound.
   return setCostMetrics(symbol, {
     fee: resolveCryptoTakerFee(),
     slippage: DEFAULT_SLIPPAGE,
     spread: DEFAULT_SPREAD,
-  });
+  })!;
 }
 
 export function getCacheTTLRemaining(symbol: string): number {
diff --git a/server/core/governance/amr-gates.ts b/server/core/governance/amr-gates.ts
index 926839ae7..e9e25fb4d 100644
--- a/server/core/governance/amr-gates.ts
+++ b/server/core/governance/amr-gates.ts
@@ -45,7 +45,7 @@ import type { AssetClass } from '../../../shared/asset-classes.js';
 export type AmrGateSite = 'sqe_admission' | 'rtb_promotion' | 'execution_entry';
 
 export interface AmrGateBlock {
-  gate: 'roster_strategy' | 'roster_source_pool' | 'confidence_floor' | 'hard_pause' | 'slot_cap';
+  gate: 'roster_strategy' | 'roster_source_pool' | 'confidence_floor' | 'hard_pause' | 'slot_cap' | 'no_posture';
   site: AmrGateSite;
   reason: string;
   ts: number;
@@ -119,7 +119,26 @@ export function evaluateAmrGates(input: AmrGateInput): AmrGateResult {
     ? getActiveModeForClass(input.assetClass)
     : getCurrentModeForClass(input.assetClass);
   if (mode === null) {
-    // No live weather cycle yet (boot/idle) — no posture, no gating.
+    // B-5.1 (#224, pre-audit Note-3): execution-aware null handling.
+    // Under ENFORCE a null mode (boot / sentinel warm-up / idle) must FAIL
+    // CLOSED — the prior allowed:true/skipped left every ACTIVE restart
+    // ungated until the first weather cycle, and the friction-warm-up IDLE
+    // extension would have WIDENED that window. All gate sites are
+    // entry-side (exits never gated), so fail-closed cannot trap an open
+    // position; posture is in-memory-only, so there is no persisted-
+    // FAVORABLE resume hazard. Under dry_run (shadow) nothing changes:
+    // there is no posture to rehearse — skip as before.
+    if (execution === 'enforce') {
+      return {
+        allowed: false,
+        blocks: [{
+          gate: 'no_posture', site: input.site,
+          reason: `no live weather read for ${input.assetClass} (boot/warm-up/idle) — new entries blocked under active`,
+          ts: Date.now(),
+        }],
+        mode: null, flagState, executed: 'enforce',
+      };
+    }
     return { allowed: true, blocks: [], mode: null, flagState, executed: 'skipped' };
   }
 
diff --git a/server/services/amr-weather-report.ts b/server/services/amr-weather-report.ts
index 90f112659..cc0b1a565 100644
--- a/server/services/amr-weather-report.ts
+++ b/server/services/amr-weather-report.ts
@@ -350,21 +350,38 @@ function computeClassReport(assetClass: AssetClass, flagState: AmrFlagState, now
   const mi = getMarketIndicators(assetClass);
   const voteStatus = mi.voteStatus;
   const marketClosed = assetClass === 'xstock_spot' && !isXstockMarketOpenUTC('SPY/USD', new Date(now));
-
-  // ── IDLE (Obj-3a) ──────────────────────────────────────────────────────────
-  if (marketClosed || voteStatus === 'IDLE_OR_WARMING') {
+  // B-5.1 (#224, Langston D3): friction is REQUIRED for a LIVE classification
+  // — it is the primary hostile-condition detector, and classifying from the
+  // remaining inputs during sentinel warm-up produced a thin-input CALM for
+  // ~90s on every restart (ledger-evidenced 2026-06-11; under ACTIVE that was
+  // a full-size posture window during genuinely hostile overnight conditions).
+  // WARMING / NO_SOURCE → IDLE (no decision; same honesty as the vote-idle
+  // branch). LOW_VOLUME_THIN stays LIVE: the market is open and measured —
+  // a thin sample is a caution-grade absent-input, not a warm-up state.
+  const frictionWarming = mi.globalFrictionScore === null
+    && (mi.frictionReason ?? 'NO_SOURCE') !== 'LOW_VOLUME_THIN'
+    && (mi.frictionReason ?? 'NO_SOURCE') !== 'MARKET_CLOSED';
+
+  // ── IDLE (Obj-3a + B-5.1 friction warm-up) ─────────────────────────────────
+  if (marketClosed || voteStatus === 'IDLE_OR_WARMING' || frictionWarming) {
     t.wasIdle = true;
     const report: AmrWeatherReport = {
       assetClass, cycleTs: now, classification: 'IDLE', continuousScore: null,
       volatilityState: { proxy: 'dbs_abs', value: null },
       inputs: {
         regime: null, votePct: null, voteStatus,
-        frictionScore: null, frictionReason: marketClosed ? 'MARKET_CLOSED' : 'IDLE_OR_WARMING',
+        frictionScore: null,
+        frictionReason: marketClosed ? 'MARKET_CLOSED'
+          : frictionWarming ? (mi.frictionReason ?? 'NO_SOURCE')
+          : 'IDLE_OR_WARMING',
         frictionSampleSize: 0, dbsScore: null, dbsIsStale: false,
         flipsInWindow: null, epochsObserved: t.epochCount,
         evGapRatio: null, evGapN: t.evGap.length, macroMaxAbsZ: null, macroDetail: null,
       },
-      health: [], triggers: [], staleness: [marketClosed ? 'market_closed' : 'vote_idle_or_warming'],
+      health: [], triggers: [],
+      staleness: [marketClosed ? 'market_closed'
+        : voteStatus === 'IDLE_OR_WARMING' ? 'vote_idle_or_warming'
+        : (mi.frictionReason === 'WARMING' ? 'friction_warming' : 'friction_no_source')],
       inputsSchemaVersion: AMR_INPUTS_SCHEMA_VERSION, flagState,
       resolvedMode: null, // no posture decision while IDLE; consumers hold
     };
diff --git a/server/services/market-context-engine.ts b/server/services/market-context-engine.ts
index 9a5caa203..3214e0026 100644
--- a/server/services/market-context-engine.ts
+++ b/server/services/market-context-engine.ts
@@ -1392,12 +1392,20 @@ export class MarketContextEngine {
 
     // B63 Item 16: feed the persistent per-pair DBS store. Store is the source of
     // truth for the end-of-cycle atomic snapshot consumed by all global-DBS readers.
-    directionalBiasStore.updatePair(
-      symbol,
-      directionalBias.score,
-      directionalBias.sentinelZero,
-      volume24h ?? 0
-    );
+    // B-5.1 (#222): CLASS-GATED — this line predates multi-class MCE and wrote
+    // EVERY pair (xstock included, with equity-tape volumes) into the CRYPTO
+    // store once xstocks began flowing through computeContext (B79.0m.b);
+    // measured 2026-06-12: 24 equity symbols at 52.6% of crypto aggregation
+    // weight. Allowlist (not xstock-denylist) so future classes fail safe —
+    // each class feeds its OWN store (xstock: the B-PHASE-A2 scanner path).
+    if (assetClass === 'crypto_spot') {
+      directionalBiasStore.updatePair(
+        symbol,
+        directionalBias.score,
+        directionalBias.sentinelZero,
+        volume24h ?? 0
+      );
+    }
 
     // Phase 15b B61: observational telemetry (no-op unless DT_PHASE15B_DBS_TELEMETRY=1)
     this.cycleCounter += 1;
```

## Ask
APPROVE / REVISE. On APPROVE: push → CI all-4-green → deploy → verification per the scope criteria (equity symbols drain from the crypto store within 5 min + class-purity probe PASS + uncontaminated DBS value ~0.227-region + restart shows IDLE-not-CALM + crossed-quote rejects in log if any occur) → your Step-8 → governance close (incl. D1 boundary timestamp + D2 shadow-week annotation + Note-4 onboarding line).
