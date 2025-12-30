# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via a RESTful API and WebSocket. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails.

A global mode-based engine with a `ModeRegistry` and `MetricsCore` manages live pricing via a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

Key architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery and anomaly detection, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing.

The UI provides comprehensive enhancements including an Enhanced Active Trades UI with new columns and a GlobalMetricsBar, Fee and Slippage Tracking, and Full Cost Transparency with detailed P/L breakdown. Signal Flow Correction & Confidence Source Consolidation uses NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks to coordinate timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage, and implements provenance tracking. Diagnostic Signal Flow Tracing implements a `DiagnosticTraceService` with buffered async logging and trace probes.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice Integration (Flask) provides real-time predictive modeling for promotion probability and profit prediction, managed by a `BootOrchestrator`. ML predictions are integrated into Signal Orchestrator as fire-and-forget enhancements, blending with NGC.

An Adaptive Risk Advisor (L4) provides ML-powered risk optimization. A Virtual Trade Simulator (L6) implements a passive-mode trade simulator for ML calibration. A Calibration Utility (`calibration.ts`) implements linear regression to learn coefficients from virtual trade outcomes. VTS-Calibrated ARA Feedback Integration (L7) completes the feedback loop by returning both `rawProfitRate` and `calibratedProfitRate` from the ARA endpoint. A Per-Strategy Calibration System (L8) extends VTS calibration to compute separate coefficients for each trading strategy.

Strategy Confidence Weighting (L9) introduces per-strategy reliability scoring and normalized weighting to dynamically influence trade selection. Adaptive Strategy Biasing (L10) uses exposure multipliers (E_s) to allocate risk proportionally across strategies. Strategy Drift Detection & Auto-Recalibration (L11) continuously monitors calibration parameter changes and triggers automatic retraining when drift exceeds thresholds.

Market Condition Profiling & Adaptive Regime Switching (L12) classifies current market conditions and dynamically adjusts strategy weights and exposure multipliers. An `AdaptiveRegimeEngine` maps regimes to strategy mixes and applies exposure/risk multipliers. Regime Performance Attribution & Predictive Switch Forecasting (L13) measures each regime's historical and real-time impact on trading performance and predicts regime transitions. A `ProactiveAllocator` adjusts regime weights and exposures based on transition predictions.

Cross-Regime Reinforcement Learning Engine (L14) uses Q-learning to continuously optimize strategy allocations across market regimes based on cumulative rewards.

Multi-Agent Cooperative Optimizer (L15) implements federated learning where each strategy operates as an independent agent with its own Q-table. Agents cooperate through gradient averaging coordinated by `MACOCoordinator`. Adaptive exploration via `ExplorationManager` and policy consensus through `PolicyConsensusEngine` ensure coordinated learning.

Decision Confidence Engine (L16) unifies all confidence metrics into a single Decision Index (DI) using weighted averages of CWQI, NGC, ML Confidence, Regime Confidence, and MACO Consensus. Adaptive weight recalibration uses Pearson correlation on performance data.

Adaptive Profit Realization & Stop-Loss Evolution (L17) dynamically optimizes trade exit logic. The APR-SLE Engine computes adaptive Take Profit and Stop Loss levels using a formula incorporating DI, volatility compensation, and regime multipliers. Recalibration adjusts parameters based on trade performance.

Predictive Drawdown Containment & Equity Curve Smoothing (L18) protects capital through adaptive exposure modulation. The PDC Engine computes a Drawdown Risk Score (DRS) to trigger warning and containment modes, reducing exposure and trade frequency.

Meta-Optimization Framework (L19) creates a high-level supervisory controller that continuously adjusts parameters across all adaptive modules based on a meta-objective function to balance profit, drawdown, variance, and stability.

Global Autonomy Stabilization Protocol (L20) provides a supervisory feedback layer ensuring all adaptive subsystems operate within stable dynamic limits. The GASP Coordinator computes a Global Stability Index (GSI) and applies feedback damping, correlation monitoring, and equilibrium restoration mechanisms.

Comprehensive System Audit & Validation (M1) validates correctness, consistency, and data flow integrity of all quantitative modules via the `SystemAuditEngine`. Training Loop Validation Audit (M3A) verifies that retraining operations trigger actual backend learning cycles. Live Validation & Adaptive Coupling Audit (M3B) replaces static decay factors with VTS-DCE derived adaptive relevance coefficients, linking ARA risk/exposure suggestions to live learning outputs. VTS Passive Feed Integration & Mode Audit (M3B.2) ensures the Virtual Trading Simulator uses live Kraken data during idle periods and switches modes correctly. Comprehensive Back-Audit & System Integrity Verification (M4) performs a complete repository-wide audit of all adaptive, predictive, and trading subsystems to verify adherence to directives and check module integrity. Controlled Paper-Mode Validation & Feed Optimization Audit (M5) runs controlled paper-trading sessions to validate adaptive metrics update correctly in live flow, tracking feed latency, cache window, and key metric variances.

Extended Calibration & Validation Run (M5-R1) implements a 60-minute extended validation session with 10-second capture intervals. Key enhancements include: Persistent Calibration Storage, Validation Session Rate Limit Bypass, Calibration Report Generator, Rolling Snapshots, and dedicated API Endpoints for validation management and reporting.

Autonomous VTS Operation (M5B) implements fully autonomous virtual trading simulation with 60-second cycles when `tradingActive=false`, internal signal generation, session metrics, configuration via `config/vts.json`, and dedicated API endpoints for control and auditing.

Controlled Validation & Calibration Integrity Test (M5C) compares VTS simulated trades to paper trades, ensuring Strategy & Metric Parity, accurate Position Sizing, Trade Recording, and a Comparison Audit Service (`vts-live-comparison-audit.ts`) for validation against defined criteria.

Controlled 60-Minute Validation with Paper Trading Activation (M5E) executes full controlled validation with split-phase approach: Phase A (30 min VTS simulation) followed by Phase B (30 min paper trading with `tradingActive=true`). The `M5EValidationService` generates comprehensive reports including `Validation_Summary_<sessionId>.md` and `Metrics_Trend_Correlation_<sessionId>.csv`. Validation criteria include: feed latency < 100ms, cache window ≥ 200 ticks, CWQI/NGC drift < 10%, adaptive variance > 0.01, risk per trade ≤ 3.5%, max exposure ≤ 40%, match rate ≥ 50%, calibration error < 0.15, and correlation > 0.5.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.