# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application that automates strategies on Kraken. It provides real-time market scanning, pair monitoring, and executes VWAP Pullback, ABCD Long, and SMA Trend Ride strategies. The application enforces disciplined risk management, supports live and paper trading, integrates OpenAI's GPT-5 for AI analysis and assistance, and offers trade tracking, performance analytics, tax-ready export, AI audit trails, and error diagnosis via a responsive dashboard. It includes robust execution bot resilience with bracket order rollback, partial fill recovery, exchange constraint enforcement, rate limiting, retry logic, and a daily loss kill switch.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses React + TypeScript with Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. It follows a mobile-first responsive design. The UI is mode-aware, dynamically switching between Live and Paper trading data sources with clear visual differentiators (color themes, badges).

### Backend Architecture
The backend is Node.js with Express, using ESM. It features a RESTful API and WebSocket support. Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. It supports both "live" and "paper" trading modes.

### Data Storage Solutions
PostgreSQL, accessed via Neon serverless driver, is used for data storage, with Drizzle ORM for type-safe schema definitions. Key schemas include `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, and `aiOpportunities`. Authentication is via a `user-id` header.

### System Design Choices
- **Trading Strategy Implementation**: Fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, calculating entry, stop loss, and target prices.
- **Risk Management System**: Multi-layered, including risk per trade, maximum exposure, maximum open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **AI Opportunities**: An hourly automated pipeline using GPT-4o mini to analyze Kraken pairs, identify, validate, and store trading opportunities across five types (long_term_hold, moonshot, momentum, breakout, mean_reversion).
- **Live Kraken Balance Integration**: Portfolio Value widget displays live account balances from Kraken API with a 45-second per-user cache, falling back to internal estimates if the API fails.
- **Comprehensive Reports Panel**: A dedicated page for Canned Reports (Tax Report, Performance Summary, Trade Journal), Custom Reports, and Quick Exports (CSV). The Tax Report includes cost basis, proceeds, holding duration, and term classification.
- **Earnings Widget with ADE and Trend Visualization**: Displays Average Daily Earnings (ADE) from the last 30 days and a 7-day earnings trend sparkline.
- **Maintenance Mode**: System-wide maintenance mode controlled by an environment variable, blocking Kraken API calls and displaying a frontend banner.
- **Market Data Health Check**: Automated daily monitoring of market data service reliability, testing BTC, ETH, SOL, and SUI against CoinGecko and Kraken APIs, logging performance and detecting issues.
- **Daily Trading Brief**: An automated daily briefing system using GPT-4o, generating comprehensive end-of-day reports with headlines, summaries, narrative analysis, key metrics, trade highlights, AI learnings, and system health.
- **Paper Trading System**: A complete simulated trading environment with isolated data, realistic trade execution simulation (slippage, latency, fees), and mirroring of all live trading metrics and daily briefings. Starting balance is $50,000.

## External Dependencies

- **Kraken Exchange API**: Used for market data, trade execution, balance queries, and order management, with comprehensive API load management, multi-tier caching, and rate limit detection.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance (multi-turn conversations, cost control, database query capabilities, audit trails, error diagnosis), and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic, multi-tier fallback, 2-minute response caching, and graceful degradation.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.