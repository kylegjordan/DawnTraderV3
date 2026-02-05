# DawnTrader: Core System Files Reference
## For Project Manager Review

**Document Created:** January 18, 2026  
**Last Updated:** February 5, 2026  
**Purpose:** Curated list of core system files showing how the app is structured and components integrate

---

# Table of Contents

1. [Configuration & Entry Points](#1-configuration--entry-points)
2. [Database & Schema](#2-database--schema)
3. [Core Metrics & Math Engine](#3-core-metrics--math-engine)
4. [Trading Services](#4-trading-services)
5. [Market Scanning & Signal Generation](#5-market-scanning--signal-generation)
6. [Price & Data Infrastructure](#6-price--data-infrastructure)
7. [Trade Execution & Management](#7-trade-execution--management)
8. [Learning & Telemetry](#8-learning--telemetry)
9. [API Routes & WebSocket](#9-api-routes--websocket)
10. [Frontend Core](#10-frontend-core)
11. [Canonical Documentation](#11-canonical-documentation)

---

# 1. Configuration & Entry Points

| File | Purpose |
|------|---------|
| `server/index.ts` | Main server entry point, Express setup |
| `server/routes.ts` | All API route definitions |
| `server/vite.ts` | Vite development server configuration |
| `server/config/canonical-regime-strategy-map.ts` | Single source of truth for regime/strategy mappings |
| `shared/schema.ts` | Shared types and Drizzle ORM schema |
| `drizzle.config.ts` | Database configuration |
| `vite.config.ts` | Frontend build configuration |
| `package.json` | Dependencies and scripts |

---

# 2. Database & Schema

| File | Purpose |
|------|---------|
| `server/db.ts` | Database connection and Drizzle client |
| `shared/schema.ts` | Complete database schema (trades, signals, users, settings, telemetry) |
| `server/storage.ts` | Data access layer / repository pattern |

---

# 3. Core Metrics & Math Engine

These files contain the mathematical foundation of the trading system.

## 3.1 Regime Detection

| File | Purpose |
|------|---------|
| `server/core/metrics/market-regime.ts` | 5-class regime detection (BULL_STABLE, BEAR_VOLATILE, etc.) with Z-Score normalization |
| `server/core/metrics/macro-state.ts` | Global macro condition detection (VOLATILITY_EXPANSION, LIQUIDITY_CRUNCH, etc.) |
| `server/utils/rolling-stats.ts` | 300-period rolling statistics for Z-Score calculation |

## 3.2 Institutional Math Filters (IMF)

| File | Purpose |
|------|---------|
| `server/core/metrics/imf-metrics.ts` | Log-Liquidity (LQ), Volatility Noise (VolNoise), Directional Integrity (DI), Sigma calculations |
| `server/core/metrics/secondary-metrics.ts` | Dynamic IMF threshold adjustments based on macro conditions |
| `server/core/metrics/quality_index.ts` | Signal quality scoring |

## 3.3 Cost & Profitability

| File | Purpose |
|------|---------|
| `server/core/calculations/net-expectancy-kernel.ts` | **SOLE AUTHORITY** for Net EV math (Phase 11.8B-A) |
| `server/core/calculations/expectancy.ts` | Net Expectancy Value (NetEV) profitability gate |
| `server/core/math/cost-model.ts` | Fee, spread, slippage cost modeling |
| `server/core/metrics/cost-metrics.ts` | Trade cost calculations |
| `server/core/cache/cost-cache.ts` | Cost caching for performance |

## 3.4 Risk Management

| File | Purpose |
|------|---------|
| `server/core/risk/dynamic-sizing-engine.ts` | Adaptive position sizing |
| `server/core/metrics/risk_index.ts` | Risk scoring and assessment |

---

# 4. Trading Services

Core services that power the trading engine.

## 4.1 Exchange Integration

| File | Purpose |
|------|---------|
| `server/services/kraken.ts` | Kraken REST API integration (orders, balances, market data) |
| `server/services/kraken-ws-adapter.ts` | Kraken WebSocket adapter for real-time tickers |
| `server/services/utils/symbol-canonicalizer.ts` | Kraken symbol ↔ BASE/QUOTE translation |

## 4.2 Trading Engine

| File | Purpose |
|------|---------|
| `server/services/trading-engine.ts` | Main trading engine orchestrator |
| `server/services/paper-execution-engine.ts` | Paper trading execution (simulated orders) |
| `server/services/trade-execution-controller.ts` | Trade execution control and validation |
| `server/services/order-manager.ts` | Order lifecycle management |

---

# 5. Market Scanning & Signal Generation

## 5.1 Scanning Infrastructure

| File | Purpose |
|------|---------|
| `server/services/fx5-scanner.ts` | Main market scanner (FX5) - scans pairs through IMF filters |
| `server/services/adaptive-scan-manager.ts` | Dual-pool architecture (60% Ideal + 40% Rotational) |
| `server/services/pair-failure-tracker.ts` | Cooldown blacklisting for failed pairs |

## 5.2 Signal Processing

| File | Purpose |
|------|---------|
| `server/services/signal-orchestrator.ts` | Signal generation and FinalScore calculation |
| `server/services/dynamic-strategy-selector.ts` | Strategy selection based on regime |
| `server/core/filters/signal_quality_evaluator.ts` | Signal quality filtering (SQE) |

## 5.3 Ready-to-Buy Pipeline

| File | Purpose |
|------|---------|
| `server/services/rtb-refresh-service.ts` | Ready-to-Buy queue refresh with Adaptive Concurrency Tuner |
| `server/services/ready-to-buy-manager.ts` | RTB queue management |

---

# 6. Price & Data Infrastructure

## 6.1 Price Caching

| File | Purpose |
|------|---------|
| `server/services/price-cache.ts` | Unified 4-bucket price cache (openTrade, readyToBuy, fx5Snapshot, vtsSimulation) |
| `server/services/live-pricing-adapter.ts` | Dual-source price feed (Binance primary, CoinGecko fallback) |

## 6.2 Timing Infrastructure

| File | Purpose |
|------|---------|
| `server/services/central-clock.ts` | Synchronized 1-second ticks for all subsystems |
| `server/services/kraken-rate-limiter.ts` | API rate limit management |

---

# 7. Trade Execution & Management

| File | Purpose |
|------|---------|
| `server/services/trailing-exit-controller.ts` | Adaptive trailing stop-loss management |
| `server/services/apr-sle-engine.ts` | Adaptive Profit Realization & Stop-Loss Evolution |
| `server/services/trade-criteria-limiter.ts` | Trade promotion criteria (TCL) |
| `server/services/active-filter-pool.ts` | TTL-based active trade filtering |

---

# 8. Learning & Telemetry

## 8.1 Virtual Trade Simulator

| File | Purpose |
|------|---------|
| `server/services/vts-runner.ts` | Virtual Trade Simulator - generates simulated trades for learning |
| `server/services/vts-subsystem.ts` | VTS lifecycle management |

## 8.2 Telemetry & Learning

| File | Purpose |
|------|---------|
| `server/services/telemetry-aggregator.ts` | Rolling 24-hour performance telemetry per pair |
| `server/services/ml-calibration.ts` | ML-powered strategy calibration |
| `server/services/passive-data-aggregator.ts` | Passive learning data collection |
| `server/core/strategy-analyzer.ts` | Per-strategy performance audit |

## 8.3 Calibration & Governance (Phase 11 Predictive Learning)

| File | Purpose |
|------|---------|
| `server/core/calibration/ml-calibration-scheduler.ts` | **SOLE AUTHORITY** for learning schedule (Phase 11.8) |
| `server/core/calibration/canonical-weights-generator.ts` | Generates canonical regime weights |
| `server/core/governance/governance-engine.ts` | Regime transition governance |
| `server/core/governance/regime-stability.ts` | Stability classification (NORMAL/DEFENSIVE/SURVIVAL) |

## 8.4 Regime Archive (Phase 11.7)

| File | Purpose |
|------|---------|
| `server/core/archival/regime-archiver.ts` | Weekly regime metric archival |
| `server/core/archival/archival-scheduler.ts` | Archive scheduler (Sunday 00:45 UTC) |
| `server/routes/regime-archive.ts` | Archive API endpoints |

---

# 9. API Routes & WebSocket

| File | Purpose |
|------|---------|
| `server/routes.ts` | All REST API endpoints |
| `server/routes/trading-routes.ts` | Trade-specific endpoints |
| `server/routes/market-indicators.ts` | Market indicator API (regime, strategies) |
| `server/services/websocket-manager.ts` | WebSocket connection management |

---

# 10. Frontend Core

## 10.1 Entry Points

| File | Purpose |
|------|---------|
| `client/src/main.tsx` | React app entry point |
| `client/src/App.tsx` | Main app component with routing |
| `client/src/lib/api.ts` | API client with authentication |

## 10.2 Key Pages

| File | Purpose |
|------|---------|
| `client/src/pages/dashboard.tsx` | Main dashboard |
| `client/src/pages/analytics.tsx` | Analytics & diagnostics |
| `client/src/pages/active-trades.tsx` | Active trade management |
| `client/src/pages/goals-engine.tsx` | Trading goals configuration |
| `client/src/pages/settings.tsx` | System settings |

## 10.3 Key Components

| File | Purpose |
|------|---------|
| `client/src/components/global-metrics-bar.tsx` | Top metrics bar |
| `client/src/components/benchmark-list.tsx` | Pair ranking display |
| `client/src/components/trade-table.tsx` | Trade list with regime/friction display |

## 10.4 State & Hooks

| File | Purpose |
|------|---------|
| `client/src/hooks/use-trading.tsx` | Trading state management |
| `client/src/hooks/use-websocket.tsx` | WebSocket connection hook |
| `client/src/hooks/use-portfolio-balance.tsx` | Balance tracking |

---

# 11. Canonical Documentation

| File | Purpose |
|------|---------|
| `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` | Complete system architecture and data flow |
| `bridge/canonical/DawnTrader_Current_State_Reference.md` | Current production state and configurations |
| `bridge/canonical/DawnTrader_Complete_Project_History.md` | Full development history V1 through Phase 11 |
| `bridge/canonical/DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md` | Canonical regime/strategy/signal/pattern mappings |
| `replit.md` | Project overview and recent changes |

---

# Quick Start Reading Order

For a project manager wanting to understand the system, recommended reading order:

1. **High-Level Architecture:**
   - `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md`
   - `replit.md`

2. **Core Trading Logic:**
   - `server/config/canonical-regime-strategy-map.ts` (regime/strategy definitions)
   - `server/services/signal-orchestrator.ts` (signal generation)
   - `server/services/fx5-scanner.ts` (market scanning)

3. **Math Foundation:**
   - `server/core/metrics/market-regime.ts` (regime detection)
   - `server/core/metrics/imf-metrics.ts` (institutional filters)
   - `server/core/calculations/expectancy.ts` (profitability gate)

4. **Data Flow:**
   - `server/services/price-cache.ts` (price infrastructure)
   - `server/services/rtb-refresh-service.ts` (ready-to-buy pipeline)
   - `server/services/adaptive-scan-manager.ts` (dual-pool scanning)

5. **Execution:**
   - `server/services/trading-engine.ts` (main engine)
   - `server/services/paper-execution-engine.ts` (paper trading)
   - `server/services/trailing-exit-controller.ts` (exit management)

---

# File Count Summary

| Category | File Count |
|----------|------------|
| Configuration | 8 |
| Database | 3 |
| Core Metrics | 13 |
| Trading Services | 4 |
| Market Scanning | 6 |
| Price Infrastructure | 4 |
| Trade Execution | 4 |
| Learning & Telemetry | 10 |
| API & WebSocket | 4 |
| Frontend Core | 12 |
| Documentation | 5 |
| **Total Core Files** | **~73** |

---

# 12. Files Decommissioned (Phase 11.8B)

The following files were removed in Phase 11.8 as part of the authority unification:

## 12.1 Backend Services (Removed)

| File | Reason |
|------|--------|
| `server/services/heuristic-trader.ts` | LATTi core service (parallel learning) |
| `server/services/lottie-oversight-service.ts` | DHMA health monitoring |
| `server/services/baseline-indicator.ts` | LATTi baseline service |
| `server/services/walter-standby.ts` | Walter/LATTi placeholder |
| `server/services/walter-adaptive-heuristics.ts` | Adaptive heuristics |
| `server/services/dhma-tuning-service.ts` | DHMA auto-tuning |
| `server/jobs/cognitive-tuning-job.ts` | Scheduled tuning job |
| `server/services/strategy-presets.ts` | Static preset definitions |

## 12.2 Frontend Components (Removed)

| File | Reason |
|------|--------|
| `client/src/components/latti-toast-listener.tsx` | Toast notifications |
| `client/src/components/monitoring/lottie-tuning-tab.tsx` | Tuning UI |
| `client/src/components/dashboard/dashboard-latti-widget.tsx` | Dashboard widget |
| `client/src/components/dashboard/latti-goals-mirror.tsx` | Goals mirror |
| `client/src/hooks/use-baseline-status.ts` | Baseline hook |
| `client/src/components/goals/tuning-tab.tsx` | Goals ML UI |
| `client/src/components/goals/presets-grid.tsx` | Preset System UI |
| `client/src/components/goals/adaptive-risk-advisor.tsx` | ARA UI |
| `client/src/components/goals/walter-purpose-tab.tsx` | Purpose tab |

---

*This document provides a curated view of the most important files for understanding DawnTrader's architecture. The full codebase contains additional utilities, tests, and specialized modules.*

*Last Updated: February 5, 2026*
