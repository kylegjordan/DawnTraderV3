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
| 12.2.5 | Wave 4: Friction Model Unification | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 11 — 3 deprecated friction functions removed from analysis-utils.ts. vts-service.ts migrated to canonical cost model. UNIFY-001 RESOLVED. |
| 12.2.6 | Wave 4.5: Goal Alignment Gate Removal | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 11 — Phase 9.0 alignment verification system removed: alignment-verifier.ts + strategic-policy-guard.ts deleted, AlignmentTab UI removed, /alignment routes removed, 2 schema tables removed. ~1,400 lines. Note: Phase 4 Goal Alignment in pre-execution-validator.ts and trading-engine.ts (RISK-028, BUG-012) remains — separate system. |
| 12.2.7 | Wave 4.7: NLAI System Removal | COMPLETE | 2026-02-24 | 2026-02-24 | 1 | Batch 4 — 5 files deleted, 6 files modified, ~2,147 lines removed |
| 12.2.8 | Wave 8: Walter-Era Learning Services | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 10 — 3 dead services deleted (cognitive-interpreter, event-broker, phase-8.6.5-enhancements, ~1,363 lines). autonomy-controller bug fixed. RISK-044 RESOLVED. Walter storage methods removed. |
| 12.2.9 | Wave 9: Frontend Dead Code | COMPLETE | 2026-02-27 | 2026-02-27 | 1 | Batch 9 — 6 dead pages deleted (~2,453 lines), stale History import removed from App.tsx. |

### 12.3 Pipeline Unification

| Directive | Title | Status | Date Issued | Date Complete | Review Cycles | Notes |
|-----------|-------|--------|-------------|---------------|---------------|-------|
| 12.3.1 | Regime Authority Resolution (BUG-006, BUG-008) | COMPLETE | 2026-03-03 | 2026-03-03 | 1 | Batch 13 — DSS rewired to `calculatePairRegime()`. Canonical 5-regime model. EXTREME_NOISE preserved as pre-filter. BUG-006 RESOLVED, BUG-008 partially resolved (Engine #1 replaced, Engine #4 MCP/ARE remains for Wave 6). |
| 12.3.2 | Strategy Routing Expansion | COMPLETE | 2026-03-03 | 2026-03-03 | 1 | Batch 12 (spec) + Batch 13 (implementation). 8 strategy modules implemented per vetted spec. StrategySignal type expanded 9→17. strategy-sync.ts updated to 17 canonical strategies. Signal orchestrator wired with 8 new evaluation blocks. |
| 12.3.3 | Confidence Authority Cleanup (NGC removal) | COMPLETE | 2026-03-03 | 2026-03-03 | 1 | Batch 13 — NGC replaced with deterministic confidence formula. Rolling normalization infrastructure preserved but bypassed. All export signatures maintained for backward compatibility. |

---

## Phase 13: MCE Installation

### 13.1 Market Context Engine + L12-L20 Legacy Removal

| Directive | Title | Status | Date Issued | Date Complete | Review Cycles | Notes |
|-----------|-------|--------|-------------|---------------|---------------|-------|
| 13.1 | MCE Installation + L12-L20 Legacy Removal | COMPLETE | 2026-03-04 | 2026-03-04 | 1 | Batch 14 (`8f26369a`) + Batch 14-hotfix (`db521adc`). MCE created as centralized VWAP/SMA/ATR/regime service. Signal orchestrator + VTS runner wired to MCE. 29 legacy files deleted (entire L12-L20 cluster). strategy_type enum expanded 9→18 (hotfix). BUG-002, BUG-003, BUG-008, RISK-002, RISK-016, RISK-019, RISK-020 RESOLVED. Net ~-8,200 lines. |

---

---

## Phase 14: Strategy-Specific VTS & Pipeline Refinement

### 14.1 Strategy-Specific VTS (BUG-001)

| Hotfix | Title | Status | Date Complete | Batch | Notes |
|--------|-------|--------|---------------|-------|-------|
| HF1-HF5 | VTS core wiring prep | COMPLETE | 2026-03-05 | Batch 15 | Foundation for strategy detect integration |
| HF6 | Wire VTS to real StrategyEngine detect functions | COMPLETE | 2026-03-05 | Batch 15 | `048bbc16` — 17 strategies with real entry/stop/target |
| HF6B | Fix VTS volume=0 bug + range_trade alias | COMPLETE | 2026-03-05 | Batch 15 | `ae431e17` — ticker volume passed to MCE |
| HF7 | Regime classification recalibration for crypto DX | COMPLETE | 2026-03-06 | Batch 15 | `64014bd2` — DX thresholds 25 to 45/50/55/60, momentum window 14 to 30 |
| HF8 | VTS throughput fixes + remaining items | COMPLETE | 2026-03-07 | Batch 16 | `052fb224` — 60-min candles, 100 OHLC, BTC candles, param relaxation, FinalScore dedup, SQE confidence floor, analytics regime-map, config fix. Eliminates Phase 14.1B from roadmap. |
| HF9 | Column fix + Governance gate SQE migration + DSS deletion + VTS IMF relaxation | COMPLETE | 2026-03-07 | Batch 17 | `f9fa56c6` — 5 context fields + filterTier persisted, governance gate moved to SQE, DSS fully deleted, VTS IMF relaxation with dual-path strict/relaxed filtering |

### Inter-Phase Optimization

| Batch | Title | Status | Date Complete | Commit | Notes |
|-------|-------|--------|---------------|--------|-------|
| Batch 18 | API Budget Optimization + FX5 300 Pairs | COMPLETE | 2026-03-08 | `4b6b2fa9` | OHLC cache, orchestrator priceCache migration, BATCH_SIZE 100 to 300, filterTier fix. API calls ~18,200 to ~7,520/hr (58% reduction) |

### Standalone Hotfixes

| Batch | Title | Status | Date Complete | Commit | Notes |
|-------|-------|--------|---------------|--------|-------|
| Batch 18C | Regime Archive Fix | COMPLETE | 2026-03-10 | `c42283f1` | clearArchiveForFreshStart startup wipe removed, debug UI cleaned, route double-mount fixed |
| Batch 18E | VTS Pipeline Hotfix | COMPLETE | 2026-03-10 | `5d774fb2` | Batch size hardcode 100 to BATCH_SIZE, VTS VN_MAX 0.80 to 0.95, stale comments fixed |
| Batch 18F | FX5 OHLC Wiring | COMPLETE | 2026-03-10 | `9de4afc7` | FX5 wired to ohlcCache for real VN/σ/DI. Replaced imfModule with universal OHLC pre-fetch. |
| Batch 18G | OHLC-Based LQ | COMPLETE | 2026-03-10 | `f82b7b66` | Per-candle volume LQ replacing saturating 24h aggregate. LQ now 30-60 range, unified VTS+active. |
| Batch 18H | Crypto Strategy Recalibration | COMPLETE | 2026-03-10 | `ca2f8b5f` | ATR-based dynamic thresholds (3 strategies), touch count + tolerance zones (4 strategies), RSI/ADX/volatility gates relaxed (4 strategies), pattern strengths reduced (7 strategies), BTC correlation widened. 24 edits, 10 files. 4-LLM consensus. |
| Batch 18I | VTS Stale Position Cleanup | COMPLETE | 2026-03-11 | `3d907032` | Move timeout check before price availability in resolveOpenVirtualTrades(). Prevents indefinite Map accumulation for symbols with unavailable prices. BUG-027 RESOLVED. |
| Batch 18J | IMF Filter Recalibration + Fee Unification + LQ Standardization | COMPLETE | 2026-03-11 | `5eae1601` | VN 0.60 to 0.93 (active), 0.80 to 0.96 (passive), 0.95 to 0.98 (VTS). LQ 40 to 35. Correlation 0.75 to 0.92. DI trending 65 to 55. Volume $2M to $500K. Fee constants unified to exchange-defaults.ts (4 files migrated). LQ fallback standardized on Formula B. 15 edits, 7 files. 4-LLM consensus. BUG-028 RESOLVED. |
| Batch 18K | Governance docs for Batches 18H/18I/18J | COMPLETE | 2026-03-11 | `1fd16fb0` | CCPI, DIRECTIVE_INDEX, CHANGES_AND_FIXES, SYSTEM_IMPACT_MAP, SYSTEM_MANUAL updated |
| Batch 18L | VTS Throughput Hotfix | COMPLETE | 2026-03-13 | `d1e2329b` | Relax Net EV floor (-0.005), skip ROI gate (log-only), 3 concurrent trades per combo, interval 30s, pairs 200, MAX_OPEN_TRADES 500 |
| BATCH_GOV_LANGSTON | Add Langston autonomous agent section to CCPI | COMPLETE | 2026-03-14 | `48648f72` | Four Actors table, Langston section (infrastructure, SSH, Telegram, 3-way comms, CLI tools, capabilities, common issues) |
| BATCH_GOV_LANGSTON_UPDATE | Update Langston CCPI section with Replit automation learnings | COMPLETE | 2026-03-14 | `7698462f` | 12 replit-cmd commands, Replit Automation Details subsection, 5 new common issues |
| HF10 | KrakenService Property Name Fix | COMPLETE | 2026-03-14 | `5f04e4eb` | signal-orchestrator.ts line 1036: this.krakenService to this.kraken. Latent bug in cascadingScan (Directive 10.7 CASCADE path, currently disabled). |
| HF10B | Governance for HF10 + Process Updates | COMPLETE | 2026-03-14 | (this batch) | CCPI workflow updated for autonomous pipeline (Langston deploys, Claude Code syncs). Session transition protocol documented. |
| HF11B | Governance Enforcement Mechanisms | COMPLETE | 2026-03-16 | `32f1d13f` | Pre-flight checklist, post-batch audit, cross-actor capacity monitoring, session transition protocol, batch report template, Rules 18-20, CCPI Langston slimdown, WORKFLOW.md redirect, GPT-5.4 brain update |
| HF12 | Regime Archive Startup Catch-Up | COMPLETE | 2026-03-17 | `3fb344eb` | Startup catch-up check (auto-archive if >7 days stale), scheduler-status health endpoint |
| HF12B | Governance for HF12 + Operational Model | COMPLETE | 2026-03-17 | `f3f70781` | CCPI updates (HF12 in completed directives, last commit), SYSTEM_MANUAL.md operational model section, DIRECTIVE_INDEX updates (HF11B + HF12 rows) |
| HF12C | Regime Archive Route Path Prefix Fix | COMPLETE | 2026-03-17 | `3edf80d4` | All 10 route registrations in regime-archive.ts had redundant `/api` prefix causing double-prefix 404s. Manual archive trigger confirmed working (26 records, 2 manifest files). |
| HF12D | Governance for HF12C + Claude Code UI Debugging Capability | COMPLETE | 2026-03-17 | `8cae5317` | CCPI updated with HF12B/HF12C in completed directives, last commit updated, new "Claude Code UI Testing & Debugging Capabilities" section documenting browser access, preview URL, test credentials, debugging workflow, trading pipeline debug sequence. DIRECTIVE_INDEX updated with HF12B/HF12C/HF12D rows. |

---

## Phase 14.5: Dual-Path Pattern Scanning + Merit-Based Ranking + MCE Global Regime

### 14.5 Pattern Scanning + Ranking + Global Regime (Block 3)

| Batch | Title | Status | Date Complete | Commit | Notes |
|-------|-------|--------|---------------|--------|-------|
| Batch 19 | Phase 14.5: Dual-Path Pattern Scanning + Merit-Based Ranking + MCE Global Regime Overlay | COMPLETE | 2026-03-18 | `106996ab` + `1b917598` + `2ade1370` | 10 files (2 new configs, 1 full rewrite, 7 surgical edits). Pattern pool pipeline (FX5 → active-filter-pool → orchestrator → SQE → RTB → sizing). rankingScore cross-family ordering (QUANT/PATTERN/HYBRID weight profiles). MCE getDominantRegime() with mode-aware sourcing. sourcePool/signalType/assetClass identity tuple persisted in RTB metadata. Pattern sizing 15% cap. Elevated SQE floor (0.45). FinalScore gap safety rule. |
| Batch 19B | Governance for Phase 14.5 | COMPLETE | 2026-03-18 | (this batch) | CCPI, DIRECTIVE_INDEX, SYSTEM_IMPACT_MAP updated. batch-history.md updated. |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Directives Issued | 18 + 6 HF + 1 inter-phase + 15 standalone hotfixes/governance + 1 phase (14.5) |
| Total Directives Complete | 18 + 6 HF + 1 inter-phase + 15 standalone hotfixes/governance + 1 phase (14.5) |
| Total Directives In Progress | 0 |
| Total Review Cycles | 31 |
| Average Review Cycles per Directive | 1.00 |

---

*Index updated after each directive status change.*
