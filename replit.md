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
  - All data is isolated per mode (live/paper)
  - Empty state placeholders ensure consistent layout when no data exists

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management, with API load management and rate limiting.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance, and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic and caching.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.
```