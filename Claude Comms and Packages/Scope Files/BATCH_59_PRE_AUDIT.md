# Batch 59 Pre-Implementation Audit — Phase 15a: UI Audit & Data Path Fixes

> **Author**: Claude Code (Lead Architect)
> **Date**: 2026-04-12
> **Scope Reference**: BATCH_59_SCOPE.md
> **SYSTEM_IMPACT_MAP reviewed**: Yes (Layers 7-9)

---

## Root Cause Analysis — Three Broken Data Paths

### 1. REGIME ARCHIVE: 0% Win Rate Despite 459 Closed VTS Trades

**Root cause: Field name mismatch in telemetry aggregator.**

The data path has 4 stages. Stage 2 is broken:

| Stage | Component | Status | File |
|-------|-----------|--------|------|
| 1. VTS trade closure | `vts-service.ts` persists trades with field `netProfit` (decimal, e.g., 0.02 = 2%) | WORKING | `server/services/vts-service.ts:758,794` |
| 2. Telemetry aggregation | `vts-telemetry.ts` reads trades but looks for `netProfitPercent`, `pnlPercent`, or `profitPct` — NOT `netProfit` | **BROKEN** | `server/core/logging/vts-telemetry.ts:148` |
| 3. Telemetry output | Writes `winRate=0, avgPnL=0` for all trades because profit field always resolves to 0 | BROKEN (downstream) | `logs/telemetry/regime_performance_*.json` |
| 4. Archival | Reads zeroed telemetry, writes zeroed archive records | BROKEN (downstream) | `server/scripts/archive-regime-metrics.ts:222-243` |

**The broken line** (`vts-telemetry.ts:148`):
```typescript
// CURRENT (broken) — falls through to ?? 0 because netProfit is not in the list:
const netProfitPercent = Number(t.netProfitPercent ?? t.pnlPercent ?? t.profitPct ?? 0);

// FIX — add netProfit with decimal-to-percent conversion:
const netProfitPercent = Number(
  t.netProfitPercent ?? t.pnlPercent ?? t.profitPct ?? 
  (t.netProfit !== undefined ? t.netProfit * 100 : 0)
);
```

**Proof the trades ARE being read**: The telemetry file `regime_performance_2026-01-22_VTS_449.json` shows `tradeCount: 100` for BULL_STABLE/sma_trend_ride — it reads 449 trades but assigns 0 profit to all of them.

**Additional issue**: The last telemetry aggregation ran on 2026-01-22 — over 2 months ago. The autonomy scheduler (`server/services/autonomy-scheduler.ts:528`) is supposed to run every 6 hours. Need to verify the scheduler is active.

**Impact (SYSTEM_IMPACT_MAP)**: Layer 7.3 (Regime Archive) — LOW blast radius. Fix is isolated to the telemetry reader field mapping. No downstream consumers are affected because the archive data was already zeros.

---

### 2. MAPPING DRIFT: Sync Stuck at 2026-03-05, Only 9/30 Samples

**Root cause: Three separate issues.**

**Issue A — Hard-coded "Last Sync" timestamp:**
The "Last Sync: 2026-03-05" shown in the UI comes from `CANONICAL_SCHEMA_METADATA.updatedAt` in `server/config/canonical-regime-strategy-map.ts:38`, which is hard-coded to `'2026-03-05T00:00:00Z'` and never refreshed. The sync script (`server/scripts/sync-canonical-bridge.ts:68`) copies this value into the bridge JSON file without updating it. Only `generatedAt` gets a fresh timestamp.

**Issue B — No automatic sync scheduler:**
There is no `mappingDriftSyncTask` or `canonicalBridgeSyncTask` in the server startup scheduler registry (`server/index.ts:375-522`). The canonical bridge sync only runs manually via the "Force Sync Canonical" button (`POST /api/system/force-sync-canonical`).

**Issue C — Insufficient samples (9/30):**
A "sample" requires a pair with recent telemetry entry (within 24h rolling window), assigned pairRegime + strategy, AND both volZHistory and trendZHistory populated. Only 9 pairs currently meet all criteria. The telemetry auto-prunes entries older than the history window, and VTS hasn't populated Z-score histories on 30+ pairs recently.

**Fix plan:**
- A: Update `sync-canonical-bridge.ts` to use `new Date().toISOString()` for `updatedAt` instead of the hard-coded metadata value
- B: Either add an automatic sync task to the scheduler, or document that manual sync is by design (canonical mapping rarely changes)
- C: Investigate whether the 30-sample minimum is too high, or whether VTS Z-score population needs to be more aggressive. The drift calculator (`server/core/analytics/mapping-drift-calculator.ts`) and telemetry aggregator (`server/services/telemetry-aggregator.ts:434-607`) are structurally sound — they just need more data.

**Impact (SYSTEM_IMPACT_MAP)**: Not currently in the impact map (governance gap flagged in B53 #35). Mapping Drift is a Layer 7 diagnostic — no downstream consumers depend on its output. Fix is low risk.

---

### 3. PREDICTIVE DIAGNOSTICS TAB: All Values Are Hardcoded Defaults

**Root cause: Service initialized with seed values, never fed real data.**

The `PredictiveDiagnosticsService` (`server/services/predictive-diagnostics.service.ts`) has methods to receive real data (`recordDecision()`, `recordFilterResult()`, `updateModelDiagnostics()`, `recordPredictionOutcome()`) but **none of these are called from production code**. They are only called in the test file.

| UI Value | Actual Source | Evidence |
|----------|--------------|---------|
| 82% 7-Day Accuracy | Hardcoded default `accuracy7d: 0.82` at line 107 | Constructor `initializeDefaultState()` |
| 78% Mean Confidence | Hardcoded default `meanConfidence: 0.78` at line 106 | Constructor |
| 0.120 Calibration Drift | Hardcoded default `calibrationDrift: 0.12` at line 105 | Constructor |
| Weight Contributions (33/29/22/16%) | Hardcoded defaults at lines 108-112 | Constructor |
| All filters = PASS | Hardcoded defaults at lines 96-101 | Constructor |
| Signals Processed: 0 | Never incremented — `recordDecision()` never called | Line 83, no call sites |
| Pass Rate: 0.0% | Computed from 0 signals | Line 251 |
| 50 Decision Traceback entries | NOT from this service — likely from a different API or frontend mock | `recentDecisions` array always empty in this service |

**Fix plan:**
- Option A (minimal): Add clear "PLACEHOLDER — Awaiting real data integration" labels to the UI for values that are defaults
- Option B (full wire): Add `recordDecision()` and `recordFilterResult()` calls in the VTS pipeline and signal orchestrator. This is more invasive and may be better suited for B60 when the Policy Engine needs real diagnostics.
- **Recommended**: Option A for B59 (honest labeling), Option B deferred to B60

**The 50 Decision Traceback entries**: These appear to come from a different data source — possibly the VTS pre-execution evaluation path. Need to trace the frontend component to confirm.

**Impact (SYSTEM_IMPACT_MAP)**: Layer 8.1 (Predictive Adjustments) — MEDIUM blast radius. But this fix is labeling only (Option A), not behavioral. No risk.

---

## SYSTEM_IMPACT_MAP Review for B59

### Components Affected

| Component | Layer | Blast Radius | Change Type | Risk |
|-----------|-------|-------------|-------------|------|
| VTS Telemetry Aggregator | 7.2 | MEDIUM | Fix field name mapping | LOW — isolated field lookup |
| Regime Archive | 7.3 | LOW | Downstream beneficiary of telemetry fix | NONE — no code changes |
| Regime Archive Scheduler | 7.3 | LOW | Verify scheduler is active | LOW — diagnosis only |
| Canonical Bridge Sync Script | 9.x | LOW | Fix updatedAt timestamp | LOW — metadata only |
| Canonical Regime Strategy Map | 5.1 | HIGH (if changed) | Metadata timestamp only — NOT changing mappings | LOW |
| Telemetry Aggregator (drift) | 7.2 | MEDIUM | Verify sample collection | LOW — diagnosis only |
| Predictive Diagnostics Service | 8.1 | MEDIUM | Add placeholder labels | LOW — UI labeling only |
| Analytics UI (multiple tabs) | Frontend | LOW | Display updates | LOW |
| Machine Learning UI (Regime Archive) | Frontend | LOW | Display updates | LOW |

### Upstream Dependencies (what feeds INTO our changed components)
- VTS Runner → VTS Service → trade logs → **VTS Telemetry** (our fix point)
- VTS Telemetry → Regime Archiver (downstream beneficiary)
- Canonical Map config → Sync Script → Bridge JSON → UI (our timestamp fix)

### Downstream Consumers (what reads FROM our changed components)
- Regime Archive API → Machine Learning UI tab (will show real data after fix)
- Mapping Drift API → Analytics UI tab (will show current sync date)
- Predictive Diagnostics API → Analytics UI tab (will show honest labels)
- **B60 Evidence Collector** — will consume regime archive data. B59 fix is prerequisite.

### Shared State Risks
- VTS telemetry files in `logs/telemetry/` are read by both the archiver and the drift calculator. Fix to field mapping is safe — it only changes how profit is extracted, not the file format.
- Canonical bridge JSON in `bridge/canonical/` is read by multiple consumers. Only changing metadata timestamp, not the mapping content.

### Background Execution Risks
- Archival scheduler runs weekly (Sunday 00:45 UTC). Fix will take effect on next scheduled run.
- Autonomy scheduler runs telemetry aggregation every 6 hours. Need to verify it's actually running.

---

## Implementation Plan

### Phase 1: Regime Archive Fix (Objective 1)
1. **Diagnose scheduler FIRST** (per prior CC review — reordered): Check if autonomy scheduler is running telemetry aggregation. Last aggregation was 2026-01-22 — 3 months stale. If scheduler is dead, the field fix alone won't produce fresh data. We need both the fix AND a working scheduler.
2. Fix `vts-telemetry.ts:148` field name mapping — add `netProfit` with decimal-to-percent conversion
3. Verify negative `netProfit` values are handled correctly downstream — confirm `winRate` calculation treats negative netProfitPercent as a loss (mathematically fine, but explicit verification needed per prior CC review)
4. **Trigger manual re-aggregation immediately after deploy** (per Langston recommendation #738) — do NOT wait for the 6h scheduler cycle
5. Verify archive API returns non-zero metrics
6. Verify UI tab displays real win rates and P&L

### Phase 2: Mapping Drift Fix (Objective 2)
1. Fix `sync-canonical-bridge.ts` to use `new Date().toISOString()` for updatedAt
2. Add automatic sync task to server scheduler (per Langston recommendation)
3. **Lower MIN_SAMPLES from 30 to 10** (per prior CC review — pragmatic fix). The original 30 was set without considering how slowly VTS populates Z-score histories. 9/10 is achievable immediately vs 9/30 which may never be met. Document the rationale in code comment.
4. Trigger force sync and verify UI shows current date and drift calculation runs

### Phase 3: Predictive Tab Labeling (Objective 3)
1. **Trace Decision Traceback source BEFORE implementation** (per prior CC review — must know the source before deciding labeling approach). Determine if the 50 entries come from frontend mocks, a different API endpoint, or the VTS pre-execution path. This changes what gets labeled.
2. Add "Placeholder — Awaiting real data integration" labels to hardcoded default values (82% accuracy, 78% confidence, 0.120 drift, weight contributions, filter states)
3. Document which values are real vs placeholder

### Phase 4: Assessment Objectives (Objectives 4-5)
1. **Events tab assessment** (Objective 1.4) — confirm regime transition events are accurately captured. Based on UI audit: working correctly (50 events, 7-day retention, real regime transitions). Document findings.
2. **Predictive Adjustments scheduler behavior audit** (Objective 1.5) — audit whether the ML Calibration Scheduler produces meaningful, varied recommendations or just repeats the same 4 pattern weight bumps. Document findings and recommendation for B60.
3. Governance tab dual-path assessment — document gap, flag for B60

### Phase 5: Governance (Objective 6)
1. Update all Tier 1+2 docs
2. Write change list to `Claude Comms and Packages/Reports/Change Lists/B59_CHANGE_LIST.md`
3. Share change list with Langston for code-level review
4. Write completion report after Langston review

---

## Prior CC Session Review (2026-04-12)

Six items raised, all addressed:

| # | Feedback | Resolution |
|---|----------|-----------|
| P1 | Verify negative netProfit handled correctly in winRate calculation | Added as Phase 1 step 3 |
| P2 | Scheduler diagnosis should be step 1, not step 2 | Reordered — scheduler check is now first |
| P3 | Lower MIN_SAMPLES from 30 to 10 | Added as Phase 2 step 3 with documented rationale |
| P4 | Trace Decision Traceback source BEFORE implementation | Moved to Phase 3 step 1 (before labeling) |
| P5 | Missing Events tab and Predictive Adjustments tab assessments | Added as Phase 4 steps 1-2 |
| P6 | Langston's manual re-aggregation recommendation should be explicit post-deploy step | Added as Phase 1 step 4 |

---

## Pre-Audit Conclusion

**B59 is safe to implement.** The three fixes are:
1. A field name mapping fix (one line in vts-telemetry.ts) + scheduler verification
2. A metadata timestamp fix + auto sync task + MIN_SAMPLES reduction (sync-canonical-bridge.ts + telemetry-aggregator.ts)
3. UI labeling (frontend display changes) after tracing Decision Traceback source

None of these affect trading logic, signal generation, or execution paths. The blast radius is contained to diagnostic/telemetry layers. Implementation order: diagnose scheduler first, then apply fixes, then manual re-aggregation, then verify.

**Langston review**: Approved (2026-04-12). Recommended manual re-aggregation, automatic sync task, Option A placeholder labeling.
**Prior CC session review**: Approved with 6 refinements (all incorporated above).
