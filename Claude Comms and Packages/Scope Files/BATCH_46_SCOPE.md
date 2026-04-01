# Batch 46 Scope: State Persistence & Diagnostic Truth

> **Date**: 2026-04-02
> **Baseline**: Commit `89f8bcb0` (Batch 45 execution integrity)
> **Branch**: migration/aws-supabase
> **System Impact Map**: Reviewed pre-implementation. Components: VTS Runner (7.1, HIGH), fx5-24h-window (3.1, HIGH), Telemetry Aggregator (7.6, MEDIUM), Governance (7.7/7.8, LOW-MEDIUM).

---

## Purpose

5 critical data sets are in-memory only and lost on every PM2 restart. Kyle directive: all metrics must persist to disk. This batch adds persistence and startup rehydration for each, prioritized by impact.

---

## Objectives

### Objective 1: Persist open virtual trades
**File:** `logs/vts_state/open_trades.json`
**Write:** Atomic JSON on every trade open/close.
**Rehydrate:** On startup, read file, validate each trade (required fields, not older than MAX_HOLD 24h), insert into openVirtualTrades Map. Skip expired trades.
**Invariant:** Rehydration must NOT create phantom instant closes from stale prices. Trades older than 24h are dropped, not resolved.

### Objective 2: Persist fx5-24h-window state
**File:** `logs/fx5_state/window_24h.json`
**Write:** Every 5 minutes (not every cycle — avoid I/O churn). Contains paper+live scan entries and scan timestamps.
**Rehydrate:** On startup, read file, filter both arrays by time window (24h for scan entries, 1h for timestamps). Drop stale entries.
**Invariant:** Rehydrated data must be trimmed to true rolling window, not appended wholesale.

### Objective 3: Persist governance counters + regime stability
**File:** `logs/governance_state/governance_state.json`
**Write:** Every 60 seconds. Contains governanceStats, learningStats, deferredUpdates, modeStats, preScoreExclusions, regimeHistory, cachedStability.
**Rehydrate:** On startup, read file. Restore regimeHistory (filter to 7-day window). Restore deferredUpdates as-is (they are intentionally retained). Reset modeStats.lastHour to 0 (hourly timer restarts). Set cachedStability to null (recomputed next cycle). Do NOT restore currentCycleId.
**Invariant:** Stale governance counters must not block legitimate updates. regimeHistory is the critical piece — drives 7-day flip rate for stability classification.

### Objective 4: Persist telemetry aggregates
**File:** `logs/telemetry_state/aggregator_state.json`
**Write:** Every 60 seconds. Contains cascadeHistory and poolAggregates only. pairTelemetry is already DB-backed — do NOT double-persist.
**Rehydrate:** On startup, read file, filter cascadeHistory by history window. Restore poolAggregates directly. Set rehydrated flag.
**Invariant:** No new telemetry writers (M70). No duplicate aggregate ingestion. pairTelemetry NOT file-persisted.

---

## Files Affected

| File | Change Type |
|------|------------|
| `server/services/vts-runner.ts` | Add persist/rehydrate for openVirtualTrades |
| `server/services/fx5-24h-window.ts` | Add persist/rehydrate for window24h + scanHistory |
| `server/core/governance/governance-engine.ts` | Add persist wrapper for all governance state |
| `server/core/governance/learning-cooldown.ts` | Export state for persistence |
| `server/core/governance/strategy-modes.ts` | Export state for persistence |
| `server/core/governance/strategy-eligibility.ts` | Export state for persistence |
| `server/core/governance/regime-stability.ts` | Add persist/rehydrate for regimeHistory |
| `server/services/telemetry-aggregator.ts` | Add persist/rehydrate for cascadeHistory + poolAggregates |

---

## Verification Targets

### V1: Open trades survive restart
- Open a trade, verify in UI, restart PM2, verify trade still shows in Open Trades table.

### V2: Pipeline Summary survives restart
- Accumulate 24h data, verify in Pipeline Summary, restart, verify data persists.

### V3: Governance state survives restart
- Verify regimeHistory has entries, restart, verify stability classification is not reset to false-STABLE.

### V4: Telemetry aggregates survive restart
- Verify poolAggregates have non-zero samples, restart, verify they persist.

### V5: No double-counting or phantom artifacts
- After restart, no duplicate 24h entries, no phantom trade closes, no stale governance blocking.
