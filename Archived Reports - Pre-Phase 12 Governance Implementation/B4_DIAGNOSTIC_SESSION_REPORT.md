# B4 Diagnostic Session Report
**Generated:** December 5, 2025

## Session Summary

| Metric | Value |
|--------|-------|
| Session Start | 2025-12-05 07:48:05 UTC |
| Starting Balance | $25,000.00 |
| Final Balance | $25,000.00 |
| Realized P&L | $0.00 |
| Unrealized P&L | $0.00 |
| Total Trades | 0 |
| Open Trades | 0 |

## Trading Funnel Metrics

| Stage | Count | Conversion |
|-------|-------|------------|
| Active Pool | 0 | - |
| Trade Attempts | 0 | - |
| RTB Signals | 0 | 0% |
| Trades Opened | 0 | 0% |

**Note:** No trades were opened during this short diagnostic session. The market scanner was actively evaluating trading pairs, but signals did not meet all guardrail criteria during this period.

## MAX_POSITION Guardrail Diagnostics

- **Total Logged Checks:** 0
- **Block Events:** None recorded

The B4 diagnostic hooks are installed but require trade attempts to log position sizing data.

## WebSocket Price Engine Health

| Metric | Value |
|--------|-------|
| Connected | No |
| Subscribed Symbols | 0 |
| Stale Symbols | 0 |

**Note:** WebSocket connects only when trades are open (no open trades during this session).

## Portfolio Overview

| Metric | Value |
|--------|-------|
| Total Value | $25,000.00 |
| Cash | $25,000.00 (100%) |
| Crypto | $0.00 (0%) |
| Current Exposure | 0% |
| Win Rate | N/A (0 trades) |

## Available Report Files

1. `b4_session_stats.json` - B4 diagnostic session statistics
2. `funnel_summary.json` - Trading funnel conversion metrics
3. `max_position_diagnostics.json` - MAX_POSITION check logs (JSON)
4. `max_position_diagnostics.csv` - MAX_POSITION check logs (CSV export)
5. `funnel_diagnostics.csv` - Funnel event logs (CSV export)
6. `websocket_health.json` - WebSocket price engine health status
7. `trading_session_info.json` - Trading session details
8. `portfolio_overview.json` - Portfolio balance and metrics

## Observations

1. **Short Session:** The diagnostic session was brief, and no trades were executed
2. **Market Conditions:** Server logs show the scanner was filtering most signals due to:
   - High toxicity readings (DHMA strategy rejections)
   - Narrow trading ranges (<3% threshold)
   - Strategy criteria not met for most pairs
3. **System Health:** All diagnostic endpoints are functional and ready to capture data
4. **Instrumentation Ready:** B4 diagnostic framework is properly installed for extended observation

## Next Steps

For meaningful diagnostic data:
1. Run the trading engine for an extended period (30+ minutes)
2. Allow trades to open and close naturally
3. Re-export diagnostics to analyze funnel conversion rates and position sizing behavior
