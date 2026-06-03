# xStock Strategy-Fit Effort — SCOPE v2 (Langston Step-1 absorbed)

> **Langston Step-1 review (2026-06-03): shape + ordering APPROVED; all 5 answers + 4 gaps absorbed into v2.** (1) single shared bar size to start, measure-all-but-default-to-one, multi-timeframe = separate later work; (2) tuned settings are CANDIDATES gated on Phase-19 paper-active outcomes + prefer broad-plateau over razor's-edge; (3) re-enable a small equity-friendly subset first (ORB first), prove method, then widen; (4) **W1 delivers TWO sign-offs before W2: the bar-size choice AND a bar-size architecture pre-audit**; (5) confirmed ahead of friction/priors/sector. Gaps: W0 lands+settles before W1; W1 also measures regime-read STABILITY per bar size; hold time anchored to the CLOCK not bar count; overnight-gap + open/close-bar handling explicit.



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

**W0 — Volume-confirmation removal (FIRST — ships AND settles before W1; = the former B3.1b).** Remove the volume-confirmation sub-gate from the xStock strategy paths (wrong underlying-equity data; depth-delta replacement has no signal — `B_3_1_GATE_CORRECTNESS_REPORT.md` §1/§4). xStock-path ONLY; **crypto KEEPS its volume gates** (crypto has real token volume); documented known-gap (revisit when a real token-volume feed exists). Per-class, DB-resolved, both VTS + active paths. Own pre-audit + Langston code review. **Langston gap-1: W0 must land AND settle before W1 runs** — it changes which signals get through, i.e. the very population W1 measures; overlapping them aims the study at a moving target.

**W1 — Bar-frequency study + bar-size architecture pre-audit (FIRST after W0 — TWO sign-offs gate W2).** xStocks are evaluated on 60-min bars (1-min aggregated). A few-hours hold spans only 2–4 of those bars — coarse for entry timing, stop shaping, and pattern formation (part of why MORNING_STAR appears only 2.5% of the time, and why ORB can't run at all). Two deliverables, both signed off before W2 starts:
- **(a) The study (read-only).** Using the 1-min archive, rebuild at 5/15/30/60-min (and consider 1-min) and measure, per frequency: signal availability, pattern base rates, forward-return edge (B3.1a engine), **AND the STABILITY of the market-type (regime) read** (Langston gap-2: finer bars can make the regime flip more often, which changes which strategies are even allowed to fire — that feeds straight back into the tuning, so it's a first-class measurement, not just signal/pattern counts). **Default decision = a SINGLE shared bar size everything runs on** (Langston #1: per-strategy / true multi-timeframe means keeping several parallel price histories in sync across the scanner, regime classifier, and liquidity scoring — too many new moving parts to bolt on during a tuning effort). Measure every strategy at every candidate size so the evidence is in hand, but only split to mixed sizes if the data flatly demands it, and then as its own deliberate later effort.
- **(b) The bar-size architecture pre-audit** (Langston #4 — his strongest point). Changing the bar size is a foundation change, not a knob: it changes how often the system re-reads the market, how often it re-decides the market type, how it scores liquidity, and how it treats the still-forming current bar (B.3). A short architecture review of everything the chosen size touches, signed off alongside the size choice — so we don't tune all strategies on a size and only then discover it forces a change to regime/liquidity handling and have to redo the tuning.

**W2 — Per-strategy signal re-tuning (the core; produces CANDIDATE settings).** At the chosen frequency, for each live strategy, sweep its internal signal parameters — entry trigger, stop/target geometry (ATR / R-multiples), hold horizon, indicator periods + thresholds, pattern tolerances — and keep the values with a real, out-of-sample forward-return edge. Seed xStock-specific DB rows (per-class plumbing exists). Disable per-class any strategy that can't earn an edge even after fitting. **Two binding rules from Langston:**
- **Hold time anchored to the CLOCK, not a bar count** (gap-3): "hold N bars" silently changes the trade when the bar size changes. Define the intended hold in real time and convert per bar size.
- **Overnight-gap + open/close-bar handling explicit** (gap-4): stocks close overnight and gap; crypto never did. Stops/targets sitting through the overnight gap, and the bars right at the open and close, need explicit handling the crypto path never had — addressed in both the study and the tuning.
- **Output is CANDIDATE settings, not final** (Langston #2): ~3–4 weeks is thin for fitting; train/test + walk-forward is right but can still mistake luck for skill on a short window. Prefer a setting that works across a BROAD range over the razor's-edge best value. Final verdict comes from Phase-19 paper-active wins/losses; re-confirm as more history accrues.

**W3 — Re-enable + re-fit a SMALL equity-friendly subset first, then widen (Langston #3).** Do NOT re-enable all 9 at once (nine new misfire sources to debug simultaneously). Start with the obviously-stock-friendly ones built for how stocks open and trend — **ORB first** (it was only parked on the bar-size question, now resolved by W1). Prove the fitting method earns a real edge on that handful, then widen via W2's method. **KEEP the bearish one (`liquidity_trap`) OFF regardless** until shorts are allowed or it's redesigned long (long-only stands).

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

## §6 — Phasing (each its own Langston Step-4/8; strict ordering per Langston Step-1)

- **W0** — volume-confirmation removal. Ships FIRST and is allowed to SETTLE before W1 (it changes the population W1 measures).
- **W1** — bar-frequency study + bar-size architecture pre-audit. TWO sign-offs (size choice + architecture review) BEFORE W2.
- **W2** — per-strategy signal re-tuning (DB seeds, batched by strategy group). Produces CANDIDATE settings; Phase-19 confirms.
- **W3** — re-enable a small equity-friendly subset (ORB first), prove, then widen + re-fit.
- **W4** — pattern-detection per-class + re-fit (feeds W2/W3 pattern strategies; can run alongside W2 once frequency is fixed).
> Batch-label TBD (Kyle/Langston) — larger than a B.x sub-batch; candidate = its own labeled effort under Phase 24, or a Phase-24-closing workstream. Sequenced BEFORE the remaining downstream polish (B.4/5 friction, B.6 priors, B.7 sector) — confirmed by Langston, since polishing selection over edgeless signals is polishing noise.

---

## §7 — Open questions — RESOLVED by Langston Step-1 (2026-06-03)

1. **Frequency study design** → single shared bar size to start (measure all, default to one); multi-timeframe only if data demands, as its own later effort. ✅
2. **Overfitting protocol** → train/test + walk-forward + broad-plateau selection for CANDIDATE settings; final adoption gated on Phase-19 paper-active outcomes. ✅
3. **W3 re-enable scope** → small equity-friendly subset first (ORB first), prove, then widen; bearish stays off. ✅
4. **Frequency-change blast radius** → YES, W1 includes its own bar-size architecture pre-audit, signed off with the size choice before W2. ✅
5. **Sequencing** → confirmed ahead of B.4/5/6/7 friction/priors/sector. ✅

**Remaining for Kyle:** batch-label + go-ahead to start W0 (volume removal, ready now) and then W1 (frequency study + architecture pre-audit). "the ARM" placement for the crypto re-validation roadmap item — confirm = AMR (Adaptive Market Response).

---

*Scope v2 (Langston Step-1 absorbed 2026-06-03). Foundation: `B_3_1_GATE_CORRECTNESS_REPORT.md`. Method engine: `scripts/b-xstock-calib-b31a-gate-audit-2.ts`. Active trading OFF — forward-return-proxy evidence; paper-active confirmation is Phase 19/25. Crypto untouched (separate roadmap item). CALIBRATION LENS axiom 6.*
