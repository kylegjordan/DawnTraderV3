# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, offering real-time market scanning, disciplined risk management, and both live and paper trading capabilities. The application integrates OpenAI's GPT-5 for AI analysis, trade tracking, performance analytics, and error diagnosis. Key features include robust execution with bracket order rollback, partial fill recovery, and a daily loss kill switch, aiming to provide a comprehensive and resilient trading platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Authentication & Security
User authentication uses username/password with bcrypt and JWT tokens (12-hour expiry), supporting WebAuthn for biometrics. Routes are protected by JWT, with tokens stored in localStorage.

### Frontend Architecture
Built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. The design is mobile-first, responsive, and features dynamic mode-aware UI for Live and Paper trading.

### Backend Architecture
Node.js with Express, ESM-based, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`, supporting both "live" and "paper" trading modes.

### Data Storage Solutions
PostgreSQL via Neon serverless driver and Drizzle ORM. Key schemas include `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, `aiOpportunities`, `aiTransparencyLog`, and learning infrastructure tables (`filterCalibrationLog`, `intradayAdjustments`, `aiLessons`, `portfolioAdjustments`, `predictionOutcomes`).

### System Design Choices
- **Trading Strategies**: Implements fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride with calculated entry, stop loss, and target prices.
- **Risk Management**: Multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **Strategy Parameters**: Mode-isolated (live/paper) configuration with server-side validation, hot-reload, audit trails, and AI-ready architecture. Includes quick-load presets (Conservative, Balanced, Aggressive).
- **AI Opportunities**: Hourly automated pipeline using GPT-4o mini to identify, validate, and store trading opportunities.
- **Live Kraken Balance**: Portfolio Value widget with live account balances, caching, and fallback.
- **Reporting**: Comprehensive panel with Canned Reports, Custom Reports, Quick Exports (CSV), and a dedicated Briefings panel for daily summaries and history.
- **Earnings Widget**: Displays Average Daily Earnings (ADE) and a 7-day trend.
- **Maintenance Mode**: System-wide control to block Kraken API calls and display frontend banners.
- **Market Data Health Check**: Automated daily monitoring of market data service reliability.
- **Paper Trading System**: Simulated environment with isolated data, realistic execution, and mirroring of live trading metrics.
- **Learning Feedback Engine**: Adaptive system for continuous improvement of trading accuracy by tracking prediction outcomes, optimizing signal weights, and enhancing GPT prompts.
- **Strategy Performance Visualization**: Detailed strategy-level insights on the dashboard and reports panel.
- **AI Market Context Layer**: Analyzes overall market conditions, classifies market regime using GPT-4o-mini, and adjusts trading strategy signal weights.
- **Dashboard Layout**: Displays KPI widgets, Daily Brief, Goals Summary, Portfolio & Earnings Over Time, Active Trades, Recent Trades, Strategy Performance, and Ready to Buy symbols. All data is mode-isolated.
- **Systems Monitoring & Checks Panel**: Centralized monitoring with tabs for System Health, Audit Viewer, System Logs, Validation Reports, AI Audit Log, and Error Logs, accessible via a dedicated `/systems` route.
- **Goals Engine**: Interactive configuration for 10 key trading goals with built-in validation, real-time saving, and reset functionality. Includes performance tracking metrics and enhanced guardrails and screeners.
- **Trading Panel**: Tabbed interface for Open Trades, Ready to Buy, and Filtered Pairs.
- **Filter Diagnostics Infrastructure**: Tracks screener health metrics (pairs scanned, eligible pairs, top failure reasons) via a Filter Health Widget on the Dashboard.
- **Watchlist Panel**: Tabbed interface for AI Opportunities and User Watchlists.
- **AI Transparency Panel**: Dedicated panel at `/ai-transparency` providing visibility into autonomous scheduler activity with three mode-aware tabs: Recent Automation Logs (mode-isolated scheduler execution logs), Learning Adjustments (filter calibrations with Paper→Live fallback), and System Health Alerts (system-wide error logs with color-coded severity). Features 60-second auto-refresh and proper mode isolation.
- **Navigation**: Reorganized sidebar to reflect logical workflow hierarchy, including dedicated Briefings, Reporting, and AI Transparency panels.

## Milestone 12: Autonomous Tuning Verification & Learning Accuracy Audit

### Overview
Milestone 12 validates the autonomous learning system's ability to continuously improve trading accuracy through Paper mode experimentation and controlled Live mode deployment. The verification suite ensures scheduler reliability, mode isolation integrity, Paper→Live transfer accuracy, and system resilience.

### Verification Results (All Tests Passed ✓)

#### Part A: Infrastructure Validation
- **A-1: Scheduler Cadence Verification** ✓
  - Endpoint: `/api/learning/database-cross-check`
  - Verified all autonomous tasks (AI Summary, Market Scan, Screener Recalibration, System Health Check) run at ≤4h intervals
  - Per-task gap analysis confirms scheduler reliability
  
- **A-2: Paper→Live Calibration Transfer** ✓
  - Endpoint: `/api/test/paper-live-fallback`
  - Validated fallback mechanism: Live mode uses Paper calibrations when Live data unavailable
  - Source flag `"paper-fallback"` correctly identifies fallback calibrations
  - Production HTTP endpoint verification confirms no regressions
  
- **A-3: AI Transparency Panel Mode Isolation** ✓
  - Route: `/ai-transparency`
  - Verified mode-segmented data display (Live vs Paper isolation)
  - Auto-refresh (60s) operational across all tabs
  - Transparency logs, calibrations, and system alerts display correctly

#### Part B: Performance Metrics
- **B-1: Performance Snapshot** ✓
  - Endpoint: `/api/learning/performance-snapshot`
  - Tracks Paper and Live mode accuracy, win rate, avg profit per trade
  - Mode-isolated metrics enable independent performance tracking
  
- **B-2: Autonomy Confidence Index** ✓
  - Endpoint: `/api/learning/autonomy-confidence`
  - Formula: CI = 0.5(Accuracy_paper) + 0.3(Transfer_SuccessRate) + 0.2(Health_Uptime)
  - Current Index: 20/100 (baseline measurement)
  - Components: paper_accuracy, transfer_success_rate, health_uptime

#### Part C: Comprehensive Test Suite
- **Verification Tests** ✓
  - ✅ Scheduler runtime: All tasks operational with ≤4h gaps
  - ✅ Mode isolation: Live/Paper data independently fetched and cached
  - ✅ Fallback calibration: Paper→Live transfer mechanism validated
  - ✅ System health resilience: Error rate monitoring, system uptime confirmed
  - ✅ UI auto-refresh: Transparency panel 60s refresh verified

### Learning Infrastructure Tables
- **filter_calibration_log**: Tracks screener threshold optimizations (mode-isolated)
- **intraday_adjustments**: Records real-time signal weight adjustments
- **ai_lessons**: Stores GPT prompt refinements and pattern insights
- **portfolio_adjustments**: Logs position sizing and risk parameter changes
- **prediction_outcomes**: Validates AI prediction accuracy for continuous improvement

### Autonomy Goals (Milestone 12 Targets)
- **Paper Accuracy Improvement**: ≥+5% over baseline (tracked via performance snapshot)
- **Live PnL Variance Reduction**: ≥10% reduction in variance (measured via portfolio adjustments)
- **Scheduler Reliability**: 100% uptime with ≤4h task intervals (verified via cadence check)
- **Transfer Success Rate**: ≥80% successful Paper→Live calibration transfers

### System Registration
Registration is disabled for single-user production mode. Temporarily enabled only for Milestone 12 verification testing, then re-locked (403) to ensure security.

## Milestone 13: Continuous Learning Engine (CLE) Implementation

### Overview
Milestone 13 implements a fully autonomous Continuous Learning Engine that monitors trading performance, detects patterns, and optimizes parameters through Paper mode experimentation with controlled Live mode deployment. The CLE runs as a scheduled task every hour, ensuring continuous improvement without manual intervention.

### CLE Architecture

#### Core Components
- **CLE Orchestrator** (`server/services/cle-orchestrator.ts`): Main learning pipeline coordinator
  - Pattern detection from prediction_outcomes
  - Autonomous calibration generation
  - Paper→Live transfer logic
  - Safety constraint validation
  - Rollback mechanisms
- **CLE Scheduler Task** (`server/services/cle-task.ts`): Hourly execution wrapper
  - Registered with scheduler registry
  - Runs every 1 hour
  - Invokes single learning cycle per execution
- **Autonomy Confidence Index**: Multi-factor confidence scoring
  - Formula: CI = 0.5(Paper_Accuracy) + 0.3(Transfer_Success) + 0.2(Health_Uptime)
  - Range: 0-100
  - Tracks learning system reliability

#### Learning Pipeline Flow
1. **Pattern Detection** (from prediction_outcomes)
   - Accuracy improvement ≥3%
   - PnL variance reduction ≥5%
   - Statistical significance validation
2. **Autonomous Calibration** (Paper mode only)
   - Generates filter_calibration_log entries
   - Source: "autonomous-learning"
   - Mode: "paper" only
3. **AI Lessons** (GPT prompt refinement)
   - Records pattern insights
   - Enhances future predictions
4. **Portfolio Adjustments** (position sizing)
   - Optimizes risk parameters
   - Mode-isolated adjustments
5. **Paper→Live Transfer** (when Live data stale)
   - Transfers only when Live calibrations >24h old
   - Marks transfers with source: "paper-fallback"
   - Preserves mode isolation

#### Safety Mechanisms
- **Rollback Trigger**: Confidence drop >15 points
  - Reverts last 3 calibrations
  - Logs rollback events to ai_transparency_log
- **Learning Pause**: PnL variance increase >25%
  - Temporarily halts autonomous updates
  - Logs pause events for review
- **Mode Isolation**: Live mode never generates autonomous calibrations
  - Only Paper mode creates new learnings
  - Live mode adopts via Paper→Live transfer only

### Implementation Results (All Tests Passed ✓)

#### Core Infrastructure
- ✅ **CLE Orchestrator**: Learning pipeline operational
- ✅ **Scheduler Integration**: Task runs every 1 hour as "Continuous Learning"
- ✅ **Confidence Model**: Index calculation verified (baseline: 20/100)
- ✅ **Pattern Detection**: Statistical thresholds configured (accuracy ≥3%, variance ≤5%)
- ✅ **Safety Failsafes**: Rollback and pause mechanisms implemented

#### API Endpoints
- `/api/learning/autonomy-confidence`: Returns confidence index and components
- `/api/schedulers/status`: Shows CLE task status and timing
- `/api/learning/performance-snapshot`: Mode-isolated performance metrics

#### UI Integration
- **AI Transparency Panel** (`/ai-transparency`): Displays Autonomy Confidence badge
  - Badge format: "Confidence: X/100"
  - Test ID: `badge-autonomy-confidence`
  - Auto-refresh: 60 seconds

#### E2E Verification (Milestone 13)
- ✅ Learning cycle execution via scheduler
- ✅ Confidence index API and UI display
- ✅ Paper→Live transfer contract enforcement
- ✅ Rollback logic verification
- ✅ Scheduler cadence validation (1h interval)

### Key Features
- **Autonomous Operation**: No manual intervention required
- **Mode-Safe Learning**: Paper experimentation, Live adoption
- **Confidence Tracking**: Multi-factor reliability scoring
- **Safety First**: Rollback on degradation, pause on variance
- **Full Transparency**: All learning logged to ai_transparency_log

### Learning Infrastructure Enhancement
The CLE leverages existing learning tables (filter_calibration_log, intraday_adjustments, ai_lessons, portfolio_adjustments, prediction_outcomes) and introduces autonomous orchestration with built-in safety guardrails. All learning activities are logged to ai_transparency_log for full auditability.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management, with API load management and rate limiting.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance, and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic and caching.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.