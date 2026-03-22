# Directive 12.2.2: Wave 1.5 — MarketScanner Class Removal

**Status**: COMPLETE
**Date Issued**: 2026-02-27
**Date Complete**: 2026-02-27
**Batch**: 9 (combined with Directive 12.2.9)
**Commit**: `8b6bb540`

---

## Problem

The `MarketScanner` class in `server/services/market-scanner.ts` was a legacy 10-minute scanner that ran in parallel with the modern FX5 30-second scanner (BUG-009). This caused:
- **Double Kraken API load** — both scanners calling getTicker/getOHLCData independently
- **Conflicting signal generation** — MarketScanner used direct StrategyEngine calls (8 strategies) vs FX5's Signal Orchestrator pipeline (17 strategies)
- **Conflicting cleanup operations** — MarketScanner had its own expire/clean/archive routines
- **Wasted computation** — 10-minute cycles evaluating pairs FX5 already scans every 30 seconds

The same `market-scanner.ts` file also hosted `collectAdaptiveBatch()` — a standalone exported function actively used by FX5Scanner — plus diagnostic buffer functions served via API routes. These had to be preserved.

## What Was Removed

### MarketScanner Class (~637 lines)
- `server/services/market-scanner.ts`: Lines 377-1009 deleted (class definition + LEGACY comment block). File reduced from 1,363 to 726 lines.
- 4 class-only imports removed: `StrategyEngine`, `WatchlistPair`, `strategyAlerts`, `PaperSimDiagnosticService`

### Consuming File Cleanup (5 files)

| File | Change |
|------|--------|
| `server/routes.ts` | Removed `MarketScanner` from import (line 12), deleted `const marketScanner = new MarketScanner()` (line 80), deleted `startHourlyScanning()` call block (lines 366-370), deleted `/api/market/overview` route handler (lines 4636-4645) |
| `server/services/market-scan-task.ts` | Removed dead `MarketScanner` import + instantiation (lines 40-45). The `scanner` variable was created but never used. |
| `server/startup.ts` | Removed `services.push('MarketScanner')` + comment (lines 35-36), removed `'MarketScanner'` from health check array (line 57) |
| `server/routes/status.ts` | Removed `'MarketScanner'` from health services array (line 56) |
| `client/src/App.tsx` | *(Covered by Directive 12.2.9 — stale History import)* |

## What Was Preserved

- `collectAdaptiveBatch()` function (standalone export, used by FX5Scanner)
- `BatchResult` interface and related types
- All diagnostic buffer functions (getPassiveLearningBuffer, getREB211DriftBuffer, etc.)
- All imports used by the preserved functions (KrakenService, storage, activeFilterPool, getAdaptiveScanManager, SCANNER_PARAMS, setCostMetrics)

## Bugs Resolved

- **BUG-009** (Two Parallel Scanning Systems Running Simultaneously) — **RESOLVED**. MarketScanner class removed. Only FX5 Scanner runs now. Kraken API load halved. Signal generation conflict eliminated.

## Verification

- Zero `MarketScanner` references in any of the 5 cleaned files
- `collectAdaptiveBatch` confirmed present at line 448 of market-scanner.ts
- All diagnostic buffer imports confirmed intact in routes.ts
- Build compiles without errors
- Test baseline unchanged: 800/81 (881 total)

## Total Impact

~637 lines of legacy class code removed + ~20 lines of consuming references = ~657 lines total.
