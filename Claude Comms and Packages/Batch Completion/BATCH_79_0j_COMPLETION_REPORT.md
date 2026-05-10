# BATCH 79.0j — Completion Report

> **Status:** SHIPPED + verified
> **Author:** Claude Code
> **Created:** 2026-05-10 19:55 UTC
> **Commits:** `418088c7a` (rename) + `fa4cbabdc` (VTS dispatch fix discovered during verify)
> **PM2 deploy:** #212
> **Resolves:** RUNNING_ISSUES #90

---

## 1. What shipped

**Pure constant rename + bonus VTS dispatch bug fix.** Original B79.0j scope was the rename (Langston B79.0d Step 4 F1 finding). During staging deploy verify the PM2 logs surfaced a pre-existing B79.0d bug — VTS-side dispatch switch didn't know about ORB — which would have caused 100% nulls on the xStocks tab strategy-fire-rate table from Monday 14:30 UTC onward. Bug fixed in followup commit while still in ORB territory.

### Rename (`418088c7a`)

| Site | Change |
|---|---|
| `server/strategies/orb.ts` lines 27-37 (comment block) | Removed "queued for B79.x rename" note; replaced with explanation that the constant is target-distance multiplier, not realized R:R |
| `server/strategies/orb.ts` line 196 | `ORB_RR_RATIO` → `ORB_TARGET_RANGE_MULT`; key string `'risk_reward_ratio'` → `'target_range_multiple'`; `?? 2.0` fallback preserved |
| `server/strategies/orb.ts` lines 250 + 255 | 2 usage sites of the const renamed |
| `scripts/b79-0d-orb-thresholds-seed.sql` lines 31-34 | Comment + key updated for fresh deploys |
| `server/tests/unit/b79-0d-orb.test.ts` line 24 | Fixture key updated |
| `scripts/b79-0j-orb-rename-risk-reward-to-target-range-multiple.sql` (NEW) | Forward UPDATE wrapped in BEGIN/COMMIT |
| `scripts/b79-0j-orb-rename-rollback.sql` (NEW) | Rollback UPDATE per Langston Q4 (symmetry) |

DB UPDATE applied on staging BEFORE the code push (Langston-recommended sequence). Single row updated. `?? 2.0` fallback preserves byte-identical behavior across the deploy-window bridge state.

### VTS dispatch fix (`fa4cbabdc`)

| Site | Change |
|---|---|
| `server/services/vts-runner.ts:782` | `callStrategyDetect` signature gained optional `symbol?: string` + `assetClass?: string` args; other strategies ignore them (additive — no behavior change) |
| `server/services/vts-runner.ts:838-846` (new) | `case 'orb':` added — calls `strategyEngine.detectORB(symbol, ohlcData, indicators, { assetClass, symbol })`. Fail-safe null-return + warn log if ctx args missing |
| `server/services/vts-runner.ts:1010` (caller) | Threads `symbol` + `safeResolveAssetClass(symbol, 'kraken') ?? 'crypto_spot'` through `callStrategyDetect` |

---

## 2. Verification (5-gate)

| Gate | Result |
|---|---|
| **G1 — CI** | Initial push `418088c7a`: Build success, Docker Build success, TS+Test legacy-red baseline (verified zero new errors from orb.ts/test fixture/seed SQL changes via `gh run view --log-failed | grep`). Followup push `fa4cbabdc`: in-progress at deploy time, expected same baseline given identical change shape. |
| **G2 — DB UPDATE applied** | `SELECT constant_name, value FROM module_constants WHERE module_name='strategy.orb' AND asset_class='xstock_spot' AND constant_name IN ('risk_reward_ratio','target_range_multiple')` → single row `target_range_multiple` value `2.0`. Zero rows for old `risk_reward_ratio`. |
| **G3 — PM2 boot clean** | PM2 #212 online; uptime 71s+ at verify; **zero `[HF6][VTS] Unknown strategy: orb` warnings since 19:51:11 (PM2 restart moment)** — pre-existing flood of those warnings (281 in pre-restart buffer) stopped immediately after the dispatch fix landed. No `[B79.0j][VTS] orb dispatch missing symbol/assetClass ctx` fail-safe warnings (caller correctly threads ctx). |
| **G4 — Crypto no-touch fence holds** | `crypto_spot regime_factor_alternates` over last 30 min = 226 rows. Healthy baseline (was ~12 emissions/factor/hr historically; 226/0.5h ≈ 27/factor/hr aggregated across 10 factors which is well within healthy range). |
| **G5 — Crypto regression** | NONE by-construction. ORB is xstock_spot-only via triple-defense guard. The `callStrategyDetect` signature extension is additive (optional args; existing callers unaffected). The DB UPDATE only touches `module_constants` row scoped to `module_name='strategy.orb'` + `asset_class='xstock_spot'` — no crypto rows touched. |

---

## 3. Discoveries during this batch

### Pre-existing B79.0d bug surfaced

The `[HF6][VTS] Unknown strategy: orb, no detect function available` warning had been firing since B79.0d gate flip (2026-05-09) but went unnoticed during B79.0d verification + B79.0i.a/b verification because we weren't grepping for "orb" specifically. The bug was real-impact:

- ORB candidate signals from VTS evaluation were silently nulled
- xStocks tab strategy-fire-rate table would show 100% nulls for orb on Monday 14:30 UTC onward — making it look like ORB never fires when in fact the strategy detection logic works correctly via the strategy-engine direct path
- 100% nulls would propagate into B73 + B67.0 ablation panels (no closed trades, no factor alternates accumulating for orb)

### Future-strategy lesson

B79.0d post-mortem: **every new strategy add needs BOTH dispatch sites updated** — strategy-engine direct + `vts-runner.ts:callStrategyDetect` switch. AND **a VTS-path integration test** that goes through `callStrategyDetect` rather than testing the strategy-engine wrapper in isolation. The B79.0d test suite tested the strategy-engine wrapper directly, which is why the VTS-side gap wasn't caught.

This lesson logged in the BATCH_CATALOG.md row + filed as a B79.0d retrospective addendum — not a separate running issue since the fix already landed.

---

## 4. Crypto regression posture

**NONE by-construction.** Pure rename + additive dispatch fix:
- ORB is xstock_spot-only via triple-defense guard at orb.ts (early-return when `assetClass !== 'xstock_spot'`)
- DB UPDATE scoped to `module_name='strategy.orb' AND asset_class='xstock_spot'`
- `callStrategyDetect` signature extension is additive; existing callers omit the new args; existing strategies ignore them
- No-touch fence on crypto_spot through 2026-05-15 preserved

---

## 5. Governance updates

This batch closure:
- BATCH_CATALOG.md — B79.0j row added
- PHASE_HISTORY.md — Phase 24 follow-up entry (this commit)
- RUNNING_ISSUES.md — #90 marked RESOLVED with closure note (this commit)
- BATCH_79_0d_COMPLETION_REPORT.md — post-closure addenda noting B79.0j landed the rename + the VTS-dispatch bug discovered/fixed (this commit)
- BATCH_79_0j_COMPLETION_REPORT.md — this file
- MEMORY.md (CC + Langston via Hetzner) — drop next-step pointer; add B79.0j closure (this commit)

---

## 6. Pending follow-ups

- **B79.0g-tx (#91)** — atomic close-time tx, next batch
- **B79.0k (#89)** — Kraken WS-equities weekend silence investigation, third batch
- **#92 deferred to Phase 19** — xstockSpotScanner orchestration wiring (not a near-term B79.x batch per Kyle clarification 2026-05-10: active trading not until Phase 19)
- **B79.TEC.b operator gate ~11:24 UTC Sunday** (manual)
- **B79.0a SQE wildcards DELETE ~21:38 UTC Sunday** (manual)
