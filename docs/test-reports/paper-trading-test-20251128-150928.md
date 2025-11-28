# Paper Trading 10-Minute Test Report

**Test Date:** $(date -Iseconds)
**Mode:** Paper Trading Simulation
**Duration:** 10 minutes (5 snapshots at 2-minute intervals)

---

## Test Objectives
1. Verify paper trading engine remains active for full duration
2. Monitor scanner cycle execution and survivor selection
3. Validate REB 2.11A Active Pool Audit diagnostics
4. Track trade activity and performance metrics

---

## Initial Configuration

### Trading Status (at start)
```json
{
  "isRunning": true,
  "sessionId": null,
  "startedAt": null,
  "tickCount": null,
  "tradeCount": null
}
```

### Scan Diagnostics (at start)
```json
{
  "mode": "paper",
  "universe_count": 1552,
  "survivors_count": null,
  "filterCounts": null
}
```

---

## Monitoring Snapshots

### Snapshot 1 - 15:10:12

**Trading Status:**
```json
{
  "isRunning": true,
  "tickCount": null,
  "tradeCount": null,
  "signalCount": null
}
```

**Scan Diagnostics:**
```json
{
  "survivors_count": null,
  "filterCounts": null,
  "lastScan": null
}
```

**Active Trades:** 0

**REB 2.11A Audit (latest cycle):**
```json
{
  "cycle": 13,
  "mode": "paper",
  "survivorCount": 20,
  "activeBeforeCount": 15,
  "activeAfterCount": 15,
  "alreadyActiveReported": 0,
  "mismatches": {
    "missedPairs": [
      "XAN/USD"
    ],
    "overcountedPairs": []
  }
}
```

---

### Snapshot 2 - 15:12:13

**Trading Status:**
```json
{
  "isRunning": true,
  "tickCount": null,
  "tradeCount": null,
  "signalCount": null
}
```

**Scan Diagnostics:**
```json
{
  "survivors_count": null,
  "filterCounts": null,
  "lastScan": null
}
```

**Active Trades:** 0

**REB 2.11A Audit (latest cycle):**
```json
{
  "cycle": 23,
  "mode": "paper",
  "survivorCount": 20,
  "activeBeforeCount": 105,
  "activeAfterCount": 105,
  "alreadyActiveReported": 0,
  "mismatches": {
    "missedPairs": [
      "BRICK/USD",
      "FWOG/USD",
      "PENGU/USD",
      "SHX/USD"
    ],
    "overcountedPairs": []
  }
}
```

---

### Snapshot 3 - 15:14:30

**Trading Status:**
```json
{
  "isRunning": true,
  "tickCount": null,
  "tradeCount": null,
  "signalCount": null
}
```

**Scan Diagnostics:**
```json
{
  "survivors_count": null,
  "filterCounts": null,
  "lastScan": null
}
```

**Active Trades:** 0

**REB 2.11A Audit (latest cycle):**
```json
{
  "cycle": 33,
  "mode": "paper",
  "survivorCount": 21,
  "activeBeforeCount": 170,
  "activeAfterCount": 170,
  "alreadyActiveReported": 0,
  "mismatches": {
    "missedPairs": [
      "SHX/USD",
      "KAS/USD",
      "RIZE/USD",
      "TANSSI/USD",
      "FLR/USD",
      "PLUME/USD"
    ],
    "overcountedPairs": []
  }
}
```

---

### Snapshot 4 - 15:16:50

**Trading Status:**
```json
{
  "isRunning": true,
  "tickCount": null,
  "tradeCount": null,
  "signalCount": null
}
```

**Scan Diagnostics:**
```json
{
  "survivors_count": null,
  "filterCounts": null,
  "lastScan": null
}
```

**Active Trades:** 0

**REB 2.11A Audit (latest cycle):**
```json
{
  "cycle": 42,
  "mode": "live",
  "survivorCount": 7,
  "activeBeforeCount": 0,
  "activeAfterCount": 0,
  "alreadyActiveReported": 0,
  "mismatches": {
    "missedPairs": [],
    "overcountedPairs": []
  }
}
```

---

### Snapshot 5 - 15:19:09

**Trading Status:**
```json
{
  "isRunning": true,
  "tickCount": null,
  "tradeCount": null,
  "signalCount": null
}
```

**Scan Diagnostics:**
```json
{
  "survivors_count": null,
  "filterCounts": null,
  "lastScan": null
}
```

**Active Trades:** 0

**REB 2.11A Audit (latest cycle):**
```json
{
  "cycle": 51,
  "mode": "paper",
  "survivorCount": 4,
  "activeBeforeCount": 76,
  "activeAfterCount": 62,
  "alreadyActiveReported": 0,
  "mismatches": {
    "missedPairs": [
      "FWOG/USD",
      "PENGU/USD",
      "SHX/USD",
      "KAS/USD"
    ],
    "overcountedPairs": []
  }
}
```

---

