# Langston — Project Memory

## Project Overview
DawnTrader V3 is a cryptocurrency trading platform that scans ~300 Kraken trading pairs, evaluates them through a multi-stage signal quality pipeline, and executes paper trades (transitioning to live). Built with TypeScript/Node.js, deployed on Replit, with a React frontend. The mission is to build a world-class trading system that generates generational wealth, then commercialize it.

## Current State (2026-03-12)
- **Branch**: dawntrader-v4
- **Last commit**: ed9bb0a7 (Batch 18B — Governance docs)
- **Test baseline**: ~784 pass / ~83 fail (867 total)
- **Last completed**: Batch 18 + 18B (API Budget Optimization + FX5 300 Pairs)
- **Next**: Block 3 / Phase 14.5 / Batch 19

## Roadmap (Blocks 3-8)
- **Block 3** (NEXT): Phase 14.5 — Parallel Pattern Scanning + Signal Ranking Overhaul + Global Regime Pre-Filter (Batch 19)
- **Block 4**: Phase 11 Finalization — Adjustment Framework + Authority Baseline (Batch 20)
- **Block 5**: Phase 15 — Adaptive FinalScore Weights + Rules Engine + System Monitor (Batch 21)
- **Block 6**: Phase 19 — Paper Mode Audit & Debug (Batch 22)
- **Block 7**: Phase 20 — Production Hardening + Limit Order Optimization + UI Relevance Pass (Batch 23)
- **Block 8**: Phase 21 — Live Mode Activation (Batch 24)

## Key Architecture
- **MCE**: Market Context Engine — centralized regime + indicator computation
- **FX5 Scanner**: Scans 300 pairs per cycle, applies IMF/volume/volatility filters
- **Signal Orchestrator**: Runs strategies on filtered pairs, produces signals
- **SQE**: Signal Quality Evaluator — FinalScore, RegimeWeight, confidence floor, governance gate
- **VTS**: Virtual Trading Simulator — ML training data generation
- **Paper Execution Engine**: Executes virtual trades, manages positions
- **5 Regimes**: TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION
- **17 Strategies**: 9 quant + 3 pattern + 5 hybrid (pattern/hybrid currently blocked — needs Phase 14.5)

## Key File Locations
- **Project instructions**: `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
- **System manual**: `1-system-manual/SYSTEM_MANUAL.md`
- **Changes log**: `1-system-manual/CHANGES_AND_FIXES.md`
- **Impact map**: `1-system-manual/SYSTEM_IMPACT_MAP.md`
- **Directive index**: `1-system-manual/DIRECTIVE_INDEX.md`
- **Scope files**: `Claude Comms and Packages/Scope Files/`
- **Batch zips**: `Claude Comms and Packages/Batch Zips/`
- **Governance zips**: `Claude Comms and Packages/Governance Zips/`

## Block 3 Scope Summary (Batch 19)
**Part A**: Dual-path pattern scanning — FX5 outputs quant pool + pattern pool, signal orchestrator evaluates both, unified RTB queue
**Part B**: rankingScore = (FinalScore x QUALITY_WEIGHT) + (returnMagnitude x RETURN_WEIGHT) for RTB queue ordering
**Part C**: Global regime pre-filter — BTC regime informs filter parameters and strategy selection, reduces noise 30-50%

## Decisions Log
- Phase 14.3 (Short Trading): DEFERRED INDEFINITELY — requires capital
- Phase 14.4 (VTS Data Clear): CANCELED
- Phase 14.2 (DBS): EFFECTIVELY COMPLETE — no further work needed
- DSS: DELETED — replaced by MCE regime filtering + detect functions
- Regime rename: SKIPPED — no value
- DBS backfill into VTS: SKIPPED — unnecessary
