# REWARD-TO-RISK **AND** REACHABILITY — ONE BASELINE, NOT TWO

> ⛔⛔ **r1 CARRIES THREE FACTUAL ERRORS, CORRECTED HERE 2026-09-12 AFTER KYLE CHALLENGED THEM. READ THIS BEFORE §2.**
>
> **(1) “The multipliers are DB-resolved, so changing R is changing rows” IS MISLEADING AS WRITTEN.** Every strategy computes its own stop and target **INSIDE its own module, with its own formula**. The database holds the multiplier **NUMBERS** those formulas read — **the formulas themselves differ per strategy, and geometry is NOT assigned uniformly after a signal is born.** *(Kyle's instinct was right and my sentence was wrong in a way that mattered.)* Read one at a time at the ref:
>
> | strategy | stop | target |
> |---|---|---|
> | `strong_bull_trend` | `entry − 3.0×ATR` | `entry + 6.0×ATR` |
> | `adaptive_flow` | `MIN(pattern low, entry − 1.5×ATR)` — the TIGHTER | `entry + 3.0×ATR` |
> | `pivot_shift` | `MAX(morningStar low, entry − 1.5×ATR)` — the WIDER | `entry + 3.0×ATR` |
> | `inside_bar_reversal` | `parentLow × (1 − 0.003)` | `entry + 2.0×ATR` |
> | `reverse_impulse` | `pinbarLow × (1 − 0.005)` | `entry + 2.0×ATR` |
> | `morning_star` | `MIN(c2Low, c1Low) × (1 − 0.003)` | `entry + 2.5×ATR` |
> | `defensive_hedge` | `engulfingLow × (1 − buffer)` | `entry + 1.8×ATR` |
> | `support_bounce` | `supportLevel × (1 − buffer)` | `entry + 2.0×ATR` |
> | `volatility_edge` | `cPointLow × (1 − buffer)` | `MIN(measured move, ATR target)` |
> | `orb` | `rangeLow` | `entry + mult × RANGE HEIGHT` — **no ATR at all** |
> | `vwap_pullback` | `MIN(vwap − atr×m, low24h + atr×m)` | `high24h − atr×offset` — **a LEVEL minus an offset** |
> | `abcd_long` | `cLow − atr×buffer` | `MIN(measured move, TWO-R TARGET)` |
> | `sma_trend_ride` | `MIN(swingLow×m, sma×m)` | `entry + riskDistance × break_target_r_multiple` |
> | `vwap_bounce` | `vwap × m` | `entry + riskDistance × target_r_multiple` |
> | `range_trade` | `rangeLow × m` | `entry + RANGE HEIGHT` |
> | `mean_reversion` | `price × (1 − buffer)` | `meanValue × m` — **a LEVEL** |
> | `liquidity_trap` | `breakoutHigh × m` | `rangeLow × m` — **both LEVELS** |
>
> ⇒ ⛔ **THERE IS NO SINGLE CALCULATION.** Targets come from ATR multiples, measured moves, range heights, 24-hour highs, mean-reversion levels, risk-distance multiples and realised volatility.
>
> ✅ **AND THAT EXPOSES A BETTER ANSWER THAN §5 Q3 PROPOSED: the risk-distance-multiple target ALREADY EXISTS IN OUR CODE.** `sma_trend_ride` uses `break_target_r_multiple`, `vwap_bounce` uses `target_r_multiple`, `abcd_long` carries a two-R target — **three strategies already set target as a multiple of their own risk distance, with the multiple in the DB.** ⇒ **Langston's proposal does not need BUILDING, it needs EXTENDING** (`CONDUCT.md`: use what already exists before proposing new code).
>
> **(2) “3 OF 19 STRATEGIES” READ AS 3 QUANT / 16 PATTERN, AND THAT IS WRONG.** Canonical regime-strategy map, **19 distinct keys, none classified twice**: **QUANT 11** — `abcd_long`, `breakout`, `dhma`, `liquidity_trap`, `mean_reversion`, `orb`, `range_trade`, `sma_trend_ride`, `strong_bull_trend`, `vwap_bounce`, `vwap_pullback`; **PATTERN 3** — `inside_bar_reversal`, `morning_star`, `support_bounce`; **HYBRID 5** — `adaptive_flow`, `defensive_hedge`, `pivot_shift`, `reverse_impulse`, `volatility_edge`. ⭐ **We have far MORE quant than pattern strategies, 11 against 3, exactly as Kyle said.** What “3 of 19” actually meant is that **only 3 strategies carry an ATR term anywhere in their STOP** — unrelated to the quant/pattern axis, and it should never have been written beside it.
>
> ⚠️ **AND THE PATTERN *POOL* IS NOT THE PATTERN *STRATEGIES* — conflating them caused real confusion.** The pool is a separate TRIGGER path: the detector spots a shape, `patternToTradeSignal` assigns a **hardcoded** 1.5×ATR stop / 2.5×ATR target, and **only then** is a canonical strategy NAME attached. ⇒ **a pool trade can wear the name of a strategy whose own formula never ran.**
>
> **(3) ON FOLDING THE REACHABILITY WORK IN:** r1 said “merged” and then described it as a separate leg someone else owns, which reads as the opposite. ✅ **Unambiguously: ONE batch, CC-B owns it, the reachability work sits INSIDE it.**
>
> ⚠️ **PLUS AN EXTERNAL-NUMBER CORRECTION (Coltrane's, re-derived by me):** *“our fees are 13× the example's”* does **NOT** measure the damage. The damage measure is cost **relative to stop distance**: the example is `0.12 / 0.247 = 0.485`; ours is `1.61 / 3.54 = 0.455`. ⇒ **ours is slightly LIGHTER.** Our net ratio is worse **only because our gross ratio is 1.66 against their 2.0** — we are not being crushed by unusual fees, we are aiming too close for the fees we pay.
>
> ⛔ **READ §2, §4 and §5 ONLY THROUGH THESE CORRECTIONS. The measured numbers in §6 stand.**

**Owner:** CC-B · **For:** Langston + Coltrane · **Kyle-directed 2026-09-12 · r1**

> ⭐⭐ **THE ASK, IN KYLE'S FRAMING, AND IT IS DELIBERATELY NOT *"FIND MY ERROR"*.**
> **Here is our theory and here is what we think the best answer is. Read it and tell us whether it stands up — and more importantly, whether it is the BEST available answer for a system whose job is to make the largest profit we can on every trade, while trading often enough to compound.** If we are wrong, say so. But the more valuable output is **what is right**, or **a set of options with your pick and your reason.** ⛔ **We are not asking you to audit us. We are asking you to help us build the best version of this.**

---

## 1. WHAT WE ARE SETTING, AND WHY IT IS ONE DECISION RATHER THAN TWO

Three numbers per strategy govern whether a trade can be taken and how much it can make:

| number | what it does | where it lives today |
|---|---|---|
| **target multiple** | how far the target sits, in ATR | `module_constants`, `strategy.<name>`, `target_exit_atr_multiplier` |
| **stop multiple** | how far the stop sits, in ATR — **only 3 of 19 strategies have one**; the rest use a chart level | `strategy.<name>`, `stop_loss_atr_multiplier` |
| **reachability ceiling** | the most ATR a target may sit away before we call it unreachable | `expectancy_gates`, `reach_atr_max` — **per CLASS, 4.0 both classes** |

⭐⭐ **THEY ARE NOT INDEPENDENT, AND WE HAVE A LIVE CASE PROVING IT — THIS IS THE CORE OF THE PAPER.** `R = target ÷ stop`, so **raising the target to improve R also pushes the target further away in ATR — straight at the reachability ceiling.** You cannot tune one without moving the other.

⛔ **MEASURED, 2026-09-12, and it is already costing us a whole strategy:** `strong_bull_trend` is seeded target **6.0 × ATR** / stop **3.0 × ATR** ⇒ **R = 2.00, which is a perfectly good ratio.** But its target sits **6 ATR away against a 4.0 ceiling**, so `atrsToTarget = 6.0 > 4.0` ⇒ **`unreachable`.**
**Evidence:** `strong-bull-trend.ts:152-153` (`stopPrice = entry − atr × 3.0`, `targetPrice = entry + atr × 6.0`), the two seeded DB rows, and the runtime: **every `unreachable` line in the live log is `strong_bull_trend` at `rr=2.00`** — 8 occurrences in `out.log`, all of the form `[VTS][TAG_NO_DROP] <pair>/strong_bull_trend would-gate=unreachable rr=2.00 — simulating anyway for learning`. **On the learning lane it is tagged and simulated. On the active and live lanes the same geometry is DROPPED.**
⇒ ⭐ **OUR WIDEST-TARGET STRATEGY — the one whose geometry is closest to what the outside evidence recommends — STRUCTURALLY CANNOT TRADE on the active path.** That is the trap in front of any R increase, and it is not hypothetical: one strategy is already through the floor of it.

⚠️ **Instrument note, stated because it bounded the above: `reach_atr_max` has exactly TWO rows, both `strategy='*'`, per class (crypto 4.0, xStock 4.0). There is no per-strategy reachability row.** It nevertheless **binds per strategy**, because the quantity it tests is built from the strategy's own target multiple. *(Kyle's recollection was that the ceiling is set per strategy; the DB says per class. Both halves matter — the setting is per class, the consequence is per strategy.)*

---

## 2. HOW R IS ACTUALLY CHANGED — THE ANSWER IS BETTER THAN WE FEARED

⛔ **WE DO NOT HAVE TO EDIT NINETEEN STRATEGY MODULES.** The multipliers are **DB-resolved at signal generation**: each strategy reads `c.target_exit_atr_multiplier` from `module_constants` (e.g. `inside-bar-reversal.ts:85`, `reverse-impulse.ts:82`, `morning-star.ts:88`, `strong-bull-trend.ts:89`). **Changing R is changing rows, not code.**

✅ **AND PER-ASSET-CLASS ALREADY WORKS — THE MECHANISM EXISTS AND HAS BEEN USED ONCE.** Twelve of the thirteen seeded geometry rows are `asset_class = '*'`, i.e. **one shared value across crypto and xStock**. The thirteenth is `volatility_edge` / **`crypto_spot`** / `target_exit_atr_multiplier` **3.125**, written by `P19-B-FEEVIABILITY OBJ-4`. ⇒ **making the geometry asset-class-aware is ADDING ROWS, not writing code** — the resolver is most-specific-wins and already honours the class dimension.
⭐ **This matters because the two classes are not comparable: the crypto round trip is ~1.61 % and the xStock round trip is ~0.20 %** (`#1010`). **A single shared multiplier cannot be right for both, and today twelve of thirteen rows are shared.**

⚠️ **BUT R IS ONLY A DIAL ON 3 OF 19 STRATEGIES.** `stop_loss_atr_multiplier` is seeded for **`adaptive_flow` (1.5), `pivot_shift` (1.5), `strong_bull_trend` (3.0)** — and with their targets (3.0, 3.0, 6.0) **all three land on exactly R = 2.00.** Every other strategy sets its stop at a **chart level** (the pattern's own low, e.g. `inside-bar-reversal.ts:189` `parentLow × (1 − 0.003)`), so **its R floats with the shape of each setup and cannot be set to a number at all.** ⇒ **any "set R to X" instruction reaches 3 strategies directly; for the other 16 we can only move the target and watch what R does.**

---

## 3. WHAT THE OUTSIDE WORLD SAYS — AND THE ONE FINDING THAT REFRAMES IT FOR US

**Consensus, and it is remarkably consistent across crypto, tokenized-equity and traditional-equity sources:** a **2:1 minimum, 3:1 preferred** reward-to-risk. *"A 2:1 reward-to-risk ratio is the minimum most professional traders aim for"*; 1:2 is *"the minimum acceptable threshold"*. The supporting logic is break-even arithmetic: **2:1 breaks even at a 33.3 % win rate, 3:1 at 25 %.** CMT analyst Cory Mitchell's framing — *"profitable and consistent trading is about finding a balance between your win rate and risk/reward ratio"* — with professional win rates typically **35–50 %**, profitable because winners are materially larger than losers.

**On ATR multiples specifically**, practitioner consensus is **1.5–3× ATR for stops**, chosen by horizon: **day trading 1.5–2×, swing 2–3×, position 3–4×**; the Chandelier Exit's 22-period / 3× is the canonical position-trading setting. **Our seeded stops — 1.5, 1.5, 3.0 — sit inside that band.** Volatility-based stops are credited with cutting max drawdown by roughly a third versus static stops, precisely because they stop being hit by noise.

⛔⛔ **AND HERE IS THE FINDING THAT MATTERS MOST, BECAUSE IT IS THE ONE PIECE OF OUTSIDE WORK THAT SPEAKS DIRECTLY TO OUR SITUATION.** A worked example in the cost literature: **at 0.12 % round-trip cost, a strategy targeting 0.5 % wins against 0.25 % losses — a nominal 2 R — becomes an effective 1.02 R, and its break-even win rate rises from 33.3 % to 49.3 %.**
⭐⭐ **OUR CRYPTO ROUND TRIP IS ~1.61 %. THAT IS ROUGHLY 13× THE COST IN THAT EXAMPLE.** ⇒ **the 2:1 and 3:1 consensus numbers are GROSS ratios quoted in a near-frictionless world, and they do not survive transport into ours unchanged.** The consensus is still the right STARTING POINT — it is just that **for us the nominal ratio and the realised ratio are different numbers, and the gap is the largest single term in the problem.**
⇒ ⭐ **SO THE HONEST READING OF THE INDUSTRY STANDARD IS: "2:1 minimum, 3:1 preferred, NET OF COSTS." Nobody we found quotes it that way, because for equities the cost term is negligible. For crypto at 0.80 % taker it is the dominant term.**

⚠️ **ON A MAXIMUM HOLD, the outside evidence does NOT support a firm rule, and we are saying so rather than arguing for one.** What exists is strategy-dependent: event-driven and short-horizon strategies degrade with longer holds (*"baseline models turning from positive to negative returns by day three to ten"*), and a fixed time exit is credited with preventing overfitting. But nothing we found is firm enough to justify killing a trade at a fixed age **in a learning mode whose purpose is to observe what actually happens.** ⇒ ✅ **OUR RECOMMENDATION AGREES WITH KYLE: no maximum hold. RECORD the realised hold on every trade instead, so the question becomes answerable from our own data in Phase 25 rather than from somebody else's.** A time limit imposed now would censor the exact measurement we need.

---

## 4. OUR THEORY, STATED SO IT CAN BE ATTACKED

1. **The binding constraint on crypto is not the ratio, it is the COST.** At ~1.61 % round trip, a 2 ATR target on a typical pair is largely fee. The ratio has to be set against the net hurdle, not the gross one.
2. **The reachability ceiling and the target multiple are one dial with two labels.** Every unit of target added to improve R is a unit of `atrsToTarget` spent against the 4.0 ceiling. `strong_bull_trend` is already over it.
3. **Therefore a target increase alone cannot deliver a better R** — it converts `rr_below_min` drops into `unreachable` drops and trade flow falls either way.
4. **The two classes need different numbers, and the mechanism to give them different numbers already exists** — twelve of thirteen rows are simply not using it.
5. **R is a genuine dial on only 3 of 19 strategies.** For the other 16 the target is a dial and R is an outcome. A baseline that says "set R = 3" is unimplementable as written.

⭐ **WHAT WE THINK IS BEST — offered as our recommendation, not as a finding:**
**Set the baseline on the pair `(target multiple, reachability ceiling)` TOGETHER, per asset class, with the target chosen so that the NET ratio after the class's real round-trip cost clears 2:1 — and the ceiling raised in the same change to whatever that target requires, so the gate that judges reachability is not refusing the geometry we just chose.** Then let hold time run free and record it.

⚠️ **AND THE DECISION THIS CANNOT MAKE FOR ITSELF:** the pattern pool's geometry is a **hardcoded constant** (1.5 × ATR stop / 2.5 × ATR target ⇒ **R = 1.667 on every pattern signal, by construction**, `pattern-recognizer.ts:585-586`). **It is not read from the DB and it is not per class.** A floor above 1.667 is therefore an **on/off switch for that pool**, never a filter — and the pool produced **31 of 58 September crypto closes.** ⇒ **whatever baseline we pick, the pattern pool's constant has to be part of the same decision or half our flow decides itself.**

---

## 5. THE FOUR QUESTIONS WE WANT YOUR VIEW ON

1. **Is "net of cost ≥ 2:1, per class" the right form of the target?** Or is there a better-founded formulation — Kelly/optimal-f, an expectancy target, something from the cost literature we have not found?
2. **How should the reachability ceiling be set once the target moves?** It exists to refuse targets volatility cannot reach inside the horizon. If we raise targets, what is the principled ceiling — and does it become per strategy rather than per class?
3. **What do we do about the 16 structural-stop strategies**, where R is an outcome and not a dial? Is the honest answer that they get a target multiple and we measure the R they produce, or is there a better lever?
4. **The pattern pool's hardcoded 1.667** — does it become a DB row per class like everything else, and if so on what evidence do we pick its value?

⛔ **WHAT WE ARE NOT ASKING FOR:** a re-litigation of whether anything is defective. A separate claim of ours was **withdrawn today** after the runtime contradicted it (`#1051` banner), and the five genuinely odd September opens are **explained** — the fill came in worse than the decision price, so the ratio degraded after the gate and nothing re-checks it post-fill. **That is rule-24 outcome (2), working-as-designed-unaddressed, and it is homed.** This paper is about the baseline, not about a bug.

---

## 6. EVIDENCE INDEX — every number above, with where it came from

| claim | object | read |
|---|---|---|
| geometry multipliers, 13 rows, 12 at `asset_class='*'` | `module_constants` live | 2026-09-12 |
| `reach_atr_max` = 4.0, exactly 2 rows, both `strategy='*'` | `module_constants` live | 2026-09-12 |
| `strong_bull_trend` 6.0/3.0 ⇒ R=2.00, target at 6 ATR | `strong-bull-trend.ts:152-153` + the 2 DB rows | at the ref |
| every `unreachable` drop is `strong_bull_trend` at rr=2.00 | staging `out.log`, 8 occurrences | 2026-09-12 12:0xZ |
| R is DB-resolved, not hardcoded per module | `inside-bar-reversal.ts:85`, `reverse-impulse.ts:82`, `morning-star.ts:88`, `strong-bull-trend.ts:89` | at the ref |
| pattern geometry is a hardcoded 1.5/2.5 constant | `pattern-recognizer.ts:585-586` | at the ref |
| pattern pool = 31 of 58 September crypto closes | `closed_trades`, `crypto_spot`, `opened_at >= 2026-09-01` | 2026-09-12 |
| crypto round trip ~1.61 %, xStock ~0.20 % | `#1010` + `KRAKEN_FEE_SCHEDULE_REFERENCE` §6 | 2026-09-11/12 |

⚠️ **LIMITS, stated rather than left for you to find:** the `out.log` window reaches only 2026-09-10 and rotates 6–8× per day; `error.log` dailies reach 2026-08-30 and are aging out — **anything wanted from September stderr must be captured this week** (Langston's inventory). The industry sources in §3 are practitioner and educational publications, **not peer-reviewed** — they establish the consensus and its reasoning, not a proof. **The one worked cost example is the load-bearing external number and it is a single source; it should be re-derived before we build on it.**
