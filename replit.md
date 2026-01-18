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

**Documentation Consolidation (January 18, 2026):**
- Updated `bridge/canonical/DawnTrader_Complete_Project_History.md` with Phase 11 completion (Z-Score normalization, macro-state detection, profitability gate)
- Updated `bridge/canonical/DawnTrader_Current_State_Reference.md` with Phase 11 production-ready components
- Updated `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` scope and file references
- Created `bridge/canonical/DawnTrader_Regime_Strategy_Mapping.md` - comprehensive canonical reference for 5 regimes, 17 strategies, 3 signal types, 5 pattern types, 4 friction tiers, and 4 macro conditions
- Created `bridge/canonical/DawnTrader_Mathematical_Architecture_v1.5.0.md` - complete mathematical architecture including Z-Score normalization and macro-state adjustments
- Replaced `bridge/canonical/Phase_11_Implementation_History.md` with full `docs/directive_11_summary.md` (812 lines)

**Directive 11.5 Implementation — "Math, Macro, and Regime Synchronization" (January 2026):**
- **Task 1 - Profitability Validation (Net Expectancy Gate)**: Created `server/core/calculations/expectancy.ts` with `isMathematicallyProfitable()` function. Integrated into VTS runner to skip trades where gross profit ≤ total cost.
- **Task 2 - Rolling Z-Score Normalization**: Created `server/utils/rolling-stats.ts` for 300-period rolling statistics. Added `getNormalizedRegime()` to `market-regime.ts` for Z-Score based regime classification.
- **Task 3 - Macro-State Module**: Created `server/core/metrics/macro-state.ts` with `getGlobalMacroCondition()` detecting VOLATILITY_EXPANSION, LIQUIDITY_CRUNCH, SPECULATIVE_SURGE, or NORMAL conditions.
- **Task 4 - Secondary Metric Adjustment**: Created `server/core/metrics/secondary-metrics.ts` with `adjustMetricRanges()` for dynamic threshold adjustment based on macro conditions.
- **Task 5 - Filter Logic Correction**: Updated `fx5-scanner.ts` so blue-chips/stablecoins are scanned but only tradable when passing IMF filters.
- **Task 6 - Strategy-Specific Guardrails**: Added ADX > 25 requirement for `sma_trend_ride` strategy in VTS runner.
- **Task 7 - Strategy Performance Audit**: Created `server/core/strategy-analyzer.ts` with `auditStrategyPerformance()` for per-strategy win rate analysis and keep/monitor/disable recommendations.
- **Z-Score Integration**: Integrated `getNormalizedRegimeWithDetails()` into VTS runner for per-pair Z-Score logging. Added Z-Score tracking to DSS (`dynamic-strategy-selector.ts`) for adaptive regime thresholds.

**Directive 11.4H.6E Implementation (January 2026):**
- **Task 1 - Authenticated Query Restoration**: Replaced raw fetch with apiFetch() in analytics.tsx for market indicators endpoint, ensuring credentials, JWT token, and x-app-mode headers are included.
- **Task 2 - UI Error Boundary**: Added full error fallback UI with AlertCircle icon, error message, and Retry button when indicatorsError occurs. Prevents silent failures.
- **Task 3 - Backend Diagnostic Logging**: Added [11.4H.6E] logging tag in routes.ts showing user ID on authorized requests.
- **Task 4 - Verification**: API now returns 200 OK, data displays correctly in Overview tab.

**Directive 11.4H.6D Implementation (January 2026):**
- **Task 1 - Dynamic Cache Bypass**: Updated analytics.tsx useQuery to use stable queryKey with timestamp in queryFn URL for HTTP cache bypass. staleTime: 0 + refetchInterval: 60s ensures proper refresh.
- **Task 2 - Live Regime Serialization**: Confirmed API already uses live regime data from getGlobalRegimeSnapshot.
- **Task 3 - Client Display Fallback**: Added fallback text for empty favoredStrategies array ("No active strategies for current regime").
- **Task 4 - Diagnostic Logging**: Updated logging to [11.4H.6D] tag in both frontend (useEffect) and backend (market-indicators.ts).

**Directive 11.4H.6C Implementation (January 2026):**
- **Task 1 - Overview Tab Binding**: Confirmed analytics.tsx correctly binds favoredStrategies and favoredSignalTypes from API response.
- **Task 2 - Benchmark Rank Display Fix**: Enhanced `benchmark-list.tsx` rank validation to check: `signalType !== 'Awaiting Scan'`, `strategy !== 'Awaiting Scan'`, `regime !== 'UNKNOWN'`, `score > 0`, and valid numeric rank. Unscanned pairs show "—".
- **Task 3 - Logging**: Updated market-indicators.ts logging tag to `[11.4H.6C]` showing serialized favoredStrategies and favoredSignalTypes.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.