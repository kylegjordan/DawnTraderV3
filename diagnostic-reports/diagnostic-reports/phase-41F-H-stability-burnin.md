# Phase 41F-H Stability Burn-In Report

**Window:** 2025-11-02T19:35:48Z → 2025-11-02T19:36:50Z  
**Duration:** 60s  
**Polling:** every 15s

## Roll-up
- Total warnings (sum across polls): 4
- Total criticals (sum across polls): 0
- Total recoveries observed (sum across polls): 0
- Max observed broadcast latency: 111 ms
- Peak server memory (RSS): 87 MB

## Pass/Fail Criteria
- Critical anomalies: **0** required
- Warnings: **≤ 3** total across window
- Recoveries: **0** after first 60s warm-up
- Max broadcast latency: **< 100 ms** after warm-up
- Memory: **no monotonic creep** (peak stable within a small band)

