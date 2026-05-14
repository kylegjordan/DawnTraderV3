# xStock Calibration Plan v2 — Langston Final Sign-Off

> **From:** CC (two sessions converged + Langston round-1 review absorbed)
> **To:** Langston
> **Date:** 2026-05-15
> **Purpose:** v2 revision incorporating all your round-1 refinements + corner-case scrutiny. Request final sign-off pass; if no further revisions, plan is locked and code starts.
> **Round-1 reply paper trail:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REPLY_ROUND1.md`

---

## 0. Changes from v1 → v2 (full delta list)

Every refinement Langston flagged in round-1 review, folded in:

**Structural change:**
- Corporate-actions audit ELEVATED from A.3 verification gate → **Phase 0 / pre-flight, parallel to A.1 design call** (Q7 pushback accepted).

**Phase A:**
- A.1 — added explicit "index-self xStocks need branch" caveat (SPY/QQQ/IWM xStocks if Kraken offers them can't benchmark against themselves; force-use sector-blind regime mode for these).
- A.1 — added ADR caveat (beta-to-SPY may understate non-US macro coupling; flag for Phase E factor work, not blocker).
- A.1 — sector ETF data availability check added (does Kraken offer XLK/XLE/etc. AS xStocks for direct on-pair correlation? If not, sector-benchmark needs offline feeds — data-infrastructure dependency).
- A.2 — **DBS component weights stay byte-identical to crypto.** No pre-emptive equity-tune. Observe 2-3 weeks, retune only on evidence (Langston Q1 (c) — applies calibration-dependency principle to its own foundation).
- A.2 — DBS backfill depth check added (xStock archive only started post-B79.0a; may be <14 days available; flag honestly before A.2 commits).
- A.3 — corporate-actions scope MOVED to Phase 0; A.3 retains DBS verification gate only.

**Phase B:**
- B.1 — `time_of_day_class` capture now NYSE market clock (9:30-16:00 ET, not wallclock) to survive DST; add `market_hours_open` boolean as sibling feature for off-hours analyzability.
- B.1 — index rebalance days (Russell quarterly + S&P add/delete) flagged in `time_of_day_class` dimension for post-hoc analysis.
- B.3 — `range_trade` added to strategy-watchlist alongside `pivot_shift` + `mean_reversion` (overnight bound-crossing crypto doesn't have).
- B.4 / B.5 — sequencing explicitly consecutive (3% spread threshold is starter Layer-1; B.4 friction retune likely drops it substantially against archive distributions like NVDA 0.026% / SPY 0.007%).
- B.7 — sector concentration gate added: **max 2-3 simultaneous positions per sector OR ~35-40% portfolio heat per sector.** Starter values; Phase E/F refines.

**Phase C:**
- C.1 — **narrow start: VIX (level + change) only**, sigmoid-mapped to [0.85, 1.15]. DXY momentum added as second additive after first observation. No 5+ inputs pre-evidence.
- C.1 — sources: **FRED + Yahoo. Polygon DEFERRED** until evidence justifies the spend.
- C.1 — cadence: VIX 5min, FRED hourly.

**Phase D:**
- D.1 — earnings handling: **option (b) selected — block opens 24h before / 4h after scheduled earnings.** Conservative + reversible + low downside. Trading-through-IV-crush-with-crypto-tuned-exits = tail-loss factory.
- D.1 — equity-native additions: **gap-fill YES (primary); PEAD DEFER (needs multi-day position-management framework we don't have); sector rotation + index rebalance DEFER to Phase G.** PEAD flagged as future-consideration once multi-day framework exists.
- D.1 — ORB redesign: test 5/15/30/60min opening-range duration against archive, pick by win-rate × profit-factor.

**Phase F:**
- F-NOW — pre-calibration trade tagging applied at **open time and persisted on trade record**, not close time. Open trades spanning Phase A ship get correct tag.

**Phase 0 (NEW):**
- Pre-flight corporate-actions + halts + dividend ex-dates audit.

**Timeline:**
- Nominal: 35-45 days (unchanged).
- **Conservative: 55-65 days** (was 50). Stack-up: DBS design iteration +1-3 rounds; corp-actions Phase 0 surfaces ≥1 edge case +2-3 days; strategy set ≥1 redesign-not-just-retune +3-5 days; gap-fill design+impl +3-5 days; earnings handling +2-3 days.

**Workflow doc invariant — appended clarifying sentence:**
- "Layer-1 starter values are deployment-validation only — not calibration-grade. Evidence collected on miscalibrated upstream cannot be used as calibration input for downstream stages, even if the downstream values appear plausible."

**B81 prerequisite chain — forward reference added:** B81 admission requires (a) Phase B.4 friction calibration done + (b) crypto-friction-review batch done. Add line to `MULTI_ASSET_VTS_EXPANSION_PLAN.md`.

---

## 1. Updated plan structure (v2)

### Phase 0 — Pre-flight: Corporate actions + halts + dividend ex-dates *(NEW — parallel to A.1)*

**0.1 — Corporate actions verification (procedure).**
1. Query archive for known historical split events (Tesla 3:1 2022; Apple 4:1 2020; Nvidia 10:1 2024; Amazon 20:1 2022). Expected: archive only goes back to early May 2026, so these historical events won't appear directly — instead grep ticker-snap rows for any pair whose `prev_day_close / open_24h` ratio shows >40% step-change between consecutive minute bars in the archived window. Any such row = candidate corporate action event.
2. Inspect Kraken's market-data WebSocket schema docs for split-announcement event types (`https://docs.kraken.com/api/docs/websocket-v2/ticker`). Check if `corporate_action` / `split` / `adjustment_factor` fields exist on the message envelope. Document findings.
3. Check archived OHLC for adjustment-vs-raw flag in the metadata jsonb column. If Kraken sends adjusted prices, we need to know.
4. **TEC trailing logic split-resilience test:** simulate a 2:1 split scenario in a unit test — open trade with trailing stop, inject a price drop of 50% in single bar, assert TEC does NOT trigger stop. If test fails, redesign batch BEFORE Phase A starts.
5. Document corporate-action handling policy in `1-system-manual/SYSTEM_MANUAL.md` storage section.

**0.2 — Dividend ex-dates (procedure).**
1. Query archive for top-15 xStock dividend-paying names (KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO) for prev-day-close to open-24h gap-down events of magnitude consistent with quarterly dividend yields (0.3-1.5% range).
2. Test Kraken synthetic dividend credit hypothesis: if Kraken credits holders, expected behavior = no gap; xStock pair tracks underlying ex-dividend. If Kraken does NOT credit, expected = gap-down by dividend amount.
3. Document policy: for the "Kraken credits" case, no TEC handling needed. For the "gap-down" case, ex-dividend dates need same scheduled-event blocking as earnings (per Q2 option (b) pattern, but with shorter window — 1-2 hours before market open on ex-date).
4. Source for ex-dividend calendar: same source chosen for earnings calendar in D.1 (Yahoo Finance free tier suffices for major-name coverage).

**0.3 — Halts / circuit breakers (procedure).**
1. Query archive for any extended gap in tick stream on individual xStocks during RTH (>5 min without ticker update on a 24/7 name, or >5 min during RTH on a 24/5 name with other names still updating).
2. If any halt events found in archive, inspect Kraken's WebSocket behavior during the halt window — does the ticker pause (no update), stale (last-price persists, captured_at advances), or continue synthetically?
3. **TEC halt-resilience test:** simulate halt scenario in unit test — open trade, freeze ticker for 10 minutes, assert TEC does not trigger stop on stale-price drift. If test fails, redesign TEC halt-detection BEFORE Phase A starts.
4. Document halt-handling policy + add halt-detection sentinel to data-freshness layer.

**Gate:** if any of 0.1-0.3 surface real bugs requiring code change, Phase 0 becomes a hotfix batch BEFORE Phase A starts. If clean (verified policies documented + tests pass), proceed to A.1 design call.

### Phase A — Foundation: DBS for xStocks *(critical path, sequential)*

**A.1 — DBS design call (parallel to Phase 0).**
- Sector-classification with SPY fallback. Eleven SPDR sector ETFs (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC).
- Index-self handling — xStocks that ARE indices (SPY/QQQ/IWM xStocks) skip per-pair DBS; force sector-blind regime mode.
- ADR caveat — sector mapping works for routing; beta-to-SPY may understate non-US coupling; flag for Phase E.
- **DBS component weights stay byte-identical to crypto's formula** — observe 2-3 weeks, retune only on evidence. NO pre-emptive equity-tune (Langston Q1 (c) — load-bearing invariant; calibration-dependency principle applies to its own foundation).
- Per-sector floor 3-5 pairs, global floor ~30 (vs crypto's 20).
- Sector mapping co-located on `XSTOCK_SPOT_REGISTRY` — extend shape to `{ name, is24_7?, sector }`.
- **Sector ETF data availability check (procedure):** query `XSTOCK_SPOT_SYMBOLS` for presence of XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC AS xStocks. For each missing: determine if Kraken offers it under a different naming convention, or if we need to add offline feed (FRED daily-close + Yahoo intraday). If >3 are missing, the offline-feed integration becomes a Phase A.1 sub-batch with its own Langston design call before A.2 starts. Cost: ~half-day per missing ETF for feed integration.

**A.2 — DBS implementation + backfill.**
- Build `xstock-directional-bias-store.ts` analogous to crypto's.
- Wire into `xstockSpotScanner.runCycle` ahead of eval-cycle dispatch.
- Eval-cycle passes real DBS to MCE (replaces `undefined` at `server/asset_classes/xstock_spot/eval-cycle.ts:353`).
- **Pre-commit check: verify actual xStock archive start date.** If <14 days available, document explicitly — calibration history is thinner than crypto's was.
- Backfill 2-3 weeks of historical DBS from archived OHLC.
- MCE `propagatedDbs` branch lifts when value provided.

**A.3 — DBS verification gate.**
- Compare DBS distributions across xStocks against crypto's known distributions.
- Confirm values are moving (not stuck at zero or floor/ceiling).
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
- Tune per-family rows in `screener_filters` (vts_trend, vts_reversal, vts_breakout, vts_strong_trend, vts_pattern; oscillator family being removed via Phase 16 separate batch per §10c.6).

**B.3 — Per-strategy gate calibration.**
- 10 enabled xStock strategies (9 crypto carryovers + ORB).
- **Strategy-watchlist for redesign-not-just-retune:** `pivot_shift` (pivot calc + overnight gap), `mean_reversion` (RSI excursion assumptions), `range_trade` (overnight bound-crossing — NEW per Langston Q2).
- Replace 26 wildcards in `module_constants` with xStock-specific values.

**B.4 — Friction model calibration.**
- Empirical spread + slippage distributions per xStock from archive.
- Retune `cost-model.ts` parameters per asset class.
- Re-validate Net EV gate behavior against retuned friction.
- **B.4 → B.5 SEQUENCING INVARIANT (Langston round-1 verification item #2):** B.4 and B.5 are a single coupled-retune unit. **NO other batch — calibration or otherwise — inserts between B.4 ship and B.5 ship.** They commit together or B.5 waits. The 3% spread threshold (B-NEW-14 Layer-1 starter) WILL drop substantially once B.4 retunes friction; running B.5 with stale friction config would lock in wrong threshold values. Treat B.4 + B.5 as a single sub-batch with two commits.

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
- Wire into MCE's xStock branch (replace 1.0 placeholder).
- Scheduled feed integration.

### Phase D — Strategy + regime audit *(after A done, parallel to B/C)*

**D.1 — Strategy set scope.**
- Per-strategy audit of 9 crypto carryovers.
- ORB redesign: 5/15/30/60min opening-range sweep against archive; pick by win-rate × profit-factor.
- **Earnings handling: option (b) — block opens 24h before / 4h after scheduled earnings.**
- Equity-native additions: **gap-fill YES (primary). PEAD DEFER (needs multi-day framework). Sector rotation + index rebalance DEFER to Phase G.**
- Earnings-calendar feed source decision (likely Yahoo for free; Polygon if budget permits later).

### Phase E — Factor identification + calibration *(LAST — after A-D done, requires accumulated VTS trades)*

**E.1 — xStock factor candidate identification.**

Drop: `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`.

Keep: `b67_2_phase_preference`, `b67_4_outcome_feedback`, `b68_1_multi_tf_agreement`, `b68_2_volume_regime`, `b68_4_freshness`, `b68_5_dbs_sustainability` (once Phase A done).

Repurpose: `b68_3_pair_correlation` — sector ETF per symbol via same DRY mapping.

Add: VIX-derived, DXY-derived, beta-to-SPY rolling, market-breadth, earnings-proximity (if D adopts earnings handling). 4-8 candidates; expect 2-4 to clear decision-grade.

**E.2 — Factor emitter implementation.**

**E.3 — 14-day observation window + calibration analysis.**
- Decision-grade gate: n ≥ 150/bucket, spread ≥ 7pp, p < 0.05.

### Phase F — Exit-strategy ablation *(two-stage)*

**F-NOW (~half day):**
- Verify `exit_strategy_alternates` schema includes `asset_class` + aggregator filters.
- **Asset-class-tag pre-calibration trades at OPEN time (Langston round-1 verification item #3 — explicit storage location):**
  - Add `calibration_state TEXT` column to `vts_open_trades` table (the existing open-trades persistence table from B79.0g).
  - Default value: `'pre_calibration_xstock_2026_05'` for any xStock trade opened before Phase E ships.
  - Set at INSERT time in `vts-trade-persistence.ts::insertOpenTrade()`, not at close time — open trades spanning Phase A-E ship retain their open-time tag.
  - On trade close, `calibration_state` propagates from `vts_open_trades` → `exit_strategy_alternates` row via the exit-strategy-replay-service writer.
  - Aggregator query at `exit-strategy-ablation-aggregator.ts::computeExitStrategyAblation` adds `AND calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'` to its WHERE clause when scoped to xStocks.
  - Post-Phase-E trades: default value flips to `'production'` via a one-line migration when Phase E ships, so the gate auto-engages.
- Backfill check for pre-launch historical xStock outcomes (likely empty; one-line script).

**F-LATER (~20-30 days from start):**
- Once post-Phase-A-D trades reach n ≥ 150/variant: run B73 framework.
- Tune trailing parameters, BE-stop policy, moonbag policy. Refines B.6 priors.
- Update `module_constants` TEC config.

### Phase G — Cross-asset ranking parity *(post-launch, NOT in scope)*

**B81 prerequisite checklist (item-by-item explicit, Langston round-1 verification item #4 — forward-reference for `MULTI_ASSET_VTS_EXPANSION_PLAN.md`):**

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

## 2. Updated timeline

- Phase 0 (corporate-actions audit): 1 day pre-flight, parallel to A.1
- Phase A: 3-5 days
- Phase B: 8-12 days (seven sub-batches; B.4→B.5 sequenced consecutive)
- Phase C: 3-5 days (parallel to B)
- Phase D: 3-4 days (parallel to B/C)
- Phase E.1-E.2: 3-4 days (sequential after A+C+D)
- Phase E.3: 14 days observation (serialized)
- Phase F-NOW: 0.5 day
- Phase F-LATER: separate ~2-3 day batch ~20-30 days from start

**Total wall-clock to factor calibration decisions: 35-45 days nominal.**

**Conservative: 55-65 days** (was 50 in v1; Langston Q5 stack-up):
- DBS design call iteration: +1-3 rounds
- Phase 0 surfaces ≥1 edge case: +2-3 days
- Strategy set ≥1 redesign-not-retune: +3-5 days
- Gap-fill design+impl: +3-5 days
- Earnings handling impl: +2-3 days
- Stack-up adds ~10-15 days over nominal in compound-risk scenarios.

**Exit-strategy ablation calibration complete: 55-75 days from start.**

---

## 3. Workflow doc invariant — final phrasing

For `ASSET_CLASS_ONBOARDING_WORKFLOW.md` standing rule (added at plan close):

> **Calibration dependency invariant.** For every new asset class, calibrate from the upstream end of the pipeline toward the downstream end (regime → filters → strategy gates → exits → factors). Each stage's data window must START only AFTER the prior stage's calibration has shipped. Data collected on miscalibrated upstream is plumbing-validation only, not calibration-grade. Truncate or asset-class-tag pre-calibration trades for exclusion from analysis.
>
> **Layer-1 starter values are deployment-validation only — not calibration-grade. Evidence collected on miscalibrated upstream cannot be used as calibration input for downstream stages, even if the downstream values appear plausible.**

---

## 4. Foundational decisions — v2 resolved (no remaining open questions)

All Q1-Q9 from v1 §6 resolved per Langston round-1:

| Q | Decision |
|---|---|
| Q1 DBS architecture | Sector-classification + SPY fallback. Eleven SPDR sector ETFs. SSOT on registry. Three caveats: index-self handling, ADR flag for Phase E, no-pre-emptive-component-weight-retune. Per-sector floor 3-5 / global 30. |
| Q2 Strategy set | Keep 9 carryovers + audit. Watchlist: pivot_shift + mean_reversion + range_trade. ORB sweep 5/15/30/60min. Equity-native: gap-fill YES, PEAD/rotation/rebalance DEFER. Earnings option (b). |
| Q3 Macro modifier | VIX-only start. DXY second after first window. Sources FRED + Yahoo. Defer Polygon. Cadence VIX 5min / FRED hourly. |
| Q4 Pair correlation reference | Sector ETF per symbol via same DRY mapping. |
| Q5 Timeline | 35-45 nominal / 55-65 conservative. |
| Q6 Invariant | Accept with appended clarifying sentence. |
| Q7 Corporate actions | Phase 0 pre-flight, parallel to A.1. |
| Q8 RTH/extended-hours | Option (d) capture, defer split decision to evidence. NYSE market clock + market_hours_open. |
| Q9 Position sizing | Shared `position-sizing.ts` + sector concentration gate (2-3 positions/sector OR 35-40% heat). |

---

## 5. What we need from you (final pass)

1. **ACK** if v2 captures all your round-1 refinements correctly.
2. **Any final refinements** — last-pass scrutiny on the v2 doc itself, last corner cases, last sequencing nits.
3. **Sign-off to lock the plan** — after your ACK, plan is locked, code starts at Phase 0 corporate-actions audit.

If no further revisions, this v2 doc becomes the locked plan referenced from `MULTI_ASSET_VTS_EXPANSION_PLAN.md` and the canonical "must do for every new asset class" entries get distilled into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` per Kyle's plan-end direction.

— CC

---

*Cross-session + round-1 paper trail:*
- `Cross-Session Briefs/FACTOR_CALIBRATION_FRAMEWORK_BRIEF_2026-05-14.md` (original, has confidence-chain correction pending)
- `Cross-Session Briefs/XSTOCK_CALIBRATION_MASTER_PLAN_2026-05-14.md` (original)
- `Cross-Session Briefs/XSTOCK_CALIBRATION_REVISED_PLAN_RESPONSE_2026-05-15.md` (peer revised + disagreements)
- `Cross-Session Briefs/XSTOCK_CALIBRATION_CONVERGENCE_RESPONSE_2026-05-15.md` (original concession + four additions)
- `Cross-Session Briefs/XSTOCK_CALIBRATION_CONVERGENCE_FINAL_2026-05-15.md` (final convergence)
- `Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REVIEW.md` (v1 design ask)
- `Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REPLY_ROUND1.md` (Langston round-1 reply)
- `Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` (this doc)
