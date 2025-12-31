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

The system incorporates a Tiered Sentinel Architecture with volume-based subscription management, a Mini-Book Integrity Monitor, and dual-channel WebSocket subscriptions for stable mid-price computation and real-time updates. Mark Price Midpoint Valuation is consistently applied across WebSocket and REST fallbacks. An Adaptive Risk Advisor (ARA) utilizes ML-powered risk optimization, supported by a Virtual Trade Simulator for calibration and a Per-Strategy Calibration System.

Advanced strategy management includes Strategy Confidence Weighting, Adaptive Strategy Biasing, and Strategy Drift Detection with auto-recalibration. Market Condition Profiling and Adaptive Regime Switching dynamically adjust strategy parameters based on market conditions, with predictive forecasting. A Cross-Regime Reinforcement Learning Engine and a Multi-Agent Cooperative Optimizer continuously optimize strategy allocations and enable cooperative learning among trading strategies.

A Decision Confidence Engine unifies various confidence metrics into a single Decision Index (DI). Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE) dynamically optimizes trade exit logic. Predictive Drawdown Containment & Equity Curve Smoothing protects capital through adaptive exposure modulation. A Meta-Optimization Framework provides high-level supervisory control to balance profit, drawdown, and stability. The Global Autonomy Stabilization Protocol (GASP) ensures all adaptive subsystems operate within stable dynamic limits.

System health is maintained through a Safe Heartbeat Monitor, a Volume Classifier for market liquidity, and a Pipeline Processing Time Guard to track latency. Comprehensive system audit and validation suites are regularly performed.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.