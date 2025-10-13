# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query. It features a mobile-first, responsive design with dynamic mode-aware UI, microphone-based voice transcription, context-based persistent chat history, and a mode-aware toggle for trading engines with safety confirmations.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support, with services like `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data storage for user data, trading settings, trades, AI reports, and learning infrastructure.

### Feature Specifications
- **Trading Strategies**: Implements 8 automated strategies (VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap) with tunable parameters and specialized filters.
- **Risk Management**: A multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, and a configurable daily loss kill switch.
- **AI Opportunities**: An hourly automated pipeline using GPT-4o mini identifies, validates, and stores trading opportunities.
- **Continuous Learning Engine (CLE)**: Monitors performance, detects patterns, and optimizes parameters through paper mode experimentation.
- **Context Optimization**: Reduces AI API costs through conversation summarization and response caching.
- **Authentication & Security**: Supports username/password with bcrypt and JWT, and WebAuthn, with an admin panel for role-based access control.
- **Mode Isolation**: Data and functionalities are isolated between Live and Paper trading modes.
- **AI Transparency Panel**: Provides insights into autonomous scheduler activity, learning adjustments, and system health.
- **Semantic Memory Layer**: A vector-based knowledge recall system using pgvector and OpenAI embeddings.
- **Intelligence Refinement Layer**: Features a Self-optimizing Cognitive Weight Adjuster (CWA) for dynamic adjustment of learning source weights.
- **Autonomous Adjustments Actuation Policy**: Governs AI's autonomous adjustment of trading parameters with variable bounds.
- **Paper Trading Simulation Engine**: Provides real-time simulated trade execution with realistic order fill logic.
- **AI Orchestrator & Command Center**: An autonomous system for monitoring and insights, powered by GPT-4o, with a continuous learning cycle.
- **Walter - AI SysAdmin Co-Pilot**: A voice and text-based co-administrator for system configuration and optimization, featuring a dual-control system, configurable approval matrix, and chat memory.
- **System Monitoring Panel**: Provides real-time metrics, Walter activity, database health, and alerts.
- **Diagnostics & Auto-Analysis**: Anomaly detection and trend analysis with AI-powered diagnostic insights via `DiagnosticsAnalyzer` and an interactive diagnostic system ("Bob Inspector Service").
- **Walter Expert Knowledge Corpus**: Comprehensive technical knowledge base covering System Architecture, DevOps, Database, and Front-End Design.
- **Conversational Intelligence**: Walter features a Reference Tracking System, Personality Framework, Adaptive Tone Engine, Response Templates, Feedback Recognition, and Adaptive Heuristics to refine interactions.
- **Chat Intelligence & Continuous Learning Infrastructure**: Includes a file-based Chat Logging System, Chat Summarization Pipeline, Chat Rename Feature, Text-to-Speech (TTS), Learning File Ingestion for various file types, and an Enhanced Memory System with smart aging.

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.