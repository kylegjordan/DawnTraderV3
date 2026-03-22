# Batch 3 README — Directives 12.1.3 + 12.1.4 + 12.1.5

> **Date**: 2026-02-23
> **Commit**: `0ddc8db1`
> **Baseline**: SNAPSHOT-006 (`67dd76d1`)
> **Validation**: 816 pass / 81 fail (zero regressions)
> **TSC**: 20 pre-existing errors, 0 new errors in modified files

---

## What This Batch Did

Three directives combined into one batch for efficiency:

### Directive 12.1.3: Security Hardening (12 files)
- Removed JWT fallback secrets from 12 route files
- Removed auth bypass headers (`x-internal-audit`, `x-validation-session`) from 4 files
- Server now fails hard if JWT_SECRET or JWT_REFRESH_SECRET env vars missing

### Directive 12.1.4: BUG-020 Fix (1 file)
- Removed simulated `entryPrice * 1.02` fake price from `active-trades.tsx`
- Shows entry price with "(entry)" label and "Awaiting live price" for P/L

### Directive 12.1.5: RiskManager Cleanup (5 files)
- Removed orphaned `[9.0-FP]` and `[9.6.3]` RiskManager annotation comments
- Cleaned stub function comments to remove Phase 9 migration breadcrumbs

---

## Files Modified (17 total)

| # | File | Directive |
|---|------|-----------|
| 1 | `server/routes/calibration.ts` | 12.1.3 |
| 2 | `server/routes/paper_validation.ts` | 12.1.3 |
| 3 | `server/routes/pricing.ts` | 12.1.3 |
| 4 | `server/routes/regime-archive.ts` | 12.1.3 |
| 5 | `server/routes/market.ts` | 12.1.3 |
| 6 | `server/routes/maco.ts` | 12.1.3 |
| 7 | `server/routes/m3b.ts` | 12.1.3 |
| 8 | `server/routes/rl.ts` | 12.1.3 |
| 9 | `server/routes/vts.ts` | 12.1.3 |
| 10 | `server/routes/vts-audit.ts` | 12.1.3 |
| 11 | `server/routes/tlva.ts` | 12.1.3 |
| 12 | `server/routes.ts` | 12.1.3 + 12.1.5 |
| 13 | `server/test-guardrails.ts` | 12.1.5 |
| 14 | `server/services/paper-sim-diagnostic.ts` | 12.1.5 |
| 15 | `server/services/behavioral-template.ts` | 12.1.5 |
| 16 | `server/services/daily-brief.ts` | 12.1.5 |
| 17 | `client/src/components/trading/active-trades.tsx` | 12.1.4 |

---

## Notes

- Replit platform auto-checkpoint commit `f22d1bfa` appeared before official batch commit (known platform behavior, not a violation — see CLAUDE_CODE_PROJECT_INSTRUCTIONS.md)
- Initial TSC/Vitest validation timed out due to transient resource contention; retry succeeded with full baseline confirmation
- One additional `[9.6.3]` RiskManager comment at `routes.ts:13102` was identified but left untouched per scope rules (not listed in directive)
