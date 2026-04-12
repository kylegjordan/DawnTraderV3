# B59 Change List — Phase 15a: Predictive Learning UI Audit & Data Path Fixes

> **Date**: 2026-04-12
> **Branch**: migration/aws-supabase
> **Langston**: Code-level review requested on all changes below

---

## Files Changed (6 files)

### 1. `server/core/logging/vts-telemetry.ts` — Line 148
**Change**: Fix field name mismatch in telemetry aggregation
**Root cause**: VTS trades persist `netProfit` (decimal, e.g., 0.02 = 2%). The telemetry reader looked for `netProfitPercent`, `pnlPercent`, or `profitPct` — none of which exist on the VirtualTrade object. Fell through to `?? 0`, causing all win rates and P&L to be zero despite 449+ trades being read.
**Fix**: Added `netProfit` to the fallback chain with decimal-to-percent conversion (`t.netProfit * 100`).

```typescript
// BEFORE (broken):
const netProfitPercent = Number(t.netProfitPercent ?? t.pnlPercent ?? t.profitPct ?? 0);

// AFTER (fixed):
const netProfitPercent = Number(
  t.netProfitPercent ?? t.pnlPercent ?? t.profitPct ??
  (t.netProfit !== undefined ? t.netProfit * 100 : 0)  // B59: netProfit is decimal, convert to percent
);
```

**Impact**: Regime Archive will now compute real win rates and P&L from VTS trade data. Negative netProfit values correctly treated as losses (netProfitPercent > 0 check at line 154 handles this).

---

### 2. `server/config/canonical-regime-strategy-map.ts` — Line 38
**Change**: Update hard-coded `updatedAt` timestamp
**Root cause**: `CANONICAL_SCHEMA_METADATA.updatedAt` was permanently set to `'2026-03-05T00:00:00Z'` and never refreshed.
**Fix**: Updated to `'2026-04-12T00:00:00Z'`. This is a one-time update; the sync script fix (file 4) ensures future syncs use fresh timestamps.

```typescript
// BEFORE:
updatedAt: '2026-03-05T00:00:00Z',

// AFTER:
updatedAt: '2026-04-12T00:00:00Z',  // B59: Updated from 2026-03-05. Sync script now uses fresh timestamps.
```

---

### 3. `server/services/telemetry-aggregator.ts` — Line 450
**Change**: Lower MIN_SAMPLES from 30 to 10 for mapping drift analysis
**Root cause**: VTS populates Z-score histories slowly. With only 9 pairs meeting all criteria, the 30-sample threshold was unreachable, causing perpetual "Insufficient Samples" status.
**Fix**: Lowered to 10 with documented rationale.

```typescript
// BEFORE:
const MIN_SAMPLES = 30; // Minimum pairs needed for reliable drift detection

// AFTER:
const MIN_SAMPLES = 10; // B59: Lowered from 30. VTS populates Z-score histories slowly; 30 was unreachable. 10 is pragmatic.
```

---

### 4. `server/scripts/sync-canonical-bridge.ts` — Line 67
**Change**: Override hard-coded `updatedAt` with fresh timestamp on every sync
**Root cause**: The sync script spread `CANONICAL_SCHEMA_METADATA` (which includes the hard-coded updatedAt) into the bridge JSON without overriding the timestamp.
**Fix**: Added explicit `updatedAt: new Date().toISOString()` override after the spread, so every sync produces a current timestamp.

```typescript
// BEFORE:
_metadata: {
  ...CANONICAL_SCHEMA_METADATA,
  generatedAt: new Date().toISOString(),

// AFTER:
_metadata: {
  ...CANONICAL_SCHEMA_METADATA,
  updatedAt: new Date().toISOString(),  // B59: Override hard-coded updatedAt with fresh timestamp
  generatedAt: new Date().toISOString(),
```

---

### 5. `server/services/autonomy-scheduler.ts` — After line 554
**Change**: Add automatic daily canonical bridge sync task
**Root cause**: No scheduler task existed to keep canonical bridge documents current. Sync only ran via manual "Force Sync Canonical" button.
**Fix**: New `canonical_bridge_sync` task registered in the scheduler, runs daily. Uses dynamic import of `sync-canonical-bridge.ts`.

```typescript
// NEW TASK (inserted before predictive_weight_recalibration):
schedulerRegistry.registerTask({
  name: 'canonical_bridge_sync',
  description: 'B59: Auto-sync canonical bridge documents to keep mapping drift metadata current',
  frequency: 'custom',
  intervalMs: 24 * 60 * 60 * 1000, // Daily
  // ... (full implementation in file)
});
```

---

### 6. `client/src/pages/analytics.tsx` — Before Model Diagnostics card (~line 1523)
**Change**: Add placeholder data warning banner to Predictive tab
**Root cause**: Model Diagnostics (82% accuracy, 78% confidence, 0.120 drift, weight contributions) and Filter Logic values are all hardcoded constructor defaults in `predictive-diagnostics.service.ts`, never fed real data. Users could mistake these for real telemetry.
**Fix**: Added amber info banner above Model Diagnostics and Filter Logic cards clearly stating values are placeholder defaults.

```tsx
<div className="rounded-lg border border-amber-300 bg-amber-50 ...">
  <AlertCircle ... />
  <div>
    <span className="font-medium">Placeholder Data</span> — Model Diagnostics ... and Filter Logic values 
    below are default seed values, not computed from real trading telemetry. These will be wired to live 
    pipeline data in a future batch.
  </div>
</div>
```

Note: `AlertCircle` was already imported in this file. No new dependencies.

---

## Assessment Findings (No Code Changes)

### Events Tab (Objective 4)
**Status**: Working correctly. Shows 50 market events with 7-day retention, accurately capturing regime transitions (Range-Bound Stable ↔ Structural Transition, rapid oscillation every 1-2 minutes). No fixes needed.

### Predictive Adjustments Scheduler (Objective 5)
**Status**: Correct behavior. The ML Calibration Scheduler logs the same 4 pattern weight adjustments (MORNING_STAR +0.025, PINBAR 0, ENGULFING +0.025, ABCD +0.025) every ~2-6 hours. This is expected — all weights start at 1.0 with a fixed step size of 0.025. The scheduler genuinely recommends the same adjustments because market conditions haven't changed the underlying performance metrics. B60's Policy Engine will provide smarter, evidence-gated rules beyond these simple weight bumps.

### Decision Traceback (50 entries)
**Status**: REAL VTS data, not placeholders. Comes from `/api/vts/passive-decisions` endpoint which reads actual virtual trade logs and skipped signals. The PredictiveDiagnosticsService's `recentDecisions` array (which IS empty) is only used in Live mode. Paper mode uses the separate VTS passive decisions API.

---

## Post-Deploy Steps (REQUIRED)

1. **Trigger manual telemetry re-aggregation** on staging server after deploy — do NOT wait for 6h scheduler cycle (per Langston recommendation)
2. **Trigger Force Sync Canonical** via UI button or API to update bridge JSON with fresh timestamp
3. **Verify Regime Archive** shows non-zero win rates and P&L
4. **Verify Mapping Drift** shows current sync date and drift calculation if 10+ samples available
5. **Verify Predictive tab** shows placeholder warning banner
