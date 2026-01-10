# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for the Kraken exchange. Its primary purpose is to automate advanced trading strategies, provide real-time market scanning, and enforce disciplined risk management. The application supports both live and paper trading, leverages OpenAI's GPT models for AI analysis, and offers comprehensive trade tracking and performance analytics. With an autonomous learning engine, it aims to be a resilient, continuously self-optimizing platform with significant market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first frontend built with React, TypeScript, and Vite, communicating with a Node.js/Express backend via RESTful API and WebSockets. Data persistence is managed by PostgreSQL, utilizing the Neon serverless driver and Drizzle ORM. Authentication is handled with username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is integrated through configurable guardrail settings. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline, operating on a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine, featuring a `ModeRegistry` and `MetricsCore`, manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm, and daily target goals with validation.

Architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery, and a Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and Kraken Canonical Symbol Mapping is implemented. WebSocket Subscription & Tick Flow Diagnostics provide tracing for the WebSocket lifecycle.

The UI includes an Enhanced Active Trades UI, GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency. `FinalScore` is the sole operational metric. The Analytics & Diagnostics page provides market regime explanations (8 regimes), friction narratives (4-tier system), and a trading activities feed. Sidebar navigation is structured for intuitive access.

A Unified Table Schema integrates Market Regime & Friction Visualization into trading tables (Ready-to-Buy, Open Trades, Trade History), displaying Market Regime badges and Friction color indicators (green, yellow, orange, red for liquidity levels). Governance invariants enforce the presence and mapping of regime and friction data.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks for subsystems. Engine Activation Standardization requires authenticated API endpoint usage for starting engines, ensuring provenance tracking. Diagnostic Signal Flow Tracing uses a `DiagnosticTraceService` with buffered async logging.

A Passive & Active Learning Data Aggregator captures signal, strategy, and market-level metrics. A Python ML Microservice (Flask) provides real-time predictive modeling for promotion probability and profit prediction, integrated into the Signal Orchestrator.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions. Mark Price Midpoint Valuation is consistently applied. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, leveraging predictive forecasting, a Cross-Regime Reinforcement Learning Engine, and a Multi-Agent Cooperative Optimizer.

A Decision Confidence Engine unifies confidence metrics into a Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital. A Meta-Optimization Framework provides supervisory control, and the Global Autonomy Stabilization Protocol (GASP) ensures stable dynamic limits for adaptive subsystems.

Core quantitative metrics include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing. Covariance Guard and Risk Concentration Control manage portfolio-level correlation and position sizing. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) and a dedicated parity test suite. The system supports both paper and live trading modes.

The system enforces a "Physics First" approach (Net Expectancy Value (NetEV) > 0 for trade execution) and an "Extreme Noise Stop." The Dynamic Strategy Selector (DSS) adaptively determines strategy deployment based on market regime and mathematical expectancy.

Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring, issuing trades when multiple intelligence sources agree within defined constraints. Configuration for hybrid strategies defines minimum scores, confluence windows, and weights for Quant, Pattern, and ML signals. The system is long-only, and Pattern Decay implements an exponential decay of pattern strength.

Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes via the `MLCalibrationService`, analyzing Hybrid trades to generate adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection using a `MultiTimeframeScanner` and token-bucket rate limiter.

Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static pair selection with learning-driven pair selection. A `TelemetryAggregatorService` collects rolling 24-hour performance telemetry per pair, and the `AdaptiveScanManager` implements dual-pool selection (Ideal Pool and Rotational Pool) with a `PairFailureTracker` for cooldown blacklisting. This system ensures 100 pairs per cycle (60% Ideal + 40% Rotational), with dynamic fill algorithms to maintain batch size during bootstrapping or ideal pool sparsity. Governance invariants enforce adaptive scan runtime, telemetry freshness, and correct pool ratios. The UI integrates a ranked pairs display with auto-refresh.

VTS Modernization and Regime-Driven Simulation replaces legacy scoring pipelines with Phase-10 canonical metrics, calculating per-pair market regimes dynamically using a 5-class model (BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, TRANSITION). The VTS auto-starts during passive learning, runs 60-second simulation cycles with 100 pairs from the Ideal Pool, and generates virtual trades for Telemetry and Predictive Learning. Full data segregation and ML calibration alignment are ensured through persistent Phase-10 metrics in VirtualTrade and VirtualSignal schemas, removal of legacy fields, schema parity for ML training, and source tracking (`source='simulation'`). A `vtsSimulation` cache bucket isolates VTS data.

ML Calibration Service now uses Phase-10 metrics with a specific performance score formula and tracks edge delta for learning feedback.

Math Core Harmonization centralizes and unifies the `FinalScore` calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service, using immutable scoring coefficients (Hybrid: 0.4, Confidence: 0.3, Regime: 0.2, Decay: 0.1).

The trade lifecycle flows from `Signal Orchestrator` to `SQE` (FinalScore + RegimeWeight filtering), then to a `Ready-to-Buy Queue`. Signals are promoted by `TCL` (Trade Criteria Limiter), managed by `TEC` (Trade Execution Controller) for adaptive sizing and trailing exits, and finally proceed to `Order Management`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.