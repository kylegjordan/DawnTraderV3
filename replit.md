# Crypto Day Trading Web App

## Overview
This project is a long-only, spot-trading cryptocurrency day trading web application for Kraken. It automates advanced trading strategies, integrates real-time market scanning, and incorporates disciplined risk management. The application offers both live and paper trading capabilities and leverages OpenAI's GPT models for AI analysis, trade tracking, performance analytics, error diagnosis, and an autonomous learning engine. The primary goal is to create a comprehensive, resilient, and continuously self-optimizing trading platform with significant market potential in automated crypto trading.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a React, TypeScript, Vite frontend with a mobile-first, responsive design, and a Node.js/Express backend providing a RESTful API and WebSocket support. Data persistence is managed by PostgreSQL using Neon serverless driver and Drizzle ORM.

Core services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. Authentication uses username/password, bcrypt, JWT, and WebAuthn.

An AI Orchestrator & Command Center, powered by GPT-4o, includes an AI SysAdmin Co-Pilot named Walter. Walter's architecture features a Unified Command & Conversation Layer, Semantic Memory Layer, Intelligence Refinement Layer, Real-Time Execution Layer, and a Unified Portfolio & Strategy State. It incorporates a Hybrid Cognitive-Operational design with an Intent Gateway, `SecureCoreService`, Continuous Learning Pipeline, `StateAwarenessService`, Intent Execution Framework with a `Pre-Execution Validator`, and an Autonomy Layer, with Safety Guardrails & Operational Kill Switch. The system supports paper trading simulation with a database-first architecture and multi-intent command processing. Live trading includes voice/chat activation with manual approval workflows.

The architecture has transitioned to a global mode-based engine, with one engine per mode (live/paper) shared by all users, eliminating per-user engine state. All Bob services (`ConfigBob`, `StrategyBob`, `TradingBob`) are refactored for mode-based operation. `ModeRegistry` service provides production telemetry with WebSocket broadcasts for real-time mode status updates. `/api/system/health` returns comprehensive dual-mode telemetry.

`MetricsCore` service provides centralized metrics calculation with strict mode isolation for portfolio, risk, and execution KPIs, with mode-based APIs and real-time WebSocket broadcasts. Live pricing integration is handled by a `LivePricingAdapter` service providing external market price feeds with dual-source integration, a 15-second refresh cycle, and WebSocket broadcasts. `MetricsCore` consumes live pricing data for live mode unrealized P/L calculations.

The Goals Engine UI has been refactored to include advanced universe and signal controls (Market Universe Size, Confidence Threshold, Quote Currencies, Active Timeframes), execution rhythm controls (Symbol Cool-Down), and simplified daily target goals with Trading Pace presets. A Goal Feasibility Validation & Audit System tracks goal change attempts and validates Target per Trade against guardrail limits, providing frontend feedback and logging all attempts. All validation rules and guardrail parameters are database-driven and integrated with LATTI for optimization.

The system calculates and displays a rolling **Average Daily Earnings % (ADE%)** as a percentage of portfolio value. It implements bidirectional synchronization between Trading Pace presets and Performance Metrics, ensuring consistency across the Goals Engine. The Trading Pace Control widget displays "Target Daily Avg Earning %". Symbol Cooldown synchronization ensures `cooldownMinutes` stays unified across Guardrails, Tuning Policy, and LATTI. The PerformanceTrackingMetrics component is replaced with a simplified TargetDailyGoals component featuring an editable "Target Daily Average Earnings %" input field and a projected balances table. The backend `/api/system/trading-pace` endpoint calculates and stores "Target Daily Avg Earning %" for both modes. The LATTI Dashboard widget displays this metric as a read-only value. Guardrails save endpoint hardening includes structured logging, payload whitelisting, single-transaction save, detailed error responses, and WebSocket broadcasts for real-time cache invalidation. Client-side improvements include updated mutation handling, dual query invalidation, WebSocket subscription listeners, and detailed error messages.

The Dashboard LATTI widget now mirrors Goals Engine Target Daily Goals, displaying LATTI-calculated values only: Risk per Trade ($), Trades per Day, Target Daily Average Earnings %, Current Portfolio Value ($), and a Projected Portfolio Growth table. Projections use compound daily growth. "Risk per Trade ($)" is converted to "Portfolio Risk per Trade (%)" across the Goals Engine and Dashboard LATTI widget, displayed as a percentage of total portfolio value.

## LATTi Goals + Guardrails Modernization

### Phase 2: Guardrails V2 Schema (✅ COMPLETED)
Migrated from legacy `guardrails` table to modern `guardrails_v2` schema with the Core Four guardrail parameters:
- **Portfolio Risk per Trade %**: Percentage of portfolio value at risk per trade (mode-global)
- **Symbol Cooldown (minutes)**: Minimum time between trades on the same symbol (mode-global)
- **Max Open Positions**: Maximum concurrent open positions (mode-global)
- **Daily Loss Kill Switch %**: Portfolio loss threshold that triggers emergency shutdown (mode-global)

**Key Features:**
- Dual-mode operation (paper/live) with independent guardrail sets
- Coherency validation enforced via 8 validation rules (documented in `audit/coherency_rules.yaml`)
- RULE_001: Portfolio Risk ≤ Kill Switch / 10
- RULE_005: Manual Override exclusivity (`is_manual_override` and `tuned_by_latti` cannot both be true)
- Backend API endpoints: GET/PUT `/api/guardrails-v2?mode=paper|live`
- Real-time WebSocket broadcasts for config changes
- Integrated with Goals Engine, LATTI, and LiquiditySentry

**Documentation:**
- Schema: `audit/schema_guardrails_v2.sql`, `docs/schema_guardrails_v2_overview.md`
- Migration checklist: `audit/migration_checklist.md`
- Coherency rules: `audit/coherency_rules.yaml`

### Phase 3: Lottie-Managed vs Manual Override UI (✅ COMPLETED)
Implements toggle controls for switching between LATTi autonomous optimization and manual user control.

**Backend Implementation (Phase 3a - ✅ Completed):**
- Added `locked_by_user` JSONB column to `guardrails_v2` table for per-parameter override tracking
- Created `filters_v2` TypeScript schema with `managed_by_lottie` and `manual_override_enabled` metadata flags
- Implemented GET `/api/filters-v2?mode=paper|live` endpoint returning 16 filter parameters with control metadata
- Implemented PUT `/api/filters-v2?mode=paper|live` endpoint for metadata updates
- Enhanced PUT `/api/guardrails-v2?mode=paper|live` to support `lockedByUser` partial updates
- Added telemetry events `guardrail.override.changed` and `filters.override.changed` broadcasted when override state changes
- Coherency validation enforced for all guardrail updates (RULE_001, RULE_005)

**Frontend Implementation (Phase 3b - ✅ Completed):**
- Created `CoreFourGuardrails` component (`client/src/components/goals/core-four-guardrails.tsx`)
  - Displays Core Four parameters with Switch toggles for per-parameter Lottie/Manual control
  - Visual badges: "Auto-tuned by LATTi" (green) vs "Manual Override Active" (amber)
  - Lock/Unlock icons indicating current control mode
  - Integrated with `/api/guardrails-v2` endpoint
- Created `FiltersWithOverride` component (`client/src/components/goals/filters-with-override.tsx`)
  - Displays all 16 filter parameters grouped by category (Volume, Price, Quality, etc.)
  - Checkbox toggles for "Managed by LATTi" per filter
  - Status badges: "🟢 Auto (LATTi)" vs "🟡 Manual"
  - Integrated with `/api/filters-v2` endpoint
- Created `useOverrideState` hook (`client/src/hooks/use-override-state.tsx`)
  - WebSocket subscription for real-time sync (<1 second latency)
  - Automatic React Query cache invalidation on override state changes
  - Listens for `guardrail.override.changed` and `filters.override.changed` events
- Integrated both components into Goals Engine page
  - CoreFourGuardrails displayed at top of Guardrails tab
  - FiltersWithOverride displayed at top of Screeners tab

**Control Hierarchy:**
1. **Global Manual Override**: User disables LATTi entirely (`is_manual_override = true`)
2. **Per-Parameter Locks**: User locks specific parameters via `locked_by_user` JSONB (e.g., `{"symbolCooldownMinutes": true}`)
3. **Lottie-Managed (default)**: LATTi has full control over unlocked parameters (`tuned_by_latti = true`)

**Documentation:**
- Backend behavior: `docs/manual_override_behavior.md`
- Frontend UI behavior: `docs/ui_override_behavior.md`
- API documentation embedded in endpoints
- WebSocket event specifications documented

### Phase 4: Dashboard Integration with Goals Presets (✅ COMPLETED)
Integrates a unified dashboard widget and Goals Preset Grid implementing a 4+1 preset structure (Conservative, Baseline, Optimistic, Maximum, Custom) with coherency analytics.

**Database Schema:**
- Created `goals_presets` table with 4+1 presets per mode (Conservative, Baseline, Optimistic, Maximum, Custom)
- Created `v_guardrails_compliance` SQL view for real-time coherency analytics (RULE_001 validation)
- Manual SQL execution via `execute_sql_tool` due to drizzle-kit JSON parsing bug

**Backend Implementation:**
- Storage methods: `getGoalsPresets()`, `getActivePreset()`, `selectPreset()`, `getGuardrailsCompliance()`
- API endpoints: GET/PUT `/api/goals-presets`, GET `/api/goals-presets/active`, GET `/api/analytics/guardrails-compliance`
- Preset application applies values to `guardrails_v2` and broadcasts WebSocket events (`goals_preset_changed`, `guardrails_v2_updated`)
- Sets `tunedByLatti = true` for standard presets, `isManualOverride = true` for Custom preset

**Frontend Implementation:**
- Created `DashboardLATTiWidget` component (`client/src/components/dashboard/dashboard-latti-widget.tsx`)
  - Unified display of Core Four guardrails, coherency status, active preset, and control mode
  - Real-time data from `/api/guardrails-v2`, `/api/goals-presets/active`, `/api/analytics/guardrails-compliance`
  - Visual coherency badges: 🟢 PASS / 🟡 WARN / 🔴 FAIL
  - Link to Goals Engine for configuration
  - Error handling with user-friendly messages
- Created `PresetsGrid` component (`client/src/components/goals/presets-grid.tsx`)
  - 3-column responsive grid layout (1 col mobile, 2 cols tablet, 3 cols desktop)
  - Color-coded preset badges (Conservative: Green, Baseline: Blue, Optimistic: Amber, Maximum: Red, Custom: Purple)
  - Per-preset display of Core Four + Target Daily Goals
  - "Apply Preset" button with mutation handling and defensive checks
  - Error handling with user-friendly messages
- Updated `dashboard.tsx` to use new `DashboardLATTiWidget` component
- Updated `goals-engine.tsx` to integrate `PresetsGrid` at top of Goals tab

**Default Presets:**
- **Paper Mode**: Baseline preset active (Risk: 1.50%, Kill Switch: 7.00%, Cooldown: 15m, Max Pos: 5)
- **Live Mode**: Conservative preset active (Risk: 0.50%, Kill Switch: 5.00%, Cooldown: 30m, Max Pos: 3)

-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.