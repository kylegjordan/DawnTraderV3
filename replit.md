# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, utilizing OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via RESTful API and WebSocket. Data persistence is handled by PostgreSQL, accessed via Neon serverless driver and Drizzle ORM. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `AIAnalyst`, and `AIOpportunitiesService`. Risk management is managed by `guardrail-settings.ts` and `trade-safety.ts`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine with a `ModeRegistry` and `MetricsCore` manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

Key architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery and anomaly detection, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing.

The UI provides comprehensive enhancements including an Enhanced Active Trades UI with new columns and a GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency with detailed P/L breakdown. Signal Flow Correction & Confidence Source Consolidation uses NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks to coordinate timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage, and implements provenance tracking. Diagnostic Signal Flow Tracing implements a `DiagnosticTraceService` with buffered async logging and trace probes.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice Integration (Flask) provides real-time predictive modeling for promotion probability and profit prediction, managed by a `BootOrchestrator`. ML predictions are integrated into Signal Orchestrator as fire-and-forget enhancements, blending with NGC.

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions for stable mid-price computation and real-time updates. Mark Price Midpoint Valuation is consistently applied across WebSocket and REST fallbacks. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator for calibration and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, with predictive forecasting. A Cross-Regime Reinforcement Learning Engine and a Multi-Agent Cooperative Optimizer continuously optimize strategy allocations and enable cooperative learning among trading strategies.

A Decision Confidence Engine unifies various confidence metrics into a single Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital through adaptive exposure modulation. A Meta-Optimization Framework provides high-level supervisory control to balance profit, drawdown, and stability. The Global Autonomy Stabilization Protocol (GASP) ensures all adaptive subsystems operate within stable dynamic limits.

System health is maintained through a Safe Heartbeat Monitor, a Volume Classifier for market liquidity, and a Pipeline Processing Time Guard to track latency. Comprehensive system audit and validation suites are regularly performed.

Core quantitative metrics (`analysis-utils.ts`) include Log-Liquidity (LQ), Directional Integrity (DI), Volatility Noise (VolNoise), and Sigma (σ). Dynamic Trade Management is implemented via an Adaptive Trailing Exit (`trailing-exit-controller.ts`) with a dynamic stop distance formula and a two-stage latching system. An Adaptive Kalman Filter (`adaptive-kalman.ts`) dynamically adjusts smoothing based on an Efficiency Ratio (ER). Covariance Guard and Risk Concentration Control (`covariance-engine.ts`, `risk-concentration.ts`) manage portfolio-level correlation and position sizing. CWQI v4 (`cwqi-service.ts`) provides a two-stage trade evaluation system with an Expectancy Value (EV) gate and a Quality Score. Sim-to-Live Parity is ensured by a Configuration Lock (`system-guards.ts`) with a centralized `SYSTEM_GUARDS` object defining all key thresholds and parameters, and a dedicated parity test suite. The system has transitioned to a mode-based architecture (paper/live) with the removal of the deprecated `RiskManager` and userId-based queries. Live mode valuation uses Kraken API and price cache, while paper mode uses a portfolio_state table.

## [9.7] Guardrails Migration - Legacy Deprecation

**IMPORTANT:** The legacy `guardrails` table is deprecated. All guardrails access must use `guardrails_v2`.

**Deprecated Methods (Throw Errors):**
- `storage.getGuardrails()` - Use `storage.getGuardrailsV2()` instead
- `storage.upsertGuardrails()` - Use `storage.upsertGuardrailsV2()` instead
- `updateGuardrails()` in config-update-service.ts - Use `updateGuardrailsV2()` instead

**Read-Only Legacy Access:**
- `storage.getGuardrailsLegacy()` - For debugging/audit purposes only

**Key Differences (guardrails_v2):**
- Percentage-based risk: `portfolioRiskPerTradePct` (not dollar-based `riskPerTrade`)
- Cooldown in v2: `symbolCooldownMinutes` (replaces `cooldownMinutes`)
- Kill switch: `dailyLossKillSwitchPct` (percentage-based)
- Position sizing: `maxPositionPercentPct`, `maxTotalExposurePct`

**Migrated Files:**
- server/storage.ts, server/services/trade-safety.ts, server/services/goal-feasibility.ts
- server/services/heuristic-trader.ts, server/services/baseline-indicator.ts
- server/services/config-update-service.ts, server/services/execution-policy-controller.ts
- server/services/micro-execution-service.ts, server/services/state-awareness.ts
- server/services/bob-config.ts, server/routes.ts

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.