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

**Note**: Startup script automatically verifies/creates a test account (testuser@example.com) - this is expected system behavior for development/testing.

## Walter - AI SysAdmin Co-Pilot Architecture

### Walter Database Tables (ERD)

**1. walter_pending_approvals**
- Stores approval requests requiring manual user decision
- Fields: id, userId, mode (live/paper), strategyName, parameterName, currentValue, proposedValue, projectedRisk, riskDetails, status (pending/approved/rejected/cancelled), chatSessionId
- Relationships: References users table, linked to walter_chats via chatSessionId

**2. walter_chats**
- Chat sessions between user and Walter
- Fields: id, userId, title, status (active/archived), isApprovalThread, approvalId, messageCount, lastMessageAt, archivedAt
- Relationships: References users and walter_pending_approvals (if approval thread)

**3. walter_chat_logs**
- Individual messages within chat sessions
- Fields: id, chatSessionId, userId, role (user/assistant), content, metadata
- Relationships: References walter_chats

**4. trading_settings**
- User settings including Walter configuration
- Fields: ..., walterMemoryDepth (default 20) - controls context window size

### Risk Evaluation System

**Configurable Risk Threshold:**
- Location: Settings → Walter Approvals → Risk Approval Threshold
- Default: 20% of portfolio
- Function: Any strategy change exceeding this threshold automatically creates an approval request, regardless of toggle settings
- Calculation: `projectedRisk = (maxConcurrentPositions × riskPerTrade)`
- Configurable per user via `approvalMatrix.policyConstraints.maxPortfolioRiskPercent`

### Approval Workflow

```
Strategy Edit Request
    ↓
Risk Calculation (maxPositions × riskPerTrade)
    ↓
Risk >= Threshold? ──No──→ Execute Immediately
    ↓ Yes
Create Pending Approval Record
    ↓
Auto-Generate Walter Chat Session
    ↓
Send Initial Message with Risk Breakdown
    ↓
User Reviews in Walter Page
    ↓
User Decision (Approve/Reject)
    ↓
Execute or Cancel Based on Decision
    ↓
Update Approval Status & Log to Audit Trail
```

### Chat Memory & Context Windowing

**Memory Depth Setting:**
- Location: Settings → General → Walter Memory Depth
- Options: 10, 20 (default), 30, 50, 100 messages
- Function: Controls how many recent messages are displayed in chat interface
- Storage: Full message history preserved in database, only recent N messages sent to frontend
- Benefits: Improved performance, reduced token usage for future AI integration

**Auto-Summarization (Planned):**
- Trigger: When chat exceeds 50 messages
- Process: OpenAI API summarizes last 50 messages
- Storage: Summary stored in chat metadata
- Purpose: Maintain context without sending entire history to AI

### Deferred Features (Future Enhancements)

**1. Auto-Summarization (Task 13)**
- Status: Infrastructure ready, commented placeholder in code
- Requirements: OpenAI API integration for message summarization
- Location: `server/routes.ts` line ~5372

**2. AI-Based Insight Tagging**
- Tag messages with categories (question, approval, configuration, analysis)
- Enable filtering and search by message type

**3. Voice Input Processing**
- Currently: Voice recording implemented, transcription via Whisper API
- Future: Direct voice command execution with confirmation prompts

## Recent Changes

### Phase 5.4: Walter Chat Expansion ✅ COMPLETE AND VERIFIED
**Completion Date:** October 11, 2025
**Architect Sign-Off:** PASS - All critical requirements met and production-ready
- **Tasks 7-9: Approval Workflow & Notifications** ✅
  - Approve/Reject buttons with execution logic
  - Status persistence (pending → approved/rejected)
  - Top-bar notification badge showing pending count
  - Dropdown menu displaying recent 20 approvals with timestamps
  - Resolved approvals remain visible with status badges
  
- **Tasks 10-11: Chat Session Management** ✅
  - "New Chat" button creates sessions with auto-generated titles
  - Archive functionality for non-approval chats
  - Active/Archived/Approvals filter tabs
  - Auto-selection of newly created chats
  
- **Task 12: Context Windowing** ✅
  - Backend limits messages to last N (based on Memory Depth setting)
  - Full message history preserved in database
  - Configurable via Settings → General (10-100 messages)
  
- **Task 14: Memory Depth Setting** ✅
  - Added to Settings → General tab
  - Options: 10, 20 (default), 30, 50, or 100 messages
  - Persists across sessions
  
- **Task 15: Full-Text Search** ✅
  - Searches across ALL chats (active + archived)
  - Searches both chat titles AND message contents
  - Up to 10,000 messages per chat for comprehensive results
  
- **Task 16: Chat Filters** ✅
  - 4 filter options: All / Active / Archived / Approvals Only
  - Approvals filter includes both active and archived approval threads
  
- **Risk Threshold Configurability** ✅
  - Risk threshold now read from Settings → Walter Approvals
  - Default: 20%, adjustable 0-100%
  - Displayed with tooltip and current value badge
  - Applied dynamically across all strategy change evaluations

### Phase 5: Diagnostics, Optimization & Monitoring (Completed)
- **Task 1: Sidebar Reordering** ✅ Complete - Exact order implemented as specified
- **Task 2: System Monitoring Panel** ✅ Complete - Real-time metrics, Walter activity, database health, alert acknowledgement, export reports
- **Task 3: Diagnostics & Auto-Analysis** ✅ Complete - Infrastructure in place:
  - Created `DiagnosticsAnalyzer` service with anomaly detection (CPU, memory, latency, error rate thresholds)
  - Implemented trend analysis (comparing recent vs. historical metrics)
  - Integrated OpenAI GPT-4o-mini for AI-powered diagnostic insights and recommendations
  - Created hourly scheduled task (`DiagnosticAnalysisTask`) registered with SchedulerRegistry
  - Added API endpoints: POST `/api/diagnostics/analyze` (on-demand), GET `/api/diagnostics/analysis-history`
  - Logs all analyses to `ai_orchestrator_logs` table with category 'diagnostics'
  - UI: Analysis history query integrated, Run Analysis mutation created
- **Phase 5.3: Settings Restructure** ✅ Complete - Consolidated settings into tabbed interface:
  - Removed Admin Panel from sidebar navigation (consolidated into Settings)
  - Created tabbed Settings page with General Settings, Walter Approvals, and Users tabs
  - Tab 1 (General Settings): Notifications, timezone preferences
  - Tab 2 (Walter Approvals): Approval matrix toggles, risk threshold policy
  - Tab 3 (Users): Admin-only user management (create, list, toggle admin status)
  - Removed obsolete routes: /settings/walter-approvals, /admin
  - Added tab persistence via localStorage ("settings_active_tab" key)
  - Integrated contextual help overlay with "?" icon tooltip
  - All functionality from previous separate pages preserved

### Phase 4.5: System Consolidation & UI Cleanup (Completed)
- **Command Center Improvements**: Added clear labeling for Walter recommendations (prefix), improved category labels with icons
- **GPT Chats Removal**: Removed duplicate "GPT Chats" page - consolidated AI chat functionality into Command Center and Analysis pages
- **AI Opportunities Reorganization**: Moved AI Opportunities from removed GPT Chats to Watch Lists page as new tab
- **Walter Approvals**: Restored visibility in Settings with "Advanced Settings" card linking to /settings/walter-approvals
- **Kill Switch Hard-Lock**: Enforced in both UI (disabled toggle) and data layer (killSwitchOverride always true)
- **Navigation Verification**: All routes tested and working correctly (/analysis removed, /settings/walter-approvals added)
- **Browser Console**: Clean runtime (no React errors, only non-critical Vite WebSocket warnings)