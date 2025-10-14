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

### Feature Specifications
- **Real-time Data Synchronization:** Implemented robust synchronization mechanisms between frontend and backend, including internal HTTP API endpoints for cross-process communication and auto-resync logic using system health polling and TanStack Query cache invalidation.
- **Mode-Aware Configuration:** All configuration tabs (Goals, Guardrails, Screeners, Strategies, Purpose) support independent LIVE and PAPER mode data, with visual indicators and automatic data refresh upon mode switching. Initial duplication from LIVE to PAPER mode is supported.
- **System Health Monitoring:** A comprehensive `/api/system/health` endpoint provides real-time status of backend, database, paper trading, and goals. A developer data flow trace panel is available for debugging.

## External Dependencies

-   **Kraken Exchange API**: For market data, trade execution, and account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: Powers AI analysis, conversational assistance, AI Opportunities generation, and voice transcription (Whisper API).
-   **Neon Database**: Serverless PostgreSQL database.
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.

## Recent Changes

### Phase 6.15: Dashboard Reactive Goals Refresh
**Completed:** October 14, 2025

**Goal:** Ensure the Dashboard Goals Summary dynamically refreshes and displays the correct mode's goals immediately when the trading mode changes — eliminating stale data and ensuring perfect synchronization.

**Implementation:**

**1. Unified Query Cache Keys**
- Standardized all goals-related components to use array-based query keys
- Old format: `['/api/goals/summary?mode=${mode}']` (string-based, hard to invalidate)
- New format: `['goals', 'summary', mode]` (array-based, precise cache control)
- Applied to: Dashboard Widget, Goals Engine, Performance Metrics, Goals Table

**2. Added Reactive Refresh Trigger**
- Dashboard Goals Summary now has explicit useEffect hook
- Automatically refetches data when mode changes
- Triggers within 1 second of mode toggle
- No page refresh or navigation required

**3. Fixed Cache Invalidation**
- System health hook now invalidates correct mode-specific cache
- All mutation callbacks use unified query key format
- Ensures Goals Engine updates instantly appear on Dashboard

**4. Custom Query Functions**
- All components now use custom queryFn with proper auth headers
- Consistent data fetching across all goals components
- Better error handling and authentication flow

**Key Benefits:**
- Dashboard updates instantly when mode toggles (within ~1 second)
- No stale "No goals set" messages
- Perfect synchronization between Dashboard and Goals Engine
- Shared cache prevents duplicate API calls
- Eliminated query key mismatches that caused refresh bugs

**Technical Details:**
- useEffect dependency on `[mode, refetch]` triggers automatic refresh
- React Query's queryKey change detection provides backup refresh
- Unified cache ensures all components show same data for same mode
- System health monitoring invalidates correct cache when goals change

**Verification:**
- ✅ E2E test passed: Set LIVE goal ($7000), PAPER goal ($3000)
- ✅ Dashboard refreshes within 1 second of mode toggle
- ✅ No page navigation needed for data refresh
- ✅ Goals Engine and Dashboard perfectly synchronized
- ✅ Mode indicator updates instantly

**Files Modified:**
- `client/src/components/goals/goals-summary-widget.tsx` - Added useEffect refresh trigger, unified query key
- `client/src/components/goals/performance-tracking-metrics.tsx` - Unified query key and invalidation
- `client/src/components/goals/goals-table.tsx` - Unified query key and invalidation
- `client/src/components/goals/goals-engine-tab.tsx` - Unified query key and invalidation
- `client/src/hooks/use-system-health.tsx` - Fixed cache invalidation to use mode-specific key

### Phase 6.16: Dashboard Initial Data Load Enhancement
**Completed:** October 14, 2025

**Goal:** Ensure the Dashboard automatically loads all mode-specific data immediately after login or page refresh — without waiting for manual triggers like mode toggle or user actions.

**Implementation:**

**1. Unified Array-Based Query Keys Across All Widgets**
- **Goals Summary**: `['goals', 'summary', mode]` ✓
- **Earnings Widget**: `['earnings', 'summary', mode]` and `['earnings', 'sparkline', mode]`
- **Trading Activity**: `['trading', 'activity', mode, period]` and `['trades', 'active', mode]`
- **Results Widget**: `['trading', 'results', mode, period]`
- **Averages Widget**: `['trading', 'averages', mode, period]`

**2. Added Authenticated Query Functions**
All widgets now include custom `queryFn` with proper authentication:
```typescript
queryFn: () => fetch(`/api/endpoint?mode=${mode}`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
}).then(r => r.json())
```

**3. Automatic Data Load on Mount**
- React Query automatically fetches data when components mount
- Mode dependency in queryKey triggers refetch on mode change
- No redundant useEffect hooks needed (except Goals Summary for backward compatibility)

**4. Average Return Format Verification**
- Confirmed `avgReturnPercent` displays with % format (not $) in both Results and Averages widgets
- Consistent percentage formatting across all widgets: `+X.XX%` or `-X.XX%`

**Key Benefits:**
- Dashboard populates immediately after login/refresh
- All widgets load mode-specific data without user action
- Consistent authentication across all protected endpoints
- Optimal cache management with array-based query keys
- No "empty on first load" visual lag

**E2E Test Results:**
✅ Login → Dashboard shows all widget data instantly
✅ Toggle to PAPER → All widgets refresh within 1-2 seconds
✅ Browser refresh → Mode persists, data reloads correctly
✅ Toggle back to LIVE → Widgets show LIVE data immediately
✅ PAPER mode shows proper UI (blue borders, SIMULATED badges)
✅ All widgets use authenticated Bearer token requests

**Files Modified:**
- `client/src/components/goals/earnings-widget.tsx` - Array-based query keys with auth headers
- `client/src/components/goals/averages-widget.tsx` - Array-based query keys with auth headers
- `client/src/components/goals/trading-activity-widget.tsx` - Array-based query keys with auth headers
- `client/src/components/goals/results-widget.tsx` - Array-based query keys with auth headers