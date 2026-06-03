# xStock Strategy-Fit Effort — SCOPE v1 (DRAFT for Kyle + Langston Step-1 review)

> **Kyle-approved shape (2026-06-03).** Emerged from the B3.1a gate-correctness audit: the xStock GATES are fine, but the STRATEGIES have no edge on xStocks because their own signal settings were never fitted to xStocks (only ORB has xStock params; the other 10 run inherited crypto-wildcard values). This effort fits the existing strategies to how xStocks actually trade and to the intended few-hours-hold style. **NOT building new strategies from scratch; NOT touching crypto; NOT enabling shorts.**
>
> **🚨 SCAFFOLDING/HONESTY (per §9.1):** active trading is OFF — this effort tunes VTS/simulation signals against a forward-return proxy. It produces evidence-grounded CANDIDATE settings; final proof of profitability needs paper-active wins/losses (Phase 19 → Phase 25). This effort does NOT by itself make xStocks profitably tradeable; it makes the signals demonstrably better on the forward-return evidence and readies them for Phase-19 validation. **CALIBRATION LENS axiom 6 throughout.**

---

## §0 — Plain-language headline

The strategies lose on xStocks not because the trading ideas are wrong but because every setting that shapes a trade — how it enters, where it puts the stop and target, how long it holds, the indicator levels and pattern shapes it reacts to, and even how big each price bar is — is still set to the crypto values it inherited, never fitted to how tokenized stocks move. This effort fits them: first decide the right bar size, then re-tune each live strategy's own settings using the engine that measures whether a setup actually made money afterward, then bring back and re-fit the equity-suited strategies we'd parked (including the opening-range one), and make the pattern detector judge stocks by stock rules. Crypto is untouched; everything is kept separate per market type. It all stays in simulation until active trading comes back on, which is where the final proof happens.

---

## §1 — Foundation (from B3.1a, code+DB-verified)

- **Gates are sound.** No gate false-rejects winners; one (pivot_shift RSI/ADX) provably correct. → no gate-threshold changes (`B_3_1_GATE_CORRECTNESS_REPORT.md`).
- **Strategies lose.** Admitted VTS trades realize −0.17R to −0.64R across strategies; breakout + inside_bar never fire. The edge problem is in the strategies, not the funnel.
- **Only ORB is xStock-fitted.** `module_constants strategy.*`: 7 `xstock_spot` rows (all ORB), 222 `*` (crypto) defaults the other 10 strategies fall through to. The settings that shape each trade were never fitted for xStocks.
- **Two settings layers (the key distinction):** the Phase-24 arc calibrated SELECTION/SCORING/RISK (regime, IMF, liquidity, strategy-GATES, friction, priors, sector). It never calibrated each strategy's TRADE CONSTRUCTION (entry trigger, stop/target geometry, hold horizon, indicator periods/levels, pattern tolerances) or the EVALUATION BAR FREQUENCY. This effort owns that second layer.
- **Enablement is DB-driven per-class** (`module_constants strategy_gates.xstock_spot.<strat>.enabled`; `isStrategyEnabledForAssetClass()`); 10 on / 9 off. The 9 off were a conservative Day-1 ship: deferred crypto-microstructure / non-equity-native strategies (false-positive risk on equity bars) + the system-wide long-only rule (bearish `liquidity_trap` off everywhere). Plan was always "add equity strategies later as gaps surface."
- **ORB is off because of bar frequency** (B-NEW-34): the 60-min bar left no intra-hour data for an opening range. ORB re-enable is gated on the frequency decision (W1).

---

## §2 — Workstreams + ordering

**W0 — Volume-confirmation removal (READY NOW, independent — = the former B3.1b).** Remove the volume-confirmation sub-gate from the xStock strategy paths (wrong underlying-equity data; depth-delta replacement has no signal — `B_3_1_GATE_CORRECTNESS_REPORT.md` §1/§4). xStock-path ONLY; **crypto KEEPS its volume gates** (crypto has real token volume); documented known-gap (revisit when a real token-volume feed exists). Per-class, DB-resolved, both VTS + active paths. Own pre-audit + Langston code review. Can ship before W1.

**W1 — Bar-frequency study (FIRST — everything else tunes to its outcome).** xStocks are evaluated on 60-min bars (1-min aggregated). A few-hours hold spans only 2–4 of those bars — coarse for entry timing, stop shaping, and pattern formation (part of why MORNING_STAR appears only 2.5% of the time, and why ORB can't run at all). Using the 1-min archive, rebuild at 5/15/30/60-min (and consider 1-min) and measure, per frequency: signal availability, pattern base rates, and forward-return edge (the B3.1a engine). Decide single-frequency vs multi-timeframe, per-strategy if warranted. **Output: the chosen bar frequency(ies).** This must come first because every W2/W3/W4 setting is expressed in bar units.

**W2 — Per-strategy signal re-tuning (the core).** At the chosen frequency, for each of the 10 live strategies, sweep its internal signal parameters — entry trigger, stop/target geometry (ATR multiples / R-multiples), hold horizon, indicator periods + thresholds, pattern tolerances — and keep the values that produce a real, out-of-sample forward-return edge on xStocks. Seed xStock-specific DB rows (the per-class plumbing already exists). Disable per-class any strategy that cannot earn an edge even after fitting (a normal, expected outcome — not every idea fits every market).

**W3 — Re-enable + re-fit the deferred equity-suitable strategies + finish ORB.** Re-evaluate the 9 disabled strategies for xStock fit; re-enable and re-fit the genuinely equity-suitable ones via W2's method. **KEEP the bearish one (`liquidity_trap`) OFF** until shorts are allowed or it's redesigned long (long-only is a standing constraint). Finish wiring ORB at the W1 frequency (it's purpose-built for the equity style and was only parked on the bar-frequency issue).

**W4 — Pattern-detection service made asset-class-aware + re-fit.** The recognizer runs crypto-era tolerances (the code labels them "for crypto"). Make its shape tolerances/ratios per-class (the per-class signature plumbing exists from B79.0n.PATTERN-DETECT) and re-fit the xStock values; crypto keeps its tolerances. Feeds W2/W3 for the pattern strategies.

---

## §3 — Method (reuse + harden the B3.1a engine)

Reuse `scripts/b-xstock-calib-b31a-gate-audit-2.ts` machinery: forward EXCESS return (de-meaned vs the cross-sectional universe — removes equity beta), entry at bar+1, L2 hit-ordering for path-dependency, AUC/Mann-Whitney, rolling-day consistency. **Critical addition for TUNING (vs auditing): overfitting discipline.** Sweeping parameters on a short window curve-fits noise. Guardrails (binding):
- **Train/test split + walk-forward**: pick settings on a training window, confirm the edge holds on a held-out window; reject settings that don't generalize.
- **Minimum-sample gates**: no setting adopted on thin/low-N evidence; rolling-day consistency required (rule #13).
- **Prefer robustness over peak**: choose settings on a plateau of good values, not a fragile optimum.
- **Accumulate more days**: the live archive grows daily; re-confirm as data accrues rather than locking on 7 days.
- **Realized-exit cross-check**: validate against `exit_decision_archive` realized VTS outcomes where available.

---

## §4 — Asset-class scoping (NON-NEGOTIABLE)

Every change is `xstock_spot`-scoped. Settings are DB-resolved per asset class (ORB already demonstrates it). **Crypto values are never read or written by this effort.** The crypto re-validation is a SEPARATE, later roadmap item (POST_AUDIT_ROADMAP 2026-06-03 update) reusing this methodology. No global/wildcard edits.

---

## §5 — What this is NOT

- NOT building new strategies from scratch (we'd only add a genuinely-new strategy if, after fitting, a clear xStock pattern none of the existing ones capture surfaces — evidence-driven, later).
- NOT changing crypto (separate effort).
- NOT enabling short trades (long-only stands; bearish strategy stays off).
- NOT a profitability guarantee (forward-return proxy; paper-active proof is Phase 19/25).
- NOT touching the gates (B3.1a settled them) or the KEEP-marked geometric buffers.

---

## §6 — Phasing (proposed; each its own Langston Step-4/8)

- **W0** — volume-confirmation removal (ship first, independent).
- **W1** — bar-frequency study (read-only analysis → decision).
- **W2** — per-strategy signal re-tuning (DB seeds, batched by strategy group).
- **W3** — deferred-strategy re-enable + re-fit + ORB finish.
- **W4** — pattern-detection per-class + re-fit.
> Batch-label TBD (Kyle/Langston) — this is larger than a B.x sub-batch. Candidate: its own labeled effort under Phase 24, or a Phase-24-closing workstream. Sequenced BEFORE the remaining downstream polish (B.4/5 friction, B.6 priors, B.7 sector), which would otherwise refine edgeless signals.

---

## §7 — Open questions for Langston (Step 1)

1. **Frequency study design:** single chosen frequency for all strategies, or per-strategy frequency, or genuine multi-timeframe (e.g. pattern on 15m, trend on 60m)? Risk/complexity tradeoff for the scanner + regime classifier (which also run on the bar stream).
2. **Overfitting protocol:** is train/test + walk-forward + plateau-selection sufficient given ~3–4 weeks of live archive, or do we gate final adoption on Phase-19 paper-active outcomes (i.e. W2 produces *candidate* settings, Phase 25 confirms)?
3. **Scope of W3 re-enable:** re-fit all equity-suitable deferred strategies now, or a conservative subset first?
4. **Blast radius of the frequency change:** changing the xStock bar interval touches the scanner, regime classifier, DBS, and the forming-bar behavior (B.3) — does W1's decision require its own architecture pre-audit before W2 builds on it?
5. **Sequencing vs the calibration arc:** confirm this slots ahead of B.4/5/6/7 friction/priors/sector.

---

*Scope v1 DRAFT. Foundation: `B_3_1_GATE_CORRECTNESS_REPORT.md`. Method engine: `scripts/b-xstock-calib-b31a-gate-audit-2.ts`. Active trading OFF — forward-return-proxy evidence; paper-active confirmation is Phase 19/25. Crypto untouched (separate roadmap item). CALIBRATION LENS axiom 6.*
