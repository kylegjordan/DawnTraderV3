# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and features an autonomous learning engine. Its core purpose is to provide a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential due to its advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via RESTful API and WebSocket. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is handled by `guardrail-settings.ts` and `trade-safety.ts`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine with a `ModeRegistry` and `MetricsCore` manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, simplified daily target goals with Goal Feasibility Validation & Audit System, and an adaptive learning system.

Key architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery and anomaly detection, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing.

The UI provides comprehensive enhancements including an Enhanced Active Trades UI with new columns and a GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency with detailed P/L breakdown. Signal Flow Correction & Confidence Source Consolidation uses NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks to coordinate timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage, and implements provenance tracking. Diagnostic Signal Flow Tracing implements a `DiagnosticTraceService` with buffered async logging and trace probes.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice Integration (Flask) provides real-time predictive modeling for promotion probability and profit prediction, managed by a `BootOrchestrator`. ML predictions are integrated into Signal Orchestrator as fire-and-forget enhancements, blending with NGC.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions for stable mid-price computation and real-time updates. Mark Price Midpoint Valuation is consistently applied across WebSocket and REST fallbacks. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator for calibration and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, with predictive forecasting. A Cross-Regime Reinforcement Learning Engine and a Multi-Agent Cooperative Optimizer continuously optimize strategy allocations and enable cooperative learning among trading strategies.

A Decision Confidence Engine unifies various confidence metrics into a single Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital through adaptive exposure modulation. A Meta-Optimization Framework provides high-level supervisory control to balance profit, drawdown, and stability. The Global Autonomy Stabilization Protocol (GASP) ensures all adaptive subsystems operate within stable dynamic limits.

Core quantitative metrics (`analysis-utils.ts`) include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing based on an Efficiency Ratio (ER). Covariance Guard and Risk Concentration Control (`covariance-engine.ts`, `risk-concentration.ts`) manage portfolio-level correlation and position sizing. CWQI v4 (`cwqi-service.ts`) provides a two-stage trade evaluation system with an Expectancy Value (EV) gate and a Quality Score. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) with a centralized `SYSTEM_GUARDS` object defining all key thresholds and parameters, and a dedicated parity test suite. The system has transitioned to a mode-based architecture (paper/live) with the removal of the deprecated `RiskManager` and userId-based queries. Live mode valuation uses Kraken API and price cache, while paper mode uses a portfolio_state table.

The system enforces a "Physics First" approach, where no trade executes unless Net Expectancy Value (NetEV) > 0. It also incorporates an "Extreme Noise Stop" that auto-vetoes trading when `volNoise` exceeds 0.6. The Dynamic Strategy Selector (DSS) adaptively determines which strategy to deploy based on market regime (trend × volatility) and mathematical expectancy (Net EV). This includes a five-regime detection with veto system and strategy selection by confidence with NetEV > 0 filter, integrated into the `signal-orchestrator.ts`.

Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring. The `HybridIntegrationService` (`hybrid-integration.ts`) acts as the "intelligent referee," issuing trades only when multiple intelligence sources agree within time, direction, and confidence constraints. Configuration via `HYBRID_PARAMS` in `system-guards.ts` defines MIN_SCORE (0.65), MAX_CONFLUENCE_WINDOW (5 candles), CANDLE_INTERVAL_MS (3600000ms = 1 hour), and WEIGHTS (Quant: 0.4, Pattern: 0.4, ML: 0.2). Hybrid strategies include H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, and H4_MOMENTUM_LINK. The system is long-only; all quant signals are BUY direction by design, and pattern signals are filtered to BUY.

Pattern Decay (Temporal Memory) implements an exponential decay of pattern strength over time.

Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes. The `MLCalibrationService` (`ml-calibration.ts`) analyzes recent Hybrid trades to calculate win rates and expectancy, generating adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection. The `MultiTimeframeScanner` (`multi-timeframe-scanner.ts`) implements a token-bucket rate limiter.

Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static Tier A/B logic with learning-driven pair selection. The `TelemetryAggregatorService` (`telemetry-aggregator.ts`) collects rolling 24-hour performance telemetry per pair. The `AdaptiveScanManager` (`adaptive-scan-manager.ts`) implements dual-pool selection: Ideal Pool (top-ranked) and Rotational Pool. A `PairFailureTracker` enforces cooldown blacklisting.

Math Core Harmonization (Centralized Scoring Coefficients) unifies the FinalScore calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service. The `score-weights.config.ts` defines immutable scoring coefficients (Hybrid: 0.4, Confidence: 0.3, Regime: 0.2, Decay: 0.1). FinalScore formula: `hybridScore × 0.4 + predictiveConfidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1`.

The system incorporates Verification & Config Purification, Backend Filter Deconfliction & Deprecation, Screeners & Filter Insights Modernization, UI Completion & Diagnostics Integration, and Final Deprecations & Telemetry Expansion directives to refine and enhance its operational integrity, telemetry, and filtering mechanisms.

**Directive 11.0B — Trade Lifecycle Flow (January 2026):**

```
[Signal Orchestrator] (exposure, correlation, cooldown)
     ↓
[SQE] (FinalScore + RegimeWeight from screener config)
     ↓
[Ready-to-Buy Queue] (pre-ordered by FinalScore DESC)
     ↓ (2-min or 15-signal trigger)
[TCL] (picks top N from pre-ordered RTB)
     ↓
[TEC] (adaptive sizing + trailing exits)
     ↓
[Order Management]
```

1.  **Signal Orchestrator**: Handles exposure, correlation, and cooldown.
2.  **SQE (Signal Quality Evaluator)** (`server/core/filters/signal_quality_evaluator.ts`): Filters by FinalScore >= finalScoreMin and RegimeWeight >= regimeWeightMin. Thresholds read from screener_filters table (configurable via UI). Default: FinalScore >= 0.35, RegimeWeight >= 0.30. **DEPRECATED**: NGC, CWQI, Risk, ProfitRate filtering removed.
3.  **Ready-to-Buy Queue**: Holds signals for promotion, pre-ordered by FinalScore DESC.
4.  **TCL (Trade Criteria Limiter)** (`server/core/criteria-limiter.ts`): Picks top N signals from pre-ordered RTB (no local sorting). Event-based promotion: 2-minute failsafe timer, 15-signal RTB queue threshold.
5.  **TEC (Trade Execution Controller)** (`server/services/execution-controller.ts`): Manages active trades with adaptive sizing (+10% trendline reinforced, -10% trendline weakened) and trailing exits.
6.  **Order Management**: Executes trades.

**Schema v1.4.3**: screener_filters table has `final_score_min`, `regime_weight_min` columns. storage.getRtbSignals supports `orderBy: 'finalScore'`. Tests: 29 passing.

**Directive 11.0C — SQE & TEC Stabilization (January 2026):**

1.  **EXECUTION_CONFIG** (`server/config/execution-config.ts`): Centralized TEC configuration with:
    - `ADAPTIVE_EXPAND_FACTOR`: 1.10 (+10% on trendline reinforcement)
    - `ADAPTIVE_CONTRACT_FACTOR`: 0.90 (-10% on trendline weakness)
    - `TRAILING_STOP_BASE`: 0.015 (1.5% base trailing stop distance)
    - `TRAILING_STOP_ACCELERATION`: 0.002 (acceleration factor)
    - `MAX_POSITION_RISK`: 0.02 (2% max position risk)
    - Version: v1.0.0

2.  **SQE Backfill Logic**: Missing `FinalScore` or `RegimeWeight` now auto-defaults to 0.35 (no warnings/rejections).

3.  **TEC Telemetry Integration**: TEC config exposed in `/api/telemetry/summary` for diagnostics visibility.

4.  **Diagnostics UI Update**: Phase 11 modules section added, TEC configuration panel displays live values.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.