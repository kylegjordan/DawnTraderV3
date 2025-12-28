# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via a RESTful API and WebSocket. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails, supporting paper trading simulation and multi-intent command processing.

The architecture utilizes a global mode-based engine with a `ModeRegistry` and `MetricsCore`. Live pricing is managed by a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. A centralized price cache module (`server/services/price-cache.ts`) ensures a single source of truth for active trade pricing. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

Key architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery and anomaly detection, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. A Hard Reset Service provides a single authoritative path for complete paper simulation reset. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer for Kraken. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing.

The UI provides comprehensive enhancements including an Enhanced Active Trades UI with new columns and a GlobalMetricsBar, Fee and Slippage Tracking + Pagination, and Full Cost Transparency with detailed P/L breakdown. Financial Integrity Verification & Diagnostic Validation implements a verification-only diagnostic suite. Signal Flow Correction & Confidence Source Consolidation uses NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

RTB Queue Service Consolidation centralizes RTB refresh responsibility. An Event-Driven TCL Watchdog System replaces polling with an event-driven architecture. SQE Integrity Enforcement implements pair-level duplicate validation and continuous SQE re-qualification. A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks to coordinate timing-dependent subsystems. Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage, and implements provenance tracking. Diagnostic Signal Flow Tracing implements a `DiagnosticTraceService` with buffered async logging and trace probes. Integrity Rebuild and R9.3 Integrity Rebuild implement critical data integrity fixes and optimizations.

RTB Refresh Service Extraction decouples RTB refresh and rank logic into an independent service, synchronized with the Central Clock. Core System Hardening implements production-readiness measures including Module Lockdown, System Health Monitor, Graceful Shutdown, Health Endpoint, and INIT_OK Logging.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice Integration (Flask on port 5001) provides real-time predictive modeling for promotion probability and profit prediction, managed by a `BootOrchestrator`. ML predictions are integrated into Signal Orchestrator as fire-and-forget enhancements, blending with NGC.

An Adaptive Risk Advisor (L4) provides ML-powered risk optimization in the Goals tab, displaying ML-suggested risk per trade % and max exposure %. A Virtual Trade Simulator (L6) implements a passive-mode trade simulator mirroring real trade outcomes for ML calibration. A Calibration Utility (`calibration.ts`) implements linear regression to learn coefficients from virtual trade outcomes. VTS-Calibrated ARA Feedback Integration (L7) completes the feedback loop by returning both `rawProfitRate` and `calibratedProfitRate` from the ARA endpoint. A Per-Strategy Calibration System (L8) extends VTS calibration to compute separate coefficients for each trading strategy.

Strategy Confidence Weighting (L9) introduces per-strategy reliability scoring and normalized weighting to dynamically influence trade selection. Adaptive Strategy Biasing (L10) uses exposure multipliers (E_s) to allocate risk proportionally across strategies. Strategy Drift Detection & Auto-Recalibration (L11) continuously monitors calibration parameter changes and triggers automatic retraining when drift exceeds thresholds.

Market Condition Profiling & Adaptive Regime Switching (L12) classifies current market conditions and dynamically adjusts strategy weights and exposure multipliers. A `MarketProfilerService` collects price history and computes metrics to classify five regime types (Trending Bull, Trending Bear, Range-Bound, High Volatility, Calm Consolidation). An `AdaptiveRegimeEngine` maps regimes to strategy mixes and applies exposure/risk multipliers. Regime Performance Attribution & Predictive Switch Forecasting (L13) measures each regime's historical and real-time impact on trading performance and predicts regime transitions. A `RegimePerformanceTracker` continuously aggregates performance stats by regime, and a `ProactiveAllocator` adjusts regime weights and exposures based on transition predictions.

Cross-Regime Reinforcement Learning Engine (L14) uses Q-learning to continuously optimize strategy allocations across market regimes based on cumulative rewards. A `RewardEvaluator` service computes per-strategy, per-regime rewards, and an `ExperienceBuffer` stores learning samples.

Multi-Agent Cooperative Optimizer (L15) implements federated learning where each strategy operates as an independent agent with its own Q-table. Agents cooperate through gradient averaging coordinated by `MACOCoordinator`. Adaptive exploration via `ExplorationManager` and policy consensus through `PolicyConsensusEngine` ensure coordinated learning.

Decision Confidence Engine (L16) unifies all confidence metrics into a single Decision Index (DI): DI = w₁·CWQI + w₂·NGC + w₃·ML_n + w₄·RC + w₅·MC. Default weights: CWQI=0.25, NGC=0.20, ML Confidence=0.20, Regime Confidence=0.15, MACO Consensus=0.20. Adaptive weight recalibration uses Pearson correlation on performance data. DI grades: strong (≥0.7), caution (≥0.4), avoid (<0.4).

Liquidity Trap Agent (Agent 9) is a specialized strategy agent with slower learning rate (η=0.008) and higher future discount (γ=0.92). Reward function: 0.7·profit_rate + 0.2·execution_speed - 0.1·slippage, optimizing for execution quality with slippage penalty.

Adaptive Profit Realization & Stop-Loss Evolution (L17) dynamically optimizes trade exit logic. The APR-SLE Engine computes adaptive Take Profit and Stop Loss levels using a formula incorporating DI, volatility compensation, and regime multipliers. Recalibration adjusts parameters based on trade performance.

Predictive Drawdown Containment & Equity Curve Smoothing (L18) protects capital through adaptive exposure modulation. The PDC Engine computes a Drawdown Risk Score (DRS) to trigger warning and containment modes, reducing exposure and trade frequency. The "Equity Protection" UI card displays relevant metrics.

Meta-Optimization Framework (L19) creates a high-level supervisory controller that continuously adjusts parameters across all adaptive modules (ARA, VTS, MACO, DCE, PDC-ECS, APR-SLE) based on a meta-objective function to balance profit, drawdown, variance, and stability. The "Unified Policy" UI card displays global meta-score and subsystem metrics.

Global Autonomy Stabilization Protocol (L20) provides a supervisory feedback layer ensuring all adaptive subsystems operate within stable dynamic limits. The GASP Coordinator computes a Global Stability Index (GSI) and applies feedback damping, correlation monitoring, and equilibrium restoration mechanisms. The "System Stability Monitor" UI card displays GSI and control mode.

Comprehensive System Audit & Validation (M1) validates correctness, consistency, and data flow integrity of all quantitative modules via the `SystemAuditEngine`. API endpoints provide access to audit reports.

Training Loop Validation Audit (M3A) verifies that retraining operations trigger actual backend learning cycles, monitoring training execution, parameter updates, and model checksums. API endpoints provide training status and audit reports.

Live Validation & Adaptive Coupling Audit (M3B) replaces static decay factors with VTS-DCE derived adaptive relevance coefficients. The `quality_index.ts` SMOOTHING_ALPHA (0.15) is replaced with dynamic relevance computed as: `relevance = learningRate * (gsi + 0.15)`. ARA risk/exposure suggestions now derive from VTS+DCE live learning outputs: `riskPerTrade = baseRisk + learningRate*5`, `maxExposure = baseExposure + volatilityIndex*40`. The M3B validation service (`m3b-validation-service.ts`) generates reports verifying static decay removal, ARA-VTS-DCE linkage, and CWQI variance correlation. API endpoints at `/api/m3b/*` provide status, metrics, reports, and adaptive sync capabilities.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.