# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, provides real-time market scanning, and enforces disciplined risk management. The application supports live and paper trading, integrates AI analysis via OpenAI's GPT models, and offers comprehensive trade tracking and performance analytics. The core vision is to create a resilient, continuously self-optimizing platform with an autonomous learning engine, aiming to capture significant market potential through sophisticated, automated trading capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first frontend built with React, TypeScript, and Vite, interacting with a Node.js/Express backend through RESTful API and WebSockets. Data is persisted using PostgreSQL with Drizzle ORM. Authentication is handled with username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is configurable with guardrail settings. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline, utilizing a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine, featuring a `ModeRegistry` and `MetricsCore`, manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm, and daily target goals with validation.

Architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery, and a Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and Kraken Canonical Symbol Mapping is implemented. WebSocket Subscription & Tick Flow Diagnostics provide tracing for the WebSocket lifecycle.

The UI includes an Enhanced Active Trades UI, GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency. `FinalScore` is the sole operational metric. The Analytics & Diagnostics page provides market regime explanations (8 regimes), friction narratives (4-tier system), and a trading activities feed. Sidebar navigation is structured for intuitive access. A Unified Table Schema integrates Market Regime & Friction Visualization into trading tables, displaying Market Regime badges and Friction color indicators. Governance invariants enforce the presence and mapping of regime and friction data. A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks for subsystems. Engine Activation Standardization requires authenticated API endpoint usage for starting engines, ensuring provenance tracking. Diagnostic Signal Flow Tracing uses a `DiagnosticTraceService` with buffered async logging.

A Passive & Active Learning Data Aggregator captures signal, strategy, and market-level metrics. A Python ML Microservice (Flask) provides real-time predictive modeling for promotion probability and profit prediction, integrated into the Signal Orchestrator. The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions. Mark Price Midpoint Valuation is consistently applied. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, leveraging predictive forecasting, a Cross-Regime Reinforcement Learning Engine, and a Multi-Agent Cooperative Optimizer. A Decision Confidence Engine unifies confidence metrics into a Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital. A Meta-Optimization Framework provides supervisory control, and the Global Autonomy Stabilization Protocol (GASP) ensures stable dynamic limits for adaptive subsystems.

Core quantitative metrics include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing. Covariance Guard and Risk Concentration Control manage portfolio-level correlation and position sizing. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) and a dedicated parity test suite. The system supports both paper and live trading modes.

The system enforces a "Physics First" approach (Net Expectancy Value (NetEV) > 0 for trade execution) and an "Extreme Noise Stop." The Dynamic Strategy Selector (DSS) adaptively determines strategy deployment based on market regime and mathematical expectancy. Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring. Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes via the `MLCalibrationService`, analyzing Hybrid trades to generate adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection using a `MultiTimeframeScanner` and token-bucket rate limiter. Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static pair selection with learning-driven pair selection. A `TelemetryAggregatorService` collects rolling 24-hour performance telemetry per pair, and the `AdaptiveScanManager` implements dual-pool selection (Ideal Pool and Rotational Pool) with a `PairFailureTracker` for cooldown blacklisting. This system ensures 100 pairs per cycle (60% Ideal + 40% Rotational), with dynamic fill algorithms to maintain batch size. The UI integrates a ranked pairs display with auto-refresh.

VTS Modernization and Regime-Driven Simulation replaces legacy scoring pipelines with Phase-10 canonical metrics, calculating per-pair market regimes dynamically using a 5-class model. The VTS auto-starts during passive learning, runs 60-second simulation cycles with 100 pairs from the Ideal Pool, and generates virtual trades for Telemetry and Predictive Learning. Full data segregation and ML calibration alignment are ensured. VTS is the sole source of telemetry writes during passive learning.

Strategy & Regime Harmonization unifies VTS and Signal Orchestrator onto a single canonical dictionary, defining canonical snake_case strategy names and normalizing patterns and regimes. A `canonical-regime-strategy-map.ts` serves as the single source of truth for all regime/strategy/signal type/pattern mappings, enforced by validation middleware. The ML Calibration Service uses Phase-10 metrics with a specific performance score formula and tracks edge delta for learning feedback. Math Core Harmonization centralizes and unifies the `FinalScore` calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service, using immutable scoring coefficients.

The trade lifecycle flows from `Signal Orchestrator` to `SQE` (FinalScore + RegimeWeight filtering), then to a `Ready-to-Buy Queue`. Signals are promoted by `TCL` (Trade Criteria Limiter), managed by `TEC` (Trade Execution Controller) for adaptive sizing and trailing exits, and finally proceed to `Order Management`. Diagnostic tooling is implemented for regime distribution, friction calibration, and Goals Engine normalization.

## Recent Changes

**Directive 11.4H.5 Implementation (January 2026):**
- **Task 1 - Benchmark Force-Inclusion**: Modified `AdaptiveScanManager.getNextScanBatch()` to always inject benchmark pairs (BTC/ETH/SOL/stablecoins) into every scan batch, regardless of telemetry scores. Benchmark pairs now tracked separately in `AdaptiveScanBatch.benchmarkPairs`.
- **Task 2 - Institutional Math Filters**: Already enabled via `INSTITUTIONAL_MATH_ENABLED: true` in `system-guards.ts`. LQ, VolNoise, and Correlation guards active for all pair scans.
- **Task 3 - Market Event Intelligence**: Created `server/utils/market-events.ts` with `checkRegimeTransition()` and `checkFrictionTransition()` functions. Events logged when global regime or friction band changes. New `/api/market-events` endpoint returns transition history.
- **Task 4 - Overview Strategy/Signal Mapping**: Already implemented - Overview tab dynamically displays `favoredSignalTypes` and `favoredStrategies` based on current regime from `market-indicators.ts`.
- **Task 5 - Definitions & Mapping Reference UI**: Added collapsible `DefinitionsReference` component to Overview tab with beginner-friendly tables explaining Global Metric Definitions, Regime Types, Friction Types, Canonical Regime-Strategy Mapping, and Signal Types & Strategies.
- **Task 6 - Benchmark List Tab**: Created `client/src/components/analytics/benchmark-list.tsx` component. Added new "Benchmark List" tab (4th tab) to Analytics page displaying BTC/ETH/SOL/stablecoin pairs from Ideal Pool.
- **Task 7 - Entropy Diagnostic API**: New `/api/system/entropy` endpoint returns real-time Shannon entropy of regime distributions with normalized entropy score, regime distribution breakdown, and interpretation text.

**Directive 11.4H.6 Implementation (January 2026):**
- **Task 1A - Benchmark Regex Correction**: Created `server/config/benchmark-regex.ts` with strict `BENCHMARK_REGEX` pattern to prevent memecoins (e.g., FARTCOIN) from being misclassified as benchmarks. Pattern validates only BTC/XBT/ETH/SOL/USDT/USDC/DAI/BUSD/TUSD against USD/EUR/USDT/USDC quotes.
- **Task 1 - Benchmark Force-Inclusion Fix**: Updated `fx5-scanner.ts` to use `isBenchmarkSymbolStrict()` from the new regex module. Benchmarks are added to Ideal Pool at startup.
- **Task 2 - Benchmark Ranking Display**: Updated `benchmark-list.tsx` to show "—" (dash) for unranked pairs instead of #0.
- **Task 3 - IMF Telemetry Persistence**: Added logging and tracking for IMF metrics (LQ, VolNoise) during passive learning. Metrics are calculated and available for VTS even when `tradingActive=false`.
- **Task 4 - Benchmark Volatility/Boring Bypass**: Added `bypassVolatilityReject` and `bypassBoringReject` flags for benchmark pairs. Filter logic explicitly checks these flags to ensure benchmarks never get filtered out for low volatility or "boring" behavior.
- **Task 5 - Non-Benchmark Pair Flow Diagnostics**: Added `[11.4H.6][ScanFlow]` logging showing total pairs, passed filters count, IMF persisted count, benchmarks, and non-benchmarks.
- **Task 6 - Global Friction Continuous Audit**: Added `[11.4H.6][FrictionAudit]` logging in `market-indicators.ts` with spread range and sample size.
- **Task 7 - Overview Tab Dynamic Binding**: Updated `analytics.tsx` refetchInterval to 60 seconds with `refetchOnWindowFocus: true` for favored strategies/signals refresh.

**Directive 11.4H.6A Implementation (January 2026):**
- **Task 1 - Favored Strategy & Signal Binding**: Created `server/core/strategy-mapper.ts` with canonical strategy mapper providing regime-based strategy and signal type recommendations via `getStrategyMapperOutput()`.
- **Task 2 - Benchmark Rank Display Fix**: Verified `benchmark-list.tsx` shows "—" for unranked pairs (already implemented).
- **Task 3 - IMF Passive Learning Correction**: Implemented VTS → FX5 OHLC cache pipeline. VTS now caches OHLC data via `cacheOHLCData()` in `imf-metrics.ts`. FX5 scanner uses cached OHLC during passive learning for accurate LQ/VolNoise calculations instead of placeholders. Logs differentiate `[11.4H.6A][IMF OHLC]` (cached) vs `[11.4H.6A][IMF Passive]` (ticker fallback).
- **Task 4 - FX5 Dual-Scan Streamlining**: Added `[11.4H.6A][ModeCheck]` logging and early mode detection in FX5 scanner. Single scan runs during passive learning based on mode detection.
- **Task 5 - Logging Enhancements**: Added comprehensive `[11.4H.6A]` diagnostic logging including `[ModeCheck]`, `[PassiveScan]`, `[IMF OHLC]`, and `[IMF Passive]` tags.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.