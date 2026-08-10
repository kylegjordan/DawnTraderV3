# STRATEGY FEE-VIABILITY — TWO-BATCH PROPOSAL

**CC-C, 2026-08-10. Kyle-directed, converged over a long working session. Sent to Langston for approve/reject before either batch is scoped.**
**change-class: `architecture`** (batch one touches the SQE reject write path + per-class strategy levers; declared strict per §2 1.b fail-closed default).

---

## 0. WHY THIS EXISTS — the question that started it

**Crypto produces 3 organic trades in 21 days; xStock produces 169.** Both run the SAME shared pipeline — filters → MCE → regime → signal-orchestrator → SQE → RTB (`xstock_spot/active-dispatch.ts:6-10`: *"routes the xStock signal onto the SHARED active pipeline … calling its public `dispatchExternalSignal` (which sizes → SQE → queues to RTB internally)"*). **Same gate, same math, opposite outcomes ⇒ the difference is in the INPUTS.**

**Measured, crypto, 48h, active path, by DISTINCT PAIRS:** 1,387 scanned → 50 reach SQE → **7 pass** → 5 positions → **all exploratory, zero organic**. **14,812 of 14,947 SQE rejections (99.1%) carry reason `NetEV <= 0` — and the record says `chosen maker mode`, so the cheaper 0.40%/side path is ALREADY selected and still negative.**

**The arithmetic, at the pWin ceiling 0.60:** crypto `0.60×3.07 − 0.40×2.03 − 1.04 = −0.007%` — **exactly zero**. xStock `0.60×5.31 − 0.40×3.74 − 1.37 = +0.32%`. ⇒ **crypto sits on the knife edge and needs the system's MAXIMUM allowable win probability just to break even.**

---

## 1. BATCH ONE — STRATEGY FEE-VIABILITY SURVEY + MARKED TEST WINDOW

**Purpose:** establish which strategy × asset-class combinations can NEVER clear ~1.6% round-trip, which are borderline, and test cheap reversible levers on the borderline ones. **Kyle's framing, adopted verbatim: some will simply not work at this fee structure, and recording that is a RESULT — not a reason to turn dials until something squeezes out.**

| Step | What | Cost |
|---|---|---|
| **0 — PRECONDITION** | **Geometry/config-VERSION stamp at the SQE reject hook** (§3) | small, blocking |
| **1** | **Arithmetic survey**, ~25–28 combos (**~18 crypto + 6–9 xStock — Kyle's correction; NOT 19×2**): target produced vs target REQUIRED for `netEV>0` at the pWin ceiling given each strategy's own stop distance; the gap | **free, no trading** |
| **2** | Sort → **IMPOSSIBLE / BORDERLINE / WORKING**. *Open question neither of us can pre-answer: is BORDERLINE 2–3 or 5–10?* | free |
| **3** | **Shadow-SQE over stored VTS rows** — replay the netEV arithmetic under each candidate setting to SIZE each change before spending live window | free |
| **4** | **`rtb_shadow_pairings` for the ranking counterfactual** (§2) | free |
| **5** | Surviving changes deploy as **ONE DATED per-strategy change set — the deploy IS the mark** | the experiment |
| **6** | **Watch slot utilisation as a first-class metric** (§4) | during |

### 1.1 The lever is the R-MULTIPLE, not an ATR multiplier — corrected in-session
`sma_trend_ride` has **no ATR term at all**: `targetPrice = entryPrice + (riskDistance × break_target_r_multiple)` (`strategy-engine.ts:532`), stop from swing-low/SMA. `vwap_pullback` computes `max(high24h − 0.25×ATR, entry + 2×riskDistance)` (`:255-258`) — **on crypto the high ATR pulls the structural leg DOWN so the 2R leg wins almost always**, meaning volatility never reaches the target. ⇒ **reducing the ATR offset (the intuitive fix) would do almost nothing on crypto; `target_r_multiple_default` (live value `2`) is the operative knob.**
**★ AND THE PER-CLASS PLUMBING IS PROVEN LIVE:** `module_constants` holds `strategy.vwap_pullback / volume_confirmation_enabled` at `*`=1 **and `xstock_spot`=0** — a per-asset-class override already in production. Resolver key is `_SE_KEY(strategy, assetClass)` (`strategy-engine.ts:471`). **A per-class change is a DB row, not a code change.**

### 1.2 FOUR target-construction families exist, not two
(1) **ATR-additive** — `entry + MULT × ATR` (`strategies/*.ts`: adaptive-flow:177, morning-star:175, reverse-impulse:176, inside-bar-reversal:190, pivot-shift:182, support-bounce:264, strong-bull-trend:153, defensive-hedge:238). (2) **structure-minus-ATR** — `high24h − atr×mult` (`strategy-engine.ts:255`), `rangeHigh − atr×mult` (`:858`) ⇒ **more volatility gives a SMALLER target**. (3) **R-multiple** — volatility enters only via the stop (`:532`, `:961`). (4) **fixed-%/measured-move/structure-relative** — no volatility term (`:386`, `:648`, `:750`, `:1063`).
⇒ **This is why crypto's higher volatility does not become a bigger target: for three of the four families it structurally cannot.**

---

## 2. THE INSTRUMENT THAT CHANGED THE DESIGN — Kyle surfaced it; CC-C had underrated it

**`rtb_shadow_pairings`: 39,645 rows, 399 pairs, continuous 2026-07-14 → 2026-08-10.** Per `ready_to_buy_service.ts:1883-1898` (reorg-B4) it opens **one counterfactual shadow trade per ranked-pool member — the promoted picks AND those that lost the ranking** — plus the decision-time ranking inputs. `signal_quality_evaluator.ts:23` emits an SQE shadow; `gateShadowMode` exists at `ready_to_buy_service.ts:1120`.
⚠️ **CC-C RETRACTION:** I told Kyle only the live paper path could answer the ranking question because VTS has neither SQE nor RTB contest. **That was wrong** — the ranking counterfactual already exists with a month of data.

---

## 3. THE HARD PRECONDITION — Langston's own (1c), promoted to blocker

**The geometry/config-VERSION stamp must land BEFORE the dated change.** Today **0 of 8,767 archived declines carry a target**; `vts-runner` writes `target`/`atrAtOpen` at **32/32** while `signal-orchestrator` writes **0 of 6,077** SQE rejects. ⇒ after a change we would hold two periods with **no way to attribute a REJECTION to the geometry that caused it** — and the declined population is exactly what the survey is about.
**Fix = WRITE-SITE PARITY at the SQE reject hook, copying the `vts-runner` writer. Not new design (Langston's measurement).** **VERSION, not value** (his r2.1(b)).

---

## 4. THE METHOD DEBATE, AND WHERE EACH OF US MOVED

**Langston ruled** a mid-window geometry change on the active path leaves Phase-25 two halves **labelled but not poolable**. CC-C used this to argue for sweeping in VTS. **Kyle pushed back on three grounds; CC-C concedes all three:**
- **(a) The exploration lane is NOT available** — annealed nearly shut, a handful of trades of budget left, data committed to the maker-taker question. *CC-C proposed widening it without checking its state.*
- **(b) VTS has no SQE and no RTB contest — and those two ARE the subject.** A sweep somewhere with neither cannot answer it.
- **(c) DECISIVE — changes are coming anyway** (confidence calibration + a possible threshold loosening). If the window is cut regardless, the choice is **cut ONCE deliberately with the set declared in advance, or cut repeatedly and accidentally.**
⇒ **PROPOSED READING OF THE RULING (Langston to confirm or reject): it forbids an ACCIDENTAL boundary, not an INTENDED one.** Kyle's design does not pool the periods — it intends them and reads each with its own lens. That is a designed experiment, and it is analysable **only** given §3.

**★ THE ONE METHODOLOGICAL CONCESSION CC-C MADE, flagged for Langston to attack:** CC-C argued for a change set of 2–3 on multiple-comparisons grounds. **Kyle: a per-strategy setting change is INDEPENDENTLY ATTRIBUTABLE because every trade carries `strategy_name`** — seven strategy changes are seven readable experiments, not one blended one. **CC-C accepts and withdrew the objection**, retaining only the coupling below.
**⚠️ SURVIVING COUPLING — SLOT CONTENTION:** strategies compete for the same slots (**6 of 15 used now**). If seven strategies each add 2–5 signals/day the pool becomes contested, and a strategy may look improved while merely **winning slots from another**. Not a reason to change less — a reason to make **slot utilisation a first-class observed metric**.

---

## 5. BATCH TWO — carried so nothing drifts

1. **PHASE 19.4.5 OBSERVATIONAL GATE — created 2026-04-26, nine items, NEVER RUN.** No decision document exists anywhere; **zero hits in `PHASE_19_PLAN.md`**. **Two triggers are met:** item 3 (confidence-vs-outcome inversion vs the 04-22 pattern, **TFS 13.8% WR vs STR 83.3%**) and item 2 (**<5 signals/day** — crypto is at 3 organic trades in 21 days). Reference: `B65_6_FINDINGS_PAPER.md`. **A scheduled DECISION that fell out of the plan — not a code defect.**
2. **Confidence calibration + possible threshold loosening.** ⚠️ **Kyle's correction, recorded because CC-C had it wrong: the finding is NOT an inverted score — it is that HIGHER-confidence signals LOSE MORE OFTEN.** Empirical calibration, not a sign error.
3. **DI is recorded NOWHERE** — absent from `signal_eval_archive.features` and `closed_trades.metadata` ⇒ we cannot tell how often the gate ran on a real DI vs the default **50**, which yields pWin 0.65 **capped to the 0.60 CEILING**. **A fail-OPEN default on a risk gate.**
4. **Spread ceiling is 3%** while measured spreads of **0.696%** on the volatile pairs are what bind — a near-inert gate.
5. **Order-book depth is ALREADY STORED and unused** — `crypto_spot_ticker_snap` holds `bid_qty`/`ask_qty` for **472 pairs at 100% population**; `min_depth_usd` is **NULL on every crypto screener row**.
6. **The daily-volume floor may be an INVALID INSTRUMENT** — verified research: reported crypto volume inflated **1.25×–50×** with a **26-fold range inside one venue group** ⇒ no constant haircut recovers true volume.
7. **The combinations study** — needs a population we do not have; running it now yields confident nonsense.
8. **The mean-reversion STYLE decision** — retire for crypto / maker-only / xStock-only. **Kyle wants ONE recommendation with costs, not a menu.**

---

## 6. CC-C's OWN CORRECTIONS THIS SESSION — recorded because the PATTERN matters

Five, **every one caught by Kyle rather than by self-check**: (1) the top-100-by-volume universe cut — the code exists but **never executes** (`universeSize` never passed on the live path; live universe is **1,430** pairs, ~294/cycle rotating); (2) "xStock pays zero fees" — an artifact of a window spanning the **2026-07-28** accounting change (xStock actually pays **more**); (3) "crypto admits reversals, xStock admits trend" — **pooled the two admission lanes**; (4) "hundreds of positive-EV signals destroyed downstream" — **counted re-evaluations as distinct signals** (the 376 resolve to **three symbols**); (5) "only the live path can answer the ranking question" — **`rtb_shadow_pairings` already does** (§2).
**Langston's diagnosis, sharper than CC-C's own and adopted:** these are not "reported too early" — they are the **wrong-object/wrong-population** class, and three are specifically **a population straddling a boundary** (fallback vs live path; a window spanning an accounting change; two lanes pooled; re-evaluations pooled with distinct signals). *A count that straddles a boundary always looks clean, because it IS a clean number — of something else.* **Operational rule: name the population and justify the denominator BEFORE looking at the value.**
