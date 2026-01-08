# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, and error diagnosis. It features an autonomous learning engine, aiming to be a comprehensive, resilient, and continuously self-optimizing trading platform. Its core value lies in advanced automation and AI integration, offering significant market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via RESTful API and WebSocket. Data persistence is managed by PostgreSQL, accessed via Neon serverless driver and Drizzle ORM. Authentication employs username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is handled by dedicated guardrail settings. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine with a `ModeRegistry` and `MetricsCore` manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, simplified daily target goals with Goal Feasibility Validation & Audit System, and an adaptive learning system.

Architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and Kraken Canonical Symbol Mapping is implemented. WebSocket Subscription & Tick Flow Diagnostics trace the complete WebSocket subscription lifecycle and price stages.

The UI provides comprehensive features including an Enhanced Active Trades UI, GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency. **Directive 11.0G: Schema Integrity & Telemetry Validation Hardening (Schema v1.5.1)**. FinalScore remains the sole operational metric (Metric Engine v1.0 Canonical). Legacy metrics (CWQI, NGC, ProfitRate) have been permanently removed from the database schema. Archive integrity uses SHA-256 checksum validation. Telemetry includes schema sync validation between frontend and backend. ExecutionConfig is read-only locked. An Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks for timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage and implementing provenance tracking. Diagnostic Signal Flow Tracing uses a `DiagnosticTraceService` with buffered async logging.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice (Flask) provides real-time predictive modeling for promotion probability and profit prediction, integrated into the Signal Orchestrator.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions. Mark Price Midpoint Valuation is consistently applied. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, with predictive forecasting, a Cross-Regime Reinforcement Learning Engine, and a Multi-Agent Cooperative Optimizer.

A Decision Confidence Engine unifies various confidence metrics into a single Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital through adaptive exposure modulation. A Meta-Optimization Framework provides high-level supervisory control, and the Global Autonomy Stabilization Protocol (GASP) ensures stable dynamic limits for adaptive subsystems.

Core quantitative metrics include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing. Covariance Guard and Risk Concentration Control manage portfolio-level correlation and position sizing. **Directive 11.0F**: The FinalScore formula `(HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)` is the canonical scoring model (Metric Engine v1.0). Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) and a dedicated parity test suite. The system has transitioned to a mode-based architecture (paper/live).

The system enforces a "Physics First" approach (Net Expectancy Value (NetEV) > 0 for trade execution) and an "Extreme Noise Stop." The Dynamic Strategy Selector (DSS) adaptively determines strategy deployment based on market regime and mathematical expectancy (Net EV), including five-regime detection and strategy selection by confidence with NetEV > 0 filter.

Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring, acting as an "intelligent referee" to issue trades only when multiple intelligence sources agree within time, direction, and confidence constraints. Configuration for hybrid strategies (e.g., H1_TREND_SNIPER, H2_SLINGSHOT) defines minimum score, confluence window, and weights for Quant, Pattern, and ML signals. The system is long-only. Pattern Decay implements an exponential decay of pattern strength.

Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes via the `MLCalibrationService`, analyzing Hybrid trades to generate adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection using a `MultiTimeframeScanner` and token-bucket rate limiter.

Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static pair selection with learning-driven pair selection. A `TelemetryAggregatorService` collects rolling 24-hour performance telemetry per pair, and the `AdaptiveScanManager` implements dual-pool selection (Ideal Pool and Rotational Pool) with a `PairFailureTracker` for cooldown blacklisting.

Math Core Harmonization (Centralized Scoring Coefficients) unifies the `FinalScore` calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service, using immutable scoring coefficients (Hybrid: 0.4, Confidence: 0.3, Regime: 0.2, Decay: 0.1). FinalScore formula: `hybridScore × 0.4 + predictiveConfidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1`.

The trade lifecycle flow proceeds from `Signal Orchestrator` (exposure, correlation, cooldown) to `SQE` (FinalScore + RegimeWeight filtering), then to a `Ready-to-Buy Queue` (pre-ordered by FinalScore DESC). Signals are promoted by `TCL` (Trade Criteria Limiter) based on time or signal count, then managed by `TEC` (Trade Execution Controller) for adaptive sizing and trailing exits, finally proceeding to `Order Management`. The `SQE` filters by configurable `finalScoreMin` and `regimeWeightMin` thresholds. `TEC` configuration is centralized with parameters like `ADAPTIVE_EXPAND_FACTOR`, `ADAPTIVE_CONTRACT_FACTOR`, and `TRAILING_STOP_BASE` (read-only locked per Directive 11.0G). **Schema v1.5.1 (Directive 11.0G)**: FinalScore is the sole ranking metric. Legacy CWQI/NGC columns have been removed from the RTB signals table. Formal migration file and archive checksums implemented.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.

## Directive History
-   **Directive 11.3 (Complete)**: Predictive Risk & Cost Modeling - Dynamic Sizing Engine (DSE). Features: (1) telemetry_history.position_size and size_multiplier columns for trade sizing telemetry, (2) DSE module with predictive formula: size = baseSize × f(edge, volatility, cost, confidence), (3) bounded multiplier 0.3-1.2 with hard cap enforcement, (4) volatility metrics (ATR normalization) and cost metrics (spread + slippage / return), (5) applyDSEMultiplier() integration with paper-position-sizing, (6) diagnostics API endpoints (/api/diagnostics/dse/*), (7) 22 integration tests passing including adaptive weight integration tests, (8) DSE-compatible weight keys: expectedEdge, edge, winRate, profitRate, confidence, sampleCount, reliability with fallback derivation from generic weight profiles. Schema v1.5.6.
-   **Directive 11.2 R1**: Adaptive Scanning Fairness - Dynamic Ratio Balancer with pool tracking (ideal/rotational). Features: (1) telemetry_history.pool column for SQL persistence, (2) in-memory PoolPerformanceAggregate tracking win rate, sample count, and avgFinalScore per pool, (3) AdaptiveRatioManager uses in-memory aggregates as primary data source with SQL fallback, (4) TelemetryAggregator.getTopPairsWithPool/getRotationalPairsWithPool for explicit pool attribution, (5) 16 integration tests passing. Schema v1.5.5.
-   **Directive 11.1B**: Adaptive Learning Weight Persistence - SQL-based adaptive learning weights with timestamp propagation. Time decay formula: exp(-0.05 * ageDays) ~ 5% per day. Prevents stale learning from influencing current trading. Schema v1.5.3.
-   **Directive 11.1A1**: Telemetry Provenance Correction - Fixes data provenance flaw from 11.1A. FORCE_PERSIST enables writing but never relabels mode. getTrueMode() preserves actual execution mode. Rehydration loads only live-mode records to prevent test data contamination.
-   **Directive 11.1A**: Persistent Intelligence - SQL-based telemetry persistence with market regime tagging, checksum validation, and environment guards. See `docs/schema_reference_v1_5_2.md`.
-   **Directive 11.0E-G Summary**: See `docs/directive_11_summary.md` for the complete Metric Engine Consolidation history (FinalScore transition, legacy purge, schema hardening).