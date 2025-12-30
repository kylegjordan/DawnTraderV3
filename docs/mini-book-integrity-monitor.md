# Mini-Book Integrity Monitor (MBIM) - Directive 8.9.5

## Overview

The Mini-Book Integrity Monitor (MBIM) is a continuous background audit process that cross-checks WebSocket Mini-Book mid-prices against REST midpoint values to detect silent drift, stale feeds, or book corruption.

## Features

- **5-Minute Audit Cycle**: Runs automatically every 5 minutes when active
- **Drift Detection**: Alerts when WS/REST price divergence exceeds 0.2%
- **Auto-Recovery**: Triggers soft resubscribe via Sentinel when drift detected
- **Logging**: All audit results logged to `/tmp/logs/integrity_monitor.log`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mbim/start` | POST | Start the integrity monitor (5-min interval) |
| `/api/mbim/stop` | POST | Stop the integrity monitor |
| `/api/mbim/status` | GET | Get current status and metrics |
| `/api/mbim/audit` | POST | Trigger immediate audit |

## Metrics

The status endpoint returns:
- `active`: Whether monitor is running
- `metrics.totalChecks`: Total symbol checks performed
- `metrics.passCount`: Checks that passed (< 0.2% drift)
- `metrics.driftCount`: Checks that detected drift
- `metrics.lastAuditTime`: Timestamp of last audit
- `metrics.symbolsDrifted`: List of symbols with drift in last audit
- `metrics.avgDriftPct`: Average drift percentage

## Auto-Heal Behavior

When drift exceeds 0.2%:
1. Warning logged: `[8.9.5][SENTINEL] Soft resubscribe triggered for {symbol}`
2. Symbol unsubscribed from WebSocket
3. 500ms delay
4. Symbol resubscribed to WebSocket
5. Fresh book snapshot received

## Log Format

```
[2025-12-30T22:30:00.000Z] BTC/USD WS=88200.500000 REST=88200.500000 Δ=0.000% ✅ OK
[2025-12-30T22:30:00.100Z] ENSO/EUR WS=0.612000 REST=0.615000 Δ=0.488% ⚠️ DRIFT
```

## Pass Criteria

- Δ ≤ 0.2% for ≥ 95% of symbols
- Drift recovery (soft resubscribe) succeeds within 60 seconds

## System Impact

| Aspect | Impact |
|--------|--------|
| CPU/I/O | Minimal (5-min interval, REST only) |
| Reliability | Increases long-term data consistency |
| Safety | Automatic divergence recovery prevents silent feed corruption |
| Maintenance | Log rotates daily, small size (< 500 KB/day) |
