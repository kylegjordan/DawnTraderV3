# DawnTrader Batch Catalog

> **Purpose**: Master index of every batch deployed to the DawnTrader system.
> **Updated by**: Claude Code (mandatory after every batch — code and governance)
> **Location**: `1-system-manual/BATCH_CATALOG.md`

---

## Batch Index

| Batch | Date | Phase | Description | Scope File | Completion Report |
|-------|------|-------|-------------|------------|-------------------|
| Batch 1 | 2026-02-22 | 12.1 | Fix DI probability divergence (BUG-004) — geometric DI from closePrices | — | — |
| Batch 1B | 2026-02-22 | 12.1 | Governance docs updated for BUG-004 RESOLVED | — | — |
| Batch 2 | 2026-02-22 | 12.1 | Fix dual friction models (RISK-009) — canonical cost model replaces BASE_FEE_SLIPPAGE | — | — |
| Batch 3 | 2026-02-23 | 12.1 | Security hardening — JWT fallbacks removed from 12 files, bypass headers removed from 4 files | — | — |
| Batch 4 | 2026-02-24 | 12.2 | NLAI system removal — neural-layer AI references cleaned from 8 files | — | — |
| Batch 5 | 2026-02-24 | 12.2 | Walter safe deletions — 9 Walter files deleted | — | — |
| Batch 6 | 2026-02-26 | 12.2 | Walter importers + frontend + routes cleaned | — | — |
| Batch 7A | 2026-02-26 | 12.2 | Bob + Cortex deletions | — | — |
| Batch 7B | 2026-02-26 | 12.2 | Bob + Cortex surgery — ~17,100 lines across ~65 files | — | — |
| Batch 8 | 2026-02-27 | 12.2 | Wave 1 safe deletions — LATTi residuals + DHMA orphan | — | — |
| Batch 9 | 2026-02-27 | 12.2 | MarketScanner class removal (~637 lines), frontend dead pages | — | — |
| Batch 10 | 2026-02-27 | 12.2 | Learning services residual cleanup | — | — |
| Batch 11 | 2026-02-27 | 12.2 | Goal alignment gate + friction cleanup — Wave 4 friction model unification | — | — |
| Batch 12 | 2026-02-28 | 12.3 | Strategy spec placement | — | — |
| Batch 13 | 2026-03-01 | 12.3 | Phase 12.3 pipeline unification | — | — |
| Batch 14 | 2026-03-03 | 13 | Phase 13 MCE installation + L12/L20 removal + strategy enum expansion hotfix | — | — |
| Batch 15 | 2026-03-04 | 14.1 | Phase 14 VTS real calculations + DBS + regime rename | — | — |
| HF6 | 2026-03-05 | 14.1 | Regime rename completion | — | — |
| HF7 | 2026-03-06 | 14.1 | Regime recalibration | — | — |
| HF8 | 2026-03-07 | 14.1 | VTS throughput fixes | — | — |
| HF9 | 2026-03-08 | 14.1 | Column fix, governance gate, DSS deletion, VTS IMF | — | — |
| Batch 16 | 2026-03-07 | 14.1 | VTS throughput (absorbed into HF8) | — | — |
| Batch 17 | 2026-03-08 | 14.1 | Column fix + VTS IMF (absorbed into HF9) | — | — |
| Batch 18 | 2026-03-09 | Inter-phase | API budget optimization — OHLC cache, priceCache, BATCH_SIZE 100→300 | — | — |
| HF10 | 2026-03-14 | Inter-phase | KrakenService property name fix | — | — |
| HF10B | 2026-03-14 | Inter-phase | Governance for HF10 + process updates | — | — |
| HF11B | 2026-03-16 | Inter-phase | Governance enforcement + consolidation | — | — |
| HF12 | 2026-03-17 | Inter-phase | Regime archive catch-up fix + scheduler-status endpoint | — | — |
| HF12B | 2026-03-17 | Inter-phase | Governance for HF12 + operational model in SYSTEM_MANUAL | — | — |
| HF12C | 2026-03-17 | Inter-phase | Route path prefix fix — all endpoints reachable | — | — |
| HF12D | 2026-03-17 | Inter-phase | Governance for HF12C + Claude Code UI debugging in CCPI | — | — |
| Batch 19 | 2026-03-18 | 14.5 | Phase 14.5: Dual-path pattern scanning + merit-based ranking + MCE global regime overlay | `SCOPE_19.md` | `Batch_Completion_19_03.18.26.md` |
| Batch 19B | 2026-03-18 | 14.5 | Governance for Batch 19 | — | — |
| Batch 19C | 2026-03-18 | 14.5 | Deferred VTS + frontend + regime items | `SCOPE_19C.md` | — |
| Batch 19E | 2026-03-19 | 14.5 | VTS pattern pool — sourcePool field, DB schema, frontend badges | `SCOPE_19E.md` | — |
| Batch 19F | 2026-03-19 | 14.5 | Phase 14.5 completion — DB-driven filters, hybrid confluence, ABCD pattern | `SCOPE_19F.md` | — |
| Batch 19F HF1 | 2026-03-19 | 14.5 | Pattern IMF metrics fix (DI=0 rejection via OHLC pre-fetch) | — | — |
| Batch 19F HF2 | 2026-03-19 | 14.5 | Trading filter thresholds from DB, deprecated hardcoded constants | — | — |
| Batch 19F HF3 | 2026-03-20 | 14.5 | Trading regime thresholds and log generation timestamps | — | — |
| Batch 19G | 2026-03-20 | 14.5 | DB-driven 4-path filter architecture, FX5 reads from DB, VTS dedup, pattern scanning tab | `SCOPE_19G.md` | `Batch_Completion_19G_03.20.26.md` |
| Batch 19G HF1 | 2026-03-20 | 14.5 | Pattern IMF metrics for pattern-only pairs | — | — |
| Batch 19G HF2 | 2026-03-20 | 14.5 | Trading filter thresholds from DB | — | — |
| Batch 19G HF3 | 2026-03-20 | 14.5 | Trading regime thresholds + log timestamps | — | — |
| Batch 19G VN | 2026-03-20 | 14.5 | Log-returns MAD/median VN formula revision | — | — |
| Batch 19G VN HF | 2026-03-20 | 14.5 | Remove deprecated VN/DI constants | — | — |
| Batch 19G VN HF2 | 2026-03-20 | 14.5 | Independent pattern IMF | — | — |
| Batch 19G VN HF2B | 2026-03-20 | 14.5 | Active trading pattern pool dual-pass | — | — |
| Batch 19G DI | 2026-03-20 | 14.5 | Rolling 48-candle window for DI | — | — |
| Batch 19G GOV | 2026-03-20 | 14.5 | Remove hidden relaxed filter pass — all filtering DB-driven | — | — |
| Batch 19H | 2026-03-21 | 14.5 | Filter Pipeline Diagnostics tab — per-filter rejection visibility | `SCOPE_19H.md` | — |
| Batch 19H GOV | 2026-03-21 | 14.5 | CCPI governance — deployment rules, workflow ownership, table width fix | — | — |
| Batch 19I | 2026-03-21 | 14.5 | Filter Diagnostics enhancement — number formatting, VTS evaluation breakdown | — | — |
| Batch 19J | 2026-03-21 | 14.5 | VTS Evaluation Breakdown — 24-hour rolling aggregation | — | — |
| Batch 19K GOV | 2026-03-22 | 14.5 | CCPI overhaul — essentials section, workflow update, new governance docs | — | — |
