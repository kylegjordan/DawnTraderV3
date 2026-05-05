# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL — DO IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** — 11-step workflow, governance tiers, comms protocol, SIM discipline.
2. **Read this file** for volatile state.
3. **Read `1-system-manual/POST_AUDIT_ROADMAP.md`** Phase 15c + Phase 16 + B72 sections.
4. **Start the silent polling chain**: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
5. **Acknowledge readiness to Kyle in one line.** Don't dump context.

**Do NOT** announce polling status. Do NOT confabulate. Do NOT skip SIM in any pre-audit. Do NOT wait on legacy-TS-baseline CI before deploying — Test Suite + Build + Docker Build pass is enough.

---

## CURRENT STATE — 2026-05-05 (PM2 #150 + module_constants UPDATEs)

- **Branch:** `migration/aws-supabase`
- **HEAD:** `a2ab2791` (governance gap-fill — B70.2 + B70.3 + B70.3b backfilled across 5 docs)
- **Live state:** B70 + B70.1 + B70.2 + B70.3 + **B70.3b (post-composition floor 0.45 → 0.20)**. B70 = 52.4 MB / B74 = 5.12 GB on staging.

**Recent module_constants changes (in DB, no code commits):**
- `b67_5_post_composition_floor` = 0.20 (was 0.45) — pure visibility, B70.3b
- `b68_5_path_b_momentum_min` = 0.002 (NEW; replaces slope gate) — B70.3
- `moonbag_qualifying_strategies` = `[]` — disables trailing-after-target

**Path B (TFS regime classifier) gate:** `(absDbs >= 0.30 && mom > 0.002)`. Old slope check retired (was -2.0pp predictive lift).

**Trailing-after-target DISABLED** — every trade exits at target. BE-stop unchanged.

---

## ACTIVE NEXT — B72 lever-to-`module_constants` sweep (IN PROGRESS, Step 2 partial)

**Why next:** Kyle directive 2026-05-05. Final pre-Phase-19 backstop. After B72 → Phase 16 → Phase 19.

**Step 1 — DONE.** Scope: `Claude Comms and Packages/Scope Files/BATCH_72_SCOPE.md`. Langston APPROVED with answers (cc-inbox #903) — defaults: GLOBAL `(*, *, *, *)` scope, single SQL migration, all 17 strategies in sweep, no preemptive sync-helper, single flat `LEVER_INVENTORY.md`. Addendum (cc-inbox #904): `CURRENT_SETTINGS_REGISTRY.md` live-snapshot deliverable + KEEP examples confirmed.

**Step 2 — CLOSED 2026-05-05** (Langston cc-inbox #906). All 6 tiers swept. Final unique PROMOTE: ~180 levers across core (52) + services (~30 dedup'd) + strategies (93) + risk/exec (+9 unique) + config (5 unique). KEEP ~115. ALREADY_MIGRATED 8. DB_GOVERNED_ELSEWHERE 2. Inventory: `1-system-manual/LEVER_INVENTORY.md`. Langston Step-2-closure decisions locked in inventory §10b.

**Step 3 — IN PROGRESS.** Commit A DONE + Step 7 verified (Langston cc-inbox #908). Commit B migration SQL DONE + Slice 1 source replacement DONE.

**LIVE on staging (PM2 #155 at 15:29:52 UTC):**
```
[B72][warmup] prefetched module_constants module='strategy_dbs_routing_guards' rows=4
[B72][warmup] prefetched module_constants module='position_sizing' rows=11
[B72][INIT_OK] module_constants sync-read modules warmed
```

**Commits landed on `migration/aws-supabase`:**
- `924a7c18` Commit A — DBS routing guards (4 rows + sync API + warmup hook + integration test). Step 7 verified, Langston-signed-off.
- `ca5282e6` Test fix (skipIf no DB).
- `875ef20f` Commit B migration SQL + bulk resolver. **170 unique rows seeded across 33 modules** on staging Supabase.
- `c5da0c3b` Commit B Slice 1 — position_sizing source replacement (DSE_CONFIG → getDSEConfig() bulk reader). Live, no errors.

**Helpers added to module-constants-service.ts:**
- `prefetchModule()` — async warmup, throws on first prefetch failure
- `getCachedConstant<T>()` — sync, throws on cold cache
- `getCachedNumberRequired()` — sync number, throws on missing/non-numeric
- `getCachedNumbersForModule()` — sync bulk Record<string, number> for per-module reads
- 60s background refresher (lazy, no-op in tests)

**REMAINING Step 3 work for next session:**

- **Slice 2 — Cross-strategy module source replacements.** ~25 files. Modules already seeded in DB:
  - `expectancy_kernel` (net-expectancy-kernel.ts: MIN_PWIN, MAX_PWIN, DI_PWIN_FACTOR + → also `directional_integrity`)
  - `expectancy_tuning` + `expectancy_gates` + `roi_gating` (expectancy.ts: per-regime ROI + winrate floors + ROI flex)
  - `goals_weighting`, `goal_alignment`, `strategy_profiles` (adaptive-goals-weight, pre-execution-validator)
  - `dbs_calculation`, `regime_age`, `correlation_matrix` (DB store, regime-age-factor, risk_index)
  - `cost_model`, `cost_geometry`, `rtb_ranking`, `rtb_config`, `queue_admission` (cost-metrics, ready_to_buy_service, quality_index)
  - `vts_runner`, `vts_service`, `vts_scoring`, `signal_orchestrator`, `paper_execution`, `paper_sizing`
  - `governance_modes`, `pattern_pool_gates`, `drift_detector`, `concentration_risk`, `guardrail_defaults`, `learning_governance`, `trailing_exit`, `adaptive_weights`
  - For each: add `getCachedNumbersForModule(...)` call OR `getCachedNumberRequired()` per lever; add module to PREFETCH_MODULES list.

- **Slice 3 — Strategy-tier source replacements (9 files, 93 levers).** Each strategy file: replace top-of-file constant block with `const c = getCachedNumbersForModule('strategy.<key>', { exchange:'*', assetClass:'*', strategy:'<key>', regime:'*' })` at top of detect(); rewire references. Pattern proven by Commit A's strong_bull_trend / defensive_hedge / reverse_impulse / morning_star DBS guard work. Add 9 new modules to PREFETCH_MODULES.

- **Slice 4 — HIGH-risk wiring.** SQE precedence chain (screener_filters → sqe_config module_constants → source last-resort). market_regime remaining DEFAULT_REGIME_CONFIG fields wired into MCE's `assembleRegimeConfig()`. VTS_MAX_CONCURRENT, EDGE_SENSITIVITY, FINALSCORE_DECAY_LAMBDA env-fallback compat preserved.

- **Companion: `server/scripts/dump-settings-registry.ts`.** Reads module_constants + screener_filters, outputs `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` sorted by module. Runnable on demand + post-deploy hook.

- **Pre-Step-3 sub-tasks still pending:**
  1. 17-vs-9 strategy reconciliation — only 9 files in `server/strategies/`; map remaining 8 (likely in `core/strategies/` or as inline detection in services)
  2. `DEFAULT_REGIME_CONFIG` migration-state enumeration (B70.3/B70.3b already migrated b68_5 + b67_5; Commit B SQL seeded 5 more remaining; verify nothing missed)
  3. Move strategies-tier 93-row table to companion `LEVER_INVENTORY_STRATEGIES.md`

- **Steps 4-11 remaining:** Langston full-diff review (Slices 2/3/4), CI verification, governance updates (SYSTEM_MANUAL appendix, SIM annotations, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP §B72 closure, ADJUSTMENT_FRAMEWORK, BATCH_CATALOG, PHASE_HISTORY), `BATCH_72_COMPLETION_REPORT.md`.

**Critical pattern reminder:** every PROMOTE module read from sync code MUST be added to `PREFETCH_MODULES` list in `server/startup/b72-warmup.ts` BEFORE source consumers ship; otherwise boot hard-fails.

**11-step workflow.** Steps 1+2 CLOSED. Step 3 ~30% complete. Steps 4-11 pending.

**Skipping for now:**
- Phase 19.0.5 — held until Phase 19 (Kyle 2026-05-05)
- F/K simulator deep-dive — already explained, no action
- B70.2 follow-ups (Parquet binary + integration tests) — defer
- liquidity_trap bullish redesign — far post-launch

---

## RECURRING ANALYSIS RECIPE (trigger phrase: "**run the calibration review**")

When Kyle asks for "the calibration review" / "review the factors" / similar trigger, do this without re-asking what:

1. **Hit `GET /api/analytics/factor-calibration?window=rolling_7d`** on staging — render the 10-row factor table:
   - For each factor: avg shift, |shift|, max |shift|, n, % zero
   - REAL tertile WR (low/mid/high) + REAL spread
   - ALT tertile WR + ALT spread
   - Predictive lift (REAL spread − ALT spread) — the decision-grade column
   - Status (READY / ACCUMULATING)
2. **Hit `GET /api/analytics/exit-strategy-ablation?window=rolling_7d`** — render the 12-variant table:
   - Variant ID + name, n, mean P&L %, Δ vs A baseline, Sharpe, WR%, avg duration, exit-reason breakdown
   - Highlight A (current baseline) row
   - Rank by Sharpe descending
3. **Verify recent changes are reflected:**
   - b68_5 path_b_sustainability lift should drift from -2.0pp toward 0+ (B70.3 momentum-gate swap, 2026-05-05)
   - Trailing-after-target exits should drop to ZERO in new closes (moonbag disabled 2026-05-05) — confirm via `exit_reason='TRAIL_hit'` count near zero in last-24h `exit_decision_archive` rows
   - liquidity_trap rejects (`strategy_disabled_bearish`) should be ABSENT from recent strategy_internal reasons (B70.3 iteration-loop exclusion)
   - Floor 0.20 should be visible in newer signal_eval_archive admit rows (was 0.45 pinned 100%)
4. **Plain-language interpretation:**
   - Which factors are decision-grade vs inert vs hurting (use predictive lift)
   - Which exit variant the data favors + by how much
   - Whether recent changes are working as intended
5. **Recommendations** for any factor that needs intervention before B67.5 wires

**Standard query CSV:** if Kyle wants fresh sample exports, use `/tmp/b70-csv-flat.cjs` on staging (already in place).

---

## Calibration milestones (running in parallel)

| Window | Day | Ends | Decision-grade gate |
|---|---|---|---|
| B67.4 cheap-tier | 4-5 of 14 | 2026-05-15 | tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket |
| B68.2 volume regime | 3-4 of 14 | 2026-05-16 | Same gate |
| B68.3 pair correlation | 3-4 of 14 | 2026-05-16 | Same gate |
| B68.1 multi-TF agreement | 2-3 of 14 | 2026-05-17 | Same gate (n=83 currently — wait n≥150) |

**B67.5 consumer wiring kicks off post-2026-05-15** if B67.4 calibration passes.

---

## Recent batch history (one-line)

| Batch | Date | HEAD | Note |
|---|---|---|---|
| B67.4 / B68.2 / B68.3 / B67.5-prep / B68.1 | 2026-05-01 → 2026-05-03 | various | Confidence chain (7 modulators) closed observational |
| B69 + B69.1/2/3 + B73.3 | 2026-05-03 → 2026-05-04 | `c1b2f2b8` | Asset class + UI + calibration viz fixes |
| B70 main + B70.1 | 2026-05-04 → 2026-05-05 | `7e059186` | Unified data archive + reject-stage capture |
| B70.2 + B70.3 + B70.3b + governance gap-fill | 2026-05-05 | `a2ab2791` | Gap-fill trade fields + Path B momentum gate + floor drop + governance |

---

## Open RUNNING_ISSUES (post-B70.3b, snapshot)

- OPEN: #39 CI TS legacy (Phase 16 will clean), #43/#49/#50/#53 four calibration windows running, #46 passive archive partition-aware index
- DEFERRED: #12e, #40, #44, #45, #52, #54 (#44+#45 fold into B67.5; #54 calibration aggregator framework refactor)
- RESOLVED: #55, #56-#59 (B70.x closures)

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through 11 steps.
- **Visual UI verification via Claude-in-Chrome on every UI-touching batch.**
- **Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline.**
- **NO WORKAROUNDS.** Fix things properly. **No new TypeScript errors.**
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- **Sensitive credentials → staging `.env` via SSH only.** Never commit / paste in chat.

---

## Session Behavior Invariants

- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive needed.
- **Telegram 2-step canonical:** `/tmp` file → `scp` → `MSG=$(cat)`. Step 1 CC: `openclaw message send --account ccdt-relay --thread-id 21`. Step 2 Langston: `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --reply-account default --reply-to "-1003575211453"`.
- VTS position sizing $1000 base → ~$150/trade. Intentional.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file (MEMORY)
3. `1-system-manual/POST_AUDIT_ROADMAP.md` — focus B72 + Phase 16
4. `1-system-manual/SYSTEM_IMPACT_MAP.md` — for any component touched in next batch's pre-audit
5. `Claude Comms and Packages/Batch Completion/BATCH_70_COMPLETION_REPORT.md` (most recent batch context)
