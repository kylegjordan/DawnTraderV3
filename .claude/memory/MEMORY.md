# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md`.
2. Read this file.
3. Read `1-system-manual/POST_AUDIT_ROADMAP.md` (B72 + Phase 16) and `1-system-manual/LEVER_INVENTORY.md` §10b/§11.
4. Start silent polling: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
5. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** announce polling status; confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough.

---

## CURRENT STATE — 2026-05-05

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `e9976287` (B72 Slice 3 done, MEMORY trim queued).
- **Live:** B70 + B70.1/.2/.3/.3b + B72 Slices 1, 2a-d, 3a-b on PM2 #161.
- **DB module_constants UPDATEs (no code commits):** `b67_5_post_composition_floor=0.20`, `b68_5_path_b_momentum_min=0.002`, `moonbag_qualifying_strategies=[]`.
- **Path B (TFS classifier) gate:** `(absDbs >= 0.30 && mom > 0.002)`. Trailing-after-target DISABLED — every trade exits at target.

---

## ACTIVE — B72 lever-to-`module_constants` sweep (Step 3 ~70% complete)

**Step 1 + Step 2** — CLOSED (Langston cc-inbox #903/#904/#906). Inventory at `1-system-manual/LEVER_INVENTORY.md`. ~180 unique PROMOTE levers, 15 HIGH-risk flagged. Decisions locked in inventory §10b.

**Step 3 progress:**

- ✅ Commit A — DBS routing guards (4 strategies, 4 rows, sync API + warmup hook + integration test). Step 7 verified, Langston signed off cc-inbox #908.
- ✅ Commit B SQL migration applied — 170 rows / 33 modules seeded on staging. Langston signed off cc-inbox #909.
- ✅ Slice 1 — DSE_CONFIG bulk read (position_sizing, 11 levers).
- ✅ Slice 2a — expectancy + RTB (8 modules, 16 levers).
- ✅ Slice 2b — 7 single-lever modules (vts_scoring, goals_weighting, dbs_calculation, paper_sizing, vts_service, cost_model, learning_governance).
- ✅ Slice 2c — pattern_pool / drift / paper-execution / signal-orchestrator (4 modules).
- ✅ Slice 2d — vts_runner (5 levers) + regime_age (1 lever).
- ✅ Slice 3a + 3b — all 9 strategy files (91 levers across `strategy.<key>` modules).
- **TOTAL LIVE: 31 modules / ~158 rows in production sync paths.** All warming verified in PM2 boot logs.

**Step 3 remaining (Slice 4 + deferred):**

- **Slice 4 HIGH-risk wiring** (Langston cc-inbox #910):
  - SQE precedence chain: `screener_filters` → `sqe_config` module_constants → source last-resort. Document 3-layer precedence in code.
  - `market_regime` `assembleRegimeConfig` extension — wire 5 remaining DEFAULT_REGIME_CONFIG fields (TFS desat/scale).
  - net-expectancy-kernel: caller-injection refactor (preserve pure-math contract — pass MIN_PWIN/MAX_PWIN/DI_PWIN_FACTOR as input, callers resolve from DB).
- **Deferred (need different patterns):**
  - `adaptive-manager.ts` DEFAULT_DECAY_RATE — singleton instantiated at module load; needs init-hook refactor.
  - `risk-concentration.ts` Directive 9.4 — same singleton issue.
  - `strategy-modes.ts` confidence floors — naming mismatch (NORMAL/DEFENSIVE/SURVIVAL vs migration's conservative/moderate/aggressive); reseed needed.
  - `pre-execution-validator.ts` goal_alignment + strategy_profiles — atomic-block migration.
  - `trade-safety.ts` guardrail_defaults — pre-existing fallback path.
- **Companion:** `server/scripts/dump-settings-registry.ts` → `1-system-manual/CURRENT_SETTINGS_REGISTRY.md`.
- **Pre-Step-3 sub-tasks pending:** 17-vs-9 strategy reconciliation; `DEFAULT_REGIME_CONFIG` migration-state enum.
- **Steps 4-11:** Langston full-diff review per slice; CI verification; governance updates (SYSTEM_MANUAL, SIM, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP §B72 closure, ADJUSTMENT_FRAMEWORK, BATCH_CATALOG, PHASE_HISTORY); `BATCH_72_COMPLETION_REPORT.md`.

**Critical pattern:** every PROMOTE module read from sync code MUST be added to `PREFETCH_MODULES` in `server/startup/b72-warmup.ts` BEFORE source consumers ship; boot hard-fails otherwise.

**Helpers in module-constants-service.ts:** `prefetchModule()`, `getCachedConstant<T>()`, `getCachedNumberRequired()`, `getCachedNumbersForModule()` (bulk), 60s background refresher.

**Skipping:** Phase 19.0.5 / F/K simulator / B70.2 follow-ups / liquidity_trap bullish redesign.

---

## RECURRING ANALYSIS RECIPE (trigger phrase: "**run the calibration review**")

When Kyle says "run the calibration review" / "review the factors" / similar:

1. `GET /api/analytics/factor-calibration?window=rolling_7d` — render 10-row factor table (avg shift, |shift|, max |shift|, n, % zero, REAL tertile WR, ALT tertile WR, predictive lift = REAL − ALT spread, status READY/ACCUMULATING).
2. `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — render 12-variant table (id, name, n, mean P&L %, Δ vs A, Sharpe, WR%, avg duration, exit-reason breakdown). Highlight A row, sort by Sharpe desc.
3. **Verify recent changes:**
   - b68_5 path_b_sustainability lift drifting from -2.0pp toward 0+ (B70.3 momentum-gate swap)
   - `exit_reason='TRAIL_hit'` ≈ 0 in last-24h `exit_decision_archive` (moonbag disabled)
   - `liquidity_trap` `strategy_disabled_bearish` ABSENT from recent strategy_internal reasons (B70.3 iteration-loop exclusion)
   - Floor 0.20 visible in newer signal_eval_archive admit rows (was 0.45 pinned 100%)
4. **Plain-language interpretation:** which factors decision-grade vs inert vs hurting (use predictive lift); which exit variant the data favors + by how much; whether recent changes are working.
5. **Recommendations** for any factor needing intervention before B67.5 wires.

**Sample CSVs:** `/tmp/b70-csv-flat.cjs` on staging.

---

## Calibration windows (running in parallel)

B67.4 cheap-tier ends 2026-05-15 · B68.2 volume regime ends 2026-05-16 · B68.3 pair correlation ends 2026-05-16 · B68.1 multi-TF agreement ends 2026-05-17. All gate: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **B67.5 consumer wiring** kicks off post-2026-05-15 if B67.4 passes.

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B67.4 / B68.2 / B68.3 / B67.5-prep / B68.1 | 2026-05-01 → -03 | Confidence chain (7 modulators) closed observational |
| B69 + B69.1/2/3 + B73.3 | 2026-05-03 → -04 | Asset class + UI + calibration viz fixes |
| B70 main + B70.1/.2/.3/.3b | 2026-05-04 → -05 | Unified archive + Path B momentum gate + floor drop |
| **B72 (active)** | 2026-05-05 → ongoing | Lever sweep — 31 modules / ~158 rows live |

---

## Open RUNNING_ISSUES (snapshot)

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52, #54
- RESOLVED: #55, #56–#59

---

## Kyle Operating Directives (active)

- Don't pause to ask permission during workflow execution. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on every UI-touching batch.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline.
- **NO WORKAROUNDS.** Fix things properly. No new TypeScript errors.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- Sensitive credentials → staging `.env` via SSH only. Never commit / paste in chat.

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
4. `1-system-manual/LEVER_INVENTORY.md` §10b (Langston decisions) + §11 (resumption checklist)
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
