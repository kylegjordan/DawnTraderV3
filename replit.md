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

### Phase 3: Lottie-Managed vs Manual Override UI (✅ BACKEND COMPLETED)
Implements toggle controls for switching between LATTi autonomous optimization and manual user control.

**Backend Implementation (Phase 3a - Completed):**
- Added `locked_by_user` JSONB column to `guardrails_v2` table for per-parameter override tracking
- Created `filters_v2` TypeScript schema with `managed_by_lottie` and `manual_override_enabled` metadata flags
- Implemented GET `/api/filters-v2?mode=paper|live` endpoint returning 16 filter parameters with control metadata
- Implemented PUT `/api/filters-v2?mode=paper|live` stub endpoint (metadata updates deferred to Phase 3b)
- Enhanced PUT `/api/guardrails-v2?mode=paper|live` to support `lockedByUser` partial updates
- Added telemetry event `guardrail.override.changed` broadcasted when override state changes
- Coherency validation enforced for all guardrail updates (RULE_001, RULE_005)

**Control Hierarchy:**
1. **Global Manual Override**: User disables LATTi entirely (`is_manual_override = true`)
2. **Per-Parameter Locks**: User locks specific parameters via `locked_by_user` JSONB (e.g., `{"symbolCooldownMinutes": true}`)
3. **Lottie-Managed (default)**: LATTi has full control over unlocked parameters (`tuned_by_latti = true`)

**Frontend Implementation (Phase 3b - Deferred):**
- UI toggle switches in `guardrails-tab.tsx` (global override + per-parameter locks)
- Filter toggle switches for 16 filter parameters
- Real-time WebSocket subscriptions for config updates
- Visual badges showing "Auto-tuned by LATTi" vs "Manual Override Active"

**Documentation:**
- Behavior guide: `docs/manual_override_behavior.md`
- API documentation embedded in endpoints
- WebSocket event specifications documented

## External Dependencies
-   **Kraken Exchange API**: Market data, trade execution, account management.
-   **OpenAI GPT-4o / GPT-4o mini API**: AI analysis, conversational assistance, AI Opportunities, voice transcription.
-   **Neon Database**: Serverless PostgreSQL database.
-   **Binance Public API**: External market price feed (primary for live pricing).
-   **CoinGecko API**: External market price feed (fallback for live pricing).
-   **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.