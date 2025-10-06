# Crypto Day Trading Web App

## Overview
A long-only, spot-trading cryptocurrency day trading web application that automates strategies on Kraken. It provides real-time market scanning, pair monitoring, and executes VWAP Pullback, ABCD Long, and SMA Trend Ride strategies. The application enforces disciplined risk management, supports live and paper trading, integrates OpenAI's GPT-5 for AI analysis and assistance, and offers trade tracking, performance analytics, tax-ready export, AI audit trails, and error diagnosis via a responsive dashboard. It includes robust execution bot resilience with bracket order rollback, partial fill recovery, exchange constraint enforcement, rate limiting, retry logic, and a daily loss kill switch.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses React + TypeScript with Vite, shadcn/ui (Radix UI + Tailwind CSS) for UI, and TanStack Query for state management. Wouter handles routing, and WebSockets provide real-time updates. It follows a mobile-first responsive design. The UI is mode-aware, dynamically switching between Live and Paper trading data sources with clear visual differentiators (color themes, badges).

### Backend Architecture
The backend is Node.js with Express, using ESM. It features a RESTful API and WebSocket support. Key services include `KrakenService`, `TradingEngine`, `StrategyEngine`, `MarketScanner`, `RiskManager`, `AIAnalyst`, and `AIOpportunitiesService`. It supports both "live" and "paper" trading modes.

### Data Storage Solutions
PostgreSQL, accessed via Neon serverless driver, is used for data storage, with Drizzle ORM for type-safe schema definitions. Key schemas include `users`, `tradingSettings`, `watchlistPairs`, `trades`, `aiReports`, `aiConversations`, `aiChatLogs`, `priceData`, `aiOpportunityRuns`, and `aiOpportunities`. Authentication is via a `user-id` header.

### System Design Choices
- **Trading Strategy Implementation**: Fixed rules for VWAP Pullback, ABCD Long, and SMA Trend Ride strategies, calculating entry, stop loss, and target prices.
- **Risk Management System**: Multi-layered, including risk per trade, maximum exposure, maximum open trades, slippage tolerance, order book depth validation, and a daily loss kill switch.
- **AI Opportunities**: An hourly automated pipeline using GPT-4o mini to analyze Kraken pairs, identify, validate, and store trading opportunities across five types (long_term_hold, moonshot, momentum, breakout, mean_reversion).
- **Live Kraken Balance Integration**: Portfolio Value widget displays live account balances from Kraken API with a 45-second per-user cache, falling back to internal estimates if the API fails.
- **Comprehensive Reports Panel**: A dedicated page for Canned Reports (Tax Report, Performance Summary, Trade Journal), Custom Reports, and Quick Exports (CSV). The Tax Report includes cost basis, proceeds, holding duration, and term classification.
- **Earnings Widget with ADE and Trend Visualization**: Displays Average Daily Earnings (ADE) from the last 30 days and a 7-day earnings trend sparkline.
- **Maintenance Mode**: System-wide maintenance mode controlled by an environment variable, blocking Kraken API calls and displaying a frontend banner.
- **Market Data Health Check**: Automated daily monitoring of market data service reliability, testing BTC, ETH, SOL, and SUI against CoinGecko and Kraken APIs, logging performance and detecting issues.
- **Daily Trading Brief**: An automated daily briefing system using GPT-4o, generating comprehensive end-of-day reports with headlines, summaries, narrative analysis, key metrics, trade highlights, AI learnings, and system health.
- **Paper Trading System**: A complete simulated trading environment with isolated data, realistic trade execution simulation (slippage, latency, fees), and mirroring of all live trading metrics and daily briefings. Starting balance is $50,000.
- **Learning Feedback Engine**: An adaptive learning system that continuously improves trading accuracy by tracking prediction outcomes, optimizing signal weights based on historical performance, enriching market features with momentum and volatility indicators, normalizing data quality, and enhancing GPT prompts with confidence-based predictions. The system maintains complete isolation between paper and live trading modes.

## External Dependencies

- **Kraken Exchange API**: Used for market data, trade execution, balance queries, and order management, with comprehensive API load management, multi-tier caching, and rate limit detection.
- **OpenAI GPT-4o API**: Powers AI analysis, conversational assistance (multi-turn conversations, cost control, database query capabilities, audit trails, error diagnosis), and AI Opportunities generation (GPT-4o mini).
- **Finnhub API**: Provides stock market data with retry logic, multi-tier fallback, 2-minute response caching, and graceful degradation.
- **Neon Database**: Serverless PostgreSQL database.
- **WebSocket Infrastructure**: Custom WebSocket server for real-time data push.

## Learning Feedback Engine

The Learning Feedback Engine is an adaptive learning system that continuously improves trading prediction accuracy by analyzing historical performance and optimizing signal weights. It enhances GPT prompts with confidence-based predictions, enriched market features, and normalized data quality.

### Core Components

1. **Data Normalization Service** (`server/services/data-normalization.ts`)
   - Rolling z-score normalization for price and volume data
   - Min-max normalization with configurable windows (default: 30 days)
   - Volatility and liquidity filters to remove low-quality data
   - Provides clean, standardized inputs to the AI models

2. **Feature Enrichment Service** (`server/services/feature-enrichment.ts`)
   - Market Momentum Index (MMI): Combines RSI, SMA slope, and volume delta
   - RSI calculation with configurable period (default: 14)
   - SMA slope calculation for trend strength
   - Volume delta tracking for liquidity assessment
   - Pluggable architecture for easy addition of new feature calculators

3. **Signal Weight Optimizer** (`server/services/signal-weight-optimizer.ts`)
   - Nightly background task (runs at 3 AM UTC) to analyze prediction outcomes
   - Calculates signal-specific accuracy and profitability metrics
   - Updates signal weights using exponential decay formula
   - Maintains separate weights for paper and live trading modes
   - Provides weight insights API for dashboard visualization

4. **Enhanced GPT Prompt Templates** (`server/services/prompts/enhanced-analysis.ts`)
   - Confidence-based structured predictions with signal_type, confidence, predicted_direction, rationale, risk_score
   - Includes 7-day performance summary and prediction accuracy context
   - Adaptive signal weights fed into prompts for better decision-making
   - Enriched market features (momentum, RSI, volatility, liquidity) included in analysis
   - Probabilistic reasoning approach with risk assessment

### Database Schema

Three new tables support the Learning Feedback Engine:

1. **signal_weights**: Stores adaptive weights for each signal type per user/strategy/mode
2. **prediction_outcomes**: Tracks prediction metadata (confidence, direction) and actual outcomes
3. **feature_snapshots**: Stores enriched market features at the time of each prediction

### API Endpoints

- `GET /api/learning/prediction-accuracy`: Get prediction accuracy metrics with filters for mode, strategy, and time period
- `GET /api/learning/signal-insights`: Get signal weight insights and performance breakdown
- `GET /api/learning/signal-weights`: Retrieve signal weights for a user/strategy/mode
- `GET /api/learning/prediction-outcomes`: Query prediction outcomes with filters
- `GET /api/learning/features/:symbol`: Get enriched features for a specific symbol
- `POST /api/learning/optimize-weights`: Manually trigger signal weight optimization

### Mode Isolation

The Learning Feedback Engine maintains complete isolation between paper and live trading:
- Signal weights are stored separately per trading mode
- Prediction outcomes are tracked with mode identifier
- Feature snapshots include mode context
- Optimizer runs independently for paper and live modes
- Users can validate learning in paper mode before enabling for live trading

### Workflow

1. **Data Collection**: As predictions are made, metadata (confidence, direction, signal_type) is captured
2. **Feature Enrichment**: Market features are calculated and stored for each prediction
3. **Outcome Tracking**: When trades close, actual outcomes are recorded and linked to predictions
4. **Nightly Optimization**: Signal weights are recalculated based on recent performance
5. **Enhanced Predictions**: Updated weights and performance context are fed into GPT prompts
6. **Continuous Improvement**: The cycle repeats, creating a feedback loop for better accuracy

### Key Design Decisions

- **Pluggable Feature Calculators**: Easy to add new signals without modifying callers
- **Exponential Decay**: Recent performance weighted more heavily than older data
- **Conservative Defaults**: All signals start at 1.0x weight, adjusted based on evidence
- **Paper-First Learning**: New users start with paper mode learning, optional copy to live after validation
- **Mode Isolation**: Prevents cross-contamination between paper and live trading data

## Trading Strategy Performance Visualization

The Strategy Performance Visualization provides detailed strategy-level insights on the dashboard and reports panel, combining prediction accuracy metrics from the Learning Feedback Engine with trade performance data. It allows traders to analyze each trading strategy's effectiveness through multiple lenses: win rate, R-multiples, P/L, prediction diagnostics, signal weight evolution, and equity curves.

### Components

1. **StrategyPerformanceWidget** (`client/src/components/strategy/strategy-performance-widget.tsx`)
   - Displays on the main dashboard below Portfolio Overview
   - Shows top-performing strategies ranked by total P/L
   - Metric cards include:
     - Win Rate: Percentage of profitable trades
     - Average R-Multiple: Risk-adjusted returns
     - Total P/L: Cumulative profit/loss
     - Prediction Accuracy: AI forecast correctness from Learning Engine
   - Color-coded performance indicators (green for positive, red for negative)
   - Click through to detailed strategy view

2. **StrategyDetailView** (`client/src/components/strategy/strategy-detail-view.tsx`)
   - Accessible from Reports panel
   - Three tabbed views:
     - **Equity Curve**: Line chart showing cumulative P/L over time
     - **Signal Insights**: Adaptive signal weights from Learning Feedback Engine with trend indicators (up/down/stable)
     - **Predictions**: Confusion matrix showing Long/Short/Neutral prediction accuracy
   - Time range selector: 7 days, 30 days, 90 days
   - Overview metrics:
     - Total/Closed/Open trades count
     - Win rate percentage
     - Average R-multiple
     - Average holding time in hours

### API Endpoints

Strategy-level metrics are aggregated from prediction outcomes and trade data:

- `GET /api/metrics/strategies`: Get all strategy metrics for live mode
  - Returns array of strategy metrics with win rate, R-multiple, P/L, prediction accuracy
  - Filters by time period using `days` query parameter
  - Mode-aware: respects current trading mode (live/paper)

- `GET /api/paper/metrics/strategies`: Get all strategy metrics for paper mode
  - Identical structure to live endpoint
  - Sources data from paper trading tables

- `GET /api/metrics/strategies/:strategyId/details`: Get detailed metrics for a specific strategy
  - Overview: trade counts, win rate, R-multiple, holding time, total P/L
  - Signal insights: weight history with trends
  - Prediction diagnostics: confusion matrix (correct/incorrect by direction)
  - Equity curve: cumulative P/L over time

### Data Sources

The visualization combines data from multiple sources:
1. **Trades table**: Win rate, R-multiples, P/L, holding time
2. **Prediction outcomes table**: AI accuracy, confidence scores, direction correctness
3. **Signal weights table**: Adaptive weights and optimization history
4. **Feature snapshots table**: Market context for each prediction

### Mode Isolation

Strategy performance maintains complete isolation between trading modes:
- Separate API endpoints for live and paper strategies
- Metrics calculated from mode-specific tables
- Visual mode indicator on all components
- Color-coded mode badges (green for live, blue for paper)

### Prediction Outcome Classification

Predictions are evaluated using a risk-based threshold:
- **Long/Short**: Correct if P/L > 0, incorrect if P/L ≤ 0
- **Neutral**: Correct if |P/L| < neutralThreshold (2% of riskAmount), incorrect otherwise
- This aligns with the principle that neutral predictions should avoid significant losses

### Integration Points

- **Dashboard**: StrategyPerformanceWidget displays below Portfolio Overview section
- **Reports Panel**: Strategy Detail View accessible via navigation
- **Learning Engine**: Signal weight insights from nightly optimizer
- **Trading Engine**: P/L and execution data from completed trades