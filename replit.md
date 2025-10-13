# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to deliver a leading-edge solution in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX
The frontend is built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS), and TanStack Query. It features a mobile-first, responsive design with dynamic mode-aware UI, microphone-based voice transcription, context-based persistent chat history, and a mode-aware toggle for trading engines with safety confirmations. A comprehensive, categorized notification system with smart filtering and actionable alerts is integrated.

### Technical Implementation
The backend uses Node.js with Express, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles data storage. Key features include 8 automated trading strategies, a multi-layered risk management system, AI-powered opportunity identification, and a Continuous Learning Engine (CLE) for optimization. Authentication uses username/password with bcrypt and JWT, and WebAuthn.

The system incorporates an AI Orchestrator & Command Center for monitoring and insights, powered by GPT-4o, and an AI SysAdmin Co-Pilot named Walter for system configuration and optimization with a dual-control system. It includes a Semantic Memory Layer using pgvector and OpenAI embeddings, an Intelligence Refinement Layer with a Self-optimizing Cognitive Weight Adjuster, and an Autonomous Adjustments Actuation Policy. Diagnostics and auto-analysis are performed by `DiagnosticsAnalyzer` and "Bob Inspector Service." A Paper Trading Simulation Engine provides real-time execution. Real-time session synchronization ensures the dashboard reflects paper trading status.

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.
## Recent Updates

### Phase 6.7: System-Wide Paper Trading Status Synchronization
**Completed:** October 13, 2025

**Problem Solved:** Paper trading simulation status was user-specific, causing different users to see different statuses (e.g., user A sees "Active" while user B sees "Stopped").

**Solution:** Refactored from user-specific to system-wide global session tracking.

**Key Changes:**
- **Architecture**: Changed from `Map<userId, session>` to single `globalSimulationSession`
- **Manager**: Changed from `Map<userId, manager>` to single `globalPaperPortfolioManager`
- **API Response**: Now includes `startedBy` field showing which user started the simulation
- **Visibility**: ALL users see identical status regardless of who is logged in

**Technical Details:**
- Only ONE simulation can run at any time (system-wide constraint)
- Session includes: sessionId, startTime, type ('48hr'|'manual'), startedBy
- /api/paper-sim/status returns global status (same for all users)
- Frontend polls every 5 seconds for real-time updates
- Comprehensive error handling with global state rollback

**Verification:**
✅ E2E test passed - Multi-user cross-context synchronization confirmed
✅ User A starts → User B sees Active
✅ Stop from any context → all users see Stopped
✅ Architect approved global state management

**Files Modified:**
- server/routes.ts - Global session/manager registry
- server/services/paper-48hr-simulation.ts - Global session registration
- client/src/hooks/use-trading.tsx - Updated TypeScript types
