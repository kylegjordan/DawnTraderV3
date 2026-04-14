# Batch 54 — Completion Report

> **Date:** 2026-04-09
> **Branch:** migration/aws-supabase
> **Commits:** `b1cd2ed5`, `91dd645d`, `a4ee84fa`, `e84b8c15`
> **Reviewed by:** Langston (code review on pattern recognizer relaxations + pre/post-impl audit on hardcoded default removal)

---

## Objectives

1. Reduce pattern detection null rate (no_pattern = 40.5% of all VTS nulls)
2. Stage a conservative DI threshold experiment for trend family
3. Remove legacy ai-analyst module (Running Issue #23)
4. Remove ALL hardcoded filter defaults — DB sole authority (Kyle directive)
5. Install ML service on staging
6. Clear all Running Issues

---

## Fixes Deployed

### Fix 1: Pattern Recognizer Threshold Relaxation (`b1cd2ed5`)
**File:** `server/services/pattern-recognizer.ts`

| Pattern | Change | Rationale |
|---------|--------|-----------|
| PINBAR | Wick ratio 2×→1.5× body | Crypto candles are inherently wicky. Directional dominance (2× opposite wick) retained. |
| INSIDE_BAR | 0.1% containment tolerance | Captures near-inside bars that touch parent range by fractions of a pip. |
| THREE_SOLDIERS | 0.25% opens-in-body tolerance | Crypto micro-gaps between candles are common. Per Langston: 0.25% not 0.5%. |
| MORNING_STAR | First candle body/range 0.4→0.3 | Crypto bearish candles often carry significant wicks. |

**Verification:** First VTS cycle post-deploy detected PINBAR(BUY,1.00) + ABCD(BUY,0.63) on HBAR/USD, generating 1 signal and 1 trade. Pattern detection rate improved from ~70% detection in pattern pool.

### Fix 2: DI Threshold Staged Relaxation (`91dd645d`)
**Change:** DB `screener_filters` table: active_trend 12→10, vts_trend 12→10
**File updated:** `server/db/update-di-thresholds.ts` (seed script)

- Breakout already at 10 (active) / 8 (VTS) — no change needed
- Trend family gained 5 additional qualifying pairs (26→31 passed)
- Staged per Langston recommendation: 12→10 first, not 12→8

### Fix 3: ai-analyst Removal (`a4ee84fa`)
**File:** `server/routes.ts`

- Removed `aiAnalyst` variable and commented import
- 8 route handlers now return `501 Not Implemented`
- Routes: `/ai/reports/generate`, `/ai/analyze-symbol`, `/ai/chat`, `/ai/settings/apply`, `/ai/diagnose-error`, `/conversations/:id/message`
- Service file `ai-analyst.ts` retained for reference only
- Resolves Running Issue #23

---

## VTS Data Context (Pre-Fix Baseline, Apr 9)

| Metric | Value |
|--------|-------|
| Total cycles (before fix) | 696 |
| Quant evals | 115,521 |
| Pattern evals | 22,347 |
| Total signals | 24 (quant=21, pattern=3) |
| Signal rate | 0.0174% |
| Top null reason | no_pattern: 40.5% |

**Comparison (Apr 8, full day):** 181 signals at 0.0899% rate.

---

## Running Issues Resolved

| # | Issue | Resolution |
|---|-------|------------|
| 6 | Empty Guardrails tabs | Kyle confirmed fixed |
| 7 | Screeners tab family thresholds | B53 Fix 4 — quant IMF cards show family-specific |
| 12a | Strategy audit incomplete | B53 full 17-strategy audit completed |
| 15 | DI 12→8 threshold decision | B54 Fix 2 — staged 12→10 |
| 22 | Non-fatal DB column errors | Kyle confirmed fixed |
| 23 | ai-analyst disabled | B54 Fix 3 — fully removed |
| 30 | IMF fallback defaults | B53 Fix 3 — hardcoded fallbacks removed |
| 35 | Filter Diagnostics UI not in SYSTEM_IMPACT_MAP | B53 governance sweep added entries |

### Fix 4: Hardcoded Filter Default Removal (`e84b8c15`)
**Files:** `fx5-scanner.ts`, `vts-runner.ts`, `routes/vts.ts`, `pattern-filter-profile.ts`

- **60+ hardcoded fallback values removed** across 4 files
- DB (`screener_filters`) is now the exclusive source for all filter thresholds
- Missing DB rows trigger `[B54][CRITICAL]` error logs and graceful skip — no fabricated values
- Langston pre-implementation and post-implementation audit both approved
- Null-safety guard added to family IMF loop (prevents crash if family DB row missing)
- `PATTERN_POOL_THRESHOLDS`: LQ_MIN, VN_MAX, DI_TRENDING_MIN, MIN_VOLUME_USD stripped. RSI_MIN/RSI_MAX retained (not in DB yet).
- Dead `PATTERN_POOL_THRESHOLDS` import removed from fx5-scanner.ts

### ML Service Installation
- Created Python venv at `/home/deploy/dawntrader/ml_venv`
- Installed flask 3.1.3, numpy 2.4.4, scikit-learn 1.8.0
- Registered with PM2 as `ml-service`
- Health check confirmed: `{"status":"READY"}` on port 5001

### Running Issues Fully Cleared
- **37 RESOLVED, 1 DEFERRED, 0 OPEN, 0 IN PROGRESS**
- Closed in this session: #3, #4, #5, #9, #11, #12, #12b, #12c, #12d, #16, #17, #19, #20, #21, #24, #25, #26, #28, #29
- Key finding: most remaining 0% strategies are regime-gated (not threshold issues)
- adaptive_flow anomaly noted: mapped to RANGE_BOUND_STABLE but still 0% — potential future investigation

---

## Deferred Decisions (Unchanged)

1. **5 regime-map decisions** — adaptive_flow, pivot_shift, defensive_hedge, liquidity_trap, dhma (Langston: defer, insufficient evidence)
2. **DHMA implementation mismatch** — uses OBI/microprice, not HMA per canonical map (Langston: resolve design-vs-code first)
3. **Pattern path further relaxation** — monitor B54 Fix 1 impact before additional changes

---

## Governance Updates

- RUNNING_ISSUES.md: ALL issues resolved (37 resolved, 1 deferred, 0 open)
- BATCH_CATALOG.md: B54 entry updated with Fix 4 + ML service
- CCPI: Last Updated bumped
- SYSTEM_IMPACT_MAP.md: Last Updated bumped, entries for B54 changes
- PHASE_HISTORY.md: Phase 14.7 marked COMPLETE, roadmap reordered per Kyle directive
- POST_AUDIT_ROADMAP.md: v5 — reordered phases per Kyle (go live before ML, XStocks/Perpetuals added post-live, Phase 15+16 combined)
- MEMORY.md: Updated with current state and new roadmap order
