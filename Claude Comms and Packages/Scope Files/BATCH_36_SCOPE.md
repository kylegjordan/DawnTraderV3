# Batch 36 Scope — Diagnostics Correctness Fixes

**Phase:** 14.6
**Type:** Bug fixes / correctness
**Files Modified:** `server/services/vts-runner.ts`, `server/services/fx5-scanner.ts`, `client/src/pages/machine-learning.tsx`

## Objective
Establish diagnostic truthfulness before any architecture changes. All fixes ensure Filter Diagnostics reports actual values, not dashes or zeros where data exists.

## Changes

### 1. sourcePool missing from closed trade records (vts-runner.ts)
- **Root cause:** closedTradeRecord copies 20+ fields from open trade but omits sourcePool
- **Fix:** Add `sourcePool: trade.sourcePool` to closedTradeRecord object
- **Impact:** Pattern-sourced trades will now retain their origin in closed trade tables

### 2. Quant DI value stored as array instead of number (fx5-scanner.ts)
- **Root cause:** `pairsFailedDiAllFamilies` is result of `.filter()` (array), assigned directly where number expected
- **Fix:** Change to `pairsFailedDiAllFamilies.length`
- **Impact:** Quant DI will show actual count instead of NaN/object

### 3. Quant DI not aggregated in 24h rolling (fx5-scanner.ts)
- **Root cause:** aggQuantImf initialization missing failedDI field; aggregation loop doesn't sum it
- **Fix:** Add failedDI to init object and aggregation loop
- **Impact:** 24h rolling DI values will include quant path

### 4. Last Scan DI row shows dash for quant (machine-learning.tsx)
- **Root cause:** DI row only rendered when pattern.imf exists, quant column hardcoded to dash
- **Fix:** Always render DI row, show actual quant.imf.failedDI value
- **Impact:** Operators see quant DI failures in last scan view

### 5. Signals Rejected shows dash instead of quant/pattern breakdown (machine-learning.tsx)
- **Root cause:** UI uses colSpan={2} with dash for quant+pattern columns, only shows total
- **Fix:** Show quantSignalsRejected, patternSignalsRejected, and total signalsRejected separately
- **Impact:** Signals rejected breakdown visible per pool

### 6. By-strategy counting gap label clarification (machine-learning.tsx)
- **Root cause:** Label claims categories should sum to total, but pair-level skips (maxOpenTrades, regimeNoStrategies) are counted before strategy evaluation
- **Fix:** Update label to explain the gap source
- **Impact:** Operators understand why by-strategy total differs from top-level total

## Desired Outcomes (verification checklist)
1. Closed VTS trades show correct sourcePool (quant or pattern) in trade tables
2. Quant DI shows actual number in both last scan and 24h rolling views
3. DI family rollup reconciles (family DI counts sum correctly)
4. Signals Rejected shows quant/pattern/total breakdown
5. By-strategy gap is explained in the UI label
6. Pattern-sourced trades appear in simulated trade tables (if pattern signals are being generated)

## Langston Verification Gates (agreed)
- Pattern-sourced simulated trades actually appear if pattern signals are being generated
- Quant pattern detection no longer shows dash
- Signals Rejected summary reconciles to rejection reason totals
- Quant DI no longer shows dash
- DI family rollup reconciles
- By-strategy null totals reconcile or any intentional non-strategy bucket is explicitly explained
