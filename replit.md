# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to deliver a leading-edge solution in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query. It features a mobile-first, responsive design with dynamic mode-aware UI, microphone-based voice transcription, context-based persistent chat history, and a mode-aware toggle for trading engines with safety confirmations. A comprehensive, categorized notification system with smart filtering and actionable alerts is integrated. The chat sidebar includes increased width, always-visible action icons with tooltips, and full accessibility support (aria-labels, keyboard navigation).

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data storage. Key features include 8 automated trading strategies, a multi-layered risk management system, AI-powered opportunity identification, and a Continuous Learning Engine (CLE) for optimization. Authentication uses username/password with bcrypt and JWT, and WebAuthn.

The system incorporates an AI Orchestrator & Command Center for monitoring and insights, powered by GPT-4o, and an AI SysAdmin Co-Pilot named Walter for system configuration and optimization with a dual-control system. Walter includes a Unified Command & Conversation Layer for natural language command interpretation, intent parsing, and routing to subsystems with safety confirmations and a persistent command logger. It includes a Semantic Memory Layer using pgvector and OpenAI embeddings, an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster, and an Autonomous Adjustments Actuation Policy. Diagnostics and auto-analysis are performed by `DiagnosticsAnalyzer` and "Bob Inspector Service." A Paper Trading Simulation Engine provides real-time execution and system-wide global session tracking ensures dashboard synchronization. Internal HTTP API endpoints facilitate cross-process communication for standalone scripts.

#### Feature Specifications
- **Real-time Data Synchronization:** Robust synchronization mechanisms between frontend and backend, including internal HTTP API endpoints for cross-process communication and auto-resync logic using system health polling and TanStack Query cache invalidation.
- **Mode-Aware Configuration:** All configuration tabs (Goals, Guardrails, Screeners, Strategies, Purpose) support independent LIVE and PAPER mode data, with visual indicators and automatic data refresh upon mode switching. Initial duplication from LIVE to PAPER mode is supported.
- **System Health Monitoring:** A comprehensive `/api/system/health` endpoint provides real-time status of backend, database, paper trading, and goals. A developer data flow trace panel is available for debugging.
- **Walter Communication Stabilization (Phase 7.0 Complete):** Walter communicates naturally with accurate, synchronized, mode-aware dashboard data, maintaining reliable intent detection and natural language error handling. It integrates a data pipeline to fetch live dashboard data, enhanced intent classification (command, inquiry, conversation), and provides natural language error handling. A health monitor re-enabled in `server/index.ts` polls system health and alerts on status changes.
- **Walter Communication Stability Reinforcement (Phase 7.1b Complete):** Extended OpenAI context-build timeout from 8s to 30s with early completion via Promise.race. Implemented mode-scoped prefetch of 6 dashboard endpoints on chat mount using Set-based tracking to handle mode switching. Added dynamic, non-blocking progress messages that advance asynchronously during API requests ("Gathering goals" → "Checking health" → "Finalizing"). All responses use natural language formatting with no raw JSON exposure. Optional provenance footer displays data timestamp, mode, and sources when VITE_WALTER_PROVENANCE=true.

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.