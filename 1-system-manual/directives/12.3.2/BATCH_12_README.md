# Batch 12 — Directive 12.3.2 (Spec Phase): Strategy Specification Placement

**Directive**: 12.3.2 (Spec phase only — no code implementation)
**Type**: Documentation placement
**Baseline Commit**: `2064d5c9` (Batch 11B governance)
**Result Commit**: `aa269823`
**Test Baseline**: 800 pass / 81 fail (881 total) — unchanged

---

## Scope

### Files Created (2) — in `1-system-manual/directives/12.3.2/`

| File | Lines | Purpose |
|------|-------|---------|
| `DIRECTIVE_12.3.2.md` | ~64 | Directive overview, status tracking, dependency notes |
| `STRATEGY_SPECIFICATION_12.3.2_FINAL.md` | ~1,460 | Complete vetted mathematical specification for all 8 strategies |

### Files Modified (1)

| File | Change |
|------|--------|
| `1-system-manual/directives/DIRECTIVE_INDEX.md` | Updated 12.3.2 row: PENDING → SPEC COMPLETE, date 2026-03-03 |

---

## Context

The strategy specification was produced through a multi-session process:

1. **Drafted**: Complete mathematical specification for 8 unimplemented strategies (3 PATTERN + 5 HYBRID) with full formulas, constants, entry/exit/confidence logic
2. **Reviewed**: Round 1 review by 4 LLMs (xAI Grok, Google Gemini, ChatGPT, Claude)
3. **Consolidated**: 30 decision items identified (6 bugs, 3 safeguards, 11 calibrations, 10 enhancements)
4. **Resolved**: Round 2 consensus — unanimous or clear majority on all 30 items
5. **Finalized**: All 30 decisions incorporated into `STRATEGY_SPECIFICATION_12.3.2_FINAL.md`

### Strategies Specified

| Lane | Strategies |
|------|-----------|
| **PATTERN** (3) | morning_star, inside_bar_reversal, support_bounce |
| **HYBRID** (5) | pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge |

### Key Consensus Decisions

- **6 bugs fixed**: pivot_shift stop distance (min→max), proximity floor, minMomentum in confidence, fibQuality floor, ADX score floor, cPointLow value (0.90→0.85)
- **3 safeguards added**: MIN_STOP_DISTANCE_BPS=20, ATR reject/clamp bounds, R:R confirmation
- **11 calibrations adjusted**: ATR-scaled cluster, min touches 3, ADX<25 for adaptive_flow, Spearman 30 candles, and more
- **10 enhancements**: inside_bar SELL RSI→45, BTC short-circuit, confidence bounds table, BUY-only annotations, and more

## Impact

| Metric | Value |
|--------|-------|
| Files created | 2 |
| Files modified | 1 |
| Code changes | 0 |
| Bugs/risks resolved | None (documentation only) |
| Test baseline impact | None — 800/81 unchanged |
| Risk level | NONE |

## What This Does NOT Do

- Does NOT implement any strategy code (that's Phase C, Batch 14+)
- Does NOT modify Signal Orchestrator or strategy-engine.ts
- Does NOT affect runtime behavior in any way
- Does NOT change test baseline

## Dependencies for Implementation

Strategy code implementation (Phase C) depends on:
- **12.3.1** (Regime Authority Resolution) — canonical regime from `calculatePairRegime()` wired into Signal Orchestrator
- **12.3.3** (Confidence Authority Cleanup / NGC removal) — confidence pipeline cleaned up

Both must complete before strategy implementation begins.
