# DawnTrader Directive Index

> **Purpose**: Master tracker for all directives issued from Phase 12 onward.
> **Updated by**: Claude Code (after each directive status change)
> **Statuses**: PENDING → ISSUED → IN PROGRESS → IN REVIEW → CORRECTIONS → COMPLETE

---

## Phase 12: Cleanup & Foundation

### 12.1 Critical Math & Security Fixes

| Directive | Title | Status | Date Issued | Date Complete | Review Cycles | Notes |
|-----------|-------|--------|-------------|---------------|---------------|-------|
| 12.1.1 | Fix DI Probability Divergence (BUG-004) | COMPLETE | 2026-02-22 | 2026-02-22 | 1 | Batch 1 — geometric DI from closePrices |
| 12.1.2 | Fix Dual Friction Models (RISK-009) | COMPLETE | 2026-02-22 | 2026-02-22 | 1 | Batch 2 — canonical cost model replaces BASE_FEE_SLIPPAGE |
| 12.1.3 | Security Hardening — JWT Fallback + Auth Bypass Removal | COMPLETE | 2026-02-23 | 2026-02-23 | 1 | Batch 3 — JWT fallbacks removed from 12 files, bypass headers removed from 4 files |
| 12.1.4 | Remove Simulated Price Display (BUG-020) | COMPLETE | 2026-02-23 | 2026-02-23 | 1 | Batch 3 — fake entryPrice*1.02 removed from active-trades.tsx |
| 12.1.5 | RiskManager Comment/Stub Cleanup | COMPLETE | 2026-02-23 | 2026-02-23 | 1 | Batch 3 — orphaned [9.0-FP] and [9.6.3] comments cleaned from 5 files |
| 12.1.6 | LSP Error Triage (RISK-085) | PENDING | — | — | — | ~620 errors |

### 12.2 Dead Code Purge

| Directive | Title | Status | Date Issued | Date Complete | Review Cycles | Notes |
|-----------|-------|--------|-------------|---------------|---------------|-------|
| 12.2.1 | Wave 1: Safe Deletions | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 8 — LATTi residuals + DHMA orphan + expectedDuration. 2 files deleted, 11 files modified, ~1,254 lines removed. |
| 12.2.2 | Wave 1.5: MarketScanner Class Removal | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 9 — MarketScanner class removed (~637 lines), collectAdaptiveBatch preserved. 5 consuming files cleaned. BUG-009 RESOLVED. |
| 12.2.3 | Wave 3: Walter/Bob/Cortex Removal | COMPLETE | 2026-02-24 | 2026-02-26 | 1 | Sub-Batch A (Batch 5): 9 Walter files deleted. Sub-Batch B (Batch 6): Walter importers + frontend + routes cleaned. Sub-Batch C (Batch 7): Bob+Cortex ecosystems removed. ~17,100 lines across ~65 files. |
| 12.2.4 | Wave 3.1: Frontend Walter Cleanup | COMPLETE | 2026-02-24 | 2026-02-26 | 1 | Absorbed into 12.2.3 Sub-Batch B (Batch 6). 5 frontend files deleted, App.tsx + sidebar.tsx modified. |
| 12.2.5 | Wave 4: Friction Model Unification | PENDING | — | — | — | — |
| 12.2.6 | Wave 4.5: Goal Alignment Removal | PENDING | — | — | — | Investigation revealed gate is FULLY OPERATIONAL — needs Kyle decision |
| 12.2.7 | Wave 4.7: NLAI System Removal | COMPLETE | 2026-02-24 | 2026-02-24 | 1 | Batch 4 — 5 files deleted, 6 files modified, ~2,147 lines removed |
| 12.2.8 | Wave 8: Walter-Era Learning Services | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 10 — 3 dead services deleted (cognitive-interpreter, event-broker, phase-8.6.5-enhancements, ~1,363 lines). autonomy-controller bug fixed. RISK-044 RESOLVED. Walter storage methods removed. |
| 12.2.9 | Wave 9: Frontend Dead Code | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 9 — 6 dead pages deleted (~2,453 lines), stale History import removed from App.tsx. |

### 12.3 Pipeline Unification

| Directive | Title | Status | Date Issued | Date Complete | Review Cycles | Notes |
|-----------|-------|--------|-------------|---------------|---------------|-------|
| 12.3.1 | Regime Authority Resolution (BUG-006, BUG-008) | PENDING | — | — | — | — |
| 12.3.2 | Strategy Routing Expansion | PENDING | — | — | — | 17 canonical strategies |
| 12.3.3 | Confidence Authority Cleanup (NGC removal) | PENDING | — | — | — | HIGH risk |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Directives Issued | 12 |
| Total Directives Complete | 12 |
| Total Directives In Progress | 0 |
| Total Review Cycles | 12 |
| Average Review Cycles per Directive | 1.00 |

---

*Index updated after each directive status change. Future phases (13-22) will be added as Phase 12 nears completion.*
