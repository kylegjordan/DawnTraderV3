# Directive 12.3.1: Regime Authority Resolution (BUG-006, BUG-008)

**Status**: COMPLETE
**Date Issued**: 2026-03-03
**Date Complete**: 2026-03-03
**Batch**: 13 (Phase 12.3 Pipeline Unification mega-batch)
**Commit**: `4d8ef060` (code in checkpoint `67afdc1e`)

---

## Problem Statement

Two critical bugs created regime classification fragmentation:

**BUG-006**: DSS (Dynamic Strategy Selector) used `SYSTEM_GUARDS.STRATEGY_MAP` — a legacy 6-regime / 9-quant-only map. The canonical source of truth (`canonical-regime-strategy-map.ts`, Directive 11.7F) defines 5 regimes and 17 strategies but was NOT wired to the DSS runtime. Pattern and hybrid strategies were never generated.

**BUG-008**: Four parallel regime classification systems operated simultaneously with three different naming conventions and zero cross-referencing:
- Engine 1: DSS legacy (volNoise/trendSlope → 6 regimes) — **Active trading path**
- Engine 2: `calculatePairRegime()` (OHLC → 5 canonical regimes) — **VTS only**
- Engine 3: `getNormalizedRegime()` (Z-Score advisory) — **ML only**
- Engine 4: MCP/ARE (T1-C1 taxonomy) — **14+ services, legacy**

VTS learned from Engine #2 while active trading used Engine #1 — ML calibration was suspect.

## Resolution

### DSS Rewired to Canonical Regime Model

`dynamic-strategy-selector.ts` rewritten (~270 lines):
- Added `determineRegimeFromOHLC(ohlcData, volNoise)` method that calls `calculatePairRegime()` from `market-regime.ts`
- EXTREME_NOISE veto preserved as a pre-filter (volNoise > 0.6) — not a canonical regime, but a safety gate
- `getCandidatesForRegime()` now uses `CANONICAL_REGIME_STRATEGY_MAP` instead of `SYSTEM_GUARDS.STRATEGY_MAP`
- Added `getRegimeInfoFromOHLC()` for signal orchestrator consumption
- Backward-compatible `determineRegime()` maps to canonical regimes

### Signal Orchestrator Updated

`signal-orchestrator.ts` regime classification section updated:
- Converts Kraken OHLC data to `OHLCData[]` format for `calculatePairRegime()`
- Calls `dss.getRegimeInfoFromOHLC()` for canonical regime classification
- `getRegimeAllowedStrategies()` now uses canonical `REGIME_STRATEGY_MAP`

### Regime Authority Post-Fix

| Engine | Status | Action |
|--------|--------|--------|
| Engine #1 (DSS legacy) | **REPLACED** | Now calls `calculatePairRegime()` — same function VTS uses |
| Engine #2 (`calculatePairRegime`) | **CANONICAL** | Sole pair-level regime authority for both VTS and active trading |
| Engine #3 (Z-Score) | Preserved | Advisory only, ML use |
| Engine #4 (MCP/ARE) | Remains | Removal deferred to Wave 6 (MCE) — 14+ consumers need migration |

## Impact

- **BUG-006**: RESOLVED — DSS now uses canonical map with 17 strategies across 5 regimes
- **BUG-008**: PARTIALLY RESOLVED — Engines #1 and #2 unified. Engine #4 (MCP/ARE) still operates independently (Wave 6 removal)
- **RISK-001**: RESOLVED — VTS and active trading now use the same regime function
- **RISK-003**: RESOLVED — DSS no longer blocks PATTERN and HYBRID strategies

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `server/services/dynamic-strategy-selector.ts` | Replaced | Rewired to canonical regime model |
| `server/services/signal-orchestrator.ts` | Modified | OHLC regime classification + canonical strategy lookup |

---

*Implemented as part of Phase 12.3 Pipeline Unification mega-batch (Batch 13) alongside Directives 12.3.3 and 12.3.2.*
