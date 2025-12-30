# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

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

**Phase 8 is now complete** with the following key infrastructure:
- Kraken WebSocket v2 API integration with dual-channel subscription (ticker + book)
- Mark Price Midpoint Valuation: `markPrice = (bid + ask) / 2` for accurate position valuation
- Stateful Mini-Book per symbol for stable mid-price computation without flash-crash artifacts
- Tiered Sentinel Architecture with volume-based subscription management (HIGH/MID/LOW tiers)
- Mini-Book Integrity Monitor (MBIM) providing continuous 5-minute audit cycles with 0.2% drift threshold detection

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

A Comprehensive System Audit & Validation (M1-M5E) suite ensures correctness and integrity, including specific audits for training loops, live validation, back-audits, controlled paper-mode validation, and extended calibration runs. A Controlled 60-Minute Validation with Paper Trading Activation (M5E) executes full controlled validation with split-phase approach, generating comprehensive reports and tracking key performance criteria.

A Tiered Sentinel Architecture (Phase 8.8.5) resolves WebSocket subscription stability issues using a `VolumeClassifier` for HIGH/MID/LOW tiers, tier-aware channel watchdogs, and a token-bucket `RestRateLimiter`. Global heartbeat monitoring and exponential backoff reconnection enhance reliability. The Active Trades UI displays Volume as "TIER (24hVol)" and Source with states like WS, WS (cached), REST, REST (blocked).

Filter Synchronization & Legacy Deprecation (Phase 8.8.7) fixes critical filter bypass by ensuring `Signal Orchestrator` and `VTS Runner` use `activeFilterPool.getActivePool()` for FX5-verified pairs, deprecating `FilteredPairsService`.

Kraken WebSocket v2 Upgrade (Directive 8.9.0-B) migrates both WebSocket adapters to Kraken v2 API (`wss://ws.kraken.com/v2`), enabling continuous real-time price updates via the v2 ticker channel and using a `kraken-v2-translator.ts` for consistent data translation.

Mark Price Midpoint Valuation Fix (Directive 8.9.1) changes "Current Price" calculation to Midpoint `((Bid + Ask) / 2)` for continuous real-time updates, especially for low-volume pairs.

REST Midpoint Alignment (Directive 8.9.2) ensures REST API fallback uses the same midpoint pricing model as WebSocket, harmonizing the mark-price model across all feeds.

Orderbook Channel Midprice Feeds (Directive 8.9.4) implements dual-channel subscription to "ticker" and "book" WebSocket channels for comprehensive price coverage, extracting best bid/ask from orderbook snapshots/updates to calculate midpoint `(bid + ask) / 2`, addressing frozen price issues for illiquid pairs.

Mini-Book Safety Upgrade (Directive 8.9.4-Patch) replaces stateless "last message" logic with a stateful in-memory mini-book that tracks top-of-book bids/asks per symbol. The `orderBooks` Map stores bid/ask levels for each symbol, properly handling delta updates (qty=0 means deletion) to ensure stable mid-price computation without "flash-crash" artifacts. Sequence validation via checksums detects out-of-order deltas and triggers resync. Both adapters implement this pattern for unified depth-stable pricing.

Verification Test Protocol (Directive 8.9.4-VTP) provides comprehensive infrastructure validation for Mini-Book, Sentinel, WebSocket, and REST systems. The `verification-test-protocol.ts` service captures feed health metrics every 30 seconds, performs WS vs REST midpoint checks every 60 seconds, and logs sentinel events. API endpoints: POST `/api/vtp/start` to begin session, POST `/api/vtp/stop` to end and generate summary, GET `/api/vtp/status` for real-time metrics. Pass criteria: ≥95% WS feed integrity, <1 sentinel reset/hour, ≤0.2% price drift, 100% UI sync. Output files saved to `/tmp/logs/verification_8.9.4P/`.

Mini-Book Integrity Monitor (Directive 8.9.5) implements continuous background audit that cross-checks WebSocket Mini-Book mid-prices against REST midpoint values every 5 minutes. If deviation exceeds 0.2%, automatically logs a divergence warning and triggers a soft resync via Sentinel. Uses canonical `toKrakenRest()` from `kraken-symbol-resolver.ts` for proper symbol translation. API endpoints: POST `/api/mbim/start`, POST `/api/mbim/stop`, GET `/api/mbim/status`, POST `/api/mbim/audit`. Logs saved to `/tmp/logs/integrity_monitor.log`. Documentation at `/docs/mini-book-integrity-monitor.md`.

**Phase 8 Status: COMPLETE** (December 30, 2025)
All directives from 8.8.1 through 8.9.5 have been implemented and validated.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.