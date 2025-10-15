# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to deliver a leading-edge solution in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query. It features a mobile-first, responsive design with dynamic mode-aware UI, microphone-based voice transcription, context-based persistent chat history, and a mode-aware toggle for trading engines with safety confirmations. A comprehensive, categorized notification system with smart filtering and actionable alerts is integrated. The chat sidebar includes increased width, always-visible action icons with tooltips, and full accessibility support.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data storage. Key features include 8 automated trading strategies, a multi-layered risk management system, AI-powered opportunity identification, and a Continuous Learning Engine (CLE) for optimization. Authentication uses username/password with bcrypt and JWT, and WebAuthn.

The system incorporates an AI Orchestrator & Command Center for monitoring and insights, powered by GPT-4o, and an AI SysAdmin Co-Pilot named Walter for system configuration and optimization with a dual-control system. Walter includes a Unified Command & Conversation Layer for natural language command interpretation, intent parsing, and routing to subsystems with safety confirmations and a persistent command logger. It features a Semantic Memory Layer using pgvector and OpenAI embeddings, an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster, and an Autonomous Adjustments Actuation Policy. Diagnostics and auto-analysis are performed by `DiagnosticsAnalyzer` and "Bob Inspector Service." A Paper Trading Simulation Engine provides real-time execution and system-wide global session tracking ensures dashboard synchronization.

The system implements a multi-module intelligent caching system (Bob Core) for performance optimization, including modules for metrics, dashboard data, configuration, strategy intelligence, trade data, system insights, and UI state (MetricsBob, DataBob, ConfigBob, StrategyBob, TradeBob, InsightBob, UIBob). These modules feature user-scoped, mode-aware caching with configurable TTLs, prefetching, and graceful fallbacks. A Hybrid Cortex Intelligent Memory Layer acts as a memory bridge between Bob Core and Walter, managing short-term context storage and snapshot management with automated synchronization. This includes derived performance analytics from the StrategyAnalytics and PortfolioAggregator services, which compute and cache comprehensive metrics for strategies and the overall portfolio.

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.