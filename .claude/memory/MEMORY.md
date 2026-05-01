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

## ⭐ B67 CALIBRATION WINDOW STATUS

**Status:** NOT YET STARTED. All 6 pre-window fixes done (B67.0/1/2/2.1/3/3.5 LIVE; commit anchors in BATCH_CATALOG). **Only B67.4 cheap-tier bundle remains** — scope + pre-audit Langston-approved (cc-inbox #856 + #857); implementation queued as the active next batch.

**Window starts when:** B67.4 ships clean AND post-deploy verification confirms all 5 factors emitting ablation rows (`b67_1_*` 3 rows + `b67_2_phase_preference` + `b67_4_outcome_feedback` + `b68_4_regime_age` + `b68_5_path_b_sustainability`).

**Window dates:** Start TBD (after B67.4 ships). End = Start + 14 days. Subsequent batches B68.2 → B68.3 → B68.1 each get their own ~14d mini-window. B69 ML-light deferred to end of pre-Phase-16.

---

## Current State (2026-04-30 night → 2026-05-01 — B74 + B74.1 SHIPPED, PM2 #124)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `b9c4ebbb` (B74.1 chunked-insert hotfix for Postgres 65,535-param bind limit)
- **Live state:** **All 6 B74 tables capturing data (RUNNING_ISSUES #41 RESOLVED).** equity_spot 261 syms / 2,255 OHLC + 22,455 ticker; **equity_perp 10/10 syms / 20,030 OHLC** (REST polling + 5.5 days of historical backfill) + 20,521 ticker; crypto_spot 375 syms / 18,976 OHLC + 7,582 ticker. xStocks universe expanded 38 → 245. Monitor panel `PassiveArchiveSection` live at Analytics → Drift Dashboard tab. Endpoint `/api/analytics/passive-archive-status` returns per-universe stored vs scanned with drift detection.

---

## ⭐ JUST COMPLETED (2026-04-30 night → 2026-05-01 — B74.1 follow-up: 3 deliverables + 1 hotfix)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `b8eba807` | **B74.1 ship** | Equity-perp OHLC fix (REST polling, RUNNING_ISSUES #41 RESOLVED) + xStocks expansion 38→245 + Monitor panel v1+v2 (cumulative scanned counters per archiver, aggregator, endpoint, UI panel) |
| 2 | `b9c4ebbb` | B74.1 hotfix | Chunked batch insert at CHUNK_SIZE=1000 to clear Postgres 65,535-param bind limit. Surfaced when initial perp REST poll backfilled 20,000 historical bars and Drizzle's bulk insert silently failed. BUG-2026-04-30-J logged. |

**Verification post-deploy:**
- equity_perp transitioned 0 → 20,030 OHLC rows / 10 of 10 syms (REST endpoint returns 2000 candles per call ≈ 5.5 days of backfill on first poll, ongoing 60s polls only insert new bars via dedup map)
- xStocks 261 active of 265 configured (all that stream WS data)
- Monitor endpoint live, returning structured per-universe data
- Langston Step-4 approved cc-inbox #874

## ⭐ Previously completed (2026-04-30 evening + night — B74 ship + Telegram routing fix, 6 commits)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1-2 | `9e9ff010` `b10640af` | B74 Step-1 scope + CLAUDE.md updates | B74 scope drafted, Langston Step-1 approved cc-inbox #867. CLAUDE.md §8 documents two-agent two-model fact (CCDT Communicator @ GPT-4.1, Langston @ Opus 4.6) + relay-session reset diagnostic. |
| 3 | `ce4a7e40` | **B74 v1 ship** | 21 files, 2,324 lines: scope + pre-audit + 6 partitioned tables + symbol canonicalizer extension + 3 archivers + 2 batch writers + bootstrap + 2 cron scripts + tests. Langston Steps-2/4 approved cc-inbox #869/#870. CI 3 of 4 green (TS Check legacy-baseline). PM2 #119. |
| 4 | `bd60add3` | B74 hotfix #1 | Config path resolution: `import.meta.url` doesn't survive esbuild bundle to dist/index.js → switched to `process.cwd()`-based path. Surfaced post-deploy when archivers showed connected=false. |
| 5 | `778cd4ed` | B74 hotfix #2 + #3 | (a) Partition off-by-one self-heal: bootstrap now ensures CURRENT-month partition exists with WARN log if missing. (b) FNV-1a hash low-bit bias on similar-suffix strings: added Murmur3 fmix32 finalizer; rebalanced 364/16 → 180/201 crypto sharding. |
| 6 | (governance) | B74 governance | BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES (3 new BUG entries D-F-G-H) + RUNNING_ISSUES (#41 perp OHLC backlog + #42 narration leak) + MEMORY. Langston Step-8 approved cc-inbox #873. |

**Live state PM2 #122:**
- B74 capturing across 5 of 6 tables (perp OHLC backlog #41)
- Crons added to root crontab
- Self-heal will catch any future current-month partition gaps
- B73.2 + Factor Calibration UI from earlier today still operational
- All B67.x foundation work still operational

**Telegram routing diagnostics:**
- ✅ Langston content replies land in thread 21 (post-policy revert + relay session archive)
- ❌ Langston narration ("Sent — Telegram #N to thread M") leaks to General/topic-1 — RUNNING_ISSUES #42, Langston self-fixing to NO_REPLY pattern
- ✅ cc-inbox round-trip working under reverted (original allowlist) policy

## ⭐ Previously completed (2026-04-30 afternoon, 1 commit)

| # | Commit | Layer | Outcome |
|---|---|---|---|
| 1 | `a98ce7ff` | **B73.2 + Factor Calibration UI** | Bar-derived ATR (14-bar TR avg from pre-entry bars) replaces proxy ATR for variant triggers. OHLC window extended to `entryTime + maxHoldMs` (7d) with pagination. `atr_live` + `atr_bar_derived` logged per variant for validation. New `computeFactorCalibration()` aggregator + `/api/analytics/factor-calibration` endpoint + `FactorCalibrationSection` UI panel (confidence-shift distribution + tertile WR + predictive lift per factor). Existing Factor Ablation Comparison panel marked SUBSTRATE. Wiped 180 useless inherited-only B73 rows. PM2 #119. |

## ⭐ Previously completed (2026-04-30 morning + late-evening — see BATCH_CATALOG for B67.0.1 + B73.1 + B73.2 + Factor Calibration UI panel)

Detail folded into BATCH_CATALOG / PHASE_HISTORY / CHANGES_AND_FIXES. Brief: morning B67.0.1+B73.1 ablation fixes (cc-inbox #864, commits `3afd8ed2`+`f6a0bb87`+`67cf66d9`); afternoon B73.2 bar-derived ATR + Factor Calibration UI panel (commit `a98ce7ff`).

---

## ⭐ Previously completed (2026-04-29 night — see BATCH_CATALOG for full detail)

14 commits covering: 2-file MEMORY pattern + 200-line cap (1632d392); **B67.4 scope + pre-audit** Langston-approved cc-inbox #856/#857 (commits 276ab697 / 541c9450 / 6240f372); Telegram identity-collapse fix (ab701b69 / 6354480b); **B73 full stack ship** (a747b646 data + a4bd0e6c UI/API + 49c711d2/f53b9d60 tests + 778a1fe9/53bd9a05 governance). All live state working pre-B74.

---

## ⭐ NEXT IMPLEMENTATIONS (priority order)

### ⭐ ACTIVE — B67.4 cheap-tier bundle implementation (start here post-compact)

This is the next batch we're picking up. Scope + pre-audit are already Langston-approved (cc-inbox #856 + #857). Implementation has not yet begun. Per Kyle directive 2026-05-01: this batch may span multiple compaction sessions; that's expected — the levers are split across sub-batches and each has its own scope/pre-audit gate.

**Pre-implementation read order (post-compact):**
1. `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — master plan, especially §0.11 (B67.4 cheap-tier bundle composition + reorganization rationale).
2. `Claude Comms and Packages/Scope Files/BATCH_67_4_SCOPE.md` — what we're shipping in this batch.
3. `Claude Comms and Packages/Scope Files/BATCH_67_4_PRE_AUDIT.md` — §D contains the 4 Langston refinements that are part of the binding plan: 7-day expiry on OutcomeFeedbackStore, B68.5 ablation as 0/1 numeric, EMA first-sample direct, refreshMacroContext split into 6 sub-methods.
4. `1-system-manual/POST_AUDIT_ROADMAP.md` for the broader B67/B68 sequencing.

**B67.4 cheap-tier bundle = 3 levers, one batch:**
- B67.4 outcome feedback (per-strategy WR EMA → confidence modifier)
- B68.4 regime-age first-class metric (replace heuristic with explicit per-pair regime-entry tracker)
- B68.5 Path B sustainability tightening (gate Path B with `dbsSlope ≥ b68_5DbsSlopeMin`)

**Implementation order (per pre-audit §D):**
- Migration SQL (11 module_constants across 3 modules: `outcome_feedback`, `regime_age`, `path_b_sustainability`)
- New `outcome-feedback-store.ts` (mirror `regimePhaseStore` pattern; 7d expiry per Langston Q2)
- `regime-phase.ts` — add `peekAgeMs` accessor
- `market-regime.ts` — split TFS branch into Path A / Path B-with-gate / Path B-rejected; add `dbsSlope` 3rd param + `b68_5DbsSlopeMin` to RegimeConfig
- `market-context-engine.ts` — split `refreshMacroContext` into 6 sub-methods + orchestrator (per Langston Q6)
- Update 4 callers of `calculatePairRegime`
- `signal-orchestrator.ts` + `vts-runner.ts` — apply B68.4 + B67.4 modulation, push 3 new alternate types via factor-ablation-emitter
- `paper-execution-engine.ts` + `vts-service.ts` — trade-close `updateEma` calls
- 3 new unit test files
- `npm run check` clean; bring diff to Langston Step 4 BEFORE push

**Workflow position:** Step 1 + Step 2 ALREADY Langston-approved. Resume at Step 3 (implementation).

### Post-B67.4 sequence

1. **Verify B67.3.5 calibration gates BEFORE merging B67.4 into pipeline:** `[regime-phase][backfill] applied` log lines on cold pairs; TFS confidence raw distribution shift (P10 ≤ 0.55, P50 ∈ [0.60, 0.80], P90 ≥ 0.80) on new closed trades; Phase distribution mix shift (LATE pairs visible); replay cron 04:00 UTC populating `regime_factor_alternates`; macro modifier diversifying (not pinned at 0.85). These gates were the original blocker pre-compact and may already be cleared by morning.

2. **B67 calibration window** (14d) starts when B67.4 deploys clean + post-deploy verification confirms all 5 factor types emitting ablation rows (`b67_1_*` 3 rows + `b67_2_phase_preference` + `b67_4_outcome_feedback` + `b68_4_regime_age` + `b68_5_path_b_sustainability`). Day 0 of 14.

3. **B67.5 wire confidence into 7 consumers** — only if calibration check passes (tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket). Must define post-composition floor first (Langston cc-inbox #856 Q6 — compound penalty-stack can drop to 0.566, below pre-B67 0.4 floor).

4. **B68.2 Volume regime → B68.3 Pair correlation → B68.1 Multi-timeframe agreement** — each gets its own ~14d mini-window post-B67.5. B68.1 multi-TF can leverage the 1-min crypto OHLC B74 is now archiving.

5. **B73 ongoing observation** — running in parallel; first variant winner declaration when n=200 total + n=50 per-regime accumulated. Pre-registered Sharpe-like metric.

6. **B69 ML-light** — deferred to end of pre-Phase-16.

7. **B72 lever-to-`module_constants` sweep** — final pre-Phase-19 batch. Can sweep any new constants B67.4 / B68.x / B69 added.

8. **B74 ongoing accumulation** — passive archive pipeline running per RUNNING_ISSUES log. Universe expands via PR.

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
