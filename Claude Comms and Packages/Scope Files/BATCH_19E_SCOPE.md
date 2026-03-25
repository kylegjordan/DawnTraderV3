# Batch 19E — VTS Pattern Pool Integration + sourcePool Persistence

**Phase**: 14.5 Extension (deferred item)
**Type**: Code batch
**Branch**: dawntrader-v4
**Parent commit**: 5c44b035
**Date**: 2026-03-18

---

## Intent

Phase 14.5 added dual-path pattern scanning to the **active trading path** (signal orchestrator), but the **VTS simulator** was deferred and still only processes quant pool (ideal pool) pairs. This batch closes that gap:

1. VTS processes pattern pool pairs alongside quant pool pairs
2. `sourcePool` metadata persists end-to-end — from signal creation through database storage to UI display
3. Both open and closed simulated trade tables show a `sourcePool` column

This validates Phase 14.5 end-to-end: if pattern scanning works, we should see simulated pattern trades appearing in the VTS output.

---

## Design Decisions (Locked)

- Merit-based ranking (no hard caps) — carried from Batch 19
- VTS uses existing regime → strategy mapping for all pairs (quant and pattern). No new strategy filtering logic. The regime determines which strategies run — same as today. The key difference from the live path: there is NO SQE gate in VTS. If a strategy produces a signal, it becomes a simulated trade regardless of FinalScore. The only new addition is the `sourcePool` tag on the trade record.
- `sourcePool` values: `'quant'` | `'pattern'` (extend to `'xstock'` in Phase 14.6)
- Same SQE quality floor differentiation: 0.35 quant, 0.45 pattern
- No new math or OHLC fetching in MCE

---

## Changes

### 1. VTS Runner — Pattern Pool Processing
**File**: `server/services/vts-runner.ts`

**1a. Pair sourcing (lines 887-945)**
- After fetching ideal pool via `getIdealPoolPairs()`, also fetch pattern pool via `activeFilterPool.getPatternPool(this.mode)`
- Process pattern pool pairs in a separate loop after the quant loop
- Set `sourcePool: 'pattern'` on all pattern pool trade records

**1b. Strategy evaluation — uses existing regime → strategy mapping (no new filtering)**
- Pattern pool pairs get their regime computed, then the regime-assigned strategies run — same as quant pairs
- VTS has NO SQE gate: if a strategy produces a signal, it becomes a simulated trade regardless of FinalScore
- This is existing VTS behavior — we are not adding or removing any filtering logic
- The only new addition is the `sourcePool` tag so we can analyze performance by pool origin

**1c. Metadata on trade records (lines 1096-1102, 1352-1361)**
- Add `sourcePool: 'quant' | 'pattern'` to `Phase10TradeRecord` interface
- Set `sourcePool: 'quant'` for ideal pool pairs
- Set `sourcePool: 'pattern'` for pattern pool pairs
- Include `sourcePool` in telemetry logging

### 2. Database Schema — Add sourcePool Column
**File**: `shared/schema.ts`

**2a. paper_sim_trades table (lines 1749-1793)**
- Add column: `sourcePool varchar(20)` (nullable, default null for existing records)

**2b. paper_sim_open_positions table (lines 1796-1829)**
- Add column: `sourcePool varchar(20)` (nullable, default null for existing records)

### 3. Storage Layer — Persist sourcePool
**File**: `server/storage.ts`

**3a. Trade creation (closed trades)**
- When closing a position and inserting into `paper_sim_trades`, copy `sourcePool` from the open position record or from signal metadata

**3b. Position creation (open trades)**
- When creating a new `paper_sim_open_positions` record, set `sourcePool` from the signal's metadata (already available in RTB signal)

### 4. API Routes — Include sourcePool in Response
**File**: `server/routes.ts`

**4a. GET /api/paper-sim/trades (lines 10233-10305)**
- Include `sourcePool` in the SELECT fields returned to the frontend
- Add optional `sourcePool` query parameter for filtering (All / Quant / Pattern)

**4b. GET /api/paper-sim/active-trades**
- Include `sourcePool` in the active trade response

### 5. Frontend — Open Simulated Trades Table
**File**: `client/src/components/trading/active-trades-v2.tsx`

**5a. ActiveTrade interface**
- Add `sourcePool?: 'quant' | 'pattern'` field

**5b. Table column**
- Add "Source Pool" column after the "Strategy" column
- Display as colored badge: QUANT (blue) / PATTERN (purple)
- Null/missing values display as "—"

### 6. Frontend — Closed Simulated Trades Table
**File**: `client/src/components/trading/trade-history-tab.tsx`

**6a. Trade interface**
- Add `sourcePool?: 'quant' | 'pattern'` field

**6b. Table column**
- Add "Source Pool" column after the "Strategy" column
- Same badge styling as open trades table
- Add sourcePool to the filter dropdown options (All / Quant / Pattern)

---

## Files Modified (8 total)

| # | File | Change Type | Description |
|---|------|-------------|-------------|
| 1 | `server/services/vts-runner.ts` | Surgical edit | Add pattern pool sourcing + sourcePool metadata (no strategy filtering) |
| 2 | `shared/schema.ts` | Surgical edit | Add sourcePool column to 2 tables |
| 3 | `server/storage.ts` | Surgical edit | Persist sourcePool on trade create/close |
| 4 | `server/routes.ts` | Surgical edit | Include sourcePool in API responses + filter param |
| 5 | `client/src/components/trading/active-trades-v2.tsx` | Surgical edit | Add sourcePool column + badge |
| 6 | `client/src/components/trading/trade-history-tab.tsx` | Surgical edit | Add sourcePool column + badge + filter |
| 7 | `server/services/active-filter-pool.ts` | No change | Already has sourcePool (verify only) |
| 8 | `server/config/pattern-filter-profile.ts` | No change | SourcePool type already defined (verify only) |

---

## What This Does NOT Change

- Signal orchestrator (already handles pattern pool — Batch 19)
- MCE (no new math, no new OHLC)
- SQE (quality floors already differentiated)
- RTB queue (already stores sourcePool in metadata)
- rankingScore formula (untouched)
- Active filter pool (already tracks sourcePool)
- FX5 Scanner (already produces pattern pool — Batch 19)

---

## Verification Criteria

1. VTS runner fetches pattern pool pairs alongside quant pool pairs
2. Pattern pool pairs use existing regime → strategy mapping (no new filtering logic, no SQE in VTS)
3. Simulated trades include `sourcePool` in their records
4. Database has `sourcePool` column in both tables
5. API returns `sourcePool` in trade responses
6. Open simulated trades table shows Source Pool column with colored badges
7. Closed simulated trades table shows Source Pool column with colored badges + filter
8. Existing trades (no sourcePool) display gracefully as "—"
9. Test suite passes (no regressions)

---

## Commit Message
```
Batch 19E: VTS pattern pool integration + sourcePool end-to-end persistence
```
