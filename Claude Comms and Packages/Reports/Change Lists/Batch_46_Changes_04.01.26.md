# Batch 46 — Change List

> **Date**: 2026-04-01
> **Commits**: `b518ef43`

## Files Modified

### 1. `server/services/fx5-24h-window.ts`
- Added fs/path imports
- Added FX5_WINDOW_STATE_DIR/FILE constants
- Added persistWindowState(): writes window24hByMode + scanHistoryByMode to JSON every 5 min
- Added rehydrateWindowState(): reads file, filters to 24h/1h rolling windows, restores Maps
- Auto-rehydrate on module load, auto-persist via setInterval

### 2. `server/core/governance/regime-stability.ts`
- Added getRegimeHistoryForPersistence(): returns copy of regimeHistory array
- Added restoreRegimeHistory(): filters to 7-day window, replaces array, sets cachedStability=null

### 3. `server/services/telemetry-aggregator.ts`
- Added fs/path imports
- Added persistTelemetryState(): writes cascadeHistory + poolAggregates (NOT pairTelemetry)
- Added rehydrateTelemetryState(): restores cascadeHistory, restores ALL poolAggregates entries, sets rehydrated flag
- Singleton-safe timer guard (telemetryPersistTimer)
- Rehydrate called in getTelemetryAggregator() after flushStaleTelemetry()

### 4. `server/services/vts-runner.ts`
- Added import for governance-persistence.ts (triggers auto-load/rehydrate)

## Files Created
- `server/core/governance/governance-persistence.ts` — central persist/rehydrate for governance state
- `Claude Comms and Packages/Scope Files/BATCH_46_SCOPE.md`
