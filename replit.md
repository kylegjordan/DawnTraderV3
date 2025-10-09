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
- **Milestone 8B (2025-10-06)**: Systems Monitoring relocation to standalone page
  - Systems Monitoring & Checks Panel moved from Dashboard to dedicated `/systems` route
  - Dashboard layout cleaned up to focus on trading metrics and insights
  - Systems page accessible via sidebar navigation with 6 monitoring tabs
- **Milestone 8C (2025-10-06)**: Full Goals Engine enhancement and comprehensive UI restoration
  - **Performance Tracking Metrics**: New sub-table in Goals Engine with 6 earnings metrics (per Trade, Average Return, per Day/Week/Month/Year) with auto-calculation when any field changes, color-coded percent achievement, and recalculate button
  - **Guardrails Enhancement**: Added default values (Max Daily Loss: $1000, Max Drawdown: 10%, Max Position: $5000, Max Open: 5, Risk: 1.5%) with Reset Defaults button and AI adjustment permission checkbox
  - **Screeners Tab**: Converted from static display to fully editable filters across 6 categories (Volume, Price, Volatility, Technical, Risk, Market) with Save and Reset functionality
  - **Strategies Tab**: Added Enable/Disable toggle switches for each strategy (VWAP Pullback, ABCD Long, SMA Trend Ride), complementing existing Edit modals, preset loading, and validation features
  - **Settings Enhancement**: Re-added Timezone dropdown with full IANA timezone list, defaulting to Asia/Dubai, with persistence across save/reset operations
  - All changes maintain mode-aware storage (live/paper isolation) and include comprehensive data-testid attributes for testing
- **Milestone 9 (2025-10-09)**: UI reorganization and screener optimization
  - **Trading Panel Enhancement**: Added tabbed interface with 3 tabs - Open Trades (active positions), Ready to Buy (trading signals), and Filtered Pairs (screened symbols)
  - **Filter Diagnostics Infrastructure**: Created filterDiagnostics table, storage methods, and GET /api/filters/diagnostics endpoint for tracking screener health metrics (pairs scanned, eligible pairs, top failure reasons)
  - **Scanner Optimization**: Updated market scanner interval from 1 hour to 10 minutes for more responsive pair discovery
  - **Filter Defaults Relaxation**: Loosened default screener values for broader coverage - minVolume (1M→500K), minPrice (0.01→0.001), maxPrice (10K→50K), minMarketCap (100M→10M), maxBidAskSpread (1.00→2.50), RSI range (30-70→20-80), volatility range (0.50-5.00→0.20-10.00), minLiquidity (500K→250K)
  - **Trade History Reliability**: Added defensive null checks for entryPrice, exitPrice, and quantity fields to prevent rendering crashes
- **Milestone 10 (2025-10-09)**: Paper Trading UI Readiness
  - **Filter Health Widget**: Created compact diagnostic card displaying:
    - Total pairs scanned (last 24h)
    - Eligible pairs count and percentage with color-coded health indicator
    - Top failure reason for filter rejections
    - Placed on Dashboard (below Watchlist) and Trading panel's Filtered Pairs tab
    - Auto-refreshes every minute via /api/filters/diagnostics endpoint
  - **Watchlist Panel Restructure**: Clean tabbed interface with only:
    - AI Opportunities tab: Displays AI-generated trading opportunities with type, probability, symbol, and notes
    - User Watchlists tab: Custom user-added trading pairs with live metrics
    - Removed legacy redundant tabs to eliminate duplication
    - Full test coverage with data-testid on all dynamic elements
  - **Paper Engine Status**: PaperExecutionService exists with correct configuration (250ms latency, 0.10% slippage, 0.16% fees) but requires full integration with TradingEngine for automated paper trade execution - deferred to dedicated session
- **Milestone 10.5 (2025-10-09)**: UI Refinement - Reporting, Briefings, and Navigation Alignment
  - **Navigation Reorganization**: Updated sidebar order to reflect logical workflow hierarchy:
    1. Dashboard \u2192 2. Goals Engine \u2192 3. Trading (moved up) \u2192 4. Briefings \u2192 5. GPT Chats \u2192 6. Watchlists \u2192 7. Search and Analysis \u2192 8. Reporting (moved up) \u2192 9. Systems Monitoring \u2192 10. Settings
    - Removed standalone "Trade History" navigation link
  - **Briefings Panel**: Created new dedicated panel at /briefings with 2 tabs:
    - **Current Daily Brief**: Displays today's trading brief with headline, summary, metrics, narrative, and trade highlights
    - **Daily Briefs History**: List view with date range selection (startDate/endDate) for custom period reports
  - **Backend Enhancement**: Extended /api/daily-briefs endpoint to support optional query parameters:
    - `?startDate=YYYY-MM-DD` and `?endDate=YYYY-MM-DD` for date range filtering
    - Updated IStorage interface and getDailyBriefs implementation with gte/lte operators
  - **Reporting Panel Updates**: 
    - Removed "Daily Briefs" tab (moved to Briefings panel)
    - Added "Trade History" as Tab 5 with full filtering capabilities (symbol, strategy, date range)
    - Maintained existing tabs: Canned Reports, Custom Reports, Exports, AI Reports
    - Trade History tab includes mode-aware display with Live/Paper badges and comprehensive trade data table
  - **Route Updates**: Removed /history standalone route, added /briefings route to App.tsx

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management, with API load management and rate limiting.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance, and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic and caching.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.
```