# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## ⭐ SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. Lock in: 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5), Three-way comms protocol (§6 — **two-step canonical form** for Telegram + brain delivery: Step 1 sends CC's msg via `--account ccdt-relay`; Step 2 delivers to Langston's brain WITHOUT `--reply-account` so his reply uses `@LangstonDTBot` not `@CCDTCommsBot`. NEVER use `--reply-account ccdt-relay` on the agent --deliver call), SIM discipline (§9). DO NOT ASK Kyle to remind me of these — they are binding.
2. **Read this file (`MEMORY.md`)** for volatile state.
3. **Read `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`** end-to-end (master regime overhaul plan, sections §0 + §0.10 + §0.11 + §0.12 are the resolved-decisions + reorganization + foundation work + open discussion items). If anything in §0.12 is stale relative to commits past `35b9de16`, update it.
4. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently on every wake.
5. **Acknowledge readiness to Kyle in one line.** Don't dump context back at him.

**Do NOT** announce polling status. Do NOT confabulate about prior session details — read the file. Do NOT skip the SIM consultation in any pre-audit.

---

## ⭐ B67 CALIBRATION WINDOW STATUS

**Status:** NOT YET STARTED. All 6 pre-window fixes done. Only B67.4 cheap-tier bundle (step 7) remains.

**Window starts when:** B67.4 cheap-tier bundle (B67.4 outcome feedback + B68.4 regime-age first-class + B68.5 Path B sustainability tightening) ships AND post-deploy verification confirms all 5 factors emitting ablation rows correctly.

**Pre-window fix status:**
1. ✅ Lock window dates — placeholder updated each session
2. ✅ B67.2 phase transition log — verified working (false alarm, widened log window showed transitions firing)
3. ✅ Fallback removal — `cab55804` — all `??` config defaults throw; BTC/ETH funding weighting in `module_constants`; cold-start warmup fallback retained
4. ✅ B67.3 activation — `c1b314ad` + DB UPDATE — `pair_id_hash` persistence wired; cap actively gating cohort 0
5. ✅ B67.2.1 phase 1+2+3 — `141ec3c3` + `41abd541` + `575dbca4` — schema + active path + VTS path + UI (regime + conf + phase badge in same column) + CSV exports
6. ✅ Replay logic + cron — `3d1a1e7f` + `5e1031a6` + `33df2380` — VTS JSONL reader, signal-id pass-through fix, cron at 04:00 UTC
6.5 ✅ Persistence + dashboard cleanup — `8f417ca5` — `regimePhaseStore` and macro feed window persist to `/tmp/*.json`; legacy ablation rows hidden
6.6 ✅ B67.3.5 Pre-Window Hardening — `49209eb4` + `d97d47d7` — phase backfill from OHLC + TFS branch desat (continuous mapping [0.50, 0.90]). 5 module_constants. PM2 #114. First diversified macro modifier 0.85. Other 4 regime branches deferred (RUNNING_ISSUES #40).
7. ⏳ B67.4 cheap-tier bundle — NEXT

**Window dates:** Start TBD (after B67.4 ships). End = Start + 14 days. Day 0 of 14.

**Subsequent batches** (B68.2 → B68.3 → B68.1) get their own ~14d mini-windows. ML-light (B69) deferred to end of pre-Phase-16 batches.

---

## ⭐ Resolved 2026-04-29 evening — both items shipped in B67.3.5

Items 1 + 2 from the prior session's open-discussion list are RESOLVED in B67.3.5 (commits `49209eb4` + `d97d47d7`, PM2 #114). Phase backfill from OHLC + TFS branch desaturation. Other 4 regime branches deferred to post-window classifier-tuning batch (RUNNING_ISSUES #40).

---

## Current State (2026-04-30 afternoon — B73.2 + Factor Calibration UI SHIPPED, PM2 #119)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `a98ce7ff` (B73.2 bar-derived ATR + extended OHLC window + Factor Calibration aggregator/endpoint/UI panel)
- **Live state:** B73 fix re-shipped (variants STILL collapsed after morning B73.1; root cause was 1-min OHLC vs sub-minute live tick visibility — fixed via bar-derived ATR + 7d window). New Factor Calibration UI panel surfaces the predictive-value analysis Kyle wanted (confidence-shift distribution + tertile WR + per-factor predictive lift). Existing Factor Ablation Comparison panel labelled SUBSTRATE pre-B67.5; stays in UI per Kyle directive.

---

## ⭐ JUST COMPLETED (2026-04-30 afternoon, 1 commit)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `a98ce7ff` | **B73.2 + Factor Calibration UI** | Bar-derived ATR (14-bar TR avg from pre-entry bars) replaces proxy ATR for variant triggers. OHLC window extended to `entryTime + maxHoldMs` (7d) with pagination. `atr_live` + `atr_bar_derived` logged per variant for validation. New `computeFactorCalibration()` aggregator + `/api/analytics/factor-calibration` endpoint + `FactorCalibrationSection` UI panel (confidence-shift distribution + tertile WR + predictive lift per factor). Existing Factor Ablation Comparison panel marked SUBSTRATE. Wiped 180 useless inherited-only B73 rows. PM2 #119. |

## ⭐ Previously completed (2026-04-30 morning, 3 commits, hotfix sub-batch)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `3afd8ed2` | **B67.0.1 + B73.1 ablation fixes** | ADD COLUMN `regime_factor_alternates.strategy` + composite index; rewrote replay-ablation join to natural-key (symbol, evaluated_at±60s, strategy); plumbed `atrAtOpen` through `vts-service.persistRealPriceTrade` to B73 hook (drop the `(target-entry)/1.5` proxy); B73 Variant A pass-through (no re-simulation); B73 TIMEOUT inheritance (non-firing variants inherit realized exit, not synthetic mid); wiped 480 bad B73 rows + 1477 NULL-strategy B67 rows; tests rewritten. PM2 #117. Per Langston cc-inbox #864 Q1-Q4 all approved. |
| 2-3 | `f6a0bb87` `67cf66d9` | drift-dashboard aggregator alignment | Aggregator was querying `replay_outcome->>'notes' = 'admit_admit_no_delta'` but emitter writes `'pre_b67_5_both_admit'`; UI showed 0 counts. Aligned to actual emitter shape. `67cf66d9` fixes backticks-in-SQL-template build error. PM2 #118. |

**Verified end-to-end post-deploy:**
- B67.0.1: ad-hoc `npm run b67:replay-ablation` matched 4 rows (FLOW/USD strong_bull_trend close); API returns `bothAdmit=1 replayed=1` per factor (was 0)
- B73.1: First post-fix close populated 12 rows — A=`source: realized_truth`, B-L=`source: realized_inherited` with `be_latched: false`/`trail_active: false`/`phase: pre` metadata showing why each didn't fire on the first OHLC window
- 720-bar OHLC cap deferred to v2 watchpoint per Langston Q4 (max TIMEOUT duration was 283 min on pre-fix data, well under 12h)

---

## ⭐ Previously completed (2026-04-29 night → 2026-04-30 early, 14 commits)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `1632d392` | Governance | 2-file MEMORY pattern + 200-line cap added to CLAUDE.md §3.1/§3.2; B67.3.5 standalone completion report deleted, content folded into `BATCH_67_PROGRESS_REPORT.md` |
| 2-4 | `276ab697` `541c9450` `6240f372` | B67.4 scope + pre-audit | Cheap-tier bundle (B67.4 outcome feedback + B68.4 regime-age + B68.5 Path B sustainability gate). Langston Step 1/2 cc-inbox #856/#857 with 4 refinements: 7d expiry on OutcomeFeedbackStore, B68.5 ablation as 0/1 numeric, EMA first-sample direct, refreshMacroContext split into 6 sub-methods |
| 5-6 | `ab701b69` `6354480b` | Comms fix | Telegram identity-collapse fix: `--reply-account default` (Langston's @LangstonDTBot) not `ccdt-relay` (CC's @CCDTCommsBot). CLAUDE.md §6 updated with verified-working pattern |
| 7-8 | `a7c48007` `f0374418` | B73 scope + pre-audit + roadmap | Exit-strategy ablation framework — 12 variants observation only. POST_AUDIT_ROADMAP.md gains B73 + B74 entries + Phase 21.4 modularization note (no pre-launch batch). Langston Step 1/2 cc-inbox #861/#862 |
| 9 | `a747b646` | **B73 data layer ship** | Migration + `exit-strategy-replay.ts` (12 variants + simplified trailing state machine) + `exit-strategy-replay-service.ts` (orchestrator) + VTS `persistRealPriceTrade` async hook. PM2 #115. 13 module_constants seeded. Langston Step 4 cc-inbox #863. |
| 10 | `778a1fe9` | B73 governance pass | BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + RUNNING_ISSUES + MEMORY + new `BATCH_73_PROGRESS_REPORT.md`. Paper-execution-engine hook DROPPED per Kyle directive (research-mode framework, B67-style symmetry). |
| 11 | `a4bd0e6c` | **B73 UI + API** | `GET /api/analytics/exit-strategy-ablation` returning per-variant Sharpe-like scores with paired-diff vs Variant A baseline. New `ExitStrategyAblationSection` rendered under Analytics → Drift Dashboard tab. Per-regime filter dropdown + window selector + READY/ACCUMULATING badge. PM2 #116. |
| 12-13 | `49c711d2` `f53b9d60` | **B73 unit tests** | 12 variants + state machine + edge cases (gap bar, SELL direction, INSUFFICIENT_DATA, TIMEOUT). 3 initial float-precision assertion failures fixed in `f53b9d60` (test fixtures only). CI run `25136181772` GREEN. 916 tests passing total. |
| 14 | `53bd9a05` | B73 governance update | Tonight's UI + tests + float-precision fix folded into BATCH_CATALOG, PHASE_HISTORY, SIM, CHANGES_AND_FIXES, MEMORY, BATCH_73_PROGRESS_REPORT. |

**Live state PM2 #116:**
- All B67.0/1/2/2.1/3 + B67.3.5 + B73 (full stack: data + governance + UI + tests) LIVE
- **B67**: macro modifier diversifying (first non-1.0 was 0.85 with real z-scores), TFS desat continuous formula in use, phase backfill ready on cold pairs entering universe
- **B73**: data layer + UI + tests live; `exit_strategy_alternates` accumulates 12 rows per VTS trade close. Async fire-and-forget hook in `vts-service.persistRealPriceTrade`. UI viewable at Analytics → Drift Dashboard tab → bottom of page.
- **Calibration window NOT YET STARTED.** Starts when B67.4 cheap-tier bundle deploys clean.

---

## ⭐ NEXT IMPLEMENTATIONS (priority order)

1. **Tomorrow ~6 UTC verification gates (B67.3.5)** — REQUIRED before B67.4 implementation:
   - `[regime-phase][backfill] applied` log lines on cold pairs entering universe overnight
   - TFS confidence raw distribution shift (target P10 ≤ 0.55, P50 ∈ [0.60, 0.80], P90 ≥ 0.80) on new closed trades
   - Phase distribution mix shift — should see LATE pairs by 6 UTC (PM2 ~16h uptime, persistence file ~17.5h old)
   - Replay cron 04:00 UTC run + populated rows in `regime_factor_alternates`
   - Macro modifier diversifying (not pinned at 0.85 for the whole window)
   - New closed VTS trades carrying B67.2.1 fields populated correctly

2. **B73.2 + Factor Calibration verification** — first new VTS close post-PM2 #119 will populate 12 B73 rows; expect Variants B-L to differentiate now (bar-derived ATR triggers fire at bar resolution; F/K see post-exit reality via 7d window). Factor Calibration panel will show confidence shifts populating + tertile counts increasing as trades replay.

3. **B67.4 cheap-tier bundle implementation** (Step 3) per `BATCH_67_4_PRE_AUDIT.md` §D refinements. Order of operations:
   - Migration SQL (11 module_constants in 3 modules: outcome_feedback + regime_age + path_b_sustainability)
   - New `outcome-feedback-store.ts` (mirror regimePhaseStore pattern, 7d expiry per Langston Q2)
   - `regime-phase.ts` — add `peekAgeMs` accessor
   - `market-regime.ts` — split TFS branch into Path A / Path B-with-gate / Path B-rejected; add `dbsSlope` 3rd param + `b68_5DbsSlopeMin` to RegimeConfig
   - `market-context-engine.ts` — split `refreshMacroContext` into 6 sub-methods + orchestrator (per Langston Q6)
   - Update 4 callers of `calculatePairRegime`
   - `signal-orchestrator.ts` + `vts-runner.ts` — apply B68.4 + B67.4 modulation, push 3 new alternate types
   - `paper-execution-engine.ts` + `vts-service.ts` — trade-close `updateEma` calls
   - 3 new test files
   - `npm run check` clean; bring diff to Langston Step 4 BEFORE push

4. **B74 equity passive data collection** (Kyle directive 2026-04-29) — minimal: scan + store Kraken X-stocks + stock perp futures. New service file (NOT FX5 extension), plain dump tables, no schemas/processing/cohorting. Verify Kraken pair count first. Tomorrow scope.

5. **B73 first variant winner declaration** — when n=200 total + n=50 per-regime accumulated (~1.3 days of VTS volume for headline; longer for per-regime). Sharpe-like metric pre-registered.

6. **B67 calibration window** (14d) starts when B67.4 deploys clean + post-deploy verification confirms all 5 factor types emitting (`b67_1_*` 3 rows + `b67_2_phase_preference` + `b67_4_outcome_feedback` + `b68_4_regime_age` + `b68_5_path_b_sustainability`). Day 0 of 14.

7. **B67.5 wire confidence into 7 consumers** — only if calibration check passes (tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket). Must define post-composition floor first (pre-registered per Langston cc-inbox #856 Q6 — compound penalty-stack can drop to 0.566, below pre-B67 0.4 floor).

8. **B68.2 Volume regime → B68.3 Pair correlation → B68.1 Multi-timeframe agreement** — each gets its own ~14d mini-window post-B67.5.

9. **B69 ML-light** — deferred to end of pre-Phase-16.

10. **B72 lever sweep** — final pre-Phase-19 batch.

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through all 11 phases until closed. Stop only for deadlocks, architectural decisions Kyle owns, or new directives.
- **Code-level explanations in plain language when asked.**
- **VTS broadness is the design.** Don't propose changes that narrow VTS admission.
- **NO WORKAROUNDS.** Fix things properly. Don't ship workarounds — they compound.
- **No new TypeScript errors.** Legacy errors go to Phase 16. New code should not add to the count.
- **No fallbacks for DB-governed settings** (CLAUDE.md §11). If it should come from the DB, fail hard if missing — don't silently use a default. Cold-start warmup paths are NOT fallbacks (legitimate runtime states with telemetry).
- **No shadow theater for B67.** Confidence is decorative pre-B67.5; ship live, ablation framework collects evidence.
- **DM channel for autonomous work:** Telegram chat ID `8734856533` (Kyle's direct), NOT the batch implementation group `-1003575211453` thread 21.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram 2-step canonical** (`--reply-account default` on Step 2, NEVER `ccdt-relay`). /tmp file → scp → MSG=$(cat). **Step 1** (CC speaks via @CCDTCommsBot): `openclaw message send --channel telegram --account ccdt-relay --target "-1003575211453" --thread-id 21 --message "$MSG"`. **Step 2** (Langston replies via @LangstonDTBot): `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --message "$MSG" --reply-channel telegram --reply-account default --reply-to "-1003575211453"`. Kyle prefers replies in Claude Code Desktop app unless explicitly asked for Telegram.
- **VTS position sizing nominal $1000 base** producing ~$150/trade. Intentional — NOT a bug.
- **Langston brain session UUID:** `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (topic-21, Opus 4.6).

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 + §0.10 + §0.11 + §0.12
4. `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 15c sequencing (if mid-batch)
5. Latest batch completion / progress report in `Claude Comms and Packages/Batch Completion/` if mid-batch
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in current batch (B67.x foundation work section near the end)
