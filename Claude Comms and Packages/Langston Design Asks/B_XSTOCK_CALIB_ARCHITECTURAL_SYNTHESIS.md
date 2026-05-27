# B-XSTOCK-CALIB Step 1.a — Architectural Synthesis + Pre-Scope Discussion

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Step 1.a pre-scope read for the xStocks calibration umbrella. This is the next batch per Kyle directive 2026-05-27 evening: "our next batch will be to do all of the calibration work for XStocks that doesn't require trades closing in the active trading system" + "After that, we will finalize the asset class onboarding workflow."

---

## Context

- **Predecessor:** B79.0n.EXECUTION (#13) CLOSED 2026-05-27 evening, deploy `f283c2c`.
- **Position:** This batch sits BEFORE Phase 19 in the newly-locked Phase 19 / Phase 25 split (roadmap commit `7ab09cac3`). Kyle's framing: this is "calibrations that don't require trade outcomes" — covers all of `XSTOCK_CALIBRATION_PLAN.md` Phase A residuals + Phase B + Phase C + Phase D + crypto-friction-review + Phase F-NOW.
- **What's already shipped from the calibration plan:** Phase 0 (corporate actions + halts + dividends via B-NEW-42 + B-NEW-42b); Phase A.1 (DBS design call shipped 2026-05-17); Phase A.2 (DBS implementation + backfill shipped 2026-05-17 — 31,481 rows / 260 of 265 symbols / 14 sector tags).
- **What's NOT in this batch (sits in Phase 25):** Phase E.1-E.3 factor identification + calibration (needs trade outcomes); Phase F-LATER exit-strategy posteriors (needs trade outcomes); Phase G cross-asset ranking parity (post-launch).

---

## §1. Inventory of work in scope

| Sub-batch | From CALIB PLAN | Description | Est. days | Outcomes needed? |
|---|---|---|---|---|
| **A.3** | Phase A.3 | DBS verification gate close. Cross-pair distribution check + volume-skew analysis + ARCA-open telemetry verification. Alert `7b33b931` already fired Mon 2026-05-18T13:35Z (may have already been processed); the 2026-05-31 alert `b83b1e4b` is for B-NEW-40 not A.3. | 0.5-1 | No — observation-only against archive |
| **B.1** | Phase B.1 | Regime classifier threshold + TFS confidence-formula calibration. Tune 14 `_XSTOCK` regime threshold constants against archived OHLC + DBS. Tune TFS confidence-formula scales per regime. **Scope ambiguity flagged below — Q1.** | 3-4 | No (archive-replay) |
| **B.2** | Phase B.2 | IMF family threshold calibration (LQ / VN / DI / Correlation per pair per bar). Tune per-family rows in `screener_filters` for vts_trend, vts_reversal, vts_breakout, vts_strong_trend, vts_pattern. | 2-3 | No (archive-replay) |
| **B.3** | Phase B.3 | Per-strategy gate calibration. 10 enabled xStock strategies. Replace 26 wildcards in `module_constants` with xStock-specific values. Strategy-watchlist for redesign: `pivot_shift`, `mean_reversion`, `range_trade`. | 2-3 | No (archive-replay) |
| **B.4 + B.5** | Phase B.4 + B.5 (coupled) | Friction model calibration + max_bid_ask_spread threshold validation. Empirical spread + slippage distributions per xStock from archive. **SEQUENCING INVARIANT:** B.4 and B.5 ship as a single coupled-retune unit; NO other batch inserts between. | 3-4 | No (archive-replay) |
| **B.6** | Phase B.6 | TEC threshold calibration (archive-replay priors). Empirical ATR distributions per regime per xStock. Set priors for trailing-stop ATR multipliers, BE-stop policy, moonbag policy. **Clean separation from F-LATER:** priors here, posteriors there. | 2-3 | No (archive-replay) |
| **B.7** | Phase B.7 | Position sizing review + sector concentration gate. Add sector concentration gate using `XSTOCK_SPOT_REGISTRY` sector mapping. Layer-1 starter: max 2-3 simultaneous positions per sector OR ~35-40% portfolio heat per sector. **Cross-references roadmap item 19-16 (B79.6 sector-aware portfolio-cluster prevention) — same surface, should be combined.** | 1-2 | No (structural) |
| **C.1 + C.2** | Phase C.1 + C.2 | Equity macro modifier — design + implementation. VIX level + change sigmoid-mapped to [0.85, 1.15]; DXY momentum added as second additive after first observation window. Sources: FRED + Yahoo. Cadence: VIX 5min, FRED hourly. Wire into MCE's xStock branch (replace 1.0 placeholder in `module_constants.mce_config.xstock_spot.macro_modifier`). | 3-5 | No (formula + feed wiring) |
| **D.1** | Phase D.1 | Strategy + regime audit. Per-strategy audit of 9 crypto carryovers. ORB redesign (5/15/30/60min opening-range sweep vs archive). **Earnings handling: option (b) — block opens 24h before / 4h after scheduled earnings.** Equity-native additions: gap-fill YES; PEAD defer; sector rotation + index rebalance defer to Phase G. | 3-4 | No (audit + design) |
| **CRYPTO-FRICTION** | Parallel batch | Crypto-friction-review. Audit existing crypto-side `cost-model.ts` friction parameters never explicitly re-validated. Required as B81 prerequisite item 2 so both crypto and xStock are on equal calibration footing. Sits parallel to Phase B (does NOT extend critical path). | 3-5 | No (archive audit) |
| **F-NOW** | Phase F-NOW | Asset-class-tag pre-calibration trades at OPEN time (explicit storage location). Add `calibration_state TEXT` column to `vts_open_trades`. Default `'pre_calibration_xstock_2026_05'` for any xStock trade opened before Phase E ships. Propagates from `vts_open_trades` → `exit_strategy_alternates`. | 0.5 | No (plumbing) |

**Total estimated calendar:** 17-26 days nominal (full critical path = A.3 → B.1 → B.4+B.5 → B.6 → E pre-requisite design ask; B.2 + B.3 + B.7 + C + D + crypto-friction parallel-capable; F-NOW slot anywhere). Per `XSTOCK_CALIBRATION_PLAN.md` §2: "38-50 days nominal / 58-70 days conservative" for the FULL plan including Phase E observation. This umbrella stops before Phase E, so the 17-26 day estimate covers everything in scope here.

---

## §2. Proposed umbrella shape — B-XSTOCK-CALIB

11 sub-batches under an umbrella. Same per-batch 11-step workflow per CLAUDE.md §2 for each, but Step 1 / Step 2 / Step 10 / Step 11 scope-down to the sub-batch level. Final Step 11 completion report for the umbrella as a whole closes the entire arc.

```
B-XSTOCK-CALIB (umbrella)
├── 0. A.3 verification gate close          [0.5-1d]
├── 1. B.1 regime + confidence-formula      [3-4d]    ⚠ scope question Q1
├── 2. B.2 IMF families                     [2-3d]    can parallel 1
├── 3. B.3 per-strategy gates               [2-3d]    can parallel 1
├── 4. B.4+B.5 friction + spread (coupled)  [3-4d]    sequenced unit
├── 5. B.6 TEC archive-replay priors        [2-3d]
├── 6. B.7 + 19-16 sector concentration     [1-2d]    folds in roadmap 19-16
├── 7. C.1+C.2 equity macro modifier        [3-5d]    can parallel B
├── 8. D.1 strategy + regime audit          [3-4d]    can parallel B/C
├── 9. CRYPTO-FRICTION review               [3-5d]    parallel batch
└── 10. F-NOW asset-class tag plumbing      [0.5d]    slot anywhere
```

**Sub-batch boundaries are not arbitrary** — each sub-batch is independently scopable, has clear acceptance criteria, and produces a discrete deliverable. The umbrella exists to manage the overall arc (governance + memory + Kyle visibility); the sub-batches are where the real work happens. Same pattern as B79.0n umbrella v4.

**Per Kyle directive 2026-05-27 (in roadmap "2026-05-27 update"):** "Batch ordering within each phase is decided at the start of that phase, not pre-locked here." Applies to this umbrella too — final sub-batch sequencing locks at umbrella kickoff after Langston Step 1 ACK.

---

## §3. Questions for Langston Step 1.a review

**Q1 — B.1 confidence-formula scope (Kyle voice 2026-05-27 explicit separation).** Kyle's 15:59 voice this morning split the work as: *"calibrations that can be done and aren't dependent on understanding whether or not a trade wins or loses, and that's things like thresholds, regime classifiers, without the confidence, strategy selection, all that stuff, strategy gates"*. He explicitly said **"regime classifiers, without the confidence."** But B.1 in the calibration plan bundles both — "Regime classifier threshold + confidence-formula calibration." The TFS confidence-formula is the formula that PRODUCES the confidence score from regime measurements (separate from the b67/b68 modifier chain that scales it later).

Two readings:
- **Read A (literal Kyle voice):** Split B.1 into B.1a (regime threshold only — in this umbrella) + B.1b (TFS confidence-formula — defers to Phase 25). Conservative interpretation.
- **Read B (calibration-plan author intent):** TFS confidence-formula calibration IS archive-replay against historical DBS values — doesn't need trade outcomes. The "confidence" Kyle was excluding was the b67/b68 MODIFIERS (multiplicative chain that adjusts confidence based on observed win/loss patterns), not the underlying confidence FORMULA. Both can be archive-replayed.

**My lean: Read B.** TFS confidence-formula scales are mechanical curve-fitting against archive (regime measurement → confidence value mapping); they don't depend on win/loss observations. The b67/b68 modifier calibration that DOES need outcomes already sits in Phase 25 (item 25-2 §19.0.A). Splitting B.1 across phases introduces a sequencing problem — B.2/B.3 downstream consumers want the full confidence pipeline calibrated when they run.

Want your read.

**Q2 — A.3 verification gate handling.** A.3 is technically the next item but it's not really a "batch" — it's a verification activity with a scheduled alert that may have already fired (alert `7b33b931` fired 2026-05-18T13:35Z, almost 10 days ago). Three options:
- **Option A:** Treat A.3 as sub-batch 0 of this umbrella with its own Step 1-11. Adds workflow overhead for what's effectively an alert-check task.
- **Option B:** Resolve A.3 as a 1-2 hour pre-kickoff activity (check telemetry log, run skew analysis, document result), then start the umbrella at B.1. Lighter-weight.
- **Option C:** A.3 already resolved by the alert firing 2026-05-18 — check the inbox / archive for the result and skip.

**My lean: Option B (or C if pre-existing evidence).** A.3's acceptance criteria are observation-grade, not engineering-batch-grade. Want your read.

**Q3 — Crypto-friction-review placement.** The calibration plan says it's a "separate batch with its own scope doc" running parallel to Phase B (not a Phase B sub-batch). Two readings here:
- **Read A:** Keep it as a separate sibling batch under the umbrella (sub-batch 9 above). Pro: matches plan's "separate batch" framing. Con: it's still a calibration that doesn't need outcomes, so it logically belongs in the same umbrella.
- **Read B:** Promote it into the umbrella as a real sub-batch with its own Step 1-11 cycle. Pro: consistent treatment. Con: longer umbrella.

**My lean: Read B (in the umbrella).** Either way it's calibration work that needs to land before B81 (post-launch). Putting it in the umbrella gives it the same governance treatment as the others.

**Q4 — Sub-batch sequencing — strict serial vs parallel-capable?** The calibration plan flags many of these as parallel-capable. Three sequencing models:
- **Model A:** Strict serial. Sub-batches 0 → 1 → 2 → ... → 10 in order. Simple, slow, ~25 days.
- **Model B:** Parallel-capable with dependency edges enforced (A.3 → B.1; B.4+B.5 stays sequenced; everything else parallel). Faster, ~15 days, but Langston review queue saturates if 3-4 sub-batches dispatch simultaneously.
- **Model C:** Hybrid — pull the dependency-bottleneck items (A.3, B.1, B.4+B.5, B.6) onto the critical path serially; let B.2/B.3/B.7/C/D/CRYPTO-FRICTION/F-NOW run as background-parallel sub-batches that consume Langston review when he has bandwidth.

**My lean: Model C (hybrid).** Matches the calibration plan's own dependency structure. Critical path is 5-6 sub-batches (~12-15 days); parallel batch slots absorb the rest opportunistically.

**Q5 — Anything else worth catching before scope v1?** Specifically:
- (a) `XSTOCK_CALIBRATION_PLAN.md` Phase E pre-requisite B-PHASE-E-PRE-1 (sector ETF availability — 11 of 11 missing) sits BEFORE Phase E but doesn't have a current target. Should it land in this umbrella as a sub-batch since it's a foundational data-feed plumbing item (no outcomes needed), or stay queued for Phase 25 kickoff?
- (b) Roadmap item 19-16 (B79.6 sector-aware portfolio-cluster prevention) was originally a Phase 19 batch but its work overlaps directly with B.7 sector-concentration-gate. I folded it into sub-batch 6 above. Confirm OK?
- (c) The xStock asset-specific characteristics inventory (roadmap 19-15 / RUNNING_ISSUES #97) — earnings calendar / market-cap / P/E / IV / analyst ratings — overlaps with Phase D.1 earnings handling. Should it fold into D.1 or stay as a separate Phase 19 item?

**Reply format:** numbered point-by-point on Q1-Q5 is fine. If you ACK clean on umbrella shape + answer Q1-Q5, CC proceeds to scope v1 draft.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-xstock-calib/B_XSTOCK_CALIB_ARCHITECTURAL_SYNTHESIS.md` after SCP. The full `XSTOCK_CALIBRATION_PLAN.md` is canonical reference. Use `ssh staging` only for anything beyond what's in this synthesis.
