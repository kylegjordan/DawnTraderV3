# TARGET-GEOMETRY STUDY — plan for Langston's review

**CC-C, 2026-08-08. Kyle-directed, after four rounds of pushback in both directions.** Feeds Phase-25 item **25-17**; the question is what can run **now, in Phase 19**, without corrupting the data Phase 25 will consume.

## 0. THE QUESTION

Why do so few crypto signals carry targets large enough to clear an 0.80% round-trip fee — and what should each strategy's target geometry actually be, per asset class?

## 1. WHAT IS ALREADY MEASURED (not assumptions — these are the study's starting facts)

- **Target decomposes into two factors:** `target% = implied_multiplier × ATR%`. Measured across 1,128 recent crypto signals by target quartile: Q1 2.54% (ATR 1.11, mult 2.46) · Q2 3.12% (1.27, 2.48) · Q3 3.74% (**2.87**, **1.98**) · Q4 **11.25%** (**2.95**, **4.46**).
  ⇒ **In the bottom three quartiles the driver is PAIR VOLATILITY (multiplier actually FALLS 2.46→1.98 while ATR triples). In the top quartile it is the MULTIPLIER — same volatility as Q3, 3× the target.** Both levers are real; they dominate in different places.
- **The multiplier is per-STRATEGY, not universal:** 6.0 `strong_bull_trend` · 3.0 `adaptive_flow`/`pivot_shift` · 2.5 `morning_star`/`volatility_edge` · 2.0 `inside_bar_reversal`/`reverse_impulse`/`support_bounce` · 1.8 `defensive_hedge`. **All rows `asset_class='*'`.**
- **⚠️ ONLY 9 OF 19 STRATEGIES HAVE ONE.** The other ten — `abcd_long`, `breakout`, `dhma`, `liquidity_trap`, `mean_reversion`, `orb`, `range_trade`, `sma_trend_ride`, `vwap_bounce`, `vwap_pullback` — set targets by **R-multiple / measured-move / percent**, with **no bounds, no cadence, no inventory row**.
- **Nothing has ever calibrated these.** B72 migrated them off hardcode at unchanged Replit-era values; `ADJUSTMENT_FRAMEWORK.md:415-421` defines Tier-1 bounds + 0.25 step + 7-day cadence **for only 4 of the 9**, and that cadence **has never run** — the mechanism that would have run it was the adaptive tuner, dormant with zero callers, deleted 2026-08-07.
- **The cost of moving it, measured:** ~10 points of hit rate lost per +0.5× of target (held directionally across three differently-biased populations; levels differed).

## 2. ★ KYLE'S QUESTION: WOULD TESTING NOW POLLUTE THE DATA PHASE 25 NEEDS?

**Answer: only if the change is unstamped. Stamped, it is a PARTITION, not damage.**

The failure mode is real and we have already lived it: the 11.7S damper silently modulated VTS rows for weeks, and the only reason that history is still usable is that a `strategyMode` stamp exists to partition on. The exploration lane already does this correctly — every admit carries `netEvAtAdmit` + `floorInEffect` + `admissionBasis`, so its cohort is separable after the fact.

**⇒ HARD PRECONDITION ON ANY GEOMETRY CHANGE: every VTS and paper row must record the multiplier (or geometry-config version) in effect at signal time.** With that stamp, a mid-window change costs an analysis *boundary*; without it, it costs the *window*. **This is cheap, it is the same pattern already proven twice in this codebase, and it must land BEFORE any value moves.**

## 3. WHAT VTS CAN AND CANNOT ANSWER (Kyle's own principle, applied)

**Kyle's test:** *admission bias changes WHICH entries you sample; it does not change how price moved afterwards.*

| question | VTS? | why |
|---|---|---|
| If the multiplier rises, **how much longer is the hold?** | **YES** | time-to-target is a market property; 43.5k crypto rows + 1m bars back to 2026-04-28 |
| **Do larger targets get hit less, and by how much?** | **YES** | the replay already runs; shape transfers even where levels do not |
| **Is there a multiplier where hit-rate decay stops outrunning the bigger payoff?** | **YES, as SHAPE** | the optimum's LOCATION is informative; its absolute EV is not |
| **Would this signal have been admitted / ranked top?** | **NO** | no SQE, no RTB — selection question, needs the gated population |
| **What win rate will live trading see?** | **NO** | VTS levels are biased low (unfiltered); paper survivors biased high. **Neither number transfers.** |

⇒ **Use VTS for the SHAPE of the target/hit-rate/hold-time curve per strategy — which is exactly Kyle's "if we move the multiplier up, what are the implications for trading time" — and never for the absolute success rate.**

## 4. THE STUDY, IN FOUR PARTS

**P1 — OUR OWN EVIDENCE FIRST (runs now, no external source, no setting changes).** Per strategy × per asset class, from held data: implied-multiplier distribution, ATR% distribution, time-to-target, and the hit-rate-vs-target curve. **Output: which strategies are mis-set on our own evidence, before anyone reads an industry paper.**

**P2 — INDUSTRY RESEARCH FOR THE *WHY*, NOT THE NUMBER (Kyle's framing, adopted; expanded 2026-08-08 at his ask).**
**THE GOVERNING QUESTION: what DECIDES a target multiple — and does that reasoning survive our fee environment?** Not *"what number do they use"* but *"what makes 2× right for one setup and 5× right for another."*
**FOUR SOURCE CLASSES, deliberately different in kind so no single bias dominates:**
1. **PRACTITIONER-CANONICAL — named, proven, published traders.** Van Tharp (position sizing / R-multiples / expectancy — the framework our own `netEV` most resembles), Perry Kaufman (adaptive/volatility-scaled systems), Curtis Faith & the Turtle rules (explicit N/ATR-based entries, stops and exits — the closest published analogue to what we do), Andreas Clenow (trend-following at fund scale, explicit ATR sizing). **What to extract: the REASONING for why trend systems run wide multiples and mean-reversion systems run tight ones.**
2. **QUANTITATIVE / ACADEMIC — transaction-cost-aware.** The cost-vs-edge literature (QuantPedia and equivalents), optimal-execution work on holding period vs fixed cost. **What to extract: how cost per trade should scale the target, which is the ONE place our 80bps vs their 3-5bps is directly addressable.**
3. **CRYPTO-SPECIFIC — the only class that shares our fee reality.** Retail crypto algo practice operates at 10-80bps, not institutional equity costs. **This is the class whose NUMBERS may actually transfer**; the other three contribute reasoning only.
4. **EXCHANGE / MARKET-STRUCTURE — maker-taker economics and fee-tier strategy.** How firms restructure geometry (or venue) when fees dominate edge.
**★ THE TEST EVERY SOURCE MUST PASS BEFORE IT INFLUENCES A NUMBER: state the friction it assumes.** A multiple quoted without its cost assumption is unusable to us — **at 80bps round-trip our targets must sit ABOVE the published range, so naively matching the industry moves us the WRONG way.** Any source that does not state its cost basis contributes reasoning, never a value.
**DELIVERABLE: a per-strategy-ARCHETYPE rationale** (trend / mean-reversion / breakout / pattern) **with its cost assumption named**, which P3 then scales to our friction. **Not a table of borrowed numbers.**

**P3 — DERIVE BASELINES FROM ARITHMETIC, per strategy × per class.** For each: what multiplier makes the target clear 0.80% at the hit rate that strategy actually achieves? **This is computable today and needs no external source.** Publish bounds for **all 19**, not the 4 that have them.

**P4 — THE TEN NON-MULTIPLIER STRATEGIES.** Enumerate what each actually uses (R-multiple / measured-move / percent), find its lever, and give it bounds. **Kyle's open question — this batch, its own batch, or Phase 25 — is answered by P4's findings, not before them.**

## 5. PUSHBACK KYLE ACCEPTED, RECORDED SO IT IS NOT RE-ARGUED

Industry logic not industry numbers · the multiplier is not a free dial (hit-rate cost measured) · the plan must cover 19 strategies not 9 · VTS and paper answer different questions and must not be pooled.

## 6. WHAT I STILL WANT LANGSTON TO ATTACK

1. **Is the config stamp (§2) sufficient**, or does a mid-window geometry change corrupt Phase-25's population in a way stamping cannot repair?
2. **Is P3's derivation circular?** It uses each strategy's *current* hit rate to justify a *changed* target — but the change moves the hit rate. **I think it is a first-order estimate that must be labelled as such, not a solution. Rule on it.**
3. **Does P1 belong in this batch or its own?** It is analysis with no code change, but it is not small.

---

# r2 — LANGSTON APPROVED WITH REVISIONS (2026-08-09, verdict at `cecabbe37`). All four adopted; one of them breaks my own precondition.

**He independently re-derived:** the 19-strategy SSOT (`canonical-regime-strategy-map.ts:511-533` — and confirmed my 9-with-multiplier **∪** my named ten reconciles to it **exactly, no gaps, no double-count**); `ADJUSTMENT_FRAMEWORK.md:415-421` (4 ATR-target rows, "4 of 9" correct); `signal-orchestrator.ts:1055-1110`; the exploration stamp. **RULED ON REPORTED FACT (still mine to stand behind): the 1,128-signal quartile decomposition and the ~10pt/0.5× decay.**

## r2.1 — §2 STAMP: NECESSARY, NOT SUFFICIENT. Three fixes + one thing stamping cannot repair.

**(a) IT MUST LAND IN THE CURATED FIELD LIST — `signal-orchestrator.ts:~1085-1110` — NOT on `rawSignal.metadata`.** That rebuild is an explicit field list with `_displayContext` as the only spread: **the exact line that already killed `maxHoldingMs` (#550) and `atr`.** ⇒ **a geometry stamp on the raw signal is invisible BY CONSTRUCTION.** Give it #550's ending: **typed-required + runtime backstop** (`:1084-1099` is the pattern) so **absence is a COMPILE ERROR, not a null.**

**(b) STAMP THE CONFIG *VERSION*, NOT THE VALUE.** Version is the partition key. **The value alone cannot partition the ten strategies whose geometry is not one number** — which is precisely the half of the system P4 covers.

**(c) ★★ A STAMP ONLY SURVIVES WHERE THE ROW SURVIVES — AND THIS BREAKS MY PRECONDITION AS WRITTEN.** He cites **my own `MEMORY_CC_C.md:36` at this ref**: promoted signals keep their verdict in `closed_trades.metadata`, while **DECLINED signals lose theirs when the transient `rtb_signals` row is deleted** *(and I once stated that backwards — which is why he checked rather than took it)*. ⇒ **the stamp would preserve ONLY the winners of admission, while THIS STUDY'S CORE QUESTION IS ABOUT THE DECLINED POPULATION.** **MANDATORY BEFORE THE PRECONDITION COUNTS AS MET: verify where a declined signal's geometry record actually lands.**

**★★★ AND THE CORRUPTION STAMPING CANNOT REPAIR — FEEDBACK THROUGH ADMISSION.** A bigger target changes netEV, which changes **which signals clear the floor**. ⇒ pre- and post-change **paper** cohorts are **non-comparable on ANY admission-conditioned metric, stamped or not.** VTS is ungated and stays comparable across the boundary.
⇒ **THE RULING, and it re-shapes the study's mechanics: change geometry on the VTS side mid-window FREELY; a mid-window change on the PAPER/ACTIVE path leaves Phase-25 two halves that are LABELLED BUT NOT POOLABLE.**

## r2.2 — §3 VTS: "shape transfers, levels do not" is DEFENSIBLE FOR RANGES, but NARROWER than I wrote it.

**It holds when the bias is on ADMISSION and the measured quantity is a property of the POST-ENTRY PRICE PATH.**
**★ THE BREAK CASE — and we are in it: when the gate selects on the SAME AXIS you are sweeping. netEV gates on target-vs-friction, and target is exactly what the sweep moves.**
⇒ **REQUIRED: stratify by ATR% bucket and regime, then read the optimum's LOCATION per stratum.**
- stable across strata → **set ranges on it**;
- moves with the stratum → **you have a PER-STRATUM answer, not a per-strategy one — and that IS the finding.**
**★ My own Q1/Q3-vs-Q4 decomposition is direct evidence the population is already stratified on this exact axis. DO NOT AVERAGE ACROSS IT.** *(That is the pooling error I made twice before, arriving a third time by a new route.)*

## r2.3 — §4 P2: ENDORSED, one sentence replaced.

**"Targets must sit ABOVE the published range" is directionally true but reads as *borrow their number and add margin*.** The operative rule is stronger and I already own it:
**★ A SOURCE'S NUMBER IS ADMISSIBLE ONLY IF WE CAN RE-DERIVE IT FROM ITS STATED COST BASIS, AND RE-DERIVE IT AGAIN AT 80bps. Non-re-derivable ⇒ REASONING ONLY.**
**⚠️ AND CLASS 3 (crypto, 10-80bps) IS HELD TO THE SAME TEST — similar friction buys NO exemption.** A 60bps number on another venue with different fill behaviour **is not ours.**

## r2.4 — P3 IS CIRCULAR, and "label it first-order" was the weak answer. Make it SELF-CORRECTING.

**I have the decay term, so use it.** Solve **`p(m)·target(m) > friction`** with **`p(m) = p₀ − k(m − m₀)`**; publish **the clearing `m` AND the `m` at which the linearisation breaks.**
⇒ **OUTPUT IS A BOUND WITH A STATED VALIDITY RANGE**, not a point estimate.
**⚠️ BUT `k` IS THE LEAST-VERIFIED NUMBER IN THE PLAN** — directional across three differently-biased populations, levels differed. ⇒ **P1 must RE-DERIVE `k` — and per r2.2, per STRATUM, not pooled.**

## r2.5 — WHAT THIS CHANGES ABOUT THE STUDY'S SHAPE

1. **The stamp is no longer a simple precondition** — it needs a curated-list landing, a version key, and a verified answer on where declined-signal geometry lands.
2. **Geometry changes are now ASYMMETRIC by path:** free on VTS mid-window; on paper/active they create a hard analysis boundary Phase-25 cannot pool across.
3. **Every P1 output is per-stratum** (ATR% bucket × regime), never a per-strategy average.
4. **P3 emits a bound + validity range**, and its key coefficient is re-derived by P1 rather than carried in.
