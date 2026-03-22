# Batch 9 — Directives 12.2.9 + 12.2.2

**Directives**: 12.2.9 (Wave 9: Frontend Dead Code) + 12.2.2 (Wave 1.5: MarketScanner Class Removal)
**Type**: Dead code removal (deletions + surgical edits)
**Baseline Commit**: `8e6e18aa` (Batch 8B governance)
**Result Commit**: `8b6bb540`
**Test Baseline**: 800 pass / 81 fail (881 total) — unchanged

---

## Scope

### Part 1: Frontend Dead Pages (12.2.9)
6 orphaned page components deleted + 1 stale import removed from App.tsx.

### Part 2: MarketScanner Class Removal (12.2.2)
Legacy MarketScanner class (~637 lines) removed from market-scanner.ts. `collectAdaptiveBatch()` and all diagnostic buffers preserved. 4 consuming files cleaned (routes.ts, market-scan-task.ts, startup.ts, status.ts).

## Impact

| Metric | Value |
|--------|-------|
| Files deleted | 6 |
| Files surgically edited | 6 |
| Total lines removed | ~3,110 |
| Bugs resolved | BUG-009 (Two Parallel Scanners) |
| Risk level | LOW |

## Verification

All deletions confirmed. Zero MarketScanner references remaining in cleaned files. collectAdaptiveBatch preserved and functional. Diagnostic buffer imports intact. Test baseline unchanged.
