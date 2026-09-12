# B-R-FROM-COST — PROBLEM FRAMING (r2)

> **r2 (2026-09-12): COLTRANE REJECTED r1's PROBLEM STATEMENT AND HE WAS RIGHT. §2 and §3 are replaced with his wording. Both of his load-bearing claims were RE-DERIVED BY ME AT THE REF, not accepted on report.**
> **For: Langston (review), after Coltrane's early-framing pass. Kyle-directed 2026-09-12.**
> **⛔ THE BATCH NAME PRESUPPOSES ITS OWN ANSWER.** *"Derive reward-to-risk from cost"* prescribes a solution the problem has not yet justified (Coltrane). **The name is retained only as the filed identifier at `B_XSTOCK_FEE_CONTRACT_SCOPE.md:151`; it should be re-named when this becomes a scope.**

---

## 0. PROVENANCE, AND WHAT I COULD NOT FIND

**Kyle's account of the origin, recorded as HIS account:** the analysis compared target-hits against stop-hits over 1h/4h/8h/12h/24h/48h/72h; Langston reduced it to the reward-to-risk ratio, said volatility **cancels out**, that the ratio is **fixed by construction**, and that **there is no cost term anywhere in the expression**.

⛔ **I SEARCHED AND COULD NOT FIND THAT FORMULATION** — not in the governance corpus, and a targeted Discord search returned nothing. **If Langston holds the derivation, his statement supersedes this section.**

✅ **COLTRANE PARTIALLY RECONSTRUCTED IT WITHOUT CLAIMING RECOVERY, and the reconstruction is instructive.** `strong-bull-trend.ts:151` sets stop distance `a × ATR` and target distance `b × ATR`, so gross reward-to-risk is `r = b/a` — **fixed for those coefficients, and volatility cannot change it.** ⛔ **BUT VOLATILITY CANCELS FROM THE GROSS RATIO, NOT FROM THE ECONOMICS.** In a target-or-stop model with stop `S`, target `T`, round-trip cost `C` and target-first probability `p`:
> `EV / S = p × (T/S) − (1 − p) − C/S`

⇒ **with `S = a × ATR`, the cost burden is `C / (a × ATR)`. Two signals with IDENTICAL gross reward-to-risk can differ in economic viability.** ★ **And raising the ratio is not the only available response — refusing a costly signal can be the correct one.** ⚠️ This is not universal: `strategy-engine.ts:254` combines a structural level with an R-multiple.

---

## 1. WHAT IS MEASURED — WITH TWO CORRECTIONS I ACCEPTED

| measured | crypto | xStock (AT THE TIME) |
|---|---|---|
| fee, % of notional | 1.04 % | **1.36 % — HIGHER** |
| median target | 2.36 % | 4.09 % |
| stop | 2.03 % | — |
| reward-to-risk | 1.51 | — |

⛔⛔ **THE xSTOCK COLUMN IS INVALID AND I INVALIDATED IT MYSELF** — `#1010` cut the xStock taker rate 8× on 2026-09-11. **Any cross-class conclusion from that contrast must be re-derived.**
⛔ **AND THE TABLE CANNOT SUPPLY A REPRESENTATIVE TRADE (Coltrane).** It carries no populations and no aggregation definition, and **a median of per-trade ratios is not the ratio of medians.** ⇒ **these headline figures may not be used to anchor a derivation.**

⛔⛔ **A CLAIM FROM r1 THAT IS NOW WITHDRAWN.** r1 said the spread exceeding a typical one-minute range (91.9 % crypto / 94.5 % xStock) means *"a resting order fills only if price crosses a gap usually larger than a minute of movement."* **That inference is wrong.** ★ **A resting bid fills when an incoming seller trades against it — price need not traverse the spread at all.** Bounding passive-fill probability requires order-placement, queue-position and order-flow evidence, none of which we have. **The measurement stands; the inference drawn from it does not, and I repeated it without testing it.**

⚠️ **The 48–72 h result is weakened to its precisely-measured form:** more eventual target touches do **not** establish improved net expectancy, because the study did not establish ordering against the stop, executable prices, or intervening exits.

---

## 2. THE PROBLEM — ⛔ r1's STATEMENT IS WITHDRAWN

⛔⛔ **WHAT r1 SAID, AND WHY IT WAS WRONG.** r1 claimed the defect was that *nothing in the expression which SETS the target contains a cost term.* **Coltrane's objection is algebraic and it holds: when `C` is constant across candidate targets, maximising `grossEV(target) − C` selects the SAME target as maximising `grossEV(target)`.** ⇒ **Subtracting a constant changes WHETHER a trade is worth taking, never WHICH target is best. Geometry followed by an economic gate is a SOUND architecture.** ★ **I described a defect where there was a design.** Cost belongs in target *selection* only where the alternatives change expected execution costs, holding costs or other outcomes — **not merely because the current target fails the gate.**

### ✅ THE REPLACEMENT STATEMENT (Coltrane's wording, adopted)

> **We have not established whether native exit policies leave economically worthwhile opportunities unused. Our current expectancy model cannot evaluate target changes reliably, because its win probability does not respond to those changes. We need to determine whether feasible alternative exit policies improve net outcomes under current costs and an explicit holding horizon.**

### ⭐ RE-DERIVED BY ME AT THE REF — the model cannot evaluate target changes

`net-expectancy-kernel.ts`: `pWin` is computed from `DI`, or from `|dbsScore|` when `sourcePool === 'quant-strong_trend'`. **`distTarget` appears NOWHERE in that computation.** Then:
> `rawEV = (pWin × distTarget) − (pLoss × distStop)` · `netEV = rawEV − totalFriction`

⇒ **modelled EV is LINEAR in target distance with no offsetting probability term.** Coltrane's synthetic run (entry 100, stop 98, friction 1, DI 50; target 101 → 104 moved netEV −1.2 → +0.6 with `pWin` static at 0.6, friction positive control behaving correctly) **reproduces for the right reason.**

### ⭐⭐ MY REFINEMENT — IT SHARPENS THE DEFECT RATHER THAN SOFTENING IT

**A reachability gate ALREADY bounds target distance**, which neither r1 nor Coltrane's reply accounted for: `Target_Unreachable` fires when `atrsToTarget > reach_atr_max` (`skipped-signals-logger.ts:28`), a **path-invariant bound `c·√H`, per class** (`expectancy.ts:210-211`). ⇒ **widening is NOT unbounded and the system is not naively exploitable.**

**The ceiling is applied at `strategy-helpers.ts:388-389` and a failed reachability check is rejected at `:422`** (Coltrane, at the same sha).

⇒ ⛔ **SO THE DEFECT IS NARROWER AND MORE CHECKABLE THAN "the model ignores cost": THE CEILING BOUNDS THE CANDIDATE SET, IT DOES NOT VALIDATE THE RANKING WITHIN IT. Holding probability, stop and cost fixed, maximising the kernel's EV over permitted targets selects THE FARTHEST PERMITTED TARGET.**

⛔⛔ **AND HERE IS THE PRECISION I GOT WRONG AND COLTRANE CORRECTED — IT MATTERS, BECAUSE I HAD ALREADY REPORTED THE LOOSER VERSION TO KYLE.** ★ **This is a mathematical consequence FOR A PROPOSED OPTIMISER, not a claim that the running system performs that optimisation.** **Nothing in the live path ranks candidate targets — the system takes the strategy's NATIVE target.** ⇒ **the statement bites on any FUTURE mechanism that would use this kernel to choose among targets, which is exactly what a "derive R from cost" design would be.** ⚠️ **My earlier phrasing — *"the model ranks targets by distance, not merit"* — reads as a description of live behaviour and is withdrawn in that form.**

⚠️ **DERIVED FROM THE EXPRESSION, NOT OBSERVED ON LIVE ROWS. Falsifier: a candidate-ranking mechanism in which a nearer target outranks a further one on `netEV`, other inputs equal.**

⛔ **`c·√H` CARRIES A HORIZON TERM BUT ITS CORRESPONDENCE IS UNESTABLISHED (Coltrane, and it answers my own §5 question before Langston sees it):** the documented `c·√H` rationale **does not itself establish that its horizon matches the EXECUTABLE HOLDING POLICY.** ⇒ **that correspondence needs evidence before the bound may support any claim about the 4 h versus 48–72 h alternatives.** ⇒ **design consequence: retain reachability as a FEASIBILITY CONSTRAINT, and require candidate-dependent outcome estimates to choose among feasible policies. Passing the ceiling does not establish the probability of reaching a target before the stop or the timeout.**

### ⛔⛔ AND THE LEDGER ALREADY ANSWERED PART OF THIS — A §9.5(b-ii) MISS THAT IS MINE

**Coltrane found `P19_REORG_B2_1_SCOPE.md`, which I owed a ledger search and did not do.** That batch did not merely remove target-lifting; it removed it **because the floor-LIFT *"manufactures a target the strategy never chose"* and duplicated the Net-Expectancy gate's cost coverage** — and **KYLE DECIDED, 2026-06-21, to rely on the Net-Expectancy gate as the cost-coverage judge and NOT keep a separate floor.** OBJ-1 was *"DROP the floor-LIFT entirely (not relocate)."*
⇒ ★ **r1 was proposing to restore a mechanism we deliberately deleted, with a recorded Kyle decision behind the deletion.** **Any new proposal must state what NEW OUTCOME EVIDENCE distinguishes it from that mechanism.**

---

## 3. THE INTENT — ✅ Coltrane's wording, adopted

> **Select an evidence-supported trade policy, or abstain, using expected net outcomes under structural risk and holding constraints. Target distance is one possible decision variable; improvement must survive the corresponding changes in outcome probabilities, execution and capital use.**

⛔ **THE FAILURE MODE, RESTATED AND STRENGTHENED BY §2:** carrying *a* hit-probability term is **insufficient**. It must describe **this target, this stop, this horizon and this execution policy**, conditional on the information available at the decision. **A term that does not respond to the target is what we already have.**

---

## 4. HIGH-LEVEL DESIGN — ✅ Coltrane's four bullets, adopted

- **Define the feasible alternatives from the strategy**, including its **native target** and **abstention**. **Preserve the structural stop during the comparison.** ⛔ A target beyond a structural ceiling is a **changed strategy hypothesis**, not an automatic cost adjustment.
- **Evaluate COMPLETE outcomes per alternative** — realised net P&L over the specified policy, **including timeout exits** and execution costs. For passive entry, **separate P(entry fills) from P(target succeeds | filled)**, and account for the outcomes of the signals that actually fill. **Count spread and slippage once**, consistently with the prices used.
- **Compare on the SAME eligible signal population**, including refused signals where usable subsequent observations exist. **Report eligible / observed / censored / excluded counts.** Use time-separated evaluation. ⛔ **A higher score from the EXISTING kernel cannot validate an alternative** — §2 says why.
- **Keep ONE economic judgment.** ⛔ **Do not add a target-lifting mechanism whose purpose is to manufacture a pass through the existing gate.** **Resolve the role of the per-strategy `min_rr` floors explicitly** — they were calibrated under NATIVE targets and that calibration does not carry to changed exits (`#372`, `P19_REORG_B2_3`).

---

## 5. WHAT IS STILL OPEN — FOR LANGSTON

1. ⛔ **Is the monotonic-preference statement in §2 correct?** It is the load-bearing claim of r2 and it is derived from the expression, not observed. **I want it attacked before it becomes a scope claim.**
2. ✅ **ANSWERED BY COLTRANE BEFORE DISPATCH — the `c·√H` bound does NOT establish that its horizon matches the executable holding policy**, so it cannot yet support any 4 h vs 48–72 h claim. **What remains for you: is establishing that correspondence a prerequisite of this batch, or its own measurement?** He distinguishes three clocks — **entry-order waiting time**, **maximum holding time**, **observation window** — and we currently conflate them in the prose.
3. **Does Langston hold the original derivation (§0)?** If so it supersedes.
4. **Is this still one batch?** The problem statement has moved from *"derive R from cost"* to *"our evaluator cannot rank exit policies."* ⭐ **The second is arguably a defect in a live component that Phase-25 calibration also depends on, and may deserve its own home rather than living inside a policy batch.**

---

## 6. HONEST RESIDUALS

- ⛔ **The originating derivation is unlocated.**
- ⛔ **The xStock economics are invalid until re-derived post-`#1010`**, and **row 3n (`B-PRICE-SIDE-BY-JOB`) lands first by placement and changes which price each job reads** — a cost floor derived before it lands is derived against a moving operand.
- ⚠️ **No counterfactual exists.** The size of the opportunity is unmeasured and the batch may correctly conclude it is small.
- ⚠️ **§2's refinement is a code derivation, not a live measurement.** Its falsifier is named.
- ⚠️ **r1 shipped three errors caught by Coltrane** — a defect claimed where an architecture existed, an untested inference about passive fills, and an unsearched ledger. **All three were in the document BEFORE it reached a reviewer, which is the argument for the early-framing pass Kyle asked for.**
