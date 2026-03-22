# DawnTrader Phase History

> **Purpose**: Detailed chronological record of every phase implemented in DawnTrader. Serves as the project's historical documentation.
> **Updated by**: Claude Code (mandatory after every batch that completes or advances a phase)
> **Location**: `1-system-manual/PHASE_HISTORY.md`

---

## Phase-to-Batch Mapping

| Phase | Description | Batches | Status |
|-------|-------------|---------|--------|
| 12.1 | Critical Math & Security Fixes | Batch 1, 1B, 2, 3 | COMPLETE |
| 12.2 | Dead Code Purge | Batch 4, 5, 6, 7A, 7B, 8, 9, 10, 11 | COMPLETE |
| 12.3 | Pipeline Unification | Batch 12, 13 | COMPLETE |
| 13 | MCE Installation + L12/L20 Removal | Batch 14 | COMPLETE |
| 14.1 | VTS Real Calculations + DBS + Regime | Batch 15, HF6-HF9 | COMPLETE |
| 14.2 | DBS Implementation | SKIPPED (already implemented) | SKIPPED |
| 14.3 | Short Trading | DEFERRED INDEFINITELY | DEFERRED |
| 14.4 | (Canceled) | — | CANCELED |
| 14.5 | Dual-Path Pattern Scanning + Merit-Based Ranking | Batch 19 through 19K GOV | COMPLETE |
| Inter-phase | API Budget Optimization + Hotfixes | Batch 18, HF10-HF12D | COMPLETE |
| 14.6 | X Stocks Integration (Kraken tokenized equities) | — | PLANNED |

---

## Phase 14.5 — Dual-Path Pattern Scanning + Merit-Based Ranking + MCE Global Regime Overlay

**Overall Purpose**: Transform DawnTrader from a single-path quant-only system into a dual-path architecture where both quantitative strategies and candlestick pattern strategies run independently across all 300 pairs. Introduce merit-based ranking to replace arbitrary pair limits, DB-driven filter architecture for transparency and tunability, and comprehensive filter diagnostics for pipeline visibility.

**Duration**: 2026-03-18 to 2026-03-22 (Batches 19 through 19K GOV)

### Sub-Phase Breakdown

**14.5.1 — Core Dual-Path Architecture (Batch 19)**
Implemented the foundational dual-path system: pattern pool filter pipeline alongside existing quant pool, rankingScore for cross-family ordering, MCE getDominantRegime() for global regime overlay, sourcePool/signalType/assetClass identity tuple, and pattern position sizing with 15% cap.

**14.5.2 — VTS Pattern Pool + Frontend (Batches 19C, 19E)**
Extended dual-path to VTS (passive learning): VTS runner pattern pool fetch, sourcePool field in Phase10TradeRecord and DB schema, paper-execution-engine sourcePool persistence, frontend Source Pool badges on open and closed trades.

**14.5.3 — Phase Completion + DB-Driven Filters (Batch 19F + HFs)**
Completed Phase 14.5 scope: DB-driven filter architecture with screener_filters table (8 rows covering 4 filter paths), hybrid confluence buffer, ABCD pattern strategy, shared hybrid-compatibility-registry. Three hotfixes for pattern IMF metrics, trading filter thresholds, and regime thresholds.

**14.5.4 — 4-Path Filter Architecture (Batch 19G + HFs)**
Major filter redesign: FX5 scanner reads all filter thresholds from DB, pattern-global-filters.ts deleted, system-guards.ts filter constants deprecated, 4-column Dual-Path Filter Thresholds display, VTS dedup 3→1 per symbol+strategy, pattern scanning tab, pattern IMF parity. Multiple hotfixes for independent pattern IMF, active trading dual-pass, and DI rolling window.

**14.5.5 — VN Formula Revision + Calibration (Batch 19G VN + HFs)**
Replaced absolute-difference VN formula with log-returns MAD/median. Calibrated VN thresholds from empirical data (0.60/0.68/0.72/0.80). Removed all deprecated VN/DI constants. Fixed DI to use 48-candle rolling window. Removed hidden relaxed filter pass.

**14.5.6 — Filter Pipeline Diagnostics (Batches 19H, 19I, 19J)**
Built Filter Diagnostics tab in Machine Learning page: per-filter rejection counts for quant and pattern paths, 24-hour rolling aggregates, signal rejection breakdown by reason and regime, VTS evaluation breakdown with per-strategy null rates and pattern detection hit rates. Number formatting and 24-hour rolling aggregation for VTS evaluation.

**14.5.7 — Governance Overhaul (Batches 19H GOV, 19K GOV)**
CCPI essentials section, workflow ownership transfer (Claude Code owns deployment), Langston role change to reviewer, Replit Agent as stakeholder, batch catalog and phase history documents, standardized templates for reports and scope docs.

---

## Pre-Governance History

*The following phases were completed before the current governance system was established. Documentation is reconstructed from available records and may be incomplete.*

### Phase 1-11 — Foundation and Early Development

*(To be populated from old canonical documents and project history files)*

---

*End of document. Updated after every batch that completes or advances a phase.*
