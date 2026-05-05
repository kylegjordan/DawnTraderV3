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

## CURRENT STATE — 2026-05-05 (post-B72 close)

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `791e72b5` (B72 governance + B72.1 strategy-modes naming reseed).
- **Live:** B70 + B70.1/.2/.3/.3b + B72 main (Slices 1, 2a-d, 3a-b, 4) + 3 post-deploy hotfixes + B72.1 partial. PM2 #163.
- **DB module_constants UPDATEs (no code commits):** `b67_5_post_composition_floor=0.20`, `b68_5_path_b_momentum_min=0.002`, `moonbag_qualifying_strategies=[]`.
- **Path B (TFS classifier) gate:** `(absDbs >= 0.30 && mom > 0.002)`. Trailing-after-target DISABLED — every trade exits at target.
- **35 modules / ~166 levers DB-tunable** via SQL UPDATE → 60s wait → behavior change. Live snapshot: `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` (293 module_constants + 28 screener_filters rows).

---

## B72 — CLOSED 2026-05-05 (main shipped + Tier 2 governance + B72.1 partial)

**Steps 1-11 all closed.** Completion report: `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md`. Langston sign-offs: cc-inbox #903/#904/#906/#908/#909/#910/#911.

**Architecture shipped:** `prefetchModule()` + `getCachedConstant<T>()` + `getCachedNumberRequired()` + `getCachedNumbersForModule()` (bulk) + 60s background refresher in `module-constants-service.ts`. Boot hard-fail in `server/startup/b72-warmup.ts` PREFETCH_MODULES list. **Warmup runs BEFORE `bootOrchestrator.initialize()`** in `server/index.ts` (BUG-2026-05-05-E hotfix).

**3 post-deploy hotfixes (all RESOLVED):**
- BUG-2026-05-05-E (`c1afdfac`): warmup wired AFTER Boot Orchestrator → VTS auto-start failed permanently → 1+ hour outage. Moved warmup to pre-orchestrator.
- BUG-2026-05-05-F (`4ad40b95`): `VTS_MAX_CONCURRENT_PER_COMBO` undefined at 2 missed callsites in vts-runner.ts.
- BUG-2026-05-05-G (`1a3038a4`): `FRICTION_SAFETY_BUFFER` / `ROI_MIN` / `ROI_MAX` undefined at 2 missed callsites in expectancy.ts.
- **Pattern lesson:** post-mass-migration, run `grep -rn "<OLD_CONST>" server/ --include="*.ts"` before push. Recommend `tsc --noEmit` on touched files (legacy TS-baseline failure masks new errors).

**Tier 2 governance shipped:** SYSTEM_MANUAL Configuration Surface appendix · ADJUSTMENT_FRAMEWORK §0 (operator workflow) · CHANGES_AND_FIXES BUG-E/F/G entries · POST_AUDIT_ROADMAP §B72 close mark.

**B72.1 carry-over status (1 of 6 done):**
- ✅ `strategy-modes` confidence-floor naming reseed (`791e72b5`) — 3 new NORMAL/DEFENSIVE/SURVIVAL-named rows; `STRATEGY_MODE_OVERLAYS.confidenceFloor` is `Object.defineProperty` getter.
- ⏳ `adaptive-manager.ts` DEFAULT_DECAY_RATE — singleton instantiated at module load; needs lazy `getEffectiveConfig()` refactor.
- ⏳ `risk-concentration.ts` Directive 9.4 guards — same singleton-init pattern.
- ⏳ `pre-execution-validator.ts` goal_alignment + strategy_profiles — atomic 4-weight `alignmentScore` block (HIGH-risk).
- ⏳ `trade-safety.ts` guardrail_defaults — pre-existing fallback path; low priority.
- ⏳ 17-vs-9 strategy reconciliation pass — only 9 files in `server/strategies/`; map remaining 8 canonical strategies.

**Tier 2 governance still pending:** SIM per-source-file annotations across ~25 PROMOTE files (housekeeping; no runtime impact).

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
| **B72 + B72.1 partial** | 2026-05-05 | CLOSED. Lever sweep — 35 modules / ~166 rows live |

---

## Open RUNNING_ISSUES (snapshot)

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52, #54
- RESOLVED: #55, #56–#59, BUG-2026-05-05-E/F/G (B72 hotfixes)

---

## Next session pickup priority

1. **B72.1 carry-over remaining 5 items** (rows seeded; source wiring deferred):
   - adaptive-manager singleton-init refactor
   - risk-concentration singleton-init refactor
   - pre-execution-validator goal_alignment atomic block (HIGH-risk)
   - trade-safety guardrail_defaults
   - 17-vs-9 strategy reconciliation pass
2. **Tier 2 governance housekeeping:** SIM per-source-file annotations across ~25 PROMOTE files
3. **Phase 16** (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP — next sequenced batch

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
