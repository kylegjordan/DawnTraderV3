# Batch 67 — Pre-Implementation Audit (V2 — proper SIM consultation + code-level findings)

**Author:** Claude Code, 2026-04-28
**Status:** Step 2 deliverable, second draft. V1 (`BATCH_67_PRE_AUDIT_V1_LIGHT.md`) preserved for traceability.
**Companion to:** `BATCH_67_SCOPE.md` (Step 1, Langston-approved)
**Master planning doc:** `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0

**Why V2 exists:** Kyle correctly challenged the V1 audit on 2026-04-28. V1 was lighter than CLAUDE.md §9 mandates — cited SIM consultation but did not actually open `SYSTEM_IMPACT_MAP.md`, traced call graphs from architectural reasoning rather than code, and did not read affected files end-to-end. V2 redoes the audit with: full SIM read, code-level inspection of each consumer integration point, kill-switch infrastructure investigation, and explicit identification of pre-B67 integrations the new work must coexist with.

---

## 1. Audit objectives (revised from V1)

Per CLAUDE.md §2 Step 2 and §9 SIM-discipline rules:

1. **Real SIM consultation** — read `SYSTEM_IMPACT_MAP.md` end-to-end, identify every B67-affected component, document upstream/downstream/shared-state/blast-radius from the SIM record (not from architectural intuition).
2. **Code-level inspection** — open and read each affected file's relevant section. Map actual function names, line numbers, call relationships from the source.
3. **Find existing kill switch** + daily-loss-tracking infrastructure (Kyle 2026-04-28 added context: he believed kill switch fires at 25% daily loss — verify whether and how that's wired).
4. **Identify pre-B67 integrations B67 must coexist with** — particularly Pattern Pool guardrails, B63 mode-overlay-bypass for strong-trend lane, drift dashboard infrastructure (B64a + B71), `module_constants` infrastructure (B65.1).
5. **Position sizing / EV gate / daily loss budget code paths** — actually open the files and document the integration points, not just confirm the files exist.
6. **RegimeWeight deletion file list verification** — confirm V1 list against deeper grep + SIM cross-reference.
7. **External-data feed reachability** — deferred to Step 3 first action (unchanged from V1).

---

## 2. Headline findings (executive summary, V2)

| Audit item | V1 finding | V2 update |
|---|---|---|
| **Kill switch automation** | Not investigated | **CRITICAL FINDING — kill switch is MANUAL ONLY.** `dailyLossKillSwitchPct` configured (probably 25%), but no code aggregates daily P&L and auto-trips. `tripKillSwitch()` accepts loss-percent params but is never called with them. Kyle's mental model (auto-trip at 25%) is incorrect. **This is a safety gap independent of B67.** |
| Daily loss budget service | "Not found, recommend Option B" | **Confirmed not found.** Repeated grep on `dailyPnL`, `daily_pnl`, `aggregate.*loss`. The kill switch can be tripped manually but no service tracks rolling daily loss. **Kyle directive 2026-04-28: defer to Phase 19 observation.** Consumer #6 dropped from B67.5; daily-loss-budget + kill-switch auto-trip becomes a Phase 19.X observational decision item. |
| BTC dominance | "Stub only" | Confirmed — `market-snapshot.ts:7,26`. Hardcoded `54.2`. No live integration anywhere. B67.1 fills the stub safely. |
| Position sizing service | "risk-per-trade-pct, not Kelly" | Confirmed at `paper-position-sizing.ts`. Pattern-pool guardrails already apply sourcePool-aware caps (15% pattern vs 25% quant default). B67.5 Consumer #2 must coexist with sourcePool-aware logic. |
| EV gate | "Wire-in only" | Confirmed at `expectancy.ts`. Already takes `predictiveConfidence` (PredConf, distinct from regime confidence). Consumer #3 needs design call: REPLACE predictiveConfidence vs ADD regime confidence as second input vs COMPOSE. Recommendation: ADD as second input. |
| FinalScore + RegimeWeight | "Score-calculator.ts is the formula source" | Correct on formula source. **But the actual FinalScore COMPUTATION happens in `signal-orchestrator.ts` (active path) AND `vts-runner.ts` (mirrors active path).** Two consumer sites. RegimeWeight removal touches BOTH. SIM §1.1 confirms FinalScore Kernel lives in signal-orchestrator scoring section. |
| TEC + B67.5 Consumer #5 | "Wire-in only" | **Complication discovered.** B63 added mode-overlay-bypass for `sourcePool === 'quant-strong_trend'` (vts-runner + paper-execution-engine). Strong-trend lane intentionally skips overlay multipliers. B67.5 TEC modulation must NOT override this bypass. Need to gate TEC modulation on sourcePool. |
| RankingScore (Consumer #8) | "Tiebreak with ε=0.02 confirmed" | Confirmed at `ranking-weights.ts`. RankingScore = `FinalScore × qualityWeight + ...`. Tiebreak interpretation correct. |
| Drift Dashboard | Not assessed | **Already exists** (B64a + B71). `drift-dashboard-aggregator.ts` + `analytics.tsx` Drift Dashboard tab. B67.0 ablation framework should INTEGRATE into existing infrastructure, not duplicate. |
| `module_constants` infrastructure | Not assessed | **Already exists** (B65.1). New B67 constants land cleanly via existing `module_constants` table + service. No additional infrastructure needed. |
| RegimeWeight deletion list | "V1 list complete" | Verified — V1 list of 46 server files + UI + schema + tests is complete. Adding clarification: `signal-orchestrator.ts` and `vts-runner.ts` are the two CRITICAL sites (FinalScore consumer + VTS mirror). |
| Pattern Pool guardrails | Not assessed | **Pre-B67 sourcePool-aware logic already exists.** `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR = 0.45` (vs 0.35 quant default). `MAX_POSITION_PCT = 15` for pattern (vs 25 quant default). B67.5 Consumers #1 and #2 must coexist with sourcePool-aware logic. |

**Net effect on B67 scope from V2 audit:**

1. **Consumer #6 path B (defer to B73) becomes stronger.** B73's scope now coherently bundles: (a) build daily loss budget service, (b) wire it into Consumer #6, (c) close the kill-switch auto-trip safety gap. Three deliverables, one batch.
2. **Consumer #5 needs a sourcePool gate.** TEC modulation by regime_conf must check `sourcePool !== 'quant-strong_trend'` before applying — preserve the B63 mode-overlay-bypass design.
3. **Consumer #3 needs a design decision.** Add regime_conf as second input to `getDynamicROIThreshold` rather than replacing PredConf. Recommendation captured in §6.
4. **B67.0 ablation framework integrates into existing drift dashboard infrastructure** rather than building a separate Counterfactual Comparison tab from scratch.
5. **RegimeWeight removal touches signal-orchestrator + vts-runner as PRIMARY sites** (not just score-calculator.ts as the formula source). Both must be updated in lockstep to maintain VTS-mirror parity.
6. **No additional pre-B73 work surfaced.** The other 7 consumers (1, 2, 3, 4, 5, 7, 8) all stand as wire-ins given coexistence considerations above.

---

## 3. SIM consultation (real this time)

### 3.1 Components affected by B67 — pulled from `SYSTEM_IMPACT_MAP.md`

#### Layer 1: Core Math & Scoring (CRITICAL blast-radius core)

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| FinalScore Kernel | 1.1 | **CRITICAL** | B67.5 #1 (regime conf replaces RegimeWeight) | Lives in `signal-orchestrator.ts` scoring section, formula in `score-calculator.ts`. SIM specifically calls out: "VTS Runner mirrors this logic." |
| Net Expectancy Kernel | 1.2 | **CRITICAL** | B67.5 #3 (regime conf into dynamic threshold) | Lives in `signal-orchestrator.ts` + mirrored in `paper-execution-engine.ts`. Already takes `predictiveConfidence`. |
| rankingScore | 1.5 | HIGH | B67.5 #8 (tiebreak ε=0.02) | `ranking-weights.ts`. RankingScore inherits FinalScore. Tiebreak only — no formula change. |
| Pattern Filter Profile | 1.6 | MEDIUM | B67.5 coexistence | Pattern Pool sourcePool-aware FINAL_SCORE_FLOOR (0.45) and MAX_POSITION_PCT (15%). Must coexist with B67.5 #1 and #2. |

#### Layer 4: Signal Generation & Qualification

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| Signal Orchestrator | 4.1 | **CRITICAL** | B67.5 #1, #4 | "every signal in the system flows through here". Active-path FinalScore computation. |
| Signal Quality Evaluator (SQE) | 4.2 | HIGH | B67.5 #1 | RegimeWeight ≥0.30 currently is the secondary gate. Removed by B67.5. |
| RTB Service | 4.3 | MEDIUM | B67.5 #8 | `getTopSignal()` ranks by `rankingScore`. Tiebreak addition only. |

#### Layer 5: Regime Classification

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| `calculatePairRegime()` | 5.1 | HIGH | B67.1, B67.2, B67.4 | DBS-integrated post-B62. New regime_conf modulator chain layered on top: macro × phase × outcome_feedback. |
| DBS / `directional-bias-store` | 5.1b, 5.1c | HIGH | B67.4 (consumes outcomes) | Persistent per-pair store with 5-row behavior spec. Outcome feedback uses last-N-trades per (regime, strategy). |
| MCE | 5.2.5 | HIGH | B67.1 (writes macro context), B67.2 (phase computed alongside) | Centralized indicator + regime computation. New macro feed writes here. |

#### Layer 6: Execution

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| Paper Execution Engine | 6.1 | **CRITICAL** | B67.5 #5 (TEC params at trade-open) | 1.5-second monitoring loop. Persists sourcePool. **Daily loss budget service would naturally live here as a state aggregator OR as a sibling service.** |
| Paper Position Sizing | 6.3 | HIGH | B67.5 #2 (regime conf scales riskAmount) | Pattern-pool guardrails sourcePool-aware (15% vs 25%). |
| Pre-Execution Validator / Trade Safety | 6.4 | HIGH | B67.5 #6 (CONSUMER MOVED TO B73) | Three-gate system. Daily loss budget would integrate here OR call into a new service. |
| Trailing Exit Controller | 6.5 | MEDIUM | B67.5 #5 | B63 added mode-overlay-bypass for strong-trend lane. **B67.5 #5 modulation must NOT override this bypass — must gate on sourcePool.** |

#### Layer 7: Learning & Calibration

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| VTS Runner | 7.1 | HIGH | B67.5 #1 (mirrors FinalScore), B67.5 #7 (records regime conf), B67.4 (outcomes feed) | "VTS Runner mirrors signal orchestrator scoring logic" — RegimeWeight removal must touch VTS too. |
| Telemetry Aggregator | 7.6 | MEDIUM | B67.0 (ablation telemetry) | Per-pair / per-pool tracking. B67.0 alternates table is sibling, not modifier of this. |

#### Layer 9: Infrastructure & Monitoring

| Component | SIM § | Blast | Touched by | Notes |
|---|---|---|---|---|
| GuardrailPolicy / Safety Guardrails | (B65.1+ governance, not formal SIM section) | HIGH | Kill-switch finding | `tripKillSwitch()` exists but not auto-called. Auto-trip would integrate with daily loss aggregator. |
| Drift Dashboard (B64a + B71) | 9.10 — recent additions | LOW | B67.0 (integrate, don't duplicate) | `drift-dashboard-aggregator.ts` + `analytics.tsx` tab already exist. B67 ablation panel slots into this. |
| `module_constants` (B65.1) | (recent additions block) | N/A — infrastructure | All B67 sub-deliverables consume | 5-dim keyed config. New constants land cleanly. |

### 3.2 Blast-radius rollup

- **CRITICAL** (whole-pipeline impact): FinalScore Kernel, Signal Orchestrator, Net Expectancy Kernel, Paper Execution Engine — all touched by B67.5
- **HIGH**: SQE, calculatePairRegime, MCE, VTS Runner, Paper Position Sizing, Pre-Execution Validator — all touched
- **MEDIUM**: Trailing Exit Controller, Telemetry Aggregator, RTB Service, Pattern Filter Profile (coexistence) — all touched
- **LOW**: Drift Dashboard (additive only), module_constants (additive only)

### 3.3 Cascade risks (real, not architectural-intuition)

**HIGH — RegimeWeight removal in two parallel sites must stay in lockstep.**
`signal-orchestrator.ts` is the active-trading FinalScore consumer; `vts-runner.ts` mirrors it. If the formula change lands in one and not the other, VTS WR/expectancy diverges from active-trading expectations. This is a known parity discipline (per SIM §4.1). Mitigation: TypeScript compile fails on signature mismatch since `score-calculator.ts:calculateFinalScore` signature changes when `regimeWeight` is removed from `SignalMetrics`. Both call sites surface as compile errors. Belt-and-braces: existing `finalscore-equivalence.test.ts` validates parity; update it FIRST so the test fails on the old formula, then update both consumers, then test passes.

**HIGH — TEC modulation (B67.5 #5) vs B63 mode-overlay-bypass.**
B63 explicitly bypasses NORMAL/DEFENSIVE/SURVIVAL multipliers for `sourcePool === 'quant-strong_trend'` to preserve native 4×ATR stop / 3R target geometry. If B67.5 TEC modulation runs unconditionally, regime_conf could shrink moonbag eligibility on strong-trend trades that B63 explicitly designed to keep aggressive geometry. Mitigation: gate B67.5 TEC modulation on `sourcePool !== 'quant-strong_trend'`. Strong-trend lane retains native geometry regardless of regime confidence.

**MEDIUM — Pattern Pool guardrails coexistence.**
Pattern signals already have a higher FinalScore floor (0.45 vs 0.35). If B67.5 #1 replaces RegimeWeight with regime_conf in FinalScore, the new formula may shift the pattern-pool distribution above or below 0.45 in unexpected ways. Mitigation: log pattern-pool FinalScore distribution before AND after deploy; verify pattern admission rate doesn't change >20% in either direction. If it does, recalibrate the 0.45 floor.

**MEDIUM — Macro modifier feedback loop.**
B67.4 outcome feedback uses VTS trade outcomes. If VTS uses B67.1 macro modifier, outcome feedback is partially measuring the modifier's own effect. V1 mitigation: outcome feedback uses ONLY trades where modifier was in the SAME state as the new signal. V2 confirms this is sufficient — same-state filtering breaks the circular reference.

**MEDIUM — calibration check timing depends on VTS sample volume.**
Calibration check (§8 of scope) requires ≥150 trades per confidence tertile. At current VTS rate (~100-200 trades/day across all strategies), accumulating 450+ confidence-stratified trades takes 7-10 days post-B67.1+B67.2 deploy. **B67.5 cannot ship before this window.** Captured in scope §3 dependency chain.

### 3.4 Background execution effects

- **B67.0 ablation emitter**: per signal evaluation. ~5ms. Runs alongside MCE 60s cycle.
- **External macro feed (B67.1)**: 60s poll. New process; no interruption to existing background work.
- **B67.2 phase computation**: ~2ms per pair per MCE cycle.
- **B67.0 nightly replay**: 04:00 UTC. New PM2 cron alongside existing archive jobs.
- **B67.4 outcome feedback**: synchronous to trade close path. ~3ms.
- **External feed cache**: 60s. Tied to MCE cycle for atomicity.

### 3.5 SIM updates required at Step 10

New entries:
- **B67.0** — Telemetry framework (extends existing drift dashboard, not new component)
- **B67.1** — `external-macro-feed.ts`, `macro-modifier.ts` (new)
- **B67.2** — `regime-phase.ts` (new)
- **B67.4** — `realized-outcome-feedback.ts` (new)
- **B67.5** — wire-in updates to existing components (no new files for sub-deliverables 1, 3, 4, 5, 6, 7, 8)
- **B73** (forecast) — `daily-loss-budget.ts` + kill-switch auto-trip wiring

Updates to existing entries:
- §1.1 FinalScore Kernel: regime_conf replaces RegimeWeight in formula
- §1.2 Net Expectancy Kernel: regime_conf added as second confidence input
- §4.1 Signal Orchestrator: 8 regime_conf consumers wired
- §5.1 calculatePairRegime: macro × phase × outcome_feedback chain on confidence
- §6.5 Trailing Exit Controller: regime_conf modulation gated on sourcePool

---

## 4. Code-level inspection (real file reads, not architectural intuition)

### 4.1 FinalScore + RegimeWeight (B67.5 #1 — REPLACE)

**Formula source: `server/core/utils/score-calculator.ts`**

```ts
// L41-L60
export function calculateFinalScore(metrics: SignalMetrics): number {
  const W = SCORE_WEIGHTS.FINAL_SCORE;
  const hybridScore = metrics.hybridScore ?? metrics.confidence ?? 0.5;
  const confidence = metrics.confidence ?? 0.5;
  const regimeWeight = metrics.regimeWeight ?? 0.5;       // ← TARGET FOR REMOVAL
  const decayPenalty = metrics.decayPenalty ?? 0;
  const finalScore =
    hybridScore * W.HYBRID +
    confidence * W.CONFIDENCE +
    regimeWeight * W.REGIME -                              // ← TARGET FOR REPLACEMENT
    decayPenalty * W.DECAY;
  // ...
}

// L63-L77
function calculateRegimeWeight({ trendStrength, volatility }) {
  // regimeWeight = trendScore × 0.7 + (1 − normalizedVolatility) × 0.3
}
```

Post-B67.5:
```ts
const regimeConfidence = metrics.regimeConfidence ?? 0.5;  // NEW
// ...
finalScore =
  hybridScore * W.HYBRID +
  confidence * W.CONFIDENCE +
  regimeConfidence * W.REGIME -                            // REPLACED
  decayPenalty * W.DECAY;
```

`calculateRegimeWeight()` function is deleted. `SignalMetrics.regimeWeight` field is replaced with `regimeMetrics.regimeConfidence`.

**Active-path consumer: `server/services/signal-orchestrator.ts`**
SIM §1.1: "FinalScore Kernel — `signal-orchestrator.ts` (scoring section)". This is where the active-trading FinalScore is computed and assigned. Removal site #1.

**VTS-mirror consumer: `server/services/vts-runner.ts`**
SIM §7.1: "VTS Runner — uses real market data with real scoring pipeline." Mirrors signal-orchestrator. Removal site #2.

**Both sites must update simultaneously.** TypeScript compile catches this — `SignalMetrics.regimeWeight` removal becomes a type error in both files.

**Test parity gate: `server/tests/unit/finalscore-equivalence.test.ts`**
Update FIRST so the test asserts the NEW formula. Test fails on old formula → update both consumers → test passes. Forces lockstep.

### 4.2 Net Expectancy Kernel + EV gate (B67.5 #3)

**Source: `server/core/calculations/expectancy.ts`**

```ts
// L178-L193
export function getMinROIForRegime(regime: string): number {
  // categorical regime → static ROI threshold
}

// L207-L212
export function getDynamicROIThreshold(regime: string, predictiveConfidence: number): number {
  const base = getMinROIForRegime(regime);
  const dynamicROI = base * (1 - (predictiveConfidence - 0.5) * ROI_FLEX_MULTIPLIER);
  return clamp(dynamicROI, ROI_MIN, ROI_MAX);
}

// L231-L246
export function isSignalProfitable(entryPrice, targetPrice, regime, predictiveConfidence, fee, slippage) {
  const roi = (targetPrice - entryPrice) / entryPrice;
  const dynamicROI = getDynamicROIThreshold(regime, predictiveConfidence);
  const frictionFloor = (fee * 2) + (slippage * FRICTION_SAFETY_BUFFER);
  const requiredROI = Math.max(dynamicROI, frictionFloor);
  return roi >= requiredROI;
}
```

**B67.5 #3 design call: ADD regime_conf as second confidence input.** Reasoning: PredConf and regime_conf measure different things (signal-pattern match vs regime-classification confidence). They should compose, not replace.

```ts
export function getDynamicROIThreshold(regime, predConf, regimeConf): number {
  const base = getMinROIForRegime(regime);
  // PredConf flexes (existing). regimeConf flexes too — low conf raises bar.
  const flexed = base * (1 - (predConf - 0.5) * ROI_FLEX_MULTIPLIER);
  const regimeAdjusted = flexed / Math.max(regimeConf, b67_5_ev_gate_min_confidence);
  return clamp(regimeAdjusted, ROI_MIN, ROI_MAX);
}
```

Wire-in only. No new file. New module_constant `b67_5_ev_gate_min_confidence` already in scope §9.4.

### 4.3 Position sizing (B67.5 #2)

**Source: `server/services/paper-position-sizing.ts`**

(V1 covered this — risk-per-trade-pct × portfolio / stop-distance, NOT Kelly.)

**Sourcepool-aware coexistence: `server/config/pattern-filter-profile.ts`**

```ts
PATTERN_POOL_GUARDRAILS = {
  FINAL_SCORE_FLOOR: 0.45,    // vs quant 0.35
  MAX_POSITION_PCT: 15,        // vs quant 25
};
```

B67.5 #2 wire-in:
```ts
riskAmount = portfolioValue × risk_per_trade_pct × regime_conf_multiplier
positionSize = riskAmount / stop_distance
positionNotional = positionSize × entry_price
// THEN apply sourcePool max-position cap (existing logic) on positionNotional
```

The regime_conf scales risk BEFORE sizing; sourcePool cap applies AFTER sizing. Order preserves both behaviors.

Module_constant rename in scope §9.4 confirmed: `b67_5_kelly_confidence_multiplier_floor` → `b67_5_risk_amount_confidence_multiplier_floor`.

### 4.4 Trailing Exit Controller + B63 bypass interaction (B67.5 #5)

**Sources:** `server/services/vts-runner.ts` (~L1086), `server/services/paper-execution-engine.ts` (~L2165)

SIM Recent Additions B63:
> "When `sourcePool === 'quant-strong_trend'`, NORMAL/DEFENSIVE/SURVIVAL mode-overlay multipliers are bypassed; native geometry preserved. Prevents RR destruction on strong-trend trades during SURVIVAL mode."

**B67.5 #5 wire-in pattern:**

```ts
// At trade-open in TEC initialization
if (sourcePool === 'quant-strong_trend') {
  // B63 lane bypass — skip B67.5 modulation entirely
  // Native geometry + B65.4 ladder mechanics preserved
} else {
  // B67.5 modulation: regime_conf modulates TEC parameters
  if (regimeConf < b67_5_tec_confidence_floor) {
    // Snap to most-defensive parameters (no moonbag, tight BE, no ladder)
  } else {
    // Interpolate parameters between defensive and standard
  }
}
```

**This gate was NOT documented in scope §9.2.** Adding to scope.

### 4.5 RTB tiebreak (B67.5 #8 ε=0.02)

**Source: `server/core/rtb/ready_to_buy_service.ts:1138-1166`**

```ts
const signalFinalScore = parseFloat(signal.finalScore || '0');
const signalRankingScore = (metadata?.rankingScore as number) ?? signalFinalScore;
// Phase 14.5: FinalScore gap safety rule
if (bestSignal) {
  const bestFinalScore = parseFloat(bestSignal.finalScore || '0');
  // gap > 0.10 → FinalScore wins
}
```

B67.5 #8 wire-in:
```ts
// After existing comparison logic
if (Math.abs(signalRankingScore - bestRankingScore) < b67_5_rtb_tiebreak_epsilon) {
  // Tiebreak by regime_conf
  return signalRegimeConf > bestRegimeConf ? signal : bestSignal;
}
```

Wire-in only. Module_constant in scope §9.4.

### 4.6 Kill switch infrastructure (CRITICAL FINDING)

**Source: `server/services/guardrail-policy.ts`**

```ts
public async tripKillSwitch(mode: TradingMode, reason: string, lossPercent?: number, threshold?: number): Promise<void>
```

Function signature accepts `lossPercent?` and `threshold?` — wired to receive auto-trip metadata. **Never called with these params.**

Repo-wide grep on `tripKillSwitch()` callers:
- `server/routes.ts:1807` — manual API endpoint (admin UI trigger)
- `server/services/safety-guardrails.ts:285` — manual UI toggle propagation

**No automated daily-P&L aggregator** anywhere in `server/`. Confirmed via grep on `dailyPnL`, `daily_pnl`, `aggregate.*loss`, all returning no service-level matches.

`dailyLossKillSwitchPct` field exists in `guardrails_v2` table per `guardrail-policy.ts:78`. Probably set to 25% (matches Kyle's recall). But:
- No service reads `dailyLossKillSwitchPct` and compares against current daily P&L
- No service computes current daily P&L in a rolling fashion
- No service calls `tripKillSwitch()` with `lossPercent` and `threshold` params

**Conclusion: Kyle's mental model is incorrect. The kill switch is currently a manual-only safety mechanism. The 25% threshold is configured but enforcement is not wired.**

This is an **independent safety gap**, not strictly a B67 issue — but it changes the Consumer #6 calculus. B73 should bundle:
1. Build daily-loss-budget service
2. Wire it into B67.5 Consumer #6 (regime-conf-aware loss multiplier)
3. **Wire auto-trip kill-switch when `dailyPnL / portfolioValue ≤ -dailyLossKillSwitchPct`**

Three deliverables, one batch, coherent scope.

### 4.7 RegimeWeight deletion file list (final verification)

V1 list verified against deeper grep on `regimeWeight|RegimeWeight|regime_weight` and SIM cross-reference. Confirmed complete.

**Critical sites (lockstep update required):**
- `server/services/signal-orchestrator.ts` — active-path FinalScore computation
- `server/services/vts-runner.ts` — VTS-mirror FinalScore computation
- `server/core/utils/score-calculator.ts` — formula source
- `server/core/filters/signal_quality_evaluator.ts` — `regimeWeightMin` threshold gate (REMOVE entire gate)

**Tests requiring update before consumers (per parity-discipline §3.3):**
- `server/tests/unit/finalscore-equivalence.test.ts` — UPDATE first, makes test fail on old formula
- `server/tests/unit/score-weights.test.ts` — formula constants
- `server/tests/unit/sqe-config-dynamic.test.ts` — `regimeWeightMin` removed
- `server/tests/unit/finalscore-kernel.test.ts` — kernel-level formula (per SIM §1.1 tests)

**UI sites:**
- `client/src/pages/machine-learning.tsx` — RegimeWeight column on simulated trades tables
- Diagnostics dashboard tiles
- Closed-trade detail modal

**Schema:**
- `paper_sim_trades.regime_weight` column — drop via migration `2026-XX-XX-b67-5-regimeweight-removal.sql`
- `shared/schema.ts:paperSimTrades` — remove field

**Active-trading tables:** `trades` and related — DEFERRED until paper-mode rebuild, per Kyle directive 2026-04-28.

**Final repo-wide grep (post-deletion verification):** zero hits in `server/`, `client/`, `shared/`, active `1-system-manual/` formula sections, current tests. Acceptable historical hits in: `1-system-manual/CHANGES_AND_FIXES.md`, `PHASE_HISTORY.md`, `BATCH_CATALOG.md`, archived governance, `Claude Comms and Packages/` (Telegram archives, prior batch reports), `bridge/`, `attached_assets/`, `audit/` (all archival per CLAUDE.md §4).

### 4.8 BTC dominance pre-existing logic (V1 confirmed)

Repo-wide grep on `btcDominance|btc_dominance|btcCorrelation|btc_correlation|dominanceScore`:
- `server/services/market-snapshot.ts:7` — interface field
- `server/services/market-snapshot.ts:26` — hardcoded `54.2` STUB
- `server/strategies/defensive-hedge.ts` — symbol-level only (false positive)

Confirmed: no live BTC dominance logic. Stub-only. B67.1 fills it safely.

---

## 5. Pre-B67 integrations B67 must coexist with

Documenting this explicitly because V1 didn't surface them and they're load-bearing.

### 5.1 Pattern Pool guardrails (Phase 14.5)

`PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR = 0.45` for pattern signals (vs 0.35 quant default). After B67.5 #1 (regime_conf replaces RegimeWeight in FinalScore), the formula's distribution may shift. Need to:
1. Log pattern-pool FinalScore distribution pre-deploy
2. Log post-deploy
3. If admission rate shifts >20% in either direction, recalibrate the 0.45 floor

`PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT = 15%` for pattern (vs 25% quant). B67.5 #2 (regime_conf scales riskAmount BEFORE sizing) preserves this — the sourcePool cap applies after sizing.

### 5.2 B63 mode-overlay-bypass for strong-trend lane

`vts-runner.ts:~L1086` and `paper-execution-engine.ts:~L2165` both bypass NORMAL/DEFENSIVE/SURVIVAL multipliers when `sourcePool === 'quant-strong_trend'`.

**B67.5 #5 (TEC modulation by regime_conf) MUST gate on sourcePool to preserve this bypass.** Strong-trend trades retain native geometry regardless of regime confidence. Non-strong-trend trades get B67.5 modulation.

### 5.3 Drift Dashboard infrastructure (B64a + B71)

`server/services/drift-dashboard-aggregator.ts` already aggregates: closed-trade performance, regime telemetry, store history. 4 window modes (24h, 7d, 30d, since-restart).

`client/src/pages/analytics.tsx` already has a "Drift Dashboard" tab — 5th Analytics tab.

**B67.0 ablation framework integrates here, not as a separate panel.** Add "Counterfactual Comparison" section to existing Drift Dashboard tab. Aggregator extended with `getAblationStats(window, factor)`. New API endpoint `GET /api/analytics/ablation-comparison` reads from new `regime_factor_alternates` table joined to closed-trade outcomes.

### 5.4 `module_constants` infrastructure (B65.1)

`server/services/module-constants-service.ts` provides 5-dim keyed config with most-specific-wins resolution. 60s cache. All B67's ~30 new constants land cleanly. No additional infrastructure needed.

### 5.5 Adaptive Market Response (Directive 11.7S, dormant)

`server/core/governance/strategy-modes.ts` maps RegimeStability → StrategyMode → mode-overlay multipliers. Currently dormant. Concept doc indicates future Phase 19.5 work.

**B67.1 macro modifier propagation pathway:** classifier emits modulated regime_conf → stability detector reads it (regime_conf low ⇒ less stable) → mode-overlay (Directive 11.7S) reads stability → DEFENSIVE multipliers activate → throttles entries.

Per scope §6.7 fallback: macro feed unreachable → modifier = 1.0 → existing pre-B67 behavior preserved.

---

## 6. Scope changes from V2 audit

### 6.1 Adjust Consumer #5 (TEC modulation) — add sourcePool gate

Update scope §9.2 row 5:

> **(BEFORE)** TEC parameters at trade-open: Modulated by regime_conf at entry — BE-lock distance, moonbag eligibility, ladder rung-floor buffer
>
> **(AFTER)** TEC parameters at trade-open: For non-strong-trend trades, modulated by regime_conf at entry — BE-lock distance, moonbag eligibility, ladder rung-floor buffer. Strong-trend lane (`sourcePool === 'quant-strong_trend'`) retains B63 mode-overlay-bypass and native geometry regardless of regime confidence.

### 6.2 Sharpen Consumer #3 (EV gate) — composition pattern

Update scope §9.2 row 3:

> Required EV: `getDynamicROIThreshold(regime, predConf, regimeConf)` — adds `regimeConf` as second confidence input. Existing PredConf flex preserved; regime_conf adds inverse-scaling on top. Replacement vs composition decided in favor of composition.

### 6.3 Pattern Pool floor recalibration check

Add to scope §12 (pre-registered success thresholds):

| Metric | Threshold | Response |
|---|---|---|
| Pattern-pool FinalScore admission rate post-B67.5 #1 | Within ±20% of pre-B67 baseline | If outside, recalibrate `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` (currently 0.45) |

### 6.4 B67.0 ablation = drift dashboard extension, not new panel

Update scope §4.1, §4.5 to reference `drift-dashboard-aggregator.ts` extension rather than a new Counterfactual Comparison panel. Reduces UI build effort.

### 6.5 Consumer #6 + kill-switch auto-trip deferred to Phase 19 observation (Kyle directive 2026-04-28)

**Resolution:** Consumer #6 dropped from B67.5 entirely. Daily-loss-budget service + kill-switch auto-trip wiring become a **Phase 19 observational decision item.** During the 1-2 week paper-mode active-trading observation window (Phase 19.1), monitor whether daily-loss-budget protection would have caught real loss patterns. If observation supports building it, the resulting batch builds:

1. `server/services/daily-loss-budget.ts` — rolling 24h aggregator with budget consumption logic
2. **Consumer of regime confidence** — low-confidence-trade losses get cost multiplier (the original B67.5 Consumer #6 design, now landing post-Phase-19)
3. Kill-switch auto-trip wiring — closes the safety gap discovered in V2 audit §4.6

This way, the decision to build the service is data-driven (does observation show it would have helped?) rather than speculative pre-launch.

**Independent safety-gap flag:** the kill-switch auto-trip gap exists today (config threshold `dailyLossKillSwitchPct` set, no enforcement code). This is documented for Kyle's awareness but does not gate B67. If observation indicates the gap is material before Phase 19 completes, can be addressed as a hotfix.

**B67.5 reverts to 7 consumers** (was 8): #1 FinalScore, #2 Position sizing, #3 EV gate, #4 Routing tiebreak, #5 TEC params, #7 VTS feature column, #8 RTB tiebreak. Numbering preserved for traceability — gap at #6 indicates Phase-19-deferred item.

### 6.6 Module_constants rename (V1 unchanged)

`b67_5_kelly_confidence_multiplier_floor` → `b67_5_risk_amount_confidence_multiplier_floor`.

---

## 7. Pre-registered success thresholds (updated)

Per V1 §12 + V2 additions:

| Metric | Threshold | Response if not met |
|---|---|---|
| Hostile-day WR (system-wide WR < 25% days) | +5pp WR vs pre-B67 baseline | Tune B67.1 modifier weights, re-evaluate at 60 days |
| Calibration check pass | tertile-monotonic + ≥7pp HIGH−LOW gap | If fails twice (60 days total), recalibrate B67.4 alpha and lookback |
| Per-underlying limit cohort delta (B67.3 A/B) | Limited cohort net-expectancy ≥ Unlimited cohort net-expectancy | If reversed, deactivate B67.3 limit, escalate to Kyle |
| Counterfactual ablation: macro modifier | Real WR > "macro disabled" WR by ≥3pp | Tune weights at 30 days, deactivate at 60 days if no improvement |
| Counterfactual ablation: phase dimension | Real WR > "phase disabled" WR by ≥2pp | Tune phase boundaries 2h/12h, deactivate at 60 days if no improvement |
| RTB tiebreak (Consumer #8) | Tiebreak-affected trades show ≥1pp WR lift over insertion-order baseline | Adjust ε or deactivate |
| **Pattern-pool admission rate post-B67.5 #1 (NEW)** | Within ±20% of pre-B67 baseline | Recalibrate PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR |

Composite failure clause (Langston Step-1 review): if 3+ metrics fail simultaneously, escalate to Kyle for scope-level decision (continue vs revert).

---

## 8. External-data feed reachability (unchanged from V1)

Test in Step 3 first action: SSH to Hetzner, curl CoinGecko/Binance/Coinglass, verify 200 + valid JSON. Document rate limits. Public APIs, no IP allowlist expected.

---

## 9. V2 conclusions

### 9.1 Scope changes identified (deltas vs V1)

1. **Consumer #5 sourcePool gate added** — preserves B63 mode-overlay-bypass.
2. **Consumer #3 composition pattern formalized** — ADD regime_conf, don't REPLACE PredConf.
3. **B67.0 integrates with drift dashboard** rather than new panel.
4. **Pattern-pool admission rate** added to success thresholds.
5. **B73 scope expands** to cover kill-switch auto-trip closure (additional safety value, same effort estimate).
6. **Kill switch auto-trip is a pre-existing safety gap** — surfaced for Kyle's awareness independent of B67.

### 9.2 Risks logged (real, code-grounded)

- RegimeWeight removal lockstep across signal-orchestrator + vts-runner + score-calculator (TypeScript compile is the safety net; parity test is the belt-and-braces)
- TEC modulation vs B63 mode-overlay-bypass (sourcePool gate is the mitigation)
- Pattern-pool admission shift post-formula change (logged + recalibration trigger)
- Calibration check timing depends on VTS sample volume (~7-10 days post-deploy for 450+ trades)
- Macro modifier ↔ B67.4 outcome feedback circular reference (same-state filtering breaks loop)

### 9.3 Coexistence requirements documented (V2 addition)

- Pattern Pool guardrails (sourcePool-aware FinalScore floor + max position) — Consumer #1 and #2
- B63 mode-overlay-bypass for strong-trend lane — Consumer #5
- Drift Dashboard infrastructure — B67.0 telemetry framework
- `module_constants` infrastructure — all sub-deliverables

### 9.4 Ready for Step 3?

After Kyle's Option A/B decision on Consumer #6 (recommend B with B73 expanded scope), and Langston re-review of V2, Step-3 implementation can begin.

Internal sequence per scope §3 dependency chain (unchanged):

```
B67.0 telemetry → B67.3 limits → B67.1 + B67.2 → 14-day observation → calibration check → B67.5 → B67.4
```

---

## 10. Cross-references

- `Claude Comms and Packages/Scope Files/BATCH_67_SCOPE.md` — Step-1 scope (Langston-approved, 4 V2 deltas pending application)
- `Claude Comms and Packages/Scope Files/BATCH_67_PRE_AUDIT_V1_LIGHT.md` — preserved V1 for traceability
- `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — master planning doc
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — SIM (consulted in §3 above)
- `1-system-manual/SYSTEM_MANUAL.md` — formula docs (consulted via SIM cross-references)

---

*End of `BATCH_67_PRE_AUDIT.md` V2 draft. V1 preserved at `BATCH_67_PRE_AUDIT_V1_LIGHT.md`. Awaiting Kyle decision on Consumer #6 / B73 path and Langston re-review.*
