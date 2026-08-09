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

**⇒ HARD PRECONDITION ON ANY GEOMETRY CHANGE: every VTS and paper row must record the geometry-config VERSION in effect at signal time — the VERSION, never the value** (r2.1(b): the version is the partition key; a value cannot partition the ten strategies whose geometry is not one number). With that stamp, a mid-window change costs an analysis *boundary*; without it, it costs the *window*. **It must land BEFORE any value moves.**

**★ WHERE THE STAMP GOES — CORRECTED 2026-08-09, and it is NOT the curated field list.** The r2.1(a) prescription aimed it at `signal-orchestrator`'s curated rebuild. **Langston then measured that writer's own rows and refuted his own fix:** declined signals are NOT lost (his `rtb_signals`-deletion mechanism was false, and my restatement of it inherited the error) — they are **retained at volume in `signal_eval_archive`** (crypto/24h: `pre_filter` 1,734,883 · `strategy_internal` 21,915 · `sqe` 6,812 · `admitted` 310), 90d hot then WARM→COLD, never deleted. **The rows survive; the GEOMETRY on them does not** — `vts-runner` writes `target`/`atrAtOpen` at **32/32** (the known-positive), while `signal-orchestrator` writes **0 of 6,077** SQE rejects and **0 of 270** admits. **32 of 29,050 rows = 0.11%.** ⇒ **the stamp belongs at the SQE REJECT HOOK, copying `vts-runner`'s existing write** — a write-site PARITY problem, not a design problem, and cheaper than this plan originally implied. A curated-list fix would have stamped the promoted rebuild and left the declined population geometry-blind — the exact failure the precondition exists to prevent.

## 3. WHAT VTS CAN AND CANNOT ANSWER (Kyle's own principle, applied)

**Kyle's test:** *admission bias changes WHICH entries you sample; it does not change how price moved afterwards.*

| question | VTS? | why |
|---|---|---|
| If the multiplier rises, **how much longer is the hold?** | **YES** | time-to-target is a market property; 43.5k crypto rows + 1m bars back to 2026-04-28 |
| **Do larger targets get hit less, and by how much?** | **YES, PER STRATUM** | the replay already runs. ⚠️ **"Shape transfers even where levels do not" holds ONLY when the bias is on ADMISSION and the measured quantity is a property of the POST-ENTRY PRICE PATH. ★ THE BREAK CASE — AND WE ARE IN IT: the gate selects on the SAME AXIS being swept** (netEV gates on target-vs-friction; target is exactly what the sweep moves). ⇒ **stratify by ATR% bucket × regime and read the optimum's LOCATION per stratum** — stable across strata ⇒ set ranges on it; moves with the stratum ⇒ **the answer is PER-STRATUM, not per-strategy, and that IS the finding.** Never average across it |
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
**★ THE TEST EVERY SOURCE MUST PASS BEFORE IT INFLUENCES A NUMBER (r2.3, replacing the weaker "sit above the published range" wording — which read as *borrow their number and add margin*): A SOURCE'S NUMBER IS ADMISSIBLE ONLY IF WE CAN RE-DERIVE IT FROM ITS STATED COST BASIS, AND RE-DERIVE IT AGAIN AT 80bps.** Non-re-derivable ⇒ **REASONING ONLY, never a value.** ⚠️ **AND CLASS 3 (crypto, 10–80bps) IS HELD TO THE SAME TEST — similar friction buys NO exemption:** a 60bps number from another venue with different fill behaviour **is not ours.**
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


---

# P1a RESULT — per-strategy geometry on held VTS data (14d, crypto, n≥20 per strategy)

**The decisive column is FEE AS A SHARE OF TARGET.** At 0.80% round-trip, a strategy whose target the fee eats a quarter of cannot clear the gate however good its signals are.

| strategy | n | target% | stop% | ATR% | implied mult | R:R | **fee as % of target** |
|---|---|---|---|---|---|---|---|
| `vwap_pullback` | 66 | **16.65** | 6.48 | 1.67 | **10.65** | 2.61 | **5%** |
| `strong_bull_trend` | 264 | **13.25** | 6.62 | 2.21 | 6.00 | 2.00 | **6%** |
| `volatility_edge` | **6,902** | **7.16** | 4.30 | **2.87** | 2.50 | 1.67 | **11%** |
| `sma_trend_ride` | 638 | 4.61 | 2.31 | **2.91** | 2.05 | 2.00 | 17% |
| `defensive_hedge` | 38 | 3.46 | 2.29 | 1.59 | 2.43 | 1.62 | 23% |
| `vwap_bounce` | 28 | 3.38 | 1.69 | 3.29 | 1.33 | 2.00 | 24% |
| `support_bounce` | 423 | 3.04 | 0.92 | 1.52 | 2.00 | 3.32 | 26% |
| `reverse_impulse` | 496 | 2.91 | 1.44 | 1.27 | 2.32 | 2.23 | 28% |
| `inside_bar_reversal` | 378 | 2.91 | 1.74 | 1.16 | 2.50 | 1.67 | 28% |
| `pivot_shift` | 203 | 2.83 | 1.54 | 1.08 | 2.58 | 1.82 | 28% |
| `morning_star` | 965 | 2.75 | 1.44 | 1.10 | 2.50 | 2.07 | **29%** |

## ★ THE FINDING — IT IS NOT THE MULTIPLIER, IT IS WHICH PAIRS EACH STRATEGY FIRES ON

**`volatility_edge` and `morning_star` carry the IDENTICAL configured multiplier — 2.50.** `volatility_edge` produces a **7.16%** target; `morning_star` produces **2.75%**. **The whole difference is ATR: 2.87% vs 1.10%.**
⇒ **the failing strategies are not mis-multiplied — they are firing on QUIET PAIRS.** `morning_star`, `pivot_shift`, `inside_bar_reversal`, `reverse_impulse` all sit at **ATR 1.1–1.3%**, where even a 2.5× multiplier cannot reach 3%.
**★ ⇒ A THIRD LEVER, not previously in the plan: WHICH PAIRS A STRATEGY IS ELIGIBLE TO FIRE ON.** Raising `morning_star`'s multiplier to reach 4% would need **3.6×** — pushing its target far past its own pattern's structural logic. **Restricting it to pairs above an ATR floor achieves the same target with the multiplier untouched.**

## SECOND FINDING — the top two are NOT ATR-multiplier strategies at all

**`vwap_pullback`'s implied multiplier is 10.65 — and it is one of the TEN strategies with NO configured `target_exit_atr_multiplier`.** It reaches a 16.65% target by R-multiple/measured-move. **⇒ the two best fee-ratios in the book come from the mechanism family P4 was written to investigate, and which the multiplier study would have skipped entirely.** *(n=66 — small; directional only.)*

## THIRD — `volatility_edge` is the volume leader AND viable: 6,902 signals, 7.16% target, 11% fee drag.
**It is doing what the others cannot: selecting volatile pairs, then applying an ordinary 2.5×.** **It is the existing proof that the pair-eligibility lever works.**

⚠️ **LIMITS: VTS population (no SQE/RTB), so these are GEOMETRY facts, not admission or win-rate facts. Per Langston's (2) the next cut is stratified by ATR% × regime — this table is per-strategy and therefore still averages across strata. `vwap_bounce` n=28 and `defensive_hedge` n=38 are too small to rule on.**


---

# REGIME PROVENANCE READ (Kyle-directed, BEFORE the stratified cut). **VERDICT: THE INTENT IS CORRECT AND THE METHOD WAS PRINCIPLED. Do not treat crypto's regime thresholds as wrong.**

**SOURCE: `B_4_REGIME_RECALIB_STUDY_RESULTS.md`** — B.4 foundation, Phase-II, read-only replay (`scripts/b4-regime-recalib-study.ts`). **Scale: 3.69M 1m rows, 485 symbols, ~34 days (2026-04-30 → 2026-06-03); 101,838 60m bars vs 300,951 15m bars.** Production compute functions reused **verbatim**; bars rebuilt **uncapped** from `xstock_spot_ohlc_1m` (deliberately NOT the 240-cap cache aggregator).

## What the intent actually was — and it is a good one

**METHOD: PERCENTILE PRESERVATION.** Each 60m threshold's **rank** is carried to 15m, not its value ⇒ **every cutoff keeps its FRACTION OF BARS.** That is the principled way to move a threshold across bar sizes, and they did it for all 14.

**★ AND THEY KNEW IT WAS INSUFFICIENT ON ITS OWN — the exit gate proves the care taken:** *"Per-threshold percentile preservation preserves each cutoff's FRACTION of bars, but NOT the joint regime MIX (AND/OR branch structure). The parity report must apply ALL 14 finalized thresholds TOGETHER… and report the resulting joint mix vs the chosen 60m baseline — that joint assessment + **'shift understood AND intended'** is the exit gate."* ⇒ **they required the JOINT distribution to be checked, not just the marginals. That is the exact discipline I have been failing on all week (stratify, don't pool).**

## ★★ THE FACT THAT BINDS MY STRATIFICATION — INPUTS DO NOT SCALE UNIFORMLY WITH BAR SIZE

Measured 60m → 15m: **volatility ≈0.61×** · **ADX/trend-strength COLLAPSES ≈0.48×** · **momentum ≈bar-size-INVARIANT** (same wall-clock lookback) · **|DBS| ≈scale-INVARIANT**.
⇒ **a regime threshold is meaningless without its bar size.** **Crypto runs 60m and holds the ORIGINAL 60m-calibrated thresholds; xStock runs 15m and holds the recalibrated set.** **⇒ THE TWO CLASSES HAVING DIFFERENT REGIME NUMBERS IS CORRECT BY DESIGN, NOT DRIFT — and it is the one place where per-class separation was actually completed.**

**⇒ CONSEQUENCE FOR THE STRATIFIED CUT: crypto regime labels are 60m-native and internally consistent. I must NOT compare a crypto regime label against an xStock one as though they mean the same thing, and I must not read crypto's thresholds as "un-recalibrated" — they are the baseline the xStock set was DERIVED FROM.**

## Rule-24 disposition: **(1) NOT a defect. Intent correct, execution careful, still current.**

**The one thing I would flag for a future look — and I am flagging it as a QUESTION, not a finding:** my own memory records **`regimeWeight` ~98% EXACT ZERO on the VTS path since ~07-14** (0% on 07-12/13 → 48%+ after). **That is a step change three weeks AFTER this calibration, so it cannot be explained by it, and it is not evidence against this study.** Whether it is a genuine regime read or a plumbing change is **unverified** and belongs to its own investigation — **not folded into the geometry work, and not asserted as a defect here.**

---

## P1b — THE VOLNOISE FILTER TEST (Kyle-directed 2026-08-09). HYPOTHESIS REFUTED TWICE, AND THE REAL GAP IS THE OPPOSITE ONE.

**Kyle's question:** *"Are we filtering out pairs with the right volatility, and that's why a lot of these strategies aren't producing signals with a high enough net EV?"*

**ANSWER: No. We are not filtering on volatility LEVEL at all — and that is the actual defect.**

### (a) THE SCREENER IS TWO GATES, AND NEITHER IS A VOLATILITY FLOOR — `analysis-utils.ts:249`, verbatim:
```ts
return LQ >= lqMin && VolNoise <= vnMax;
```
A liquidity FLOOR and a noise CEILING. **There is no ATR minimum anywhere in the screener.** The reachability gate that does involve ATR moved into the normalizer at reorg-B2 and is explicitly *"a feasibility check, not a quality bar"* (`analysis-utils.ts:251-255`) — it bounds targets from ABOVE (traversable), never from below.

### (b) VOLNOISE CANNOT SELECT ON VOLATILITY LEVEL — IT IS SCALE-INVARIANT BY CONSTRUCTION
`VN = MAD(|ln returns|) / max(median(|ln returns|), 0.0001)`, clamped to [0,1] (`analysis-utils.ts:139-176`, 19G formula, landed **3dd80e499 2026-03-20** — i.e. BEFORE the 2026-04-06 threshold set, so the ceilings are NOT calibrated against a dead distribution; that hypothesis is dead).
**Scale both numerator and denominator by any c>0 and VN is unchanged.** ⇒ VN measures how UNEVEN the moves are, never how BIG. A `vn_max` ceiling is structurally incapable of screening out lively pairs.

### (c) AND THE DATA AGREES — measured, not reasoned
**OBJECT:** hourly bars aggregated from `crypto_spot_ohlc_1m_2026_08`. **POPULATION:** the 163 crypto pairs with ≥48 hourly bars in the trailing 20 days (of 472 symbols present; the rest lacked coverage). **POSITIVE CONTROL:** a first cut at `n>=200` returned 9 pairs / 0 rejects — a near-total that proved to be over-filtering, not evidence; relaxing the coverage bar produced both buckets, one at the 1.0 clamp.

| bucket | pairs | avg ATR% | **median ATR%** | avg VN |
|---|---|---|---|---|
| PASS `vn ≤ 0.85` | 157 | 1.882 | **1.138** | 0.623 |
| REJECT `vn > 0.85` | 6 | 1.794 | **0.822** | 0.939 |

⇒ **The ceiling rejects 6 of 163 = 3.7% of the universe, and those it rejects are if anything QUIETER (median 0.822% vs 1.138%), not livelier.** Refuted on the data as well as on the formula.

### (d) ★★ THE REAL FINDING — A QUARTER OF THE ADMITTED UNIVERSE CANNOT CLEAR THE FEE UNDER ANY OUTCOME
Same population, pairs passing `vn ≤ 0.85`. Illustrative cut at the **2.50× ATR multiplier** (the one `volatility_edge` and `morning_star` share) against **1.60% round-trip taker** (0.80%×2 — the pure fee, so a FLOOR; real friction is higher):

| | pairs | share |
|---|---|---|
| target ≤ 1.60% ⇒ **cannot clear the fee at all** | **40** | **25.5%** |
| target 1.60–2.40% ⇒ thin | 28 | 17.8% |
| target > 2.40% ⇒ workable | 89 | 56.7% |

ATR% quartiles of the passing set: **p25 0.639 · p50 1.138 · p75 2.443.**

⇒ **25.5% of what the screener admits is structurally unprofitable before a strategy has an opinion**, and nothing upstream removes it. **The netEV gate is doing a job the screener should have done first** — which is why it reads as "strategies can't produce a high enough netEV."

### (e) THIS IS THE UNIVERSE-LEVEL MECHANISM BEHIND P1a
P1a showed `volatility_edge` and `morning_star` share the **identical 2.50** multiplier yet produce **7.16% vs 2.75%** targets purely from **ATR 2.87% vs 1.10%**. (d) explains why that is available to happen: **the quiet pairs are in the admitted universe by design, because no gate excludes them.** ⇒ the deliverable shape shifts — a per-strategy multiplier table cannot fix a universe that admits unprofitable pairs.

### (f) LIMITS, STATED
- **One multiplier.** 2.50× is illustrative; multipliers differ per strategy and **ten of the 19 carry no ATR multiplier at all** — those are not covered by (d).
- **ATR proxy.** Mean hourly `(high−low)/close`, not the system's ATR-14. Directionally sound, not the production estimator.
- **Coverage bias, and it likely UNDERSTATES (d).** 163 of 472 symbols cleared the coverage bar; thinly-captured pairs are plausibly the quieter/less liquid ones, so the true hopeless share is probably higher, not lower.
- **Rejections are not recorded.** Only one write site exists for VolNoise (`active-execution-engine.ts:3496`) and it is on the trade-OPEN path, so screener rejects leave no trace. (c) was measurable only because it was recomputed from raw bars. **Same gap family as the declined-signal geometry (0 of 8,767).**

### (g) ★ LANGSTON'S CONSTRAINT ON WHAT (d) LICENCES — an ATR floor is a SUPPLY question, not a target question
He refuted the P1a lever as I first drew it, and the correction binds (d) too. **An ATR floor does not give a strategy bigger targets on the signals it has — it DISCARDS its low-ATR ones.** Whether that is a net gain is answerable **only from the ATR distribution of each strategy's own signals**: *no right tail ⇒ no pairs to select ⇒ the lever is empty.* And **`volatility_edge` is NOT evidence the lever works — its detector selects on volatility BY CONSTRUCTION, so its 2.87% ATR is ENDOGENOUS.** It proves a volatility-selecting strategy sees high ATR; it does **not** prove an ATR floor preserves a *pattern* strategy's edge.
⇒ **(d) is a UNIVERSE-level fact and survives that critique** (it counts admitted pairs, not one strategy's selection). **But the remedy does not follow from it.** Before any floor is proposed: **per strategy, measure the ATR distribution of its OWN signals and the surviving count at each candidate floor.** A floor that leaves `morning_star` with no signals has not fixed `morning_star`.
**⚠️ ALSO OWED (his (d)): the fee-as-%-of-target ranking has NO TIME AXIS** — it ranks `vwap_pullback` first at a **~10-ATR excursion**. **EV per unit capital per unit TIME is the comparator**, and §3 already lists time-to-target as something VTS can answer. **Add it before anyone acts on that ranking.**
