# Phase 4: Risk Management, Guardrails & Portfolio

> **Version**: v1.1 (Phase 4 Addendum applied)
> **Date**: 2026-02-16
> **Author**: Claude Code (System Cartographer)
> **Scope**: Everything that prevents bad trades and protects capital
> **Covers Replit Items**: Guardrail System, Trade Safety, Circuit Breaker, GASP (LEGACY), PDC (LEGACY — if autonomy-bound), Risk Concentration, Covariance Guard, Paper Portfolio Manager, Portfolio Aggregator, Kraken Service
> **Files Audited**: 18 files deep-read, 2 config files, 1 YAML rule definition
> **Addendum**: Kyle's Phase 4 Addendum (2026-02-16) reclassified GASP, PDC, and Goal Alignment as legacy. See Sections 12A, 13, 7, and 23-24.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Guardrails V2 Database Layer](#2-guardrails-v2-database-layer)
3. [Coherency Rules Engine](#3-coherency-rules-engine)
4. [GuardrailPolicy Service](#4-guardrailpolicy-service)
5. [Guardrail Settings Helper](#5-guardrail-settings-helper)
6. [Trade Safety Service](#6-trade-safety-service)
7. [Pre-Execution Validator](#7-pre-execution-validator)
8. [Dynamic Sizing Engine (DSE)](#8-dynamic-sizing-engine-dse)
9. [Kill Switch Architecture](#9-kill-switch-architecture)
10. [Adaptive Guardrails Engine](#10-adaptive-guardrails-engine)
11. [Circuit Breaker](#11-circuit-breaker)
12. [GASP Coordinator](#12-gasp-coordinator)
13. [PDC Engine](#13-pdc-engine)
14. [Risk Concentration Analyzer](#14-risk-concentration-analyzer)
15. [Covariance Engine](#15-covariance-engine)
16. [Paper Portfolio Manager](#16-paper-portfolio-manager)
17. [Portfolio Aggregator](#17-portfolio-aggregator)
18. [Kraken Service](#18-kraken-service)
19. [Legacy Classification: SafetyGuardrails Service](#19-legacy-classification-safetyguardrails-service)
20. [Legacy Classification: L-Series Autonomy Cluster](#20-legacy-classification-l-series-autonomy-cluster)
21. [Cross-References](#21-cross-references)
22. [Critical Findings](#22-critical-findings)
23. [Forward Audit Standard: Parallel System Detection](#23-forward-audit-standard-parallel-system-detection)
24. [File Catalog](#24-file-catalog)

---

## 1. Architecture Overview

DawnTrader's risk management operates as a **layered defense system** with five distinct tiers:

```
TIER 1 — PRE-TRADE GUARDRAILS (prevents bad trades from executing)
  ┌─────────────────────────────────────────────────────────┐
  │  Trade Safety Service (checkGuardrailRisk)              │
  │  8 sequential checks + correlation exposure             │
  │  Pre-Execution Validator (goal alignment + fee-aware)   │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 2 — POSITION SIZING (right-sizes trades that pass Tier 1)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Dynamic Sizing Engine (DSE)                            │
  │  size = baseSize x f(edge, vol, cost, conf, pressure)  │
  │  Bounded: 0.3 <= multiplier <= 1.2                     │
  │  Risk Concentration scaling factor (0.25-1.0)          │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 3 — PORTFOLIO PROTECTION (protects running portfolio)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Kill Switch (daily loss threshold auto-shutdown)       │
  │  Covariance Guard (correlation exposure prevention)     │
  │  Paper Portfolio Manager (drawdown/exposure monitoring) │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 4 — SYSTEM STABILITY (meta-level protection)
  ┌──────────────────────────┴──────────────────────────────┐
  │  GASP — LEGACY (L-Series Autonomy Cluster)              │
  │  PDC  — LEGACY (if autonomy-bound, L-Series Cluster)    │
  │  Circuit Breaker (fault tolerance for external APIs)    │
  │  ⚠ GASP/PDC do NOT touch active trade flow.             │
  │  ⚠ Confirmed architecturally inert — closed loop.       │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 5 — ADAPTIVE LEARNING (tuning protection parameters)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Adaptive Guardrails (micro-adjustments +/- 1-3%)      │
  │  Coherency Rules (validates all changes stay sane)      │
  │  Learning throttle (max 3 changes / 24h in normal)     │
  └─────────────────────────────────────────────────────────┘
```

**Key Design Principles:**
- **guardrails_v2 table** is the single source of truth for all risk parameters
- **GuardrailPolicy** is the authoritative runtime resolver (no hidden defaults)
- **checkGuardrailRisk()** is the sole runtime pre-trade enforcer
- **Coherency rules** (YAML-driven) validate all parameter changes before persistence
- **Fail-safe defaults**: Kill switch checks fail-safe to TRIPPED on error; sizing fails-safe to minimum

---

## 2. Guardrails V2 Database Layer

**Table**: `guardrails_v2` (one row per mode: paper, live)

**Core Four Parameters** (user-visible in Guardrails tab):

| Parameter | Range | Purpose |
|-----------|-------|---------|
| `portfolioRiskPerTradePct` | 0.10%-5.00% | Percentage of portfolio risked per trade |
| `symbolCooldownMinutes` | >= 0 (warn > 90) | Minutes before re-trading same symbol |
| `maxOpenPositions` | 1-20 | Maximum concurrent open positions |
| `dailyLossKillSwitchPct` | 1.00%-25.00% | Portfolio loss % triggering auto-shutdown |

**Extended Parameters**:

| Parameter | Default (paper/live) | Purpose |
|-----------|---------------------|---------|
| `maxPositionPercentPct` | 30%/10% | Max single position as % of portfolio |
| `maxTotalExposurePct` | 25% | Max total portfolio exposure |
| `lowPriceThreshold` | $0.50 | LPCP: price below which special rules apply |
| `lowPriceMinStopAtrMult` | 3.0 | LPCP: minimum stop distance as ATR multiple |
| `lowPriceMinPositionNotional` | $25.00 | LPCP: minimum trade notional in USD |

**Kill Switch State** (persisted for restart resilience):

| Field | Type | Purpose |
|-------|------|---------|
| `killSwitchTripped` | boolean | Whether kill switch is currently active |
| `killSwitchReason` | string | Reason for trip (human-readable) |
| `killSwitchTrippedAt` | timestamp | When kill switch was activated |

**Management Flags**:

| Field | Purpose |
|-------|---------|
| `isManualOverride` | User manually controls all parameters |
| `tunedByLatti` | LATTI adaptive system manages parameters |
| `lockedByUser` | JSONB: per-parameter lock status |
| `lastUpdatedBy` | Audit trail: who last changed values |

**Invariant**: `isManualOverride` and `tunedByLatti` cannot both be `true` (RULE_005).

---

## 3. Coherency Rules Engine

**File**: `audit/coherency_rules.yaml` (v2.2-phase28efinal)
**Consumer**: `guardrail-policy.ts` — loaded at service initialization, validated on every guardrail change

**10 Rules enforced**:

| Rule | Name | Severity | Condition |
|------|------|----------|-----------|
| RULE_001 | Risk <= 50% x KillSwitch | error | `risk <= killSwitch * 0.5` |
| RULE_002 | Total Exposure <= 50% Cap | error | `positions * risk <= 50` |
| RULE_003 | Cooldown >= 0 minutes | error | `cooldown >= 0` |
| RULE_004 | Cooldown Maximum | warn | `cooldown <= 90` |
| RULE_005 | Manual Override Exclusivity | error | NOT (manual AND latti) |
| RULE_006 | Portfolio Risk Range | error | `0.10 <= risk <= 5.00` |
| RULE_007 | Kill Switch Range | error | `1.00 <= killSwitch <= 25.00` |
| RULE_008 | Max Positions Range | error | `1 <= positions <= 20` |
| RULE_009 | Mode Isolation | error | Exactly 1 record per mode |
| RULE_010 | Learning Expansion Caps | error | Values stay within global safety caps |

**Enforcement points**:
- Backend: `PUT /api/guardrails` (pre-commit validation)
- Backend: `POST /api/tuning/enable` (LATTI field bounds check)
- Database: CHECK constraints on core columns
- Adaptive Guardrails: validates proposed changes before applying

**Hot-reload**: `guardrailPolicy.reloadRules()` allows runtime YAML updates without restart.

---

## 4. GuardrailPolicy Service

**File**: `server/services/guardrail-policy.ts` (Phase 5)
**Pattern**: Singleton class, exported as `guardrailPolicy`

### Responsibilities

1. **Effective value resolution**: `getEffective(guardrail)` — structures raw DB row into typed `EffectiveGuardrails` with resolved management flags and LPCP parameters
2. **Coherency validation**: `validate(guardrail)` — runs all 8 implemented rules, returns `{ status: PASS|WARN|FAIL, failures[] }`
3. **Kill switch management**: `tripKillSwitch()`, `resetKillSwitch()`, `isKillSwitchTripped()` — all persisted to DB
4. **Override conflict detection**: `detectOverrideConflict()` — detects LATTI-managed fields being manually changed without lock
5. **Metrics tracking**: Rule failure counts, kill switch trip counts, override conflict counts
6. **Event emission**: Broadcasts to ContextBridge for frontend updates

### Guardrail Category Classification (Phase 8.8.4-B)

The service defines two guardrail categories that determine what happens when a signal is blocked:

**CAPACITY_GUARDRAILS** (signal can be queued for later):
- MAX_TRADES, MAX_TOTAL_EXPOSURE, POSITION_LIMIT, SLOT_CONFLICT

**QUALITY_GUARDRAILS** (signal is rejected outright):
- KILL_SWITCH, NO_STOP_LOSS, INVALID_STOP_LOSS, COOLDOWN, MAX_POSITION, INSUFFICIENT_BALANCE, PORTFOLIO_RISK, LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, FX_CONVERSION_FAILED, EXPIRED_SIGNAL, NO_PRICE

**Helper functions**: `isCapacityBlock(code)`, `isQualityBlock(code)` enable downstream routing decisions.

### Kill Switch Trip Sequence (REB 8.8.3-KS-B)

When `tripKillSwitch(mode, reason)` is called:
1. Set `killSwitchTripped = true` in guardrails_v2
2. Set `isEngineActive = false` via `storage.updateSystemContext()`
3. Clear Active Filter Pool via `activeFilterPool.enforcePassiveModeIfStopped()`
4. Stop the appropriate engine (paper sim or live engine)
5. Broadcast `system:killswitch_tripped` event via ContextBridge
6. Broadcast state change via `tradingStateSync`

**Fail-safe**: `isKillSwitchTripped()` returns `true` on error — system assumes tripped for safety.

---

## 5. Guardrail Settings Helper

**File**: `server/services/guardrail-settings.ts` (Phase 8.8.3-H4)

Provides helper functions for building settings from guardrails_v2:

### Key Functions

**`calculateRiskAmount(portfolioValue, riskPerTradePct)`**: Converts percentage risk to USD amount.

**`getRiskPercentageV2(mode, guardrails)`**: Reads `portfolioRiskPerTradePct` from guardrails. Falls back to 4% default if missing/invalid.

**`getPortfolioBalanceV2(mode)`** (Phase 8.8.3-C7-FIX):
- Formula: `Current Balance = Starting Balance + Realized P/L`
- Sources realized P/L from closed trades within current engine session
- Mode-aware: paper uses `getPaperSimTrades()`, live uses `getTrades()`
- Returns cash balance (excludes unrealized P/L)

**`buildSettingsFromGuardrails(mode)`**: Master builder that assembles a complete TradingSettings object from guardrails_v2 + portfolio_state. All values sourced from guardrails_v2 (visible in UI).

**Deprecated**: `buildSettingsFromModeLevel()`, `getRiskPercentage()` — backward compatibility aliases.

---

## 6. Trade Safety Service

**File**: `server/services/trade-safety.ts` (Phase 8.8.3-H4)
**Main Entry**: `checkGuardrailRisk(mode, trade, userId?, cycleId?)`

### 8 Sequential Pre-Trade Checks

| # | Check | Pass Condition | Block Code |
|---|-------|---------------|------------|
| 1 | Kill Switch | Not tripped for mode | KILL_SWITCH |
| 2 | Stop-Loss Required | stopPrice present AND below entryPrice | NO_STOP_LOSS / INVALID_STOP_LOSS |
| 3 | Max 1 Position Per Asset | No existing open position for normalized symbol | POSITION_LIMIT |
| 4 | Symbol Cooldown | No trade in same symbol within cooldown period | COOLDOWN |
| 5 | Position Size Cap | `preComputedNotional / portfolioValue <= maxPositionPercentPct` | MAX_POSITION |
| 6 | LPCP | **DORMANT** — always returns `ok: true` | (LPCP_LOW_PRICE / LPCP_MIN_NOTIONAL) |
| 7 | Max Open Trades | Open positions < maxOpenPositions | MAX_TRADES |
| 8 | Max Total Exposure | Total exposure < maxTotalExposurePct | MAX_TOTAL_EXPOSURE |

**Plus**: Correlation Exposure check via `riskConcentrationAnalyzer.isCorrelatedExposure()`

### Key Design Details

- **Sequential short-circuit**: Checks run in order; first failure returns immediately
- **LPCP is DORMANT**: Check #6 always passes. Code preserved for future activation when low-priced coin rules are needed. Comments state dormancy is intentional.
- **Position Size uses preComputedNotional**: The notional value is computed upstream in P2 stage and passed in via `trade.preComputedNotional`, preventing drift between sizing and execution.
- **AJ19 dry-run mode**: For MAX_POSITION blocks, logs the block but allows the trade through (development diagnostic mode)
- **RTB metrics tracking**: Passes/blocks are recorded via `rtbMetricsService` as source of truth
- **Diagnostic integration**: Heavy logging through AJ16, AJ19, B4, B5, I1, I5 diagnostic tags and SLAL (Signal Lifecycle Audit Log)

---

## 7. Pre-Execution Validator

**File**: `server/services/pre-execution-validator.ts` (Phase 8.8.3-H4)
**Pattern**: Singleton, exported as `preExecutionValidator`

### Three-Gate Validation

The Pre-Execution Validator runs AFTER Trade Safety and adds two additional gates:

1. **Risk checks**: Delegates to `checkGuardrailRisk()` from trade-safety.ts
2. **Goal alignment**: ⚠️ **FORMALLY DEPRECATED — Kyle directive 2026-02-16. Must be REMOVED entirely, not defaulted.** See deprecation note below.
3. **Fee-aware profitability** (Phase 27.F.14.B): Calculates whether the trade's expected gain minus round-trip fees exceeds `minNetProfitThreshold` (from system_context).

### Fee-Aware Profitability Check

```
expectedGainPct = |targetPrice - entryPrice| / entryPrice * 100
roundTripFeePct = feeRate * 2 * 100  (entry + exit)
netExpectedGainPct = expectedGainPct - roundTripFeePct
PASS if netExpectedGainPct >= minNetProfitThreshold * 100
```

Fee rates sourced from `system_context.makerFeePct` / `takerFeePct` (default: 0.16% maker, 0.26% taker).

### Goal Alignment Scoring — FORMALLY DEPRECATED

> **⚠️ DEPRECATION DIRECTIVE (Kyle, 2026-02-16)**: Goal alignment logic is legacy from the Walter-era Goals system. The Goals tab has already been removed from the UI. This entire gate must be **REMOVED** from `pre-execution-validator.ts` — not defaulted to neutral, not skipped, but deleted. The Pre-Execution Validator should become a two-gate system (risk checks + fee-aware profitability).

Combines three factors (all to be removed):
- Risk/reward ratio alignment with profitability vs consistency preference (40%)
- Strategy risk profile matching (30%)
- Signal confidence alignment (30%)

Only 3 strategies have explicit risk profiles (`vwap_pullback`, `abcd_long`, `sma_trend_ride`); others default to `{risk: 0.5, consistency: 0.5}`.

**Removal scope**: Delete `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, and all related Walter/Bob provenance references. The `profitability_vs_consistency` field in system_context can be removed if no other consumers exist.

### Provenance Logging

Every validation result is logged via `provenanceLogger.logLineage()` with full trace ID, enabling end-to-end audit from signal through validation to execution.

---

## 8. Dynamic Sizing Engine (DSE)

**File**: `server/core/risk/dynamic-sizing-engine.ts` (Directive 11.3)
**Export**: `computeDynamicSize(input)`, plus diagnostics getters

### Core Formula

```
positionSize = baseSize x multiplier

Where:
  baseSize = balance x (DEFAULT_RISK_PCT / 100)     [DEFAULT_RISK_PCT = 2]

  multiplier = edgeFactor x volPenalty x costPenalty x confFactor x costPressure
  multiplier = clamp(multiplier, 0.3, 1.2)

  edgeFactor  = 1 + (expectedEdge - 0.05) x 4
  volPenalty   = max(0.7, 1 - volatility / 0.02)
  costPenalty  = max(0.6, 1 - cost / 0.001)
  confFactor   = 0.5 + confidence
  costPressure = max(0.8, 1 - costDrift x 0.2)      [Directive 11.3C]
```

### Configuration Constants (DSE_CONFIG)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| MIN_MULTIPLIER | 0.3 | Floor for sizing multiplier |
| MAX_MULTIPLIER | 1.2 | Ceiling for sizing multiplier |
| BASE_EDGE | 0.05 | Neutral edge assumption |
| EDGE_SENSITIVITY | 4 | How strongly edge deviations affect sizing |
| VOL_THRESHOLD | 0.02 | Volatility level at which penalty begins |
| VOL_FLOOR | 0.7 | Minimum volatility penalty factor |
| COST_THRESHOLD | 0.001 | Cost level at which penalty begins |
| COST_FLOOR | 0.6 | Minimum cost penalty factor |
| CONFIDENCE_BASE | 0.5 | Base confidence contribution |
| DEFAULT_RISK_PCT | 2 | Base risk as % of balance |
| COST_PRESSURE_DAMPENING | 0.2 | Max dampening from cost drift |

### Adaptive Weight Extraction

DSE extracts edge and confidence from adaptive weights (VTS learning repository):

**Edge priority**: `expectedEdge` > `edge` > `winRate x 0.1` > `profitRate x 0.5` > derived from avg weight

**Confidence priority**: `confidence` > `sampleCount / 100` > `reliability` > derived from weight density

### Hard Cap

Final position size is capped at `balance x MAX_POSITION_RISK` where `MAX_POSITION_RISK = 0.02` (2%) from `EXECUTION_CONFIG`.

### Invariants

- T3: Hard Cap — Trade size cannot exceed TradeSafetyService max
- T4: Dynamic Base — Base size scales with portfolio balance
- T5: Bounded Multiplier — Sizing multiplier 0.3-1.2
- T6: Telemetry Provenance — All sizing decisions logged

### Telemetry

Maintains rolling history (max 100 entries) of all sizing decisions. Provides:
- `getLastSizeDecision()` — most recent sizing telemetry
- `getSizeHistory()` — full history
- `getAverageSizeMultiplier()` — overall average
- `getAverageSizeMultiplierByRegime(regime)` — per-regime average
- `getDSEDiagnostics()` — comprehensive diagnostic snapshot

---

## 9. Kill Switch Architecture

The kill switch is DawnTrader's emergency shutdown mechanism. Understanding its architecture requires tracing through multiple files:

### Data Flow

```
                    guardrails_v2.killSwitchTripped
                              │
              ┌───────────────┴───────────────┐
              │                               │
    guardrailPolicy.tripKillSwitch()   guardrailPolicy.isKillSwitchTripped()
    (6-step shutdown sequence)         (DB read, fail-safe: true on error)
              │                               │
              ├── safetyGuardrails.getKillSwitchStatus()  [LEGACY WRAPPER]
              │   (delegates to guardrailPolicy)
              │                               │
              └── trade-safety.ts check #1 ───┘
                  (reads guardrails_v2 directly)
```

### Triggers

1. **Manual**: User clicks stop button → API route → `guardrailPolicy.tripKillSwitch()`
2. **Automatic**: Daily P&L loss exceeds `dailyLossKillSwitchPct` threshold
3. **SafetyGuardrails toggle**: Legacy wrapper delegates to `guardrailPolicy`
4. **Cluster bus**: `kill_switch_activated` event for multi-node awareness

### State Persistence

Kill switch state is persisted to `guardrails_v2` table — survives restarts. Both `killSwitchTripped`, `killSwitchReason`, and `killSwitchTrippedAt` are stored.

---

## 10. Adaptive Guardrails Engine

**File**: `server/services/adaptive-guardrails.ts` (Phase 29)
**Pattern**: Singleton via `AdaptiveGuardrailsService.getInstance()`

### Purpose

Enables LATTI to learn from trade outcomes and user behavior, dynamically tuning guardrails within coherency limits.

### Learning Modes

| Mode | Max Changes/Day | Min Confidence | Max Adjustment % |
|------|----------------|----------------|-----------------|
| slow | 1 | 0.80 | 1% |
| normal | 3 | 0.60 | 3% |
| aggressive | 5 | 0.40 | 5% |
| disabled | 0 | 1.00 | 0% |

**Defaults**: Paper mode starts in `normal`, live mode starts in `slow`.

### Adjustment Pipeline

1. **Throttle check**: Count adaptive changes in last 24h; abort if at limit
2. **Behavioral analysis**: Query `behavioralLog` for each parameter (needs >= 5 samples)
3. **Statistical calculation**: Compute mean delta, variance, confidence from recent behavioral entries
4. **Micro-adjustment**: Direction from mean delta sign; magnitude capped at `maxAdjustmentPercent`
5. **Coherency validation**: Proposed values run through `guardrailPolicy.validate()` — **all adjustments abort if any rule fails**
6. **Persist**: Write to `guardrailsV2` table with `lastUpdatedBy = 'LATTI_ADAPTIVE'`
7. **Audit**: Log to `behavioralLog`, `learningHistory`, and `predictive-adjustments` logger
8. **Snapshot**: Create versioned snapshot of current state for rollback capability

### Currently Adjustable Parameters

- `portfolioRiskPerTradePct`
- `maxOpenPositions`

### Safety Bounds

All adjustments bounded: `0.1 <= value <= 20` (hard safety clamp independent of coherency rules).

**Coherency threshold**: Fixed at 5% for all modes — max deviation from preset value.

---

## 11. Circuit Breaker

**File**: `server/services/circuit-breaker.ts` (Phase 17.5)
**Pattern**: Singleton, exported as `circuitBreaker`
**Scope**: Infrastructure fault tolerance (NOT trade safety — this is for external API/service failures)

### State Machine

```
        ┌──────────┐   5 failures    ┌──────────┐
        │  CLOSED  │ ───────────────> │   OPEN   │
        │ (normal) │ <─────┐         │ (blocked)│
        └──────────┘       │         └────┬─────┘
              ^            │              │
              │      3 successes    retry window
              │            │         elapsed
              │         ┌──┴─────┐        │
              └─────────│HALF_OPEN│<───────┘
                        │(testing)│
                        └─────────┘
```

### Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| failureThreshold | 5 | Failures before OPEN |
| successThreshold | 3 | Successes to recover from HALF_OPEN |
| baseRetryDelayMs | 5,000 | Initial retry delay |
| maxRetryDelayMs | 300,000 | Maximum retry delay (5 min) |

### Backoff Strategy

Exponential with jitter: `delay = min(5000 * 2^retryCount, 300000) +/- 25%`

### Persistence

State persisted to `cluster_circuit_breaker` table — survives restarts. State transitions published to `clusterBus` for multi-node awareness.

---

## 12. GASP Coordinator — LEGACY (L-Series Autonomy Cluster)

**File**: `server/services/gasp-coordinator.ts` (Phase L20)
**Pattern**: Lazy singleton via `getGASPCoordinator()`
**Status**: ⚠️ **LEGACY** — Kyle confirmed 2026-02-16. Part of the L-Series Autonomy Cluster.

> **ADDENDUM (Kyle, 2026-02-16)**: GASP is a legacy supervisory layer. It computes GSI, monitors subsystem stability, and applies dampening — but it does NOT touch the active trade flow. It does not feed into Signal Orchestrator, TradeSafety, DSE, VTS, or Execution Engine. It forms a closed supervisory loop with other L-Series systems (MOF, DCE, APR-SLE, MCP). It is architecturally inert and slated for removal with the entire L-Series autonomy cluster. Not harmful while present, but not connected to trading decisions.

### Purpose (Legacy)

GASP (Global Adaptive Stability Protocol) monitors system-wide stability across multiple learning subsystems and applies dampening when instability is detected.

### Global Stability Index (GSI)

```
GSI = max(0, min(1, 1 - sqrt(combinedVariance)))

combinedVariance = w1*sigma_lambda^2 + w2*sigma_DI^2 + w3*sigma_alphaBeta^2 + w4*sigma_DRS^2

Default weights: w1=0.4, w2=0.3, w3=0.2, w4=0.1
```

### Input Sources (collectMetrics)

| Source | Module | Fallback |
|--------|--------|----------|
| Lambda weights sum | MOF Orchestrator | 1.0 |
| Decision Index (DI) | DCE | 0.5 |
| Alpha/Beta average | APR-SLE Engine | 0.5 |
| Drawdown Risk Score | PDC Engine | 0 |
| Regime numeric map | Market Profiler | 0.5 |

**All sources are try/catch wrapped** — GASP continues functioning if any subsystem is unavailable.

### Operating Modes

| Mode | Trigger | Effect |
|------|---------|--------|
| normal | GSI >= 0.85 AND correlationMax < 0.8 | Full learning rate and exposure |
| caution | GSI < 0.85 OR correlationMax >= 0.8 | Monitoring intensified |
| containment | GSI < 0.65 OR correlationMax >= 0.9 | Cooldown initiated, damping applied |
| recovery | After cooldown, GSI rising | Gradual restoration |

### Feedback Damping

When GSI < stableThreshold (0.85):
- Learning rate: `max(0.1, GSI + 0.15)` — applied to MOF learning rate
- Exposure: `max(0.1, GSI + 0.10)` — exposure reduction factor

### Cooldown Protocol

- Duration: 10 minutes
- Recovery: 15 minutes of stable GSI >= stableThreshold
- Alternative exit: 10 minutes elapsed AND GSI >= cautionThreshold

### Correlation Matrix

GASP tracks 6 cross-correlations between subsystems (lambda-DI, lambda-DRS, DI-DRS, regime-lambda, regime-DI, regime-DRS). High correlation (>0.8) indicates subsystems are no longer providing independent signals.

---

## 13. PDC Engine — LEGACY (If Autonomy-Bound, L-Series Cluster)

**File**: `server/services/pdc-engine.ts` (Directive 8.8.4-L18)
**Pattern**: Lazy singleton via `getPDCEngine()`
**Status**: ⚠️ **LEGACY (conditional)** — Kyle listed "PDC (if still autonomy-bound)" in the L-Series cluster (2026-02-16). PDC depends on DCE for DI data and feeds DRS to GASP. If PDC has no direct consumers in the active execution path (Signal Orchestrator, TradeSafety, DSE, VTS), it is confirmed legacy and should be removed with the L-Series cluster.

> **Note**: PDC's `recalibrate(tradeResults)` method suggests it was designed to interact with trade outcomes, but verification is needed to confirm whether any active service calls this method or consumes DRS directly for trade decisions. If no active execution path consumer exists, PDC is purely autonomy-bound and part of the closed L-Series loop.

### Purpose (Potentially Legacy)

PDC (Predictive Drawdown Containment) detects early-stage drawdown precursors before they manifest as portfolio losses.

### Drawdown Risk Score (DRS)

```
DRS = w1 * slopeContribution + w2 * volContribution + w3 * driftContribution

slopeContribution = min(|equitySlope| x 50, 1.0)
volContribution   = min(max(volRatio - 1.0, 0) x 2, 1.0)
driftContribution = min(|diDrift| x 5, 1.0)

Default weights: w1=0.5, w2=0.3, w3=0.2
```

### Three Precursor Signals

1. **Equity slope** (`deltaE/deltaT`): Linear regression over last 20 equity samples, normalized by average equity
2. **Volatility ratio** (`sigma_recent / sigma_baseline`): Recent return volatility vs baseline. Baseline defaults to 0.02.
3. **DI decay** (`DI_{t-5} - DI_t`): Change in Decision Index over last 5 samples. Sourced from DCE.

### DRS Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Warning | 0.6 | `warningActive = true` |
| Containment | 0.8 | `containmentActive = true`, exposure reduction |
| Recovery | 0.4 | Begin counting recovery windows |

Recovery requires 3 consecutive windows below recovery threshold.

### Recalibration

`recalibrate(tradeResults)` adjusts weights based on trade outcomes:
- If contained trades perform well relative to normal trades, increase equity slope weight (w1)
- If contained trades underperform, reduce w1 and increase volatility weight (w2)
- Weights are normalized to sum to 1.0 after adjustment
- Requires minimum 10 trade results

---

## 14. Risk Concentration Analyzer

**File**: `server/services/risk-concentration.ts` (Directive 9.4)
**Pattern**: Singleton, exported as `riskConcentrationAnalyzer`

### Purpose

Prevents portfolio concentration in highly correlated assets by calculating correlation-weighted exposure and applying scaling factors.

### Concentration Score

```
C_i = sum(|rho_ij| x w_j) + w_i    for all j != i

Where:
  rho_ij = correlation between assets i and j
  w_j = position weight of asset j
  w_i = own position weight
```

### Scaling Factor

```
If C_i > C_max (default 2.5):
  ScalingFactor_i = max(minScalingFactor, C_max / C_i)
Else:
  ScalingFactor_i = 1.0
```

### Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| correlationThreshold | 0.75 | Minimum correlation to be considered "correlated" |
| maxConcentration | 2.5 | Maximum allowed concentration score |
| minScalingFactor | 0.25 | Floor for scaling factor (25% of intended size) |
| updateIntervalMs | 60,000 | Periodic update interval (1 minute) |

### Integration Points

- **Trade Safety**: `isCorrelatedExposure(symbol)` called during pre-trade checks
- **Position Sizing**: `getScalingFactor(symbol)` used by sizing helpers to reduce position size for correlated assets
- **Market Data**: `updateFromMarketData(symbols)` fetches OHLC data from Kraken, computes returns, and updates covariance/correlation matrices

---

## 15. Covariance Engine

**File**: `server/utils/covariance-engine.ts` (Directive 9.4)
**Pattern**: Singleton, exported as `covarianceEngine`

### Mathematical Foundation

```
Return: r_i(t) = (P_i(t) - P_i(t-1)) / P_i(t-1)
Covariance: Sigma = (1/(n-1)) x (R - R_bar)^T (R - R_bar)
Correlation: rho_ij = Sigma_ij / (sigma_i x sigma_j)
Portfolio Variance: w^T Sigma w
Portfolio Volatility: sqrt(w^T Sigma w)
```

### Configuration

- Return history window: 100 samples (RETURN_HISTORY_SIZE)
- Minimum returns for calculation: 10 (MIN_RETURNS_FOR_CALCULATION)

### Key Operations

1. `updateFromPrices(symbol, prices)` — converts prices to returns, adds to rolling history
2. `computeCovarianceMatrix()` — recomputes from all active symbols (>= 10 returns each)
3. `computeCorrelationMatrix()` — derives from covariance matrix
4. `calculatePortfolioVariance(weights)` — `w^T Sigma w` for given position weights
5. `calculatePortfolioVolatility(weights)` — square root of variance

### State Management

Supports `exportState()` / `importState()` for persistence across restarts.

---

## 16. Paper Portfolio Manager

**File**: `server/services/paper-portfolio-manager.ts`
**Pattern**: Instance per mode (not singleton)

### Responsibilities

1. **Lifecycle management**: Start/stop paper trading engine with full safety checks
2. **Position management**: Force-close all positions on stop (hard stop behavior)
3. **Portfolio health**: Monitor drawdown, exposure, and position count
4. **Signal orchestration**: Manages SignalOrchestrator for automatic signal generation
5. **Engine registration**: Registers execution engine and micro-execution service with mode registry

### Portfolio-Level Guardrails (Hard-coded)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| MAX_DRAWDOWN_PERCENT | 20% | Maximum drawdown before critical |
| MAX_OPEN_POSITIONS | 10 | Maximum concurrent positions |
| MAX_PORTFOLIO_EXPOSURE_PERCENT | 80% | Maximum capital deployed |

### Start Sequence

1. Check portfolio health (paper mode: log-only; live mode: blocks if critical)
2. Set `isRunning = true`, clear stop flag
3. Register engine with mode registry
4. Start execution engine
5. Start micro-execution service
6. Start signal orchestrator (9 strategies enabled, 30s evaluation interval)
7. Note: Watchlist refresh is DISABLED — uses Active Filtered Pool from FX5

### Stop Sequence (Hard Stop)

1. Set `isStopInProgress = true` FIRST (prevents late trades)
2. Set `isRunning = false`
3. Stop signal orchestrator
4. Clear watchlist refresh interval
5. Stop micro-execution service
6. Stop execution engine

### Force Close on Stop

`forceCloseAllOpenPositionsOnStop()`:
- Gets all open positions from storage
- For each position: gets live price via `livePricingAdapter.getPriceWithFallback()` (5s staleness guard)
- Falls back to entry price if no reliable market price available
- Calls `executionEngine.forceClosePosition()` with price source tag
- Logs diagnostics via `i1TradeLifecycleDiagnostics.logHardStopSummary()`

### Portfolio Metrics

Calculates: total P/L, win rate, avg return, avg holding time, max drawdown, Sharpe ratio, profit factor, and per-strategy breakdowns.

---

## 17. Portfolio Aggregator

**File**: `server/services/portfolio-aggregator.ts` (Phase 8.2)
**Pattern**: Singleton, exported as `portfolioAggregator`

### Purpose

Combines strategy-level metrics into portfolio-level analytics:
- Total equity curve (last 100 points)
- Portfolio-level volatility (annualized, assuming 365 trading days)
- Portfolio Sharpe ratio (annualized, 0% risk-free rate)
- Capital allocation weightings (by P/L contribution)
- Diversification index (inverse of win rate variance across strategies)

### Data Sources

- `portfolio_state.balance` for initial capital (Phase 8.5 Addendum K.3)
- Paper mode: `getAllPaperTrades()`; Live mode: `getTrades('live')`
- Strategy metrics from `strategy-analytics` module

---

## 18. Kraken Service

**File**: `server/services/kraken.ts` (LOCKED — Directive 8.8.4-A4.R10R-4)
**Pattern**: Class-based, multiple instances allowed

### Key Capabilities

1. **Public endpoints**: Time, Assets, AssetPairs, Ticker, OHLC, Depth, Trades
2. **Private endpoints**: Balance, OpenOrders, ClosedOrders, AddOrder, CancelOrder
3. **Caching**: Balance (60s TTL), OpenOrders (90s), ClosedOrders (600s), History days (24h)
4. **Rate limiting**: Per-user lockout tracking with 120s cooldown on "Temporary lockout" errors
5. **Maintenance mode**: All API calls blocked when `MAINTENANCE_MODE=true`
6. **OHLC pagination**: Supports multi-batch historical data fetching with rate-limit-aware delays

### Spot-Only Safety

`addOrder()` enforces spot-only trading:
- Rejects any order with `leverage` parameter (except 'none')
- Blocks margin flags (`viqc` in `oflags`)
- Logs spot-only enforcement for audit trail

### Rate Limit Graceful Degradation

On "EGeneral:Temporary lockout":
1. Lock user's API access for 120 seconds
2. Return stale cache data if available
3. Throw error only if no cached data exists

### History Days Cache (REB 2.9D)

`getPairHistoryDays(pair, mode)`: Returns number of trading days available for a pair.
- Uses 1440-minute (daily) OHLC candles
- Cached for 24 hours per pair
- Returns `null` on error (caller decides pass/fail semantics)

---

## 19. Legacy Classification: SafetyGuardrails Service

**File**: `server/services/safety-guardrails.ts`
**Status**: DEPRECATED (Phase 8.8.3-H8)

### Classification: LEGACY — Active wrapper, no runtime authority

The `SafetyGuardrailsService` is marked `@deprecated` across its entire surface. All runtime safety enforcement was migrated to:
- `guardrails_v2` table (single source of truth)
- `trade-safety.ts` / `checkGuardrailRisk()` (runtime enforcer)
- `guardrail-policy.ts` / `GuardrailPolicy` (policy management)

### What It Still Does

1. **Kill switch delegation**: `getKillSwitchStatus()` and `toggleKillSwitch()` now delegate to `guardrailPolicy`. These are thin wrappers that add deprecation warnings.
2. **API compatibility**: Kept for backward compatibility with admin API routes (`/api/safety/*`)
3. **Event logging**: Writes to `safety_event_log` table and broadcasts via ContextBridge
4. **Policy evaluation**: `evaluateAction()` still queries `safetyPolicy` table but emits deprecation warnings and should NOT be used for runtime go/no-go decisions.

### Kill Switch Toggle Path

`toggleKillSwitch(enabled, reason, userId?, mode?)`:
1. Delegates to `guardrailPolicy.tripKillSwitch()` or `resetKillSwitch()`
2. Broadcasts via ContextBridge (frontend)
3. Emits to `clusterBus` (backend services, e.g., TradingStateSync) — Phase 27.4

---

## 20. Legacy Classification: L-Series Autonomy Cluster

> **Source**: Kyle's Phase 4 Addendum (2026-02-16) — Legacy Autonomy Layer & Goal Alignment Deprecation Directive

### Classification: LEGACY — Architecturally Inert Closed Supervisory Loop

The entire L-Series autonomy cluster has been confirmed by Kyle as **architecturally inert**. These systems form a closed supervisory loop that does NOT feed into any active execution component:

- ❌ Does NOT feed into Signal Orchestrator
- ❌ Does NOT feed into TradeSafety
- ❌ Does NOT feed into DSE (Dynamic Sizing Engine)
- ❌ Does NOT feed into VTS
- ❌ Does NOT feed into Execution Engine

### L-Series Systems (All Legacy — Slated for Coordinated Removal)

| System | File(s) | Role in Closed Loop |
|--------|---------|-------------------|
| **MCP** (Market Condition Profiler) | `market-profiler.ts` | Independent regime classifier (T1-C1 taxonomy) |
| **ARE** (Adaptive Regime Engine) | `adaptive-regime.ts` | Regime adjustment layer for MCP |
| **GASP** (Global Adaptive Stability Protocol) | `gasp-coordinator.ts` | Supervises MOF/MACO/ECS, computes GSI |
| **MOF** (Multi-Objective Framework) | `mof-orchestrator.ts` | Multi-objective optimization |
| **MACO** (Multi-Agent Coordination) | `maco-coordinator.ts` | Agent coordination |
| **ECS** (Evolutionary Competition System) | `ecs-manager.ts` | Strategy competition |
| **DCE** (Decision Confidence Engine) | `decision-confidence-engine.ts` | Decision Index computation |
| **Experience Buffer** | `experience-buffer.ts` | RL-style experience storage |
| **Reward Evaluator** | `reward-evaluator.ts` | RL reward computation |
| **Proactive Allocator** | `proactive-allocator.ts` | Proactive capital allocation |
| **Equilibrium Restorer** | TBD (Phase 6 audit) | System equilibrium maintenance |
| **APR-SLE** (Adaptive Performance Rating) | `apr-sle-engine.ts` | Performance rating with learning |
| **PDC** (Predictive Drawdown Containment) | `pdc-engine.ts` | Drawdown prediction (if autonomy-bound) |

### Why These Are Legacy

1. **Independent taxonomy**: MCP/ARE uses T1/T2/R1/V1/C1 — no mapping to canonical 5-regime names
2. **Stubbed metrics**: MCP never completed (`volume_z = 0`, `correlation = 0.5`)
3. **No canonical mapping**: None of these systems reference or consume the canonical regime-strategy map
4. **Closed loop**: They supervise each other but nothing in the active execution path reads their output
5. **Predecessor architecture**: Built under Directive 8.8.4-L12 (Dec 2025), superseded by canonical map (Directive 11.7F, Jan 2026)

### Removal Directive (Kyle, 2026-02-16)

All L-Series systems must be removed together in a **coordinated wave**. Before removal:
1. Confirm no hidden execution paths exist (grep for any SO/DSE/TradeSafety/VTS imports)
2. Confirm no Signal Orchestrator imports from L-Series systems
3. Confirm no database migration dependencies
4. Verify all 14+ consumer services of MCP/ARE are catalogued and migrated

### Impact on Phase 4 Findings

- **GASP (Section 12)**: Reclassified from ACTIVE to LEGACY
- **PDC (Section 13)**: Reclassified from ACTIVE to LEGACY (conditional on being autonomy-bound)
- **RISK-027**: Superseded — no need to migrate GASP's metric sources; the entire system is removed
- **Waves 5-7**: Consolidated into a single L-Series cluster removal wave (see LEGACY_DEPRECATION_PLAN.md)

---

## 21. Cross-References

### To Phase 1 (Math & Scoring)
- DSE uses adaptive weights from VTS learning repository (Phase 6 will validate)
- Cost pressure factor reads from `cost-drift-monitor` (Phase 1 cost model)
- Pre-Execution Validator uses `slippage-fee-model` for fee estimation

### To Phase 2 (Strategies)
- Trade Safety's symbol normalization affects all strategy signals
- ~~Pre-Execution Validator's goal alignment only has risk profiles for 3 of 17 strategies~~ → **Goal alignment is formally deprecated (Kyle Addendum). To be removed entirely.**
- ~~GASP collects metrics from MOF Orchestrator and APR-SLE Engine (Phase 2 legacy systems)~~ → **GASP itself is now legacy (L-Series cluster). Both GASP and its metric sources will be removed together.**

### To Phase 3 (Market Scanning)
- Kill switch triggers `activeFilterPool.enforcePassiveModeIfStopped()` — clears scanning pool
- Trade Safety reads open positions from storage (paper or live mode)
- Risk Concentration fetches OHLC from Kraken service for correlation computation

### Forward References
- Phase 6 (ML/Learning): DSE's adaptive weight extraction. ~~GASP's damping of MOF learning rate~~ → GASP and MOF both legacy (L-Series cluster).
- Phase 7 (Infrastructure): Circuit Breaker integrates with cluster bus. ~~Boot sequence initializes GASP/PDC~~ → GASP/PDC are legacy; boot init will be removed with L-Series cluster.

---

## 22. Critical Findings

### RISK-026: DSE Diagnostics Use Legacy Regime Names
- **Severity**: LOW
- **Location**: `server/core/risk/dynamic-sizing-engine.ts` lines 287-288
- **Problem**: `getDSEDiagnostics()` references 6 regime names including `EXTREME_NOISE` and `LOW_VOL_CHOP` which do not match the canonical 5-regime taxonomy (`BULL_QUIET`, `BULL_VOLATILE`, `BEAR_QUIET`, `BEAR_VOLATILE`, `CHOPPY`). These are display/diagnostic only and do not affect sizing math.
- **Fix**: Update regime names in diagnostics to match canonical names
- **Timing**: Anytime (cosmetic, no trading impact)

### RISK-027: GASP Is Itself Legacy (L-Series Autonomy Cluster) — SUPERSEDED
- **Severity**: MEDIUM → **RECLASSIFIED** (Kyle Addendum, 2026-02-16)
- **Location**: `server/services/gasp-coordinator.ts`
- **Original Problem**: GASP depends on legacy subsystems (MOF, DCE, APR-SLE, MCP).
- **Updated Status**: Kyle confirmed GASP itself is legacy — part of the L-Series Autonomy Cluster. GASP supervises MOF/MACO/ECS, computes GSI, but does NOT touch the active trade flow. It forms a closed supervisory loop with other L-Series systems. No migration of GASP's metric sources is needed — the entire system (GASP + its sources) will be removed together in the coordinated L-Series cluster removal.
- **Fix**: Remove GASP along with the entire L-Series autonomy cluster in a single coordinated wave.
- **Timing**: During L-Series cluster removal (see Section 20)

### RISK-028: Goal Alignment Logic Is Formally Deprecated — Must Be REMOVED
- **Severity**: LOW → **MEDIUM** (elevated: formal deprecation directive)
- **Location**: `server/services/pre-execution-validator.ts` — entire goal alignment gate
- **Original Problem**: Only 3 of 17 strategies had risk profiles.
- **Updated Status (Kyle Addendum, 2026-02-16)**: Goal alignment is legacy from the Walter-era Goals system. The Goals tab has already been removed from the UI. Kyle directive: this logic must be **REMOVED entirely** — not expanded to cover more strategies, not defaulted to neutral, but deleted from the codebase.
- **Removal scope**: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, Walter/Bob provenance references, and `profitability_vs_consistency` field in system_context (if no other consumers).
- **Fix**: Delete all goal alignment code from pre-execution-validator.ts. Reduce to a two-gate validator (risk checks + fee-aware profitability).
- **Timing**: Pre-MCE or during MCE — standalone removal, no MCE dependency

### RISK-029: Paper Portfolio Manager Uses Hardcoded Starting Capital — ACCEPTED
- **Severity**: LOW-MEDIUM → **LOW** (Kyle accepted, 2026-02-16)
- **Location**: `server/services/paper-portfolio-manager.ts` lines 539-541, 670-672
- **Problem**: `checkPortfolioHealth()` and `calculateMaxDrawdown()` assume `startingCapital = 10000` (hardcoded) for exposure and drawdown calculations. This does not match the actual portfolio_state.balance which may differ.
- **Kyle Decision (2026-02-16)**: Hardcoded $10,000 is acceptable for now. Optional future enhancement: throw error if portfolio_state.balance is missing instead of defaulting.
- **Fix**: No immediate action required. Optional future: throw error on missing balance.
- **Timing**: Post-MCE (optional)

### RISK-030: Coherency Rules YAML vs Code Mismatch
- **Severity**: LOW
- **Location**: `audit/coherency_rules.yaml` line 253 vs `guardrail-policy.ts` line 387
- **Problem**: The YAML database constraint for kill switch range says `daily_loss_kill_switch_pct >= 1.00 AND <= 20.00` but RULE_007 in the YAML itself and the code both enforce `1.00-25.00`. The database CHECK constraint is stricter than the application rule.
- **Fix**: Align database CHECK constraint to match RULE_007 (1.00-25.00)
- **Timing**: Anytime (database migration needed)

### RISK-031: EXECUTION_CONFIG.MAX_POSITION_RISK Contradicts Guardrails — DEFERRED
- **Severity**: MEDIUM
- **Location**: `server/config/execution-config.ts` line 15, `server/core/risk/dynamic-sizing-engine.ts` line 211
- **Problem**: `EXECUTION_CONFIG.MAX_POSITION_RISK = 0.02` (2%) is used by DSE as a hard cap on position size. However, `guardrails_v2.maxPositionPercentPct` defaults to 10% (live) or 30% (paper). The DSE cap at 2% is far stricter than the guardrail setting, meaning the guardrail's `maxPositionPercentPct` may never actually be the binding constraint — DSE caps first.
- **Dual authority**: Trade Safety checks `maxPositionPercentPct` (guardrails_v2). DSE independently caps at `MAX_POSITION_RISK`. These are different limits checked at different stages of the pipeline.
- **Kyle Decision (2026-02-16)**: Confirmed this is a real conflict. Do NOT change during audit phase. Add to cleanup docket for post-audit architecture session.
- **Fix**: Clarify whether DSE should use `maxPositionPercentPct` from guardrails_v2 instead of `EXECUTION_CONFIG.MAX_POSITION_RISK`, or document these as intentionally layered constraints.
- **Timing**: Post-audit architecture session (deferred per Kyle)

---

## 23. Forward Audit Standard: Parallel System Detection

> **Source**: Kyle's Phase 4 Addendum, Section 8 (2026-02-16)

### New Audit Standard for Phases 5-11

Going forward, any subsystem encountered during the remaining audit phases that meets ANY of the following criteria must be flagged as **"POTENTIAL LEGACY — REQUIRES INTENT VERIFICATION"**:

1. **Independent operation**: Operates independently of canonical routing (Signal Orchestrator → TradeSafety → DSE → Execution Engine)
2. **Own classification**: Maintains its own regime/market classification taxonomy separate from canonical 5-regime model
3. **Supervision without execution**: Supervises other subsystems but does not directly influence trade execution decisions
4. **No canonical references**: Has no imports from or exports to Signal Orchestrator, DSE, TradeSafety, or VTS
5. **Closed loop**: Forms a closed feedback loop with other subsystems that has no outbound path to execution

### Verification Protocol

When a potential legacy subsystem is flagged:
1. **Grep test**: Search for imports of the subsystem in SO, DSE, TradeSafety, VTS, and Execution Engine files
2. **Output trace**: Trace the subsystem's computed outputs — do they reach any active trade decision?
3. **Taxonomy check**: Does it use canonical regime names or its own taxonomy?
4. **Intent verification**: Document the subsystem's apparent purpose and flag for Kyle's confirmation

### Rationale

The L-Series autonomy cluster (MCP, ARE, GASP, MOF, MACO, ECS, DCE, etc.) was discovered to be architecturally inert — a closed supervisory loop that ran for months without anyone realizing it had no connection to the active execution path. This standard ensures similar patterns are caught early in subsequent audit phases.

---

## 24. File Catalog

### Active Files (Phase 4 Scope)

| File | Lines | Status | Role |
|------|-------|--------|------|
| `server/services/trade-safety.ts` | ~916 | ACTIVE | Runtime pre-trade guardrail enforcement |
| `server/services/guardrail-policy.ts` | ~670 | ACTIVE | Policy management, coherency validation, kill switch |
| `server/services/guardrail-settings.ts` | ~233 | ACTIVE | Settings builder from guardrails_v2 |
| `server/services/adaptive-guardrails.ts` | ~617 | ACTIVE | LATTI adaptive parameter tuning |
| `server/services/pre-execution-validator.ts` | ~292 | ACTIVE (Goal Alignment DEPRECATED) | Two active gates + one deprecated gate |
| `server/services/circuit-breaker.ts` | ~336 | ACTIVE | Infrastructure fault tolerance |
| `server/services/risk-concentration.ts` | ~369 | ACTIVE | Correlation-weighted exposure control |
| `server/services/paper-portfolio-manager.ts` | ~725 | ACTIVE | Paper trading lifecycle management |
| `server/services/portfolio-aggregator.ts` | ~243 | ACTIVE | Portfolio-level metrics aggregation |
| `server/services/kraken.ts` | ~750+ | ACTIVE (LOCKED) | Kraken REST API client |
| `server/core/risk/dynamic-sizing-engine.ts` | ~314 | ACTIVE | Predictive position sizing |
| `server/core/risk/index.ts` | ~8 | ACTIVE | Risk module re-export |
| `server/utils/covariance-engine.ts` | ~371 | ACTIVE | Rolling covariance/correlation matrices |
| `server/config/execution-config.ts` | ~23 | ACTIVE | TEC configuration constants |
| `audit/coherency_rules.yaml` | ~360 | ACTIVE | Coherency validation rules definition |

### Legacy Files (Phase 4 Scope)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `server/services/safety-guardrails.ts` | ~411 | LEGACY (H8) | Deprecated wrapper, kept for API compatibility |
| `server/services/gasp-coordinator.ts` | ~540 | LEGACY (L-Series) | Closed supervisory loop, does not touch active trade flow (Kyle 2026-02-16) |
| `server/services/pdc-engine.ts` | ~347 | LEGACY (L-Series, conditional) | Legacy if autonomy-bound; verify no active execution path consumers (Kyle 2026-02-16) |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-02-16 | Initial Phase 4 section: 18 files audited, 6 RISK findings |
| v1.1 | 2026-02-16 | Phase 4 Addendum: GASP/PDC reclassified to LEGACY (L-Series cluster). Goal Alignment formally deprecated. RISK-027 superseded, RISK-028 elevated, RISK-029 accepted, RISK-031 deferred. Added Section 20 (L-Series Autonomy Cluster), Section 23 (Forward Audit Standard). File catalog updated: 15 active, 3 legacy. |
