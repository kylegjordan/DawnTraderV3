# Crypto Day Trading Web App

## Overview

A long-only, spot-trading cryptocurrency day trading web application that automates trading strategies on Kraken markets. The application scans markets hourly, monitors shortlisted pairs in real-time, and executes three distinct strategies: VWAP Pullback, ABCD Long, and SMA Trend Ride. It enforces disciplined risk management with configurable parameters, supports both live and paper trading modes, and integrates OpenAI's GPT-5 for AI-powered analysis, conversational assistance, and intelligent system management. The platform provides comprehensive trade tracking, performance analytics, tax-ready export functionality, audit trails for all AI actions, and error diagnosis capabilities through a responsive dashboard interface optimized for Android and Windows.

**Recent Enhancement (Oct 3, 2025)**: 
1. **Daily Loss Kill Switch Feature**:
   - **Automatic Trading Suspension**: System automatically stops trading when 24-hour rolling losses exceed configurable threshold (default: 7%)
   - **Warning System**: Pre-emptive alerts when losses reach warning trigger (default: 75% of kill switch = -5.25%)
   - **Emergency Position Closure**: All open trades automatically closed at market when kill switch activates
   - **Comprehensive Event Logging**: Complete audit trail in `killSwitchEvents` table with P/L snapshots, closed trade details, and timestamps
   - **Kill Switch Screen**: Dedicated UI showing event summary, portfolio breakdown, closed trade list, and historical events
   - **Safe Defaults & Reset**: Settings form initializes to 7.00%/75.00% defaults, handleReset restores defaults, tradingSuspended flag prevents new trades
   - **User-Controlled Recovery**: Manual reset button allows users to resume trading after reviewing losses and adjusting settings
   - **Settings Access During Suspension**: Auto-redirect allows access to /settings and /kill-switch while suspended for threshold adjustments
   - **Robust Error Handling**: Safe JSON parsing of closed trades with try-catch and array validation prevents crashes

2. **Settings Page Reorganization with Beginner-Friendly Interface**:
   - **Four-Tab Layout**: Screener Filters → Portfolio Guardrails → Strategies → Notifications
   - **Plain-Language Descriptions**: Every setting has explanatory text for beginners
   - **Collapsible Strategy Sections**: Three strategy cards (VWAP Pullback, ABCD Long, SMA Trend Ride) with detailed parameters
   - **Finalized Default Values**:
     - Screener: Min Volume $30M (↑from $20M), Min Range 6.5% (↑from 5%), Min Price $0.01, Max Spread 1%, Exclude Stablecoins ON, 90d History
     - Guardrails: Risk/Trade $150 (↑from $100), Max Exposure 25% (↑from 20%), Max Trades 3, Stop Buffer 0.3%, Slippage (Majors 0.5%, Mid 2%, Small 5%)
     - VWAP: Timeframe 60min, Pullback 2%, Volume 1.5x, Max Hold 24 bars
     - ABCD: Consolidation 10 bars, Breakout 1.5%, Volume 1.5x, Exit Type dropdown (Fixed Target 3% / Trailing Stop 2%)
     - SMA: Length 20, Entry dropdown (Above/Crossover), Exit dropdown (Break/Trailing), Trailing 2%
   - **Comprehensive Type Safety**: Updated TradingSettings interface with all 30+ new parameters

2. Implemented comprehensive chat history system with cost control:
   - Multiple conversation support with history sidebar
   - Token counting and cost estimation for all GPT API calls
   - Configurable context size (10/20/50 messages)
   - Chat log tracking with cost summaries
   - Auto-trimming to stay within token limits
   - Conversation management (create, rename, delete)

3. Comprehensive timezone handling system (UTC storage, local display):
   - **Database Migration**: All timestamp columns migrated to `timestamptz` for timezone-aware storage in UTC
   - **Timezone Utilities** (`client/src/lib/timezone.ts`): Robust conversion functions using dayjs + Intl.DateTimeFormat for reliable timezone abbreviations
   - **Dual-Time Widget**: TopBar displays both UTC (24hr, muted) and Local time (user's format, highlighted) side-by-side with real-time updates
   - **Comprehensive Timezone List**: 79+ global options organized by region (Americas, Europe, Middle East, Asia, Oceania, Africa) including Mikolajki Pomorskie, Poland (Europe/Warsaw)
   - **User Settings**: Timezone selection (default: Asia/Dubai) and 12hr/24hr time format toggle (default: 12hr)
   - **Timestamp Displays**: All trade times, report timestamps, and AI insights converted from UTC to user's timezone on display
   - **Immediate Reactivity**: Settings changes instantly update dual-time widget and all timestamps via TanStack Query cache invalidation
   - **Bug Fix**: Timezone abbreviations now use Intl.DateTimeFormat API (fixed dayjs format('z') returning 'z' placeholder)

**Previous Enhancement (Oct 2, 2025)**: Implemented comprehensive GPT-5 integration with database access, Ask→Confirm→Update flow for settings changes, complete audit logging, and error diagnosis capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React + TypeScript with Vite as the build tool and development server.

**UI Framework**: shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling. The design system implements a dark trading theme with custom CSS variables for consistent theming across components.

**State Management**: TanStack Query (React Query) for server state management and caching. Custom hooks (`use-trading`, `use-websocket`) encapsulate API interactions and real-time data subscriptions.

**Routing**: Wouter for lightweight client-side routing. Main routes include Dashboard, History, Analysis, and Settings pages.

**Real-time Updates**: WebSocket connection for live market data, trade updates, and portfolio metrics. The `useWebSocket` hook manages connection lifecycle and automatic reconnection.

**Responsive Design**: Mobile-first approach with breakpoint at 768px. Sidebar collapses into drawer on mobile devices, managed through `useIsMobile` hook.

### Backend Architecture

**Runtime**: Node.js with Express framework running in ESM module mode.

**API Design**: RESTful API endpoints under `/api` namespace with WebSocket support on `/ws` path for real-time bidirectional communication.

**Service Layer Architecture**:
- **KrakenService**: Handles all Kraken API interactions including market data retrieval, order placement, and order book depth analysis
- **TradingEngine**: Orchestrates trade execution per user, manages trading state (running/stopped), and coordinates between strategy detection and order execution
- **StrategyEngine**: Implements the three trading strategies with fixed rules for entry/exit signals and technical indicator calculations
- **MarketScanner**: Performs hourly market scans to identify eligible trading pairs based on volume and volatility criteria
- **RiskManager**: Enforces pre-trade risk checks including position sizing, exposure limits, and slippage tolerance validation
- **AIAnalyst**: Generates trading reports and insights using OpenAI's GPT-5 model for daily, weekly, and monthly analysis

**Trading Strategy Implementation**: Each strategy (VWAP Pullback, ABCD Long, SMA Trend Ride) follows fixed rules with no user modification. Strategies calculate entry price, stop loss, and target prices based on technical patterns and indicators.

**Risk Management System**: Multi-layered approach including:
- Risk per trade (R) calculation and enforcement
- Maximum exposure percentage across concurrent positions
- Maximum number of open trades limit
- Slippage tolerance tiers (majors/midcaps/small caps)
- Order book depth validation before execution

**Trading Modes**: Supports both "live" (actual Kraken orders) and "paper" (simulated) trading with mode switching and persistent state tracking.

### Data Storage Solutions

**Database**: PostgreSQL accessed via Neon serverless driver with WebSocket support for serverless environments.

**ORM**: Drizzle ORM with type-safe schema definitions and migrations stored in `/migrations` directory.

**Schema Structure**:
- `users`: Authentication, Kraken API credentials, trading mode/status
- `tradingSettings`: Per-user risk parameters, strategy settings, AI preferences
- `watchlistPairs`: Market scanner results with technical indicators (VWAP, SMA, volume, range)
- `trades`: Complete trade lifecycle records including entry/exit, fees, slippage, P/L, and R-multiple
- `aiReports`: Generated AI analysis reports with insights and recommendations
- `aiConversations`: Multiple chat conversations with title, messages, context, and max context messages setting
- `aiChatLogs`: Tracks all GPT API calls with input/output tokens, total tokens, estimated cost, and model used
- `priceData`: Historical price data for backtesting and analysis

**Data Types**: Extensive use of PostgreSQL enums for type safety (trading_mode, trading_status, strategy_type, trade_status) and decimal types for financial precision.

**Storage Layer**: Abstracted through `storage.ts` interface providing CRUD operations for all entities with filtering and aggregation support.

### Authentication and Authorization

**Current Implementation**: Simplified authentication using `user-id` header (suitable for single-user deployment or development).

**Design Consideration**: Architecture supports future enhancement to full session-based or JWT authentication system. User credentials stored with bcrypt hashing preparation.

### External Dependencies

**Kraken Exchange API**: Primary integration for market data and trade execution. KrakenService implements:
- Public API endpoints for ticker data, OHLC candles, order books
- Private API endpoints for balance queries, order placement, order management
- HMAC-SHA512 signature generation for authenticated requests
- Rate limiting considerations for API calls

**OpenAI GPT-4o API**: AI analysis and conversational assistant powered by GPT-4o (updated Oct 2025). Comprehensive features include:
- **ChatGPT-Style Interface**: Multi-turn conversation with full trading context and database access
- **Multiple Conversations**: Create, manage, and switch between separate chat conversations with history sidebar
- **Cost Control System**:
  - Token counting and estimation for all API calls
  - Configurable context size (10/20/50 messages) to control costs
  - Auto-trimming to stay within 4000 token limit
  - Cost tracking with detailed usage summaries
  - Chat logs table (`ai_chat_logs`) stores all API calls with token counts and estimated costs
- **Database Query Capabilities**: AI can safely query trading data, risk settings, performance stats, and error logs through predefined query templates
- **Ask → Confirm → Update Flow**: All settings changes proposed by AI require explicit user confirmation before execution
- **Audit Trail System**: Complete logging of all AI-driven actions (settings changes, analysis requests, error diagnoses) stored in `ai_audit_log` table
- **Error Diagnosis**: AI-powered analysis of system errors with actionable fix suggestions, stored in `error_logs` table
- **Performance Reports**: Daily/weekly/monthly trading reports with insights and recommendations
- **Symbol Analysis**: Technical analysis and strategy recommendations for specific trading pairs
- Interactive chat assistance for trading questions

**Neon Database**: Serverless PostgreSQL database with WebSocket connection support. Requires `DATABASE_URL` environment variable for connection string.

**WebSocket Infrastructure**: Custom WebSocket server for real-time data push to clients including:
- Live price updates for watchlist pairs
- Trade execution notifications
- Portfolio metric updates
- System status changes

**Development Tools**:
- Replit-specific Vite plugins for error overlays, cartographer, and dev banner
- TypeScript for type safety across shared schemas between client and server
- Drizzle Kit for database migrations and schema management

**Build and Deployment**:
- Vite for frontend bundling with React plugin
- esbuild for backend bundling with ESM output
- Separate build outputs: frontend to `dist/public`, backend to `dist/index.js`
- Environment-based configuration with separate dev/production modes