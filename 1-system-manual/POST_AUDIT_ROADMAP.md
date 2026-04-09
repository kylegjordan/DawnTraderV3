# DawnTrader Post-Audit Roadmap

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-02-17
> **Revised**: 2026-04-09 (v5 — Phase 14.7 complete. All Running Issues cleared. Kyle directive: reorder phases — go live before ML. XStocks + Perpetual Futures added post-live. Phase 15+16 combined. ML deferred to post-live.)
> **Purpose**: Complete roadmap from current state (Phase 11.8B-D1) through live mode trading and publication. Uses formal DawnTrader phase numbering.
> **Companion Documents**: SYSTEM_MANUAL.md (what the system IS), CHANGES_AND_FIXES.md (22 bugs, 85 risks), LEGACY_DEPRECATION_PLAN.md (removal waves)
> **Source Documents Incorporated**: "Dawn Trader Next Steps After MCE Build" (2.14.26), "DT Phase 11.8 Final Steps" (2.6.26), "DT Predictive Learning Calibration" (2.2.26), "The Plan to Create A Plan for Machine Learning" (1.17.26)

---

## Where We Are (as of 2026-04-09, Batch 54)

**Last completed phase**: Phase 14.7 (Filter Diagnostics & Strategy Calibration — Batches 48-54)
**Phase 11 status**: Open — 11.8B-E and 11.8C remain. This is the NEXT phase.
**Phase 12 status**: COMPLETE
**Phase 13 status**: COMPLETE — MCE installed, L12-L20 cluster fully removed.
**Phase 14.1 status**: COMPLETE — VTS wired to real detect functions.
**Phase 14.2 status**: EFFECTIVELY COMPLETE — DBS implemented (Batch 15).
**Phase 14.3 status**: DEFERRED INDEFINITELY — replaced by Exchange Expansion (post-live).
**Phase 14.4 status**: CANCELED
**Phase 14.5 status**: COMPLETE — Dual-path pattern scanning, merit-based ranking, filter diagnostics (Batches 19-19K).
**Phase 14.6 status**: COMPLETE — Family-qualified identity, filter diagnostics data truth (Batches 20-39).
**Phase 14.7 status**: COMPLETE — Strategy calibration, pattern recognizer optimization, hardcoded default removal, ML service (Batches 48-54).
**Migration status**: COMPLETE — Hetzner + Supabase (Batch 40). Post-migration stabilization (Batches 41-47) complete.
**Running Issues**: 37 RESOLVED, 1 DEFERRED, 0 OPEN, 0 IN PROGRESS.
**Next phase**: Phase 11 Finalization (11.8B-E Adjustment Framework + 11.8C Authority Baseline)

---

## Current State Assessment

DawnTrader is a functional paper-trading system with elite-tier backend math and runtime validation, but carrying significant technical debt:

| Dimension | State |
|-----------|-------|
| **Core Math** | Strong — FinalScore kernel, Expectancy Gate, cost-model are correct and well-tested |
| **Trading Pipeline** | Functional — MCE centralized regime/indicators, NGC replaced with deterministic confidence (Batch 13), DSS deleted (HF9), 17 canonical strategies active |
| **Risk Management** | Active — Guardrails V2, kill switch, pre-execution validator, REB diagnostics |
| **Predictive Learning** | Observational only — Predictive Adjustments, Calibration, and Regime Archive exist but cannot execute filter changes. No adjustment framework. No authority baseline. |
| **Test Coverage** | Backend math: elite. Frontend: zero. Integration: fragile. CI/CD: absent. |
| **Legacy Code** | Significantly reduced — Walter/Bob/Cortex major files deleted (Phases 12-13). ~71 legacy DB tables, residual unused API endpoints, ~40 legacy enums. 2 read-only Walter DB refs remain in routes.ts. |
| **Database** | ~160 tables (44% legacy), no retention policy, no partitioning, 10 GB limit |
| **Frontend** | Improved — 7 dead pages removed (Batch 9), Walter references reduced, regime archive debug UI cleaned (Batch 18C). Still has 91 tab sub-pages and monolithic components. |
| **Regime Model** | DBS implemented (Batch 15) with pair-level + global bias. Structural Regime rename SKIPPED (no value). 5 canonical regimes active. Friction feed deferred to Phase 11 finalization. |
| **Trading Modes** | Long-only. Short trading DEFERRED INDEFINITELY (capital constraint). Replaced by Exchange Expansion (post-launch). |
| **Machine Learning** | Not designed. Prerequisites (Feature Store, Touchpoint Matrix, Infrastructure Proposal) do not exist. |

---

## Strategic Sequencing — Why This Order

Kyle's Next Steps document (2.14.26) lists the full scope of work from current state to live trading. The original roadmap (v1) covered cleanup → MCE → VTS → live mode, but was missing several major workstreams:

1. **Directional Bias & Structural Regime rework** — Must be added to the regime model before VTS can generate meaningful signals
2. **Short trading** — Expands strategy coverage (requires Kraken confirmation)
3. **Phase 11.8B-E (Adjustment Framework)** — Defines which filters may be adjusted, with what bounds, and under what evidence
4. **Phase 11.8C (Authority Baseline)** — Establishes the authoritative baseline state, enabling bounded predictive execution
5. **Rules-based Predictive Execution** — The "Smart Thermostat" layer, allowing pre-ML adaptive filter adjustments
6. **Machine Learning Design & Implementation** — The "Plan to Create a Plan" research phase, followed by actual ML build

These items are now placed in the roadmap at their correct dependency points. The sequencing logic from v1 still holds — you can't install MCE into a contaminated pipeline, and you can't wire VTS without MCE — but the post-MCE scope is significantly larger than v1 captured.

**Revised recommended order (Kyle directive 2026-04-09)**:

Steps 1-8 are COMPLETE (Phases 12-14.7, Batches 1-54).

9. ✅ ~~Fix active pipeline contamination~~ — COMPLETE (Phase 12)
10. ✅ ~~Remove dead code~~ — COMPLETE (Phase 12)
11. ✅ ~~Unify pipeline~~ — COMPLETE (Phase 12)
12. ✅ ~~Install MCE~~ — COMPLETE (Phase 13)
13. ✅ ~~Wire VTS to real calculations~~ — COMPLETE (Phase 14.1)
14. ✅ ~~Directional Bias & Structural Regime~~ — COMPLETE (Phase 14.2)
15. ✅ ~~Dual-path pattern scanning + strategy calibration~~ — COMPLETE (Phases 14.5-14.7)

**Remaining phases (current order):**
1. Finalize Phase 11: Adjustment Framework (11.8B-E) + Authority Baseline (11.8C)
2. Rules-Based Predictive Execution + DB/Legacy Cleanup (Phase 15+16 combined)
3. Paper Mode Full Audit & Debug (Phase 19)
4. Production Hardening (Phase 20)
5. Live Mode Activation — real Kraken orders (Phase 21)
6. Exchange Expansion: XStocks + Perpetual Futures from Kraken (Phase 21.5, post-live)
7. Machine Learning Design (Phase 17, post-live)
8. Machine Learning Implementation (Phase 18, post-live)
9. Publication & Monitoring (Phase 22)


### Batch Approach

All phases use a **mega-batch approach**: one scope document → one code batch → one governance batch per phase. Sub-batches within a phase are avoided unless the phase is genuinely too large. This reduces coordination overhead and ensures each batch is a complete, self-contained unit of work.

The batch sequence for each phase is:
1. **Scope document** — write `BATCH_N_SCOPE.md` to `Claude Comms and Packages/Scope Files/`
2. **Pre-implementation audit** — read every source file, verify all assumptions
3. **Kyle approval** — scope must be approved before code is written
4. **Code batch** (Batch N) — modified files + INSTRUCTIONS.md + README.md → zip → Replit applies → push
5. **Governance batch** (Batch NB) — documentation updates → zip → Replit applies → push
---

## Phase 12: Cleanup & Foundation (Weeks 1-6) — ✅ COMPLETE

**Goal**: Fix critical math errors, harden security, remove all dead code, and unify the active trading pipeline. Creates the clean foundation that everything else depends on.

**Why this is Phase 12**: Phase 11 is still open (11.8B-E and 11.8C remain), but those require MCE + VTS + real data to complete. Phase 12 is independent pre-work that unblocks everything downstream.

### 12.1 Critical Math & Security Fixes (Weeks 1-2)

#### 12.1.1 Fix DI Probability Divergence (BUG-004) — PRE-MCE CRITICAL
- Replace `DI = normalizedConf * 100` (line 1128, signal-orchestrator.ts) with `calculateDirectionalIntegrity(prices)`
- This is a direct math error: the kernel computes Pwin from NGC instead of price geometry
- **Standalone fix, no dependencies**

#### 12.1.2 Fix Dual Friction Models (RISK-009) — PRE-MCE
- Replace `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` (flat 0.5%) with `computeTotalRoundTripCost()` from cost-model.ts
- Affects: signal-orchestrator.ts line 1122, analysis-utils.ts `calculateFriction()`

#### 12.1.3 Security Hardening (RISK-049, RISK-050, RISK-051)
- Remove hardcoded JWT fallback secrets from 9 files — fail hard if `JWT_SECRET` undefined
- Remove `x-internal-audit` header bypass from 4 files
- Fix `regime-archive.ts` JWT secret inconsistency

#### 12.1.4 Remove Simulated Price Display (BUG-020)
- Replace `entryPrice * 1.02` in active-trades.tsx with real price feed

#### 12.1.5 RiskManager Class Cleanup (RISK-084)
- Remove deprecated RiskManager class from 12 import locations across 7 files
- Already replaced by `checkGuardrailRisk()` from `trade-safety.ts`

#### 12.1.6 LSP Error Triage (RISK-085)
- Address critical ~620 TypeScript LSP errors
- Priority: routes.ts (211 errors), storage.ts (66 errors), then null/undefined issues

### 12.2 Dead Code Purge — Waves 1-4.7 (Weeks 2-4)

**Kyle's legacy removal policy**: "Get rid of everything in a way that it can never be accidentally pulled back in." All removals are permanent deletions, not comments.

#### 12.2.1 Wave 1: Safe Deletions (EASY)
- LATTi files (~12 files)
- Strategy Presets files
- Goals ML Engine files
- DHMA Tuning Service files
- Unused SQE threshold exports
- Legacy interface fields in SizedStrategySignal

#### 12.2.2 Wave 1.5: MarketScanner Class Removal (MODERATE)
- Stop instantiating MarketScanner class in routes.ts and startup.ts
- Preserve `collectAdaptiveBatch()` function and REB diagnostic exports

#### 12.2.3 Wave 3: Walter/Bob/Cortex Ecosystem (MODERATE — largest batch, ~96 files)
- All walter-*.ts, bob-*.ts, bobs/*.ts files
- Cortex system (6 files, 4 API endpoints, 9+ consuming services)
- Walter/Bob API routes (~20+ endpoints)
- Walter middleware (bob-routing.ts, chat-logging.ts)
- Phase 8.6.5 route file, provenance-debug.ts
- Walter-related test files

#### 12.2.4 Wave 3.1: Frontend Walter Cleanup
- Remove walter.tsx page, walter-floating-assistant.tsx component
- Remove Walter Approvals tab from settings.tsx
- Remove Walter Activity tab from enhanced-system-monitoring.tsx
- Remove Walter log categories from ai-transparency.tsx
- Remove useWalterPreferences.tsx hook
- Clean Walter notification bell from top-bar.tsx
- Fix BUG-022 (duplicate "learning" tab value)

#### 12.2.5 Wave 4: Friction Model Unification
- Replace all `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` with cost-model calls
- Remove `calculateFriction()` family from analysis-utils.ts

#### 12.2.6 Wave 4.5: Goal Alignment Removal
- Delete from pre-execution-validator.ts and trading-engine.ts
- Remove all goal-related references (daily targets, weekly targets, win rate targets)
- System becomes a two-gate pre-execution validator

#### 12.2.7 Wave 4.7: NLAI System Removal
- Remove 5 NLAI files + related routes and event handlers

#### 12.2.8 Wave 8: Walter-Era Learning Services (5+ files)
- Remove continuous-learning.ts, learning-cycle-service.ts, learning-coordinator.ts, learning-bridge.ts, learning-gate-validator.ts
- Remove unmounted learning.ts route file
- Remove learning-bob.ts and phase-8.6.5-enhancements.ts

#### 12.2.9 Wave 9: Frontend Dead Code
- Delete 7 dead pages (2,771 lines)
- Delete dead hook (use-biometric-auth.ts)
- Remove dead imports and variables
- Clean 123 console.log statements

**Expected outcome**: ~200+ files removed. Codebase reduced by roughly 25-30%.

### 12.3 Pipeline Unification — Wave 2 (Weeks 4-6)

#### 12.3.1 Regime Authority Resolution (BUG-006, BUG-008)
- Rewire DSS to call `calculatePairRegime()` — unify regime classification
- Replace `SYSTEM_GUARDS.STRATEGY_MAP` with `CANONICAL_REGIME_STRATEGY_MAP`

#### 12.3.2 Strategy Routing Expansion
- Use `selectContextAwareStrategy()` for pattern-aware routing
- Replace legacy hybrid types (H1-H4) with canonical definitions
- Update strategy-sync.ts to include all 17 canonical strategies
- Initialize drift detector baselines for 8 new strategies

#### 12.3.3 Confidence Authority Cleanup (Wave 5 partial)
- NGC still flows as confidence carrier — replace with interim deterministic confidence
- Remove NGC-to-DI conversion (already fixed in 12.1.1)
- Remove quality_index.ts NGC computation
- Remove rolling normalization infrastructure

**Expected outcome**: Clean, unified trading pipeline. One regime engine, one strategy map, one confidence source. Ready for MCE.

---

## Phase 13: MCE Installation (Weeks 6-10) — ✅ COMPLETE

**Goal**: Install the Market Calculation Engine (Counsel/Group Think) as the authoritative data provider for the trading pipeline.

> **Completed**: 2026-03-04 (Batch 14 code + Batch 14-hotfix + Batch 14B governance)
> **Actual scope**: MCE core build + pipeline integration + full L12-L20 removal (originally planned for Phase 16, pulled forward). PredictiveConfidence DEFERRED to a future batch.
> **Bugs/risks resolved**: BUG-002, BUG-003, BUG-008, RISK-002, RISK-016, RISK-019, RISK-020
> **Net result**: ~8,200 lines removed, 29 legacy files deleted, 59 API endpoints removed, strategy_type enum expanded 9→18

### 13.1 MCE Core Build
- MCE becomes the single source of truth for market data, indicators, and regime classification
- All indicator computations (VWAP, SMA, RSI, etc.) centralized in MCE
- MCE calculates indicators AND regime per cycle
- Regime classification from `calculatePairRegime()` absorbed into MCE

### 13.2 Pipeline Integration
- Signal Orchestrator consumes MCE output instead of computing indicators independently
- Strategy Engine receives indicators from MCE
- Cost model receives spread/slippage data from MCE
- Telemetry fed from MCE cycle data

### 13.3 PredictiveConfidence Introduction
- PredictiveConfidence becomes sole confidence authority
- Replaces interim confidence from Phase 12.3.3
- Deterministic, strategy-specific confidence modeling

**Expected outcome**: MCE is the authoritative data provider. Single source of truth for all market calculations and regime classification.

---

## Phase 14: VTS Real Calculations & Signal Model Enrichment (Weeks 10-16)

**Goal**: Replace VTS simulation stubs with real strategy-specific calculations, add Directional Bias to the regime model, add Short trading capability, and clear/backfill VTS data. This is the "make the signals real" phase.

### 14.1 Strategy-Specific VTS (BUG-001, RISK-043) — Weeks 10-12 — IN PROGRESS

> **Status**: COMPLETE (Batches 15-18, HF6-HF9). VTS wired to real detect functions. DSS fully deleted. IMF filters relaxed for VTS. OHLC cache. 300 pairs. Governance gate centralized to SQE. All 9 QUANT strategies producing trades. Pattern/hybrid strategies structurally unable to fire — requires Phase 14.5.
>
> **Commits**: Batch 15 through HF7 `64014bd2`
>
> **Remaining 14.1 work** (HF8-HF9):
> 1. Analytics tab: wire `/api/regime-map` to replace hardcoded mapping table in analytics.tsx
> 2. Governance gate into SQE: move trade quality check and confidence floor from paper-execution-engine into SQE so VTS and active trading share same qualification
> 3. TCL duplicate FinalScore check: remove duplicate FinalScore > 0.35 from c13-validation-service.ts
> 4. DSS pre-selector: change DSS from post-filter to pre-selector in dynamic-strategy-selector.ts
> 5. Secondary metrics: make secondaryMetrics fields programmatically evaluable instead of display-only strings
> 6. Return type fix: fix getOpenVirtualTradesForML() return type declaration
> 7. Increase VTS OHLC fetch 50 to 100 candles (adaptive_flow needs 65, support_bounce needs 50)
> 8. Provide BTC candles to VTS for defensive_hedge (currently always returns null in simulation)

- Each of 17 strategies gets unique entry logic, stop logic, target logic, and confidence modeling
- Kyle: "Each strategy must have unique entry logic, unique stop logic, unique target logic, unique confidence modeling"
- Replace `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` with real calculations
- VTS consumes MCE indicators for realistic strategy evaluation
- VTS calculates signals for all strategies for the calculated regime
- Ensure FinalScore, Hybrid Score, Confidence, Regime Weight, etc. are being calculated in VTS and fed into predictive learning

### 14.1B VTS/Orchestrator Timeframe Alignment — NEW

The VTS uses 15-minute candles and the signal orchestrator uses 60-minute candles. This means the same pair at the same moment gets different regime classifications from each system. If VTS learns on 15-min conditions and active trading executes on 60-min conditions, the ML learning may not transfer accurately. Must be resolved before Phase 14.4 (VTS Data Clear and Backfill).

### 14.5 Parallel Pattern Scanning + Signal Ranking Overhaul + Global Regime Pre-Filter — NEXT (Block 3, Batch 19)

**Goal**: With $834 portfolio and ~4-5 open trade slots, ensure the RTB queue always has the best possible opportunities at the top. Achieved through three integrated changes:

**Guiding principle**: The bottleneck is not signal generation speed — it's signal quality at the top of the RTB queue.

#### 14.5.1 Dual-Path Pattern Scanning
Pattern and hybrid strategies are structurally unable to fire in the current architecture. The quant-oriented filtering pipeline (min volume $1M, RSI 30-70, volatility 0.5-5%) eliminates pairs before pattern detection runs.

**Design**: FX5 scanner outputs two pools:
- **Quant pool** (existing filters): Available to ALL strategies (quant + pattern + hybrid)
- **Pattern pool** (new looser filters: $250K volume, RSI 15-85, wider volatility, maxVolNoise 0.7): Available to PATTERN + HYBRID strategies only

Signal orchestrator evaluates both pools (confirmed strategy-agnostic — doesn't care about signal type). Both pools feed into the same RTB queue. Pattern-pool signals tagged `sourcePool: 'pattern'` for telemetry.

**Pattern-specific risk guardrails**: Elevated FinalScore threshold (0.45 vs 0.35 for quant), tighter position sizing (15% max vs 25%). Pattern signals must be BETTER than quant signals to execute, not just equal.

**VTS integration**: VTS gets same dual-path scanning for ML training data across all strategy types.

**UI**: New Pattern Scanning tab in Trading page showing pattern filter process.

#### 14.5.2 Expected Return Magnitude in Signal Ranking
New composite `rankingScore` for RTB queue ordering:
```
rankingScore = (FinalScore x QUALITY_WEIGHT) + (returnMagnitude x RETURN_WEIGHT)
```
- SQE gating stays on FinalScore alone (0.35 minimum, non-negotiable quality floor)
- rankingScore used ONLY for RTB queue ordering
- returnMagnitude is net-of-fees, normalized (5% net = 1.0 ceiling)
- Weights are regime-conditional (RANGE_BOUND: 0.10, IMPULSE_EXPANSION: 0.20, default: 0.15)
- Safety rule: FinalScore gap > 0.10 → FinalScore always wins. Gap < 0.05 → higher returnMagnitude wins.
- Solves the "apples to apples" problem: quant and pattern signals compared on same composite score

#### 14.5.3 Global Regime Pre-Filter (small effort, bundled)
New `GlobalRegimeService` (~150 lines): BTC regime snapshot + scan hints on 60-second cache. FX5 adjusts filter parameters per global regime. Signal orchestrator skips regime-inappropriate strategy types. No new Kraken API calls. Reduces pipeline noise by 30-50%.

### 14.2 Directional Bias & Structural Regime Rework — Weeks 12-14 — EFFECTIVELY COMPLETE

> **Status**: DBS (Directional Bias Score) implemented in Batch 15 — pair-level + global bias calculation, DBS confidence modifier applied to trade scoring, 6 context dimensions captured at trade OPEN. Kyle decisions (2026-03-08): Skip regime→structural regime rename (no value). Skip DBS backfill into VTS signals (unnecessary). Skip Global Structural Regime feature (low incremental value). No further work needed.

~~This is a significant enrichment of the regime model. The current system classifies regime but has no concept of directional bias or the distinction between global and pair-level structural regime.~~

#### 14.2.1 Rename & Restructure: "Regime" → "Structural Regime"
- Rename regime classification throughout the codebase
- Change frontend labels, API responses, and database fields from "Regime" to "Structural Regime"

#### 14.2.2 Add Directional Bias
- Implement Directional Bias calculation (Global and Pair-level)
- Directional Bias should be factored into strategy selection and mapping
- Backfill VTS simulated signals with Directional Bias
- Add to regime-strategy mapping as a selection factor

#### 14.2.3 Global vs Pair-Level Dimensions
- Implement both Global and Pair-level for:
  - Structural Regime
  - Directional Bias
  - Friction
- All three dimensions at both levels should feed into predictive learning for correlation, trend analysis, and possible relationships with trade success outcomes

> **Note**: Kyle has an existing Word document with detailed steps for this work. That document should be referenced when this phase begins.

### 14.3 Short Trading — DEFERRED INDEFINITELY
> Requires significant capital not currently available. Replaced on roadmap by Exchange Expansion (post-launch): adding an exchange supporting stocks/ETFs/tokenized assets/futures to expand tradeable asset classes with limited portfolio.

#### 14.3.1 Kraken Confirmation
- Confirm Kraken allows short trading on target pairs
- Identify any API differences for short orders vs long orders

#### 14.3.2 Short Strategy Implementation
- Add short trading ability to Trading Engine
- Add short strategies to VTS signal generation
- Update strategy-signal pipeline to support short signals
- Update risk management / guardrails for short positions (different risk profile)

> **Note**: Kyle has an existing Word document with detailed steps for short trading implementation. That document should be referenced when this phase begins.

### 14.4 VTS Data Clear & Backfill — CANCELED
> Kyle decision 2026-03-08. VTS data will not be cleared/backfilled.

#### 14.4.1 Clear Simulated Data
- Clear all simulated trading results data/learning from VTS simulations
- Kyle note: "Some of the VTS data is still useful — see if correct calculations can be generated to backfill existing data"
- Audit VTS data to determine what can be salvaged vs what must be regenerated

#### 14.4.2 Backfill with Real Calculations
- Run VTS with real strategy calculations against historical data
- Backfill VTS signals with Directional Bias data
- Calibrate strategy parameters using actual performance data
- Initialize adaptive learning weights from real performance
- Verify FinalScore, Hybrid Score, Confidence, Regime Weight are flowing correctly

**Expected outcome**: VTS produces real, strategy-specific signals enriched with Directional Bias and Structural Regime. Short strategies available. Simulated data replaced with real calculations.

---

## Phase 11 Finalization: 11.8B-E & 11.8C (Weeks 16-18)

**Goal**: Complete the remaining Phase 11 work — the Adjustment Framework and Authority Baseline. These were deferred because they require MCE + real VTS calculations to be meaningful.

**Why this comes after Phase 14**: The Adjustment Framework (11.8B-E) defines which filters may be adjusted and with what bounds. The Authority Baseline (11.8C) establishes the authoritative baseline state. Both require the system to be producing real data (MCE indicators, real VTS signals, Directional Bias) before the framework and baseline can be defined against reality rather than simulated data.

### 11.8B-E: Adjustment Framework (Week 16-17)

This is the "decision constitution" — it answers: What may be adjusted? Under what evidence? With what bounds? At what cadence? With what safety guarantees?

#### What 11.8B-E Defines:
- **Which filters may be adjusted**: Enumerate every adjustable parameter (e.g., minVolume, FinalScore threshold, confidence floors, regime thresholds)
- **Adjustment types**: Small, bounded, reversible, slow-moving
- **Evidence requirements**: What data must exist before an adjustment is allowed (minimum trades, minimum time window, statistical significance)
- **Cadence rules**: How often adjustments can change (prevent jitter)
- **Safety guarantees**: Maximum adjustment magnitude, mandatory reversion if outcomes degrade, audit trail requirements
- **Explicit statement**: "Predictive learning may execute bounded, rules-based filter adjustments once baseline authority (11.8C) is established, without requiring machine learning."

#### What 11.8B-E Explicitly Includes:
- A slot for executable, rules-based policies (not just observational)
- A distinction between policy definition and policy execution
- The three-layer learning stack model:
  - **Predictive Adjustments** (micro, fast) — pattern-level confidence tuning
  - **Learning Calibration** (medium, batch) — structural strategy/regime learning
  - **Regime Archive** (long-horizon) — historical memory, audit trail

### 11.8C: Authority Baseline (Week 17-18)

This is the authoritative "Version 1.0" of the system's learned knowledge, established against real MCE data and real VTS calculations.

#### What 11.8C Establishes:
- The single, authoritative baseline state for all adjustable parameters
- Canonical weights for every strategy × regime combination (based on real data, not simulation)
- Baseline confidence expectations per strategy
- Baseline filter thresholds
- The "known-good" state that all future adjustments are measured against
- Checkpoint that can be rolled back to if learning degrades

#### After 11.8C:
- Bounded, rules-based predictive execution is UNLOCKED
- Controlled systems may make bounded adjustments relative to the baseline
- Authority can be exercised by: a human, a rules engine, a predictive system, or eventually ML
- **Phase 11 is officially CLOSED**

**Expected outcome**: Adjustment Framework defined. Authority Baseline established against real data. Phase 11 closed. Rules-based predictive execution unlocked.

---

## Phase 15: Rules-Based Predictive Execution (Weeks 18-20)

**Goal**: Enable the "Smart Thermostat" — allow the predictive learning system to make bounded, rules-based filter adjustments. This is the pre-ML adaptive layer.

**Analogy from Kyle's 11.8 document**: This is Version 2 (Smart Thermostat) — rules + sensors, no AI. Not Version 1 (static manual settings) and not Version 3 (AI/ML optimization). Version 2 is what you want before going live.

### 15.1 Rules-Based Policy Engine
- Implement the policy execution layer defined by 11.8B-E
- Policies are deterministic, explainable, reversible
- Example policy: "In LOW_VOL_CHOP regime, increase minVolume by 15%"
- Example policy: "When signal density exceeds threshold, raise FinalScore threshold by +0.05"
- All adjustments logged, auditable, and bounded by 11.8B-E constraints

### 15.2 Predictive Adjustment Execution
- Wire Predictive Adjustments (currently observational-only) to execute bounded changes
- Pattern confidence multipliers can now modify behavior (within 11.8B-E bounds)
- Strategy weighting influenced by recent performance data
- Hybrid score contributions dampened/boosted based on pattern outcomes

### 15.3 Calibration Execution
- Learning Calibration can now update canonical weights (within 11.8B-E bounds)
- Recommendations become executable (not just observational)
- Canonical strategy weights per regime adjusted based on real performance
- All mutations logged against Authority Baseline for comparison

### 15.4 Regime-Aware Adaptation
- Structural Regime (Global + Pair-level) drives filter adjustments
- Directional Bias feeds into strategy selection weighting
- Friction data feeds into risk parameter adjustments
- All three dimensions (Structural Regime, Directional Bias, Friction) at both levels feeding into predictive learning for correlation analysis

**Expected outcome**: System adapts to market conditions using rules + statistics. Not static, not ML. The intelligent middle ground.

---

## Phase 16: Database & Remaining Legacy Cleanup (Weeks 20-23)

**Goal**: Clean remaining legacy infrastructure — legacy database tables, remaining dead code, and schema simplification.

> **Note**: Wave 6 L-Series Cluster Removal was completed early in Phase 13 (Batch 14, 2026-03-04). The entire L12-L20 cluster (29 files, 59 endpoints, ~8,200 lines) has been permanently deleted. What remains for Phase 16 is database table cleanup, schema work, and any remaining legacy cleanup.

### ~~16.1 Wave 6: L-Series Cluster Removal~~ — ✅ DONE (Phase 13, Batch 14)
All L-Series services (17), route files (9), and utilities (2) removed. M3B validation service also removed. See Phase 13 completion notes above.

### 16.2 Database Phase A-B: Isolation & Modularization
- Confirm which legacy tables still have active writers (Phase A)
- Split storage.ts into domain-specific modules (Phase B)
- **Critical ordering**: storage.ts must be modularized BEFORE legacy tables are dropped

### 16.3 Database Phase C: Schema Simplification
- Drop Wave 3 tables (10 Walter tables) — if not already done in Phase 12
- Drop Wave 6 tables (~57 L-Series + ethics + cluster tables)
- Drop Wave 10 tables (4 paper duplicates + V1 guardrails)
- Remove ~40 legacy enums
- Clean schema.ts of dead definitions

### 16.4 Wave 7: Post-L-Series Cleanup
- SafetyGuardrails service removal
- Remaining consumer cleanup

### 16.5 LSP Error Resolution
- Delete legacy files causing LSP errors
- Fix remaining LSP error causes in active code
- Target: zero or near-zero LSP errors in active codebase

**Expected outcome**: All legacy infrastructure permanently removed. Schema cleaned. ~71 legacy tables dropped. LSP errors resolved.

---

## Phase 17: Machine Learning Design (Weeks 23-28)

**Goal**: Execute the "Plan to Create a Plan" — perform the research, mapping, and design work required to produce the ML implementation blueprint (Directive 18.0). This is NOT the ML build itself.

**Source**: "The Plan to Create A Plan for Machine Learning - Phase 12" (1.17.26) — now renumbered to Phase 17 to fit the updated sequence.

> **Important note from Kyle**: This phase will likely require a dedicated brainstorming/design discussion session to decide what the machine learning architecture will look like. The system audit (Phases 1-11) provides the foundation knowledge, but the ML design decisions need collaborative input.

### 17.1 Scope & Grounding (Week 23)
- Define full scope of ML integration
- Align audit categories (functional, architectural, behavioral)
- Establish criteria for "complete system visibility" for ML purposes
- Create audit template for every subsystem: name, role, inputs, outputs, key functions, calculations, dependencies, update frequency, performance sensitivity, ML integration potential, verification requirements

### 17.2 ML Touchpoint & Influence Mapping (Weeks 24-25)

#### Feature Extraction Points (Outbound — what ML will learn from):
- Market State (volatility, spread, LQ/VN)
- Contextual Data (time, session, liquidity)
- Signal Metadata (strategy, pattern, score)
- Trade Lifecycle (open/close outcomes)
- Guardrail Metrics (IMF, SQE)
- Structural Regime, Directional Bias, and Friction Scores (Global + Pair-level)
- Predictive Adjustment history and outcomes

#### Influence Points (Inbound — where ML output goes):
- DSS (strategy weighting)
- SQE (signal qualification)
- RTB Queue (queue pruning)
- DSE (dynamic sizing & stop management)
- DSS & IMF thresholds (auto-tuning)
- Canonical weight updates (replacing rules-based calibration)

#### Deliverable: ML Touchpoint Matrix
- Every component → data → ML interaction
- Labeled as: Outbound (learning source), Inbound (intelligence consumer), Bidirectional (adaptive feedback)

### 17.3 Infrastructure Design (Weeks 25-26)
- In-process module vs local microservice decision
- Inter-process communication design (gRPC, WebSocket, shared memory)
- Persistent state store design (on-disk or vector DB) for context preservation
- Rolling memory buffers for real-time adaptive recall
- Performance budgeting: model inference latency budget (<100ms per signal)
- CPU/GPU resource profiling and trade-off options
- Safe Mode fallback design: revert to rules-based (Phase 15) if ML misbehaves
- Watchdog for memory drift or performance degradation
- **Requirement**: Must run entirely locally, no cloud dependency

### 17.4 Research & Feature Engineering (Weeks 26-27)
- Evaluate ML architectures: Gradient Boosted Trees (tabular data), RL agents (adaptive sizing), etc.
- Assess local ML libraries: ONNX runtime, LightGBM, PyTorch local
- Feature Store schema design (universal, normalized, labeled)
- Explainability tools: SHAP, LIME for transparency and trust
- Model Drift Detection design
- Real-time dashboard design for confidence and error rates
- Auto-trigger "safe mode" when drift exceeds threshold

### 17.5 Blueprint Assembly (Weeks 27-28)
- Merge data flow, touchpoints, infrastructure into actionable directive
- Development milestones (Crawl, Walk, Run, Fly)
- Testing protocols
- Rollback procedures
- Monitoring dashboards

#### Deliverable: Directive 18.0 (Comprehensive Predictive Learning Architecture)
- The fully vetted, implementation-ready ML plan
- Reviewed and approved by Kyle before Phase 18 begins

**Expected outcome**: Complete ML architecture design. Feature Store schema. Touchpoint Matrix. Infrastructure proposal. Implementation blueprint ready for execution.

---

## Phase 18: Machine Learning Implementation (Weeks 28-34)

**Goal**: Build and deploy the ML system as designed in Phase 17. This replaces and extends the rules-based predictive execution from Phase 15.

> **Note**: The specific sub-phases of Phase 18 will be defined by Directive 18.0 (the output of Phase 17). The following is a high-level outline — the actual implementation plan will be much more detailed.

### 18.1 Crawl: Feature Store & Data Pipeline
- Build Feature Store with schema from Phase 17.4
- Wire all Outbound touchpoints (data capture)
- Validate data quality and completeness
- Historical data ingestion for initial training

### 18.2 Walk: Model Training & Validation
- Train initial models on historical data
- Validate against paper trading results
- A/B comparison: ML predictions vs rules-based predictions (Phase 15)
- Explainability verification (SHAP/LIME outputs make sense)

### 18.3 Run: Integration & Parallel Execution
- Wire Inbound touchpoints (ML output → system logic)
- Run ML in parallel with rules-based system (shadow mode)
- Compare outcomes, calibrate confidence
- Drift detection active

### 18.4 Fly: ML as Primary Intelligence
- ML replaces rules-based policies as primary decision layer
- Rules-based system becomes fallback (Safe Mode)
- Continuous learning active within 11.8B-E bounds
- Monitoring dashboards live

### ML Safety Principles (Throughout):
- No overwrite without versioning — all static logic remains as fallbacks
- Everything observable — every ML output or adjustment logged and auditable
- Fail gracefully — if ML crashes or returns low confidence, revert to rules-based (Phase 15)
- Performance first — ML inference cannot block or delay live trading functions
- Authority Baseline (11.8C) is the floor — ML cannot violate the bounds defined by 11.8B-E

**Expected outcome**: ML system operational, producing real adaptive intelligence. Rules-based system retained as Safe Mode fallback.

---

## Phase 19: Paper Mode Audit & Debug (Weeks 34-37)

**Goal**: Run the complete system end-to-end in Paper Mode with all components active (MCE, real VTS, Directional Bias, Short Trading, Predictive Execution, ML). Find and fix everything before live capital.

### 19.1 Paper Trading Run
- Run extended paper trading with full system
- All 17+ strategies active (including short strategies)
- MCE providing real indicators
- VTS generating real signals
- Predictive execution making bounded adjustments
- ML active (or in shadow mode if not ready)
- Structural Regime, Directional Bias, and Friction all flowing

### 19.2 Audit & Debug
- Verify FinalScore, Hybrid Score, Confidence, Regime Weight are all calculating correctly
- Verify Directional Bias is feeding into strategy selection
- Verify short positions execute correctly (if Kraken-confirmed)
- Verify predictive adjustments are bounded and reversible
- Verify ML outputs are explainable and within bounds
- Verify kill switch, guardrails, and safety systems function under all conditions
- Fix all discovered issues

### 19.3 Performance Validation
- Compare paper results to expectations
- Validate strategy performance across regimes
- Confirm learning systems are improving signal quality
- Validate data retention and archiving

**Expected outcome**: Fully debugged paper trading system. All components validated. Ready for production hardening.

---

## Phase 20: Production Hardening (Weeks 37-40)

**Goal**: Harden the system for live trading. Fix all remaining infrastructure, security, and quality concerns.

### 20.1 Database Phase D: Migration Rebaseline
- Generate fresh baseline migration from current schema.ts
- Archive old migration files
- Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate`

### 20.2 Database Phase E: Index & Retention Hygiene
- Audit index usage via `pg_stat_user_indexes`
- Drop unused indexes
- Implement retention policies (Hot 0-30d / Warm 30-90d / Cold 90d+)
- Time-based partitioning for high-volume append-only tables

### 20.3 Test Infrastructure
- Add unified test runner scripts (`test:unit`, `test:e2e`, `test:all`)
- Install @testing-library/react + jest-dom for frontend tests
- Minimum frontend test targets: auth token refresh, TradingModeContext, WebSocket reconnection, TopBar start/stop
- Property-based testing for core math (fast-check)
- CI/CD pipeline (GitHub Actions workflow)

### 20.4 Security Finalization
- RBAC enforcement standardization across all routes (RISK-055)
- API versioning (`/api/v1/` namespace) (RISK-056)
- JWT token migration from localStorage to httpOnly cookies (RISK-063)
- Endpoint cleanup: remove any remaining unused server endpoints

### 20.5 Architecture Cleanup
- Decompose monolithic pages (enhanced-system-monitoring 4,528 lines, ai-transparency 2,074 lines)
- Define centralized polling policy (POLLING_TIERS)
- Decompose routes.ts into domain-specific route files

**Expected outcome**: Production-grade infrastructure. Tests, security, database hygiene all at deployment standard.

---

## Phase 21: Live Mode Activation (Weeks 40-43)

**Goal**: Create and validate live mode trading on Kraken.

### 21.1 Live Mode Engine
- Create Live Mode trading engine based on Paper Mode trading engine
- Resolve BUG-010, BUG-011 (TradingEngine placeholder code for live mode)
- Validate Kraken API integration for live orders (long AND short if confirmed)
- Test live order execution path end-to-end
- Validate kill switch functions correctly for live mode

### 21.2 Paper-to-Live Transition Testing
- Run parallel paper+live (small position sizes) to validate consistency
- Compare paper sim results with live execution results
- Validate fee/slippage models against actual Kraken fills
- Validate cost-model accuracy against real Kraken fee schedules

### 21.3 Live Mode Guardrails
- Validate all risk management guardrails for live mode
- Test emergency shutdown procedures
- Validate database monitoring alerts function correctly
- Confirm ML Safe Mode fallback works under live conditions
- Verify predictive execution bounds hold under real market volatility

**Expected outcome**: Live trading validated. Parallel paper+live confirms consistency. Ready for production.

---

## Phase 22: Publication (Weeks 43+)

**Goal**: Prepare the application for production deployment.

### 22.1 Build & Deploy Pipeline
- Production build validation
- Environment configuration (staging vs production)
- Database provisioning (consider Neon tier upgrade if approaching 10 GB)

### 22.2 Monitoring & Observability
- Production logging strategy (structured logging replacing console.log)
- Health monitoring endpoints
- Performance monitoring
- Error alerting
- ML performance dashboards (live)


---

## Phase 21.5: Exchange Expansion — XStocks + Perpetual Futures (Post-Live)

**Goal**: Expand tradeable asset classes by adding Kraken XStocks (tokenized stocks/ETFs) and Perpetual Futures to the scanning and trading pipeline. This is the first major feature addition after going live.

**Why post-live**: The system needs to be proven with live crypto spot trading before expanding to new asset classes. Live trade data and operational experience inform how new asset types are integrated.

### 21.5.1 Kraken XStocks Integration
- Add Kraken XStocks API endpoints (tokenized stocks, ETFs)
- Asset-class-specific filter profiles in screener_filters DB
- Strategy eligibility per asset class (some strategies may not apply to stocks)
- UI: asset class selector/filter in trading and analytics views

### 21.5.2 Perpetual Futures Integration
- Add Kraken Futures API endpoints
- Funding rate awareness in cost model
- Leverage-aware position sizing in guardrails
- Short trading capability (futures enable shorts without capital constraints)
- Futures-specific risk management (liquidation prevention, margin monitoring)

### 21.5.3 Cross-Asset Infrastructure
- Unified portfolio view across asset classes
- Asset-class-aware regime classification (crypto, equity, futures may have different regime characteristics)
- Performance tracking per asset class

---

## Post-Launch Enhancement Priorities

These items are deferred and not currently sequenced. Listed for reference:

### WebSocket Event Triggers
- Real-time Kraken WebSocket feeds for time-sensitive opportunity detection between scan cycles
- Supplements (does not replace) timer-based scanning

### Parallel Signal Generation
- Promise.all batching in evaluateMarket() for concurrent pair evaluation
- Only if throughput becomes a constraint

---

## Timeline Summary (Revised 2026-04-09)

| Phase | Status | Key Milestone |
|-------|--------|---------------|
| **Phase 12: Cleanup & Foundation** | ✅ COMPLETE | Math fixed, ~200+ dead files removed, pipeline unified |
| **Phase 13: MCE Installation** | ✅ COMPLETE | MCE as authoritative data provider |
| **Phase 14.1-14.2: VTS + DBS** | ✅ COMPLETE | Real signals, regime, directional bias |
| **Phase 14.5: Pattern Scanning + Ranking** | ✅ COMPLETE | Dual-path scanning, merit-based ranking, filter diagnostics |
| **Phase 14.6: Family-Qualified Identity** | ✅ COMPLETE | Family IMF, data truth, pipeline metrics |
| **Phase 14.7: Strategy Calibration** | ✅ COMPLETE | 17-strategy audit, pattern recognizer, hardcoded defaults removed |
| **Migration (Batch 40-47)** | ✅ COMPLETE | Hetzner + Supabase, post-migration stabilization |
| **Phase 11.8: Adjustment Framework + Baseline** | **NEXT** | Defines adjustment bounds, establishes authority baseline |
| **Phase 15+16: Smart Thermostat + DB Cleanup** | PLANNED | Rules-based adaptive filters + legacy table/schema cleanup |
| **Phase 19: Paper Mode Audit & Debug** | PLANNED | Full system validated in paper trading |
| **Phase 20: Production Hardening** | PLANNED | Testing, security, RBAC, deployment pipeline |
| **Phase 21: Live Mode Activation** | PLANNED | Real Kraken orders, paper-to-live validation |
| **Phase 21.5: XStocks + Perpetual Futures** | PLANNED (post-live) | Kraken tokenized stocks + futures integration |
| **Phase 17: Machine Learning Design** | PLANNED (post-live) | ML architecture blueprint (Directive 18.0) |
| **Phase 18: Machine Learning Implementation** | PLANNED (post-live) | ML system built, Crawl/Walk/Run/Fly |
| **Phase 22: Publication & Monitoring** | PLANNED | Production deploy, observability, structured logging |
| **Phase 20: Production Hardening** | 37-40 | Tests, security, database, architecture finalized |
| **Phase 21: Live Mode Activation** | 40-43 | Live trading validated on Kraken |
| **Phase 22: Publication** | 43+ | Production deployment |

**Total estimated duration**: ~43+ weeks (vs ~20 weeks in v1 roadmap)

> **Why the difference**: The v1 roadmap omitted Directional Bias, Short Trading, Adjustment Framework, Authority Baseline, Predictive Execution, and the entire Machine Learning design & implementation cycle. These are not optional — they are core to Kyle's vision of a system that goes live with adaptive intelligence, not static filters.

---

## Phase Dependency Chain

```
Phase 12 (Math + Dead Code + Pipeline) ── COMPLETE
    └→ Phase 13 (MCE) ── COMPLETE
        └→ Phase 14.1 (VTS Real Calcs) ── COMPLETE
            ├→ Phase 14.2 (DBS) ── EFFECTIVELY COMPLETE (Batch 15)
            ├→ Phase 14.3 (Short Trading) ── DEFERRED INDEFINITELY
            ├→ Phase 14.4 (Data Backfill) ── CANCELED
            │
            └→ Phase 14.5 (Pattern Scanning + Ranking + Regime Pre-Filter) ← NEXT
                └→ Phase 11 Final (11.8B-E, 11.8C)
                    └→ Phase 15 (Adaptive Weights + Rules Engine + Monitor)
                        └→ Phase 19 (Paper Debug)
                            └→ Phase 20 (Hardening)
                                └→ Phase 21 (Live Mode)

Post-Launch: Exchange Expansion → ML (Phase 17+18) → AWS/Supabase Migration
```

---

## Risk Assessment

### Highest Risk Actions
1. **Phase 14.5 Dual-Path Pattern Scanning** (Batch 19) — Adds pattern pool alongside existing quant pool in FX5 scanner and signal orchestrator. Risk: Pattern signals with lower quality could dilute RTB queue if ranking weights miscalibrated.
2. **Phase 11 Finalization — Adjustment Framework** (11.8B-E) — Wiring predictive learning adjustments into live filter modifications. Risk: Bad adjustments could systematically degrade signal quality.
3. **ML Integration** (Phase 18.3) — Wiring ML output into live decision systems. Requires Safe Mode fallback.
4. **Live Mode Activation** (Phase 21) — Transitioning from paper to real money. Risk: Any latent bugs in execution pipeline become financial losses.
5. **Exchange Expansion** (Post-launch) — Adding new exchange with different API, order types, and fee structures. Risk: Integration complexity and regulatory differences.

### Lowest Risk Actions (Quick Wins)
1. **12.1.6 LSP Error Triage** — ~620 type annotation errors. Low severity, no logic impact. Deferred.
2. **BUG-021 system-config.tsx fetch** — Replace raw fetch() with apiRequest. Standalone, no dependencies.
3. **BUG-022 duplicate tab value** — Rename duplicate "learning" tab value. Trivial UI fix.
4. **Global Regime Pre-Filter** (Phase 14.5 Part C) — Small effort, uses existing BTC OHLC from MCE. Low risk.
5. **Regime archive stale data cleanup** — Purge pre-HF9 telemetry with old regime names from archive files.

### Critical Decision Points Requiring Kyle Input
1. ~~**Phase 14.3**: Does Kraken confirm short trading?~~ **RESOLVED** — DEFERRED INDEFINITELY (capital constraint). Replaced by Exchange Expansion post-launch.
2. **Phase 17**: ML architecture brainstorming session needed. In-process vs microservice? Which ML libraries? What's the inference latency budget?
3. **Phase 18**: Crawl-Walk-Run-Fly milestones — at what point is ML "good enough" to proceed to Paper Debug?
4. **Phase 21**: Position sizes for parallel paper+live testing. What's the risk budget for live validation?
5. **Exchange Selection**: Which exchange to add post-launch? Must support stocks/ETFs/tokenized assets/futures.

---

## Mapping to Kyle's "Next Steps" Document (Cross-Reference)

| Kyle's Next Steps Item | Roadmap Phase | Notes |
|------------------------|---------------|-------|
| Complete audit for MCE install | Phase 12 (done) | System audit is the 11-phase work we just completed |
| Install the MCE | Phase 13 | MCE / Counsel / Group Think installation |
| VTS to mirror strategy calcs / create real signals | Phase 14.1 | Strategy-specific VTS calculations |
| VTS to calculate signals for all strategies per regime | Phase 14.1 | Included in real VTS implementation |
| Clear simulated VTS data / backfill | Phase 14.4 | Data clear + backfill with real calculations |
| FinalScore, Hybrid Score, etc. fed into predictive learning | Phase 14.1, 14.4 | Verified during backfill |
| Finish 11.8B-E and 11.8C | Phase 11 Finalization | After MCE + VTS, before live |
| Check for other outstanding Phase 11 fixes | Phase 11 Finalization | Part of closing Phase 11 |
| Add Directional Bias + Structural Regime | Phase 14.2 | Includes Global/Pair-level + Friction |
| Backfill VTS with Directional Bias | Phase 14.4 | Part of data backfill |
| Add Short trading | Phase 14.3 | Requires Kraken confirmation |
| Add Machine Learning | Phase 17 (design) + Phase 18 (build) | Full ML lifecycle |
| Run, audit, debug Paper Mode | Phase 19 | Extended paper trading validation |
| Delete legacy files, fix LSP errors | Phase 12.2 + Phase 16 | Split across pre-MCE and post-MCE cleanup |
| Create Live Mode trading engine | Phase 21 | Based on Paper Mode engine |

---

## Pushback on Original Sequencing (Updated)

The v1 roadmap's pushback on "MCE first" still applies — Phases 12.1-12.3 (math fixes, dead code purge, pipeline unification) must precede MCE. But the v1 roadmap also had a critical gap: it went directly from VTS → L-Series removal → production hardening → live mode, skipping:

- **The Adjustment Framework and Authority Baseline** — Without these, the system goes live with static filters. Kyle's own document says this is unacceptable: "You want Version 2 (Smart Thermostat) before you go live. Not Version 1 (static). Not Version 3 (ML) yet."
- **Directional Bias** — The regime model is incomplete without it. VTS signals generated without Directional Bias are missing a key dimension.
- **Short Trading** — Cuts available strategy space roughly in half if omitted.
- **Machine Learning** — Kyle's plan was always to have ML before going live. The "Plan to Create a Plan" document outlines a 6-7 week design phase alone.

The revised roadmap captures all of this. The tradeoff is timeline: ~43 weeks vs ~20 weeks. But the ~20 week estimate was for a stripped-down version that would have gone live with static filters, no Directional Bias, no short trading, and no ML. That's not the system Kyle is building.

---

*Roadmap v2 complete. Incorporates all four source documents. Ready for Kyle's review and approval before Phase 12 Directive 12.1 is written.*
