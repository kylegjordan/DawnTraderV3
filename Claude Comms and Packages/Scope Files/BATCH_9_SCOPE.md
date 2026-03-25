# Batch 9 Scope — Directives 12.2.9 + 12.2.2

**Date**: 2026-02-27
**Directives**: 12.2.9 (Wave 9: Frontend Dead Code) + 12.2.2 (Wave 1.5: MarketScanner Class Removal)
**Baseline Commit**: `8e6e18aa` (Batch 8B governance)
**Test Baseline**: 800 pass / 81 fail (881 total)

---

## Directive 12.2.9 — Frontend Dead Pages (~2,453 lines)

### Action: DELETE 6 orphaned page files

| File | Lines | Reason |
|------|-------|--------|
| `client/src/pages/admin.tsx` | 302 | Admin panel — no route in App.tsx, not in sidebar |
| `client/src/pages/analysis.tsx` | 512 | Trade analysis — no route, no sidebar |
| `client/src/pages/command-center.tsx` | 901 | Command center UI — no route, no sidebar |
| `client/src/pages/history.tsx` | 252 | Trade history — no route, no sidebar |
| `client/src/pages/search.tsx` | 186 | Search interface — no route, no sidebar |
| `client/src/pages/settings-old-backup.tsx` | 248 | Old settings backup — superseded by settings.tsx |

**Risk**: Zero. No routes, no sidebar links, no consuming imports. Pure deletions.

---

## Directive 12.2.2 — MarketScanner Class Removal (~640 lines)

### market-scanner.ts (1,363 lines total)

**PRESERVE** (lines 1-384 + 1025-1363):
- Types/interfaces (BatchResult, REB diagnostic types)
- Diagnostic buffer functions (getPassiveLearningBuffer, getREB211* buffers)
- `collectAdaptiveBatch()` standalone function — actively used by FX5Scanner

**REMOVE** (lines 385-1025):
- MarketScanner class — LEGACY, labeled "Do NOT wire to Stage-3", superseded by FX5 30-second scanner

### Consuming file surgery

| File | Change |
|------|--------|
| `server/routes.ts` | Remove MarketScanner import, instantiation (`const marketScanner = new MarketScanner()`), `startHourlyScanning()` call, `getMarketOverview()` route handler |
| `server/services/market-scan-task.ts` | Remove MarketScanner dynamic import + instantiation |
| `server/startup.ts` | Remove MarketScanner reference from service list |
| `server/routes/status.ts` | Remove MarketScanner monitoring reference |

### Safety Notes

- `collectAdaptiveBatch()` is NOT a class method — it's a standalone export function. Safe to keep after class removal.
- Diagnostic buffer functions are exported at module level. Safe to keep.
- FX5Scanner imports only `collectAdaptiveBatch` and `BatchResult` — does NOT import MarketScanner class.
- `reb-2-12-test-harness.ts` and `reb-2-15-certification.ts` import diagnostic buffers — NOT MarketScanner class.

---

## Combined Estimates

| Metric | Value |
|--------|-------|
| Files deleted | 6 (frontend pages) |
| Files modified | 4-5 (market-scanner.ts + consuming files) |
| Lines removed | ~3,100 |
| Complexity | LOW-MEDIUM |
| Risk | LOW |
