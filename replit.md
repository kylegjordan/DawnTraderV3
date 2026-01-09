# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, and error diagnosis. It features an autonomous learning engine, aiming to be a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via RESTful API and WebSocket. Data persistence is managed by PostgreSQL, accessed via Neon serverless driver and Drizzle ORM. Authentication employs username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is handled by dedicated guardrail settings. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine with a `ModeRegistry` and `MetricsCore` manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, simplified daily target goals with Goal Feasibility Validation & Audit System, and an adaptive learning system.

Architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and Kraken Canonical Symbol Mapping is implemented. WebSocket Subscription & Tick Flow Diagnostics trace the complete WebSocket subscription lifecycle and price stages.

The UI provides comprehensive features including an Enhanced Active Trades UI, GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency. The `FinalScore` remains the sole operational metric (Metric Engine v1.0 Canonical), and schema integrity is validated. The Analytics & Diagnostics page (schema v1.6.3) provides a continuous single-page layout with expanded Market Regime explanations (8 regimes with 3-4 sentence descriptions), expanded Friction Narratives (4-tier system), and Trading Activities feed (7-day retention). Sidebar navigation follows the hierarchy: Dashboard → Trading → Goals Engine → Analytics & Diagnostics → Walter → Briefings → Reports → AI Transparency → System Monitoring → Settings.

Directive 11.4B implements Unified Table Schema with Market Regime & Friction Visualization. TradeRecord interface includes MarketRegimeType and FrictionColor fields. All three trading tables (Ready-to-Buy with 17 columns, Open Trades with 21 columns, Trade History with 18 columns) display Market Regime badges and Friction color indicators. The 4-tier friction color mapping uses green (0-20, High Liquidity), yellow (21-50, Normal), orange (51-80, Stressed), and red (81-100, Frozen). Governance invariants M24 (regime+friction co-present), M25 (friction visual mapping), and M26 (net P&L from canonical totalCost) are enforced.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks for timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage and implementing provenance tracking. Diagnostic Signal Flow Tracing uses a `DiagnosticTraceService` with buffered async logging.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice (Flask) provides real-time predictive modeling for promotion probability and profit prediction, integrated into the Signal Orchestrator.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions. Mark Price Midpoint Valuation is consistently applied. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, with predictive forecasting, a Cross-Regime Reinforcement Learning Engine, and a Multi-Agent Cooperative Optimizer.

A Decision Confidence Engine unifies various confidence metrics into a single Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital through adaptive exposure modulation. A Meta-Optimization Framework provides high-level supervisory control, and the Global Autonomy Stabilization Protocol (GASP) ensures stable dynamic limits for adaptive subsystems.

Core quantitative metrics include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing. Covariance Guard and Risk Concentration Control manage portfolio-level correlation and position sizing. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) and a dedicated parity test suite. The system has transitioned to a mode-based architecture (paper/live).

The system enforces a "Physics First" approach (Net Expectancy Value (NetEV) > 0 for trade execution) and an "Extreme Noise Stop." The Dynamic Strategy Selector (DSS) adaptively determines strategy deployment based on market regime and mathematical expectancy (Net EV).

Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring, acting as an "intelligent referee" to issue trades only when multiple intelligence sources agree within time, direction, and confidence constraints. Configuration for hybrid strategies (e.g., H1_TREND_SNIPER, H2_SLINGSHOT) defines minimum score, confluence window, and weights for Quant, Pattern, and ML signals. The system is long-only. Pattern Decay implements an exponential decay of pattern strength.

Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes via the `MLCalibrationService`, analyzing Hybrid trades to generate adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection using a `MultiTimeframeScanner` and token-bucket rate limiter.

Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static pair selection with learning-driven pair selection. A `TelemetryAggregatorService` collects rolling 24-hour performance telemetry per pair, and the `AdaptiveScanManager` implements dual-pool selection (Ideal Pool and Rotational Pool) with a `PairFailureTracker` for cooldown blacklisting. Directive 11.4C.1 fully activates the adaptive scanning system with 100 pairs per cycle (60% Ideal + 40% Rotational), replacing the deprecated 60-pair Top-N/Tier-B system. The legacy `collectMixedBatch()` is deprecated; `collectAdaptiveBatch()` is now the sole batch generator (M27 governance). Governance invariants M27-M31 enforce adaptive scan runtime ≤30s, telemetry freshness ≤24h, and correct pool ratios.

Directive 11.4C.2 implements Dynamic Fill Algorithm: when the ideal pool has fewer pairs than target (e.g., during bootstrapping), the system expands rotational count to maintain ~100-pair batches. Formula: `dynamicRotationalCount = baseRotationalCount + idealDeficit`. When ideal pool is sufficient, normal 60/40 (or adaptive) ratio is preserved. Ideal pool qualification requires ≥3 samples within 24-hour window. Composite score formula: `finalScore × 0.4 + hybridScore × 0.3 + regimeWeight × 0.2 + predictiveConfidence × 0.1`. For future UI access to ranked ideal pool, use `TelemetryAggregatorService.getTopPairsWithPool(100)`.

Directive 11.0E.1 (VTS Modernization & Regime-Driven Simulation) replaces the legacy CWQI/NGC/DI/GSI scoring pipeline with Phase-10 canonical metrics (finalScore, hybridScore, regimeWeight, predictiveConfidence, decayPenalty). The modernized VTS calculates per-pair market regimes dynamically from OHLC data using a 5-class model: BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, and TRANSITION. Each regime maps to signalType (Hybrid, Pattern, Quantitative) and strategy sets via `regimeStrategyMap`. The VTS auto-starts during passive learning mode, runs 60-second simulation cycles with 100 pairs from the Ideal Pool, and generates virtual trades for Telemetry and Predictive Learning. Pattern recognition is preloaded with 2000 candles for warm-up. Governance invariants M45-M49 enforce regime/signalType/strategy inclusion, per-cycle regime calculation, CWQI/NGC/DI/GSI removal, VTS auto-start in passive mode, and graceful strategy load failure handling. Schema version: v1.6.6.

Math Core Harmonization (Centralized Scoring Coefficients) unifies the `FinalScore` calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service, using immutable scoring coefficients (Hybrid: 0.4, Confidence: 0.3, Regime: 0.2, Decay: 0.1). FinalScore formula: `hybridScore × 0.4 + predictiveConfidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1`.

The trade lifecycle flow proceeds from `Signal Orchestrator` to `SQE` (FinalScore + RegimeWeight filtering), then to a `Ready-to-Buy Queue`. Signals are promoted by `TCL` (Trade Criteria Limiter), then managed by `TEC` (Trade Execution Controller) for adaptive sizing and trailing exits, finally proceeding to `Order Management`. The `SQE` filters by configurable `finalScoreMin` and `regimeWeightMin` thresholds. `TEC` configuration is centralized with parameters like `ADAPTIVE_EXPAND_FACTOR`, `ADAPTIVE_CONTRACT_FACTOR`, and `TRAILING_STOP_BASE`.

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.