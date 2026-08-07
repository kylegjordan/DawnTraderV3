# Crypto Net-EV Investigation — why almost every crypto signal scores negative

**CC-C (Claude Analyst), 2026-08-07. Kyle-directed:** *"if they are actually only produce shitty signals that should have a negative EV, then I guess that's just the nature of crypto. But if they are all getting negative EVs because we've got incorrect ranges set or our calculation is designed more for a different type of asset class, then let's identify what we're doing wrong."*

**ANSWER, up front: neither, quite.** The signals are not being scored unfairly, and the calculation is not miscalibrated for the asset class. **The geometry the strategies hand to the calculation cannot clear the fee at ANY win probability the model is permitted to assign.** That is arithmetic, and it is shown below before anything is recommended.

---

## 1. THE PROOF — the ceiling is negative

**The kernel** (`server/core/calculations/net-expectancy-kernel.ts:114-115`):
`rawEV = pWin × distTarget − pLoss × distStop` · `netEV = rawEV − totalFriction`

**pWin is HARD-BOUNDED `[0.40, 0.60]`** (`:72-74`, `DEFAULT_MIN_PWIN`/`DEFAULT_MAX_PWIN`), derived as `minPWin + DI/200`. ⇒ **0.60 is a ceiling no crypto signal can exceed, however good it is.** The code already knows crypto sits there — `maker-taker-decision.ts:15` states it as established: *"friction dominates; pWin already at the 0.60 ceiling."*

**MEASURED geometry** — object `rtb_signals`, population ALL crypto rows (n=2; the queue is nearly empty, which is itself the symptom): **target 2.081%, stop 1.248%, R:R 1.67:1.** Friction: Kraken Tier-1 **maker round-trip 0.80%** (0.40% × 2), and the rejects say *"chosen maker mode"* — the system is already taking the cheaper path.

| pWin | raw EV | net EV after 0.80% | verdict |
|---|---|---|---|
| 0.40 (floor) | +0.084% | **−0.716%** | negative |
| 0.50 | +0.416% | **−0.384%** | negative |
| 0.55 | +0.583% | **−0.217%** | negative |
| **0.60 (CEILING)** | +0.749% | **−0.051%** | **negative** |

⇒ **The entire permitted pWin range is negative. The best case the model can produce is −0.051%.** A crypto signal cannot score positive at this geometry — not "rarely", *cannot*.

**Break-even target required, at the measured 1.248% stop:** pWin 0.60 → **2.165%** (short by 0.084 pts) · pWin 0.55 → **2.476%** · pWin 0.50 → **2.848%** (a **37% larger target** than today's 2.081%).

**Corroborating live rejects** (`signal_eval_archive`, 24h, `reject_stage='sqe'`): the crypto NetEV rejects cluster at **−0.006 to −0.011**, exactly the small-negative band this table predicts. Crypto: 11,479 SQE rejects / 583 admitted. *(Note: crypto admits MORE than xStock's 95 — the scarcity is downstream of admission, which is a separate thread.)*

## 2. ROOT CAUSE — and the design decision that is CORRECT

**`signal-target-normalizer.ts:88-94` — the floor-LIFT was REMOVED, deliberately, at reorg-B2.1 OBJ-1 (2026-06-21):**
> *"the floor-LIFT is REMOVED — never mutate a strategy's target… Lifting a sub-floor target to clear the RR gate was fabricating reward on the reward leg (the Net-Expectancy anti-pattern) and produced a target the strategy never chose. cost-coverage is enforced by the Net-Expectancy gate."*

**That reasoning is right and should not be undone.** Manufacturing a target the strategy never chose, purely to pass a gate, is fabricating the reward leg. The architecture is honest: **strategies choose targets; the Net-EV gate refuses the ones that cannot pay.** It is doing exactly that.

**⇒ RULE-24 DISPOSITION: (2) WORKING AS DESIGNED, UNADDRESSED. Emphatically NOT (1) a defect.** No code is misbehaving. **What is missing is a DECISION: what should crypto strategies TARGET, given a fee floor nobody sized them against?**

**★ TWO ARTEFACTS OF THAT MISSING DECISION, both measured in `module_constants` / `expectancy_gates`:**
1. **`crypto_spot.target_floor_pct = 0.040` (4%) IS STILL CONFIGURED AND IS DEAD** — its only consumer was the removed lift. Someone judged 4% the right crypto floor; the mechanism that applied it was deleted for unrelated (and good) reasons, and **the number was never re-homed.** ⚠️ At a 4% target the arithmetic inverts: pWin 0.50 → **+0.576% net EV, positive.** *The value that would make crypto viable is sitting in the database, unused.*
2. **`crypto_spot.roi_absolute_min = 0.015` (1.5%) is the live floor** — and **at a 1.5% target, the 0.80% round-trip fee is 53% of the entire target.** That ratio is the finding in one number.

## 3. INDUSTRY COMPARISON — what the fee environment actually is

- **Institutional systematic backtests assume 3–5 basis points** of round-trip transaction cost ([QuantPedia](https://quantpedia.com/the-price-of-transaction-costs/?a=6080)). **Kraken Tier-1 maker round-trip is 80 bps — 16× to 27× the standard assumption.** We are not trading in the cost environment the textbook methods assume.
- *"even 1 percent of total transaction cost can consume a very large part of net edge"* and realistically obtainable edges are *"rarely much higher than a few percent"* before costs ([QuantPedia](https://quantpedia.com/the-price-of-transaction-costs/?a=6080)) — our 0.80% sits squarely in the band the literature calls edge-consuming.
- **The canonical practitioner response is the one we have not taken:** *"Algorithms respond to rising costs by holding positions longer to amortize the fixed per-trade cost over a larger profit target"* ([LedgerMind](https://theledgermind.com/algorithmic-trading-strategies-crypto/)). Empirically, [Bitcoin algo研究 (PeerJ)](https://peerj.com/articles/cs-337/) found returns went negative at a 2% fee but positive again at 4% **on a 30-day horizon** — the horizon, not the fee, is what rescued them.
- Maker-over-taker is worth 30–50% of fee cost ([BTCC](https://www.btcc.com/en-US/academy/crypto-trading/trading-guide/maker-vs-taker-fees-in-crypto-trading-how-exchange-fee-structures-impact-your-net-profits)) — **we already do this**, and it is why the numbers are −0.05% rather than −1.0%.

## 4. WHAT THIS IS NOT

- **Not a bad-signal problem.** The gate never reaches signal quality; the geometry fails first.
- **Not a mis-set EV formula.** The kernel is asset-class-agnostic and correct.
- **Not fixable by lowering the EV bar.** A negative-EV trade admitted by a looser gate is still a losing trade — that is the exact flattery Kyle ruled out (*"doesn't make shitty signals look like they are potential opportunities"*).

## 5. THE OPTIONS (Kyle's decision — NOT taken unilaterally)

| # | Lever | Effect | Cost |
|---|---|---|---|
| **A** | **Raise `roi_absolute_min` toward the dead 4% floor** (fee ≤ ~20% of target) | crypto becomes positive-EV at pWin 0.50 | fewer signals qualify; strategies must be able to *find* 3-4% moves |
| **B** | **Lengthen the crypto horizon** (bigger bars ⇒ bigger ATR ⇒ bigger native targets) — *the industry's own answer* | amortises a fixed fee over a larger move | slower cadence, less data per day |
| **C** | **Attack the fee** — volume tier, or maker-only enforcement | shifts the whole table up | tier needs volume we don't have; maker-only costs fill rate |
| **D** | **Raise the pWin ceiling above 0.60** | mechanically lifts EV | ⚠️ **fabricates edge unless justified by realised win rates** — the same anti-pattern as the removed lift. Would need evidence, not a dial-turn |
| **E** | **Accept crypto is marginal at this fee tier** and let xStock carry | honest | forgoes the asset class for now |

**CC-C's recommendation: B first, then A.** B is what the industry actually does and does not touch any threshold; A re-homes a number the project already chose. **D is the one to refuse** — it is the "make bad signals look good" failure by another route.

## 6. OPEN THREADS (for the pre-audit, not asserted here)

- **Where do the native 2.08% targets come from?** The normalizer is formula-agnostic; 10 strategies use `mult × ATR`, 9 are heterogeneous. **Whether 2.08% is an ATR-horizon artefact (⇒ option B is decisive) or a hard-coded multiple (⇒ option A) is NOT yet established, and it determines which lever is right.**
- Crypto admits 583/24h vs xStock's 95, yet crypto trades are scarce — **the admission-to-open gap is a separate mechanism** and is not explained by anything above.
- `min_rr` for `volatility_edge` and `support_bounce` is **1.0** — at R:R 1.0 the EV ceiling is `0.2 × target − friction`, needing a **4.0% target** just to break even at the pWin cap. Those two strategies are structurally the worst-placed and may warrant their own ruling.

---

# PART 2 — THE HORIZON vs HARDCODED QUESTION, ANSWERED (Kyle-directed, same day)

**Kyle pulled the §5 options back as premature until this was settled. He was right — Part 1 named the arithmetic but not the CAUSE of the 2.081% target. Both questions now have measured answers, and one of them is a rule violation.**

## 2.1 THE HORIZON — and my Part-1 assumption was BACKWARDS

**MEASURED bar horizons (code, not inference):** **crypto runs on 60-MINUTE bars** (`fx5-scanner.ts:904,944` + `market-scanner.ts:698`, `getOHLCData(sym, 60)`); **xStock runs on 15-MINUTE bars** (`xstock_spot/scanner.ts:597`, `getOHLCDataBatch(symbolList, 15)`).
⇒ **CRYPTO'S HORIZON IS FOUR TIMES LONGER THAN xSTOCK'S, NOT SHORTER.** The phrase "short bar horizon" does not describe crypto's problem relative to xStock. I had assumed the opposite in Part 1 and did not check it.

**MEASURED per-bar volatility at each class's LIVE horizon** — object: `crypto_spot_ohlc_1m` aggregated to hourly buckets, and `xstock_spot_ohlc_15m_snapshot`; population: 3 days, 23,951 crypto hours / 69,718 xStock bars:

| series | bars | avg range % | median % |
|---|---|---|---|
| crypto @ 60m (live) | 23,951 | **1.194** | 0.545 |
| xStock @ 15m (live) | 69,718 | 0.170 | 0.088 |

**INSTRUMENT CONTROL (run before believing the above):** `high = low` degenerate bars — xStock 24.4%, crypto 50.2%. These are **real OHLC tables with flat bars on thin symbols**, not ticker snapshots masquerading as bars. The averages are dragged down by flat bars; the hourly crypto aggregation takes `max(high)/min(low)` across the hour, so flat 1m bars do not suppress the hourly range. ⚠️ **The two rows are at DIFFERENT horizons by design — this table does NOT say "crypto is 7× more volatile than xStock"; it says what each class's own bar looks like. Do not quote it as a cross-class volatility ratio.**

**★ THE TARGET IS AN ATR ARTEFACT — CONFIRMED QUANTITATIVELY, not asserted.** Target = `multiplier × ATR`. Crypto's live hourly ATR proxy ≈ **1.194%**; the common multipliers are **2.0–3.0** ⇒ predicted target **2.4–3.6%**, against the **2.081% measured** in `rtb_signals`. **The prediction and the observation agree.** ⇒ **crypto's small target is not a hard-coded number — it is the arithmetic consequence of an hourly volatility of ~1% times a class-blind multiple.**

**Horizon required to reach a fee-clearing 4% target** (volatility scales ≈ √time — **stated as the standard approximation it is, not a measurement**): mult 2.0 → **~2.8-hour bars** · mult 2.5 → **~1.8-hour** · mult 3.0 → **~1.2-hour**. ⇒ **the horizon lever is real but modest — this is a 1.2–2.8× stretch, not a move to daily bars.**

## 2.2 THE MULTIPLIERS — in the database, but CLASS-BLIND

**Every ATR multiplier IS DB-governed** (`module_constants`, read via `getCachedNumbersForModule`, which **THROWS on a cold module rather than fabricating a default** — `module-constants-service.ts:420-424`; no silent fallback). **Not hardcoded. ✓**

**⚠️ BUT EVERY ROW IS `asset_class = '*'`:**
`adaptive_flow` 3.0 · `pivot_shift` 3.0 · `strong_bull_trend` 6.0 · `morning_star` 2.5 · `volatility_edge` 2.5 · `inside_bar_reversal` 2.0 · `reverse_impulse` 2.0 · `support_bounce` 2.0 · `defensive_hedge` 1.8 — **all `*`, so crypto and xStock share one multiplier despite different horizons, different volatility, and the SAME absolute fee.**
⇒ **A crypto-specific multiplier is available TODAY with ZERO code change** — the resolver already scores `asset_class` (the per-class dimension exists and is simply unpopulated for these constants). **This is the cheapest lever in the entire investigation.**

## 2.3 ★ THE RULE VIOLATION — NINE HARDCODED BUFFERS THAT WIDEN THE RISK LEG

**Kyle: *"we are not supposed to hardcode anything in the system."* These are hardcoded, class-blind, and NOT in `module_constants`:**

| file | constant | value |
|---|---|---|
| `adaptive-flow.ts:44` | `AF_STOP_BUFFER` | 0.003 (0.3%) |
| `defensive-hedge.ts:46` | `DH_STOP_BUFFER` | 0.005 (0.5%) |
| `inside-bar-reversal.ts:47` | `IB_BREAKOUT_BUFFER` | 0.002 |
| `inside-bar-reversal.ts:48` | `IB_STOP_BUFFER` | 0.003 |
| `morning-star.ts:51` | `MS_STOP_BUFFER` | 0.003 |
| `reverse-impulse.ts:45` | `RI_STOP_BUFFER` | 0.005 |
| `support-bounce.ts:55` | `SB_STOP_BELOW_SUPPORT` | 0.005 |
| `volatility-edge.ts:45` | `VE_BREAKOUT_BUFFER` | 0.002 |
| `volatility-edge.ts:46` | `VE_STOP_BUFFER` | 0.003 |

**WHY THIS IS NOT COSMETIC:** these are **percentage-of-price** buffers on the ENTRY and STOP legs. Unlike the ATR multipliers they **do NOT scale with volatility or asset class** — a flat 0.3% is added regardless. Against crypto's measured **1.248% stop**, a 0.3% buffer is **~24% of the entire risk leg**, and the stop distance is the denominator of reward:risk and a direct input to net EV (`rawEV = pWin×target − pLoss×stop`). **A wider stop lowers EV directly.** ⇒ they are not merely a governance breach; **they are a measurable drag on the number this investigation is about.**
**DISPOSITION: (3) legacy that no longer fits intent** — migrate to `module_constants` with a per-class dimension, same pattern as every other lever. **NOT folded into this investigation's options** — it is its own small batch, and it should be measured (not assumed) how much EV each buffer costs before any value is changed.

## 2.4 WHAT IS STILL NOT ESTABLISHED — stated so nobody treats this as complete

- **The 9 "heterogeneous" strategies** (R-multiple / measured-move / percent) are NOT ATR-driven; §2.1's artefact finding covers the 10 ATR ones. Their target derivation is unread.
- **The admission-to-open gap** (crypto admits 583/24h yet trades are scarce) is untouched and is a DIFFERENT mechanism from everything above.
- **`min_rr` 1.0 for `volatility_edge` / `support_bounce`** — at R:R 1.0 the EV ceiling is `0.2×target − friction`, needing a 4.0% target to break even at the pWin cap. Structurally the worst-placed pair; unruled.
- **I have not yet read** the Phase-19 active-trading-path audit, the SIM, or the System Manual on target geometry. Kyle directed those and they are outstanding — **the options in §5 stay WITHDRAWN until they are read.**

---

# PART 3 — THE THREE HISTORIES, AND WHAT I ACTUALLY RECOMMEND

**Kyle: *"you're explaining a lot to me, but not giving me a lot of recommendations… that's not me. I'm not an expert."* Fair, and taken. Part 3 answers the three history questions he named, then RECOMMENDS rather than tabling neutral options.**

## 3.1 THE BAR-FREQUENCY STUDY — it says "stay", but it answered a DIFFERENT question

**`CRYPTO_BAR_FREQUENCY_EXPLORATORY_STUDY_2026-06-03.md`** — Kyle's memory is correct: **"STAY at 60m for crypto. No B.4-CRYPTO sub-batch."**

**BUT READ WHAT IT TESTED.** It measured **PREDICTIVE POWER** across 5m/15m/30m/60m — AUC of setups, regime-flip rates, pattern present-vs-absent. **It never asked whether the resulting TARGET clears the fee.** Its rejection is of going **FINER**, and on its own evidence: *"if anything, the data favors staying at 60m or **going coarser**, not finer."* (§2.3) ⇒ **the study does NOT contradict a longer-horizon argument — it mildly supports it, and it rules out the direction nobody is proposing.**

**★ IT ALSO PRICES THE LEVER, which is why I now recommend AGAINST pulling it (§3.4):** a frequency change requires (1) crypto regime-threshold recalibration — those rows are 60m-calibrated; (2) per-class **time-anchored lookbacks** — the shared 30-bar momentum / 14-bar ADX / SMA-20 / ATR-14 windows are bar-COUNT based, so *"semantics shift silently"* at another interval; (3) a DBS backfill recompute. **`market-regime.ts:108-119` states the invariant breaks at non-60m.** That is a foundation batch, not a setting.

## 3.2 THE NINE BUFFERS — deliberately KEPT, with a stated reason

**`LEVER_INVENTORY.md:224` (B72, 2026-05-05), verbatim:**
> *"KEEP rows in this tier are exclusively **structural geometric buffers**: tiny ratio constants (0.002–0.005) defining 'X% above pattern high' / 'Y% below support low' — **geometric definitions, not tunable risk levers**."*

**⇒ NOT an oversight. A classification.** B72's KEEP tier is *"schema/structural literals… canonical math constants"* (`:21`) — things that define what a pattern IS, as opposed to dials you turn. Under that rule the decision was correct **and internally consistent**.

**★ DOES THE INTENT STILL HOLD? NO — and one measurement is why.** The classification assumed these are inert definitional geometry. They are not inert any more: **a flat 0.3% buffer is ~24% of crypto's measured 1.248% risk leg**, and the risk leg is a direct input to `rawEV = pWin×target − pLoss×stop`. **A "geometric definition" is now moving the number that decides whether crypto trades at all.**

Worse, being a flat percentage it is **class-blind in the one way that matters**: 0.3% against crypto's ~1.19% hourly range is a fifth of a bar; against an xStock 15m bar (~0.17%) it is nearly **two whole bars**. **The same constant means opposite things in the two classes.** ⇒ **disposition (2) relevant-but-needs-updating**, not (1) defect and not (5) leave-alone.

## 3.3 THE CLASS-BLIND MULTIPLIERS — capability shipped, values deliberately deferred

**B72 objective 5:** *"Resolution-scope discipline (smallest scope that makes operational sense) — Defaulted GLOBAL `(*,*,*,*)`… **Asset-class-scoped where asset-class-specific** (`pattern_pool_gates` crypto_spot, `trailing_exit` crypto_spot)."* ⇒ global was the DEFAULT and per-class was used where justified; geometry was judged not-class-specific **at that time**.

**`B79_0n_STRATEGY_COMPLETION_REPORT.md:161`, verbatim and decisive:**
> *"Crypto callers pass `'crypto_spot'`; resolver still finds wildcard row (`scoreRowForKey` returns 0 for wildcard match) → **same value resolved**."*

⇒ **B79.0n.STRATEGY wired the per-class PLUMBING through every strategy and deliberately did NOT seed per-class VALUES — behaviour was intentionally unchanged.** That is correct batch discipline (ship the mechanism, don't move values in the same batch). **⇒ NOT a mistake and NOT an oversight: the capability is finished and the value-seeding follow-up was never scheduled.** **The machinery Kyle paid for is built, reviewed, live, and unused.**

## 3.4 ★ RECOMMENDATIONS — ranked, with what each costs

**R1 — SEED CRYPTO-SPECIFIC TARGET MULTIPLIERS. Do this first.**
**What:** add `asset_class='crypto_spot'` rows for `target_exit_atr_multiplier`, sized so the target clears the fee with margin (indicatively ~1.7× today's, pending the §3.5 calibration), leaving xStock on the existing wildcard rows.
**PRO:** **zero code change** — §3.3 proves the resolver already does this; it is a database insert. Reversible in one statement. Uses machinery already built and reviewed. Attacks the actual binding constraint (target size) directly.
**CON:** bigger targets are reached less often — expect **fewer crypto fills**, and the win rate must be re-measured, not assumed. It is a calibration, so it needs a defined observation window before judging.

**R2 — MIGRATE THE NINE BUFFERS INTO `module_constants`, PER-CLASS. Second, and separately.**
**What:** move them as-is at today's values, with the class dimension available. **Change no value in the migration.**
**PRO:** closes the rule violation; makes an EV-moving input visible and tunable; lets crypto and xStock stop sharing a constant that means different things to each.
**CON:** these define pattern geometry — changing values changes *what the strategies mean*, so migration and re-valuation must be two separate steps with evidence in between. **The migration is safe; the re-valuation is a research question.**

**R3 — DO NOT CHANGE THE CRYPTO BAR HORIZON.** **Reversing my Part-1 lean, on the study's own cost evidence.**
**PRO of leaving it:** avoids a foundation batch (regime recalibration + time-anchored lookbacks + DBS backfill) whose cost §3.1 documents and whose invariant `market-regime.ts:108-119` says breaks off-60m. **R1 buys the same larger target for a fraction of the cost.**
**CON:** if R1's larger targets prove unreachable within an hourly bar's range, the horizon becomes the real answer and this returns — so **R1 must measure reachability, not just fills.**

**R4 — REFUSE the pWin ceiling raise.** It makes the numbers positive without anything real changing. Same anti-pattern as the removed floor-lift.

**R5 — THE FEE IS THE ROOT CAUSE AND WE DON'T CONTROL IT SHORT-TERM.** 80bps round-trip against an institutional 3–5bps assumption. Worth a standing volume-tier watch; not a lever for this batch.

## 3.5 WHAT R1 STILL NEEDS BEFORE IT IS A NUMBER

The multiplier is **not yet computable** from what I have measured. It needs:
- the **reachability** check (`reach_atr_max = 4.0`) — a bigger target must still be traversable within the ATR horizon, or it is dropped as `unreachable` and we trade less for no gain;
- the **realised** crypto win rate measured against the assumed pWin;
- the **9 non-ATR strategies**, whose target derivation §2.1 does not cover.

**This is the pre-audit, and it is what goes to Langston.**
