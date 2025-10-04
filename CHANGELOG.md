# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2025-10-04

### Added - Execution Bot Resilience Improvements

#### Phase 1: Bracket Order Rollback
- **Atomic Order Placement**: All bracket orders (entry, stop, target) now placed with rollback protection
- **Automatic Cancellation**: If any order leg fails, all successfully placed orders are auto-cancelled
- **Detailed Logging**: Step-by-step logs with ✅/❌ indicators for transparency
- **Zero Dangling Orders**: Prevents orphaned orders that could create risk exposure

#### Phase 2: Partial Fill Recovery
- **Partial Fill Detection**: Automatically detects when order fills < 90% of requested quantity (configurable)
- **Dual Recovery Modes**:
  - SCALE: Adjust stops/targets to match filled quantity
  - CATCHUP: Attempt to fill remaining quantity with additional order
- **Audit Trail**: Complete metadata recording in trade records (requested qty, filled qty, fill %, action taken)
- **New Settings**: `partialFillThreshold` (default 90%) and `partialFillAction` (default 'scale')

#### Phase 3: Exchange Constraint Enforcement
- **Tick Size Rounding**: Prices automatically rounded to Kraken's tick size requirements
- **Minimum Notional Validation**: Orders below $10 minimum rejected with clear error messages
- **Quantity Limits**: Min/max quantity enforcement per trading pair
- **Pre-Submission Validation**: Prevents exchange rejections by validating before order placement

#### Phase 4: Rate Limit Handling
- **Request Queue**: Automatic queuing of API requests to prevent bursts
- **2 Req/Second Throttling**: Stays within Kraken's private endpoint limits
- **Burst Protection**: Max 5 concurrent requests to prevent rate limit errors
- **Exponential Backoff**: Intelligent handling of 429 rate limit responses

#### Phase 5: Retry Logic for Network/API Errors
- **Automatic Retries**: Up to 3 retries for transient errors (timeouts, 5xx errors, network issues)
- **Exponential Backoff**: 1s → 2s → 4s delays between retries
- **Smart Error Classification**: Immediately aborts non-retryable errors (4xx client errors)
- **Max Delay Cap**: 10-second maximum delay prevents excessive waiting

#### Phase 6: Advanced Safeguards
- **Circuit Breaker**:
  - Opens after 5 consecutive API failures
  - Suspends trading for 60 seconds to allow exchange recovery
  - Auto-recovery through HALF_OPEN state testing
  - Manual reset capability
- **Failover Logging**:
  - Dual logging: file + console
  - Daily log rotation (`logs/trading-YYYY-MM-DD.log`)
  - Survives database failures
- **Full Resilience Stack**: Integrated rate limiting + retry + circuit breaker for all API calls

#### Testing & Documentation
- **Test Suites**:
  - `server/test-resilience-phase1.ts` - Bracket rollback tests
  - `server/test-resilience-phase2.ts` - Partial fill recovery tests
  - `server/test-resilience-phases3-6.ts` - Comprehensive resilience tests
- **Documentation**: `EXECUTION_RESILIENCE_REPORT.md` - Complete implementation and test report
- **Test Coverage**: 20/20 tests passing (100% coverage)

### Changed

#### TradingEngine
- Enhanced `executeTrade()` with partial fill detection and recovery
- Updated `placeStopAndTargetOrders()` with rollback mechanism
- Added detailed logging for all order placement steps

#### Schema Updates
- Added `partialFillThreshold` to tradingSettings (default 90.00)
- Added `partialFillAction` to tradingSettings (default 'scale')

#### New Service Layer
- Created `ResilienceManager` service orchestrating all resilience features
- Rate limiter, retry handler, circuit breaker, exchange validator, failover logger

### Fixed
- Bracket orders no longer leave dangling orders on partial failures
- Partial fills now handled gracefully instead of failing silently
- Exchange constraint violations caught before submission
- API rate limits respected to prevent bans
- Transient network errors auto-recover without manual intervention

## [2.0.0] - 2025-10-03

### Added - Daily Loss Kill Switch Feature

#### Core Kill Switch System
- **Automatic Trading Suspension**: System now automatically stops all trading when rolling 24-hour losses exceed configurable threshold (default: 7%)
- **Warning System**: Pre-emptive alerts triggered when losses reach warning threshold (default: 75% of kill switch = -5.25%)
- **Emergency Position Closure**: All open trades automatically closed at market price when kill switch activates
- **Dual-Layer Protection**:
  - Risk Gate (`RiskManager.checkPreTradeRisk`): Blocks trade execution when `tradingSuspended === true`
  - Signal Stage (`MarketScanner.scanForSignals`): Skips all strategy execution when suspended

#### Database Schema
- Added `dailyLossKillSwitch` field to tradingSettings (varchar, default '7.00')
- Added `dailyLossWarningTrigger` field to tradingSettings (varchar, default '75.00')
- Added `tradingSuspended` field to tradingSettings (boolean, default false)
- Created `killSwitchEvents` table for comprehensive audit trail:
  - Event timestamp (UTC)
  - Loss percentage and dollar amount
  - Account equity before/after
  - Trades closed (JSON array with full trade details)
  - Kill switch and warning settings at time of trigger

#### API Endpoints
- `GET /api/kill-switch/status` - Current kill switch status with 24h P/L
- `POST /api/kill-switch/check` - Trigger kill switch check logic
- `POST /api/kill-switch/reset` - Manual reset to resume trading
- `GET /api/kill-switch/events` - Historical kill switch events
- `POST /api/kill-switch/create-analysis-chat` - Create AI conversation with incident context

#### User Interface
- **Settings Page** (Portfolio Guardrails tab):
  - Daily Loss Kill Switch % input (default 7.00)
  - Warning Trigger % input (default 75.00)
  - Trading Suspended status indicator (read-only)
  - Safe defaults with handleReset restoration
  
- **Kill Switch Screen** (`/kill-switch`):
  - Red alert banner with suspension notice
  - Event summary (loss %, amount, equity impact, timestamp)
  - Portfolio breakdown (before/after values)
  - Closed trades list with P/L details
  - One-click ChatGPT incident analysis
  - Manual reset with optional notes
  - Auto-redirect from all routes except /kill-switch and /settings

- **Auto-Redirect Logic**:
  - Redirects to /kill-switch when tradingSuspended = true
  - Allows access to /settings for threshold adjustment during suspension
  - Prevents access to trading pages while suspended

#### ChatGPT Integration
- **Incident Analysis Conversation**:
  - One-click analysis creation from kill switch screen
  - Pre-filled incident context (event details, closed trades, settings snapshot)
  - Automated analysis request with 4-point structure:
    1. Root cause analysis
    2. Pattern identification
    3. Settings recommendations
    4. Risk management improvements
  - Direct navigation to analysis conversation
  - Privacy-safe (excludes API keys/secrets)

#### Testing & Verification
- `POST /api/test/simulate-loss` - Simulate warning/kill scenarios for E2E testing
- `POST /api/test/attempt-trade` - Verify trade blocking during suspension
- Comprehensive verification documentation (KILL_SWITCH_PHASE3_VERIFICATION.md)

### Changed

#### Trading Flow
- Added Check 0 to pre-trade risk validation (kill switch check before all other checks)
- Market scanner now checks tradingSuspended before running strategies
- Strategy signals skipped with console log when trading is suspended

#### Risk Manager
- New method: `checkDailyLossKillSwitch()` - Main kill switch monitoring logic
- New method: `calculate24hPL()` - Rolling 24-hour profit/loss calculation
- New method: `triggerKillSwitch()` - Emergency position closure and suspension
- Enhanced error handling with safe JSON parsing

### Fixed
- Kill switch status now properly refetched after trigger (fixed stale tradingSuspended bug)
- Safe JSON parsing for tradesClosed prevents UI crashes from malformed data
- Auto-redirect logic properly allows /settings access during suspension
- Timezone abbreviations now use Intl.DateTimeFormat API

## [1.2.0] - 2025-10-02

### Added - Settings Page Reorganization
- Four-tab layout: Screener Filters → Portfolio Guardrails → Strategies → Notifications
- Plain-language descriptions for beginner-friendly interface
- Collapsible strategy sections with detailed parameters
- Finalized default values across all settings

### Added - Chat History System
- Multiple conversation support with history sidebar
- Token counting and cost estimation for GPT API calls
- Configurable context size (10/20/50 messages)
- Chat log tracking with cost summaries
- Auto-trimming to stay within token limits
- Conversation management (create, rename, delete)

### Added - Timezone Handling
- Database migration to timestamptz for UTC storage
- Timezone utilities with robust conversion functions
- Dual-time widget (UTC + Local time)
- 79+ global timezone options
- User settings for timezone and time format (12hr/24hr)
- Immediate reactivity on settings changes

## [1.1.0] - 2025-10-01

### Added - GPT-5 Integration
- ChatGPT-style conversational interface
- Database access for trading data queries
- Ask → Confirm → Update flow for settings changes
- Complete audit logging for AI-driven actions
- Error diagnosis capabilities with fix suggestions

## [1.0.0] - 2025-09-30

### Initial Release
- Three automated trading strategies (VWAP Pullback, ABCD Long, SMA Trend Ride)
- Hourly market scanning with configurable screener filters
- Real-time WebSocket data streaming
- Paper and live trading modes
- Comprehensive risk management (position sizing, exposure limits, slippage control)
- Trade tracking and performance analytics
- Kraken exchange integration
- PostgreSQL database with Drizzle ORM
- Responsive UI with dark theme
- User authentication system

---

## Documentation Updates

### New Documentation Files
- `KILL_SWITCH_INTEGRATION.md` - Complete integration documentation with flow diagrams
- `KILL_SWITCH_PHASE3_VERIFICATION.md` - Strategy and guardrail verification report

### Updated Files
- `replit.md` - Added Daily Loss Kill Switch feature documentation
- `README.md` - Updated with kill switch feature description

---

## Migration Guide

### For Existing Users

1. **Database Migration**: Run automatic migration to add new kill switch fields:
   ```bash
   npm run db:push
   ```

2. **Default Settings**: Kill switch is enabled by default with:
   - Daily Loss Kill Switch: 7.00%
   - Warning Trigger: 75.00%
   - Trading Suspended: false (initially)

3. **Review Settings**: Navigate to Settings → Portfolio Guardrails to review and adjust kill switch thresholds

4. **Testing**: Use test endpoints to simulate scenarios:
   ```bash
   # Simulate warning
   POST /api/test/simulate-loss
   { "scenario": "warning" }

   # Simulate kill
   POST /api/test/simulate-loss
   { "scenario": "kill" }
   ```

### Breaking Changes
None. All changes are backward compatible with existing trading configurations.

---

## Security Notes
- Kill switch event data excludes API keys and secrets
- All timestamps stored in UTC (timestamptz)
- Safe JSON parsing prevents injection attacks
- Trading suspension requires manual user reset (no automatic resumption)

---

## Known Limitations
1. **External Notifications**: Only in-app toast notifications implemented. Push/email/Telegram require external service integration.
2. **Multi-User**: Current implementation assumes single-user deployment. Multi-user features planned for future release.

---

## Contributors
- Lead Developer: Replit Agent
- Architecture: Full-Stack JavaScript with PostgreSQL
- AI Integration: OpenAI GPT-4o

---

## Support
For issues or questions:
1. Check kill switch event logs: `GET /api/kill-switch/events`
2. Review integration documentation: `KILL_SWITCH_INTEGRATION.md`
3. Use ChatGPT analysis for incident diagnosis
