# B-R-FROM-COST — PROBLEM FRAMING (r1)

> **For: Coltrane (early framing — problem, intent, high-level design), then Langston.**
> **From: CC-B. Kyle-directed 2026-09-12.** Batch filed at `B_XSTOCK_FEE_CONTRACT_SCOPE.md:151` — *"Reward-to-risk from cost → `B-R-FROM-COST`, CC-C, after row 3n."*
> **Read at the stamped sha. Nothing here is a decision; it is the problem as I can evidence it.**

---

## 0. ⛔ PROVENANCE, AND WHAT I COULD NOT FIND

**Kyle's account of the origin, which I am recording as HIS account rather than as a verified record:** the analysis looked at target-hits versus stop-hits over 1h / 4h / 8h / 12h / 24h / 48h / 72h; Langston reduced it to the reward-to-risk ratio, said the volatility term **cancels out**, that the ratio is **fixed by construction**, and that **there is no cost term anywhere in the expression**.

⛔ **I SEARCHED AND COULD NOT FIND THAT FORMULATION.** Not in the governance corpus, not in the batch documents, and a targeted search of the Discord history returned nothing matching. **What exists is the surrounding measurement (§1), not the sentence.**

⚠️ **That is itself a finding, and it is the first thing I want Coltrane to know:** a load-bearing conclusion that exists only in chat scrollback is one bad week from being lost, and this framing document is partly an attempt to stop that happening twice. **If Langston still holds the derivation, his statement supersedes this section entirely.**

---

## 1. WHAT IS ACTUALLY MEASURED (recovered from the Discord record, CC-B, 2026-09-12)

| measured | crypto | xStock (AT THE TIME) |
|---|---|---|
| fee, % of notional | **1.04 %** | **1.36 % — HIGHER, not lower** |
| median target | 2.36 % | 4.09 % |
| stop | 2.03 % | — |
| **reward-to-risk** | **1.51** | — |
| target-to-fee | **2.96×** | — |

⛔⛔ **THE xSTOCK COLUMN IS NOW INVALID AND I INVALIDATED IT MYSELF.** `#1010` closed 2026-09-11: xStock taker fell from `0.008` to `0.0010` and maker from `+0.004` to `−0.0002` (a rebate). **The 1.36 % figure was computed under a fee that was 8× too high.** ⇒ **any cross-class conclusion drawn from that contrast must be re-derived before it is used.** This is the single most important caveat in this document.

**Two further measurements that bear directly on the design:**

- ⛔ **THE SPREAD IS WIDER THAN A TYPICAL ONE-MINUTE RANGE — 91.9 % of the time on crypto, 94.5 % on xStock.** ⇒ a resting order fills only when price crosses a gap usually larger than a minute of movement. **This bounds how much of the fee saving is actually reachable.**
- ⚠️ **A WIDER TARGET BUYS NOTHING AT 4 h AND SOMETHING AT 48–72 h.** ★ **I reported the opposite to Kyle first and had to reverse it** — I had measured a window too short for the target to resolve, and logged it as `MISTAKE: wrong-object — a horizon artifact reported as a property of the geometry`. **Any horizon-free statement about target width is suspect for that reason.**

---

## 2. THE PROBLEM, AS I CAN STATE IT

**Today the target and the stop are set by STRATEGY GEOMETRY.** The stop is structural — a pattern low, a range edge, an ATR multiple — and the target is either a multiple of that risk distance or a second structural level. **The resulting reward-to-risk is therefore a property of the pattern, not of the trade economics.**

**Cost enters the pipeline only AFTERWARDS, as a pass/fail:** the net-expectancy kernel subtracts friction and the SQE refuses the signal if `netEV <= 0`.

⇒ **THE SHAPE OF THE PROBLEM: we decide how much we are trying to win WITHOUT REFERENCE TO WHAT THE TRADE COSTS, and then check whether that happened to clear the cost.** A trade whose geometry lands just under the cost floor is refused — even when moving the target a few basis points would have made it viable — because **nothing in the expression that SETS the target contains a cost term.**

⚠️ **STATED AS A HYPOTHESIS, NOT A VERDICT (rule 24).** I have not yet established the counterfactual: how many refused signals would have become viable under a cost-derived target, and at what cost in hit rate. **That measurement is part of what this batch has to produce, and it must come before any design is chosen.**

---

## 3. THE INTENT OF A FIX — what "better" would mean

**Not** "trade more." **Not** "widen targets." Those are outcomes, not intents, and either could be achieved by making the system worse.

**The intent: the target distance should be DERIVED from what the trade must clear to be worth taking, and the geometry should constrain it rather than define it.** A candidate answer to *"how far must this go before it pays?"* exists today only implicitly, inside a gate that says yes or no.

⛔ **THE OBVIOUS FAILURE MODE, NAMED UP FRONT SO THE DESIGN IS JUDGED AGAINST IT: a target derived from cost is a target that moves further away when costs rise.** That trivially raises modelled expectancy and **lowers the probability of ever being hit.** ⇒ **any design that does not carry a hit-probability term is not a fix; it is an accounting trick.** The 48–72 h finding in §1 is exactly why this is not hypothetical — a wider target *does* resolve, but only over horizons far longer than the ones we have been reasoning about.

---

## 4. ⛔ WHAT COLTRANE IS BEING ASKED FOR — AND WHAT HE IS NOT

**ASKED FOR — the early half, in Kyle's scoping:**
1. **Define the problem.** Does §2 describe a real defect, and is it stated at the right level? Where is my framing wrong or too narrow?
2. **Define the intent.** Is §3 the right thing to want? What would a good fix be *for*?
3. **The HIGH-LEVEL design.** Shape only — where the cost term enters, what it must carry alongside it, what it must not be allowed to do.

**NOT ASKED FOR:** implementation, file-level changes, parameter values, or a recommendation to ship. **This is the discussion that precedes a scope, not a scope.**

⛔ **AND ONE STANDING CAUTION THAT APPLIES TO ALL THREE OF US HERE:** the `min_rr` floors were calibrated per strategy from each strategy's **own** historical reward-to-risk (`P19_REORG_B2_3`), and `#372` records that a single blanket floor **destroyed expectancy rather than improving quality**. ⇒ **a cost-derived target is a second mechanism acting on the same quantity.** If it is introduced without deciding what happens to the existing floors, we will have two governors fighting over one dial — **which is the shape of the dual-mechanism bug this project has paid for twice.**

---

## 5. THE QUESTIONS I MOST WANT ANSWERED BEFORE ANY DESIGN

1. **Is reward-to-risk even the right quantity to act on?** Langston reportedly reduced it to that. If the ratio is fixed by construction and volatility cancels, then moving the ratio may be unreachable without changing the geometry itself — in which case the batch is about something else.
2. **What replaces the hit-probability we would be spending?** A cost-derived target trades fill likelihood for margin, and we have no calibrated model of that trade-off.
3. **Over what horizon?** §1 says the answer differs at 4 h and 72 h. **A design that does not name its horizon is not decidable.**
4. **Does this become per-asset-class?** xStock costs just fell ~8×. A cost-derived target would move xStock and crypto in opposite directions, and **the per-class-not-wildcard rule says that must be explicit rather than emergent.**

---

## 6. HONEST RESIDUALS

- ⛔ **The originating derivation is unlocated (§0).** Everything here is reconstructed from measurement plus Kyle's account.
- ⛔ **The xStock half of §1 is invalid** and must be re-derived post-`#1010`.
- ⚠️ **No counterfactual exists yet** — the size of the opportunity is unmeasured, and the batch could correctly conclude that it is small.
- ⚠️ **`B-PRICE-SIDE-BY-JOB` (row 3n) lands first by placement**, and it changes which price each job reads. **A cost floor derived before that lands would be derived against a moving operand.**
