# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies (VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap) and incorporates real-time market scanning, disciplined risk management, and both live and paper trading capabilities. The application integrates OpenAI's GPT models for AI analysis, trade tracking, performance analytics, and error diagnosis. Its primary goal is to provide a comprehensive, resilient, and continuously improving trading platform with features like robust execution, bracket order rollback, partial fill recovery, a daily loss kill switch, and an autonomous learning engine, including admin access control for secure user management. The project aims for a continuous learning and self-optimizing system driven by AI.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. It features a mobile-first, responsive design with dynamic mode-aware UI, microphone-based voice transcription (OpenAI Whisper API), context-based persistent chat history, and a mode-aware toggle for trading engines with safety confirmations.

### Backend
The backend utilizes Node.js with Express, ESM-based, providing a RESTful API and WebSocket support. Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Admin API endpoints manage user creation and roles.

### Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, stores user data, trading settings, watchlist pairs, trades, AI reports, conversations, price data, AI opportunities, transparency logs, semantic memory (vector embeddings), and learning infrastructure.

### System Design
- **Trading Strategies**: Implements 8 automated strategies (VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap) with over 37 tunable parameters, specialized filters (Range Detection, Stop-Zone/Liquidity Cluster), and a best-score-wins conflict resolution system. Includes telemetry for signal counters, MFE/MAE tracking, and per-strategy performance metrics.
- **Risk Management**: A multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a configurable daily loss kill switch.
- **AI Opportunities**: An hourly automated pipeline using GPT-4o mini identifies, validates, and stores trading opportunities.
- **Continuous Learning Engine (CLE)**: Monitors trading performance, detects patterns, and optimizes parameters through paper mode experimentation and controlled live deployment.
- **Context Optimization**: Reduces AI API costs through conversation summarization and response caching.
- **Authentication & Security**: Supports username/password (or email) with bcrypt and JWT tokens, and WebAuthn. An admin panel enforces role-based access control.
- **Mode Isolation**: Data and functionalities are isolated between Live and Paper trading modes.
- **AI Transparency Panel**: Provides insights into autonomous scheduler activity, learning adjustments, semantic memory, and system health alerts.
- **Semantic Memory Layer**: A vector-based knowledge recall system using pgvector and OpenAI embeddings, populated from AI lessons and conversation summaries.
- **Intelligence Refinement Layer**: Features a Self-optimizing Cognitive Weight Adjuster (CWA) for dynamic adjustment of learning source weights.
- **Autonomous Adjustments Actuation Policy**: Governs AI's autonomous adjustment of trading parameters with variable bounds, cooldowns, confidence thresholds, and daily change limits.
- **Historic Signal Backfilling**: Fetches multi-month historical OHLC data from Kraken for Semantic Memory.
- **Paper Trading Simulation Engine**: Provides real-time simulated trade execution with realistic order fill logic, slippage, fees, and risk control.
- **AI Orchestrator & Command Center**: An autonomous system for monitoring and insights, powered by GPT-4o, with a continuous learning cycle and a human-in-the-loop recommendation workflow. Includes a System Audit tool for diagnostics.
- **Walter - AI SysAdmin Co-Pilot**: A voice and text-based co-administrator for system configuration and optimization, featuring a dual-control system, configurable approval matrix for actions, a configurable risk evaluation system, and chat memory with auto-summarization. AI-powered response generation uses GPT-4o with purpose-driven behavior and persistent memory integration.
- **System Monitoring Panel**: Provides real-time metrics, Walter activity, database health, and alert acknowledgement.
- **Diagnostics & Auto-Analysis**: Anomaly detection and trend analysis with AI-powered diagnostic insights via `DiagnosticsAnalyzer` service and scheduled tasks. Includes an interactive diagnostic system ("Bob Inspector Service") for autonomous code reading, log search, data consistency checks, and AI-powered patch proposals requiring human approval.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation, and voice transcription (Whisper API).
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.