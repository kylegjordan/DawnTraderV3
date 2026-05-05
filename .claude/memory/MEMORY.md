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

## CURRENT STATE — 2026-05-05 (PM2 #147)

- **Branch:** `migration/aws-supabase`
- **HEAD:** `5617ad72` (B70.2 gap-fill + storage display + regime archive deprecated)
- **Live state:** B67.5-prep + full B68.x chain + B69 + B69.1/2/3 + B73.3 + B70 + B70.1 + **B70.2 (gap-fill exit_decision/signal_eval state_snapshot, dashboard storage display, regime archive deprecated)**. B70 = 52.4 MB / B74 passive = 5.12 GB on staging. Four calibration windows running.

**Calibration findings (rolling 7d as of 2026-05-05):**
- Decision-grade winners: b68_2 volume_regime (+4.6pp lift), b68_3 pair_correlation (+4.1pp), b67_4 outcome_feedback (+2.8pp), b68_4 regime_age (+2.3pp). All READY.
- Promising but n too small: b68_1 multi_tf_agreement (+6.0pp lift, n=83 — wait for n≥150).
- **Inert/drag:** b67_2 phase_preference (+0.0pp, 99% zero shift confirms it's noop), b67_1 btc_dominance (-0.4pp).
- **Actively hurting:** b68_5 path_b_sustainability (-2.0pp lift, |shift|=0.4480 binary cuts). Recommend gate OFF until reformulated.
- Confidence chain is net-suppressive — every open trade pinned at 0.45 floor on `regimeConfidenceModulated`. Pre-B67.5 wiring this is observational; post-B67.5 expect admission cliff unless floor raised or b68_5 fixed.

**Exit ablation findings (n=743 trades, 7d):**
- Current baseline (A: BE on, trail on) is 9th of 12 variants at +0.197 mean P&L.
- Top variant: J no_trailing (BE on, trail off) at +0.293, +0.097 vs A, Sharpe 2.01.
- Decision pointer: keep BE-stop, drop trailing-after-target. Trailing is over-cutting winners; BE-stop is fine.
- F (no BE, trail on) and K (no BE, no trail) still nearly identical despite B73.3 fix — investigate before acting on F/K specifically. J vs A is solid.

**Closed-trade pattern observed:** 35 of 41 visible exits = BREAK_EVEN_STOP, 6 = STOP_LOSS, 0 TP, 0 TRAIL. Many BE_STOP fires on profitable trades that turn negative after costs — confirms ablation finding.

**Universe diversity gap:** every open + closed trade in the last week is TFS regime, ~strong_bull_trend. 17 strategies registered, ~2 actively trading. Reject_stage data should explain why.

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

## B70 CLOSED 2026-05-05 — Unified Data Archiving

**Final state:** 5 archive tables + 4 archivers + dashboard panel + retention cron all live and verified accumulating rows. Mode-agnostic per Kyle directive (scope §M). Completion report at `Claude Comms and Packages/Batch Completion/BATCH_70_COMPLETION_REPORT.md`.

**Step 1+2+4 approvals:** Langston cc-inbox #893, #894, #895, #896, #897, #898.

**Verified post-deploy PM2 #145:**
- pair_scan_archive: 196 rows in first 10min (mode='vts', source='mce-cycle')
- macro_feed_archive: 17+ rows at 60s cadence
- signal_eval_archive: 0 (admitted-path; pending first VTS admit)
- exit_decision_archive: 0 (pending first trade close)

---

## B70.1 CLOSED 2026-05-05 — All 4 follow-ups + SYSTEM_MANUAL appendix shipped

**Commits:** `977d3ff0` (VTS reject hooks) + `919e7015` (B62 runner + JSONL exporter) + `7c1bfafd` (unit tests) + `3555f600` (System Manual appendix).

**Verified:** signal_eval_archive accumulating with strategy_internal rows post-deploy (137 in first VTS cycle). Other reject stages (sqe/tcl) will populate when triggers fire (net_ev_below_floor / duplicate_position / max_open_trades). exit_decision_archive will populate on first VTS trade close.

**Deferred to potential B70.2 (not blocking):**
- FX5 pre-filter reject capture (pre_filter stage) — fx5-scanner.ts has multi-stage filterFailures complexity; VTS path covers 100% of today's traffic so the gap is non-critical
- Active-path SQE/RTB hooks — dormant until live trading turns on (Phase 21)
- Parquet binary format — JSONL.gz works for all current consumers (pandas/DuckDB/tsfresh/Qlib); pyarrow sidecar conversion is a 1-script follow-up

## ACTIVE NEXT — calibration milestones

---

## Calibration milestones (continued)

| Window | Day | Ends | Watch for |
|---|---|---|---|
| B67.4 | 3-4 of 14 | 2026-05-15 | Tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket |
| B68.2 | 2-3 of 14 | 2026-05-16 | Same gate, b68_2_volume_regime |
| B68.3 | 2-3 of 14 | 2026-05-16 | Same gate, b68_3_pair_correlation |
| B68.1 | 1-2 of 14 | 2026-05-17 | Same gate, b68_1_multi_tf_agreement |

**B67.5 consumer wiring** kicks off post-2026-05-15 if B67.4 calibration passes.

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
