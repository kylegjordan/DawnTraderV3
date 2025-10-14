# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, disciplined risk management, and offers both live and paper trading capabilities. The application leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. Its primary goal is to provide a comprehensive, resilient, and continuously improving self-optimizing trading platform with a focus on business vision, market potential, and project ambitions to deliver a leading-edge solution in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## Test Credentials
**Username-based login (for all E2E tests):**
- Username: testuser123
- Password: SecurePass123!

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

### Phase 6.8: Unified Command & Conversation Layer
**Completed:** October 13, 2025

**Goal:** Enable Walter to interpret and execute natural-language commands while trading is active, eliminating mode confusion and manual configuration switching.

**Solution:** Implemented a comprehensive intent parsing and command routing system integrated directly into Walter's chat interface.

**Key Components:**

1. **Intent Parser** (`server/services/intent-parser.ts`)
   - NLP-based pattern matching for command detection
   - Supports 4 intent types: `configuration`, `status`, `analysis`, `action`
   - Extracts parameters: pairs, risk amounts, timeframes, targets, strategies
   - Safety validation with configurable thresholds
   - 85% confidence scoring for parsed commands

2. **Command Router** (`server/services/command-router.ts`)
   - Routes parsed intents to appropriate subsystems (TradingEngine, Settings, etc.)
   - Safety constraint validation (max risk, exposure limits, drawdown)
   - Confirmation flow for critical actions (1-minute timeout)
   - Execution tracking with warnings and errors
   - Handles: trading control, risk configuration, strategy management, status queries, analysis requests

3. **Command Logger** (`server/services/command-logger.ts`)
   - Persistent logging to `/logs/command_history/`
   - Date-specific files: `commands_YYYY-MM-DD.jsonl`
   - User-specific tracking: `user_{userId}_YYYY-MM-DD.jsonl`
   - Confirmation logging: `confirmations_YYYY-MM-DD.jsonl`
   - Command statistics and history retrieval

4. **Chat Integration** (`server/routes.ts`)
   - Seamless command detection in Walter chat flow
   - Parallel processing: conversation + command handling
   - Confirmation prompts with yes/no responses
   - Execution time tracking

**Supported Commands:**

**Trading Control:**
- "pause trading" / "resume trading"
- "close ETHUSD position"
- "switch to live mode" / "switch to paper mode"

**Risk Configuration:**
- "set risk to $200"
- "increase BTC risk to 2.5%"
- "set max exposure to 75%"
- "set max open trades to 5"

**Strategy Management:**
- "enable vwap_pullback strategy"
- "disable sma_trend_ride"

**Status Queries:**
- "what's my trading status"
- "what are my open positions"
- "show my performance"
- "show my settings"

**Analysis:**
- "show reasoning for last trade"
- "analyze BTCUSD"
- "analyze market conditions"

**Safety Features:**
- Automatic confirmation for critical actions (trading control, risk changes, mode switching)
- Validation against max thresholds (risk: $500, exposure: 100%, trades: 10)
- Warning system for aggressive settings
- Command history audit trail with timestamps and user IDs

**Technical Details:**
- Intent confidence threshold: 0.85 for commands, 0.5 for conversation fallback
- Confirmation timeout: 60 seconds
- Pattern matching: 40+ regex patterns across 4 intent categories
- Logging format: JSONL for efficient parsing and analysis
- Pending confirmations tracked per-user in memory (Map<userId, confirmationId>)
- Users reply with simple "yes"/"no" - confirmation ID auto-retrieved
- **Confirmation Flow (Production-Ready):**
  - Whole-word first-word matching: extracts first word, strips ALL punctuation with `/[^a-z]/g`
  - Natural language support: "yes please", "no thanks", "yeah!", "nope" all work correctly
  - False positive prevention: "yesterday", "nobody" no longer trigger confirmations
  - Pending confirmation guard: blocks new critical commands until current one resolved
  - Clear user feedback: explicit reminders when confirmation pending
  - Architect approved with PASS rating after 5 iterations

**Testing:**
✅ All test commands parsing correctly:
- "pause trading" → action: pause (confirmed)
- "increase BTC risk to 2.5%" → config: update risk (confirmed)
- "show reasoning for last trade" → analysis: explain trade
- "close ETHUSD position" → action: close position (confirmed)
- Normal conversation falls through to Walter AI

**Files Created:**
- `server/services/intent-parser.ts` - NLP intent detection
- `server/services/command-router.ts` - Command routing and execution
- `server/services/command-logger.ts` - Persistent command logging
- `server/test-commands.ts` - Command testing suite
- `logs/command_history/` - Command execution logs

**Files Modified:**
- `server/routes.ts` - Integrated command detection in Walter chat endpoint

**Benefits:**
- ✅ No more mode confusion - commands work anytime
- ✅ Natural language interface - no syntax to memorize
- ✅ Safety-first design - confirmations for critical actions
- ✅ Complete audit trail - all commands logged with context
- ✅ Seamless integration - works alongside normal Walter conversations

### Phase 6.9: Chat Sidebar Usability & Accessibility Improvements
**Completed:** October 14, 2025

**Goal:** Improve chat sidebar visibility, usability, and accessibility for better user experience.

**Solution:** Enhanced the chat history sidebar with increased width, always-visible icons, comprehensive tooltips, and full accessibility support.

**Key Improvements:**

1. **Increased Width for Better Visibility**
   - Desktop (md+): 300px (previously 256px)
   - Mobile: 280px (optimized for smaller screens)
   - Collapsed: 48px (icon-only mode unchanged)

2. **Always-Visible Action Icons**
   - Previous: Icons hidden (opacity-0) until hover
   - Current: Icons always visible with muted-foreground styling
   - Hover effect: Icons highlight to foreground color
   - No more hunting for hidden controls

3. **Comprehensive Tooltip System**
   - Chat title tooltip: Shows full text for truncated titles
   - Rename icon tooltip: "Rename chat"
   - Delete icon tooltip: "Delete chat"
   - Positioned to the right for optimal visibility
   - Works seamlessly in both light and dark themes

4. **Full Accessibility Support**
   - All icon-only buttons now have descriptive aria-labels:
     - Collapse: "Collapse sidebar"
     - Expand: "Expand sidebar"
     - Rename: "Rename chat: {title}"
     - Delete: "Delete chat: {title}"
     - Save (edit): "Save chat title"
     - Cancel (edit): "Cancel editing"
     - New chat (collapsed): "Create new chat"
   - Screen reader compatible
   - Keyboard navigation fully supported

5. **Text Truncation & Overflow Handling**
   - Long titles truncated with ellipsis (...)
   - Full text visible on hover via tooltip
   - Proper flex layout prevents icon overlap

6. **Theme Consistency**
   - Light mode: Subtle muted-foreground colors
   - Dark mode: Dark-optimized muted-foreground
   - Hover states work correctly in both themes
   - Consistent visual hierarchy

**Technical Implementation:**
- Used shadcn Tooltip component with TooltipProvider wrapper
- Responsive width: `w-[280px] md:w-[300px]`
- Icon styling: `text-muted-foreground hover:text-foreground`
- Dark mode: `dark:text-muted-foreground dark:hover:text-foreground`
- Text truncation: `truncate` class with `flex-1 min-w-0`
- Accessibility: aria-label on all icon buttons

**Files Modified:**
- `client/src/components/ai/chat-history-sidebar.tsx` - Complete sidebar enhancement

**Verification:**
- ✅ Architect review: PASS rating
- ✅ Width responsive across all breakpoints
- ✅ Icons always visible without hover
- ✅ Tooltips display correctly
- ✅ All accessibility requirements met
- ✅ Dark/light theme consistency verified

**Benefits:**
- 🎯 Better discoverability - icons always visible at a glance
- 📏 More space - 300px width provides better readability
- ♿ Accessible - full screen reader and keyboard support
- 📱 Responsive - optimized for mobile, tablet, and desktop
- 🌗 Theme aware - works perfectly in light and dark modes
