# Batches 36-39 Combined Completion Report

**Date**: 2026-03-27
**Phase**: 14.6 — Filter Diagnostics Data Truth + Family-Qualified Identity
**Branch**: dawntrader-v4
**Reviewed by**: Langston (all 4 batches approved and closed)

---

## Batch 36 — Diagnostics Correctness Fixes

**Commit**: `4cbe062b`
**Files changed**: `server/services/vts-runner.ts`, `server/services/fx5-scanner.ts`

### Changes
1. Added `sourcePool: trade.sourcePool` to `closedTradeRecord` object — closed trades now preserve sourcePool for UI display
2. Fixed `pairsFailedDiAllFamilies` to use `.length` — was passing array instead of count
3. Added `failedDI: 0` to `aggQuantImf` initialization and aggregation — quant DI now shows in 24h rolling metrics

### Verification
- Server restart clean, no TypeScript errors
- Langston approved after code review

---

## Batch 37 — Source Pool Family-Qualified Identity Model

**Commit**: `715b6a82` (initial), `a48b2637` (hotfix — ReferenceError fix for `destinationCount`)
**Files changed**: 13 files across server and client

### Changes
1. **SourcePool type expansion** — added `quant-trend`, `quant-reversal`, `quant-breakout`, `quant-oscillation`
2. **FX5 family-qualified emission** — builds `symbolFamilyMap` from `familyPoolSurvivors`, emits one tagged entry per surviving family
3. **VTS runner migration** — `isQuantPool()` helper, all `=== 'quant'` checks migrated
4. **Active filter pool** — temporary `quant-trend` for cold-start (documented as tech debt)
5. **Signal orchestrator** — `?? 'quant'` fallback removed
6. **RTB service** — type widened, fallback removed
7. **SQE** — type widened
8. **VTS route** — `startsWith('quant')` check
9. **Client badge logic** — `startsWith('quant')` for color coding
10. **Trade history + active trades** — type widened for display

### Reconciliation Proof (Langston requirement)
- Trend: 48 survivors
- Reversal: 31 survivors
- Breakout: 51 survivors
- Oscillator: 30 survivors
- **Total family sum: 160** (later scan: 178)
- **Quant total: 160** (later: 178)
- **quant_equals_family_sum: true** — exact match confirmed

### Langston Review
- Approved with conditions (all met):
  - Reconciliation proof: exact match
  - Persistence proof: API returns `quant-trend` values
  - UI proof: badge displays family-qualified values
  - Fallback proof: cold-start `quant-trend` documented as temp debt
  - No hidden generic `quant` writes confirmed
  - Pattern path unchanged

---

## Batch 38 — 3-Layer Null Taxonomy + Signals Rejected Counter Fix

**Commit**: `d8dcd448`
**Files changed**: `server/services/vts-runner.ts`, `client/src/pages/machine-learning.tsx`

### Changes
1. **Signals rejected counter fix** — counter increment block inserted before `return null` at the netEV rejection point in `generatePhase10Signal`
2. **3-layer null reason display** — replaced flat null reason table with 3-section layout:
   - **Setup Nulls (A-F)**: Data/Context, Price Location/Structure, Momentum/Trend Quality, Volatility/Noise, Volume/Liquidity, Generic Fallback
   - **Routing/Path Failures**: familyFilterMismatch, noRegimeStrategies
   - **Post-Signal Rejections**: netEvBelowFloor, adxGuard, maxOpenTrades

### Verification
- Server clean boot, no errors
- Langston approved

---

## Batch 39 — Pipeline Summary Table + Label Polish

**Commit**: `892d7f24`
**Files changed**: `client/src/pages/machine-learning.tsx`, `server/services/fx5-scanner.ts`

### Changes
1. **Pipeline Summary Table** — new table at top of Filter Diagnostics showing full pipeline flow:
   - Pairs Scanned (unique symbols)
   - Global Survivors (passed correlation + spread)
   - Quant IMF Survivors (passed LQ + VN + DI)
   - Pattern IMF Survivors (passed pattern thresholds)
   - Destination (total entering VTS evaluation, counting basis: family-qualified entries)
2. **Family label polish** — consistent casing and display
3. **Counting basis labels** — each metric row labeled with what it counts (unique symbols, family-qualified entries, etc.)

### Verification
- Pipeline Summary Table renders with data:
  - 172 pairs scanned → 46 global survivors → 145 quant IMF (family-qualified) → 37 pattern → 172 destination
- Langston approved and closed

---

## Outstanding Deferred Items
- **#16**: Pattern source pool investigation — pattern signals generated but no pattern-sourced simulated trades appear
- **#11**: LQ strict threshold review — currently failedLQ = 0 across all paths (resolved by market conditions)
- **#15**: Governance backlog for Batches 25-35 completion reports (partial — some exist)

---

## Governance Updates (this batch)
- CCPI: Last Updated, Last Commit, Next Step, Note sections updated
- PHASE_HISTORY: Phase 14.6 expanded to include Batches 23-39, marked COMPLETE
- BATCH_CATALOG: Batches 36-39 rows added with commit hashes and descriptions
- SYSTEM_IMPACT_MAP: Pattern Filter Profile entry updated for family-qualified sourcePool
- MEMORY.md: Updated with current state
