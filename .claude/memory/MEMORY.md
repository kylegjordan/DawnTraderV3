# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md`.
2. Read this file.
3. Read `1-system-manual/POST_AUDIT_ROADMAP.md` (B72 + Phase 16) and `1-system-manual/LEVER_INVENTORY.md` §10b/§10c/§11/§12.
4. Start silent polling: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
5. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** announce polling status; confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough.

---

## CURRENT STATE — 2026-05-06 (post-B72.2 close)

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `6c42dc370` (B72.2 Slices 2-5 wiring) on top of `eeabb7147` (Slice 1 SQL seed).
- **Live:** B70 + B70.1/.2/.3/.3b + B72 main + 3 post-deploy hotfixes + B72.1 FULL + B72.2 FULL. PM2 #171.
- **18 canonical strategies, ALL DB-tunable** (was 9/18 pre-B72.2). 49 modules / ~311 rows live in `module_constants`.
- **DB module_constants UPDATEs (no code commits):** `b67_5_post_composition_floor=0.20`, `b68_5_path_b_momentum_min=0.002`, `moonbag_qualifying_strategies=[]`.
- **Path B (TFS classifier) gate:** `(absDbs >= 0.30 && mom > 0.002)`. Trailing-after-target DISABLED — every trade exits at target.
- **B72.2 collapsed 5 vts-runner-vs-orchestrator parameter discrepancies** to canonical vts-runner values (breakout.volume_multiplier=1.5, mean_reversion deviation 0.03/1.5, range_trade triplet 7/2/1).
- Live snapshot: `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` (regenerate via `dump-settings-registry.ts`).

---

## B72 + B72.1 + B72.2 — FULLY CLOSED 2026-05-06

**B72.2** (commit `eeabb7147` SQL + `6c42dc370` wiring) closed the gap missed by B72 main and incorrectly dismissed by B72.1 §13.1: live universe is **18 canonical strategies**, not 9. The 9 in-class quant strategies (`vwap_pullback`, `abcd_long`, `sma_trend_ride`, `breakout`, `mean_reversion`, `range_trade`, `vwap_bounce`, `liquidity_trap`, `dhma`) live as `detect*` methods in `strategy-engine.ts:87–1344`; B72 main missed them because the inventory pass surface-grepped only `server/strategies/`. `vwap_pullback` is the highest-volume strategy in the system (26,540 evals/7d).

**B72.2 deliverables:** 131 rows seeded under 9 new `strategy.<key>` modules; all 9 detect methods refactored to read from module_constants (4 string enums via `getCachedConstant<string>`); dispatcher param-object literals stripped from `vts-runner.ts`, `signal-orchestrator.ts`, `stage-b-validator.ts` standard branches, and `routes.ts` admin diagnostic; 5 vts-vs-orchestrator parameter discrepancies collapsed to canonical vts values per Langston cc-inbox #914. liquidity_trap migrated for re-enablement readiness (operationally disabled — bullish-only system). Boot warmup verified (16/13/12/13/13/15/11/13/25 rows); `[B72][INIT_OK]` confirmed; signal regression check showed in-class quants emitting at consistent rates post-deploy. CLAUDE.md "17 canonical" stale — actual is **18**.

**Audit-process bug** logged as `BUG-2026-05-06-A`: filesystem-grep audits miss in-class methods. Strategy enumeration must use `STRATEGY_DISPLAY_NAMES` SSOT + class-wide grep. Audit conclusions contradicting production telemetry (e.g. "dead code" on a 26k-evals/7d strategy) must trigger re-audit, not shipping. Kyle's pushback caught this.

---

## B72 + B72.1 — closed 2026-05-05

**Steps 1-11 all closed.** Completion report: `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md` (B72.1 §appended). Langston sign-offs: cc-inbox #903/#904/#906/#908/#909/#910/#911 (B72 main) + #912 (B72.1 Step 4).

**Architecture shipped:** `prefetchModule()` + `getCachedConstant<T>()` + `getCachedNumberRequired()` + `getCachedNumbersForModule()` (bulk) + 60s background refresher in `module-constants-service.ts`. Boot hard-fail in `server/startup/b72-warmup.ts` PREFETCH_MODULES list (now 40 modules). **Warmup runs BEFORE `bootOrchestrator.initialize()`** in `server/index.ts` (BUG-2026-05-05-E hotfix).

**B72.1 (commit `31f4b873`) — all 5 carry-over wired source-side:**
1. `adaptive-manager.ts` → `adaptive_weights.default_decay_rate` via lazy `get decayRate()` accessor + `_decayRateOverride` (constructor / setDecayRate). Singleton-init timing trap solved.
2. `risk-concentration.ts` → `concentration_risk.{correlation_threshold, max_concentration_score, min_scaling_factor}` via lazy `get config()` + `_configOverride` partial. updateIntervalMs stays KEEP.
3. `trade-safety.ts` → `guardrail_defaults.{default_max_total_exposure_pct (0–1 ratio), max_open_trades_default}` wired into 3 fallback callsites (L368/L556/L582).
4. `pre-execution-validator.ts` → `goal_alignment` (6 rows) + `strategy_profiles` (per-strategy) HIGH-risk atomic block. `resolveGoalAlignmentConfig()` snapshot ONCE per `validateTrade()` for consistency. Legacy hardcoded `strategyRiskProfile` map deleted.
5. `strategy-modes.ts` → `governance_modes.{normal,defensive,survival}_mode_confidence_floor` via Object.defineProperty getter (already shipped under B72 main `791e72b5`).
- Boot warmup verified (rows: adaptive_weights=1, concentration_risk=3, guardrail_defaults=2, goal_alignment=6, strategy_profiles=6); `[B72][INIT_OK] (pre-orchestrator)` clean.
- **17-vs-9 reconciliation:** live universe = 9 active strategies; 8 keys (vwap_pullback, mean_reversion, range_trade, abcd_long, sma_trend_ride, breakout, vwap_bounce, dhma, liquidity_trap) are exit-only `case` branches in legacy `strategy-engine.ts` with no `detect()` — cannot enter trades. Phase 16 dead-code candidate. CLAUDE.md "17 canonical" reference is stale.

**3 post-deploy hotfixes from B72 main (all RESOLVED):**
- BUG-2026-05-05-E (`c1afdfac`): warmup wired AFTER Boot Orchestrator → VTS auto-start failed → 1+ hour outage. Moved warmup to pre-orchestrator.
- BUG-2026-05-05-F (`4ad40b95`): `VTS_MAX_CONCURRENT_PER_COMBO` undefined at 2 missed callsites in vts-runner.ts.
- BUG-2026-05-05-G (`1a3038a4`): `FRICTION_SAFETY_BUFFER` / `ROI_MIN` / `ROI_MAX` undefined at 2 missed callsites in expectancy.ts.
- **Pattern lesson:** post-mass-migration, run `grep -rn "<OLD_CONST>" server/ --include="*.ts"` before push. Recommend `tsc --noEmit -p tsconfig.json | grep <files>` on touched files (legacy TS-baseline failure masks new errors).

**Tier 2 governance shipped:** SYSTEM_MANUAL Configuration Surface appendix · ADJUSTMENT_FRAMEWORK §0 (operator workflow) · CHANGES_AND_FIXES BUG-E/F/G entries · POST_AUDIT_ROADMAP §B72 close mark · BATCH_CATALOG B72.1 row · PHASE_HISTORY 2026-05-05 B72.1 entry · LEVER_INVENTORY §13 (B72.1 closure + 17-vs-9 outcome).

**Known follow-up (NOT B72 scope):** `trading-engine.ts` calculateGoalAlignmentScore (L130–209) duplicates the alignment logic now-migrated in pre-execution-validator. SIM-flagged BUG-012. Separate cleanup batch.

**Critical pattern:** every PROMOTE module read from sync code MUST be in `PREFETCH_MODULES` (`server/startup/b72-warmup.ts`); boot hard-fails otherwise.

**Skipping (Kyle directives):** Phase 19.0.5 / F/K simulator deep-dive / B70.2 follow-ups / liquidity_trap bullish redesign.

---

## RECURRING ANALYSIS RECIPE (trigger: "**run the calibration review**")

When Kyle says "run the calibration review" / "review the factors" / similar — run this end-to-end without re-asking what:

1. **Factor calibration table.** `GET /api/analytics/factor-calibration?window=rolling_7d` — render 10-row factor table:
   - For each factor: avg shift, |shift|, max |shift|, n, % zero
   - REAL tertile WR (low/mid/high) + REAL spread
   - ALT tertile WR + ALT spread
   - **Predictive lift** (REAL − ALT spread) — decision-grade column
   - Status (READY / ACCUMULATING)

2. **Exit-strategy ablation table.** `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — render 12-variant table (id, name, n, mean P&L %, Δ vs A, Sharpe, WR%, avg duration, exit-reason breakdown). Highlight A row. Sort by Sharpe desc.

3. **Verify recent fixes are working as expected** (the 2026-05-05 changes from B70.3 / B70.3b / B72):
   - **b68_5 path_b_sustainability:** predictive lift should be drifting from -2.0pp (pre-B70.3 slope gate) toward 0+ or positive (post-B70.3 momentum gate). If still ≤ -1.0pp, the fix isn't taking — investigate.
   - **Trailing-after-target (moonbag) DISABLED:** `exit_reason='TRAIL_hit'` count in last-24h `exit_decision_archive` should be **near-zero** (any TRAIL_hit means the disable isn't holding). In the exit-ablation table, variants involving trailing should show `n=0` or near-zero recent counts. If trailing-stop variants are still accumulating closes, the moonbag_qualifying_strategies=[] override has been reverted somewhere — check `module_constants` row.
   - **liquidity_trap iteration-loop exclusion:** `strategy_disabled_bearish` reject reason should be ABSENT from recent strategy_internal nullReasons (was 7,342×/24h pre-B70.3).
   - **Post-composition floor 0.20:** newer `signal_eval_archive` admit rows should show `regimeConfidenceModulated` distributed below 0.45 (pre-B70.3b floor was binding 100% at 0.45; new floor 0.20 reveals the natural distribution).
   - **B72 sync-read API healthy:** PM2 boot logs show `[B72][INIT_OK] (pre-orchestrator)`. No `module_constants ... not warm` errors in error.log. All 35 prefetched modules warming clean.

4. **Plain-language interpretation:**
   - Which factors are decision-grade vs inert vs hurting (use predictive lift)
   - Which exit variant the data favors + by how much
   - Whether each of the last-2-days fixes (B70.3 momentum gate, B70.3b floor drop, moonbag disable, liquidity_trap exclusion, B72 lever migration) is working as designed — if not, name which one and what's off

5. **Recommendations** for any factor needing intervention before B67.5 wires (~2026-05-15).

**Sample CSV exporter:** `/tmp/b70-csv-flat.cjs` on staging if Kyle wants flat exports.

---

## Calibration windows (running in parallel)

B67.4 cheap-tier ends 2026-05-15 · B68.2 volume regime ends 2026-05-16 · B68.3 pair correlation ends 2026-05-16 · B68.1 multi-TF ends 2026-05-17. Gate: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **B67.5 consumer wiring** post-2026-05-15 if B67.4 passes.

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B67.4 / B68.2 / B68.3 / B67.5-prep / B68.1 | 2026-05-01 → -03 | Confidence chain (7 modulators) closed observational |
| B69 + B69.1/2/3 + B73.3 | 2026-05-03 → -04 | Asset class + UI + calibration viz fixes |
| B70 main + B70.1/.2/.3/.3b | 2026-05-04 → -05 | Unified archive + Path B momentum gate + floor drop |
| **B72 + B72.1 + B72.2 FULL** | 2026-05-05/06 | CLOSED. 18/18 canonical strategies DB-tunable. 49 modules / ~311 rows. B72.2 closed 9 in-class quant gap missed by B72 main |

---

## Open RUNNING_ISSUES (snapshot)

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52, #54
- RESOLVED: #55, #56–#59, BUG-2026-05-05-E/F/G (B72 hotfixes)

---

## Next session pickup priority

1. **Phase 16** (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP — next sequenced batch
2. **trading-engine.ts BUG-012 cleanup:** calculateGoalAlignmentScore (L130–209) is a duplicate of the alignment logic now-migrated in pre-execution-validator. Pre-existing issue, separate cleanup.
3. **Tier 2 governance housekeeping (deferred from B72):** SIM per-source-file annotations across ~25 PROMOTE files. No runtime impact.
4. **CLAUDE.md update:** correct "17 canonical strategies" → **18 canonical** (file-based 9 + in-class quant 9). Per B72.2 audit. Kyle confirmed 2026-05-06.

---

## Kyle Operating Directives (active)

- Don't pause to ask permission during workflow execution. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on every UI-touching batch.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline.
- **NO WORKAROUNDS.** Fix things properly. No new TypeScript errors.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- Sensitive credentials → staging `.env` via SSH only. Never commit / paste in chat.
- **Post-mass-migration discipline:** `grep -rn "<OLD_CONST>" server/ --include="*.ts"` on every removed const before push. `tsc --noEmit` on touched files as personal CI step.

---

## Session Behavior Invariants

- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- **Telegram 2-step:** `/tmp` file → `scp` → `MSG=$(cat)`. Step 1 CC: `openclaw message send --account ccdt-relay --thread-id 21`. Step 2 Langston: `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --reply-account default --reply-to "-1003575211453"`.
- VTS position sizing $1000 base → ~$150/trade. Intentional.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/POST_AUDIT_ROADMAP.md` — B72 + Phase 16
4. `1-system-manual/LEVER_INVENTORY.md` §10b (Langston Step 2 decisions), §10c (Slice 4 close), §11 (Step 3 plan), §12 (final closure summary)
5. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` — live DB-tunable settings snapshot
6. `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md` — most recent batch closure
7. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
