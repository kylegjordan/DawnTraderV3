# Directive 12.3.2: Strategy Routing Expansion

**Status**: SPEC COMPLETE — Implementation pending
**Date Issued**: 2026-03-03
**Date Spec Complete**: 2026-03-03
**Date Implementation Complete**: —
**Batch (Spec)**: 12
**Batch (Implementation)**: TBD (Batch 14+ per PHASE_12.3_INVESTIGATION_SCOPE.md)

---

## Problem

DawnTrader's canonical regime-strategy map defines 17 strategies across 5 regimes, but only 9 quant strategies have full signal generation implementations. The remaining 8 strategies (3 PATTERN, 5 HYBRID) are either partially implemented (pattern detection exists but no trade logic) or not implemented at all.

### Current State

| Lane | Strategies | Status |
|------|-----------|--------|
| **QUANT** (9) | vwap_pullback, mean_reversion, momentum_breakout, trend_follow, scalp, range_fade, abcd_long, dip_buy, sma_crossover | Fully implemented in strategy-engine.ts |
| **PATTERN** (3) | morning_star, inside_bar_reversal, support_bounce | Detection exists (pattern-recognizer.ts), no strategy-level trade logic |
| **HYBRID** (5) | pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge | Not implemented — require both pattern detection AND quant conditions |

### Dependency

This directive depends on **12.3.1** (Regime Authority Resolution) being complete first, as the strategies need the canonical regime from `calculatePairRegime()` wired into Signal Orchestrator.

## Solution

### Phase A: Mathematical Specification (COMPLETE)

A complete mathematical specification covering all 8 strategies was created and vetted through a two-round multi-LLM review process (xAI, Gemini, ChatGPT, Claude). The review achieved unanimous or clear majority consensus on all 30 decision items including 6 bug fixes, 3 safeguards, 11 calibrations, and 10 enhancements.

**Reference**: `STRATEGY_SPECIFICATION_12.3.2_FINAL.md` (this directory)

### Phase B: Routing Infrastructure (TBD — small)

Wire the Signal Orchestrator to invoke PATTERN and HYBRID strategy evaluation when the corresponding patterns are detected and regime conditions match. This is plumbing — no new math, just routing.

### Phase C: Strategy Implementation (TBD — large, ~4,000-5,000 new lines)

Implement the 8 strategies per the vetted specification. Each strategy follows the same structure: entry conditions, exit levels, confidence scoring, metadata output.

## Files in This Directory

| File | Purpose |
|------|---------|
| `DIRECTIVE_12.3.2.md` | This document — directive overview and status |
| `STRATEGY_SPECIFICATION_12.3.2_FINAL.md` | Vetted mathematical specification for all 8 strategies. Reviewed by 4 LLMs across 2 rounds. All formulas, constants, and methodology approved. |

## Verification (Spec Phase)

- [x] All 8 strategies specified with complete entry conditions, exit levels, confidence scoring
- [x] 6 mathematical bugs identified and fixed
- [x] 3 safeguards added (min stop distance, ATR floor/ceiling, R:R confirmed)
- [x] 11 calibration values adjusted per consensus
- [x] 10 enhancements incorporated or deferred to backtesting
- [x] Confidence bounds table verified for all strategies
- [x] Master constants and variables tables complete

---

*Spec complete. Implementation will begin after Directives 12.3.1 and 12.3.3 are complete per the safe ordering in PHASE_12.3_INVESTIGATION_SCOPE.md.*
