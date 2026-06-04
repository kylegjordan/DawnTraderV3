# B.4 FOUNDATION — Completion Report

**Batch:** B.4 foundation — xStock 60-minute → 15-minute evaluation-bar switch + paired recalibration
**Date:** 2026-06-04
**Deploy:** commit `ae2ddc845` (+ CLI universe-load follow-up `0bae277e7`); migrations `2026-06-03b` / `2026-06-03c` / `2026-06-04`; CI run `26939587681` all-4-green; pm2 #347; HTTP 200, no crash-loop.
**Active trading:** OFF (VTS telemetry only) throughout. **Crypto: UNTOUCHED** (isolation proven — see §Crypto isolation).

> 🚨 **PARTIAL-SCOPE DECLARATION (§9.1):** This batch makes xStock **15-minute regime classification, DBS, and the IMF (VN/DI) screen** fully functional and live. It does **NOT** time-anchor the **per-strategy indicator periods** (SMA/RSI/ATR/VWAP in `strategy-helpers.ts` + signal-orchestrator + strategy-validator), and it does **NOT** activate ORB. Those are deferred by the agreed **foundation → pattern-detection → per-strategy** sequencing (see Objective 2 + Objective 6 below). Until the per-strategy phase lands, individual strategy indicator gates compute over **bar-count** windows (i.e. shorter wall-clock windows at 15m). This is a known, intended transitional state, not a defect.

---

## §1 — Scope objectives checklist (B_4_FOUNDATION_SCOPE.md v2)

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | **Bar plumbing** — aggregator add 15m + new 15m snapshot table + bucketExpr 900 | ✅ YES | `ohlc-aggregator.ts` 15m branch (MAX_BARS_15M=240, bucket `floor(epoch/900)*900`); new `xstock_spot_ohlc_15m_snapshot` table (migration `2026-06-03b`); `xstock-ohlc-cache.ts` 15m branch; scanner `getOHLCDataBatch` flipped 60→15. Live: 15m snapshot warm at ~116k rows. |
| 2 | **Per-class TIME-ANCHORED lookbacks** → module_constants | ◐ PARTIAL (regime+DBS done; per-strategy indicators deferred) | DONE: regime momentum 30→120, ADX 14→56 (`market-regime.ts` + `market-context-engine.refreshRegimeConfig`); DBS lookback 48→192, EMA 12/26→48/104, ATR 14→56 (`scanner.ts`). All from `module_constants` (xstock_spot), hard-fail no-default. **DEFERRED (per-strategy phase):** the strategy-level indicator periods (SMA-20 / RSI-14 / ATR-14 in `strategy-helpers.ts`, `signal-orchestrator.ts`, `strategy-validator.ts`) were NOT migrated this batch — they remain bar-count at 15m. This matches the foundation→pattern→per-strategy sequencing (per-strategy gate recalibration is its own phase). |
| 3 | **xStock regime-threshold recalibration (14 consts)** | ✅ YES | 14 thresholds recalibrated percentile-preserving + CALIBRATION-LENS → `regime-thresholds.ts` (60m values retained inline). Study `scripts/b4-regime-recalib-study.ts` (485 sym / 34d / 101.8k 60m + 300.9k 15m bars). |
| 4 | **MCE periods** | ◐ PARTIAL | The MCE regime-lookback resolution (momentum/ADX) IS per-class via `refreshRegimeConfig`. The MCE modulator-chain indicator periods (volume-regime lookback etc., B67/B68) were NOT re-derived for 15m this batch — folds into the per-strategy/modulator recalibration follow-up. Not regime-classification-blocking. |
| 5 | **DBS recompute + epoch-stamp + retain 60m archive** | ✅ YES | `scripts/b4-dbs-15m-recompute.ts` (supervised): archived 31,481 live 60-min rows → `xstock_dbs_backfill_60m_archive` (safety gate archive≥live PASSED), cleared, inserted 332,304 per-bar 15-min DBS rows stamped `bar_interval_minutes=15`, single transaction. Sentinel-zero bars INSERTED with flag (Langston Step-4 Q1); atr≤0 skipped. |
| 6 | **ORB candle-source + window + enable LAST** | ✅ YES (plumbing) / enable intentionally FALSE | No code change needed — ORB rides the same scanner `getOHLCDataBatch` flip for candles; its window is wall-clock-time-based (14:30 UTC + open_range_minutes=30, a clean 15-multiple) → no param change. `enable` confirmed FALSE in live DB and LEFT false: ORB activation is a separate strategy-fit decision, out of foundation scope. Now plumbing-ready at 15m. |
| 7 | **Weekend prewarm depth** | ✅ YES | `scripts/b-new-34b-prewarm-snapshot.ts` refactored to warm BOTH 60m (cap 60) + 15m (cap 240) snapshots (`SNAPSHOT_INTERVALS`). Verified: full run warmed 60m=29,060 + 15m=115,874 rows across 485 symbols (0 errors). |
| 8 | **Dual-capacity load gate** | ✅ YES (live-observed) | Deploy + the one-time DBS recompute + prewarm ran against the live system with no crash-loop, HTTP 200, scanner healthy. The supervised one-time backfill completed within the operating window; steady-state 15m (4× the per-bar rate of 60m) running live without degradation. |
| 9 | **Regime-label PARITY report = EXIT GATE** | ✅ YES (PASSED + Langston SIGNED OFF) | `scripts/b4-regime-parity.ts` + `B_4_REGIME_PARITY_REPORT.md`: clean-60m→clean-15m mix shift **≤1.30pp** (no collapse; old 60m cutoffs on 15m would have ballooned STRUCTURAL_TRANSITION to 51%, new cutoffs restore 30.7%). "Shift understood + intended." Langston signed off 2026-06-04 with 2 activation-readiness conditions (banked — see §3). |
| 10 | **IMF VN/DI recalibration** | ✅ YES | `scripts/b4-vndi-recalib-study.ts` + `B_4_VNDI_RECALIB_STUDY_RESULTS.md`; migration `2026-06-04-b4-foundation-vndi-15m-recalib.sql` updated **16** `screener_filters` rows (validated vs live counts): di_max 30→40.3 / 35→42.8 / 40→45.2 (DI contracts toward 50 at 15m); vn_max 0.85→0.826 (only looser-drift edge). LEFT documented: vn_max 0.95/0.98 (drift tighter, lens-conservative); di_min + di_max=100 (inert). Langston signed off. |

**Summary:** 8 of 10 objectives fully YES; 2 PARTIAL (Obj 2 + Obj 4 — the per-strategy / modulator indicator periods deferred to the per-strategy recalibration phase, consistent with the agreed sequencing). The **regime-classification + DBS + IMF-screen** core — the foundation's load-bearing recalibration, gated by the parity exit gate — is fully live and signed off.

## §2 — Crypto isolation (Langston Step-4 hard-fail — all 3 proofs hold)
1. **Uniform resolution lands crypto on DEFAULT.** `market-context-engine.refreshRegimeConfig` resolves lookbacks uniformly over `getActiveAssetClasses()`; crypto lands on `DEFAULT_REGIME_CONFIG` (30/14). DBS: crypto scanners (fx5-scanner, market-scanner) untouched on `DEFAULT_DBS_CONFIG`.
2. **Startup PARITY ASSERTION** throws if crypto-resolved lookbacks ≠ DEFAULT — silent crypto drift impossible.
3. **Shared `DBSConfig` type** (tsc-enforced) — structural drift fails the build (confirmed by bench: 0 new tsc errors).
Bench zero-delta: tsc 493 baseline unchanged; vitest 12 pre-existing failures unchanged (verified WITH-bundle == pure-HEAD).

## §3 — Activation-readiness conditions (Langston — NOT blockers; soak/follow-up)
1. **Wall-clock flip-rate + responsiveness.** Corrected framing: 15m ≈ 9.75%/bar × 4 = **~39%/hr** regime churn vs 60m ~18.94%/hr — 15m flips ~2× MORE per hour (the earlier "15m steadier" was a per-bar artifact and backwards). A responsiveness check (does the 15m read catch genuine transitions vs churn) is the open soak item.
2. **Capture LIVE-15m regime mix** and confirm it lands near the predicted clean-15m mix (TFS 25 / ST 31 / HVU 21 / IE 17 / RBS 6.6). Needs a few hours of live-15m accumulation — **soak-pending** (will firm over the afternoon).

## §4 — Latent bug fixed during activation
Standalone CLI prewarm + DBS-recompute aborted "empty target symbol set" — the xStock universe went DB-dynamic on 2026-05-21 (B79.0n.UNIVERSE-DISCOVERY); `XSTOCK_SPOT_REGISTRY` is populated by `xstockUniverseService.initializeFromDB()` at app boot only, which standalone CLI runs skip. Both CLI `main()`s now load it (`0bae277e7`). The in-process weekend prewarm (lifecycle controller) was unaffected.

## §5 — Governance files changed
- `1-system-manual/BATCH_CATALOG.md` — B.4 entry added.
- `1-system-manual/PHASE_HISTORY.md` — Phase 24 B.4 CLOSED block.
- `1-system-manual/RUNNING_ISSUES.md` — #200 crypto-DBS→module_constants deferred; #201 live-forming-bar EV-leakage (range-starved strategies); #202 deploy-hygiene git-tree artifacts; #203 ORB plumbing-ready-but-disabled.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — B.4 component table (15m snapshot, aggregator/cache branches, scanner flip, per-class resolution, DBS recompute artifact + archive).
- `1-system-manual/SYSTEM_MANUAL.md` — bar-frequency chapter (supersedes the prior 60m-canonical lock).
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — working tracker: foundation items ☑.
- `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — §4.29 learnings 6–9 (atomic-activation, DB-dynamic-universe CLI gotcha, percentile-preserve + parity-gate as standard pattern).
- `1-system-manual/CHANGES_AND_FIXES.md` — NOTE-2026-06-04 (vn_max residual + DBS sentinel handling).
- `.claude/memory/MEMORY.md` (+ Langston `/home/langston/MEMORY.md` per §10.b).

## §6 — Asset-class onboarding workflow learnings (Phase 24 standing rule §3.3)
- **(a) Worked well:** percentile-preserving recalibration + the regime-label parity exit gate (a clean apples-to-apples clean-60m→clean-15m comparison) gave a decisive, Langston-signable go/no-go. Building everything inert and gating activation on the parity sign-off prevented the silent regime collapse.
- **(b) Surprised us:** VN is nearly bar-invariant (normalized ratio) while DI contracts toward 50 — the IMF screen needed a different recalibration shape than the regime thresholds. The "15m steadier" per-bar reading was backwards on a wall-clock basis. The deploy is NOT inert against the OLD code (migrations change live config the running app reads) → deploy = atomic activation at restart.
- **(c) Recurring structural pattern:** DB-dynamic config (universe, module_constants) means standalone CLI scripts must explicitly load what the app boot loads — a repeatable onboarding gotcha.
- **(d) Edits applied:** `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.29 learnings 6–9 (this turn).

## §7 — Outstanding / next
- **Soak:** the two activation-readiness conditions (live-15m mix + flip-rate/responsiveness) firm up over the next hours; will confirm.
- **Per-strategy phase (next):** time-anchor the per-strategy indicator periods + recalibrate the strategy gates at 15m (pattern-detection → per-strategy, per the sequencing).
- **RUNNING_ISSUES #200–#203** carry the deferred follow-ups.

**Verification basis:** backend-verified (HTTP 200, migrations applied + confirmed in live DB, scanner reading 15m, 15m snapshot warm, DBS recompute committed). UI loads healthy (Claude-in-Chrome, PAPER/STOPPED as expected). The Phase-19 paper-active run remains the final real-world arbiter; this is the forward proxy.

## §8 — Langston Step-8 independent second-pass — ✅ CONCUR (2026-06-04)
Langston re-pulled every load-bearing number off staging himself (read-only): deploy HEAD = activation commit; pm2 #347 pinned (no crash-loop); HTTP 200; regime momentum 120 / ADX 56; DBS lookback 192 / ema 48-104 / atr 56; `xstock_dbs_backfill` = 332,304 rows **100% stamped 15m** (zero mixed-interval contamination); `_60m_archive` = 31,481 (= live-60m population, confirming zero loss); 15m snapshot 117,703 rows (grown past the report's 115k via live accumulation). He confirmed the 2 PARTIALs are visible in `module_constants` (the non-recalibrated scopes still carry bar-count periods 12/26/48) — "the declaration matches the data; nothing is hidden." Crypto isolation 3 proofs satisfied. **Verdict: "Foundation is live and clean. Cleared to close pending soak + the 0bae277e7 reconcile."**

**Two flags (neither blocks close):**
1. **RECONCILED — deploy-state sync.** Langston's `git cat-file -t 0bae277e7` failed *on staging* because the last deploy pulled the activation commit (`ae2ddc845`) and the later script/governance commits reached GitHub but never re-deployed (the CLI fix reached staging via scp, the recompute ran, but staging's git HEAD didn't advance). The hash IS valid on GitHub. **Resolved by a sync-redeploy** (server runtime unchanged post-activation; advances staging HEAD to current GitHub so `0bae277e7` is on the deployed tree + satisfies the §7.1 close gate).
2. **ml-service restart_time≈184k** — out-of-scope (not B.4; main process healthy at #347, crypto untouched). Spun off as its own task for a future glance.

**Open (soak, NOT blockers):** (a) live-15m regime mix vs predicted (TFS 25 / ST 31 / HVU 21 / IE 17 / RBS 6.6); (b) wall-clock flip-rate ~39%/hr vs ~19%/hr + responsiveness over a real session. Send the live-mix capture once the afternoon accumulates → Langston closes these.
