# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## ⭐ SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. Lock in: 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5 — incl. rule #14 KNOWN_NONEXISTENT_NAMES registry practice, Kyle directive 2026-04-30), Three-way comms protocol (§6 — two-step canonical form: CC sends via `--account ccdt-relay --thread-id 21`; brain delivery via `agent --deliver --reply-account default`; if relay session ever stale → archive-rename per §8.1), SIM discipline (§9). DO NOT ASK Kyle to remind me of these.
2. **Read this file (`MEMORY.md`)** for volatile state.
3. **Read the master regime overhaul plan** at `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` end-to-end — sections §0, §0.10, §0.11, §0.12 are the resolved-decisions + reorganization + foundation work + open discussion items.
4. **Read the active roadmap for the next batch** at `1-system-manual/POST_AUDIT_ROADMAP.md` — focus on the B67.4 cheap-tier bundle entry (3 levers: B67.4 outcome feedback + B68.4 regime-age first-class metric + B68.5 Path B sustainability tightening), and the subsequent batches B68.2 / B68.3 / B68.1 sequence. Also re-read `Claude Comms and Packages/Scope Files/BATCH_67_4_PRE_AUDIT.md` §D for the 4 Langston-approved refinements (7-day expiry on OutcomeFeedbackStore, B68.5 ablation as 0/1 numeric, EMA first-sample direct, refreshMacroContext split into 6 sub-methods).
5. **Read latest batch completion reports** in `Claude Comms and Packages/Batch Completion/` — most recent are `BATCH_74_COMPLETION_REPORT.md` (B74 + B74.1 closed 2026-04-30) and `BATCH_73_PROGRESS_REPORT.md` (B73 multi-week observation underway). Confirms current state vs. what's queued.
6. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently on every wake.
7. **Acknowledge readiness to Kyle in one line.** Don't dump context back at him.

**Do NOT** announce polling status. Do NOT confabulate about prior session details — read the file. Do NOT skip the SIM consultation in any pre-audit.

---

## ⭐ CALIBRATION WINDOW STATUS

**THREE windows running in parallel** per master plan §0.11.C step 5 (framework attributes per-factor independently):

- **B67.4 window:** Day 1 of 14, ends 2026-05-15. 7 factors.
- **B68.2 window:** Day 0 of 14, ends 2026-05-16. b68_2_volume_regime.
- **B68.3 window:** ⭐ **STARTED 2026-05-02 (Day 0 of 14).** Ends 2026-05-16. **All 9 factor types now emitting** ablation rows: b67_1_btc_dominance / funding_rates / mcap_momentum / b67_2_phase_preference / b67_4_outcome_feedback / b68_4_regime_age / b68_5_path_b_sustainability / b68_2_volume_regime / **b68_3_pair_correlation (NEW)**.

**Subsequent batch:** B68.1 Multi-TF agreement (~2 weeks; leverages B74's 1-min crypto OHLC archive). B69 ML-light deferred to end of pre-Phase-16.

**⚠ Langston O.1 escalating concern (cc-inbox #883):** 6-modulator compound penalty stack worst case ≈ 0.455. After B68.1 (7th modulator) ≈ 0.43, at the 0.4 floor edge. **B67.5 floor decision is now URGENT — no more deferring.**

---

## Current State (2026-05-02 — B68.3 SHIPPED, PM2 #129)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `1cd79f04` (B68.3 hotfix #1 — anti-correlation test fix)
- **Live state:** B68.3 + B68.2 + B67.4 all live. Modulation chain extended: `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation → clamp [0.4, 1.0]` (6 chain modulators now). All B74 archivers + B73 replay still running. Three calibration windows active in parallel.

---

## ⭐ JUST COMPLETED (2026-05-02 — B68.3 ship)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `98751a6c` + `0b9136b6` | **B68.3 v1 ship** | 7 files: migration (8 module_constants in `pair_correlation` module incl. `b68_3_idiosyncratic_threshold` per Langston §D.1) + rollback + `pair-correlation.ts` pure-function module (~225 lines) + MCE 8th refresh sub-method + 2 emit hooks + 16-case test file. Reuses spearmanRankCorrelation from strategy-helpers.ts. PM2 #129. |
| 2 | `1cd79f04` | Hotfix #1 | CI caught anti-correlation test using monotonic up vs monotonic down (Spearman ranks magnitude not sign → corr=+1, not -1). Added `makeAntiCorrelatedToNoisy` helper that negates noise deltas → produces sign-inverted returns → Spearman ≈ -1. Test now verifies `corr < -0.5` and `label = DRIFTING` per §D.2 invariant. Test-only fix, no production code. |

**Verification post-deploy PM2 #129:**
- All 9 factor types emitting in regime_factor_alternates: b67_1×3 + b67_2_phase_preference + b67_4_outcome_feedback + b68_4_regime_age + b68_5_path_b_sustainability + b68_2_volume_regime + **b68_3_pair_correlation (NEW)**.
- First B68.3 row metadata: corr=0.0076 (essentially independent of BTC), decorrelation=0.992, factor=1.0496 (at ceiling), label=IDIOSYNCRATIC, isBtcSelfReference=false, coldStart=false. Math checks: 1 + 0.992 × 0.05 = 1.0496 ✓
- B68.3 mini-window officially STARTED 2026-05-02 (Day 0 of 14, parallel with B67.4 + B68.2).

**Langston cc-inbox sequence:** Step 1 #883 (+§D.1 idiosyncratic_threshold), Step 2 #884 (+§D.2 |corr| absolute clarification), Step 4 #885 APPROVED (push it).

---

## ⭐ Earlier 2026-05-02 (B68.2 Volume Regime ship)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `50670465` | **B68.2 v1 ship** | 7 files: migration (8 module_constants in `volume_regime` module) + rollback + `volume-regime.ts` pure-function module (~225 lines) + MCE 7th refresh sub-method + 2 emit hooks (orchestrator + vts-runner) + 16-case test file. Langston Steps 1/2/4 cc-inbox #880/#881/#882 all approved. CI 3 of 4 green (TS Check legacy baseline). PM2 #128. |

**Verification post-deploy PM2 #128:**
- All 8 factor types emitting in regime_factor_alternates (window 5min): b67_1_btc_dominance, b67_1_funding_rates, b67_1_mcap_momentum, b67_2_phase_preference, b67_4_outcome_feedback, b68_4_regime_age, b68_5_path_b_sustainability, **b68_2_volume_regime (NEW)**.
- First B68.2 row metadata: score=0.358 / factor=1.018 / label=NEUTRAL / has_liquidation_spike=true / cold_start=false / samples=30. All fields correctly populated.
- B68.2 mini-window officially STARTED 2026-05-02 (Day 0 of 14, parallel with B67.4 window).

**B68.2 follow-up watchpoints:**
- Active-path orchestrator emit hook still uses any-cast on `MarketContext.ohlcData` (silent-skip when undefined). Active trading off so observational-only impact. Deferred to B67.5 per Langston cc-inbox #881 D.1 — RUNNING_ISSUES #44 carries.
- v2 follow-up: per-regime sensitivity tuning if calibration data shows uniform behavior is suboptimal. Already marked in scope §D.

---

## ⭐ Earlier 2026-05-01 (B67.4 ship + 3 hotfixes + heartbeat infra fix)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `24c88702` | **B67.4 v1 ship** | 18 files, +1569/-171: migration + outcome-feedback-store + regime-age-factor + RegimeConfig extension + market-regime Path B gate + regime-phase peekAgeMs + MCE 6-method refresh split + signal-orchestrator/vts-runner emit hooks + trade-close updateEma in both close paths + 3 unit test files. Langston Step-4 approved cc-inbox #879. |
| 2 | `173d1d59` | Hotfix #1 | regime_mapping_integrity test caught two hardcoded `'TREND_FRIENDLY_STABLE'` literals in B68.5 gate-admitted log lines — replaced with `REGIMES.TREND_FRIENDLY_STABLE` constant via canonical-regime-strategy-map import. |
| 3 | `f5fe7e71` | Hotfix #2 | MCE first-refresh threw unhandled rejection in CI test env (no Postgres). Wrapped Promise.all in try/catch — sub-methods still throw with explicit migration hints (preserving no-fallback intent); outer catch logs and `firstRefreshPending` stays true until success → next timer tick retries. §D.4 no-partial-config invariant preserved via `assembleRegimeConfig` gate + `computeContext` null guards. |
| 4 | `18165430` | Hotfix #3 | B68.5 ablation row not emitting because OHLC any-cast on `MarketContext.ohlcData` (which discards OHLC after compute) was always undefined — exactly Langston OBS-1 prediction. Switched vts-runner to function-scope `ohlcData` parameter. Active-path orchestrator hook still uses any-cast (deferred to B67.5 consumer wiring per Langston cc-inbox #879 Q2 — active trading off). |
| 5 | (infra) | Heartbeat fix | Discovered Langston topic-21 session was stuck on gpt-4.1-mini at 130% capacity. Root cause: `agents.defaults.heartbeat.model = "openai/gpt-4.1-mini"` was stamping mini onto the session record on every async-exec-result NO_REPLY ack, downgrading from agent default Opus 4.6. Solution per Kyle directive: deleted `heartbeat` + `subagents` blocks from `/root/.openclaw/openclaw.json`; restarted gateway. Purged stale topic-21 entry from `sessions.json`. Updated Langston's MEMORY.md with full B67.4 state + reset notice. Fresh Opus session UUID `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (same UUID, new jsonl). Verified post-restart: `agent:main:telegram:topic:21 → claude-opus-4-6 34k/200k`. |

**Verification post-deploy PM2 #126:**
- `[Phase14][MCE] First refresh complete — all 6 config groups loaded`
- 11 module_constants confirmed in DB (psql)
- All 7 factor types emitting in `regime_factor_alternates` (15-min window)
- Factor Calibration UI returns `factors:[]` at Day 0 (n<150 per bucket; expected — populates over 14d)
- Active-path orchestrator B68.5 hook still uses any-cast (acceptable for calibration window since active trading off)
- Two non-blocking observations from Langston #879: divide-out approximation at clamp boundaries (known limitation across all factor ablation rows); active-path persist hook deferred to B67.5

**Earlier 2026-04-30 work** — see BATCH_CATALOG for B74 + B74.1 + B73.1 + B73.2 + Factor Calibration UI panel + B67.0.1 ablation join fix. All operational.

---

## ⭐ NEXT IMPLEMENTATIONS (priority order)

1. **Day 0–14 calibration window observation.** Watch `regime_factor_alternates` accumulate. Goal: n ≥ 150 per (factor, tertile) bucket by Day 14 → calibration check (tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05). Calibration check determines whether B67.4 confidence is decision-grade for B67.5 wiring. Watch PM2 logs for `[B67.4][feedback]`, `[B68.4][freshness]`, `[B68.5][gate]` lines emerging at expected frequency.

2. **B67.5 wire confidence into 7 consumers** — gated on calibration check. Must define post-composition floor first (Langston cc-inbox #856 Q6 — compound penalty-stack can drop to 0.566 below pre-B67 0.4 floor). Will also wire active-path persist hook for `regime_confidence_modulated` (deferred from B67.4 per Langston cc-inbox #879 Q2). Will also fix active-path B68.5 OHLC plumbing in signal-orchestrator (deferred for same reason).

3. **B68.2 Volume regime → B68.3 Pair correlation → B68.1 Multi-timeframe agreement** — each gets its own ~14d mini-window post-B67.5. B68.1 multi-TF can leverage the 1-min crypto OHLC B74 is archiving.

4. **B73 ongoing observation** — running in parallel; first variant winner declaration when n=200 total + n=50 per-regime accumulated. Pre-registered Sharpe-like metric.

5. **B69 ML-light** — deferred to end of pre-Phase-16. Trains on data accumulated by B67.x + B68.x.

6. **B72 lever sweep** — final pre-Phase-19 batch. Sweep all new constants from B67/B68/B69.

7. **B74 ongoing accumulation** — passive archive pipeline running. Universe expansion via PR.

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
