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
- **Trading Strategies**: Implements fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride.
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
- **Walter - AI SysAdmin Co-Pilot**: Voice and text-based co-administrator for system configuration and optimization with a dual-control system. Features a configurable approval matrix for various actions (e.g., Start Live Trading, Adjust Goals, Modify Guardrails), stored in the `users.approval_matrix` JSONB column.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.

## Database Status

### Active Users
- **kylegjordan** (ID: 14e0809e-3ca8-413d-878f-c55f9d837fae): Admin user (kylegjordan@gmail.com)
- **testuser123** (ID: 6c591801-3072-431d-b192-30aaf426f15e): Test user (test@example.com)

### Database Cleanup Notes
Successfully cleaned up database: All development/test users removed except for the two required accounts. Cleanup included deleting thousands of related records across all dependent tables (ai_opportunities, ai_opportunity_runs, ai_orchestrator_logs, daily_briefs, trading_settings, learning_sources, context_chats, ai_conversations, ai_reports, watchlist_pairs, trades, ai_audit_log, filter_calibration_log).