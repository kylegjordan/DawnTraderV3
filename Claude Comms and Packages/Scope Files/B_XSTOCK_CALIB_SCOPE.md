# B-XSTOCK-CALIB Umbrella — SCOPE v1

**Status:** Step 1.a Langston ACK clean (2026-05-27 evening, reply 7982 bytes) with 5 refinements absorbed below. Pending Langston Step 1 ACK on this scope.
**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Position:** Pre-Phase-19 calibration umbrella per Kyle directive 2026-05-27 evening — "all of the calibration work for XStocks that doesn't require trades closing in the active trading system." Sits before Phase 19 kickoff in the newly-locked Phase 19 / Phase 25 split (roadmap commit `7ab09cac3`).
**Predecessor:** B79.0n.EXECUTION (#13) CLOSED 2026-05-27 deploy `f283c2c` + governance close `6d6fc4c7a`.

---

## §0. Pre-kickoff: A.3 verification gate closure (per Langston Q2 Option B-prime)

**Status:** NOT a sub-batch with Step 1-11 workflow. Pre-umbrella-kickoff activity.

**Deliverable:** 1-2 page A.3 closure memo committed under `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md` (path TBD — Langston confirm preferred location).

**Activities:**
1. **Telemetry sub-check confirmation** — pull the 2026-05-20 ACK record for alert `7b33b931` from staging system-alerts.jsonl; confirm it covered ALL three sub-checks: `[B-PHASE-A2][CYCLE_DBS_TIMING]` per-cycle log + `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` one-shot + archive-row count + filter-diagnostics. If the ACK was telemetry-only and missed any sub-check, the memo includes a fresh check against current staging telemetry.
2. **Cross-pair DBS distribution comparison** — query archive: compare xStock DBS component-level distributions (slope / return / EMA / finalScore) against crypto's known distributions. Confirm values are moving (not stuck at zero or floor/ceiling).
3. **Volume-weighted-median skew analysis** — inspect whether top-5 xStock names exceed 60% volume weight per design rev2 §3.6 Langston C7. If severe, memo flags it for post-A.3 calibration consideration (equal-weighted or sector-equal-weighted alternatives).

**Acceptance:** memo committed + Langston ACK on it + Phase B can start at sub-batch 1.

**Estimated time:** 1-2 hours.

---

## §1. Sub-batch inventory (11 sub-batches)

Each sub-batch follows the full 11-step CLAUDE.md §2 workflow. Umbrella-level Step 11 completion report closes the entire arc.

| # | Name | What it does (plain language) | Outcomes needed? | Critical-path | Est. days |
|---|---|---|---|---|---|
| 1 | **B.1 regime threshold + TFS confidence-formula** | Tune the 14 `_XSTOCK` regime threshold constants for equity microstructure against archived OHLC + DBS. Tune TFS confidence-formula scales per regime. Capture `time_of_day_class` + `market_hours_open` + `is_rebalance_day` as sibling features. **Internally split B.1a (regime threshold uncontested) + B.1b (TFS confidence-formula Kyle-ACK-gated in Step 2 pre-audit).** | No (archive-replay) | YES | 3-4 |
| 2 | **B.2 IMF family threshold calibration** | Compute LQ / VN / DI / Correlation per pair per bar. Tune per-family rows in `screener_filters` for vts_trend / vts_reversal / vts_breakout / vts_strong_trend / vts_pattern. (Oscillator family removal is a Phase 16 separate batch.) | No (archive-replay) | parallel | 2-3 |
| 3 | **B.3 per-strategy gate calibration** | 10 enabled xStock strategies (9 crypto carryovers + ORB). Replace 26 wildcards in `module_constants` with xStock-specific values. Watchlist for redesign-not-retune: `pivot_shift` (pivot calc + overnight gap), `mean_reversion` (RSI excursion assumptions), `range_trade` (overnight bound-crossing). | No (archive-replay) | parallel | 2-3 |
| 4 | **B.4+B.5 friction + spread (coupled)** | Empirical spread + slippage distributions per xStock from archive. Retune `cost-model.ts` per asset class. Validate 3% max_bid_ask_spread threshold (B-NEW-14 starter Layer-1) — likely drops substantially given NVDA 0.026% / SPY 0.007% / TSLA 0.078%. Re-validate Net EV gate behavior. **SEQUENCING INVARIANT:** B.4 + B.5 ship as a single coupled-retune unit; NO other batch inserts between. | No (archive-replay) | YES | 3-4 |
| 5 | **B.6 TEC archive-replay priors** | Empirical ATR distributions per regime per xStock from archive. Set priors for trailing-stop ATR multipliers, BE-stop policy, moonbag policy. Clean separation from Phase 25 F-LATER: priors here, posteriors there. | No (archive-replay) | YES | 2-3 |
| 6 | **B.7 + roadmap 19-16 (sector concentration + cluster prevention)** | Position-sizing review (keep `position-sizing.ts` shared, don't fork). Add sector concentration gate using `XSTOCK_SPOT_REGISTRY` sector mapping as SSOT. Layer-1 starter: max 2-3 simultaneous positions per sector OR ~35-40% portfolio heat per sector. **Closes roadmap 19-16 (B79.6 sector-aware portfolio-cluster prevention)** — same surface, folded per Langston Q5(b) ACK. | No (structural) | parallel | 1-2 |
| 7 | **C.1+C.2 equity macro modifier** | Design + implementation. VIX level + change sigmoid-mapped to [0.85, 1.15]; DXY momentum added as second additive after first observation window. Sources: FRED (DXY / yield curves / treasury rates) + Yahoo (VIX intraday). Cadence: VIX 5min, FRED hourly. Wire into MCE's xStock branch (replace 1.0 placeholder in `module_constants.mce_config.xstock_spot.macro_modifier`). | No (formula + feed) | parallel | 3-5 |
| 8 | **D.1 strategy + regime audit (+ earnings-calendar slice of #97)** | Per-strategy audit of 9 crypto carryovers + ORB redesign (5/15/30/60min opening-range sweep vs archive). **Earnings handling: option (b) — block opens 24h before / 4h after scheduled earnings.** Equity-native additions: gap-fill YES; PEAD defer; sector rotation + index rebalance defer to Phase G. **Folds in earnings-calendar feed source decision from RUNNING_ISSUES #97** (likely Yahoo; Polygon if budget permits later). Broader xStock characteristics inventory (market-cap / P/E / IV / analyst ratings) stays separate per Langston Q5(c). | No (audit + design) | parallel | 3-4 |
| 9 | **CRYPTO-FRICTION review** | Audit existing crypto-side `cost-model.ts` friction parameters that were never explicitly re-validated. Required as B81 admission checklist item 2 so both crypto and xStock are on equal calibration footing before cross-asset ranking parity ships. **BATCH_CATALOG entry must cross-link** that this sub-batch satisfies BOTH the xStock B.4/B.5 retune (per-asset-class friction calibration) AND the standing crypto-friction-review prereq. | No (archive audit) | parallel | 3-5 |
| 10 | **F-NOW asset-class-tag plumbing** | Add `calibration_state TEXT` column to `vts_open_trades`. Default `'pre_calibration_xstock_2026_05'` for any xStock trade opened before Phase 25 ships. Propagates from `vts_open_trades` → `exit_strategy_alternates` row via the exit-strategy-replay-service writer. Aggregator query at `exit-strategy-ablation-aggregator.ts` adds `AND calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'` WHERE clause when scoped to xStocks. **Per Langston Q4 ask: dispatched FIRST into parallel slots, not last** — calibration_state column needs to exist before any xStock trade opens during the umbrella window, otherwise pre-calibration trades aren't tagged and get silently swept into Phase 25's dataset. | No (plumbing) | parallel (first slot) | 0.5 |

**Sub-batch count:** 11 (10 numbered + A.3 pre-kickoff memo).

**Critical-path serialized:** A.3 (pre-kickoff) → B.1 → B.4+B.5 → B.6. ~10-12 days.
**Parallel-capable:** B.2, B.3, B.7, C.1+C.2, D.1, CRYPTO-FRICTION, F-NOW. ~10-15 days total work, but absorbed into critical-path calendar via parallel slots subject to the Langston review queue cap.

**Review queue cap (per Langston Q4):** max 2 concurrent sub-batches at Step 4 code review at any time. Parallel slots queue if cap is hit.

**Total estimated calendar:** 12-17 days with hybrid sequencing (vs 17-26 strict-serial).

---

## §2. Sequencing diagram

```
                  Pre-kickoff (1-2 hr writeup)
                  A.3 verification memo
                          │
                          ▼
                     B.1 (3-4 d)        ◄── parallel slot 1 opens for F-NOW (0.5d)
                          │
                          ▼
                     B.4+B.5 (3-4 d)    ◄── parallel slots opportunistic: B.2 → B.3 → B.7 → C → D → CRYPTO-FRICTION
                          │                  subject to 2-concurrent-review cap
                          ▼
                     B.6 (2-3 d)
                          │
                          ▼
                Umbrella close (Step 11 completion report)
```

---

## §3. CC asks for Langston Step 1 review

**A1.** §1 chunking ACK — does the 11-sub-batch breakdown with embedded refinements match your Step 1.a reply, or anything to add/split/reorder?

**A2.** §0 pre-kickoff A.3 memo path — Langston OK with `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md`? Or prefer a different location (e.g., `Claude Comms and Packages/Batch Completion/`)?

**A3.** §1 sub-batch 1 B.1 internal split (B.1a / B.1b with Kyle-ACK gate on B.1b in Step 2 pre-audit) — happy with this framing, or want it explicit at Step 1 scope review by sending Kyle a short focused question right now rather than waiting for Step 2?

**A4.** §1 sub-batch 9 (CRYPTO-FRICTION) BATCH_CATALOG cross-link wording — happy with "satisfies BOTH the xStock B.4/B.5 retune (per-asset-class friction calibration) AND the standing crypto-friction-review prereq (#2 on B81 admission checklist)"? Or want different framing?

**A5.** Anything else worth catching before Step 2 pre-audit drafts (or pre-audits — one per sub-batch in critical-path order)?

**Reply format:** numbered point-by-point on A1-A5 is fine. If you ACK clean, CC proceeds to A.3 pre-kickoff memo draft, then sub-batch 1 (B.1) Step 2 pre-audit.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-xstock-calib/B_XSTOCK_CALIB_SCOPE.md` after SCP. Synthesis Step 1.a doc also in same inbox folder for cross-reference.
