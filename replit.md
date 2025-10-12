# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, offering real-time market scanning, disciplined risk management, and both live and paper trading capabilities. The application integrates OpenAI's GPT-5 for AI analysis, trade tracking, performance analytics, and error diagnosis, aiming to provide a comprehensive and resilient trading platform. Key features include robust execution with bracket order rollback, partial fill recovery, and a daily loss kill switch. The project aims to provide a comprehensive and resilient trading platform with continuous improvement through an autonomous learning engine, including admin access control for secure user management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. The design is mobile-first, responsive, and features dynamic mode-aware UI. Key features include microphone-based voice transcription (OpenAI Whisper API), context-based persistent chat history, and a mode-aware toggle for starting/stopping trading engines with safety confirmations for live trading.

### Backend
Node.js with Express, ESM-based, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Admin API endpoints manage users, their creation, and admin status.

### Data Storage
PostgreSQL via Neon serverless driver and Drizzle ORM, supporting user data, trading settings, watchlist pairs, trades, AI reports, conversations, price data, AI opportunities, transparency logs, semantic memory (vector embeddings), and learning infrastructure.

### System Design
- **Trading Strategies**: Implements 8 automated strategies:
  - **Original 3**: VWAP Pullback, ABCD Long, SMA Trend Ride
  - **New 5**: Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap
  - Per-strategy parameterization with 37+ tunable parameters
  - Specialized filters: Range Detection, Stop-Zone/Liquidity Cluster detection
  - Conflict resolution: Best-score-wins deterministic selection (weight → confidence → name)
  - Telemetry: Signal counters, MFE/MAE tracking, per-strategy performance metrics
  - Alert system: Strategy state changes, conflict resolution, anomaly detection
- **Risk Management**: Multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **AI Opportunities**: Hourly automated pipeline using GPT-4o mini to identify, validate, and store trading opportunities.
- **Continuous Learning Engine (CLE)**: Monitors trading performance, detects patterns, and optimizes parameters through Paper mode experimentation and controlled Live mode deployment with safety mechanisms.
- **Context Optimization**: Reduces AI API costs via conversation summarization and response caching.
- **Authentication & Security**: User authentication uses username/password (or email) with bcrypt and JWT tokens, supporting WebAuthn. Admin panel enforces role-based access control.
- **Mode Isolation**: Data and functionalities are isolated between Live and Paper trading modes.
- **AI Transparency Panel**: Provides visibility into autonomous scheduler activity, learning adjustments, semantic memory insights, and system health alerts.
- **Semantic Memory Layer**: Vector-based knowledge recall system using pgvector and OpenAI embeddings, populated from AI lessons and conversation summaries.
- **Intelligence Refinement Layer**: Self-optimizing Cognitive Weight Adjuster (CWA) dynamically adjusts learning source weights for continuous optimization.
- **Autonomous Adjustments Actuation Policy**: Governs AI's autonomous adjustment of trading parameters, enforcing variable bounds, cooldowns, confidence thresholds, and daily change limits.
- **Historic Signal Backfilling**: Fetches multi-month historical OHLC data from Kraken for Semantic Memory.
- **Paper Trading Simulation Engine**: Provides real-time simulated trade execution with realistic order fill logic, slippage, fees, and risk control.
- **AI Orchestrator & Command Center**: Autonomous system monitoring with GPT-4o-powered insights and admin-controlled recommendations. Includes telemetry collection, AI analysis, a continuous learning cycle, and a human-in-the-loop recommendation workflow with admin approval. A System Audit tool provides comprehensive diagnostic snapshots.
- **Walter - AI SysAdmin Co-Pilot**: Voice and text-based co-administrator for system configuration and optimization with a dual-control system. Features a configurable approval matrix for various actions (e.g., Start Live Trading, Adjust Goals, Modify Guardrails), stored in the `users.approval_matrix` JSONB column. Walter also includes a configurable risk evaluation system and a chat memory system with auto-summarization. **Phase 5.6 Complete**: AI-powered response generation using GPT-4o with purpose-driven behavior, persistent memory integration (top 5 high-importance memories), 8-second timeout protection via Promise.race, automatic memory extraction with importance scoring (1-5), and graceful degradation. Implemented via WalterResponseService orchestrating context gathering, prompt assembly, OpenAI API calls, and response persistence.
- **System Monitoring Panel**: Provides real-time metrics, Walter activity, database health, and alert acknowledgement.
- **Diagnostics & Auto-Analysis**: Anomaly detection and trend analysis with AI-powered diagnostic insights via `DiagnosticsAnalyzer` service and scheduled tasks.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.

## Project Status

### Completed Tasks
- **Task 6**: 8-Strategy Expansion - ✅ Complete (All strategies implemented with 37+ parameters)
- **Task 7**: Validation Testing - ✅ Complete (Technical validation achieved: 3/8 synthetic signals, 0% false positives over 90 days, end-to-end pipeline functional. Approved 2025-10-12)
- **Task 8**: Guardrails & Safety Validation - ✅ **COMPLETE** (100% Validated)
  - ✅ All 7 guardrails implemented and tested: max 1 position/asset, 10% position cap, stop-loss enforcement, spot-only trading, daily loss kill switch, symbol normalization
  - ✅ Safety telemetry infrastructure complete
  - ✅ Test harness created with automated evidence capture
  - ✅ 7/7 test scenarios passing (100% pass rate)
  - ✅ Architect approved for production deployment
  - ✅ Critical fix: Added portfolioValue to tradingSettings schema for accurate kill switch calculations
  - ✅ All tests executed in Paper mode with timestamped evidence
  - **Status**: Production-ready, approved for Live deployment
- **Task 9**: Behavioral QA with Walter - ✅ **COMPLETE**
  - ✅ Created comprehensive behavioral documentation with 10 scripted dialogues
  - ✅ All guardrails explained in plain language (max 1 position, 10% cap, stop-loss, spot-only, kill switch, symbol normalization, exposure limits)
  - ✅ All 8 strategies explained with simple analogies and real-world examples
  - ✅ Risk management reassurance dialogue validates multi-layered protection
  - ✅ Proper refusal patterns for unsafe requests (disable kill switch, enable leverage)
  - ✅ Tone validated: Professional + Approachable + Protective + Educational
  - ✅ All explanations verified against actual system logic (RiskManager, StrategyEngine)
  - ✅ Zero unsafe suggestions or bypass methods
  - **Status**: Ready for integration into Walter's AI prompts
- **Task 10**: Behavioral Integration & Live Response Testing - ✅ **COMPLETE**
  - ✅ Created BehavioralTemplateService with intent detection, context injection, and response validation
  - ✅ Integrated into Walter's response pipeline (walter-response.ts)
  - ✅ 100% intent detection accuracy (24/24 test scenarios)
  - ✅ Real-time context injection (portfolio values, settings, trades)
  - ✅ Safety enforcement implemented - blocks unsafe responses with fallback message
  - ✅ Comprehensive logging system (/logs/behavioral-tests.log)
  - ✅ Architect approved - production-ready with safety enforcement
  - ✅ Test harness validates guardrails, strategies, risk reassurance, and safety refusals
  - **Status**: Production-ready, all behavioral templates active in runtime
- **Task 10.1**: Adjustable Risk Parameters in Guardrails Tab - ✅ **COMPLETE**
  - ✅ Database: Added dailyLossKillSwitch and maxPositionPercent fields with defaults (7%, 10%)
  - ✅ Backend: API endpoints automatically support new fields via dynamic schema
  - ✅ Frontend: Global Risk Limits section in GuardrailsTab with tooltips and validation
  - ✅ RiskManager: Updated to use dynamic values from settings (was hardcoded)
  - ✅ Validation: 6/6 tests passing (100% success rate)
  - ✅ Documentation: Comprehensive guide in docs/task-10-1-adjustable-guardrails.md
  - **Status**: Production-ready, users can customize kill switch (%) and position cap (%)