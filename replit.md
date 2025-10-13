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
- **Walter Expert Knowledge Corpus (Phase 6.0)**: Comprehensive technical knowledge base covering four domains: System Architecture & File Topology, DevOps & Infrastructure, Database & Schema Awareness, and Front-End Design & UX. Enables Walter to provide engineer-level technical explanations with specific artifact citations (file paths, table names, service names). Bob's identity integrated as the operational system entity responsible for monitoring and diagnostics.
- **Bob Frontend Health Inspection (Phase 6.0 Addendum A)**: Extended Bob's capabilities to monitor frontend health metrics including build status, bundle size, theme integrity (HSL color validation, dark mode), component health, and UI error tracking. Prepares for future browser performance metrics (LCP, FCP, CLS, FID, TTFB).
- **UX Reasoning Templates (Phase 6.0 Addendum A)**: Walter equipped with structured response patterns for design review, aesthetic evaluation, accessibility checks, and user flow analysis. Provides actionable UX recommendations citing UI principles and implementation details.
- **Weekly Knowledge Refresh (Phase 6.0)**: Automated weekly scan by Bob detects new services, schema changes, and file additions. Updates Walter's knowledge base and logs findings to transparency table. Ensures Walter's technical understanding evolves with codebase changes.
- **Phase 5.9.1 + 6.1 Finalization (October 2025)**: Completed UI/UX enhancements including:
  - **Walter Chat Input Upgrades**: Drag & drop file upload with visual feedback (blue ring overlay), clipboard paste support for images, inline file preview with thumbnails/icons and clear button, refactored file handling (processFile/uploadFile separation).
  - **Voice Indicator Enhancement**: Inline recording indicator within textarea with pulsing animation and "Recording..." text (ChatGPT-style positioning).
  - **Reports Deep Linking**: Tab-to-URL synchronization ensuring browser navigation updates both URL parameters and active tab state.
  - **User Admin Panel**: Complete CRUD operations for user management including create user, reset password, toggle admin status, accessible only to admin users.
  - **Strategies Uniformity**: All 8 strategies (VWAP Pullback, ABCD Long, SMA Trend Ride, Breakout, Mean Reversion, Range Trading, VWAP Bounce, Liquidity Trap) use uniform StrategyCard component with full editable parameter sets, presets, and validation.
- **Phase 6.2: Conversational Intelligence & Personality (October 2025)**: Transformed Walter into an intelligent conversational AI with human-like interaction patterns:
  - **Reference Tracking System**: Walter understands contextual references like "that one", "the last trade", "the file I sent" by extracting and resolving entities from conversation history (trades, reports, files, dates).
  - **Personality Framework**: Defined core personality traits (warm, concise, confident) with contextual humor and empathy. Walter adapts tone based on situation.
  - **Adaptive Tone Engine**: Detects user emotional state from message content (frustration → empathetic; urgency → action-oriented; curiosity → educational) and adjusts response tone accordingly.
  - **Response Templates**: Structured guidance for common scenarios (error troubleshooting, diagnostic summaries, capability explanations) ensuring consistent, helpful responses.
  - **Feedback Recognition**: Detects user feedback sentiment (positive, negative, correction) and logs to transparency table. Walter acknowledges corrections immediately and adjusts responses.
  - **Adaptive Heuristics**: Learns user preferences over time from feedback history (response length: short/medium/detailed; detail level: simple/balanced/technical; communication style: formal/balanced/casual; format: bullets/paragraphs/mixed). After 3+ feedbacks, Walter adapts future responses to match learned preferences.
  - **Services**: `walter-reference-tracker.ts`, `walter-personality.ts`, `walter-response-templates.ts`, `walter-feedback.ts`, `walter-adaptive-heuristics.ts` integrated into `walter-response.ts` orchestrator.
  - **Data Persistence**: Feedback/preferences logged to `ai_transparency_log` with taskName prefixes (`walter_feedback_*`, `walter_preference_update`). Preferences inferred from 30-day feedback window.
  - **Testing**: Comprehensive playwright test suite validates all conversational intelligence features (reference resolution, tone adaptation, feedback recognition, preference acknowledgment).
- **Phase 6.3: Chat Intelligence & Continuous Learning Infrastructure (October 2025)**: Enhanced Walter's learning capabilities with file-based logging, text-to-speech, and knowledge ingestion:
  - **Chat Logging System**: File-based conversation logging via `chat-logging.ts` middleware captures all user-Walter interactions to daily log files (`/logs/chats/chat_log_YYYY-MM-DD.json`). Maintains centralized chat index (`/logs/chat_index.json`) tracking all chat sessions, creation timestamps, message counts, and rename events.
  - **Chat Summarization Pipeline**: Enhanced chat lifecycle management with dual-storage summarization - summaries saved to both database metadata and file system (`/logs/chat_summaries/summary_{chat_id}.json`). Auto-triggers on chat archive for knowledge preservation and future learning.
  - **Chat Rename Feature**: Inline chat renaming UI with hover-reveal edit button, keyboard shortcuts (Enter to save, Escape to cancel), and automatic synchronization between database and chat index file. Rename events logged as system messages for audit trail.
  - **Text-to-Speech (TTS)**: OpenAI TTS API integration via `/api/walter/tts` endpoint. Supports 6 voices (alloy, echo, fable, onyx, nova, shimmer), streaming MP3 audio output, cost tracking via response headers, and automatic chunking for long text (4096 char limit per request).
  - **Learning File Ingestion**: Knowledge upload pipeline (`walter-ingest.ts`) accepts JSON, TXT, MD, and ZIP files via `/api/walter/ingest` endpoint. Automatically processes files into semantic memories with importance scoring, metadata preservation, and ingestion logging to `/logs/ingest_log.json` (bounded to last 100 entries).
  - **Bug Fixes**: Resolved archive timestamp conversion error (ISO string to Date object coercion in backend PATCH handler). Enhanced multer error handling for file uploads with clear field name expectations.
  - **File Structure**: `/logs/chats/` for daily conversation logs, `/logs/chat_summaries/` for session summaries, `/logs/ingest_log.json` for learning file history.
  - **Testing**: End-to-end playwright validation of all features (chat rename, archive, TTS audio generation, file ingestion with memory creation).

## Operational Runbooks

### Manual Diagnostic Operations

**Trigger Bob Inspection:**
```typescript
// User-initiated diagnostic
await diagnosticController.triggerUserDiagnostic(userId, 'system_state');
await diagnosticController.triggerUserDiagnostic(userId, 'frontend_health');

// Walter-initiated diagnostic  
await diagnosticController.triggerWalterDiagnostic(userId, 'reason', 'data_consistency');
```

**Run Knowledge Refresh:**
```typescript
// Manual weekly knowledge refresh
await walterKnowledgeRefresh.runWeeklyScan(userId);
```

**Search Expert Corpus:**
```typescript
// Query Walter's knowledge base
const results = searchCorpus('React'); // Search across all domains
const formatted = formatCorpusForPrompt(['Front-End Design & UX']); // Format specific domain
```

### Scheduled Tasks
Weekly knowledge refresh can be integrated into scheduler-registry.ts following the pattern in system-health-check-task.ts.

## External Dependencies

- **Kraken Exchange API**: For market data, trade execution, and account management.
- **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, and AI Opportunities generation, and voice transcription (Whisper API).
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.