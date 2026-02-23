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
| 12.2.1 | Wave 1: Safe Deletions | PENDING | — | — | — | ~12 LATTi files + more |
| 12.2.2 | Wave 1.5: MarketScanner Class Removal | PENDING | — | — | — | Preserve collectAdaptiveBatch |
| 12.2.3 | Wave 3: Walter/Bob/Cortex Removal | PENDING | — | — | — | ~96 files |
| 12.2.4 | Wave 3.1: Frontend Walter Cleanup | PENDING | — | — | — | — |
| 12.2.5 | Wave 4: Friction Model Unification | PENDING | — | — | — | — |
| 12.2.6 | Wave 4.5: Goal Alignment Removal | PENDING | — | — | — | — |
| 12.2.7 | Wave 4.7: NLAI System Removal | PENDING | — | — | — | 5 files |
| 12.2.8 | Wave 8: Walter-Era Learning Services | PENDING | — | — | — | 5+ files |
| 12.2.9 | Wave 9: Frontend Dead Code | PENDING | — | — | — | 7 dead pages |

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
| Total Directives Issued | 5 |
| Total Directives Complete | 5 |
| Total Directives In Progress | 0 |
| Total Review Cycles | 5 |
| Average Review Cycles per Directive | 1.0 |

---

*Index updated after each directive status change. Future phases (13-22) will be added as Phase 12 nears completion.*
