# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application for Kraken, automating VWAP Pullback, ABCD Long, and SMA Trend Ride strategies. It provides real-time market scanning, disciplined risk management, live and paper trading, and integrates OpenAI's GPT-5 for AI analysis, trade tracking, performance analytics, and error diagnosis. The application ensures robust execution with bracket order rollback, partial fill recovery, and a daily loss kill switch, aiming to deliver a comprehensive and resilient trading platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Authentication & Security
- **User Authentication**: Username/password authentication with bcrypt hashing and JWT tokens (12-hour expiry)
- **Password Policy**: Minimum 8 characters with uppercase, number, and special character requirements
- **Route Protection**: Protected routes require valid JWT token, public routes (login/register) accessible without auth
- **Biometric Support**: WebAuthn API integration for Face ID/fingerprint on supported mobile PWA devices
- **Session Management**: JWT tokens stored in localStorage with server-side verification
- **Logout**: Clear token and redirect to login

### Frontend Architecture
React + TypeScript with Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter for routing and WebSockets for real-time updates. Mobile-first responsive design with dynamic mode-aware UI for Live and Paper trading. Authentication-protected routes with login/register pages.

### Backend Architecture
Node.js with Express, ESM-based. Features a RESTful API and WebSocket support, with core services including `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Supports both "live" and "paper" trading modes.

### Data Storage Solutions
PostgreSQL via Neon serverless driver and Drizzle ORM. Key schemas: `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, and `aiOpportunities`. Authentication via `user-id` header.

### System Design Choices
- **Trading Strategy Implementation**: Fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride strategies with calculated entry, stop loss, and target prices.
- **Risk Management System**: Multi-layered, including risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **Strategy Parameters Configuration**: Mode-isolated (live/paper) parameter system with server-side validation, hot-reload capability via EngineSettingsBus, complete audit trail, and AI-ready architecture supporting both user and AI-driven changes.
- **Strategy Presets & Defaults**: Quick-load preset system with Conservative, Balanced, and Aggressive configurations for each strategy. Presets are validated server-side and can be instantly loaded, modified, and saved through the same validation pipeline.
- **AI Opportunities**: Hourly automated pipeline using GPT-4o mini to identify, validate, and store trading opportunities across five types.
- **Live Kraken Balance Integration**: Portfolio Value widget displaying live account balances with caching and fallback.
- **Comprehensive Reports Panel**: Canned Reports (Tax, Performance, Trade Journal), Custom Reports, and Quick Exports (CSV).
- **Earnings Widget**: Displays Average Daily Earnings (ADE) and a 7-day earnings trend.
- **Maintenance Mode**: System-wide control via environment variable, blocking Kraken API calls and displaying a frontend banner.
- **Market Data Health Check**: Automated daily monitoring of market data service reliability.
- **Daily Trading Brief**: Automated daily briefing using GPT-4o with headlines, summaries, narrative analysis, and key metrics.
- **Paper Trading System**: Simulated environment with isolated data, realistic execution, and mirroring of live trading metrics.
- **Learning Feedback Engine**: Adaptive system for continuous improvement of trading accuracy by tracking prediction outcomes, optimizing signal weights, and enhancing GPT prompts. Maintains isolation between paper and live modes.
- **Strategy Performance Visualization**: Detailed strategy-level insights on the dashboard and reports panel, combining prediction accuracy metrics from the Learning Feedback Engine with trade performance data.
- **AI Market Context Layer**: Analyzes overall market conditions, classifies market regime using GPT-4o-mini, and adjusts trading strategy signal weights based on the detected regime.
- **Dashboard Layout (Updated 2025-10-06)**: The Dashboard displays trading performance and insights in a logical order:
  1. KPI widgets (Portfolio Value, Earnings, Trading Activity, Results)
  2. Daily Brief (includes AI Market Insights)
  3. Goals Summary
  4. Portfolio & Earnings Over Time
  5. Active Trades (with empty state: "No active trades")
  6. Recent Trades (with empty state: "No recent trades")
  7. Strategy Performance (with empty state: "No strategy data available yet")
  8. Symbols That Have Cleared the Screening Process (filtered Kraken pairs passing all screening criteria)
  9. Systems Monitoring & Checks Panel
  - All data is isolated per mode (live/paper)
  - Empty state placeholders ensure consistent layout when no data exists
- **Systems Monitoring & Checks Panel**: Centralized system-level monitoring with 6 tabs:
  1. **System Health**: Real-time status of trading engine, AI scheduler, database, Kraken API, and system uptime
  2. **Audit Viewer**: Strategy parameter change history with actor tracking (user/AI), timestamps, and parameter diffs
  3. **System Logs**: Application-level logs showing engine heartbeat and operational messages
  4. **Validation Reports**: Placeholder for future data validation and model drift reports
  5. **AI Audit Log**: Detailed AI operation audit including decisions, recommendations, and actions taken
  6. **Error Logs**: Centralized error tracking with resolution status and error type categorization
- **Panel Consolidation (Milestone 8A, 2025-10-06)**: Streamlined UI organization to eliminate duplicates and improve user experience:
  - **Settings Page**: Simplified to contain only Notifications tab (removed duplicate Screener Filters, Portfolio Guardrails, and Strategies tabs)
  - **AI Analysis Panel**: Reduced to 3 core tabs - Chat Assistant, AI Opportunities, Symbol Analysis (removed Validation Reports, Audit Log, Error Logs - these now live in Systems Monitoring)
  - **Goals Engine Panel**: Reorganized to 4 tabs - Goals | Guardrails | Screeners | Strategies (removed Portfolio tab)
  - Design principle: Each configuration lives in exactly one place, preventing user confusion and maintenance overhead
- **Editable Goals Table (Milestone 8A, 2025-10-06)**: Interactive trading goals configuration with 10 key metrics:
  1. **Target Profit (%)**: Desired average monthly gain
  2. **Max Drawdown (%)**: Max allowable account loss
  3. **Daily Loss Limit (%)**: Max daily loss before trading stops
  4. **Monthly Return Goal (%)**: Monthly target return
  5. **Max Concurrent Trades**: Max open trades allowed
  6. **Win Rate Target (%)**: Desired trade win ratio
  7. **Average Risk/Reward Ratio**: Desired ratio between risk and reward
  8. **Max Portfolio Exposure (%)**: Max % of balance in trades
  9. **Stop Loss Strictness (%)**: How tight stop-losses should be
  10. **Rebalancing Frequency (Days)**: Days between goal re-evaluations
  - Mode-aware storage using existing userGoalsLive/Paper tables with upsertGoalLive/Paper methods
  - Built-in validation with min/max ranges and step increments
  - Real-time save with toast notifications and query invalidation
  - Reset to defaults functionality for quick configuration

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management, with API load management and rate limiting.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance, and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic and caching.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.
```