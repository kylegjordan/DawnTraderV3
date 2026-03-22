# Directive 12.1.5: RiskManager Comment/Stub Cleanup

> **Phase**: 12.1 — Critical Math & Security Fixes
> **Status**: COMPLETE
> **Date Issued**: 2026-02-23
> **Date Complete**: 2026-02-23
> **Batch**: 3 (combined with 12.1.3 + 12.1.4)
> **Commit**: `0ddc8db1`
> **Review Cycles**: 1

---

## Problem Statement

During Phase 9, the `risk-manager.ts` file was deleted and all its imports were replaced with inline stub functions and annotation comments. The stubs work correctly, but the Phase 9 migration breadcrumb comments (`[9.0-FP]`, `[9.6.3]`) cluttered the codebase and served no ongoing purpose:

```typescript
// [9.0-FP] RiskManager import removed - using inline stub
// [9.6.3] RiskManager removed - use guardrail-settings.ts and trade-safety.ts instead
```

These comments appeared in 8+ files and made it unclear whether the RiskManager removal was still in progress or fully complete.

---

## Resolution

### Comments Removed (pure deletion)

| File | Lines | Comment |
|------|-------|---------|
| `server/routes.ts` | 13, 89 | `[9.6.3] RiskManager removed...` |
| `server/test-guardrails.ts` | 14, 34 | `[9.0-FP] RiskManager import/instance removed...` |
| `server/services/paper-sim-diagnostic.ts` | 8, 71 | `[9.0-FP] RiskManager import/instance removed...` |

### Comments Cleaned (updated to neutral descriptions)

| File | Change |
|------|--------|
| `server/services/behavioral-template.ts` | 4 comments: `[9.0-FP] ... (replaces RiskManager)` → clean descriptions like "Portfolio metrics helper (storage-based)" |
| `server/services/daily-brief.ts` | 8 comments: `[9.0-FP] ... (replaces RiskManager)` → clean descriptions; 3 deleted entirely |

### What Was NOT Changed

- **Stub function bodies**: `getPortfolioMetricsStub()` and `getWinRateStub()` in `behavioral-template.ts` and `daily-brief.ts` were left intact. They work correctly — only their migration annotation comments were cleaned.
- **routes.ts line 13102**: Contains one additional `[9.6.3]` RiskManager comment that was identified during investigation but not listed in the original directive scope. Left untouched per scope discipline.

---

## Impact Analysis

- **Blast Radius**: NONE — zero functional code changed, comments only
- **Behavioral Change**: None
- **Risk**: None
- **Tests**: 816 pass, 81 fail (unchanged baseline)

---

## Background: How Was RiskManager Resolved?

The `risk-manager.ts` file was deleted during Phase 9 (pre-governance era). All 12 import locations were replaced with either:
- Inline stub functions that pull metrics from storage (behavioral-template.ts, daily-brief.ts)
- Direct references to `trade-safety.ts` and `guardrail-settings.ts`
- Comment-only markers noting the removal

By the time Phase 12 governance was established, no active code referenced RiskManager. This directive cleaned the comment debris.

---

## Rollback

```bash
git reset --hard 67dd76d1  # Reverts to SNAPSHOT-005 (pre-Batch 3)
```
