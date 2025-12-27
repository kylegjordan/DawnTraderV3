# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application designed for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend via a RESTful API and WebSocket. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails, supporting paper trading simulation and multi-intent command processing.

The architecture utilizes a global mode-based engine with a `ModeRegistry` and `MetricsCore`. Live pricing is managed by a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

Key architectural enhancements include a Service-Layer Non-Blocking Refactor using an In-Memory Operation Queue, a Unified Engine Health Monitor with auto-recovery and anomaly detection, and Dry-Run Mode for non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently.

A Hard Reset Service provides a single authoritative path for complete paper simulation reset. Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer for Kraken using a `BASE/QUOTE` internal format. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing. Tick Frequency Stabilization improves WebSocket tick reliability.

A centralized price cache module (`server/services/price-cache.ts`) ensures a single source of truth for active trade pricing, updated from WebSocket and REST, with three TTL-based buckets. WebSocket Subscription Reliability Fix addresses low WebSocket coverage. Database Symbol Normalization ensures all database symbols use canonical BASE/QUOTE format.

The UI provides comprehensive enhancements including an Enhanced Active Trades UI with new columns and a GlobalMetricsBar, Fee and Slippage Tracking + Pagination, and Full Cost Transparency with detailed P/L breakdown. Financial Integrity Verification & Diagnostic Validation implements a verification-only diagnostic suite.

Signal Flow Correction & Confidence Source Consolidation uses NGC (Normalized Global Confidence) as the single authoritative source of confidence. Adaptive Normalization, Enhanced Risk & Durability Framework implements Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

RTB Queue Service Consolidation centralizes RTB refresh responsibility, implementing a TCL 5-Minute Failsafe and a Unified Refresh Cycle. An Event-Driven TCL Watchdog System replaces polling with an event-driven architecture. SQE Integrity Enforcement implements pair-level duplicate validation and continuous SQE re-qualification.

A Central Clock Architecture (`CentralClockService`) provides synchronized 1-second ticks to coordinate timing-dependent subsystems like FX5 Scanner, RTB Refresh, and TCL Watchdog for deterministic 30-second aligned intervals. System Harmonization ensures comprehensive RTB, TCL, and SQE alignment.

Engine Activation Standardization blocks direct engine starts, requiring authenticated API endpoint usage, and implements provenance tracking. Diagnostic Signal Flow Tracing implements a `DiagnosticTraceService` with buffered async logging and trace probes. Integrity Rebuild and R9.3 Integrity Rebuild implement critical data integrity fixes and optimizations.

RTB Refresh Service Extraction decouples RTB refresh and rank logic into an independent service, synchronized with the Central Clock. RTB Performance Diagnostics & Optimization uses an Adaptive Concurrency Tuner (ACT) and RTB Bucket Optimization (R3) for improved efficiency.

Core System Hardening implements production-readiness measures including Module Lockdown, System Health Monitor, Graceful Shutdown, Health Endpoint, and INIT_OK Logging.

A Passive & Active Learning Data Aggregator captures signal-level, strategy-level, and market-level metrics. A Python ML Microservice Integration (Flask on port 5001) provides real-time predictive modeling for promotion probability and profit prediction, managed by a `BootOrchestrator`. ML predictions are integrated into Signal Orchestrator as fire-and-forget enhancements, blending with NGC.

An Adaptive Risk Advisor (L4) provides ML-powered risk optimization in the Goals tab, displaying ML-suggested risk per trade % and max exposure %. Backend ARA endpoints provide calculations and suggestions, with SSE streaming for retraining progress. L4.1 UI refinement displays backend-calculated metrics, uses US currency formatting, elevates ML Confidence with explanation tooltip, and includes toast notifications. L4.2 corrects profit calculation logic for gross, net, and expected profit.

A Virtual Trade Simulator (L6) implements a passive-mode trade simulator mirroring real trade outcomes for ML calibration, using realistic Kraken fees and slippage, with a 3-hour trade window. A Calibration Utility (`calibration.ts`) implements linear regression to learn α and β coefficients from virtual trade outcomes. VTS API endpoints provide status, export, and retraining via SSE streaming. ARA integrates VTS calibration coefficients for realistic expected-profit correction.

VTS-Calibrated ARA Feedback Integration (L7) completes the feedback loop by returning both `rawProfitRate` and `calibratedProfitRate` from the ARA `/api/ara/calculate` endpoint, with calibration metadata and fallback logic. The Python ML service fetches and applies VTS calibration coefficients, ensuring graceful degradation. The `/api/health` endpoint includes VTS health status with anomaly warnings.

A Per-Strategy Calibration System (L8) extends VTS calibration to compute separate α and β coefficients for each trading strategy, stored with a history for drift analysis. The ARA endpoint accepts a `strategy` parameter for specific calibration. The Python ML service fetches and applies full (global + per-strategy) calibration. Health endpoint shows per-strategy calibration stats with anomaly warnings.

Strategy Confidence Weighting (L9) introduces per-strategy reliability scoring and normalized weighting to dynamically influence trade selection. Reliability scores are based on calibration stability and normalized to create weights. The FinalRank formula is updated to incorporate Strategy Weight (0.20), along with NGC (0.30), CWQI (0.25), and MLConfidence (0.25). The Signal Orchestrator injects strategy weights into signal metadata, and the RTB table UI displays a new "S.Wgt" column.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: Primary external market price feed.
- **CoinGecko API**: Fallback external market price feed.