# DawnTrader: Changes, Fixes & Improvements Registry

> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-15
> **Purpose**: Tracks all bugs, architectural issues, inefficiencies, and recommended changes discovered during the systematic repository audit. Each item includes severity, location, verification status, and recommended timing (pre-MCE vs during-MCE vs post-MCE).
> **This is NOT the System Manual.** This is the action registry.

---

## How This Document Is Used

- Items are added during each audit phase
- Each item is verified against source code before inclusion
- Kyle reviews and prioritizes items
- ChatGPT / Replit can be consulted for second opinions
- Items marked "during-MCE" should be bundled into MCE directives
- Items marked "pre-MCE" are standalone fixes that should happen first

---

## Severity Levels

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Produces incorrect results in the active trading path. Must fix. |
| **HIGH** | Significant architectural issue that will cause problems at scale or during integration. |
| **MEDIUM** | Inefficiency, duplication, or maintainability issue. Fix during related work. |
| **LOW** | Minor issue, cosmetic, or optimization opportunity. |

---

## BUGS

### BUG-001: VTS Signal Generation Is Generic
- **Severity**: CRITICAL
- **Location**: `server/services/vts-runner.ts` — `simulateHybridScore()`, `simulateDecayPenalty()`
- **Problem**: Generates random regime-adjusted scores instead of real strategy-specific calculations
- **Impact**: VTS learns from statistically meaningless data
- **Verified**: Yes (prior audit)
- **Timing**: During MCE (MCE-5 phase)
- **Fix**: Wire VTS to real Strategy Engine or MCE-provided indicators
- **Phase Found**: Pre-audit (v1.0)

### BUG-002: Active Trading Path Uses Legacy DSS Regime Model
- **Severity**: CRITICAL
- **Location**: `server/services/dynamic-strategy-selector.ts`
- **Problem**: Uses `SYSTEM_GUARDS.STRATEGY_MAP` (6 regimes, 9 quant) instead of canonical map (5 regimes, 17 strategies)
- **Impact**: 8 of 17 canonical strategies unreachable
- **Verified**: Yes
- **Timing**: During MCE (MCE-4 phase)
- **Fix**: Replace DSS with canonical regime classification + canonical map lookup
- **Phase Found**: Pre-audit (v1.0)

### BUG-003: Signal Orchestrator Legacy Strategy Map
- **Severity**: CRITICAL
- **Location**: `signal-orchestrator.ts` — `getRegimeAllowedStrategies()`
- **Problem**: Reads from `SYSTEM_GUARDS.STRATEGY_MAP`, complementary layer to DSS both using legacy source
- **Verified**: Yes
- **Timing**: During MCE (MCE-3 phase)
- **Fix**: Replace with canonical map lookup
- **Phase Found**: Pre-audit (v1.0)

### BUG-004: DI Probability Divergence — NGC Masquerading as Directional Integrity — **RESOLVED**
- **Severity**: CRITICAL
- **Location**: `signal-orchestrator.ts` line 1127 (was line 1128)
- **Code**: `const DI = calculateDirectionalIntegrity(closePrices);`
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1, commit `ea6551af` (2026-02-22)
- **Resolution**: Replaced `DI = normalizedConf * 100` with `calculateDirectionalIntegrity(closePrices)` — geometric DI from OHLC close prices already in scope. DSS path and Expectancy Gate path now use the same DI source.
- **Original Problem**: The DSS kernel call converted NGC (blended confidence score) into a fake DI value. The kernel uses DI to compute `Pwin = 0.40 + DI/200`. Pwin was driven by blended confidence, NOT by price path geometry as designed.
- **Verified**: Yes — code-confirmed 2026-02-15, corroborated by ChatGPT grounded review
- **Phase Found**: Phase 1 (ChatGPT review)

### BUG-005: cost-model.ts getCostMetricsCache() Returns Empty Map
- **Severity**: LOW
- **Location**: `server/core/math/cost-model.ts` — `getCostMetricsCache()`
- **Problem**: Calls `getCacheStats()` but then ignores the result and returns `new Map()` unconditionally
- **Impact**: Does not affect runtime cost calculations. Breaks cache introspection/diagnostics only.
- **Verified**: Yes
- **Timing**: During MCE or anytime (trivial fix)
- **Fix**: Return actual cache contents from cost-cache.ts
- **Phase Found**: Phase 1

---

## ARCHITECTURAL RISKS

### RISK-001: VTS/Active Trading Regime Math Drift
- **Severity**: HIGH → **CRITICAL** (upgraded: now understood as part of 4-engine regime fragmentation, see BUG-008)
- **Location**: VTS uses `market-regime.ts` `calculatePairRegime()` (Engine #2), active trading uses DSS `volNoise/trendSlope` (Engine #1)
- **Impact**: Same pair gets different regimes depending on code path. VTS ML calibration is computed against a different regime model than production. All VTS predictions are suspect.
- **Timing**: Pre-MCE via BUG-006/BUG-008 fix (unified regime call)
- **Phase Found**: Pre-audit, deepened Phase 2 (ChatGPT/Replit analysis)

### RISK-002: OHLC Indicator Computation Duplication
- **Severity**: MEDIUM
- **Location**: VWAP, SMA computed independently in signal-orchestrator.ts AND strategy-engine.ts
- **Impact**: Wasted computation, potential for divergence
- **Timing**: During MCE (MCE-1)
- **Phase Found**: Pre-audit

### RISK-003: DSS Gating Prevents PATTERN and HYBRID Strategies
- **Severity**: HIGH
- **Location**: DSS limits to 9 quant strategies, blocking pattern-recognizer.ts and hybrid-integration.ts
- **Timing**: During MCE (MCE-4)
- **Phase Found**: Pre-audit

### RISK-004: Strategy Key Mismatch
- **Severity**: MEDIUM
- **Location**: Canonical map uses `range_trade`, strategy engine uses `range_trading`
- **Timing**: During MCE
- **Phase Found**: Pre-audit

### RISK-005: HybridScore Falls Back to Confidence
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 498
- **Impact**: Effective FinalScore for QUANT signals is 0.7 × confidence + 0.1 (regime absent)
- **Timing**: During MCE (PAD-001)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-006: RegimeWeight Defaults to 0.5
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 499
- **Impact**: Regime classification has no influence on signal ranking
- **Timing**: During MCE (PAD-002)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-007: Confidence Scale Inconsistency
- **Severity**: MEDIUM
- **Location**: Strategy engine outputs 0-1, some validation checks expect 0-100
- **Timing**: During MCE (PAD-003)
- **Phase Found**: Pre-audit

### RISK-008: Engine Not Integration-Tested Since Phase 8
- **Severity**: HIGH
- **Location**: System-wide
- **Impact**: Runtime errors expected on first reactivation
- **Timing**: Pre-live
- **Phase Found**: Pre-audit

### RISK-009: Dual Friction Models in Signal Orchestrator — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.2, Batch 2 (2026-02-22), commit `8393a1ef`
- **Severity**: HIGH
- **Location**: `signal-orchestrator.ts` lines 557 and 1122 (pre-fix)
- **Problem**: Two different friction calculations in the same file:
  - Line 557: `computeTotalRoundTripCost(fee, slippage, spread)` from cost-model.ts — **CORRECT**
  - Line 1122: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` flat percentage — **INCORRECT**
- **Resolution**: All `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` friction consumers replaced with `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` from cost-model.ts:
  - signal-orchestrator.ts DSS evaluation loop (line ~1122) — now uses per-pair cost metrics
  - signal-orchestrator.ts DSS_TRADE_SNAPSHOT capture (line ~1165) — now uses per-pair cost metrics
  - expectancy.ts `evaluateTradeExpectancy()` (line ~520) — now calls cost-model directly instead of `calculateFriction()`
  - analysis-utils.ts `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` — marked `@deprecated`, zero runtime callers
- **Impact of fix**: The old code underestimated friction by 72× (0.01% vs 0.72% for default cost metrics). The DSS NetEV gate now correctly accounts for real trading costs.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed)

### RISK-010: Rolling Normalization Is Legacy Infrastructure
- **Severity**: MEDIUM
- **Location**: `quality_index.ts` — RollingNormalizer class (lines 108-205), 3 instances (lines 207-209)
- **Problem**: Since NGC is legacy (Kyle-confirmed), the rolling normalization infrastructure serving NGC is also legacy. Three RollingNormalizer instances exist (NGC, ProfitRate, ExpectedReturn) with 500-sample/60-minute sliding windows. The smoothing factor is driven by VTS learning parameters via adaptive relevance — unnecessary coupling.
- **Impact**: Stateful normalization introduces temporal drift, distribution compression, and reproducibility challenges. Same raw inputs produce different normalized outputs at different times. Backtesting cannot match forward testing.
- **Timing**: During MCE — remove alongside NGC replacement. If ProfitRate/ExpectedReturn normalization is still needed, use deterministic fixed boundaries instead.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed as legacy)

---

## UNIFICATION RECOMMENDATIONS

### UNIFY-001: Friction Model Consolidation — **PARTIALLY RESOLVED**
- **Status**: **PARTIALLY RESOLVED** — Directive 12.1.2, Batch 2 (2026-02-22)
- **Current State**: `cost-model.ts` is now the canonical friction provider for all runtime friction calculations:
  - ✅ `calculateFriction()` deprecated in analysis-utils.ts (zero runtime callers)
  - ✅ `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` removed from signal-orchestrator.ts friction paths
  - ✅ `computeTotalRoundTripCost()` used in signal-orchestrator.ts DSS evaluation and expectancy.ts
  - ⬜ `cost-metrics.updateCostData()` costFactor calculation for sizing — not yet addressed (separate concern)
  - ⬜ `calculateFriction()` functions still exist as deprecated code — physical removal deferred to Wave 4 (Directive 12.2.5: Friction Model Unification)
- **Remaining work**: Remove deprecated friction functions and `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` constant (if no non-friction consumers remain) during dead code purge
- **Phase Found**: Phase 1

### UNIFY-002: Confidence Authority Consolidation (NGC Is Legacy — Kyle Confirmed)
- **Current State**: NGC is a legacy metric that was not fully removed. Kyle confirmed: "Anywhere where we have NGC in the code is a mistake. NGC is not a calculation that we want to be using anymore." Despite this, NGC still flows through as the confidence carrier in the active pipeline.
  - **NGC** (Phase 8.8): Blended from base confidence, volatility, risk, profitRate via rolling normalization. Stateful, adaptive. **LEGACY — should not be active.**
  - **PredictiveConfidence** (Phase 11): Planned as sole confidence authority. Deterministic. **TARGET state.**
- **Recommendation**: PredictiveConfidence becomes the sole confidence signal. Remove:
  - `quality_index.ts` NGC computation and all rolling normalization
  - AdaptiveRelevance linkage to VTS
  - NGC as confidence carrier in signal-orchestrator.ts (line 497)
  - NGC-to-DI conversion (BUG-004, line 1128)
  - Exported but unused SQE thresholds (MIN_NGC, MIN_CWQI, MAX_RISK, MIN_PROFIT_RATE)
- **Timing**: During MCE — this is a core architectural change
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

### UNIFY-003: DI Source Consolidation — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1 (2026-02-22)
- **Resolution**: NGC-derived DI path eliminated. Signal orchestrator now uses `calculateDirectionalIntegrity(closePrices)` — the same geometric function used by the Expectancy Gate. All DI inputs to the kernel now come from geometric calculation.
- **Original State**: Two DI sources feeding the same kernel:
  - Geometric DI: `calculateDirectionalIntegrity(prices)` — correct, from price data
  - NGC-derived DI: `normalizedConf * 100` — incorrect repurposing of confidence as DI
- **Phase Found**: Phase 1

---

## PHASE 2 FINDINGS

### RISK-011: Strategy Signal Audit Engine Uses Stale Metric Definitions
- **Severity**: MEDIUM
- **Location**: `server/services/strategy-signal-audit-engine.ts`
- **Problem**: Recomputes NGC, CWQI, and DI using simplified formulas that do not match actual pipeline computations. CWQI in audit = `0.4×confidence + 0.3×volatility + 0.2×pnl + 0.1×age`, but actual quality_index.ts CWQI uses multi-factor blend with rolling normalization. Mismatch detection is therefore unreliable.
- **Impact**: Audit reports may flag false mismatches or miss real ones. Since NGC is legacy (Kyle-confirmed), the entire audit engine's purpose is questionable.
- **Timing**: During MCE — remove or rebuild to validate PredictiveConfidence instead
- **Phase Found**: Phase 2

### RISK-012: Static Confidence Values Reduce FinalScore Discrimination
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts` (all 8 strategies)
- **Problem**: 7 of 9 strategies return hardcoded confidence (0.65–0.75). Only VWAP Pullback (0.7–0.9) and DHMA (dynamic 0.1–0.95) produce variable confidence. Since FinalScore uses confidence at 30% weight, invariant confidence inputs reduce FinalScore's ability to distinguish signal quality.
- **Impact**: FinalScore rankings between strategies are dominated by HybridScore and RegimeWeight rather than signal-specific confidence.
- **Timing**: Post-MCE enhancement — make confidence dynamic based on signal quality indicators
- **Phase Found**: Phase 2

### RISK-013: Oversimplified Bullish Reversal Detection
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts`, `detectBullishReversal()` method
- **Problem**: Volume check is `volume > 0` — trivially true for any non-zero volume. Reversal detection is effectively just "price within 2% of 24h low" with no volume comparison.
- **Impact**: Affects VWAP Pullback and Mean Reversion entry quality — may trigger on noise.
- **Timing**: Pre-MCE candidate (simple fix: compare volume to 1.5× average)
- **Phase Found**: Phase 2

### BUG-006: DSS Uses Legacy SYSTEM_GUARDS.STRATEGY_MAP Instead of Canonical Map
- **Severity**: CRITICAL
- **Location**: `server/services/dynamic-strategy-selector.ts` (line 180)
- **Problem**: DSS imports `SYSTEM_GUARDS.STRATEGY_MAP` — a legacy 6-regime / 9-quant-only map. The canonical source of truth (`server/config/canonical-regime-strategy-map.ts`, Directive 11.7F) defines 5 regimes and 17 strategies (9 quant + 3 pattern + 5 hybrid) but is NOT wired to DSS runtime.
- **Consequences**:
  - Pattern strategies (morning_star, support_bounce, inside_bar_reversal) are never generated
  - Hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) are never generated
  - Only QUANT signals flow through the trading pipeline
  - Regime classification uses wrong model (6 legacy regimes vs 5 canonical)
  - Per-regime riskMultiplier and minConfidence from canonical map are not applied
- **Fix**: Rewire DSS to use `calculatePairRegime()` + canonical map:
  1. **Call `calculatePairRegime()` from `market-regime.ts`** for regime classification — same function VTS uses, unifying regime models
  2. Replace `SYSTEM_GUARDS.STRATEGY_MAP` import with `CANONICAL_REGIME_STRATEGY_MAP`
  3. Use `selectContextAwareStrategy()` for pattern-aware routing
  4. Apply canonical `riskMultiplier` and `minConfidence` per regime
  5. Remove EXTREME_NOISE as a regime
  6. Resolve regime authority (BUG-008) first — ensure MCP/ARE scope is formally decoupled
- **Timing**: Pre-MCE — foundational routing fix. Signal Orchestrator can call `calculatePairRegime()` directly without waiting for MCE.
- **Kyle-confirmed**: 2026-02-16
- **Phase Found**: Phase 2

### BUG-007: Hybrid Strategy Types in hybrid-integration.ts Are Legacy
- **Severity**: HIGH
- **Location**: `server/services/hybrid-integration.ts`, `selectHybridStrategy()` method
- **Problem**: Maps to legacy types (H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK) that don't exist in the canonical map. The canonical hybrids are: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge.
- **Fix**: Replace `selectHybridStrategy()` with canonical hybrid selection logic from `canonical-regime-strategy-map.ts`
- **Timing**: Concurrent with BUG-006
- **Phase Found**: Phase 2

### RISK-014: Strategy Sync Only Covers 8 Quant Strategies
- **Severity**: MEDIUM
- **Location**: `server/services/strategy-sync.ts`, CORE_STRATEGIES array
- **Problem**: CORE_STRATEGIES only includes 8 quant strategies. When canonical map is wired, sync must include all 17 strategies (9 quant + 3 pattern + 5 hybrid).
- **Fix**: Update CORE_STRATEGIES to match `getAllCanonicalStrategies()` from canonical map
- **Timing**: Concurrent with BUG-006
- **Phase Found**: Phase 2

### RISK-015: Strategy Key Mismatch: `range_trading` vs `range_trade`
- **Severity**: LOW
- **Location**: strategy-engine.ts uses `range_trading`, canonical map uses `range_trade`
- **Problem**: Key mismatch could cause routing failures when canonical map is wired
- **Fix**: Reconcile naming to a single key
- **Timing**: Concurrent with BUG-006
- **Phase Found**: Phase 2

### BUG-008: Four Parallel Regime Classification Systems With No Cross-Reference
- **Severity**: CRITICAL
- **Locations**:
  - Engine 1: `server/services/dynamic-strategy-selector.ts` — DSS legacy (volNoise/trendSlope → 6 regimes → SYSTEM_GUARDS.STRATEGY_MAP). **Active trading path. LEGACY.**
  - Engine 2: `server/core/metrics/market-regime.ts` — `calculatePairRegime()` (OHLC → volatility/momentum/ADX → 5 canonical regimes). **VTS only. CANONICAL CANDIDATE.**
  - Engine 3: `server/core/metrics/market-regime.ts` — `getNormalizedRegime()` (Z-Score normalized version of Engine 2). **Advisory only. PRESERVE FOR ML.**
  - Engine 4: `server/services/market-profiler.ts` + `server/services/adaptive-regime.ts` — MCP/ARE (live price/volume → T1/T2/R1/V1/C1 regimes). **14+ services. LEGACY — Kyle confirmed (see below).**
- **Problem**: Four independent regime systems, three naming conventions, zero cross-referencing. VTS learns from Engine #2 while active trading uses Engine #1 — ML calibration from VTS data is suspect. Engine #4 has its own hardcoded strategy mix matrix that doesn't reference the canonical map.
- **Impact**: The system cannot agree on what market conditions it's trading in. Trade-level and portfolio-level decisions are made on completely different regime classifications.
- **Verified**: Yes — code-confirmed 2026-02-16. ChatGPT/Replit identified Engines 1-3; Claude Code identified Engine 4 (MCP/ARE).
- **Kyle Decision (2026-02-16)**: MCP/ARE (Engine #4) is LEGACY. It was the predecessor regime system built under Directive 8.8.4-L12 (Dec 27, 2025). When the canonical regime map (Directive 11.7F, Jan 2026) and DSS were built to replace it, MCP/ARE was never decommissioned — the LOCK designation made it invisible during architectural evolution. Kyle confirmed it was never the intention to have two systems creating signals and making adjustments to signal generation. MCP/ARE must be removed.
- **Fix**:
  1. Engine #2 (`calculatePairRegime`) → sole pair-level regime authority (replaces Engine #1)
  2. Engine #3 (Z-Score) → preserved as ML advisory for Phase 12
  3. Engine #1 (DSS legacy) → remove (Wave 2, pre-MCE)
  4. Engine #4 (MCP/ARE) → remove entirely (during/after MCE, see Wave 6). 14+ consumer services must be migrated to consume `calculatePairRegime()` output or MCE output.
- **Timing**: Pre-MCE for Engines 1 & 2 (BUG-006). During/after MCE for Engine 4 removal (Wave 6).
- **Phase Found**: Phase 2 (ChatGPT/Replit review + Claude Code deep trace, Kyle-confirmed legacy 2026-02-16)

### RISK-016: MCP/ARE Legacy System Creates Parallel Strategy Authority (Kyle Confirmed Legacy)
- **Severity**: HIGH
- **Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
- **Problem**: MCP/ARE operates as a parallel regime-to-strategy system with its own taxonomy (T1-C1), its own strategy mix matrix (`REGIME_STRATEGY_MATRIX`), and its own exposure/risk multipliers — all independent of the canonical map. This creates cross-layer incoherence where three independent authorities influence strategy selection with no cross-reference.
- **Kyle Decision (2026-02-16)**: MCP/ARE is LEGACY. It was the predecessor regime system that was never decommissioned when canonical map and DSS were built to replace it. It must be removed entirely.
- **Fix**: Remove MCP/ARE entirely. Migrate 14+ consumer services to use `calculatePairRegime()` output or MCE output. Any portfolio-level exposure/risk modulation that was provided by MCP/ARE must be absorbed by MCE.
- **Timing**: During/after MCE (Wave 6) — requires full consumer migration
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT verification, Kyle-confirmed legacy 2026-02-16)

### RISK-017: Bridge JSON Staleness Risk
- **Severity**: MEDIUM
- **Location**: `bridge/canonical/mapping-regime-strategy.json`, `server/core/strategy-mapper.ts`, `server/scripts/sync-canonical-bridge.ts`
- **Problem**: Bridge JSON is generated by sync script from canonical TS map. No automated staleness check — if TS is updated without re-running sync, `strategy-mapper.ts` serves stale data at runtime.
- **Fix**: Add hash/version comparison at startup, or have `strategy-mapper.ts` import directly from TS instead of JSON.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### RISK-018: Drift Detector Has No Calibration Baselines for Pattern/Hybrid Strategies
- **Severity**: MEDIUM
- **Location**: `server/services/drift-detector.ts`
- **Problem**: Monitors α/β/σ drift per strategy with 10-snapshot rolling window. When 8 new strategies (3 pattern + 5 hybrid) are activated via canonical wiring, drift detector has no historical baselines. First check will either error, skip, or falsely report drift.
- **Fix**: Initialize baseline snapshots during canonical wiring deployment. Consider warm-up period where drift detection is advisory-only for new strategies.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### RISK-019: MCP Uses Stubbed Metrics for Regime Classification (Legacy System)
- **Severity**: HIGH (additional evidence MCP is legacy)
- **Location**: `server/services/market-profiler.ts`, `classifyRegime()` method
- **Problem**: Two of five `RegimeMetrics` inputs are never actually computed from market data:
  - `volume_z` = hardcoded `0` (volume z-score — should measure unusual volume activity)
  - `correlation` = hardcoded `0.5` (cross-asset correlation — should measure BTC/altcoin correlation dynamics)
  These stubbed values feed into MCP's regime classification scoring, creating false regime confidence. This further confirms MCP was never fully completed — it was locked before implementation was finished.
- **Impact**: 14+ services downstream of MCP receive regime classifications with false precision.
- **Fix**: Remove MCP/ARE entirely (Kyle-confirmed legacy). Do NOT invest in fixing stubbed metrics for a system being removed.
- **Timing**: During Wave 6 (MCP/ARE removal)
- **Phase Found**: Phase 2 (ChatGPT verification, Claude Code confirmed)

### RISK-020: MCP/ARE Is Legacy Predecessor System, Never Decommissioned (Kyle Confirmed)
- **Severity**: HIGH
- **Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
- **Historical Context**: MCP/ARE was built Dec 27, 2025 under Directive 8.8.4-L12 as the original regime-to-strategy system. It was immediately LOCKED. Starting Jan 2026, the canonical regime map (Directive 11.7F) and DSS were built as replacement systems. Each new system was designed in isolation — neither acknowledged MCP/ARE's existence. MCP/ARE was left running in the background, feeding T1/T2/R1/V1/C1 classifications to 14+ services, while newer systems were built alongside it without coordination. The LOCK designation made it invisible during architectural discussions.
- **Problem**: MCP/ARE continues to run on a 15-minute timer, computing regime classifications with stubbed metrics (RISK-019), applying strategy weights via its own matrix, and feeding exposure/risk multipliers to 14+ services — all independent of and unaligned with the canonical system that was meant to replace it.
- **Kyle Decision (2026-02-16)**: MCP/ARE is LEGACY. Kyle confirmed it was never the intention to have two systems creating signals and making adjustments to signal generation. The canonical map and DSS were built to replace MCP/ARE. MCP/ARE must be removed entirely.
- **Fix**: Full removal. 14+ consumer services must be migrated to consume `calculatePairRegime()` output or MCE output. Any portfolio-level exposure/risk modulation currently provided by MCP/ARE must be absorbed by MCE or rebuilt as a lightweight module that consumes canonical regime output.
- **Timing**: During/after MCE (Wave 6) — DANGEROUS due to 14+ active importers requiring migration
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT/Replit verification, Kyle-confirmed legacy 2026-02-16)

---

## PHASE 3 FINDINGS

### BUG-009: Two Parallel Scanning Systems Running Simultaneously
- **Severity**: CRITICAL
- **Locations**:
  - `server/services/market-scanner.ts` — `MarketScanner` class (lines 385-1013)
  - `server/routes.ts` — line 87: `const marketScanner = new MarketScanner();` (instantiated at boot)
  - `server/routes.ts` — line 371: `marketScanner.startHourlyScanning()` (actively started)
  - `server/startup.ts` — lines 36, 57: Listed as core initialized service
- **Problem**: DawnTrader runs TWO independent scanning systems simultaneously:
  1. **FX5 Scanner** (30s cycles): `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator. Modern, adaptive, telemetry-driven.
  2. **MarketScanner class** (10-min cycles): Kraken OHLC → direct StrategyEngine → database signal storage. Legacy, per-user watchlists, 8 quant strategies only.
- **Impact**:
  - Double Kraken API load (both scanners call getTicker, getOHLCData independently)
  - Conflicting signal generation through completely different pipelines with no deconfliction
  - Conflicting cleanup operations (MarketScanner has its own expire/clean/archive routines)
  - Wasted computation (10-min scanner evaluates pairs FX5 already evaluates every 30s with better filtering)
- **Verified**: Yes — code-confirmed 2026-02-16. Initial Phase 3 audit incorrectly stated MarketScanner was "believed to be disconnected." ChatGPT flagged this assumption; grep verification proved it is actively instantiated and started in production boot sequence.
- **Fix**: Stop instantiating MarketScanner class in `server/routes.ts`. Remove `startHourlyScanning()` call. Remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file must NOT be removed.
- **Timing**: Pre-MCE — standalone fix, zero dependencies on MCE
- **Phase Found**: Phase 3 (ChatGPT review correction)

### RISK-021: Volume Bucket Threshold Inconsistency Between Modules
- **Severity**: LOW-MEDIUM (LOW today if buckets are never cross-compared; MEDIUM if risk guardrails, position sizing, UI dashboards, drift detector, or ML features ever reference bucket labels)
- **Locations**:
  - `server/services/active-filter-pool.ts` — `getSymbolVolumeInfo()`: High > $50M, Medium ≥ $10M, Low ≥ $1M, Very Low < $1M
  - `server/services/market-volume-cache.ts` — `classifyVolume()`: High ≥ $5M, Medium ≥ $500K, Low ≥ $50K, Very Low < $50K
- **Problem**: Two different volume bucketing schemes. A pair classified as "High" by market-volume-cache ($5M+) would be "Low" by Active Filter Pool ($50M+ required).
- **Fix**: Consolidate to a single volume bucketing function with explicit scope parameters, OR document that these serve intentionally different scopes.
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-022: adaptive-pool-config.ts Name Misleads About Its Purpose
- **Severity**: LOW
- **Location**: `server/services/adaptive-pool-config.ts`
- **Problem**: File name suggests scanning pool configuration. Actual content is ACT (Adaptive Concurrency Tuner) — controls concurrent signal processing slots (MIN=3, MAX=10), completely unrelated to scanning. Actual scanning pool config is in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`.
- **Fix**: Rename to `act-concurrency-config.ts` or `signal-processing-pool-config.ts`
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-023: Adaptive Scanning Pipeline Depends on VTS Telemetry Integrity
- **Severity**: MEDIUM
- **Location**: `adaptive-ratio-manager.ts` → `telemetry-aggregator.ts` → VTS
- **Problem**: The entire adaptive scanning feedback loop depends on VTS telemetry health. If VTS is paused, misconfigured, or data-lagged: Ideal pool quality degrades, ratio manager biases toward default (0.7), batch composition becomes stale. The adaptive benefit is silently lost with no health check or alert.
- **Fix**: Add telemetry freshness check — emit warning when pool performance data is older than X cycles. Add VTS telemetry health to system health endpoint.
- **Timing**: Pre-MCE or during MCE
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-024: Cost Cache Synchronization Coupling
- **Severity**: LOW-MEDIUM
- **Location**: FX5 Scanner → `cost-cache.ts` (TTL: 5 min) → `cost-model.ts`
- **Problem**: FX5 writes spread data every 30s; cost cache TTL is 5 min; cost model depends on fresh cache. If scan errors/restarts cause cache misses, or symbol normalization diverges between writer and reader, friction scores revert to defaults silently.
- **Mitigations**: 30s refresh >> 5-min TTL; writes cover ALL evaluated pairs. Risk is low under normal operation.
- **Fix**: Verify symbol normalization consistency. Add "cache miss" metric to detect silent fallback.
- **Timing**: Anytime
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-025: History Filter Sequential Async Risk
- **Severity**: LOW
- **Location**: `market-scanner.ts` `collectAdaptiveBatch()` lines 1280-1286
- **Problem**: History filter calls Kraken OHLC per-pair sequentially over 100 pairs. Cold cache (post-restart) could make up to 100 sequential API calls, potentially violating M31 (30s runtime limit).
- **Mitigations**: Results cached 24h per pair. Cache miss with error conservatively fails (null = fail). After first cycle, nearly all cached.
- **Fix**: Consider pre-warming cache during boot or batching history checks.
- **Timing**: Post-MCE (low priority, mitigations adequate)
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-026: DSE Diagnostics Use Legacy Regime Names
- **Severity**: LOW
- **Location**: `server/core/risk/dynamic-sizing-engine.ts` lines 287-288
- **Problem**: `getDSEDiagnostics()` references 6 regime names including `EXTREME_NOISE` and `LOW_VOL_CHOP` which do not match the canonical 5-regime taxonomy (`BULL_QUIET`, `BULL_VOLATILE`, `BEAR_QUIET`, `BEAR_VOLATILE`, `CHOPPY`). These are display/diagnostic only and do not affect sizing math.
- **Fix**: Update regime names in diagnostics to match canonical names
- **Timing**: Anytime (cosmetic, no trading impact)
- **Phase Found**: Phase 4

### RISK-027: GASP Is Itself Legacy — L-Series Autonomy Cluster (SUPERSEDED)
- **Severity**: MEDIUM → **RECLASSIFIED** (Kyle Addendum, 2026-02-16)
- **Location**: `server/services/gasp-coordinator.ts`
- **Original Problem**: GASP depends on legacy subsystems (MOF, DCE, APR-SLE, MCP).
- **Updated Status**: Kyle confirmed (2026-02-16) that GASP is itself legacy — part of the L-Series Autonomy Cluster. GASP is a supervisory layer that does NOT touch the active trade flow. It forms a closed loop with MOF/MACO/ECS/DCE/APR-SLE/MCP. No metric source migration needed — the entire L-Series cluster (GASP + all its sources) will be removed together in a coordinated wave.
- **Fix**: Remove GASP with entire L-Series autonomy cluster. No intermediate migration needed.
- **Timing**: During L-Series cluster removal wave
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-028: Goal Alignment Logic Is Formally Deprecated — Must Be REMOVED
- **Severity**: LOW → **MEDIUM** (elevated: formal deprecation directive, Kyle Addendum 2026-02-16)
- **Location**: `server/services/pre-execution-validator.ts` — entire goal alignment gate
- **Original Problem**: Only 3 of 17 strategies had risk profiles, making goal alignment flat for most strategies.
- **Updated Status**: Kyle formally deprecated Goal Alignment (2026-02-16). The Goals tab has already been removed from the UI. This is Walter-era legacy logic. Must be **REMOVED entirely** — not expanded, not defaulted to neutral, but deleted.
- **Removal scope**: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, Walter/Bob provenance references. Check `profitability_vs_consistency` field in system_context for other consumers — remove if none.
- **Fix**: Delete all goal alignment code. Pre-Execution Validator becomes a two-gate system (risk checks + fee-aware profitability).
- **Timing**: Pre-MCE or during MCE — standalone removal, no MCE dependency
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-029: Paper Portfolio Manager Uses Hardcoded Starting Capital — ACCEPTED
- **Severity**: LOW-MEDIUM → **LOW** (Kyle accepted, 2026-02-16)
- **Location**: `server/services/paper-portfolio-manager.ts` lines 539-541, 670-672
- **Problem**: `checkPortfolioHealth()` and `calculateMaxDrawdown()` assume `startingCapital = 10000` (hardcoded) for exposure and drawdown calculations.
- **Kyle Decision (2026-02-16)**: Hardcoded $10,000 is acceptable for now. Optional future: throw error if portfolio_state.balance is missing.
- **Fix**: No immediate action. Optional future enhancement.
- **Timing**: Post-MCE (optional)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-030: Coherency Rules YAML vs Database CHECK Constraint Mismatch
- **Severity**: LOW
- **Location**: `audit/coherency_rules.yaml` line 253 vs RULE_007
- **Problem**: The YAML's database enforcement section specifies `daily_loss_kill_switch_pct >= 1.00 AND <= 20.00` as a CHECK constraint, but RULE_007 in the same YAML and the guardrail-policy code both enforce `1.00-25.00`. The database constraint is stricter than the application rule.
- **Fix**: Align database CHECK constraint to match RULE_007 (1.00-25.00)
- **Timing**: Anytime (database migration needed)
- **Phase Found**: Phase 4

### RISK-031: EXECUTION_CONFIG.MAX_POSITION_RISK Contradicts Guardrails — DEFERRED
- **Severity**: MEDIUM
- **Location**: `server/config/execution-config.ts` line 15, `server/core/risk/dynamic-sizing-engine.ts` line 211
- **Problem**: `EXECUTION_CONFIG.MAX_POSITION_RISK = 0.02` (2%) is used by DSE as a hard cap on position size. However, `guardrails_v2.maxPositionPercentPct` defaults to 10% (live) or 30% (paper). The DSE cap at 2% is far stricter, meaning the guardrail's UI-visible `maxPositionPercentPct` may never be the binding constraint.
- **Kyle Decision (2026-02-16)**: Confirmed this is a real conflict. Do NOT change during audit phase. Add to cleanup docket for post-audit architecture session.
- **Fix**: Clarify whether DSE should use `maxPositionPercentPct` from guardrails_v2 or keep layered. Resolve during post-audit architecture session.
- **Timing**: Post-audit architecture session (deferred per Kyle)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### BUG-010: TradingEngine Simulates Partial Fills With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 346-388
- **Code**: `const isPartialFill = Math.random() < 0.1; // 10% chance`
- **Problem**: After placing a live market order via Kraken API, the engine simulates partial fills using random numbers instead of querying actual order status.
- **Impact**: In live trading, position quantity tracking would be randomly wrong. Non-blocking: paper mode is authoritative; live mode is deferred.
- **Kyle Decision (2026-02-16)**: Live mode execution is deferred. Paper mode is authoritative. Informational until live refactor. Future decision: refactor TradingEngine or rebuild from paper core.
- **Timing**: Deferred until live mode refactor
- **Fix**: Replace Math.random() logic with actual Kraken order status query.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-011: TradingEngine Simulates Slippage/Fees With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 391-393
- **Code**: `entrySlippage = Math.random() * 0.1; // 0-0.1% slippage`
- **Problem**: Entry slippage is assigned a random value and fees use a hardcoded taker rate instead of actual values from the fill response.
- **Kyle Decision (2026-02-16)**: Same as BUG-010 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor
- **Fix**: Derive actual slippage from fill response. Same issue in `closeTrade()` at line 648.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-012: TradingEngine Contains Second Active Goal Alignment Location
- **Severity**: HIGH
- **Location**: `server/services/trading-engine.ts` lines 128-254
- **Code**: `signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);`
- **Problem**: The TradingEngine computes Goal Alignment scores via `calculateGoalAlignmentScore()` and applies them to FinalScore with a 30% weight. Kyle formally deprecated Goal Alignment in Phase 4 (RISK-028), but the deprecation directive only referenced `pre-execution-validator.ts`. This is a second, independent implementation in the live-capable engine.
- **Impact**: If TradingEngine is used (live mode), FinalScore is modified by deprecated Goal Alignment logic, potentially overriding or conflicting with the canonical FinalScore from SQE.
- **Verified**: Yes — code-confirmed 2026-02-16
- **Timing**: **Pre-MCE** — should be removed alongside RISK-028 (Goal Alignment formal removal)
- **Fix**: Remove `calculateGoalAlignmentScore()` method and Goal Alignment score computation from `processSignal()`. Use FinalScore directly from signal without modification.
- **Phase Found**: Phase 5

---

### RISK-032: MicroExecutionService triggerSymbolCheck() Is a TODO Stub — ACCEPTED
- **Severity**: MEDIUM → **ACCEPTED** (Kyle, 2026-02-16: experimental/dormant)
- **Location**: `server/services/micro-execution-service.ts` — `triggerSymbolCheck()` method
- **Problem**: The method that should trigger execution when significant price deltas are detected is unimplemented.
- **Kyle Decision (2026-02-16)**: MicroExecutionService is an experimental micro-price execution prototype. Paper-only, dormant, non-interfering. Leave hidden. No removal required. Revisit only if micro-price trading becomes intentional.
- **Timing**: No action — accepted as dormant
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-033: trade-flow.ts StrategyType Lists 9 Strategies vs 17 Canonical
- **Severity**: LOW
- **Location**: `server/types/trade-flow.ts` lines 22-31
- **Problem**: The `StrategyType` union type only includes 9 strategies (the same set used by DSS/SignalOrchestrator). The canonical system defines 17 strategies (5 quant + 5 pattern + 5 hybrid + 2 special). This creates a TypeScript enforcement point where 8 strategy types cannot be properly typed through the trade flow layer.
- **Impact**: Low — consistent with BUG-002/BUG-003 (legacy strategy map) and will be resolved when those bugs are fixed. However, any MCE fix to BUG-002/003 must also update this type definition.
- **Timing**: Concurrent with BUG-002/003 fix
- **Fix**: Update `StrategyType` to include all 17 canonical strategies when legacy strategy map is replaced.
- **Phase Found**: Phase 5

### RISK-034: Failed RTB Promotion Does Not Restore Signal to Queue
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `checkRtbPromotion()` lines 1344-1375
- **Problem**: Per Directive A3.R1, signals are removed from the RTB queue BEFORE trade execution to prevent double-activation. If `executePromotedSignal()` subsequently fails, the signal is permanently lost — not restored to the queue.
- **Impact**: Low in practice — promotion failures should be rare, and new signals are continuously generated. However, in low-liquidity conditions with few signals, losing a valid signal could delay execution.
- **Timing**: Post-MCE (optional improvement)
- **Fix**: Consider adding a dead-letter queue or retry mechanism for failed promotions. Alternatively, add metrics to track promotion failure rate.
- **Phase Found**: Phase 5

### RISK-035: max_holding_period Exit Maps to Close Reason 'UNKNOWN'
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `closePosition()` close reason map
- **Code**: `'max_holding_period': 'UNKNOWN'`
- **Problem**: The `max_holding_period` exit condition maps to 'UNKNOWN' instead of a specific close reason enum value like 'MAX_HOLD'. This reduces diagnostic clarity when analyzing trade outcomes.
- **Timing**: Anytime (trivial fix)
- **Fix**: Add 'MAX_HOLD' to the close reason enum and map `max_holding_period` to it.
- **Phase Found**: Phase 5

### RISK-036: TradingEngine closeTrade() Uses Math.random() for Exit Slippage in Live Mode — DEFERRED
- **Severity**: MEDIUM → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` line 648
- **Code**: `exitSlippage = Math.random() * 0.1;`
- **Problem**: Same class of issue as BUG-011 but on the exit side.
- **Kyle Decision (2026-02-16)**: Same as BUG-010/011 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor — bundled with BUG-010/BUG-011
- **Fix**: Derive actual exit slippage from fill response.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-037: NLAI System Is Legacy Conversational Control Infrastructure — **RESOLVED**
- **Severity**: MEDIUM → **FORMALLY DEPRECATED** (Kyle, 2026-02-16) → **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.2.7, Batch 4, commit `5d5c2051` (2026-02-24)
- **Resolution**: All 5 NLAI files deleted (nlai-interpreter.ts, contextual-nlai-interpreter.ts, nlai-execution-broker.ts, nlai-action-registry.ts, execution-policy-controller.ts). All references cleaned from 6 consuming files (routes.ts, live-trading-service.ts, auto_test_harness.ts, paper-sim-service.ts, config-update-service.ts, cognitive-tuner.ts). ActionResult type inlined in live-trading-service.ts. Chat handler in routes.ts now routes directly to intent-parser + command-router.
- **Original Problem**: NLAI (Natural Language Action Interpreter) was Walter AI's command bridge. It parsed chat commands, routed through execution broker, called service functions for guardrails/goals/watchlist/start-stop. Walter has been deprecated, conversational goal system removed, Goals tab removed.
- **Phase Found**: Phase 5 Addendum (Kyle directive)

### BUG-013: ML Service Client PredictionInput References Removed Phase-10 Fields
- **Severity**: MEDIUM
- **Location**: `server/services/ml-service-client.ts` — `PredictionInput` interface (line 30-31)
- **Problem**: The `PredictionInput` interface still references `ngc` (Normalized Global Confidence) and `cwqi` (Composite Weighted Quality Index), both of which were removed in Phase 10 in favor of `finalScore`, `hybridScore`, `predictiveConfidence`, and `regimeWeight`.
- **Impact**: If the Python ML service is re-enabled, it will receive stale field names. Callers must currently map Phase-10 metrics to legacy field names.
- **Verified**: Yes — interface confirmed in ml-service-client.ts
- **Timing**: During MCE or anytime (interface update only)
- **Fix**: Update `PredictionInput` to use Phase-10 canonical field names; update Python ML service to accept new fields
- **Phase Found**: Phase 6

### BUG-014: Retraining Freeze Controller Activates Phase 10 Freeze on Every Restart
- **Severity**: LOW
- **Location**: `server/services/retraining-freeze-controller.ts` — constructor (line 64)
- **Problem**: `activatePhase10Freeze()` is called unconditionally on every instantiation, imposing a 1-hour ML retraining block on every server restart. This was designed as a one-time deployment measure for the Phase 10.0 friction correction (0.26% → 0.50%) but persists as a stale artifact.
- **Impact**: Every restart delays ML calibration by 1 hour unnecessarily. In development, this may mask calibration issues.
- **Verified**: Yes — `this.activatePhase10Freeze()` confirmed in constructor
- **Timing**: Pre-MCE (easy fix — remove or gate behind config flag)
- **Fix**: Remove `activatePhase10Freeze()` from constructor, or gate behind a `PHASE10_FREEZE_ENABLED` environment variable
- **Phase Found**: Phase 6

### BUG-015: Dual Shutdown Handlers Create ML Service Shutdown Race Condition
- **Severity**: MEDIUM
- **Location**: `server/index.ts` (lines 1228-1259) and `server/core/boot_orchestrator.ts` (lines 51-73)
- **Problem**: Both `server/index.ts` and `server/core/boot_orchestrator.ts` independently register `SIGTERM`/`SIGINT` handlers. The boot orchestrator registers first (in constructor) and manages ML service shutdown (SIGTERM → 5s timeout → SIGKILL) and VTS Runner stop. The index.ts handler registers later and manages core services (RTB, DataAggregator, CentralClock, PriceCache, SystemHealth) and calls `process.exit(0)`. Since Node.js allows multiple handlers per signal, **both execute on shutdown**, but since index.ts calls `process.exit(0)`, the boot orchestrator's ML service graceful shutdown (which requires up to 5 seconds to send SIGTERM then SIGKILL) may be truncated or never complete.
- **Impact**: ML Python microservice may not receive graceful shutdown signal, potentially leaving orphaned processes. VTS Runner may not flush pending data.
- **Verified**: Yes — both handlers confirmed in source. Boot orchestrator: `process.on('SIGTERM', ...)` in constructor. Index.ts: `process.on('SIGTERM', ...)` in main IIFE.
- **Kyle Decision (Phase 7 Addendum)**: Post-audit investigation. No immediate change required.
- **Timing**: Post-audit cleanup (consolidate into single shutdown handler)
- **Fix**: Remove shutdown handler from boot_orchestrator.ts, add ML service and VTS shutdown to the index.ts handler **before** `process.exit(0)`, or use a coordinated shutdown controller.
- **Phase Found**: Phase 7

---

## ARCHITECTURAL RISKS (continued)

### RISK-038: VTS ML Calibration Performance Multiplier Is Noise-Modulated
- **Severity**: HIGH
- **Location**: `server/services/ml-calibration.ts` — `analyzePerformance()`
- **Problem**: The ML Calibration Service computes `performanceScore = finalScore × 0.5 + predictiveConfidence × 0.3 + regimeWeight × 0.2` to modulate the magnitude of weight adjustments. However, `finalScore` and `predictiveConfidence` are derived from **simulated** data in the VTS Runner (`simulateHybridScore()`, `simulatePredictiveConfidence()`), not from real strategy indicator calculations.
- **Consequence**: The **direction** of weight adjustments (INCREASE/DECREASE) is based on real win rate data (valid), but the **magnitude** of adjustments is modulated by noise. This may cause over- or under-adjustment of strategy weights.
- **Note**: This is downstream of BUG-001 (VTS signal generation is generic). Fixing BUG-001 would resolve this risk.
- **Timing**: During MCE (MCE-5 phase, bundled with BUG-001)
- **Phase Found**: Phase 6

### RISK-039: Reward Evaluator Output Is Not Consumed by Scoring Pipeline
- **Severity**: MEDIUM
- **Location**: `server/services/reward-evaluator.ts`
- **Problem**: The Reward Evaluator computes per-strategy, per-regime rewards (`R = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown`) every 30 minutes, but the audit found **no downstream consumer** of these reward values in any scoring, selection, or trading logic. The rewards are computed, persisted to disk, and emitted as events, but not consumed.
- **Kyle Decision (Phase 6 Addendum)**: Confirmed observability-only. Not harmful. Not integrated. Not a priority to connect.
- **Timing**: Post-MCE (architecture decision, low priority)
- **Phase Found**: Phase 6

### RISK-040: Five Walter-Era Learning Services — CONFIRMED LEGACY
- **Severity**: MEDIUM → **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum)
- **Location**: `server/services/continuous-learning.ts`, `learning-cycle-service.ts`, `learning-coordinator.ts`, `learning-bridge.ts`, `learning-gate-validator.ts`
- **Problem**: These 5 services form a complete learning subsystem that manages AI agent behavioral weights (CognitiveWeights: reasoning, exploration, exploitation, riskAversion, adaptability), agent feedback, cluster learning deltas, and ethical gate validation. They were built for the Walter/Bob AI ecosystem and have **zero connection** to the canonical VTS/ML pipeline, strategy weights, telemetry aggregator, or calibration utilities.
- **Evidence**: No imports from any canonical trading module. Imports only from Walter-era services (learning-bob, cluster-bus, phase-8.6.5-enhancements). Database tables used are agent-specific (agentLearningDelta, agentLearningFeedback, learningWeightProfile).
- **Kyle Decision (Phase 6 Addendum)**: "Legacy autonomy-era artifacts. Mark for removal in cleanup wave." These do not feed VTS, TelemetryAggregator, MLCalibrationService, StrategyEngine, or PaperExecutionEngine.
- **Timing**: Pre-MCE or during MCE (removal is EASY to MODERATE)
- **Phase Found**: Phase 6 (confirmed by Phase 6 Addendum)

### RISK-041: Calibration β Coefficient Clamped to Conservative Range
- **Severity**: LOW
- **Location**: `server/utils/calibration.ts` — `linearFit()` (line 99)
- **Problem**: The linear fit clamps β to [0.05, 0.5], preventing the calibration from learning relationships with slopes greater than 0.5, even when data supports steeper slopes. This biases all calibrated profit predictions toward conservatism.
- **Note**: Conservative bias may be intentional (safer to under-predict than over-predict). Document this as a design decision or widen the range.
- **Timing**: Post-MCE (design decision)
- **Phase Found**: Phase 6

### RISK-042: VTS Service / VTS Runner Trade Duration Mismatch
- **Severity**: LOW
- **Location**: `server/services/vts-service.ts` (3-hour TRADE_DURATION) vs `server/services/vts-runner.ts` (24-hour MAX_HOLD_MS)
- **Problem**: The VTS Service defines a 3-hour trade window for legacy random simulation, while the VTS Runner uses a 24-hour max hold for real-price resolution. Since Directive 11.6D deprecated the VTS Service's trade resolution, the 3-hour window is dead code.
- **Impact**: None currently — the 3-hour window is only used by deprecated methods.
- **Timing**: Anytime (cleanup, bundled with VTS Service legacy method removal)
- **Phase Found**: Phase 6

### RISK-043: Strategy-Specific Signal Logic Is Not Implemented — Artificial Strategy Differentiation
- **Severity**: **CRITICAL** (Kyle, Phase 6 Addendum — "the core architectural problem in Phase 6")
- **Location**: `server/services/vts-runner.ts` — `generatePhase10Signal()`, `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()`
- **Problem**: Although multi-strategy simulation (Directive 11.8C) is correctly implemented — iterating over ALL strategies compatible with a pair's regime — the underlying `generatePhase10Signal()` uses **identical generic scoring logic for ALL strategies**. Specifically:
  - `simulateHybridScore()` — regime-based lookup + random noise, NOT strategy-specific
  - `simulatePredictiveConfidence()` — derived from hybridScore, NOT strategy-specific
  - `simulateDecayPenalty()` — `Math.random() * 0.15`, fully random
  - FinalScore — identical formula for all strategies
  - Stop/Target logic — volatility-based, NOT strategy-specific
  - Entry logic — current market price for all strategies
- **Consequence**: The system simulates N strategies per pair, but all N produce signals from the same generic math. Only randomness and metadata labels differ. This means:
  - Per-strategy calibration is statistically diluted — calibration learns noise, not structural edge
  - Strategy comparisons are partially artificial — "Breakout" vs "Mean Reversion" produce effectively identical signals
  - ML magnitude adjustments are noisy
  - True structural edge cannot emerge
- **Relationship to BUG-001**: BUG-001 flagged simulated scoring inputs. RISK-043 is the deeper problem — even if scoring were real, all strategies would still use the same scoring logic. Strategy-specific signal generators are the prerequisite.
- **Required correction**: Each strategy must have unique entry logic, unique stop logic, unique target logic, and unique confidence modeling. This is MCE-level work.
- **Timing**: During MCE (MCE-5 phase or dedicated strategy engine sprint)
- **Phase Found**: Phase 6 Addendum (Kyle directive)

### RISK-044: Lazy Loader Contains LATTI Removal Stub
- **Severity**: LOW
- **Location**: `server/startup/lazy-loader.ts` — LATTI Manager section (lines 37-40)
- **Problem**: The lazy loader still references the removed LATTI system (Directive 11.8B-B) with a stub function that logs a removal notice. This is correct transitional behavior but should be cleaned up once all references to LATTI are confirmed removed.
- **Impact**: None — the stub is harmless and produces only an informational log line.
- **Kyle Decision (Phase 7 Addendum)**: Part of broader LATTI/coherence residue investigation. Confirm whether residual `lattiManaged`, `lockedByUser`, `manualOverride` fields still serve active purpose. If LATTI is fully removed, eliminate all residual flags.
- **Timing**: Post-audit cleanup (bundled with LATTI file cleanup)
- **Phase Found**: Phase 7
- **Batch 8 Update (2026-02-27)**: Directive 12.2.1 removed all other LATTI code/UI residuals (latti-safety-monitor.tsx deleted, schema.ts LATTI ORM definitions removed, routes.ts handleLATTITargets removed, 7 client goal components cleaned, index.ts lattiManaged→systemManaged renamed). This lazy-loader stub (2 lines) and DB column names (`tunedByLatti`, `managedByLottie`) are the only remaining LATTI references in the codebase. Stub can be removed in any future cleanup batch.

### RISK-045: Schema Validator Defined But Call Site Unknown
- **Severity**: LOW
- **Location**: `server/bootstrap/schema-validator.ts` (Directive 11.7F)
- **Problem**: The schema validator (`validateSchemaVersions()`, `validateSchemaVersionsStrict()`) is defined but is not called from `server/index.ts` or any other startup file in the Phase 7 audit scope. The expected schema version `regime-mapping/v1.4b` is hardcoded. If this validator is not invoked during startup, schema mismatches between canonical TypeScript definitions and bridge JSON files would go undetected at runtime.
- **Impact**: Potential silent schema drift if validator is not called in CI/CD or elsewhere.
- **Timing**: Pre-MCE (verify call site; if missing, add to startup or CI/CD)
- **Phase Found**: Phase 7

### RISK-046: Health Monitor Auto-Recovery Actions Are All Placeholders
- **Severity**: MEDIUM
- **Location**: `server/services/health-monitor.ts` — `executeRecovery()`, `triggerAutoRecovery()`, Phase 41F-G
- **Problem**: The Phase 41F-G auto-recovery framework has a full implementation architecture (cooldown, circuit breaker, planned actions, dry-run mode, event emission) but **every recovery action handler is a placeholder**. Recovery handlers for queue purge, WebSocket reconnect, engine restart, market data reconnect, and queue flush all end with `success = true` after a `console.log`. No actual corrective action is taken.
- **Consequence**: The health monitor correctly detects anomalies, evaluates thresholds (Phase 41F-F), and tracks recovery history, but the system **cannot self-heal**. The circuit breaker and cooldown mechanisms protect against repeated recovery attempts, but there is nothing to recover from since no real action is taken.
- **Impact**: Degraded-to-critical conditions are detected and logged but require manual intervention.
- **Timing**: Post-MCE (enhance recovery handlers when stable enough to trust automated restarts)
- **Phase Found**: Phase 7

### RISK-048: routes.ts Is 23,349-Line Monolithic Router — Extreme Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/routes.ts`
- **Problem**: The main router file contains ~635 inline API endpoints, 40+ service imports, full JWT auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, and the registration code for all 26 modular route files — all in a single 23,349-line file. This is the largest file in the entire codebase and the most extreme monolithic accumulation point.
- **Impact**: Same class of issue as RISK-047 (index.ts at 1,260 lines). High coupling, poor separation of concerns, difficulty testing individual route groups in isolation. Route changes require editing a 23K-line file.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 8

### RISK-049: Hardcoded JWT Fallback Secret in 9 Route Files — **RESOLVED**
- **Severity**: **CRITICAL** (security — if JWT_SECRET env var not set, auth is trivially bypassable)
- **Location**: `server/routes/market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: JWT fallback secrets removed from all 12 route files (9 original + regime-archive.ts + routes.ts JWT_SECRET + routes.ts JWT_REFRESH_SECRET). Server now throws a fatal error and refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` environment variables are not set. Fail-hard, fail-closed.
- **Original Problem**: If the `JWT_SECRET` environment variable was not set, all 9 route files fell back to a hardcoded string visible in source code. Any attacker who knew this string could forge valid JWT tokens.
- **Kyle Decision (Phase 8 Addendum, ADD-2)**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined.
- **Phase Found**: Phase 8

### RISK-050: Inconsistent JWT Fallback Secret in regime-archive.ts — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/regime-archive.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Fallback secret removed. `regime-archive.ts` now uses the same fail-hard pattern as all other route files. No more inconsistent authentication behavior.
- **Original Problem**: Used a different fallback secret (`'your-secret-key'`) than all other route files. Tokens would be incompatible across endpoints if env var was missing.
- **Phase Found**: Phase 8

### RISK-051: Auth Bypass via `x-internal-audit` Header in 4 Route Files — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: All `x-internal-audit` and `x-validation-session` bypass header checks removed from all 4 files. The `auditOrAuth` middleware functions now enforce JWT authentication on every request with no bypass path. Replit confirmed no dependency on these headers before removal.
- **Original Problem**: Any request with `x-internal-audit: true` header bypassed JWT authentication entirely. `calibration.ts` and `regime-archive.ts` also accepted `x-validation-session` as a second bypass.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Remove entirely (option c selected).
- **Phase Found**: Phase 8

### RISK-052: 13 Route Files Have Zero Authentication
- **Severity**: MEDIUM-HIGH
- **Location**: `health.ts`, `status.ts`, `dse.ts`, `signal-audit.ts`, `audit.ts`, `back_audit.ts`, `provenance-debug.ts`, `vts-predictive-adjustments.ts`, `dce.ts`, `gasp.ts`, `mof.ts`, `pdc-ecs.ts`, `apr-sle.ts`
- **Problem**: 13 of 26 route files have no authentication middleware on any endpoint. This includes files with destructive/mutating operations: `health.ts` (POST recovery trigger, fault injection), `dse.ts` (POST reset), `audit.ts` (state-changing GET), `gasp.ts` (reset, rollback, recalibrate with unbounded inputs), `mof.ts` (evolve, reset), `pdc-ecs.ts` (reset, recalibrate), `apr-sle.ts` (reset, recalibrate), `provenance-debug.ts` (enable/disable debug, clear traces).
- **Mitigating factor**: L-Series files (dce, gasp, mof, pdc-ecs, apr-sle) will be removed with Wave 6. `status.ts` intentionally has no auth for health probes. `vts-predictive-adjustments.ts` is read-only.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. L-Series files removed with Wave 6. Active files must have auth added during auth consolidation.
- **Timing**: For L-Series files → remove with Wave 6. For active files → add auth during ADD-1 consolidation.
- **Phase Found**: Phase 8

### RISK-053: Duplicated Auth Middleware Across 8+ Route Files
- **Severity**: MEDIUM
- **Location**: All route files with `requireAuth` copy-pasted inline
- **Problem**: The `requireAuth` function and `AuthenticatedRequest` interface are copy-pasted identically in 8+ route files instead of being imported from a shared module. Each copy duplicates JWT verification, the hardcoded fallback secret, and error handling. This middleware is NOT equivalent to the main `authenticateToken` middleware in routes.ts (which additionally fetches user from database on every request — fail-closed). Only `learning.ts` (unmounted) correctly imports from `../middleware/auth`.
- **Impact**: Security policy changes require updating 9+ files. Inconsistency between route-file auth (JWT only) and routes.ts auth (JWT + DB verification). Any security fix must be applied to all copies.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Part of auth layer consolidation. Centralize to single middleware module with RBAC enforcement.
- **Timing**: During route cleanup or post-audit — refactor to centralized middleware module.
- **Phase Found**: Phase 8

### RISK-055: RBAC Not Enforced in Modular Route Files — Phase 8 Addendum ADD-1
- **Severity**: HIGH
- **Location**: All 8 route files with copy-pasted `requireAuth`: `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `regime-archive.ts`
- **Problem**: The copy-pasted `requireAuth` middleware verifies JWT token validity but **never checks the user's role or permissions**. It decodes the token and attaches `req.user = { id, username }` — no role field is extracted or validated. Any authenticated user (including `viewer` role) can access all mutating endpoints in these files. Examples: `vts-audit.ts` POST `/update-mode` allows any user to switch system mode; `market.ts` POST `/regime/refresh` allows any user to force regime recheck; `calibration.ts` POST `/ml/trigger` allows any user to trigger ML calibration.
- **Contrast**: routes.ts uses `authenticateToken` (DB-backed) + `requireEditor`/`requireOwner` guards on mutating endpoints.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. All mutating endpoints must enforce at minimum `editor` role. All admin/destructive operations must enforce `owner` role.
- **Timing**: During auth consolidation (post-audit or pre-MCE)
- **Phase Found**: Phase 8 Addendum

### RISK-056: No API Versioning — Phase 8 Addendum ADD-4
- **Severity**: LOW
- **Location**: All endpoints use unversioned `/api/*` paths
- **Problem**: No API versioning namespace. All endpoints use `/api/*` directly. Any breaking change to endpoint contracts requires coordinating frontend and backend deployments simultaneously. No path for graceful API migration.
- **Kyle Decision (Phase 8 Addendum, ADD-4)**: Introduce `/api/v1/` namespace before next major refactor.
- **Implementation**: Mount existing apiRouter at both `/api/v1` and `/api` (backward-compatible), migrate frontend, then deprecate unversioned paths.
- **Timing**: Post-audit cleanup (bundled with routes.ts refactoring)
- **Phase Found**: Phase 8 Addendum

### BUG-016: REST Violation — GET Method for State-Changing Operation in audit.ts
- **Severity**: LOW
- **Location**: `server/routes/audit.ts` — GET `/api/audit/trigger`
- **Problem**: Uses GET method for a state-changing operation (triggers system audit). GET requests should be idempotent per HTTP specification. This means browser prefetch, link crawling, or caching proxies could inadvertently trigger audits.
- **Timing**: Anytime (change to POST)
- **Phase Found**: Phase 8

### BUG-017: Internal Service Key Guard Bypass in rl.ts
- **Severity**: MEDIUM
- **Location**: `server/routes/rl.ts` — GET `/api/rl/internal/buffer`
- **Code**: `const expectedKey = process.env.INTERNAL_SERVICE_KEY; if (expectedKey && internalKey !== expectedKey) { ... }`
- **Problem**: If `INTERNAL_SERVICE_KEY` env var is empty string or not set, the guard is bypassed entirely (empty string is falsy in JavaScript). The internal buffer endpoint, intended only for ML service-to-service communication, becomes publicly accessible.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Part of header bypass removal. Internal service auth must be fail-closed.
- **Timing**: Pre-MCE (change to fail-closed: reject if env var is not set)
- **Phase Found**: Phase 8

### RISK-054: vts.ts Route File at 1,425 Lines / 37 Endpoints
- **Severity**: LOW
- **Location**: `server/routes/vts.ts`
- **Problem**: Oversized route file with 37 endpoints covering VTS status, configuration, tuning, simulation control, and audit functions. Should be split into logical groupings (VTS core, VTS config, VTS audit). Contains functional overlap with `vts-audit.ts` (which adds 6 more endpoints at the same mount point).
- **Timing**: During VTS refactor or post-audit cleanup
- **Phase Found**: Phase 8

### RISK-047: Server Entry Point Is 1,260-Line Single File — Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/index.ts`
- **Problem**: The entire server boot sequence, middleware configuration, route mounting, service initialization (~40+ services), lazy loading, scheduler registration, config audit telemetry, and graceful shutdown are all in a single 1,260-line file. This is a maintainability observation, not an active defect — the code is functional and well-organized with clear section comments.
- **Impact**: High coupling makes it harder to reason about boot order dependencies and to test individual startup modules in isolation.
- **Kyle Decision (Phase 7 Addendum)**: "Phase 7 does not indicate instability. It indicates architectural accumulation." Acknowledged as hygiene candidate for post-audit cleanup, not emergency defect.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 7

---

## PHASE 9 FINDINGS

### BUG-018: Dead History Import in App.tsx
- **Severity**: LOW
- **Location**: `client/src/App.tsx` — line 7
- **Code**: `import History from "@/pages/history";`
- **Problem**: `History` page component is imported but never rendered in any route. The history page was superseded by the Trade History tab in `active-trades.tsx`, but the import was never removed.
- **Impact**: Unnecessary bundle inclusion of a 253-line dead page component.
- **Verified**: Yes — grep confirmed `History` only appears on the import line in App.tsx, not in any JSX.
- **Timing**: Anytime (trivial fix — remove import)
- **Fix**: Remove the import statement.
- **Phase Found**: Phase 9

### BUG-019: Dead Watchlist Import in active-trades.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/active-trades.tsx` — line 4
- **Problem**: `Watchlist` component is imported but never rendered in JSX. `useQuery` is also imported but never called in the page component. These are remnants from a previous page layout that was refactored into tabs.
- **Impact**: Unnecessary imports, potential bundle size.
- **Timing**: Anytime (trivial fix)
- **Fix**: Remove unused imports.
- **Phase Found**: Phase 9

### BUG-020: Simulated Current Price in Active Trades Component — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `client/src/components/trading/active-trades.tsx` — line 30
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Removed `entryPrice * 1.02` simulated price. Component now shows entry price with "(entry)" label and "Awaiting live price" for P/L column. The v2 component (`active-trades-v2.tsx`) already fetches real prices via WebSocket and is the correct production implementation.
- **Original Problem**: Current price was simulated as a hardcoded 2% gain above entry price. Users saw fabricated green P/L numbers with no connection to market reality.
- **Phase Found**: Phase 9

### BUG-021: system-config.tsx Uses Raw fetch() Instead of apiFetch
- **Severity**: LOW
- **Location**: `client/src/pages/system-config.tsx`
- **Problem**: Uses `fetch()` with `localStorage.getItem('token')` for API calls instead of the centralized `apiRequest` / `apiFetch` utilities. This bypasses the standard auth flow (token refresh, 30s timeout, 401 retry, `x-app-mode` header, request tracing).
- **Impact**: Config page could fail silently on expired tokens (no auto-refresh), has no timeout protection, and is missing the trading mode header.
- **Timing**: Anytime (moderate fix — refactor to use apiRequest)
- **Fix**: Replace raw `fetch()` calls with `apiRequest` from `@/lib/queryClient`.
- **Phase Found**: Phase 9

---

### RISK-057: 123 Console.log Statements Across Frontend — Production Logging Concern
- **Severity**: MEDIUM
- **Location**: Throughout `client/src/` — top offenders: `top-bar.tsx` (30), `api.ts` (16), `performance-profiler.ts` (12), `use-websocket.tsx` (11), `active-trades-v2.tsx` (11)
- **Problem**: 123 `console.log` statements persist in production code. Several are in high-frequency render paths (Phase 35.2A goal widgets log on every render, `api.ts` logs every API call). This causes:
  - Performance degradation on high-frequency components
  - Information leakage (API tokens, trading states, internal metrics visible in browser console)
  - Console noise obscures real errors
- **Fix**: Replace with conditional dev-mode logging (`import.meta.env.DEV && console.log(...)`) or remove entirely. The Vite build will tree-shake dev-only code.
- **Timing**: Pre-MCE (easy batch fix)
- **Phase Found**: Phase 9

### RISK-058: ~460 Server Endpoints Have No Frontend Consumer (ADD-5 Census)
- **Severity**: INFORMATIONAL
- **Location**: System-wide — frontend references ~291 of ~750 server endpoints
- **Problem**: The ADD-5 Endpoint Census found that approximately 460 server endpoints (~61% of total) have NO frontend consumer. Some of these serve legitimate purposes (internal service-to-service communication, scheduled jobs, external integrations), but many are likely dead API surface from removed features.
- **Recommended action**: During post-audit cleanup, use this census to identify and remove dead endpoints — particularly those in L-Series route files (already targeted for Wave 6), Walter routes (Wave 3), and speculative endpoints that were never implemented.
- **Timing**: Post-audit cleanup (use census data during Wave 3/6/8 removals)
- **Phase Found**: Phase 9

### RISK-059: enhanced-system-monitoring.tsx References ~60 Speculative/Aspirational API Endpoints
- **Severity**: LOW
- **Location**: `client/src/components/system/enhanced-system-monitoring.tsx`
- **Problem**: This single component references approximately 60 API endpoints, many across speculative/aspirational namespaces that almost certainly do not exist on the server: `/api/ethics/*`, `/api/collaboration/*`, `/api/federation/*`, `/api/knowledge/*`, `/api/oversight/*`, `/api/alignment/*`, `/api/introspection/*`, `/api/reasoning/*`. These were likely added as UI scaffolding for features that were never implemented.
- **Impact**: All calls to non-existent endpoints return 404s. React Query handles this gracefully (error states), but the dead references add unnecessary network requests and console noise.
- **Fix**: Audit which endpoints actually exist on the server. Remove references to non-existent endpoints. Consider whether this component should be simplified.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9

### RISK-060: Walter Frontend Integration Will Break on Backend Removal (Wave 3) — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 Sub-Batch B, Batch 6 (2026-02-26), commit `1ea3bb38`
- **Severity**: MEDIUM (planning concern)
- **Location**: 7+ frontend files with Walter dependencies
- **Resolution**: Frontend Walter cleanup was absorbed into Sub-Batch B (Batch 6) alongside the backend removal. 5 frontend files deleted (`walter.tsx`, `walter-floating-assistant.tsx`, `walter-approvals.tsx`, `chat-file-attachment.tsx`, `useWalterPreferences.tsx`). App.tsx modified (removed Walter route, floating assistant render, getPageContext). sidebar.tsx modified (removed Walter nav item). Backend and frontend were removed in a single coordinated batch, preventing the broken-state window.
- **Phase Found**: Phase 9

### RISK-061: Per-TradeRow Settings Fetch Creates N+1 Query Pattern
- **Severity**: LOW
- **Location**: `client/src/components/trading/active-trades.tsx` — `TradeRow` component
- **Problem**: Each `TradeRow` component independently fetches `/api/settings` (for timezone information) with a 5-minute stale time. If there are 10 active trades, this creates 10 independent `useQuery` calls for the same endpoint. While React Query deduplicates concurrent requests, this is an anti-pattern that wastes query cache entries and could cause unnecessary re-renders.
- **Fix**: Lift the settings query to the parent component and pass timezone as a prop.
- **Timing**: Anytime (low priority optimization)
- **Phase Found**: Phase 9

### RISK-062: AJ16/AJ17 Naming Inconsistency in Diagnostics Card
- **Severity**: LOW
- **Location**: `client/src/components/goals/aj17-diagnostic-card.tsx`
- **Problem**: The file name and API paths reference "AJ17" while the card title and toast messages display "AJ16". This naming inconsistency could confuse developers maintaining the code.
- **Fix**: Align naming to a single identifier.
- **Timing**: Anytime (cosmetic)
- **Phase Found**: Phase 9

---

## PHASE 9 ADDENDUM — Kyle's Directives (2026-02-17)

> **Kyle's Final Position**: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit."

### RISK-063: JWT Token Storage in localStorage — XSS Exposure Risk (Phase 9 Addendum ADD-1)
- **Severity**: MEDIUM (security)
- **Location**: `client/src/lib/auth.ts` — `saveTokens()`, token retrieval throughout `api.ts`
- **Problem**: JWT access tokens and refresh tokens are stored in `localStorage`. This is the simplest storage mechanism but has a known security trade-off: any XSS vulnerability in the application (including third-party dependencies) allows an attacker to read and exfiltrate JWT tokens from `localStorage`. The 12-hour access token lifetime gives a large exploitation window.
- **Contrast**: `httpOnly` cookies cannot be read by JavaScript, preventing token exfiltration via XSS. A hybrid approach (httpOnly refresh cookie + in-memory access token) minimizes both XSS and CSRF risks.
- **Kyle Directive (Phase 9 Addendum ADD-1)**: Document this risk. Recommend future migration to secure cookie or hybrid approach.
- **Recommended migration path**:
  1. Move `refreshToken` to an `httpOnly`, `Secure`, `SameSite=Strict` cookie
  2. Keep `accessToken` in memory only (not localStorage) — short-lived, re-obtained via refresh cookie
  3. Add CSRF protection if cookie-based auth is adopted
  4. Reduce access token lifetime from 12 hours to 15–30 minutes
- **Timing**: Post-audit (future security improvement — not urgent for paper-only mode)
- **Phase Found**: Phase 9 Addendum

### RISK-064: Monolithic Pages Require Component Decomposition (Phase 9 Addendum ADD-2)
- **Severity**: MEDIUM (maintainability)
- **Location**: `ai-transparency.tsx` (2,074 lines), `machine-learning.tsx` (1,985 lines), `analytics.tsx` (1,939 lines), `top-bar.tsx` (1,042 lines)
- **Problem**: Four frontend files exceed 1,000 lines each. These are unmaintainable monoliths where individual sections are tightly coupled. Bug fixes, feature changes, and code review are significantly harder in files this large.
- **Kyle Directive (Phase 9 Addendum ADD-2)**: Flag these files for component decomposition.
- **Decomposition strategy**: Each major section (tab, panel, data view) should be extracted into a standalone component with clear props/data contracts.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### RISK-065: No Centralized Polling Policy — Ad-Hoc Refresh Intervals (Phase 9 Addendum ADD-3)
- **Severity**: LOW
- **Location**: Throughout all hooks and components with `useQuery` refetch intervals
- **Problem**: Every hook and component defines its own polling interval ad-hoc. There is no centralized polling policy or shared constants. Intervals range from 5s (trading status) to 3,600s (database status) with no documented rationale for the specific values. Some inconsistencies: watchlist scan diagnostics polls at 10s (too aggressive for informational data), KillSwitchBanner polls `/api/settings` at 15s (could be WebSocket-driven instead).
- **Kyle Directive (Phase 9 Addendum ADD-3)**: Define standard refresh tiers:
  - **Critical** (5s): Trading status, real-time state
  - **Semi-critical** (15–30s): Health, active trades, alerts
  - **Informational** (60s+): Portfolio, briefs, settings
- **Fix**: Create a `POLLING_TIERS` constant in `lib/` that all hooks reference. Enforce via code review.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### Phase 9 Addendum ADD-4: Remove Speculative Endpoints
- **Status**: Directive — linked to RISK-059
- **Kyle Directive**: Clean `enhanced-system-monitoring.tsx`. Remove the ~60 speculative/aspirational API endpoints that generate unnecessary 404 network requests. Simplify the component to match actual system capabilities.
- **Timing**: Post-audit cleanup (can be bundled with ADD-2 decomposition)

### Phase 9 Addendum ADD-5: Remove Simulated Price Display — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Kyle Directive**: Replace `entryPrice * 1.02` hardcoded simulation with real price feed from price cache or WebSocket price stream.
- **Resolution**: Simulated price removed. Shows entry price with honest "Awaiting live price" label. Full live price integration exists in v2 component.
- **Kyle's elevation**: BUG-020 timing confirmed as Pre-MCE by Kyle.

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 21 |
| Critical Bugs | 7 (BUG-001 through BUG-004, BUG-006, BUG-008, BUG-009) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 4 (BUG-013, BUG-015, BUG-017, BUG-020) |
| Low Bugs | 6 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021) |
| Architectural Risks | 65 (RISK-001 through RISK-065) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Items Post-MCE/Anytime | 36 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, BUG-016, BUG-018, BUG-019, BUG-021) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

---

## PHASE 10 FINDINGS

### RISK-066: Zero Frontend Test Coverage — 189 Frontend Files With No Tests
- **Severity**: HIGH
- **Location**: `client/src/` — all 189 frontend files (25 pages, 133 components, 14 hooks, 9 lib, 2 contexts, 2 utils)
- **Problem**: No `*.test.tsx`, `*.spec.tsx`, or any test files exist under `client/`. React Testing Library is not installed. No component tests, integration tests, or snapshot tests exist for any frontend code. The entire frontend — including authentication flows, trading mode switching, WebSocket reconnection, and RBAC enforcement — has zero automated test coverage.
- **Impact**: Frontend regressions can only be caught manually or through the 3 Playwright E2E tests (which cover config snapshot and paper trading flow only, not individual component behavior).
- **Recommended**: Install `@testing-library/react` and `@testing-library/jest-dom`. Add Vitest config for client-side tests. Start with critical path components: auth flow, trading mode context, RBAC hook, WebSocket singleton.
- **Timing**: Post-audit (medium-term investment)
- **Phase Found**: Phase 10

### RISK-067: No CI/CD Pipeline — Tests Never Run Automatically
- **Severity**: HIGH
- **Location**: Repository root — no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or any CI/CD configuration
- **Problem**: The 60 test files are never automatically executed. No pipeline runs tests on pull requests, merges, or deployments. Tests only run when a developer manually invokes `npx vitest` or `npx playwright test`. This means regressions can be introduced without any automated safety net.
- **Impact**: Test suites may be silently broken. Schema version conflicts between tests may go undetected. Architectural invariant tests (codebase scanning) provide no value unless someone remembers to run them.
- **Recommended**: Create a GitHub Actions or GitLab CI pipeline that runs `vitest` on every push. Add Playwright E2E tests as a separate pipeline stage (requires running server).
- **Timing**: Post-audit (should be one of the first infrastructure improvements)
- **Phase Found**: Phase 10

### RISK-068: No Test Scripts in package.json — No Standard Entry Point
- **Severity**: MEDIUM
- **Location**: `package.json` — `"scripts"` section
- **Problem**: No `"test"`, `"test:unit"`, `"test:e2e"`, or `"test:integration"` scripts are defined. The only scripts are `dev`, `build`, `start`, `check`, `db:push`. New developers have no obvious way to discover or run the test suite. CI/CD pipelines cannot use the standard `npm test` command.
- **Fix**: Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:ui": "vitest --ui"`, `"test:e2e": "playwright test"`, `"test:coverage": "vitest run --coverage"`
- **Timing**: Anytime (trivial fix)
- **Phase Found**: Phase 10

### RISK-069: Schema Version Conflicts Across Tests — Staleness Gradient
- **Severity**: MEDIUM
- **Location**: Multiple test files assert different schema versions
- **Problem**: `schema_v1_5.test.ts` asserts `SCHEMA_VERSION === 'v1.5.0'` while `telemetry_persistence_sql.test.ts` asserts v1.5.2, `net_expectancy.test.ts` asserts v1.5.7, and `cost_cache.test.ts` asserts v1.5.8. If the shared `SCHEMA_VERSION` constant is at v1.5.8, then `schema_v1_5.test.ts` will fail. Multiple schema version assertions across different test files create a staleness gradient where older tests break silently.
- **Recommended**: Audit all schema version assertions. Remove version pinning from older tests or update them to match current versions. Consider making schema version assertions reference a single source of truth rather than hardcoded strings.
- **Timing**: Post-audit (should be addressed before enabling CI/CD)
- **Phase Found**: Phase 10

### RISK-070: Test Files for Deprecated Walter/Bob Systems — Will Break on Removal — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 (Batches 5-7B, completed 2026-02-26)
- **Severity**: LOW (planning concern)
- **Location**: `server/tests/diagnostic-system.test.ts` (466→414→~285 lines), `server/tests/phase-6.0-simulations.test.ts` (136→65 lines, cleaned in Batches 5+6)
- **Resolution (Walter)**: All Walter imports and test blocks removed from both test files in Batch 6. `phase-6.0-simulations.test.ts` retains only 2 Bob diagnostic tests (deferred to Bob cleanup batch). `diagnostic-system.test.ts` retains Tests 1-7 and 9+ (diagnostic-controller/bob-inspector tests); Test 8 (walterPatchAnalyst) removed.
- **Resolution (Bob)**: Batch 7B removed bobInspector import and Tests 4-7 from diagnostic-system.test.ts (~129 lines). All Walter/Bob test dependencies now fully removed.
- **Remaining**: `paper_validation_engine.ts` DCE/GASP references remain for Wave 6 (L-Series removal).
- **Phase Found**: Phase 10

### RISK-071: Standalone Test Scripts Not Discoverable by Test Framework
- **Severity**: LOW
- **Location**: `server/tests/diagnostic-system.test.ts`, `server/tests/live-pricing-validation.ts`, `server/tests/system-verify.ts`, `server/tests/test-force-trade.ts`
- **Problem**: Four test files use standalone script patterns (custom `main()`, `process.exit()`, shebang lines) rather than Vitest `describe`/`it` blocks. Some have `.test.ts` extensions despite not being framework tests, causing confusion. These cannot be discovered or executed by `vitest run` and require manual invocation via `tsx`. They also require a running server and database, making them environment-dependent.
- **Recommended**: Either convert to Vitest tests with proper setup/teardown, or rename to `*.script.ts` to distinguish from framework tests.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 10

### RISK-072: No Mocking Infrastructure — All Tests Require Real Dependencies
- **Severity**: LOW
- **Location**: All 60 test files
- **Problem**: No mocking framework is used anywhere in the test suite. Every test imports and exercises real service code. Integration and system tests require a running database and server. This makes tests high-fidelity but also fragile, slow, and impossible to run in isolated CI environments without full infrastructure.
- **Impact**: Cannot run tests in lightweight CI containers. Test failures cascade when shared services have initialization issues. Database state leaks between tests.
- **Recommended**: For critical path tests, introduce `vi.mock()` for external dependencies (database, Kraken API). Keep the current real-import approach for integration tests but add a separate "unit" tier that runs without infrastructure.
- **Timing**: Post-audit (long-term investment)
- **Phase Found**: Phase 10

---

## PHASE 11 FINDINGS

### RISK-073: ~71 Legacy Tables (~44% of Schema) — Dead Database Surface
- **Severity**: MEDIUM (capacity/maintenance)
- **Location**: `shared/schema.ts` — tables from Phases 8.6–18 (L-Series cognitive architecture, ethics/governance, distributed cluster), Walter tables, paper-specific duplicates
- **Problem**: Of ~160 tables defined in schema.ts, approximately 71 (~44%) serve deprecated or aspirational systems: 32 L-Series cognitive tables (Phases 8.6–10.0), 16 ethics/governance tables (Phases 11–16), 9 distributed cluster tables (Phases 17–18), 10 Walter tables, 3 paper-specific duplicate tables, and 1 superseded guardrails V1 table. These tables exist in the database consuming storage overhead and add 2,000+ lines to the schema definition.
- **Impact**: Schema file complexity (4,836 lines), ~40 legacy enum definitions that cannot be dropped while referencing tables exist, potential stale data accumulation, developer confusion about which tables are active.
- **Recommended**: After confirming tables are empty (zero rows), drop legacy tables in coordinated waves matching the existing removal plan (Wave 3 for Walter, Wave 6 for L-Series, etc.). Remove corresponding enum definitions after table drops.
- **Timing**: Post-audit cleanup (coordinate with existing removal waves)
- **Phase Found**: Phase 11

### RISK-074: Dual Migration Directories — Untracked Migration Files
- **Severity**: MEDIUM
- **Location**: `migrations/` (4 files, journal tracked) and `drizzle/migrations/` (5 files, no journal)
- **Problem**: Two separate migration directories exist. The Drizzle Kit journal (`migrations/meta/_journal.json`) only tracks 2 of the 4 files in `migrations/`. The 5 files in `drizzle/migrations/` have no journal at all. This means 7 of 9 total migration files are not tracked by the migration system. The primary migration mechanism (`drizzle-kit push`) bypasses migration files entirely, comparing schema.ts directly to the live database.
- **Impact**: No reliable migration history. Cannot reconstruct schema state at any point in time. Cannot replay migrations on a fresh database. No rollback capability.
- **Recommended**: Consolidate to a single migration directory. Ensure all migrations are tracked in the journal. Consider switching from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate` for a more controlled workflow.
- **Timing**: Post-audit (recommended before any production deployment)
- **Phase Found**: Phase 11

### RISK-075: No Database Pruning or Archival Strategy — 10 GB Limit
- **Severity**: MEDIUM
- **Location**: Neon PostgreSQL instance (10 GB limit), `server/services/database-monitor.ts`
- **Problem**: The database monitor checks size daily against a 10 GB Neon limit (warning at 6.5 GB, critical at 8 GB), but there is no mechanism to archive or prune old data. Active tables that grow continuously include: `telemetry_history`, `paper_sim_trades`, `paper_sim_trade_logs`, `execution_attempt_audit`, `rtb_signals`, `safety_telemetry`, `error_logs`, `kill_switch_events`, and various audit/log tables. With no TTL, retention policy, or archival process, these tables will grow until they hit the 10 GB limit.
- **Impact**: Eventually the database will fill up and operations will fail. Legacy tables with stale data compound the problem by consuming space that active tables need.
- **Recommended**: Implement retention policies for log/telemetry tables (e.g., 90-day rolling window). Drop legacy tables to reclaim space. Consider moving historical data to a separate archive database or file-based storage.
- **Timing**: Post-audit (should be addressed before sustained paper trading generates significant data)
- **Phase Found**: Phase 11

### RISK-076: storage.ts Monolith — Third-Largest File in Codebase
- **Severity**: LOW (maintainability)
- **Location**: `server/storage.ts` (4,580 lines)
- **Problem**: The data access layer is a single monolithic file containing all CRUD operations for all domains (trading, Walter, AI, goals, telemetry, diagnostics, etc.). At 4,580 lines, it is the third-largest file in the codebase after `routes.ts` (23,349) and `schema.ts` (4,836). Like `routes.ts`, this is an architectural accumulation pattern where each new feature added methods to the same file.
- **Impact**: Difficult to navigate, review, and test. Walter-related storage methods will become dead code on Wave 3 removal. No domain-specific boundaries.
- **Recommended**: Consider splitting into domain-specific storage modules (trading-storage.ts, walter-storage.ts, telemetry-storage.ts, etc.) during post-audit refactoring. This is a lower priority than routes.ts decomposition.
- **Timing**: Post-audit (anytime)
- **Phase Found**: Phase 11

### RISK-077: ~50 Untyped jsonb Columns — No ORM-Level Validation
- **Severity**: LOW
- **Location**: Throughout `shared/schema.ts` — ~50 columns use `jsonb` type
- **Problem**: Only 1 of approximately 50 jsonb columns uses Drizzle's `$type<>()` for TypeScript type safety (`system_config.systemFlags`). All other jsonb columns accept arbitrary JSON at the ORM level. Validation, if any, happens only at the application layer. This means malformed JSON can be written to the database without ORM-level rejection.
- **Impact**: Data integrity risk for jsonb columns. TypeScript provides no compile-time safety for jsonb reads/writes. JSON schema changes are not versioned.
- **Recommended**: Add `$type<>()` annotations to critical jsonb columns (at minimum: `strategy_settings.params`, `screener_filters.filterOverrides`, `system_context.metadata`).
- **Timing**: Post-audit (incremental improvement)
- **Phase Found**: Phase 11

### RISK-078: ~200+ Indexes Without Usage Audit
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — index definitions across ~160 tables
- **Problem**: Over 200 indexes are defined but no `pg_stat_user_indexes` audit has been performed. Unused indexes consume storage, slow writes (every INSERT/UPDATE/DELETE must maintain the index), and increase vacuum overhead. Legacy table indexes (~71 tables worth) are maintained on every write operation even though the tables may be inactive.
- **Impact**: Write performance degradation, wasted storage, increased vacuum time. Particularly impactful on high-volume append-only tables (telemetry_history, execution_attempt_audit, paper_sim_trade_logs).
- **Recommended**: Run `pg_stat_user_indexes` to identify zero-scan indexes. Drop unused indexes. Review for duplicate/overlapping indexes.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-079: No Table Partitioning for Append-Only Tables
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — `telemetry_history`, `paper_sim_trade_logs`, `execution_attempt_audit`, `safety_telemetry`, `error_logs`, `ai_audit_log`, `ai_transparency_log`
- **Problem**: High-volume append-only tables are not partitioned. All data is stored in a single heap per table. Queries on recent data must scan entire tables. Retention (deleting old rows) requires expensive DELETE operations rather than simple partition drops.
- **Impact**: Growing query latency as tables accumulate data. Difficult data retention. Vacuum overhead increases linearly with table size.
- **Recommended**: Implement time-based partitioning (monthly) for high-volume append-only tables. This enables efficient queries on recent data, simple retention via partition drops, and faster vacuum.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-080: Migration Drift — Schema Not Reconstructable from History
- **Severity**: MEDIUM
- **Location**: `migrations/`, `drizzle/migrations/`, `drizzle.config.ts`
- **Problem**: The database schema cannot be reconstructed from migration history alone. The initial migration captures schema at one point, but subsequent changes were applied via `drizzle-kit push` without generating migration files. 7 of 9 migration files are untracked. This means a fresh database cannot be reliably set up by replaying migrations, and there is no way to verify what schema version is running.
- **Impact**: Disaster recovery requires pg_dump, not migration replay. Cannot verify schema state. Cannot set up new environments reproducibly.
- **Recommended**: Perform migration rebaseline — generate a fresh baseline migration from current schema.ts. Archive old migration files. Switch to `drizzle-kit generate` + `drizzle-kit migrate` workflow.
- **Timing**: Post-audit (Phase D of database cleanup, recommended before production deployment)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-081: LATTI Residual Fields in system_context Table — PARTIALLY RESOLVED
- **Severity**: LOW
- **Status**: **PARTIALLY RESOLVED** — Directive 12.2.1, Batch 8 (2026-02-27), commit `8086264c`
- **Location**: `shared/schema.ts` — `system_context` table, `server/storage.ts`
- **Problem**: The `system_context` table contains fields that are remnants of the deprecated LATTI (Latent Attention Through Transparent Intent) system. While the table itself is active (stores engine state and trading mode), LATTI-specific fields for coherence tracking, attention management, and intent tracking are dead weight. These fields have default values that are maintained but serve no active purpose.
- **Impact**: Schema noise, confusing field semantics for developers, potential for stale LATTI defaults to leak into active code paths.
- **Recommended**: Audit system_context columns, identify LATTI-specific fields, remove them in a targeted migration.
- **Timing**: During Wave 6 or dedicated cleanup pass
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)
- **Resolution**: Batch 8 removed 3 LATTI-specific ORM field definitions from `systemContext` in `schema.ts` and deleted the `lattiBaselineHistory` table ORM definition (+ insert schema + types). Physical database columns and table remain in Neon (no migration was run — only ORM definitions removed). Remaining LATTI-branded DB columns (`tunedByLatti`, `managedByLottie`, etc.) are still referenced by active code (`adaptive-guardrails.ts`) and cannot be removed without a migration + code update.

### RISK-082: No Data Retention Policy — Unbounded Row Growth
- **Severity**: MEDIUM
- **Location**: All log/telemetry/audit tables
- **Problem**: No data retention policy exists for any table. Every row ever written is preserved indefinitely. Given the 10 GB Neon limit, this is unsustainable — particularly for high-volume tables that grow with every trading cycle (telemetry_history, paper_sim_trade_logs, execution_attempt_audit, safety_telemetry, error_logs, RTB signals).
- **Impact**: Eventual database full condition, performance degradation as tables grow, inability to reclaim space from legacy data.
- **Recommended**: Define retention tiers: Hot (0–30 days, full fidelity), Warm (30–90 days, aggregate summaries), Cold (90+ days, archive or delete). Implement automated pruning via scheduled jobs.
- **Timing**: Post-audit (Phase E of database cleanup, should precede sustained trading)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

---

## PHASE 11 ADDENDUM — CORTEX AND TAB CATALOG FINDINGS

### RISK-083: Cortex System — Active but Undocumented Walter Dependency — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `server/services/cortex/cortex-core.ts` (393 lines), `cortex-config.yaml`, `cortex-memory.json`, `cortex-registry.json`, `analytics-scheduler.ts` (250 lines)
- **Problem**: The Cortex system is an ACTIVE in-memory caching/orchestration layer sitting between Bob modules and Walter. It maintains a TTL-based memory cache, performs snapshot syncs, and runs a 15-minute analytics cycle. It is initialized at startup via lazy-loader.ts, exposes 4 API endpoints (`/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync`), and is consumed by 9+ service files (config-change-handler.ts, context-refresh-coordinator.ts, contextual-nlai-interpreter.ts, corpus-domain-service.ts, phase-8.6.5-enhancements.ts, purpose-layer.ts, bob-config.ts, autonomy-controller.ts, system-truth-diagnostic.ts). Despite being architecturally coupled to both Bob and Walter, Cortex was not mentioned in any prior audit phase. It must be included in Wave 3 (Walter/Bob removal) scope.
- **Impact**: If Walter/Bob are removed without removing Cortex, the Cortex system will continue running, consuming memory, executing 15-minute analytics cycles, and maintaining stale cache data with no consumers. The 9+ importing services would also need to be audited for Cortex dependencies.
- **Recommended**: Add Cortex to Wave 3 removal scope. 6 files to remove, 4 API endpoints to remove, 9+ consuming services to audit and decouple.
- **Timing**: During Wave 3 (Walter/Bob removal)
- **Phase Found**: Post-audit investigation (Cortex audit 2026-02-17)
- **Resolution**: Directive 12.2.3 Sub-Batch C (Batches 7A + 7B + 7B-hotfix, commit `39dc23b1`). All 5 Cortex files deleted (cortex-core.ts, analytics-scheduler.ts, cortex-config.yaml, cortex-memory.json, cortex-registry.json). All 4 API endpoints removed from routes.ts. All 9+ consuming services surgically decoupled. Cortex is fully removed.

### BUG-022: Duplicate Tab Value "learning" in enhanced-system-monitoring.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/enhanced-system-monitoring.tsx` (~line 1300+ and ~line 2800+)
- **Problem**: Two separate `<TabsTrigger>` components share the same `value="learning"` attribute. In a Radix UI Tabs component, duplicate values cause the second tab to be unreachable — clicking it activates the first tab's content panel instead. The second "learning" tab (likely "Adaptive Learning" or similar) is effectively dead UI.
- **Impact**: One of the 27 tabs in enhanced-system-monitoring.tsx is unreachable. Minor UI bug but indicates the page has grown beyond maintainable complexity.
- **Verified**: Yes — discovered via automated tab catalog audit
- **Timing**: Post-audit (anytime)
- **Fix**: Rename the second tab's value attribute to a unique identifier (e.g., `"adaptive-learning"` or `"learning-metrics"`)
- **Phase Found**: Post-audit investigation (Tab catalog 2026-02-17)

---

## REPLIT LSP AUDIT CROSS-REFERENCE FINDINGS

### RISK-084: Deprecated RiskManager Class — 12 Import Locations, Not Removed
- **Severity**: MEDIUM
- **Location**: `server/services/risk-manager.ts`, imported in 7 files across 12 locations
- **Problem**: RiskManager was deprecated in Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from `trade-safety.ts`. However, it was never removed. It is still imported and instantiated in: `routes.ts` (4 locations), `test-guardrails.ts` (2), `paper-sim-diagnostic.ts` (3), `heuristic-trader.ts` (2 — dynamic import), `behavioral-template.ts` (2), `trading-state-sync.ts` (2 — dynamic import), `daily-brief.ts` (3).
- **Impact**: Deprecated risk management logic may still be exercised. Consumers may be calling outdated risk calculations that don't align with Guardrails V2 percentage-based model. Creates confusion about which risk management path is authoritative.
- **Recommended**: Systematic replacement across all 12 import locations. Replace with `checkGuardrailRisk()` from trade-safety.ts, then delete risk-manager.ts.
- **Timing**: Pre-MCE or during Wave 3 cleanup
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

### RISK-085: ~620 TypeScript LSP Errors Across Codebase
- **Severity**: LOW (informational)
- **Location**: Codebase-wide, concentrated in `routes.ts` (~211 errors), `storage.ts` (~66 errors), Walter services
- **Problem**: Replit LSP analysis (updated Jan 2, 2026) found ~620 TypeScript errors. Primary categories: type mismatches in routes.ts (211), schema mismatches in storage.ts (66), null/undefined parameter issues, Walter service type issues. The 211 errors in routes.ts and 66 in storage.ts are structural — tied to the monolithic file architecture already flagged in RISK-048 and RISK-076.
- **Impact**: TypeScript errors indicate potential runtime type safety issues. While many may be benign (type widening, strict null checks), some could indicate real bugs. The high error count also makes it harder to identify new genuine errors during development.
- **Recommended**: Address during routes.ts decomposition (RISK-048) and storage.ts modularization (RISK-076). A targeted pass on null/undefined parameter issues could be done independently.
- **Timing**: Post-audit (incremental, tied to monolith decomposition)
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 22 |
| Critical Bugs | 7 (BUG-001 through BUG-004, BUG-006, BUG-008, BUG-009) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 4 (BUG-013, BUG-015, BUG-017, BUG-020) |
| Low Bugs | 7 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Architectural Risks | 85 (RISK-001 through RISK-085) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Phase 10 Risks | 7 (RISK-066 — zero frontend tests; RISK-067 — no CI/CD; RISK-068 — no test scripts; RISK-069 — schema version conflicts; RISK-070 — legacy test staleness; RISK-071 — standalone scripts; RISK-072 — no mocking) |
| Phase 11 Risks | 5 (RISK-073 — 71 legacy tables; RISK-074 — dual migration dirs; RISK-075 — no DB pruning; RISK-076 — storage.ts monolith; RISK-077 — untyped jsonb) |
| Phase 11 Addendum Risks | 6 (RISK-078 — index usage audit; RISK-079 — no table partitioning; RISK-080 — migration drift; RISK-081 — LATTI residuals; RISK-082 — no retention policy; RISK-083 — Cortex undocumented dependency) |
| Post-Audit Bugs | 1 (BUG-022 — duplicate tab value in enhanced-system-monitoring.tsx) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Replit LSP Cross-Reference Risks | 2 (RISK-084 — deprecated RiskManager 12 imports; RISK-085 — ~620 TS LSP errors) |
| Items Post-MCE/Anytime | 57 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, RISK-066, RISK-067, RISK-068, RISK-069, RISK-071, RISK-072, RISK-073, RISK-074, RISK-075, RISK-076, RISK-077, RISK-078, RISK-079, RISK-080, RISK-081, RISK-082, RISK-084, RISK-085, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Items During Wave 3 Removal | 2 (RISK-070 — legacy test files; RISK-083 — Cortex system) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

**Phase 10 additions**: RISK-066 through RISK-072. Major findings: zero frontend test coverage (RISK-066, HIGH), no CI/CD pipeline (RISK-067, HIGH), no test scripts in package.json (RISK-068), schema version conflicts across tests (RISK-069), test files for deprecated Walter/Bob systems (RISK-070), standalone scripts not discoverable by framework (RISK-071), no mocking infrastructure (RISK-072). Test suite inventory: 60 test files (~13,735 lines), 31 unit tests, 13 integration tests, 3 E2E tests (Playwright), 4 standalone scripts. Runtime validation: 5 runtime validation services + 15+ diagnostic services. Total: 21 bugs, 72 risks.

**Phase 10 Addendum applied**: Kyle's verdict: "Accurate. Grounded. Technically strong. Well-cataloged. Not inflated. Backend math QA is elite-tier. Frontend and API QA are light. Runtime validation systems are extensive but fragmented." Corrections: slightly overstated backend execution risk, understated frontend blind spot and legacy test contamination, did not address unified QA architecture. Five directives issued:
- **ADD-1**: Legacy test suite audit required — tag all tests referencing Walter/Bob/DCE/NGC/CWQI/NLAI. Per-test decision: remove/archive/refactor/keep behind legacy flag. Strengthens RISK-070 scope. Important distinction: tests that assert legacy metrics are _absent_ are positive architectural guards, not contamination.
- **ADD-2**: Create unified test runner scripts in package.json (`test:unit`, `test:e2e`, `test:all`). Standardize entry point even before CI exists. Addresses RISK-068.
- **ADD-3**: Frontend test introduction plan — minimum targets: auth token refresh, TradingModeContext, use-websocket reconnection, TopBar start/stop flow. Install @testing-library/react + jest-dom. Addresses RISK-066.
- **ADD-4**: Mark standalone scripts as operational QA tools (not regression tests) in documentation. Addresses RISK-071.
- **ADD-5**: Property-based testing for core math (optional, high ROI) — FinalScore invariants, VolNoise monotonicity, covariance positive semi-definiteness, regime classification determinism. Recommended framework: fast-check.
Total: 21 bugs, 72 risks (no new risks — all directives are improvement actions addressing existing risks).

**Phase 11 additions**: RISK-073 through RISK-077. Schema inventory: ~160 tables (4,836 lines), ~80 enums, ~71 legacy tables (~44% of schema). Major findings: legacy table bloat from aspirational L-Series/ethics/cluster systems (RISK-073, MEDIUM), dual migration directories with untracked files (RISK-074, MEDIUM), no database pruning strategy against 10 GB Neon limit (RISK-075, MEDIUM), storage.ts monolith at 4,580 lines (RISK-076, LOW), ~50 untyped jsonb columns (RISK-077, LOW). Migration infrastructure: 9 files across 2 directories, only 2 tracked in journal, primary mechanism is `drizzle-kit push` (no review step, no rollback). Total: 21 bugs, 77 risks.

**Phase 11 Addendum applied** (ChatGPT feedback + Cortex/Tab audit, 2026-02-17):
- **ChatGPT corrections**: "71 legacy tables" nuanced — some have active writers, need pre-drop audit. "No transactions" corrected to "limited transactions." Storage layer coupling order constraint added.
- **6 new risks from ChatGPT feedback**: RISK-078 (index usage audit, MEDIUM), RISK-079 (no table partitioning, MEDIUM), RISK-080 (migration drift/rebaseline, MEDIUM), RISK-081 (LATTI residual fields, LOW), RISK-082 (no data retention policy, MEDIUM), RISK-083 (Cortex undocumented dependency, MEDIUM).
- **Cortex system identified**: ACTIVE in-memory caching layer between Bob and Walter. 6 files, 4 API endpoints, 9+ consuming services. Must be included in Wave 3 removal scope (RISK-083).
- **Directive 12.2.3 Sub-Batch A** (Batch 5, commit `cc320466`): 9 Walter service files with zero external importers deleted (~2,792 lines). Test file `phase-6.0-simulations.test.ts` cleaned (7 tests removed). RISK-070 partially resolved. Directive completed in Batches 5-7B (see Directive 12.2.3 Completion Log below).
- **1 new bug from tab catalog**: BUG-022 (duplicate `value="learning"` in enhanced-system-monitoring.tsx, LOW). Second tab with same value is unreachable.
- **5-phase database cleanup strategy** endorsed from ChatGPT: Phase A (Isolation) → B (Modularization) → C (Schema Simplification) → D (Migration Rebaseline) → E (Index & Retention Hygiene).
Total: **22 bugs, 83 architectural risks**.

**Replit LSP audit cross-reference** (2026-02-17):
- **Source**: "Pre-Phase 9 Comprehensive Audit Report" by Replit (Dec 30, 2025, updated Jan 2, 2026).
- **2 new risks**: RISK-084 (deprecated RiskManager class, 12 import locations, MEDIUM), RISK-085 (~620 TypeScript LSP errors, LOW/informational).
- **Confirmed completed**: 4 legacy files deleted (F-001 to F-003, F-008), Guardrails V2 migration (F-004 to F-006), UnifiedFilterGateway created (F-007), CWQI friction standardization (F-010/F-011). All verified consistent with our audit findings.
- **Critical disagreements resolved**: Replit report listed Walter services, ConfigBob/BobCore, Goals Learning Engine, and WalterPurposeTab as "Do Not Touch" — all four are now confirmed LEGACY per Kyle decisions made after the Replit report was written (Feb 2026). The "Phase 13 restoration" plan for Walter referenced in the Replit report is superseded. Kyle's direction is permanent removal, not preservation.
- **RiskManager class**: Not previously captured in our audit. Deprecated since Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from trade-safety.ts, but still imported in 12 locations across 7 files.
Total: **22 bugs, 85 architectural risks**.

**ChatGPT System Manual review** (2026-02-17):
- **Source**: ChatGPT review of the consolidated SYSTEM_MANUAL.md (9,930+ lines).
- **Accepted recommendations**: Added System Authority Hierarchy (front-page quick reference), Legacy Clusters appendix (6 removal groupings), expanded "About" section with reading guidance for current-state vs intended-state labeling, Paper vs Live development authority clarification, MCP/ARE elevated to "High-Impact Legacy Cluster" classification.
- **Already addressed (no changes needed)**: VTS generic signal CRITICAL callout — already present as multi-paragraph FINDING block plus 5-point Critical Observations in Chapter 6. NGC contamination chain — already documented across multiple chapters with specific code locations. MCP/ARE 14+ consumer impact — already thoroughly documented in Chapter 2 with full consumer list, strategy matrix, exposure multipliers, timer, and Kyle's decision.
- **Declined**: Per-chapter "Reality Snapshot" blocks — Chapter 2 already has this (`⚠️ CRITICAL: Current State vs Intended State` block), and the new "About" reading guidance + Authority Hierarchy address this concern document-wide without repetitive per-chapter blocks.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Directive Implementation Workflow established** (2026-02-19):
- Created `WORKFLOW.md` — 7-step directive lifecycle with templates (directive, review, completion report)
- Created `SYSTEM_IMPACT_MAP.md` — comprehensive component dependency map covering 30+ services across 11 layers, with upstream/downstream dependencies, blast radius ratings, and "If I Change X, Check Y" quick lookup table
- Created `directives/DIRECTIVE_INDEX.md` — master tracker for all Phase 12+ directives (18 directives pre-loaded for Phase 12)
- Created `sync-repo.bat` — one-click repository sync script (GitHub → local clone worktree)
- POST_AUDIT_ROADMAP.md revised to v2 — formal phase numbering (12-22), incorporated Kyle's Next Steps, Phase 11.8 final steps, Directional Bias, Short Trading, and ML planning documents (~43 week timeline)
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Replit onboarding & governance embedding** (2026-02-19):
- Created `REPLIT_ONBOARDING_PROMPT.md` — conversational prompt for onboarding Replit Agent to the directive workflow, covering role definition, Three Rules, directive protocol, prohibited/required actions, and review cycle expectations
- Updated `replit.md` (project root) — replaced Walter-era general overview with streamlined architecture reference + embedded Development Governance section (Three Rules, role definition, directive protocol, prohibited/required actions, reference document table). This file is read by Replit Agent at the start of every conversation, making the governance rules persistent.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Document Update Package workflow — Step 7 revision** (2026-02-19):
- **Problem**: Step 7 originally said "Kyle: push updated docs to GitHub" but Replit is the only push path to GitHub. Claude Code writes doc updates locally, but those files need to reach GitHub through Replit.
- **Solution**: Introduced Document Update Packages (`DOC_UPDATE_X.Y.Z.md`) — Claude Code writes exact FIND/REPLACE edits for governance documents, Kyle sends the package to Replit, Replit applies verbatim and pushes.
- Updated `WORKFLOW.md` — revised Step 7 diagram, added When to Sync entry for doc update pushes, added full Step 7 explanation section, added Document Update Package template, updated Document Discipline principles
- Updated `replit.md` — added Document Update Packages section, updated prohibited actions with carve-out for packages provided by Kyle
- Updated `REPLIT_ONBOARDING_PROMPT.md` — added Document Update Packages section, updated review cycle description, updated prohibited/required actions, updated confirm understanding checklist
- Updated `SYSTEM_MANUAL_OVERVIEW.md` — revised directive flow diagram, updated "What Replit Must Do" list, revised "What Happens After Implementation" description
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

---

**AUDIT COMPLETE**: All 11 phases of the systematic repository audit are now finished. Post-audit addenda applied: ChatGPT Phase 11 feedback, Cortex investigation, frontend tab catalog, Replit LSP audit cross-reference, ChatGPT System Manual review, and directive workflow establishment. Final registry: **22 bugs, 85 architectural risks** across the full DawnTrader codebase.

---

*Registry now entering implementation phase. Future entries will track directive-resolved bugs/risks as they are completed.*

---

## DIRECTIVE 12.2.3 COMPLETION LOG (2026-02-26)

**Directive 12.2.3: Wave 3 — Walter/Bob/Cortex Removal — COMPLETE**

Total removal: ~17,100 lines across ~65 files over 7 batches (5, 5B, 6, 6B, 7A, 7B, 7B-hotfix).

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 5 (Sub-Batch A) | 9 Walter files with zero external importers | ~2,792 | `cc320466` |
| Batch 5B | Governance update | — | `8a286e64` |
| Batch 6 (Sub-Batch B) | 10 Walter backend + 1 middleware + 5 frontend + docs. 13 consuming files modified. 28 route handlers removed. | ~8,600 | `1ea3bb38` |
| Batch 6B | Governance update | — | `eaacf34c` |
| Batch 7A (Sub-Batch C) | 28 Bob/Cortex files + 3 directories + 718-file training data tree deleted | ~4,500 | `5fc79598` |
| Batch 7B (Sub-Batch C) | 12 consuming files surgically modified (routes.ts, index.ts, lazy-loader.ts, config-change-handler.ts, diagnostic-controller.ts, cognitive-interpreter.ts, phase-8.6.5-enhancements.ts, self-repair.ts, intent-executor.ts, context-refresh-coordinator.ts, enhanced-system-monitoring.tsx, diagnostic-system.test.ts) | ~1,000 | `8cc362cc` |
| Batch 7B-hotfix | 11 missed broken imports fixed across 4 files (routes.ts, reasoning-orchestrator.ts, autonomy-controller.ts). learning-cycle-service.ts deleted. | ~200 | `39dc23b1` |

**Risks resolved by this directive:**
- RISK-070 (legacy test files) — RESOLVED: All Walter/Bob test dependencies removed
- RISK-083 (Cortex undocumented dependency) — RESOLVED: All Cortex files, endpoints, and consuming service imports removed

**Test baseline progression:**
- Pre-directive: 816/81 (897 total)
- After Sub-Batch A (Batch 5): 809/81 (890 total, 7 Walter tests removed)
- After Sub-Batch B (Batch 6): 802/81 (883 total, 7 more Walter tests removed)
- After Sub-Batch C (Batch 7): 800/81 (881 total, 4 Bob tests removed, 2 tests net from file deletion)

---

## DIRECTIVE 12.2.1 COMPLETION LOG (2026-02-27)

**Directive 12.2.1: Wave 1 — Safe Deletions — COMPLETE**

Total removal: ~1,254 lines across 13 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 8 | 2 files deleted (dhma.ts, latti-safety-monitor.tsx). 11 files modified: routes.ts (handleLATTITargets + comment), index.ts (LATTI audit→systemManaged), schema.ts (lattiBaselineHistory + 3 fields), enhanced-system-monitoring.tsx, target-daily-goals.tsx (full rewrite), 5 goal component text replacements, signal-orchestrator.ts (expectedDuration). | ~1,254 | `8086264c` |

**Risks addressed by this directive:**
- RISK-081 (LATTI residual fields) — PARTIALLY RESOLVED: ORM definitions removed, physical DB columns remain
- RISK-044 (lazy-loader LATTI stub) — UPDATED: All other LATTI residuals removed; lazy-loader stub (2 lines) remains

**Test baseline**: 800/81 (881 total) — unchanged
