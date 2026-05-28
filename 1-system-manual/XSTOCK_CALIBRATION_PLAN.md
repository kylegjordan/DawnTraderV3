# xStock Calibration Plan

> **Status:** LOCKED 2026-05-15. Living document — update with completions, progress, changes, deltas, and learnings as each phase ships.
> **Owner:** Claude Code, with Langston review at each design call.
> **Origin:** picks up where `MULTI_ASSET_VTS_EXPANSION_PLAN.md` leaves off. That doc covered the structural multi-asset wiring (B78 modularization → B79 xStock observation-mode → B80 crypto-perp → B81 ranking parity). This doc covers the calibration work that was deferred during Phase 24 ship and is now sequenced as its own multi-batch chain.
> **Forward reference from MULTI_ASSET_VTS_EXPANSION_PLAN.md:** see §4 sequencing table — Phase 24 calibration follow-on items moved into this plan.
> **Process trail:** two CC sessions converged on plan structure; Langston design review (v1 → round 1 → v2 → round 2 ACK) completed in single session 2026-05-15. Paper trail under `Claude Comms and Packages/Cross-Session Briefs/` (5 docs) and `Claude Comms and Packages/Langston Design Asks/` (4 docs).
>
> **Phase 0 sequencing dependency (Kyle directive 2026-05-15):** Phase 0 does NOT start immediately. It starts AFTER **crypto factor calibration finalization + B67.5 ship.** May 15 was the planned hard fence on crypto's calibration cohort per `MULTI_ASSET_VTS_EXPANSION_PLAN.md`; acting on accumulated lever-ablation evidence before opening xStock work avoids the framework being applied to xStocks while crypto's factor set is unfinalized. The consumer-gate pattern B67.5 builds also becomes inherited infrastructure for xStock Phase E. Realistic insert: 3-5 days at the front of the calibration plan window (full timeline 38-50 days nominal / 58-70 days conservative as a result).

---

## 0. Architectural principle the plan is built around

**Calibration dependency invariant.** For every new asset class, calibrate from the upstream end of the pipeline toward the downstream end (regime → filters → strategy gates → exits → factors). Each stage's data window must START only AFTER the prior stage's calibration has shipped. Data collected on miscalibrated upstream is plumbing-validation only, not calibration-grade. Truncate or asset-class-tag pre-calibration trades for exclusion from analysis.

**Layer-1 starter values are deployment-validation only — not calibration-grade. Evidence collected on miscalibrated upstream cannot be used as calibration input for downstream stages, even if the downstream values appear plausible.**

This invariant becomes a canonical standing rule in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` at plan close (deliberate distillation deferred to plan-end per Kyle directive 2026-05-15).

---

## 1. Plan structure

### Phase 0 — Pre-flight: Corporate actions + halts + dividend ex-dates *(parallel to A.1)*

**Production-risk gate.** TEC trailing stops are LIVE on xStock VTS trades right now. A 2-for-1 split that drops price 50 percent would cascade-trigger every trailing stop in that name simultaneously. Verification cost is cheap (~1 day); late-discovery cost is high. Test it before you trust it.

**0.1 — Corporate actions verification (procedure).**
1. Query archive for known historical split events (Tesla 3:1 2022; Apple 4:1 2020; Nvidia 10:1 2024; Amazon 20:1 2022). Expected: archive only goes back to early May 2026, so these historical events won't appear directly — instead grep ticker-snap rows for any pair whose `prev_day_close / open_24h` ratio shows >40% step-change between consecutive minute bars in the archived window. Any such row = candidate corporate action event.
2. Inspect Kraken's market-data WebSocket schema docs for split-announcement event types (`https://docs.kraken.com/api/docs/websocket-v2/ticker`). Check if `corporate_action` / `split` / `adjustment_factor` fields exist on the message envelope. Document findings.
3. Check archived OHLC for adjustment-vs-raw flag in the metadata jsonb column. If Kraken sends adjusted prices, we need to know.
4. **TEC trailing logic split-resilience test:** simulate a 2:1 split scenario in a unit test — open trade with trailing stop, inject a price drop of 50% in single bar, assert TEC does NOT trigger stop. If test fails, redesign batch BEFORE Phase A starts.
5. Document corporate-action handling policy in `1-system-manual/SYSTEM_MANUAL.md` storage section.

**0.2 — Dividend ex-dates (procedure).**
1. Query archive for top-15 xStock dividend-paying names (KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO) for prev-day-close to open-24h gap-down events of magnitude consistent with quarterly dividend yields (0.3-1.5% range).
2. Test Kraken synthetic dividend credit hypothesis: if Kraken credits holders, expected behavior = no gap; xStock pair tracks underlying ex-dividend. If Kraken does NOT credit, expected = gap-down by dividend amount.
3. Document policy: for the "Kraken credits" case, no TEC handling needed. For the "gap-down" case, ex-dividend dates need same scheduled-event blocking as earnings (per Phase D option (b) pattern, but with shorter window — 1-2 hours before market open on ex-date).
4. Source for ex-dividend calendar: same source chosen for earnings calendar in D.1 (Yahoo Finance free tier suffices for major-name coverage).

**0.3 — Halts / circuit breakers (procedure).**
1. Query archive for any extended gap in tick stream on individual xStocks during RTH (>5 min without ticker update on a 24/7 name, or >5 min during RTH on a 24/5 name with other names still updating).
2. If any halt events found in archive, inspect Kraken's WebSocket behavior during the halt window — does the ticker pause (no update), stale (last-price persists, captured_at advances), or continue synthetically?
3. **TEC halt-resilience test:** simulate halt scenario in unit test — open trade, freeze ticker for 10 minutes, assert TEC does not trigger stop on stale-price drift. If test fails, redesign TEC halt-detection BEFORE Phase A starts.
4. Document halt-handling policy + add halt-detection sentinel to data-freshness layer.

**Gate:** if any of 0.1-0.3 surface real bugs requiring code change, Phase 0 becomes a hotfix batch BEFORE Phase A starts. If clean (verified policies documented + tests pass), proceed to A.1 design call.

### Phase A — Foundation: DBS for xStocks *(critical path, sequential)*

**A.1 — DBS design call.** ✅ **SHIPPED 2026-05-17.**
- Design rev2 LOCKED via `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md` after Langston conditional ACK on rev1 + R1-R4 absorption.
- 14-bucket sector taxonomy locked: 11 GICS sectors + INDEX_PROXY (excluded from aggregation) + BROAD_ETF + INTL_ETF.
- Sector mapping reference doc Langston-ACK'd via `xstock_sector_mappings_reference.md`.
- Constructor-option discriminator pattern selected (mode='crypto' | 'xstock') over partition-key or subclassing.
- Two-floor mechanic locked: global ≥30 GICS-non-sentinel + sector-coverage ≥7 distinct GICS sectors.
- **Sector ETF availability check executed**: 11 of 11 SPDR sector ETFs MISSING from xStock registry → **B-PHASE-E-PRE-1 placeholder queued** (see Phase E section). Path-1 (FRED+Yahoo offline feed) locked as recommended; not blocking A.2 since per-pair DBS doesn't consume sector ETF prices.

**A.2 — DBS implementation + backfill.** ✅ **SHIPPED 2026-05-17 (B-PHASE-A2 batch).**
- Built two-instance `directional-bias-store.ts` extension with `xstockDirectionalBiasStore` singleton.
- Wired into `xstockSpotScanner.runCycle` pre-cycle compute block (mirrors `fx5-scanner.ts:1098-1118`).
- Eval-cycle threads real `propagatedDbs` to MCE at `eval-cycle.ts:327`; MCE non-crypto branch reads end-to-end (verified by pre-audit §3 trace at lines 905, 973, 976, 997, 1048).
- Archive maturity gate cleared: 17 days available at A.2 ship (clears both 7-day and 14-day no-caveat thresholds).
- Backfill complete: 31,481 rows / 260 of 265 symbols / all 14 sector tags exercised. DBS distribution healthy (38% up / 42% down / 20% neutral, range -1.00 to +0.99, avg -0.006, 0 sentinels).
- Commits `e84657110` → `a418a7731`. Deploy PM2 #294 on staging since 2026-05-17T22:16Z.
- Langston Step 4 CLEAN ACK on `e7f9902f2` + Step 8 CLEAN ACK on `a418a7731`.
- **Mirror invariant honored:** DBS component weights byte-identical to crypto; retune POST-A.3 evidence-gated.

**A.3 — DBS verification gate.** ⏳ NEXT.
- Compare DBS distributions across xStocks against crypto's known distributions (component-level: slope / return / EMA / final score).
- Confirm values are moving (not stuck at zero or floor/ceiling).
- Volume-weighted-median skew analysis: inspect whether top-5 xStock names exceed 60% volume weight (per design rev2 §3.6 Langston C7) — if severe, post-A.3 calibration considers equal-weighted or sector-equal-weighted alternatives.
- Live ARCA-open telemetry verification via scheduled alert `7b33b931` (fires Mon 2026-05-18T13:35Z): verify `[B-PHASE-A2][CYCLE_DBS_TIMING]` per-cycle log and `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` one-shot.
- Block Phase B if anomalies surface.

### Phase B — Threshold calibration *(parallel-capable after A done; B.4→B.5 sequenced consecutive)*

**B.1 — Regime classifier threshold + confidence-formula calibration.**
- Backfill replay: run `calculatePairRegime()` against archived OHLC with real DBS values.
- Tune the 14 `_XSTOCK` regime threshold constants for equity microstructure.
- Tune TFS confidence-formula scales; add per-asset-class scales for other 4 regimes where asymmetries surface.
- **Capture `time_of_day_class` as feature using NYSE market clock (9:30-16:00 ET, not wallclock).**
- **Capture `market_hours_open` boolean as sibling feature.**
- **Index rebalance day flag (procedure):** persist a `is_rebalance_day: boolean` sibling feature on each archived bar. Calendar source: Russell quarterly rebalance dates published at `https://www.lseg.com/en/ftse-russell` (June + September + December + March, last Friday of month); S&P add/delete published at `https://www.spglobal.com/spdji/en/` with ~5-day advance notice. Implementation: fetch annual calendar at startup, persist in `module_constants.equity_calendar.rebalance_dates` jsonb array; data-freshness layer flags bars on those dates. For post-hoc analysis only (no live gating); evidence triggers split-or-merge decision later.

**B.2 — IMF family threshold calibration.**
- Backfill replay: compute LQ/VN/DI/Correlation per pair per bar.
- Tune per-family rows in `screener_filters` (vts_trend, vts_reversal, vts_breakout, vts_strong_trend, vts_pattern; oscillator family being removed via Phase 16 separate batch per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.6).

**B.3 — Per-strategy gate calibration.**
- 10 enabled xStock strategies (9 crypto carryovers + ORB).
- **Strategy-watchlist for redesign-not-just-retune:** `pivot_shift` (pivot calc + overnight gap), `mean_reversion` (RSI excursion assumptions), `range_trade` (overnight bound-crossing).
- Replace 26 wildcards in `module_constants` with xStock-specific values.

**B.4 — Friction model calibration.**
- Empirical spread + slippage distributions per xStock from archive.
- Retune `cost-model.ts` parameters per asset class.
- Re-validate Net EV gate behavior against retuned friction.
- **B.4 → B.5 SEQUENCING INVARIANT:** B.4 and B.5 are a single coupled-retune unit. **NO other batch — calibration or otherwise — inserts between B.4 ship and B.5 ship.** They commit together or B.5 waits. The 3% spread threshold (B-NEW-14 Layer-1 starter) WILL drop substantially once B.4 retunes friction; running B.5 with stale friction config would lock in wrong threshold values. Treat B.4 + B.5 as a single sub-batch with two commits.

**B.5 — max_bid_ask_spread threshold validation.**
- Validate 3% threshold (B-NEW-14 starter Layer-1) against archived spread distributions.
- Likely drops substantially given NVDA 0.026% / SPY 0.007% / TSLA 0.078% on liquid names.
- **Sequenced immediately after B.4 in the same coupled-retune unit (see B.4 sequencing invariant above).**

**B.6 — TEC threshold calibration (archive-replay priors).**
- Empirical ATR distributions per regime per xStock from archive.
- Set priors for trailing-stop ATR multipliers, BE-stop policy, moonbag policy.
- Clean separation from F-LATER: **B.6 = priors from archive; F-LATER = posteriors from live trade outcomes.**

**B.7 — Position sizing review + sector concentration gate.**
- Keep `position-sizing.ts` shared (don't fork).
- Add sector concentration gate using same `XSTOCK_SPOT_REGISTRY` sector mapping (SSOT).
- **Layer-1 starter: max 2-3 simultaneous positions per sector OR ~35-40% portfolio heat per sector.**

### Phase C — Equity macro modifier *(parallel to Phase B)*

**C.1 — Design call.**
- **Narrow start: VIX level + change, sigmoid-mapped to [0.85, 1.15].**
- DXY momentum added as second additive after first observation window.
- No 5+ inputs without evidence.
- Sources: **FRED for slow-moving macro (DXY, yield curves, treasury rates) — free, official. Yahoo for VIX intraday — 5min cadence. Polygon DEFERRED.**
- Cadence: VIX 5min, FRED hourly.

**C.2 — Implementation.**
- Build equivalent of crypto's `macro-modifier.ts` for equities.
- Wire into MCE's xStock branch (replace 1.0 placeholder in `module_constants.mce_config.xstock_spot.macro_modifier`).
- Scheduled feed integration.

### Phase D — Strategy + regime audit *(after A done, parallel to B/C)*

**D.1 — Strategy set scope.**
- Per-strategy audit of 9 crypto carryovers (vwap_pullback, sma_trend_ride, breakout, mean_reversion, range_trade, vwap_bounce, inside_bar_reversal, morning_star, pivot_shift).
- ORB redesign: 5/15/30/60min opening-range sweep against archive; pick by win-rate × profit-factor.
- **Earnings handling: option (b) — block opens 24h before / 4h after scheduled earnings.** Trading-through-IV-crush-with-crypto-tuned-exits = tail-loss factory.
- Equity-native additions: **gap-fill YES (primary). PEAD DEFER (needs multi-day position-management framework). Sector rotation + index rebalance DEFER to Phase G.**
- Earnings-calendar feed source decision (likely Yahoo for free; Polygon if budget permits later).

### Phase E — Factor identification + calibration *(LAST — after A-D done, requires accumulated VTS trades)*

**Phase E pre-requisite: B-PHASE-E-PRE-1 (queued from B-PHASE-A2 §3.3 11/11-missing escalation).**
- 11 of 11 SPDR sector ETFs (XLK / XLE / XLV / XLF / XLI / XLP / XLY / XLU / XLB / XLRE / XLC) MISSING from xStock registry — verified empirically on 2026-05-17 during Phase A.1 design.
- Sector-correlation factor work (`b68_3_pair_correlation` repurposed below) requires sector ETF prices to compute "correlation with own-sector ETF" per symbol. Cannot proceed without an offline feed.
- **Path-1 (FRED daily-close + Yahoo intraday) locked as recommended** per Langston Step 4 R2 review. Paths 2 (basket-synthesize from xStock baskets) + 3 (defer factor entirely) REJECTED — circularity / silent factor drop respectively.
- Estimated 5-7 days for the offline-feed adapter + scheduled fetch + archive table + integration. Triggers at Phase E kickoff design ask; Kyle override window at Phase E kickoff if final path needs to change. See `MULTI_ASSET_VTS_EXPANSION_PLAN.md` Phase E placeholder for cross-reference.

**E.1 — xStock factor candidate identification.**

Drop: `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`.

Keep: `b67_2_phase_preference`, `b67_4_outcome_feedback`, `b68_1_multi_tf_agreement`, `b68_2_volume_regime`, `b68_4_freshness`, `b68_5_dbs_sustainability` (once Phase A done).

Repurpose: `b68_3_pair_correlation` — sector ETF per symbol via same DRY mapping. **GATED on B-PHASE-E-PRE-1 ship** (sector ETF prices must be available before this factor can compute).

Add: VIX-derived, DXY-derived, beta-to-SPY rolling, market-breadth, earnings-proximity (if D adopts earnings handling). 4-8 candidates; expect 2-4 to clear decision-grade.

**E.2 — Factor emitter implementation.**

Note: this also addresses the gap surfaced in the original session (BATCH_82 fixed asset-class threading on crypto call sites but never wired the xStock pipeline through `emitAblationRecord`). E.2 wires the xStock signal-emission path into the same ablation-emit machinery so the Factor Calibration table starts populating.

**E.3 — 14-day observation window + calibration analysis.**
- Decision-grade gate: n ≥ 150/bucket, spread ≥ 7pp, p < 0.05.

### Phase F — Exit-strategy ablation *(two-stage)*

**F-NOW (~half day, parallel-anywhere):**
- Verify `exit_strategy_alternates` schema includes `asset_class` + aggregator filters.
- **Asset-class-tag pre-calibration trades at OPEN time (explicit storage location):**
  - Add `calibration_state TEXT` column to `vts_open_trades` table (the existing open-trades persistence table from B79.0g).
  - Default value: `'pre_calibration_xstock_2026_05'` for any xStock trade opened before Phase E ships.
  - Set at INSERT time in `vts-trade-persistence.ts::insertOpenTrade()`, not at close time — open trades spanning Phase A-E ship retain their open-time tag.
  - On trade close, `calibration_state` propagates from `vts_open_trades` → `exit_strategy_alternates` row via the exit-strategy-replay-service writer.
  - Aggregator query at `exit-strategy-ablation-aggregator.ts::computeExitStrategyAblation` adds `AND calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'` to its WHERE clause when scoped to xStocks.
  - **Post-Phase-E production-flip migration — TWO changes, not one:**
    1. Change the application-code constant in `vts-trade-persistence.ts::insertOpenTrade()` from `'pre_calibration_xstock_2026_05'` to `'production'` so newly-opened post-Phase-E xStock trades tag correctly.
    2. Issue `UPDATE vts_open_trades SET calibration_state = 'production' WHERE calibration_state = 'pre_calibration_xstock_2026_05'` for any in-flight open trades at migration time, otherwise they carry the pre_calibration tag through close and get excluded from the very dataset they should populate.
- Backfill check for pre-launch historical xStock outcomes (likely empty; one-line script).

**F-LATER (~20-30 days from start):**
- Once post-Phase-A-D trades reach n ≥ 150/variant: run B73 framework.
- Tune trailing parameters, BE-stop policy, moonbag policy. Refines B.6 priors.
- Update `module_constants` TEC config.

### Phase G — Cross-asset ranking parity *(post-launch, NOT in scope here)*

**B81 prerequisite checklist** (cross-reference from `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §4):

B81 admission REQUIRES, in checklist form (all must be true before B81 starts):
1. Phase B.4 friction calibration shipped + verified in xStock VTS pipeline.
2. Crypto-friction-review batch shipped (a separate from-this-plan batch — needed because crypto's existing friction parameters in `cost-model.ts` are unaudited; B81 normalizes across asset classes so both must be on equal calibration footing).
3. xStock_spot SQE config rows seeded in `module_constants.sqe_config.xstock_spot.*` for each primary admission gate (DI, ADX, momentum floor). Currently only crypto_spot rows exist.
4. `expectedNetReturnR` primitive implemented + unit-tested in `ranking-weights.ts` (replaces current `predictiveConfidence × regimeWeight + CONTEXT_BONUS` formula).
5. Pool-relative normalization wired in RTB admission cycle (per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §8.2 design).
6. Per-asset-class `CONTEXT_BONUS` values resolved (currently global; xStock equity context bonus needs its own value).
7. Phase 19 active-trading audit completed (Boot Readiness Coordinator + per-component active-path validation).
8. Crypto-perp added to observation mode (so all three asset classes — crypto_spot, xstock_spot, crypto_perp — are ready for unified ranking simultaneously).

Items 1-3 are in scope for this xStock calibration plan. Items 4-8 are post-launch separate batches.

---

## 2. Timeline

- Phase 0 (corporate-actions audit): 1 day pre-flight, parallel to A.1
- Phase A: 3-5 days
- Phase B: 8-12 days (seven sub-batches; B.4→B.5 sequenced consecutive)
- **Crypto-friction-review batch:** 3-5 days, runs in parallel with Phase B (does NOT extend critical path). Audits the existing crypto-side `cost-model.ts` friction parameters that were never explicitly re-validated; required as B81 prerequisite item 2 so both crypto and xStock are on equal calibration footing before cross-asset ranking parity ships. Slot into the Phase B window without sequencing it as a sub-batch of Phase B (it's a separate batch with its own scope doc).
- Phase C: 3-5 days (parallel to B)
- Phase D: 3-4 days (parallel to B/C)
- Phase E.1-E.2: 3-4 days (sequential after A+C+D)
- Phase E.3: 14 days observation (serialized)
- Phase F-NOW: 0.5 day
- Phase F-LATER: separate ~2-3 day batch ~20-30 days from start

**Total wall-clock to factor calibration decisions: 35-45 days nominal.**

**Conservative: 55-65 days:**
- DBS design call iteration: +1-3 rounds
- Phase 0 surfaces ≥1 edge case: +2-3 days
- Strategy set ≥1 redesign-not-retune: +3-5 days
- Gap-fill design+impl: +3-5 days
- Earnings handling impl: +2-3 days
- Stack-up adds ~10-15 days over nominal in compound-risk scenarios.

**Exit-strategy ablation calibration complete: 55-75 days from start.**

---

## 3. Foundational decisions (locked)

| Q | Decision | Source |
|---|---|---|
| Q1 DBS architecture | Sector-classification + SPY fallback. Eleven SPDR sector ETFs. SSOT on registry. Three caveats: index-self handling, ADR flag for Phase E, no-pre-emptive-component-weight-retune (load-bearing invariant). Per-sector floor 3-5 / global 30. | CC joint recommendation + Langston round-1 ACK |
| Q2 Strategy set | Keep 9 carryovers + audit. Watchlist: pivot_shift + mean_reversion + range_trade. ORB sweep 5/15/30/60min. Equity-native: gap-fill YES, PEAD/rotation/rebalance DEFER. Earnings option (b) — block 24h before / 4h after. | Langston round-1 ACK |
| Q3 Macro modifier | VIX-only start. DXY second after first window. Sources FRED + Yahoo. Defer Polygon. Cadence VIX 5min / FRED hourly. | Langston round-1 ACK |
| Q4 Pair correlation reference | Sector ETF per symbol via same DRY mapping. | Langston round-1 ACK |
| Q5 Timeline | 35-45 nominal / 55-65 conservative. | Langston round-1 ACK (pushed back from CC's 50-day conservative) |
| Q6 Invariant | Accept with appended clarifying sentence on Layer-1 starter values. | Langston round-1 ACK |
| Q7 Corporate actions | Phase 0 pre-flight, parallel to A.1. | Langston round-1 pushback accepted |
| Q8 RTH/extended-hours | Option (d) capture, defer split decision to evidence. NYSE market clock + market_hours_open. | Langston round-1 ACK |
| Q9 Position sizing | Shared `position-sizing.ts` + sector concentration gate (2-3 positions/sector OR 35-40% heat). | Langston round-1 ACK |

---

## 4. Inherited state from prior batches

What the plan inherits (already shipped, not in scope to redo):
- **xStocks UI sprint CLOSED 2026-05-14.** All four data/UI items (B-NEW-14 max-spread + tab wrap, B-NEW-21 freshness query, B-NEW-31 freeze panes, B-NEW-TZ timezone save) shipped + verified.
- **xStock pipeline LIVE in observation mode.** Scanner runs every minute; filters fire; trades open + close into `vts_open_trades` + `paper_sim_trades`.
- **Exit-strategy ablation plumbing LIVE.** Panel populates with rolling-7d real numbers. Data is plumbing-validation only, NOT calibration-grade until Phase A-D ship (per invariant in §0 above).
- **Factor-ablation emission wiring MISSING for xStocks.** BATCH_82 fixed asset-class threading on crypto call sites; xStock signal-emission path bypasses `emitAblationRecord` entirely. Phase E.2 wires this.
- **B79.TEC per-asset-class TEC config SHIPPED.** Day-1 placeholder values for xStocks pending B79.4 evidence — Phase B.6 + F-LATER deliver that evidence.
- **MULTI_ASSET_VTS_EXPANSION_PLAN.md sequencing already moved (Kyle directive 2026-05-14):** Observability backfill batch + oscillator family removal → Phase 16. Crypto-perp into VTS → post-launch. Items 3 / 4 / 6 (calibration, exit-ablation, ranking parity) → this plan's scope.

---

## 5. Progress + status log

Updates as phases ship. Append rows; do NOT rewrite history.

| Date | Phase / Sub-batch | Status | Commit / notes |
|---|---|---|---|
| 2026-05-15 | Plan LOCKED | done | Langston round-2 ACK; v2 final committed `9cc9ac7d5`. Promoted to system-manual `1bd...` (this commit). |
| 2026-05-15 | **B-NEW-34 — bar-interval switch to 60-min + freshness-gate removal + filter floor 60→24 + ORB disabled** | done | Commits `756b64e49` → `a7545d595` → `88e34bd67` → `1ee3ceb27`. PM2 #287. Staging verified live: 64 pairs/cycle (vs 26 pre-deploy), 675ms cycle duration, no SCAN_TIMEOUT. Pre-flight C calibration debt (~12 indicator/threshold concerns) absorbed into Phase B. B-NEW-35 spawned for B74 source dedup. 240-min warm-fetch suspended until B-NEW-35 lands. |
| 2026-05-28 | **A.3 verification gate closed** (B-XSTOCK-CALIB pre-kickoff) | done | Memo `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md`; commit `7f06d47b8`. Read B confirmed (top-5 ex-INDEX_PROXY = 22.53%); 2 B.7 carry-forwards (sector-under-coverage-floor + per-sector top-N). |
| 2026-05-28 | **B.1 regime threshold + TFS confidence-formula** | done (validate-and-document; no threshold adjustments) | Archive replay 2,658 bars / 260 symbols. Distribution within design envelope. Per-branch confidence quartiles confirm multiplicative formula behavior. Deploy `9d0a10271` PM2 #328 at 01:25Z; CI run `26548662643` all-4-green. 4 new files (2 leaf helpers + 19 tests + replay harness). [Analysis doc](../Claude%20Comms%20and%20Packages/Cross-Session%20Briefs/B_1A_DISTRIBUTION_ANALYSIS.md). [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B_1_COMPLETION_REPORT.md). |
| _(append rows here as each phase ships)_ | | | |

**Plan rev 2 entry (2026-05-15) — bar-interval change ripples + cohort reset:**

- **Bar interval changed 1-minute → 60-minute** for canonical xStock scanner path (B-NEW-34). All indicator/threshold periods that were expressed in number-of-bars now mean different real-time windows: a "300-period Z-score" was 5 hours of intraday tape on 1-min bars; now 12.5 days of swing data on 60-min bars. Phase B threshold-calibration targets updated accordingly:
  - **Phase B.1 LQ threshold review** — re-evaluate against 60-min-bar liquidity profile (volume-per-bar magnitudes differ ~60× from 1-min bars; absolute LQ thresholds may need rescaling even if the percentile mapping concept is preserved).
  - **Phase B.2 VN threshold review** — VN ratio uses ATR ÷ price; on 60-min bars ATR is larger (multi-tick range), so VN distributions shift. Pre-flight C concern about "VN dominance in family-IMF rejection (31% of fails)" needs re-measurement against post-B-NEW-34 evidence.
  - **Phase B.3 DI window** — DI computation uses N closes of geometric vs straight-line distance. On 60-min bars, N=48 closes = 2 calendar days of trading; same N on 1-min bars was 48 minutes. Decide whether N is preserved (semantic: "directional integrity over last N price points") or rescaled to match prior crypto-derived calibration (semantic: "directional integrity over the last 48 minutes").
  - **Phase B.4 friction calibration** — bid/ask spread sampling switches from 1-min to 60-min bar timestamps. Slippage-per-bar magnitudes change (1 hour of price movement is larger absolute drift than 1 minute). Friction model is exchange-keyed not bar-interval-keyed, so the friction parameters themselves don't move — but the EVIDENCE WINDOW (`max_bid_ask_spread` filter, slippage telemetry buckets) shifts to 60-min bars.
  - **Phase B.5 max-spread threshold** — same window-shift as B.4. Threshold value (currently 100 bps with 90s ticker-snap freshness) is being re-evaluated against bar-derived bid/ask quotes that have different freshness semantics.
  - **Phase B.6 ATR-multiplier calibration** — strategy ATR-distance multipliers (1.5× / 2.5× for `scanPatterns()`) are bar-interval-sensitive. The 1.5×/2.5× crypto-derived values assume some baseline noise level; 60-min ATR is larger absolute than 1-min ATR, so multipliers may need rescaling.

- **Cohort starts reset to B-NEW-34 deploy date (2026-05-15).** Any calibration sample collected pre-2026-05-15 from the xstock pipeline is mixed-bar-interval data (predominantly 1-min, but some 60-min for backtests). Calibration windows for xstock_spot start fresh from 2026-05-15 PM2 #287 deploy. **Specifically resets:** Phase B threshold samples, Phase C macro-modifier observations, Phase D strategy-fire-rate evidence, Phase E pre-calibration-tagged trades.

- **Threshold starter values now use crypto-calibrated 60-min values.** The "Day-1 placeholder" values in `screener_filters WHERE asset_class='xstock_spot'` were set in B79.0m.b2 (2026-05-11) from CRYPTO 60-min baselines (LQ=43, VN=0.98, DI=3/5). That choice is now correct by construction — both crypto and xstock are 60-min-bar systems. The "Day-1 placeholder pending Layer-3" framing in §4 is preserved (xstocks still need evidence-driven calibration), but the starter values are no longer asset-mismatched.

- **Phase D ORB redesign SUSPENDED.** ORB (Opening Range Breakout) is fundamentally an intraday strategy using the first 15-30 minutes of session price action to define a breakout range. On 60-min bars, the entire first hour IS the first bar — there is no "opening range" to define inside it. ORB has been disabled in `module_constants.strategy_gates.xstock_spot.orb.enabled=false` (B-NEW-34). Phase D's ORB-specific work is suspended until/unless multi-TF support is added (which would let ORB read sub-hourly bars for the opening-range definition + 60-min bars for the rest of the pipeline). All other Phase D items proceed.

- **Pre-flight C calibration debt absorbed into Phase B.** Langston Round 3 §3 surfaced ~12 indicator/threshold concerns from the bar-interval change. They're not blockers for B-NEW-34 ship (the 24-bar filter floor and 60-min cache depth are functioning); they ARE blockers for Phase B threshold confidence. Specific items tracked in this entry's bullets above.

- **240-min (4-hour) bar infrastructure shipped but DISABLED.** B-NEW-34 shipped aggregator + cache support for 240-min bars (matching Kraken's interval=240 boundaries at 00/04/08/12/16/20 UTC). Fire-and-forget warm-fetch in scanner currently commented out — pending B-NEW-35 source-side dedup. When 240-min becomes consumable: hookup point is `XstockMultiTFAgreement` (Phase D of this plan), mirroring B68.1 multi-TF agreement on the crypto side.

**Deltas from plan vs. ship reality** _(track as we go; honest about overruns + adjustments)_:
- **2026-05-15 — Bar-interval change.** Original plan (rev 1, locked 2026-05-15 morning) assumed the xStock scanner kept the existing 1-minute-bar architecture. Same-day Kyle directive flipped to 60-minute parity with crypto + 4-hour pre-warm (B-NEW-34). Calibration plan adjusted: thresholds re-anchor to 60-min evidence, cohort start resets to 2026-05-15 deploy, Phase D ORB work suspended pending multi-TF support, ~12 pre-flight C calibration debt items absorbed into Phase B sub-batches.

---

## 6. Workflow-doc distillation queue

At plan close (after Phase E ships), distill canonical "must do for every new asset class" entries into `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Candidates so far (refine list as phases reveal more):

- **Calibration dependency invariant** (§0 above) — top-level standing rule.
- **Pre-flight corporate-actions / dividend-ex-date / halt audit** — Phase 0 procedures generalized; every new asset class checks these against its own market microstructure before calibration starts.
- **DBS benchmark architecture decision** — every asset class needs a documented DBS reference (universe-median for crypto-style universes; sector ETFs for fragmented universes; self-or-broad fallback for index-tracking instruments).
- **No pre-emptive component-weight retune** — DBS formula stays byte-identical to crypto until evidence justifies retune.
- **B.4 ↔ B.5 coupled-retune sequencing** — friction model + max-spread threshold ship together, no batch inserts between.
- **F-NOW pre-calibration tagging at OPEN time** — `calibration_state` column on `vts_open_trades` set at INSERT, propagates on close; production-flip migration is TWO changes (app code + in-flight UPDATE).
- **Sector concentration gate** — for asset classes with sector structure (equities), max 2-3 positions per sector OR 35-40% portfolio heat.
- **Strategy carryover audit** — every new asset class audits which crypto strategies transfer cleanly vs need redesign vs should be dropped.
- **Earnings-event / market-event blocking** — for asset classes with scheduled disruption events (equity earnings, FOMC for crypto-perp funding), block opens around the event window.
- **Asset-class data archive depth check** — calibration backfill has a hard floor (e.g. <7 days = wait for archive maturation). Don't calibrate on insufficient data.

---

## 7. Cross-references

- **`MULTI_ASSET_VTS_EXPANSION_PLAN.md`** — the doc this picks up from. Phase 24 calibration follow-on items live here now.
- **`POST_AUDIT_ROADMAP.md`** — Phase 24 calibration is now this plan; mark on roadmap accordingly.
- **`ASSET_CLASS_ONBOARDING_WORKFLOW.md`** — receives the canonical "must do" distillation at plan close.
- **`SYSTEM_MANUAL.md`** — receives corporate-action handling policy + halt-detection sentinel from Phase 0.
- **`SYSTEM_IMPACT_MAP.md`** — receives new components from each phase as they ship (xstock-directional-bias-store.ts, equity macro modifier, sector concentration gate, etc.).

---

## 8. Paper trail

Cross-CC convergence (`Claude Comms and Packages/Cross-Session Briefs/`):
- `FACTOR_CALIBRATION_FRAMEWORK_BRIEF_2026-05-14.md` (original, has confidence-chain correction pending)
- `XSTOCK_CALIBRATION_MASTER_PLAN_2026-05-14.md` (original)
- `XSTOCK_CALIBRATION_REVISED_PLAN_RESPONSE_2026-05-15.md` (peer revised + disagreements)
- `XSTOCK_CALIBRATION_CONVERGENCE_RESPONSE_2026-05-15.md` (original concession + four additions)
- `XSTOCK_CALIBRATION_CONVERGENCE_FINAL_2026-05-15.md` (final convergence)

Langston design review (`Claude Comms and Packages/Langston Design Asks/`):
- `XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REVIEW.md` (v1 design ask)
- `XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REPLY_ROUND1.md` (Langston round-1 reply)
- `XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` (v2 with round-1 refinements + v2 ACK clarifications inline)
- `XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_ACK_ROUND2.md` (Langston round-2 ACK)

---

*End of XSTOCK_CALIBRATION_PLAN.md. Living document — update §5 progress log as each phase ships. Move to `_archive/` only when all Phase A-F work closes + workflow distillation lands.*
