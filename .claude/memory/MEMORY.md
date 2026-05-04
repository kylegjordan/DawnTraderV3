# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5), Three-way comms protocol (§6), SIM discipline (§9), Kyle preference: visual UI verify via Claude-in-Chrome on UI-touching changes (§11). DO NOT ASK Kyle to remind me.
2. **Read this file** for volatile state.
3. **Read `1-system-manual/POST_AUDIT_ROADMAP.md`** Phase 15c sequencing — focus on B70 (now active) + calibration windows + B67.5 wiring.
4. **Verify the four 2026-05-04 bug fixes are working** before doing anything else (see "Verification asks" below).
5. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
6. **Acknowledge readiness to Kyle in one line.** Don't dump context.

**Do NOT** announce polling status. Do NOT confabulate. Do NOT skip SIM in any pre-audit. Do NOT wait on legacy-TS-baseline CI before deploying — Test Suite + Build + Docker Build pass + Kyle directive 2026-05-04.

---

## CURRENT STATE — 2026-05-04 (PM2 #141)

- **Branch:** `migration/aws-supabase`
- **HEAD:** `c1b2f2b8` (B69.3 CoinGecko Demo API key + 429 backoff)
- **Live state:** B67.5-prep + full B68.x chain + B69 asset class + B69.1 UI follow-up + B69.2 b67_2 viz fix + B73.3 F/J simulators + B69.3 CoinGecko fix all live. Four calibration windows running.

---

## VERIFICATION ASKS — RUN BEFORE STARTING B70

Four fixes shipped 2026-05-04 still need post-cron verification (next nightly replay-ablation cron at 04:00 UTC). Run these checks:

**B69.3 CoinGecko fix (immediate — should already be visible):**
```bash
ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 200 --nostream 2>&1 | grep -E \"B67\\.1.*feed|Demo API key|HTTP 429\" | tail -20'"
```
Expected: `[B67.1][feed] CoinGecko Demo API key present` startup line + recent `btc_dom=58.XX% mcap_mom=Y.YYYYY` real-value snapshots + zero or rare `HTTP 429`. If `[B67.1][feed][AUTH]` appears → key is wrong, check `.env`.

**B69.2 b67_2 visibility (post-04:00 UTC cron):**
Open staging Analytics → Drift Dashboard → Factor Calibration. Check `b67_2_phase_preference` row — `avg shift`, `avg |shift|`, `max |shift|` should all be non-zero. `% trades shift = 0` should drop from 100% to ~30-40% (the genuinely weight=1.0 fraction).

**B73.3 F/J variants (post-04:00 UTC cron):**
Same UI page → Exit Strategy Ablation panel. F, J, K rows should now show **differentiated** Δ vs A and Sharpe. K should still be ≈ +0.090 vs A (its sim didn't change). F's exit reasons should include TRAIL_hit. J's exit reasons should include BE_stop + TP_target_hit but no TRAIL_hit.

**B69.1 UI surfacing (already visually verified Closed Trades; check Open Trades once VTS opens new trades):**
Machine Learning page → Open Trades tab. Symbol cell should render symbol on top, AssetClassBadge (e.g., orange "Crypto Spot" pill) below. Same on Closed Trades.

If all four pass → resume B70 workflow. If any fail → diagnose + patch before B70 to keep calibration data clean.

---

## ACTIVE BATCH — B70 Data Archiving (Step 3.1 NEXT)

**Status as of 2026-05-04 end of session:**
- Step 1 (scope) — APPROVED Langston cc-inbox #893. `Claude Comms and Packages/Scope Files/BATCH_70_SCOPE.md`.
- Step 2 (pre-audit) — APPROVED Langston cc-inbox #894. `Claude Comms and Packages/Scope Files/BATCH_70_PRE_AUDIT.md`.
- Mid-Step-2 Kyle directive folded — mode-agnostic capture (scope §M).
- Langston refinement folded — `mode` + `source` two-column discriminator (Langston cc-inbox #896).
- Step 3.0 (run-mode accessor strategy) — APPROVED. Plan: create `server/services/run-mode-controller.ts` with `getCurrentMode()` derived from existing `isEngineActiveLive` / `isEngineActivePaper` flags from `trading-state-sync.ts`. Default = `'vts'`. **Don't extend the existing 2-mode `TradingMode` type — Phase 27.4 wiring has high blast radius.**
- **NEXT: Step 3.1 — migration commit.** 5 partitioned tables + GIN partial indices + 11 module_constants seed rows + 2 cron lines. Mirror B74 partitioning pattern.

### Step 3 implementation order (from pre-audit §9, locked)

1. **3.0** Create `getCurrentMode()` accessor (~30 lines, pure derivation).
2. **3.1** Migration: 5 tables (`pair_scan_archive`, `signal_eval_archive`, `exit_decision_archive`, `macro_feed_archive`, `b62_retroactive_labels`) + rollback + seed.
3. **3.2** `archive-batch-writer.ts` (mirror B74).
4. **3.3** `macro-feed-archiver.ts` (lowest cadence, prove pattern).
5. **3.4** `pair-scan-archiver.ts` (60s cadence, MCE hook with try/catch).
6. **3.5** `exit-decision-archiver.ts` (low cadence, VTS + paper-engine hooks).
7. **3.6** `signal-eval-archiver.ts` (highest cadence, kill-switch toggle).
8. **3.7** `b62-relabel-runner.ts` (one-shot script).
9. **3.8** Drift Dashboard `DataArchiveSection` panel + API route.
10. **3.9** Parquet exporter (off-by-default).

Each step independently deployable + verifiable.

### Critical design properties (don't lose between sessions)

- **Mode-agnostic capture** (scope §M, Kyle directive 2026-05-04): hooks land in all three execution paths (signal-orchestrator live, paper-execution-engine paper-sim, vts-runner vts) — they fire when their path activates. No code change at mode transitions.
- **`mode` + `source` two columns** on every archive table (Langston #896). `mode` = system-state (from accessor). `source` = hook origin (hardcoded per call site). Diverge in VTS-always-on edge case.
- **JSONB columns** with `schema_version: 1` field embedded inside each blob (D.3). Bump on breaking shape changes.
- **Kill-switch** `b70_signal_eval_pre_filter_capture` (default `true`) — if 7-day measurement shows worst-case volume (>80M/90d), flip false to capture only post-SQE evals.
- **Mandatory try/catch + bounded queue** on every archiver hook in MCE / signal-orchestrator / vts-runner / paper-execution-engine. Hot path must NEVER block.
- **Retention sweep** = batched DELETEs (10k rows + 100ms pause). Never bulk DELETE. Cron at 02:00 UTC.

### Files referenced

- Scope: `Claude Comms and Packages/Scope Files/BATCH_70_SCOPE.md`
- Pre-audit: `Claude Comms and Packages/Scope Files/BATCH_70_PRE_AUDIT.md`
- Roadmap: `1-system-manual/POST_AUDIT_ROADMAP.md` lines ~119 (B70) + Phase 17.6 + 18.5 (Trend Mining Engine)
- SIM components consulted: §1.x (math), §4.1 (signal-orchestrator), §5.2.5 (MCE), §6.1 (paper-engine), §7.1 (VTS), §10.4 (TradingModeContext), §1124 (B74 mirror), §1163 (Drift Dashboard aggregator)
- Trading-mode existing wiring: `server/services/trading-state-sync.ts` (Phase 27.4) — DO NOT modify, just read its flags
- `cc-inbox` references: #893 scope APPROVED, #894 pre-audit APPROVED, #895 mode-agnostic re-confirmation, #896 mode/source two-column refinement.

### Verification asks status (pre-Step-3.1)

- B69.3 CoinGecko fix — VERIFIED clean (zero 429s since PM2 #141 restart, varied modifier values).
- B69.2 b67_2 viz — fix correct in code, calibration row still 100% zero (window dominated by pre-fix trades). Will surface as new trades accumulate.
- B73.3 F/J/K — fix correct in code, F/J/K still identical in 24h window. Next 04:00 UTC cron differentiates.
- B69.1 Open Trades badge — pending fresh VTS trade.

---

## Following batches (sequential)

1. **B67.5 consumer wiring** — gated on B67.4 calibration check ~2026-05-15. Wires confidence into 7 consumers + deletes RegimeWeight + handles RUNNING_ISSUES #44/#45.
2. **External Data Tier-2 decision gate** — evaluate AFTER 14d windows close + B67.5 lands.
3. **B72 lever sweep** — final pre-Phase-19 backstop.
4. **ML-light** (renumbering needed — collision with B69 schema work; next available number is **B75** since B71/B72/B73/B73.x/B74/B74.1 all taken).

---

## Calibration milestones (running in parallel with B70)

| Window | Day | Ends | Watch for |
|---|---|---|---|
| B67.4 | 2-3 of 14 | 2026-05-15 | Tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket |
| B68.2 | 1-2 of 14 | 2026-05-16 | Same gate, b68_2_volume_regime |
| B68.3 | 1-2 of 14 | 2026-05-16 | Same gate, b68_3_pair_correlation |
| B68.1 | 0-1 of 14 | 2026-05-17 | Same gate, b68_1_multi_tf_agreement |

---

## Recent batch history (2026-05-01 → 2026-05-04)

| Batch | Date | Commit | Status |
|---|---|---|---|
| B67.4 cheap-tier bundle | 2026-05-01 | `24c88702` + 3 hotfixes | LIVE PM2 #126 |
| B68.2 Volume Regime | 2026-05-02 | `50670465` | LIVE PM2 #128 |
| B68.3 Pair Correlation | 2026-05-02 | `98751a6c` + fixes | LIVE PM2 #129 |
| B67.5-prep (floor 0.45) | 2026-05-03 | `1d25cb7c` | LIVE PM2 #130 |
| B68.1 Multi-TF Agreement | 2026-05-03 | `cb861176` | LIVE PM2 #135 |
| B69 Asset Class | 2026-05-03 | `18372159` + `eea7c031` | LIVE PM2 #137 |
| B69.1 Asset Class on Open/Closed Sim Trades | 2026-05-04 | `7fab9306` + `ebe199b5` | LIVE PM2 #138 |
| B69.2 b67_2 visibility fix | 2026-05-04 | `1efb1599` | LIVE PM2 #139 |
| B73.3 F/J simulator fix | 2026-05-04 | `17a35c50` | LIVE PM2 #140 |
| **B69.3 CoinGecko Demo key + 429 backoff** | **2026-05-04** | **`c1b2f2b8`** | **LIVE PM2 #141** |

---

## Open RUNNING_ISSUES (7 OPEN, 6 DEFERRED, 1 IN PROGRESS, 0 CRITICAL)

- **OPEN #39** CI TS legacy. **#43 #49 #50 #53** four calibration window observations. **#46** passive archive partition-aware index. **#55** B69.x/B73.3 fix verification.
- **DEFERRED #12e #40 #44 #45 #52 #54** — to specific future batches. #44 + #45 fold into B67.5. #54 calibration aggregator framework refactor (deeper fix; B69.2 quick fix shipped).
- **IN PROGRESS #42** narration leak (moot — only topic 21 active).

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through 11 steps.
- **Visual UI verification via Claude-in-Chrome on every UI-touching batch.**
- **Deploy after Test Suite + Build + Docker Build pass — DON'T wait on legacy TS Check baseline** (Kyle directive 2026-05-04).
- **VTS broadness is the design.** Don't narrow VTS admission.
- **NO WORKAROUNDS.** Fix things properly. **No new TypeScript errors.** Legacy → Phase 16.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- **DM channel for autonomous work:** Telegram chat ID `8734856533` (Kyle's direct).
- **Sensitive credentials (API keys, etc.) go directly to staging `.env`** via SSH — never paste in chat / commit to repo.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram 2-step canonical** (`--reply-account default` Step 2). /tmp file → scp → MSG=$(cat). Step 1 (CC speaks via @CCDTCommsBot): `openclaw message send --channel telegram --account ccdt-relay --target "-1003575211453" --thread-id 21 --message "$MSG"`. Step 2 (Langston via @LangstonDTBot): `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --message "$MSG" --reply-channel telegram --reply-account default --reply-to "-1003575211453"`.
- **Mini-batch streamlining:** small surface batches can combine Steps 1/2/4 into one Langston review.
- **VTS position sizing nominal $1000 base** producing ~$150/trade. Intentional.
- **Langston brain session UUID:** `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (topic-21, Opus 4.6).
- **GDrive npm install fails with EBADF** on cold tree — CI is verification gate.
- **CoinGecko Demo API key in staging `.env`** as `COINGECKO_API_KEY=CG-...` — required for B67.1 macro feed reliability. Don't commit.

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 15c — focus B70 entry + Phase 17.6 / 18.5 Trend Mining Engine notes
4. `Claude Comms and Packages/Batch Completion/BATCH_69_COMPLETION_REPORT.md` (B69.1/2/3 closure sections)
5. `Claude Comms and Packages/Batch Completion/BATCH_73_PROGRESS_REPORT.md` (B73.3 closure section)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in B70 pre-audit
