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
PostgreSQL via Neon serverless driver and Drizzle ORM. Key schemas include `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, and `aiOpportunities`.

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
- **Navigation**: Reorganized sidebar to reflect logical workflow hierarchy, including dedicated Briefings and Reporting panels.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management, with API load management and rate limiting.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance, and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic and caching.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.