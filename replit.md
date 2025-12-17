# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for the Kraken exchange. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application supports both live and paper trading, leveraging OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its core purpose is to deliver a comprehensive, resilient, and continuously self-optimizing trading platform, aiming for market potential through advanced automation and AI integration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a mobile-first React, TypeScript, and Vite frontend, communicating with a Node.js/Express backend providing a RESTful API and WebSocket support. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data persistence. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. An AI Orchestrator & Command Center, powered by GPT-4o, provides an AI SysAdmin Co-Pilot, Unified Command & Conversation Layer, Semantic Memory, and a Continuous Learning Pipeline. The system employs a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, and an Autonomy Layer with Safety Guardrails, supporting paper trading simulation and multi-intent command processing.

The architecture utilizes a global mode-based engine with a `ModeRegistry` for telemetry and `MetricsCore` for centralized metrics. Live pricing is managed by a `LivePricingAdapter` with dual-source integration and a `KrakenWebSocketAdapter`. The Goals Engine UI offers advanced universe and signal controls, execution rhythm controls, and simplified daily target goals with a Goal Feasibility Validation & Audit System, and an adaptive learning system.

The system incorporates a modern `guardrails_v2` schema, supporting dual-mode operation and real-time WebSocket broadcasts, with a `GuardrailPolicy Service` as the single backend source of truth. The Screeners tab uses a unified v2 filter configuration with automated anomaly detection. The DHMA Strategy implements Dual-Horizon Microstructure Alpha with dynamic position sizing and intelligent adaptive parameter optimization. The Strategic Drive & Profit Optimization Engine tracks strategies and computes a global Strategic Drive Index (SDI).

Monitoring includes strategy usage summary, passive learning, cross-user mode synchronization, and a trade execution verifier. The system uses an authoritative trading state contract via `/api/trading/status` and `trading_state_changed` WebSocket events. WebSocket Optimization includes a singleton connection pattern and hydrate-first state management. The `MarketEvaluationService` unifies all filtering. A Service-Layer Non-Blocking Refactor eliminated blocking in paper and live trading, replaced by an In-Memory Operation Queue. A Unified Engine Health Monitor provides comprehensive health monitoring with auto-recovery, real-time telemetry, and anomaly detection.

Dry-Run Mode introduces safe, non-mutating trade pipeline validation. An Active Filter Pool with TTL-based expiry and deduplication is implemented. The FX5 Scanner maintains a persistent pool of survivors, running independently.

Execution Safety Alignment ensures `preComputedNotional` from P2 signals is used for `checkPositionSizeCap`. A Diagnostic Framework provides observational diagnostics. A Signal Creation & Sizing Pipeline Audit (`B5SizingAuditService`) provides a comprehensive audit trail for the entire signal-to-trade pipeline across all 9 strategies. A Unified Sizing Pipeline Refactor standardizes the signal-to-trade sizing pipeline, implementing exposure-budget-based sizing and centralizing sizing in the Signal Orchestrator.

A Hard Reset Service provides a single authoritative path for complete paper simulation reset. Execution Engine Integrity ensures P&L calculations use only real market data, with `LivePricingAdapter` returning `no_reliable_price` when data is unavailable. WebSocket Symbol Normalization implements bidirectional symbol mapping for Kraken WebSocket.

RTB Pipeline Diagnostics introduce diagnostic and consistency improvements including tracking RTB attempts/blocks, trade lifecycle events, and providing extensive logging and API endpoints for auditing price tick flow and RTB blocks. Live Price Distribution Fix ensures all modern endpoints use `getPriceWithFallback()` for consistent live pricing. Frontend Symbol Normalization Fix resolves UI price update staleness by normalizing symbols for consistent caching. WebSocket Broadcast Mode Fix correctly sets the trading mode for `price_updated` broadcasts.

Kraken Canonical Symbol Mapping introduces a single authoritative symbol mapping layer for Kraken using a `BASE/QUOTE` internal format, with a Symbol Map and Symbol Resolver. WebSocket Subscription & Tick Flow Diagnostics implement tracing of the complete WebSocket subscription lifecycle and 8-stage price tracing. WebSocket Tick Delivery Pipeline Fix ensures every incoming WebSocket tick reaches both the price cache and the frontend broadcast pipeline. REST Fallback Optimization ensures REST API fallback is only used when WebSocket cache is stale or unsubscribed. WebSocket Subscription Coverage Fix ensures all active-trade symbols have correct Kraken WebSocket subscriptions, with auto-correction and diagnostic endpoints. Tick Frequency Stabilization improves WebSocket tick reliability by detecting and correcting slow, irregular, or frozen tick streams with auto-resubscription.

Paper Trade Persistence Fix corrects a database table mismatch for coverage endpoints. Canonical Symbol Mapping Repair fixes unmappable symbols by expanding the `KRAKEN_SYMBOL_MAP` and implementing a smart resolver. Automatic Symbol Mapping replaces static maps with a dynamic, verified, auto-generated canonical mapping layer backed by live Kraken AssetPairs metadata.

A centralized price cache module ensures a single source of truth for active trade pricing, updated from WebSocket and REST. WebSocket Subscription Reliability Fix addresses low WebSocket coverage by subscribing all open positions on engine start, new trades, and reconnects, with a 5-second subscription health audit. Database Symbol Normalization ensures all database symbols use canonical BASE/QUOTE format.

Enhanced Active Trades UI provides comprehensive UI improvements including new columns for Source/Frequency, Volume 24h, and Confidence, a prominent GlobalMetricsBar displaying portfolio metrics, and a reset session button for paper trading. Volume Enrichment persists 24h volume data at trade creation using FX5 with Kraken REST API fallback. Trade History Table enhancements include new columns for Quantity and Confidence, and improved number formatting.

Fee and Slippage Tracking + Pagination enhances trade transparency and table usability by adding fee and slippage data to trades and open positions, and enabling filtering, sorting, and pagination of trade history records. Trade History Bug Fixes address critical display issues. Trade Table Enhancements provide comprehensive sorting and fee fixes across Active Trades and Trade History.

Full Cost Transparency implements comprehensive P/L breakdown across the platform, tracking Gross P/L, Total Cost (entry/exit fees, slippage), and Net P/L. Database columns for these metrics are added. A DualScrollTable component provides synchronized horizontal scroll bars. Table Column Restructure reorganizes both Active Trades and Trade History tables for clarity.

Financial Integrity Verification & Diagnostic Validation implements a verification-only diagnostic suite, including Balance Reconciliation, Guardrail Input Verification, P/L Sanity Check, and Analytics Scope Verification. Current Simulation Analytics Alignment & Diagnostic Cleanup fixes "Current Simulation" analytics to use all trades since the trading engine was last started.

Manual Close Cost Model Fix corrects the `/paper-sim/close-trade/:id` endpoint to properly calculate exit slippage and total cost, mirroring the engine's `closePosition` method. It uses `SLIPPAGE_PERCENT` (0.15%) and `FEE_PERCENT` (0.10%) to compute actualExitPrice, exitSlippage, exitFee, totalCost, grossPnl, and netPnl. All cost fields are persisted to the trade record. The portfolio summary endpoint now separates `cashBalance` (starting + realized P/L only) from `portfolioValue` (cash + unrealized P/L), with `currentBalance` returning the realized-only cash balance. Guardrails now use Current Balance (starting + realized P/L) for risk calculations instead of the static starting balance. The Active Trades green bar displays "Current Bal + Open Trades" showing total portfolio equity (cash + position value).

Signal Flow Correction & Confidence Source Consolidation corrects the signal processing flow in Signal Orchestrator, with NGC (Normalized Global Confidence) as the single authoritative source of confidence. SQE thresholds (MIN_NGC, MIN_CWQI) serve as authoritative quality gates.

Adaptive Normalization, Enhanced Risk & Durability Framework implements four key enhancements: Adaptive Rolling Normalization, an Enhanced Risk Metric, CWQI Durability Decay, and Strategy-Specific ProfitRate Floors.

RTB Queue Service Consolidation consolidates RTB refresh responsibility, implementing a TCL 5-Minute Failsafe and a Unified Refresh Cycle owned by `ReadyToBuyService`. RTB UI Unification consolidates the Ready-to-Buy UI with a `UnifiedReadyToBuyTable` and a unified endpoint `/api/trading-signals`.

SQE Filter Tuning & Validation Session System provides systematic SQE threshold adjustment via environment variables and a Validation Session Service for tracking test sessions and generating reports. Event-Driven TCL Watchdog System replaces polling-based TCL activation with an event-driven architecture using a `TCLWatchdog Service` and an `Extended Event Bus`.

RTB Queue Stability Fixes addresses critical issues in the RTB pipeline by adding `upsertRtbSignal` with ON CONFLICT UPDATE logic, implementing TCL Timer Persistence, and ensuring proper cleanup of timers. RTB Clear Flow & WebSocket Synchronization standardizes the WebSocket event type to `rtb:cleared` with mode-scoped broadcast for immediate UI synchronization when Reset or Stop Trading actions clear the RTB queue.

Directive 8.8.4-C.15.A-R2 (System Simplification) reverted the system to the stable core architecture from Directive 8.8.4-C.14.C. Removed C15A validation APIs, FX5 health monitor, optional paper auth middleware, and validation logging infrastructure. RTB clearing hooks are maintained via `clearReadyToBuy()` in clear-routines.ts, which calls `readyToBuyService.clearQueue(mode)` and broadcasts `rtb:cleared` WebSocket events. The FX5 Scanner runs independently on 30-second intervals for both paper and live modes. Engine state is controlled exclusively through `/api/trading/start` and `/api/trading/stop` endpoints which update `system_context.isEngineActive`.

Directive 8.8.4-A1 & A2 (RTB Promotion Cleanup & Dynamic Re-Ranking) implements RTB queue quality maintenance. A1: PROMOTION event handler in `ReadyToBuyService` listens for TRADE_LIFECYCLE.SIGNAL_EXECUTED events to remove promoted signals from the RTB queue via `removeSignalBySymbol()`, preventing duplicates. A1-Extended: `refreshAndRank()` method reconfirms RTB signals with fresh market data every 30 seconds (triggered at end of each FX5 scan cycle), applying CWQI durability decay (λ=0.03/min) to prioritize fresher signals. Signals are dynamically re-ranked by CWQI, with `rtb:updated` WebSocket broadcasts for real-time UI synchronization. The system only refreshes when the trading engine is active, respecting passive learning mode.

## External Dependencies
- **Kraken Exchange API**: Market data, trade execution, account management.
- **Kraken WebSocket API**: Real-time ticker feed for open trade price monitoring.
- **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
- **Neon Database**: Serverless PostgreSQL database.
- **Binance Public API**: External market price feed (primary for live pricing).
- **CoinGecko API**: External market price feed (fallback for live pricing).
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.