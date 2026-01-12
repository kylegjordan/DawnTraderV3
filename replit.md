# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, provides real-time market scanning, and enforces disciplined risk management. Key features include live and paper trading, AI analysis powered by OpenAI's GPT models, and comprehensive trade tracking and performance analytics. The application aims to be a resilient, continuously self-optimizing platform with an autonomous learning engine, targeting significant market potential by providing sophisticated, automated trading capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first frontend built with React, TypeScript, and Vite, communicating with a Node.js/Express backend via RESTful API and WebSockets. Data persistence is managed by PostgreSQL with Drizzle ORM. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is integrated with configurable guardrail settings. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline, operating on a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine, featuring a `ModeRegistry` and `MetricsCore`, manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm, and daily target goals with validation.

Architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery, and a Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and Kraken Canonical Symbol Mapping is implemented. WebSocket Subscription & Tick Flow Diagnostics provide tracing for the WebSocket lifecycle.

The UI includes an Enhanced Active Trades UI, GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency. `FinalScore` is the sole operational metric. The Analytics & Diagnostics page provides market regime explanations (8 regimes), friction narratives (4-tier system), and a trading activities feed. Sidebar navigation is structured for intuitive access.

A Unified Table Schema integrates Market Regime & Friction Visualization into trading tables, displaying Market Regime badges and Friction color indicators. Governance invariants enforce the presence and mapping of regime and friction data. A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks for subsystems. Engine Activation Standardization requires authenticated API endpoint usage for starting engines, ensuring provenance tracking. Diagnostic Signal Flow Tracing uses a `DiagnosticTraceService` with buffered async logging.

A Passive & Active Learning Data Aggregator captures signal, strategy, and market-level metrics. A Python ML Microservice (Flask) provides real-time predictive modeling for promotion probability and profit prediction, integrated into the Signal Orchestrator.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions. Mark Price Midpoint Valuation is consistently applied. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, leveraging predictive forecasting, a Cross-Regime Reinforcement Learning Engine, and a Multi-Agent Cooperative Optimizer.

A Decision Confidence Engine unifies confidence metrics into a Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital. A Meta-Optimization Framework provides supervisory control, and the Global Autonomy Stabilization Protocol (GASP) ensures stable dynamic limits for adaptive subsystems.

Core quantitative metrics include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing. Covariance Guard and Risk Concentration Control manage portfolio-level correlation and position sizing. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) and a dedicated parity test suite. The system supports both paper and live trading modes.

The system enforces a "Physics First" approach (Net Expectancy Value (NetEV) > 0 for trade execution) and an "Extreme Noise Stop." The Dynamic Strategy Selector (DSS) adaptively determines strategy deployment based on market regime and mathematical expectancy. Hybrid Integration (Ensemble Intelligence) merges Quantitative and Pattern signals into Hybrid trades through ensemble scoring. Predictive Calibration (The Training Loop) enables the engine to learn from Virtual Trade Simulator (VTS) outcomes via the `MLCalibrationService`, analyzing Hybrid trades to generate adjustment recommendations for strategy parameters.

Multi-Timeframe Expansion (Fractal Vision) enables cascading timeframe analysis (1H→15m→5m) with Kraken API rate-limit protection using a `MultiTimeframeScanner` and token-bucket rate limiter. Adaptive Scanning Intelligence (Dual-Pool Scheduler) replaces static pair selection with learning-driven pair selection. A `TelemetryAggregatorService` collects rolling 24-hour performance telemetry per pair, and the `AdaptiveScanManager` implements dual-pool selection (Ideal Pool and Rotational Pool) with a `PairFailureTracker` for cooldown blacklisting. This system ensures 100 pairs per cycle (60% Ideal + 40% Rotational), with dynamic fill algorithms to maintain batch size. The UI integrates a ranked pairs display with auto-refresh.

VTS Modernization and Regime-Driven Simulation replaces legacy scoring pipelines with Phase-10 canonical metrics, calculating per-pair market regimes dynamically using a 5-class model. The VTS auto-starts during passive learning, runs 60-second simulation cycles with 100 pairs from the Ideal Pool, and generates virtual trades for Telemetry and Predictive Learning. Full data segregation and ML calibration alignment are ensured. VTS is the sole source of telemetry writes during passive learning.

Strategy & Regime Harmonization unifies VTS and Signal Orchestrator onto a single canonical dictionary, defining canonical snake_case strategy names and normalizing patterns and regimes. A `canonical-regime-strategy-map.ts` serves as the single source of truth for all regime/strategy/signal type/pattern mappings, enforced by validation middleware.

The ML Calibration Service now uses Phase-10 metrics with a specific performance score formula and tracks edge delta for learning feedback. Math Core Harmonization centralizes and unifies the `FinalScore` calculation formula across Signal Orchestrator and Ready-to-Buy Refresh Service, using immutable scoring coefficients.

The trade lifecycle flows from `Signal Orchestrator` to `SQE` (FinalScore + RegimeWeight filtering), then to a `Ready-to-Buy Queue`. Signals are promoted by `TCL` (Trade Criteria Limiter), managed by `TEC` (Trade Execution Controller) for adaptive sizing and trailing exits, and finally proceed to `Order Management`.

## Directive 11.4G: Regime/Friction/Goals Diagnostics

Directive 11.4G implements comprehensive diagnostic tooling for regime distribution, friction calibration, and Goals Engine normalization:

### G.1: Context-Aware Strategy Selection
- VTS uses `selectContextAwareStrategy()` with deterministic diversity via symbol hash
- Pattern-to-canonical mapping ensures INSIDE_BAR→ENGULFING, THREE_SOLDIERS→MORNING_STAR
- Canonical patternType enforcement in VTS signal generation

### G.2: Blue-Chip Exclusion Audit
- `server/scripts/diagnostic-11.4G-2.ts` ranks pairs by actual 24h volume
- Identifies high-volume pairs excluded for LOW_VOLATILITY (stablecoins), NO_DATA (XBT quote pairs)
- Report: `/audit/reports/bluechip_exclusion_audit.json`

### G.3: Regime Flattening & Friction Diagnostics
- `server/scripts/diagnostic-11.4G-3.ts` calculates regime distribution entropy
- Rehydrates telemetry from persisted state before analysis
- Falls back to volume classifier when telemetry empty
- Report: `/audit/reports/regime_friction_diagnostics.json`

### G.4: Fix Application
- `server/scripts/diagnostic-11.4G-4.ts` reads G.2/G.3 reports
- Documents XBT pairs as zero-volume, stablecoins correctly excluded
- Proposes ideal pool volume preference adjustments
- Report: `/audit/reports/g4_fixes_applied.json`

### G.5: Goals Engine Normalization
- `server/scripts/diagnostic-11.4G-5.ts` validates FinalScore calculation
- Imports weights from `server/config/score-weights.config.ts` (v1.0.1)
- Loads live thresholds from `getSQEThresholdsFromConfig()` for paper/live modes
- Detects configuration drift between defaults and screener config
- Report: `/audit/reports/g5_normalization_diagnostics.json`

### FinalScore Configuration (Authoritative Sources)
- **Weights**: `server/config/score-weights.config.ts`
  - hybridScore: 40%, confidence: 30%, regimeWeight: 20%, decayPenalty: -10%
- **Thresholds**: `server/core/filters/signal_quality_evaluator.ts`
  - MIN_FINAL_SCORE: 0.35, MIN_REGIME_WEIGHT: 0.30
- **Frontend**: `client/src/components/goals/filters-with-override.tsx`
  - DEFAULT: 0.35, MIN: 0.2, MAX: 1.0, STEP: 0.05

## Directive 11.4H: Pre-Flight Fixes

Directive 11.4H implements pre-flight integrity fixes for production readiness:

### H.1: Symbol Normalization Integration
- `normalizeToInternalSymbol()` applied at all data ingress points
- Files: `vts-runner.ts`, `fx5-scanner.ts`, `signal-orchestrator.ts`
- Ensures canonical BASE/QUOTE format (e.g., "BTC/USD") throughout system
- Audit: `server/scripts/audit_symbol_normalization.ts`

### H.2: Adaptive Friction Rebalancing
- `computeAdaptiveFrictionBands()` in `cost-metrics.ts`
- Percentile-based tiers (30th/70th) targeting GREEN≈30%, ORANGE≈40%, RED≈30%
- 60-second TTL cache for computed bands
- Audit: `server/scripts/audit_friction_balance.ts`

### H.3: Blue-Chip & Stablecoin Forced Inclusion
- `forceInclude` flag bypasses LQ/VolNoise metric filters in `fx5-scanner.ts`
- Blue-chip threshold: volume24h > $50M
- Stablecoin inclusion: volatility > 0.0005 AND symbol matches USDT/USDC/DAI
- Audit: `server/scripts/audit_bluechip_inclusion.ts`

### H.4: Regime Entropy Monitoring
- `computeRegimeEntropy()` in `telemetry-aggregator.ts`
- Shannon entropy normalized 0-1 (max entropy = log2(5 regimes))
- Warning at entropy < 0.2 with >100 pairs (normalization collapse)
- Audit: `server/scripts/audit_regime_entropy.ts`

### H.5: Adaptive Goals Weighting
- `adaptive-goals-weight.ts` with ML contribution cap at 40%
- Volatility-sensitive adjustment: ML weight reduced in high volatility
- Weight redistribution: 60% to hybrid, 40% to regime when ML capped
- Audit: `server/scripts/audit_goals_weights.ts`

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **Kraken WebSocket API**: Real-time ticker feed.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: Primary external market price feed.
-   **CoinGecko API**: Fallback external market price feed.