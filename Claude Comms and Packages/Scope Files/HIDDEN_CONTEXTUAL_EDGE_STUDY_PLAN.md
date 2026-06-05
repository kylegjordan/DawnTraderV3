# Hidden-Contextual-Edge Study — Design Plan (Kyle directive 2026-06-04)

> **Status:** DESIGN PLAN for Langston review. Not yet built/run. READ-ONLY analysis effort; no production code change in the study phase. Author: Claude Code. Reviewer: Langston.

## 0. Purpose

Pattern conditional-edge work (2026-06-04) proved that a strategy with no edge *on average* can hide a **profitable subset** whose winners share an identifiable context (for patterns: continuation + high-volatility/trending). Kyle's directive: do this **systematically for ALL strategies, not just patterns** — mine our wins and losses for the contextual conditions under which each strategy's winners cluster, so we can gate each strategy to its favorable context and lift **both win-rate and per-trade profit**. Findings feed a tuning decision (separate, later); the *methodology* becomes a repeatable engine an ML process runs periodically to keep hunting (and to catch drift, since these edges may not be permanent).

## 1. Hard constraints (Kyle)

1. **Bullish-only.** The system cannot short. Every candidate edge/gate must be on the BUY side. (This simplifies "continuation" = buy in an up-regime; "reversal" = buy against a down-regime = the known loser.)
2. **No fixed-duration cap.** Outcome = the system's actual managed exit (stop / target / trailing), NOT a fixed horizon.
3. **Net of friction.** Every outcome is realized P&L AFTER round-trip cost (fees + spread + slippage), per asset class.
4. **Identify, don't tune.** The study only SURFACES candidate gates with evidence. Tuning the system to them is a separate Kyle-approved batch afterward.
5. **Reusable for periodic ML.** Build as a parameterized, schedulable engine with a defined output (ranked candidate gates + a drift signal), not a one-off script. Frequency TBD.
6. **Calibration-lens / no data-snooping.** Mining many slices WILL surface spurious "edges." Out-of-sample + temporal-stability validation is mandatory before any finding is trusted.

## 1a. Calibration-robustness — survive Phase 25 re-tuning (Kyle 2026-06-04)

We are mid-xStock-calibration, and Phase 25 will recalibrate crypto + xStock regime thresholds, gates, and trade construction again. The study must survive that. Distinction: the study finds (i) **real market relationships** ("a buy aligned with a strong high-volatility uptrend travels further") that are properties of the *territory* and are INVARIANT to where we move our threshold lines, vs (ii) findings **pinned to our own labels/gates** ("wins in the ST regime"; "winners among what the current gate admits") that shift when we redraw a boundary or change which trades exist. Design principles:

1. **Anchor findings on RAW market features, not our labels.** Express each candidate edge primarily in terms of the actual underlying values (realized volatility number, DBS magnitude/sign, trend-strength, continuation-vs-reversal) — not only the regime *label* or the *admitted* gate output. Report both forms; treat the raw-feature form as the durable finding and the label/gate form as the as-of-this-calibration view. Calibration changes our MAP, not the TERRITORY; durable edges live in the territory.
2. **Re-run after every calibration (and periodically).** The label/gate-tied portion is refreshed by re-running the engine under the new settings — this IS the periodic ML scan (S6) and the drift monitor (temporal-stability, S5/S6). Calibration-moves-findings is not a flaw; it is the reason the engine is built re-runnable.
3. **Findings INFORM calibration, not just the reverse.** Evidence that a strategy only earns its keep in a specific raw context is direct input to where Phase 25 should set that strategy's gates and regime boundaries. Sequence: run now (raw-anchored) → feed Phase 25 → re-run after to confirm label/gate gates under final settings.
4. **Outcome sensitivity to trade construction.** Replayed outcomes use each strategy's CURRENT stop/target geometry; if Phase 25 re-tunes trade construction, outcomes change → re-run. S1 records the geometry + threshold epoch each run was measured under, so every finding is tagged to its calibration.

## 2. Data foundation

- **Context (conditioning variables) — CAPTURED, queryable.** `pair_scan_archive` (monthly partitions, ~2.8M rows/month): per-pair per-MCE-cycle (~60s) flat columns `regime_label, regime_confidence, dbs_score, dbs_category, atr_pct, confidence_modulated` + JSON `features{volatility, adx, momentum, volume24h, sma, vwap, high24h, low24h, phase, phaseAgeSeconds}` + `modulators{macro_modifier_value, dbs_slope}`. `signal_eval_archive` (~10M rows/month) adds per-strategy `regime_label, reject_stage, final_score, confidence_modulated` + gate decisions.
- **Outcomes — via REPLAY (the established B3.1a method).** No structured closed-trade table is accumulating (`paper_sim_trades`=0; only ~1.2k admitted signals/month, no stored geometry). So outcomes are reconstructed: for each strategy, replay its BUY-signal detection + entry/stop/target construction over history, simulate the managed exit against fine bars (reuse the B3.1a L2 hit-ordering engine), record realized net P&L + win/loss + exit reason + duration. This is how B3.1a/B3.1a-gate-audit already measured outcomes — extend it to all strategies with full context tagging.
- **Recomputed context where not persisted.** IMF VN / DI / LQ and any fast-moving feature not in the archive are recomputed from bars during replay (formulas exist: `imf-metrics.ts`).
- **Window:** long enough for stable per-(strategy×regime×asset) cells — target ≥ 60 days where bar history allows; crypto 24/7, xStock 24/5. Sized in Section S1.

## 3. Outcome variable

Per replayed BUY trade: `net_pnl` (= gross move − round-trip friction), `win = net_pnl > 0`, `gross_pnl`, `R-multiple` (net P&L / initial risk), holding duration, exit reason (target/stop/trailing/timeout). Primary slice metrics: **win-rate, expectancy (mean net P&L per trade), profit factor (Σ gross wins / Σ gross losses), and net edge vs friction**, each with a significance estimate (t-stat / bootstrap) and N.

## 4. Context feature menu (conditioning variables)

asset_class · strategy · regime_label (TFS/ST/HVU/IE/RBS) · regime_confidence · DBS score · DBS category (7 levels) · DBS slope · continuation-vs-reversal (signal dir vs DBS/trend) · ATR% (volatility) · ADX / trend-strength (ranging↔trending) · momentum · IMF VN · IMF DI · liquidity proxy (LQ / volume / spread) · macro modifier · phase (EARLY/PRIME/LATE) · time-of-day / session position · distance from recent high/low (extension vs pullback) · day-of-week · confidence / final_score · signal_type (QUANT/PATTERN/HYBRID) · pattern_type (where applicable).

## 5. Slicing angles (comprehensive — "look at all of it")

- **Kyle's primary cuts:** asset_class × regime × strategy (the headline grid), and asset_class × regime (coarser).
- **Single-dimension scans:** each context feature above vs win-rate/expectancy, per asset_class (and per strategy).
- **Two-way interactions:** strategy × regime, regime × DBS-category, continuation × volatility, regime × volatility, strategy × continuation, phase × regime, time-of-day × regime.
- **Best-gate hunt:** enumerate single + 2-way (and selected 3-way) conditions, rank by expectancy/edge with a sample floor; report the top candidate gates per strategy and globally.
- **Winner-vs-loser profiling:** for each strategy, contrast the top-quintile vs bottom-quintile trades' average context → what separates winners.
- **Exit-reason analysis:** how do winners exit (target vs trailing) vs losers (stop vs timeout) — informs trade-construction tuning.

## 6. Robustness (mandatory — overfitting + drift guard)

- **Out-of-sample holdout:** split the window (e.g. first 70% train / last 30% test, or k-fold by time); a candidate gate must hold its edge on unseen data to be reported as real.
- **Temporal stability:** measure each surfaced edge across sub-periods (rolling windows) — does it persist or drift? This is the direct test of Kyle's "these may not stay true forever" concern, and the exact signal the periodic ML scan would monitor.
- **Multiple-comparisons honesty:** report how many slices were tested and apply a significance correction; flag any edge that's likely noise.

## 7. Sections (incremental sub-studies — "we don't have to do it all in one study")

- **S1 — Engine + outcome foundation.** Stand up the all-strategy replay-outcome engine (reuse B3.1a), BUY-only, net-of-friction, with full context tagging. Validate fidelity vs known baselines + size the window. *Gate: outcome engine trusted before any mining.*
- **S2 — Headline grid.** asset_class × regime × strategy: win-rate, expectancy, profit factor per cell. The "where does each strategy already win" map.
- **S3 — Single-dimension + interaction scans.** All context features + the 2-way interactions; winner-vs-loser profiling per strategy.
- **S4 — Best-gate hunt + per-strategy favorable-context profiles.** Ranked candidate gates ("only trade strategy X when condition C holds"), each with expectancy, frequency, and net-of-friction.
- **S5 — Robustness.** Holdout + temporal-stability validation of S4's candidates. Only survivors graduate to "real."
- **S6 — Productionization design.** Document the engine as a repeatable, parameterized ML routine: inputs (window, strategies, features), output (validated candidate gates + drift report), suggested cadence, and how it would feed a tuning/gating decision. (Methodology doc → `ASSET_CLASS_ONBOARDING_WORKFLOW.md` / a new analytics-runbook; wired to ML later.)

## 8. Open questions for Langston

1. Outcome source: confirm replay (extend B3.1a engine) vs any closed-trade store I've missed.
2. Trade-construction fidelity: should replay use each strategy's *current* stop/target geometry, or also test alternative exits (since exit logic is itself a tuning lever)?
3. Window length + holdout split for adequate per-cell N without staleness.
4. Significance bar + multiple-comparisons correction to adopt.
5. Whether to include crypto from the start (touches the no-touch-crypto principle only at the *analysis* level — read-only) or xStock-first.

## 9. Caveats / limitations

- Outcomes are replay-reconstructed (no live closed-trade table) → depends on engine fidelity to the system's real entry + managed-exit logic; validated in S1.
- Context join is nearest-prior-cycle (~60s granularity) for archived features; fast features recomputed from bars.
- This is hypothesis-generation; nothing is tuned until findings survive S5 and Kyle approves.
