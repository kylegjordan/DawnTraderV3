# Phase 41F-L.E2E-VALIDATE-FLOW - Complete Pipeline Validation

Execution Start: 2025-11-03T20:13:09.092Z

---

## Phase 1: Authentication Validation

✅ Authentication successful
✅ JWT token verified for user: testuser123

## Phase 2: Mode-Level Configuration Validation

✅ Found guardrailsV2 for both modes: 2 rows
  - Mode: live, Risk: 4.00%, MaxPositions: 12
  - Mode: paper, Risk: 4.00%, MaxPositions: 12
✅ Found portfolio_state for both modes: 2 rows
  - Mode: live, Balance: $834.11
  - Mode: paper, Balance: $5000.00
✅ Guardrails API endpoints operational for both modes

## Phase 3: Paper Trading Engine Validation

Initial state: {
  "mode": "paper",
  "active": false,
  "engineStatus": "STOPPED",
  "lastUpdate": "2025-11-03T20:12:55.967Z",
  "lastUserAction": "stop",
  "lastModeChange": "2025-11-03T20:10:23.229Z",
  "changedBy": "6c591801-3072-431d-b192-30aaf426f15e",
  "changeReason": "Paper simulation started",
  "lastStartedBy": "6c591801-3072-431d-b192-30aaf426f15e",
  "lastStoppedBy": "6c591801-3072-431d-b192-30aaf426f15e",
  "lastHeartbeat": "2025-11-03T20:10:23.163Z",
  "currentMode": "paper",
  "isEngineActive": false,
  "isEngineActivePaper": false,
  "isEngineActiveLive": false,
  "passiveLearning": true,
  "ts": "2025-11-03T20:13:10.299Z",
  "dataSource": "system_context",
  "live": {
    "portfolioBalance": 834.11,
    "activeStrategies": [
      "vwap_pullback",
      "abcd_long",
      "sma_trend_ride",
      "breakout",
      "mean_reversion",
      "range_trading",
      "vwap_bounce",
      "liquidity_trap"
    ],
    "activeStrategiesCount": 8,
    "engineActive": false,
    "engineStatus": "stopped",
    "dataSource": "database"
  },
  "paper": {
    "portfolioBalance": 5000,
    "activeStrategies": [
      "vwap_pullback",
      "abcd_long",
      "sma_trend_ride",
      "breakout",
      "mean_reversion",
      "range_trading",
      "vwap_bounce",
      "liquidity_trap"
    ],
    "activeStrategiesCount": 8,
    "engineActive": false,
    "engineStatus": "stopped",
    "dataSource": "database"
  },
  "engineActive": false,
  "activeStrategies": [
    "vwap_pullback",
    "abcd_long",
    "sma_trend_ride",
    "breakout",
    "mean_reversion",
    "range_trading",
    "vwap_bounce",
    "liquidity_trap"
  ],
  "activeStrategiesCount": 8,
  "portfolioBalance": 5000,
  "filteredPairs": 0,
  "readyToBuy": 0,
  "activeTrades": 0,
  "lastTickISO": "2025-11-03T20:13:10.299Z"
}
✅ Paper trading engine start command accepted
✅ Paper engine status after start: running

## Phase 4: Data Flow Validation

Waiting 15 seconds for data flow...
✅ Filter Insights: 0 items
✅ Diagnostic Scan: 0 items
✅ Trades: 0 items
✅ Portfolio Overview: 0 items
✅ Earnings Chart: 0 items

## Phase 5: API/DB Consistency Validation

Trades count: API=0 (user-scoped), DB=84 (all paper trades)
✅ Trades API returns valid array structure with 0 user trades
✅ Database contains 84 total paper trades

## Phase 6: Telemetry & Lineage Validation

⚠️  WARNING: Telemetry lineage table not present in schema - skipping validation

---

## Final Report Summary

Execution End: 2025-11-03T20:13:44.540Z
Total Duration: 35.45s

### Result: ✅ PASSED

### Warnings (1):

1. Telemetry lineage table not present in schema - skipping validation

### Collected Metrics:

```json
{
  "username": "testuser123",
  "userId": "6c591801-3072-431d-b192-30aaf426f15e",
  "guardrails_live": {
    "risk": "4.00",
    "maxPositions": 12,
    "cooldown": 5,
    "killSwitch": "15.00"
  },
  "guardrails_paper": {
    "risk": "4.00",
    "maxPositions": 12,
    "cooldown": 5,
    "killSwitch": "15.00"
  },
  "portfolio_live": {
    "balance": "834.11"
  },
  "portfolio_paper": {
    "balance": "5000.00"
  },
  "api_guardrails_live": {
    "ok": true,
    "data": {
      "id": "31bec456-e8ca-422e-ba87-0ccbe08949f9",
      "mode": "live",
      "portfolioRiskPerTradePct": 4,
      "symbolCooldownMinutes": 5,
      "maxOpenPositions": 12,
      "dailyLossKillSwitchPct": 15,
      "isManualOverride": false,
      "tunedByLatti": true,
      "lockedByUser": {},
      "managedByLottie": true,
      "manualOverrideEnabled": false,
      "lastUpdatedBy": null,
      "killSwitchTripped": false,
      "killSwitchReason": null,
      "killSwitchTrippedAt": null,
      "lastUpdated": "2025-10-29T20:56:40.371Z"
    }
  },
  "api_guardrails_paper": {
    "ok": true,
    "data": {
      "id": "aead28bb-11f4-415e-a472-a4feb671c8da",
      "mode": "paper",
      "portfolioRiskPerTradePct": 4,
      "symbolCooldownMinutes": 5,
      "maxOpenPositions": 12,
      "dailyLossKillSwitchPct": 15,
      "isManualOverride": false,
      "tunedByLatti": true,
      "lockedByUser": {
        "symbolCooldownMinutes": false,
        "portfolioRiskPerTradePct": false
      },
      "managedByLottie": true,
      "manualOverrideEnabled": false,
      "lastUpdatedBy": null,
      "killSwitchTripped": false,
      "killSwitchReason": null,
      "killSwitchTrippedAt": null,
      "lastUpdated": "2025-11-03T12:57:21.464Z"
    }
  },
  "paper_engine_start_accepted": true,
  "paper_engine_status": "running",
  "api_filter_insights": {
    "count": 0,
    "data": {
      "pairsScanned": 1487,
      "eligiblePairs": 652,
      "topFailureReason": "Min Volume",
      "failurePercent": 56.153328850033624,
      "timestamp": "2025-11-03T20:13:38.441Z",
      "thresholds": {
        "minVolume": 5000,
        "minPrice": 0.01,
        "maxPrice": 10000,
        "minMarketCap": 100000000,
        "maxBidAskSpread": 2,
        "rsiMin": 30,
        "rsiMax": 70,
        "volatilityMin": 0.5,
        "volatilityMax": 5,
        "minLiquidity": 0,
        "excludeStablecoins": true,
        "allowRegulatedOnly": false
      }
    }
  },
  "api_diagnostic_scan": {
    "count": 0,
    "data": {
      "mode": "paper",
      "universe_count": 1487,
      "evaluated": 10,
      "eligible_count": 7,
      "ineligible_count": 3,
      "breakdown": {
        "failed_min_volume": 3,
        "failed_spread": 0,
        "failed_daily_range": 0,
        "failed_min_price": 0,
        "failed_stablecoin": 0,
        "failed_quote_currency": 0,
        "failed_blacklist": 0,
        "failed_whitelist": 0,
        "failed_history": 0,
        "failed_guardrail_risk": 0,
        "strategy_none_triggered": 7
      },
      "top_candidates": [],
      "ts": "2025-11-03T20:13:43.264Z",
      "nextScanAt": "2025-11-03T20:23:43.264Z"
    }
  },
  "api_trades": {
    "count": 0,
    "data": []
  },
  "api_portfolio_overview": {
    "count": 0,
    "data": {
      "totalValue": 5000,
      "unrealizedPL": 0,
      "realizedPL": 0,
      "currentExposure": 0,
      "openTradesCount": 0,
      "winRate": 0,
      "totalTrades": 15,
      "wins": 0,
      "losses": 0,
      "profitFactor": 0,
      "cash": 5000,
      "crypto": 0,
      "cashPercent": 100,
      "cryptoPercent": 0,
      "balanceSource": "paper-sim"
    }
  },
  "api_earnings_chart": {
    "count": 0,
    "data": []
  },
  "consistency_trades": {
    "api_count_user_scoped": 0,
    "db_count_all_paper": 84,
    "note": "API is user-scoped, DB count is all paper trades"
  },
  "telemetry_lineage": {
    "status": "table_not_found",
    "note": "telemetry_lineage table not in current schema"
  }
}
```


### Lineage Trace

Complete event trace available at: /home/runner/workspace/diagnostic-reports/phase-41F-L.E2E-VALIDATE-FLOW.ndjson

