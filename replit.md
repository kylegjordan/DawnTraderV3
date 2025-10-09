# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, offering real-time market scanning, disciplined risk management, and both live and paper trading capabilities. The application integrates OpenAI's GPT-5 for AI analysis, trade tracking, performance analytics, and error diagnosis, aiming to provide a comprehensive and resilient trading platform. Key features include robust execution with bracket order rollback, partial fill recovery, and a daily loss kill switch.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. The design is mobile-first, responsive, and features dynamic mode-aware UI for Live and Paper trading.

### Backend
Node.js with Express, ESM-based, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`, supporting both "live" and "paper" trading modes.

### Data Storage
PostgreSQL via Neon serverless driver and Drizzle ORM. Key schemas include `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, `aiOpportunities`, `aiTransparencyLog`, and learning infrastructure tables (`filterCalibrationLog`, `intradayAdjustments`, `aiLessons`, `portfolioAdjustments`, `predictionOutcomes`).

### System Design
- **Trading Strategies**: Implements fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride with calculated entry, stop loss, and target prices.
- **Risk Management**: Multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **AI Opportunities**: Hourly automated pipeline using GPT-4o mini to identify, validate, and store trading opportunities.
- **Continuous Learning Engine (CLE)**: An autonomous engine that monitors trading performance, detects patterns, and optimizes parameters through Paper mode experimentation with controlled Live mode deployment, ensuring continuous improvement. It includes safety mechanisms like rollbacks and learning pauses.
- **Context Optimization**: Reduces AI API costs by conversation summarization (after >20 messages, every 5 new messages compressed into ≤200 tokens) and response caching (300s TTL for static informational queries).
- **Authentication & Security**: User authentication uses username/password with bcrypt and JWT tokens, supporting WebAuthn for biometrics. Routes are protected by JWT.
- **Mode Isolation**: Data and functionalities are isolated between Live and Paper trading modes.
- **AI Transparency Panel**: Provides visibility into autonomous scheduler activity, learning adjustments, and system health alerts.
- **Learning Infrastructure**: Leverages tables like `filter_calibration_log`, `intraday_adjustments`, `ai_lessons`, `portfolio_adjustments`, and `prediction_outcomes` for continuous improvement.
- **Dashboard & Reporting**: Comprehensive panels with KPI widgets, daily briefs, goals summaries, active/recent trades, strategy performance, and various reports (Canned, Custom, Quick Exports).
- **Maintenance Mode**: System-wide control to block Kraken API calls and display frontend banners.
- **Market Data Health Check**: Automated daily monitoring of market data service reliability.
- **Goals Engine**: Interactive configuration for key trading goals with tracking and guardrails.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation.
- **Finnhub API**: Provides stock market data.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.