# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, offering real-time market scanning, disciplined risk management, and both live and paper trading capabilities. The application integrates OpenAI's GPT-5 for AI analysis, trade tracking, performance analytics, and error diagnosis, aiming to provide a comprehensive and resilient trading platform. Key features include robust execution with bracket order rollback, partial fill recovery, and a daily loss kill switch. The project aims to provide a comprehensive and resilient trading platform with continuous improvement through an autonomous learning engine.

**Admin Access Control**: The application now includes an admin panel for secure user management. Public registration is disabled, and only administrators can create new user accounts and manage user roles. Admin privileges are enforced at both the UI and API levels.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React, TypeScript, Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. The design is mobile-first, responsive, and features dynamic mode-aware UI for Live and Paper trading.

**Voice Input Feature**: Microphone-based voice transcription for chat interfaces using OpenAI Whisper API:
- Available in Goals Engine (/goals-engine), GPT Chats Panel (chat-panel.tsx), and Chat Container (/analysis)
- Click mic button to start/stop recording
- Audio transcribed via OpenAI Whisper (whisper-1 model)
- Transcription appears in input field for editing before sending
- Error handling for mic permissions, device not found, and transcription failures
- Visual feedback: Mic icon (idle), MicOff icon (recording), Loader icon (transcribing)
- Backend: POST /api/transcribe (JWT protected, 15MB file limit)
- Transcription success notifications disabled (silent completion)

**Chat Persistence System**: Context-based persistent chat history across conversational interfaces:
- **Database Schema**: `context_chats` table stores messages by context (e.g., "goals", "guardrails")
  - Fields: user_id, context, role (user/assistant), message, timestamp
- **API Endpoints**:
  - GET /api/chats?context={context} - Retrieves chat history for specific context
  - POST /api/chats/save - Saves chat message (body: {role, message, context})
- **Implementation**:
  - Goals Engine (goals-engine-tab.tsx): Auto-loads chat history on mount, auto-saves on send
  - Messages persist across page refreshes and sessions
  - Separate from main AI conversations (which use conversations table)
- **AI Response Format**: Goals Engine analyze endpoint returns {success, response, data, mode} with direct response field

**Trading Active Toggle**: Dashboard header includes a mode-aware toggle controller that starts/stops the appropriate trading engine:
- Paper mode: Controls Paper Trading Simulation Engine via `/api/paper-sim/start` and `/api/paper-sim/stop` endpoints
  - Starts/stops immediately without confirmation
- Live mode: Controls Live Trading Engine via `/api/trading/start` and `/api/trading/stop` endpoints
  - **Safety confirmation modal**: Activating Live Trading requires explicit user confirmation via AlertDialog
  - Modal displays warning about "real market orders" with actual funds
  - Credentials validation: Backend validates KRAKEN_API_KEY and KRAKEN_API_SECRET before starting
  - Returns 400 error with informative message if credentials missing
- Real-time status synchronization with 5-second query refresh intervals and aggressive cache invalidation
- Dynamic visual indicators (status dot, labels, colors) reflect current engine state
- Toast notifications provide immediate user feedback on successful/failed operations
- Error handling: Failed mutations trigger immediate status refetch to ensure UI reflects actual backend state

### Backend
Node.js with Express, ESM-based, providing a RESTful API and WebSocket support. Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`, supporting both "live" and "paper" trading modes.

**Admin API Endpoints**:
- `GET /api/admin/users` - List all users (admin only)
- `POST /api/admin/users` - Create new user accounts (admin only)
- `PATCH /api/admin/users/:userId` - Toggle admin status (admin only, self-demotion prevented)
- All admin routes protected by `authenticateToken` and `requireAdmin` middleware

### Data Storage
PostgreSQL via Neon serverless driver and Drizzle ORM. Key schemas support user data, trading settings, watchlist pairs, trades, AI reports, conversations, price data, AI opportunities, transparency logs, semantic memory (vector embeddings), and learning infrastructure.

### System Design
- **Trading Strategies**: Implements fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride.
- **Risk Management**: Multi-layered system covering risk per trade, max exposure, max open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **AI Opportunities**: Hourly automated pipeline using GPT-4o mini to identify, validate, and store trading opportunities.
- **Continuous Learning Engine (CLE)**: Monitors trading performance, detects patterns, and optimizes parameters through Paper mode experimentation and controlled Live mode deployment, with safety mechanisms like rollbacks.
- **Context Optimization**: Reduces AI API costs via conversation summarization and response caching.
- **Authentication & Security**: User authentication uses username/password (or email) with bcrypt and JWT tokens, supporting WebAuthn. Login endpoint supports both username and email authentication. Admin panel enforces role-based access control with secure user management.
- **Admin Access Control**: Dedicated admin panel at `/admin` for user management. Features include user creation, role assignment, and admin status toggling. Public registration disabled; only admins can create accounts. Self-demotion prevention ensures at least one admin exists.
- **Mode Isolation**: Data and functionalities are isolated between Live and Paper trading modes.
- **AI Transparency Panel**: Provides visibility into autonomous scheduler activity, learning adjustments, semantic memory insights, and system health alerts.
- **Semantic Memory Layer**: Vector-based knowledge recall system using pgvector and OpenAI embeddings, populating from AI lessons and conversation summaries for similarity search and CLE confidence boost.
- **Intelligence Refinement Layer**: Self-optimizing Cognitive Weight Adjuster (CWA) reviews prediction outcomes and dynamically adjusts learning source weights (semantic_memory, external_api, cache) for continuous optimization.
- **Autonomous Adjustments Actuation Policy**: Governs which trading parameters AI can autonomously adjust, enforcing variable bounds, cooldown periods, confidence thresholds, and daily change limits. Includes a framework for venue-aware asset differentiation, though currently limited to Kraken crypto/forex.
- **Historic Signal Backfilling**: Fetches multi-month historical OHLC data from Kraken, ingesting it into Semantic Memory with P/L-based relevance scoring for CWA learning.
  - **Recent Fix (Oct 2025)**: Fixed critical VWAP Pullback volume confirmation bug where `avgVolume = volume` made volume multiplier check mathematically impossible
  - **Improved Logic**: Now calculates avgVolume from 10-20 prior candles with proper validation (filters invalid/zero volumes, requires minimum 10 candles)
  - **Backfill Results**: Successfully generated 152 historic signals (VWAP Pullback, 26.3% win rate, -0.25% avg P/L) from BTCUSD/ETHUSD (Sep-Oct 2025)
- **Paper Trading Simulation Engine**: Provides real-time simulated trade execution with realistic order fill logic, slippage, fees, and risk control integration. Includes a Portfolio Manager for tracking positions, P/L, and performance metrics.
- **AI Orchestrator & Command Center**: Autonomous system monitoring with GPT-4o-powered insights and admin-controlled recommendations.
  - **Telemetry Collection**: 5-minute interval system metrics (CPU, memory, uptime), trading performance (P/L, win rate, ROI), AI activity (learning cycles, opportunities, adjustments)
  - **AI Analysis**: GPT-4o evaluates telemetry data for anomalies, optimizations, and recommendations with urgency levels (low/medium/high/critical)
  - **Continuous Learning Cycle**: Every 5 minutes, GPT-4o analyzes system telemetry and automatically creates recommendation logs (category='ai_insight', status='pending') for admin approval
  - **Recommendation Workflow**: All AI-generated recommendations appear in Command Center Logs tab for human-in-the-loop approval
    - Approve: Executes configuration change via /api/orchestrator/update* endpoints based on recommendation metadata
    - Reject: Updates log status without executing changes
  - **Approval Endpoints** (admin-only):
    - POST /api/orchestrator/updateGoal - Updates goal configuration when approved
    - POST /api/orchestrator/updateGuardrail - Updates guardrail settings when approved
    - POST /api/orchestrator/updateStrategy - Updates strategy parameters when approved
  - **Command Center UI** (admin-only at `/command-center`):
    - Overview Tab: Live system health, trading performance, AI activity metrics, **System Audit tool**
    - AI Analysis Tab: Anomalies, optimizations, and strategic recommendations
    - Logs/Recommendations Tab: Human-in-the-loop approval/rejection workflow with real-time execution
    - AI Chat Tab: Conversational interface for system queries
  - **System Audit Tool** (POST /api/orchestrator/audit, admin-only):
    - Comprehensive diagnostic snapshot triggered via "Run System Audit" button in Command Center
    - Collects: System metrics (CPU cores/load, memory usage, uptime), database size/health, trading engine status (live/paper), AI systems status, configuration validation (API keys), recent errors (24h)
    - Health assessment: Individual checks (CPU, memory, database, configuration, errors) → overall health rating (healthy/fair/degraded/critical)
    - Displays detailed audit report card with health checks grid, system details, database status, trading engines, configuration, and recent errors
  - **Security**: All orchestrator endpoints protected by `requireAdmin` middleware with Zod validation
  - **Data Storage**: `ai_orchestrator_logs` table tracks all recommendations with status (pending/approved/rejected/applied)
  - **Admin Log Visibility** (Oct 2025 fix): Admins can view ALL system-wide orchestrator logs regardless of which user they were created for. GET /api/orchestrator/logs passes `null` userId for admins (vs regular userId for non-admins), enabling oversight of AI-generated recommendations across the entire system. Storage layer handles nullable userIds with conditional Drizzle queries.
  - **AI Transparency Page** (Oct 2025 fix): Fixed runtime error that caused blank screen. Orchestrator tab now correctly displays logs using `recommendation` field (not `message`), includes admin-only debug panel showing fetch diagnostics (last fetch time, logs count, connection status), and uses optional chaining to prevent crashes when data fields are undefined.
- **Walter - AI SysAdmin Co-Pilot** (Oct 2025): Voice and text-based co-administrator for system configuration and optimization.
  - **Dual-Control System**: All configuration changes can be made manually via UI or through Walter voice/text commands
  - **Approval Matrix**: User-configurable settings determine which actions require approval before Walter executes them
    - Stored in `users.approval_matrix` JSONB column
    - Default approvals: Live trading activation, Goals, Guardrails, Strategy variables, Risk thresholds (all require approval)
    - No approval needed: Filters, Paper trading activation (configurable)
    - Kill switch override: Always locked to admin-only
  - **Storage Methods**: Managed via updateUser(id, { approvalMatrix }) using existing user methods
  - **Change Tracking**: All parameter changes log source (manual vs walter) for full audit trail

## Configuration & Credentials

### Admin Account
- **Email**: kylegjordan@gmail.com
- **Password**: Miami@6821 (bcrypt hashed with 10 salt rounds)
- **Access**: Full admin privileges with user management capabilities

### Paper Trading Configuration
- **Starting Balance**: $800 (updated from previous $50,000)
- **Allocation Display**: Shows 100% cash allocation when no open positions
- **Portfolio Metrics**: Includes cash/crypto allocation percentages
  - `cashPercent = (cash / totalValue) * 100`
  - `cryptoPercent = (currentExposure / totalValue) * 100`
  - When no positions: 100% cash, 0% crypto
- **Configuration Files Updated**:
  - `server/routes.ts`: initialBalance = 800
  - `server/services/paper-metrics.ts`: startingBalance = 800
  - `server/services/ai-analyst.ts`: assumedStartingBalance = 800
  - `server/__tests__/smoke.test.ts`: test values updated

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation.
- **Finnhub API**: Provides stock market data.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.