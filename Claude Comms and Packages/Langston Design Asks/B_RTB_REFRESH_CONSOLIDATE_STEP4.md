# B-RTB-REFRESH-CONSOLIDATE — Step-4 diff (CC-A, 2026-07-19)

**Staging step 1 of 2 (your accepted inversion): TRANSPLANT ONLY.** Mechanism A is UNTOUCHED and still running — it is the safety net during the rewire, exactly as you required. Its starters are NOT removed in this diff; that is step 2, gated on observing the numbers move on a live row.

**Bench:** tsc baseline OK (no regressions). Full vitest **0 failed tests / 2332 passed** (the 10 failed FILES are the pre-existing DB-teardown set, identical to clean baseline). New suite `b-rtb-refresh-consolidate.test.ts` 11/11.

## Design: EXTRACT-THEN-SHARE, not copy
A's live-data acquisition is extracted VERBATIM into one private `acquireRefreshedInputs`. BOTH mechanisms now call it, so after this diff they execute IDENTICAL logic — which is what makes step 1 provably behaviour-preserving for A while making B honest. At step 2, deleting A removes a CALLER, not logic.

## Your Step-2 epistemic flag — the STORED-vs-live column, now diff-verifiable
You ruled §4/§5 on reasoning and marked the substrate REPORTED FACT for independent re-read here. The three claims and where to check them in the diff below:
1. *B replayed STORED chosenNetEv* — see the removed line `chosenNetEv: (signal as any).chosenNetEv != null ? Number(...) : undefined` (stored-only, no re-decide) and its replacement preferring `_acq.refreshedMT?.chosenNetEV`.
2. *B used frozen volatility* — removed `volatility: metadata.volatility ?? 0.3` → `volatility: _acq.currentVol`.
3. *B never wrote freshness fields back* — the bulkUpdates metadata block previously ended at `decayPenalty`; the diff ADDS netExpectedEdge/volatility/spread/lastCostRefresh + the maker/taker columns. **This is the self-perpetuating mechanism: B left every field it read stale.**

## The diff
```diff
diff --git a/server/core/rtb/ready_to_buy_service.ts b/server/core/rtb/ready_to_buy_service.ts
index d3fff3f0b..37fe9cec0 100644
--- a/server/core/rtb/ready_to_buy_service.ts
+++ b/server/core/rtb/ready_to_buy_service.ts
@@ -759,42 +759,51 @@ class ReadyToBuyService {
    * Signals ranked by FinalScore with decayPenalty
    */
 
-  private async refreshSingleSignal(signal: RtbSignal, mode: TradingMode): Promise<{ passed: boolean }> {
-    const normalizedSymbol = normalizePairKey(signal.symbol);
-    const now = new Date();
-
-    // Directive 11.0E: Extract FinalScore-native metrics from signal
-    const metadata = signal.metadata as Record<string, any> || {};
-    const confidence = parseFloat(signal.confidence || '0.5');
-    const originalFinalScore = metadata.finalScore ?? parseFloat(signal.finalScore || '0.5');
-    const hybridScore = metadata.hybridScore ?? confidence;
-    const regimeWeight = metadata.regimeWeight ?? 0.5;
-    
-    // Directive 11.3A: Conditional geometry refresh
+  /**
+   * B-RTB-REFRESH-CONSOLIDATE (OBJ-1/OBJ-2, 2026-07-19) — THE SHARED REFRESH ACQUISITION.
+   *
+   * Extracted VERBATIM from `refreshSingleSignal`'s inline block so BOTH refresh mechanisms
+   * run IDENTICAL logic. Until this batch, only the Central-Clock per-signal mechanism
+   * re-read market state; the bucketed service replayed the frozen queue-time snapshot AND
+   * never wrote the freshness fields back (self-perpetuating — pre-audit §2). Behaviour for
+   * the per-signal caller is unchanged by construction (same code, same order); the bucketed
+   * caller becomes honest.
+   *
+   * Kyle's ratified refresh contract (2026-07-19): "represent the signal AS IT CURRENTLY IS,
+   * as accurately as possible, so the SQE can make the best possible accept/reject decision."
+   *
+   * Score-timing invariant PRESERVED (Langston P19-B7.2b Step-4 gate): geometry inputs are
+   * captured first, `refreshedFinalScore` is computed next, and ONLY THEN is decideMakerTaker
+   * run — so `signalStrength` consumes the DECAYED score, never the stale stored one.
+   */
+  private acquireRefreshedInputs(
+    signal: RtbSignal,
+    normalizedSymbol: string,
+    metadata: Record<string, any>,
+    confidence: number,
+    hybridScore: number,
+    regimeWeight: number,
+  ): {
+    currentVol: number;
+    currentSpread: number;
+    netExpectedEdge: any;
+    geometryRefreshed: boolean;
+    decayPenalty: number;
+    refreshedFinalScore: number;
+    refreshedMT: { chosenMode: 'taker' | 'maker'; chosenNetEV: number; takerNetEV: number; makerNetEVAdjusted: number; entryFeeRate: number } | null;
+  } {
+    // Directive 11.3A: conditional geometry refresh (throttled on max-age / vol-shift /
+    // spread-shift — an efficiency guard, not a staleness defect).
     const currentSpread = getCachedSpread(normalizedSymbol);
     const currentVol = getVolatility(normalizedSymbol);
     let netExpectedEdge = metadata.netExpectedEdge;
     let geometryRefreshed = false;
-    // P19-B7.2b (OBJ-E): holds the RE-RUN maker/taker decision (on CURRENT data) so the
-    // reconfirm update below can refresh the snapshot columns. Null → no refresh this tick
-    // (geometry unchanged / unclassifiable) → the existing gen-time snapshot stands.
-    let _b72bRefreshedMT: { chosenMode: 'taker' | 'maker'; chosenNetEV: number; takerNetEV: number; makerNetEVAdjusted: number; entryFeeRate: number } | null = null;
-    // P19-B7.2b (OBJ-E score-timing, Langston Step-4 gate): capture the geometry inputs
-    // here, but DEFER the decideMakerTaker call until AFTER refreshedFinalScore is computed
-    // below — signalStrength must consume the DECAYED score (what the ranker/gate operate
-    // on), not the stale stored finalScore. Null → geometry didn't refresh this tick.
-    let _b72bMTInputs:
+    let refreshedMT: { chosenMode: 'taker' | 'maker'; chosenNetEV: number; takerNetEV: number; makerNetEVAdjusted: number; entryFeeRate: number } | null = null;
+    let _mtInputs:
       | { geomClass: AssetClass; costMetrics: ReturnType<typeof getCachedCostMetrics>; entryPrice: number; stopPrice: number; targetPrice: number }
       | null = null;
 
     if (shouldRecalculateGeometry(signal, currentVol, currentSpread)) {
-      // P19-B4a (C4): getCachedCostMetrics REQUIRES assetClass. PREFER the row's
-      // stamp — rtb_signals.asset_class (schema.ts:1885) is stamped at queue-write
-      // and is the source of truth post-C1. Read it (validated against the canonical
-      // set); safe-resolve from the symbol only as a legacy-row fallback; SKIP the
-      // geometry refresh on an unclassifiable symbol (re-deriving is wrong-by-
-      // construction for collision tickers — asset-classes.ts:489 — and a guessed
-      // class would mis-price the net geometry).
       const geomClass = asValidAssetClass(signal.assetClass) ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
       const entryPrice = parseFloat(signal.entryPrice?.toString() || '0');
       const stopPrice = parseFloat(signal.stopPrice?.toString() || '0');
@@ -806,22 +815,15 @@ class ReadyToBuyService {
         netExpectedEdge = geometry.netExpectedEdge;
         geometryRefreshed = true;
         console.log(`[11.3A][GEOMETRY_REFRESH] ${normalizedSymbol}: netEdge=${(netExpectedEdge * 100).toFixed(3)}%`);
-
-        // ── P19-B7.2b (OBJ-E, Kyle 2026-07-01): CAPTURE the geometry inputs so the
-        // maker/taker best-of-both decision can be RE-RUN below, AFTER the decayed score
-        // (refreshedFinalScore) is computed — signalStrength must consume the decayed
-        // score, not the stale stored finalScore (Langston Step-4 score-timing gate).
-        // The actual decideMakerTaker call is deferred to the post-score block.
-        _b72bMTInputs = { geomClass, costMetrics, entryPrice, stopPrice, targetPrice };
+        _mtInputs = { geomClass, costMetrics, entryPrice, stopPrice, targetPrice };
       } else if (geomClass === null) {
         console.warn(`[11.3A][GEOMETRY_SKIP] unclassifiable ${normalizedSymbol} — skipping geometry refresh (no valid stamp, unresolvable)`);
       }
     }
-    
-    // Directive 11.0E: Calculate decay penalty based on signal age
+
+    // Directive 11.0E: decay + FinalScore recompute (the gate is retired — #525 — but the
+    // decayed score is still the ranker's basis and decideMakerTaker's signalStrength vintage).
     const decayPenalty = calculateDecayPenalty(signal.queuedAt, normalizedSymbol);
-    
-    // Directive 11.0E: Recalculate FinalScore with decay applied
     const W = SCORE_WEIGHTS.FINAL_SCORE;
     const refreshedFinalScore = Math.max(0, Math.min(1,
       (hybridScore ?? 0) * W.HYBRID +
@@ -830,29 +832,11 @@ class ReadyToBuyService {
       (decayPenalty ?? 0) * W.DECAY
     ));
 
-    // ── P19-B7.2b (OBJ-E, Kyle 2026-07-01; Langston Step-4 score-timing gate): RE-RUN the
-    // maker/taker best-of-both decision on CURRENT market data (same shared decideMakerTaker
-    // the orchestrator + VTS call — F6), so a signal reconfirming in the RTBQ keeps a LIVE
-    // entry-mode + chosen netEV instead of the frozen gen-time snapshot. Runs HERE (after
-    // refreshedFinalScore) so signalStrength consumes the DECAYED score — the exact value
-    // the ranker/gate operate on — not the stale stored finalScore. The friction (spread/fee)
-    // that drives the maker-vs-taker choice is what the geometry refresh re-read
-    // (getCachedCostMetrics), so the decision stays current as the market moves. DI/DBS stay
-    // the at-queue basis (di_at_queue — the refresh has no fresh-DI source; DI is accuracy-only
-    // per audit H1, so no maker/taker consequence). Only runs when geometry shifted this tick
-    // (_b72bMTInputs set); otherwise the gen-time snapshot stands. LOAD-BEARING: chosen_net_ev
-    // drives BOTH the B7.1 ranker (queue order → who gets promoted) AND the [11.8B] open-gate,
-    // so keeping it current matters — and the refresh writes chosen_net_ev + the decision +
-    // the decayed finalScore in the SINGLE updateRtbSignal below (atomic; no half-updated row
-    // the ranker/gate could read). distStop (entry−stop) is NOT mutated by refresh, so the
-    // ranker's r = chosen_net_ev/distStop has an atomic numerator + an invariant denominator.
-    // (B7.2b, Kyle model 2026-07-01: a signal in the RTBQ carries a DECISION only — it works
-    // NO order; the maker order goes out at PROMOTION, and its fill/timeout/convert lifecycle
-    // is post-promotion — simulated for paper+VTS in B7.2c, real Kraken resting-order in
-    // Phase-21. The B7.2 in-queue maker_pending/convert-safety was the wrong stage, removed.)
-    if (_b72bMTInputs) {
+    // P19-B7.2b (OBJ-E): re-run the maker/taker best-of-both decision on CURRENT market data.
+    // chosen_net_ev drives BOTH the B7.1 ranker (queue order) AND the [11.8B] open-gate.
+    if (_mtInputs) {
       try {
-        const { geomClass, costMetrics, entryPrice, stopPrice, targetPrice } = _b72bMTInputs;
+        const { geomClass, costMetrics, entryPrice, stopPrice, targetPrice } = _mtInputs;
         const _mtFr = getFrictionForAssetClass(geomClass);
         const _mtGK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
         const _mt = decideMakerTaker({
@@ -866,22 +850,12 @@ class ReadyToBuyService {
           minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     _mtGK),
           maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   _mtGK),
           diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _mtGK),
-          // P19-B8.5a (OBJ-1, FIX-1): the measured flat pWin base rate (per-class DB knob),
-          // NOT the decayed finalScore — same de-tinting as gen-time (signal-orchestrator),
-          // keeping the refresh re-decide same-vintage with generation.
           signalStrength: getCachedNumberRequired('scoring_base', 'flat_pwin_base',
             { exchange: '*', assetClass: geomClass, strategy: '*', regime: '*' }),
-          // P19-B7.2b (Langston Step-4 confirm B): canonicalize the strategy key so the
-          // refresh re-decide keys STRATEGY_FAMILY_MAP on the SAME canonical name gen-time
-          // used (orchestrator's `_canonicalStrategy`, signal-orchestrator.ts:474). rtb_signals
-          // stores the raw `strategy` (e.g. 'range_trading'), but the map keys on 'range_trade'
-          // — a bare lookup would return undefined → default urgency → a DIFFERENT maker/taker
-          // mode than gen-time on identical data. normalizeStrategy cures the drift (identity on
-          // already-canonical tokens), keeping the refresh same-vintage with gen-time.
           urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[normalizeStrategy(signal.strategy)]),
           haircut: resolveMakerTakerHaircut(geomClass),
         });
-        _b72bRefreshedMT = {
+        refreshedMT = {
           chosenMode: _mt.chosenMode,
           chosenNetEV: _mt.chosenNetEV,
           takerNetEV: _mt.takerNetEV,
@@ -894,6 +868,36 @@ class ReadyToBuyService {
       }
     }
 
+    return { currentVol, currentSpread, netExpectedEdge, geometryRefreshed, decayPenalty, refreshedFinalScore, refreshedMT };
+  }
+
+  private async refreshSingleSignal(signal: RtbSignal, mode: TradingMode): Promise<{ passed: boolean }> {
+    const normalizedSymbol = normalizePairKey(signal.symbol);
+    const now = new Date();
+
+    // Directive 11.0E: Extract FinalScore-native metrics from signal
+    const metadata = signal.metadata as Record<string, any> || {};
+    const confidence = parseFloat(signal.confidence || '0.5');
+    const originalFinalScore = metadata.finalScore ?? parseFloat(signal.finalScore || '0.5');
+    const hybridScore = metadata.hybridScore ?? confidence;
+    const regimeWeight = metadata.regimeWeight ?? 0.5;
+    
+    // ★ B-RTB-REFRESH-CONSOLIDATE (OBJ-1, 2026-07-19): this block was EXTRACTED verbatim
+    // into `acquireRefreshedInputs` so the bucketed service runs identical logic. Behaviour
+    // here is unchanged by construction. This mechanism is retired in staging step 2 (the
+    // starters at active-execution-engine.ts + trading-bootstrap.ts), at which point this
+    // caller disappears and the shared method has a single caller.
+    const _acq = this.acquireRefreshedInputs(
+      signal, normalizedSymbol, metadata, confidence, hybridScore, regimeWeight,
+    );
+    const currentSpread = _acq.currentSpread;
+    const currentVol = _acq.currentVol;
+    const netExpectedEdge = _acq.netExpectedEdge;
+    const geometryRefreshed = _acq.geometryRefreshed;
+    const decayPenalty = _acq.decayPenalty;
+    const refreshedFinalScore = _acq.refreshedFinalScore;
+    const _b72bRefreshedMT = _acq.refreshedMT;
+
     // Phase 14: SQE revalidation — pass pre-computed FinalScore/RegimeWeight (no backfill)
     // P19-B4a (C4): assetClass REQUIRED on SQEInput. PREFER the row's stamp
     // (rtb_signals.asset_class, schema.ts:1885, stamped at queue-write — the source
@@ -1160,17 +1164,18 @@ class ReadyToBuyService {
               const queuedAt = signal.queuedAt;
               const oldStatus = signal.status || 'active';
               
-              // Calculate decay penalty
-              const decayPenalty = calculateDecayPenalty(queuedAt, normalizedSymbol);
-              
-              // Directive 11.0E: Recalculate FinalScore with decay applied
-              const W = SCORE_WEIGHTS.FINAL_SCORE;
-              const refreshedFinalScore = Math.max(0, Math.min(1,
-                (hybridScore ?? 0) * W.HYBRID +
-                (confidence ?? 0) * W.CONFIDENCE +
-                (regimeWeight ?? 0) * W.REGIME -
-                (decayPenalty ?? 0) * W.DECAY
-              ));
+              // ★ B-RTB-REFRESH-CONSOLIDATE (OBJ-1/OBJ-2, 2026-07-19) — THE TRANSPLANT.
+              // This mechanism previously replayed the FROZEN queue-time snapshot: stored
+              // volatility, stored chosen_net_ev, no geometry re-read, no maker/taker
+              // re-decide — and wrote none of those fields back, so the staleness was
+              // self-perpetuating. It now runs the SAME acquisition the per-signal
+              // mechanism runs, so the SQE is handed CURRENT market state.
+              // Per Kyle's refresh contract: represent the signal as it currently is.
+              const _acq = this.acquireRefreshedInputs(
+                signal, normalizedSymbol, metadata, confidence, hybridScore, regimeWeight,
+              );
+              const decayPenalty = _acq.decayPenalty;
+              const refreshedFinalScore = _acq.refreshedFinalScore;
               
               // Phase 14: SQE revalidation — pass pre-computed FinalScore/RegimeWeight (no backfill)
               // P19-B4a (C4): assetClass REQUIRED on SQEInput. PREFER the row's stamp
@@ -1203,7 +1208,8 @@ class ReadyToBuyService {
                 finalScore: refreshedFinalScore,
                 regimeWeight: regimeWeight,
                 trendStrength: metadata.trendStrength ?? 0.5,
-                volatility: metadata.volatility ?? 0.3,
+                // OBJ-2: LIVE volatility from the shared acquisition (was `metadata ?? 0.3`).
+                volatility: _acq.currentVol,
                 // P19-B8.5b (OBJ-4, #498): frozen at-queue sourcePool — batch-refresh parity with
                 // the single-refresh feed above (same row-read, same honest-absent semantics;
                 // regimeStability deliberately NOT fed — see the single-refresh comment).
@@ -1211,8 +1217,14 @@ class ReadyToBuyService {
                 // P19-B8.5a (OBJ-3): the ★third call site (batch refresh — Step-2 enumeration
                 // found it; the consensus said two). No re-decide runs on this path, so feed
                 // the stored row snapshot; absent → fail-open (Langston-ratified).
-                chosenNetEv: (signal as any).chosenNetEv != null ? Number((signal as any).chosenNetEv) : undefined,
-                chosenEntryMode: ((signal as any).chosenEntryMode as 'maker' | 'taker' | undefined) ?? undefined,
+                // ★ OBJ-2 HIGHEST-PRIORITY REWIRE: NetEV is the BINDING admission gate (#501 fee
+                // wall). This path replayed the queue-time snapshot, so a signal whose net
+                // expectancy had gone NEGATIVE since queueing was reconfirmed on the old
+                // number. Now prefers THIS tick's re-decide, exactly as the per-signal path does.
+                chosenNetEv: _acq.refreshedMT?.chosenNetEV
+                  ?? ((signal as any).chosenNetEv != null ? Number((signal as any).chosenNetEv) : undefined),
+                chosenEntryMode: (_acq.refreshedMT?.chosenMode
+                  ?? ((signal as any).chosenEntryMode as 'maker' | 'taker' | undefined)) ?? undefined,
               };
               
               // P19-B8.5 OBJ-6: same shadow treatment as the single-refresh site above (#514).
@@ -1246,6 +1258,16 @@ class ReadyToBuyService {
                   confidence: confidence.toString(),
                   finalScore: refreshedFinalScore.toString(),
                   lastRefreshedAt: now,
+                  // ★ OBJ-2: write the re-decided maker/taker snapshot back, mirroring the
+                  // per-signal path — chosen_net_ev is read by BOTH the B7.1 ranker (queue
+                  // order) and the [11.8B] open-gate, so a stale stored value mis-ranks and
+                  // mis-gates. Atomic with the metadata write below (no half-updated row).
+                  ...(_acq.refreshedMT ? {
+                    chosenEntryMode: _acq.refreshedMT.chosenMode,
+                    chosenNetEv: _acq.refreshedMT.chosenNetEV.toString(),
+                    takerNetEv: _acq.refreshedMT.takerNetEV.toString(),
+                    makerNetEvAdjusted: _acq.refreshedMT.makerNetEVAdjusted.toString(),
+                  } : {}),
                   metadata: {
                     ...metadata,
                     lastReconfirmedAt: statusUpdatedAt,
@@ -1254,6 +1276,13 @@ class ReadyToBuyService {
                     hybridScore: hybridScore,
                     regimeWeight: regimeWeight,
                     decayPenalty: decayPenalty,
+                    // ★ OBJ-2: the freshness fields this path NEVER wrote — the reason the
+                    // frozen snapshot was self-perpetuating. `lastCostRefresh` also re-arms
+                    // shouldRecalculateGeometry's age throttle correctly.
+                    netExpectedEdge: _acq.netExpectedEdge,
+                    volatility: _acq.currentVol,
+                    spread: _acq.currentSpread,
+                    lastCostRefresh: _acq.geometryRefreshed ? Date.now() : (metadata.lastCostRefresh ?? 0),
                   }
                 }
               });
```

## New test suite
```ts
/**
 * B-RTB-REFRESH-CONSOLIDATE — the transplant, pinned.
 *
 * The defect (audit 2026-07-18): two refresh mechanisms ran concurrently over one queue.
 * The DOCUMENTED survivor (bucketed service → `refreshAndRank`) handed the SQE the FROZEN
 * queue-time snapshot — stored volatility, stored chosen_net_ev, no geometry re-read, no
 * maker/taker re-decide — AND wrote none of those fields back, so the staleness was
 * self-perpetuating. The UNDOCUMENTED mechanism was the only one re-reading market state.
 *
 * These tests pin the STRUCTURAL guarantees of the fix (they are source-level assertions by
 * design — the runtime path needs a live queue + market caches, which the §7 staging
 * verification covers on the soak; see Langston Step-1 Q5 gate).
 *
 * The load-bearing one is `chosenNetEv`: NetEV is the BINDING admission gate (#501 fee wall),
 * so replaying a queue-time snapshot meant a signal whose net expectancy had gone NEGATIVE
 * since queueing was reconfirmed on the old number.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(process.cwd(), 'server/core/rtb/ready_to_buy_service.ts'), 'utf-8');

/** Body of the batch-refresh mechanism (the documented survivor). */
function refreshAndRankBody(): string {
  const start = SRC.indexOf('async refreshAndRank(');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  isRefreshComplete(', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('B-RTB-REFRESH-CONSOLIDATE: one shared acquisition, both mechanisms', () => {
  it('the shared acquisition method exists', () => {
    expect(SRC).toContain('private acquireRefreshedInputs(');
  });

  it('BOTH refresh mechanisms call it — identical logic, no copy-paste drift', () => {
    const calls = SRC.match(/this\.acquireRefreshedInputs\(/g) ?? [];
    expect(calls.length).toBe(2); // per-signal (retired in staging step 2) + batch survivor
  });

  it('the survivor no longer keeps its own decay/FinalScore recompute', () => {
    // It must consume the shared result, not maintain a divergent copy.
    expect(refreshAndRankBody()).toContain('_acq.refreshedFinalScore');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: the survivor is handed CURRENT state (OBJ-2)', () => {
  it('★ chosenNetEv prefers this tick re-decide over the stored snapshot (the binding gate)', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('chosenNetEv: _acq.refreshedMT?.chosenNetEV');
    // the stored value survives ONLY as the fallback (?? ), never as the primary read
    expect(body).toMatch(/chosenNetEv: _acq\.refreshedMT\?\.chosenNetEV\s*\n?\s*\?\?/);
  });

  it('volatility is the live read, not the frozen `metadata ?? 0.3` default', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('volatility: _acq.currentVol');
    expect(body).not.toContain('volatility: metadata.volatility ?? 0.3');
  });

  it('chosenEntryMode follows the same re-decide-first precedence', () => {
    expect(refreshAndRankBody()).toContain('_acq.refreshedMT?.chosenMode');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: the self-perpetuating loop is broken (OBJ-2)', () => {
  it('the survivor writes the freshness fields BACK — it never did before', () => {
    const body = refreshAndRankBody();
    // Without these the next cycle re-reads its own stale values forever.
    expect(body).toContain('netExpectedEdge: _acq.netExpectedEdge');
    expect(body).toContain('volatility: _acq.currentVol');
    expect(body).toContain('spread: _acq.currentSpread');
    expect(body).toContain('lastCostRefresh:');
  });

  it('the re-decided maker/taker snapshot is persisted (ranker + open-gate read it)', () => {
    const body = refreshAndRankBody();
    expect(body).toContain('chosenNetEv: _acq.refreshedMT.chosenNetEV.toString()');
    expect(body).toContain('chosenEntryMode: _acq.refreshedMT.chosenMode');
  });

  it('lastCostRefresh only advances when geometry ACTUALLY refreshed (throttle stays honest)', () => {
    // Advancing it unconditionally would defeat shouldRecalculateGeometry's age branch.
    expect(refreshAndRankBody()).toContain('_acq.geometryRefreshed ? Date.now() :');
  });
});

describe('B-RTB-REFRESH-CONSOLIDATE: score-timing invariant preserved (Langston B7.2b gate)', () => {
  it('decideMakerTaker runs AFTER the decayed score, so signalStrength is same-vintage', () => {
    const m = SRC.indexOf('private acquireRefreshedInputs(');
    const method = SRC.slice(m, SRC.indexOf('\n  private async refreshSingleSignal(', m));
    const scoreAt = method.indexOf('const refreshedFinalScore');
    const mtAt = method.indexOf('decideMakerTaker({');
    expect(scoreAt).toBeGreaterThan(-1);
    expect(mtAt).toBeGreaterThan(scoreAt); // order is the invariant
  });

  it('sourcePool stays the frozen at-queue value (governed exception — admission lane is history)', () => {
    expect(refreshAndRankBody()).toContain("sourcePool: (signal as any).sourcePool");
  });
});
```

## Deliberately NOT in this diff
- **Mechanism A retirement** — staging step 2, gated on your observe-before-drop condition.
- **regimeStability honest wiring** (your ruling (a)) — needs a real drift/volZ source that does not exist on the active path yet; sourcing it is its own change and belongs in step 2 alongside OBJ-2b, not bundled into a behaviour-preserving extraction. Flagging so it is not read as dropped: it is sequenced, and #514's discharge still stands.
- **OBJ-3 fail-loud + OBJ-4 exit counters** — await your #535 net-EV ruling so the netEV skip is designed ONCE (your Q4).
- **regimeWeight recompute** — the top-priority rewire alongside netEV; needs an honest current-regime source. Step 2.

## What step 2 carries
regimeWeight + regimeStability + trendStrength honest sourcing (OBJ-2b), OBJ-3, OBJ-4, then A's retirement (rule 18 delete+archive) once the §7 criterion is OBSERVED: a live row's `chosen_net_ev` + `regime_weight` changing across cycles while A is still up, and symbols-in-both dropping to 0 after.
