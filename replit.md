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

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.

## Recent Changes

### Phase 6.10: Frontend-Backend Synchronization Fixes
**Completed:** October 14, 2025

**Goal:** Fix critical synchronization issues where frontend displayed stale or incorrect data despite backend state changes.

**Problems Solved:**

1. **Paper Trading Status Sync:** Dashboard showed "Stopped" even when 48hr simulation was running
2. **Goals Display Sync:** Goals Summary Widget showed "no goals configured" even when goals existed

**Solutions:**

**1. Paper Trading Cross-Process Communication**
- Created internal HTTP API endpoints: `/api/internal/paper-sim/register-session` and `/deregister-session`
- Updated `Paper48HrSimulation` to call HTTP API instead of global variables
- Fixed deregister bug: Added empty JSON body `{}` to prevent Express parser error

**2. Goals API Response Format Fix**
- Changed `/api/goals/summary` response: `{success, data, mode}` → `{goals, hasGoals}`
- Transformed DB fields: `metricName → metric`, `goalValue → goal`, `actualValue → actual`

**3. Frontend QueryKey Fixes**
- GoalsTable: Fixed queryKey to `['/api/goals/summary?mode=${mode}']`
- Fixed response parsing and cache invalidation

**Verification:**
- ✅ E2E test passed
- ✅ Paper trading script registers via HTTP API
- ✅ Dashboard shows real-time backend state

### Phase 6.11: PerformanceTrackingMetrics Backend Integration
**Completed:** October 14, 2025

**Critical Bug:** PerformanceTrackingMetrics component `handleSave()` was a mock - showed success toast but didn't save to database.

**Impact:** Users edited goals, clicked "Save", saw success message, but goals weren't persisted. Dashboard showed "no goals configured" despite users thinking goals were saved.

**Root Cause:** Component was UI-only with no backend integration.

**Solution:**
- Added `useTradingMode`, `useQuery`, `useMutation` hooks
- Implemented `saveMutation` that POSTs to `/api/goals/update`
- Added query to fetch existing goals from `/api/goals/summary?mode=${mode}`
- Mode-aware saving: Goals save to correct table (user_goals_live or user_goals_paper)
- Save button shows loading state, proper error handling

**Verification:**
- ✅ E2E test passed: Goals save in paper mode
- ✅ Database confirmed: Goals persisted to user_goals_paper
- ✅ Dashboard displays saved goals
- ✅ Full synchronization verified

**Files Modified:**
- `server/routes.ts` - Internal endpoints, goals API fixes
- `server/services/paper-48hr-simulation.ts` - HTTP API integration
- `client/src/components/goals/goals-table.tsx` - QueryKey fixes
- `client/src/components/goals/goals-engine-tab.tsx` - Cache invalidation
- `client/src/components/goals/performance-tracking-metrics.tsx` - Backend integration