# B-EXIT-POLICY-EVALUATOR — PROBLEM FRAMING (r3)

> ⛔⛔ **`B-R-FROM-COST` IS DEAD, AND IT DIES AT THIS RENAME (Langston r2 ruling, adopted without reservation).** The old name **presupposed its answer** *and* **named a mechanism Kyle deleted on 2026-06-21**. ★ His reason is the decisive one: *"a filed identifier that prescribes a deleted mechanism will be cited as authority by the next stateless reader. That reader is me."*
> **Reviewed by Coltrane (early framing, r1→r2) and Langston (r2→r3). Kyle-directed 2026-09-12.**
> **r3 supersedes r1 and r2 in full. The r1 problem statement is WITHDRAWN, not amended.**

---

## 0. PROVENANCE — ⛔ THE ORIGINATING DERIVATION IS NOT HELD BY ANYONE

**Kyle's account:** Langston reduced the earlier target-hits-vs-stop-hits analysis to the reward-to-risk ratio, said volatility **cancels**, the ratio is **fixed by construction**, and there is **no cost term anywhere in the expression**.

⛔ **LANGSTON DOES NOT HOLD IT.** `langston-recall`, four phrasings, **0 hits each**, against an index of **94,859 records (2026-09-12T04:10Z)** whose coverage spans the era (openclaw 03-12→05-06, telegram 03-13→06-21, discord 06-19→09-12). **He can neither confirm nor deny authorship**, and per `#453` **a miss is not an absence**.
⛔ **MY OWN SEARCH, WITH ITS POSITIVE CONTROL:** full inbox (19,986 lines) for `fixed by construction` · `cancels` · `cost term` · `volatility drops out` **returned matches — every one my own messages from the last hour.** The instrument finds the strings when present. ⚠️ **Reach: the Discord log and the repo, NOT the Desktop conversation** — so this bounds where it is not.
⇒ ✅ **THE SUPERSESSION CLAUSE IS STRUCK (Langston).** §0 is **decision-inert** and stays labelled as Kyle's account.
⭐ **AND HE RULED ON THE CONTENT WITHOUT HOLDING IT:** *"no cost term anywhere in the expression"* is **TRUE** of the strategy's target-setting expression (`b × ATR`) and **FALSE as a premise for a defect** — Coltrane's objection. ⇒ ⛔ **§0 may NOT be used to reinstate r1's withdrawn statement.**

---

## 1. WHAT IS MEASURED — WITH THREE CORRECTIONS I ACCEPTED

| measured | crypto | xStock (AT THE TIME) |
|---|---|---|
| fee, % of notional | 1.04 % | **1.36 % — HIGHER** |
| median target | 2.36 % | 4.09 % |
| stop | 2.03 % | — |
| reward-to-risk | 1.51 | — |

⛔ **THE xSTOCK COLUMN IS INVALID — `#1010` cut the xStock taker rate 8× on 2026-09-11.** Re-derive before use.
⛔ **THE TABLE CANNOT SUPPLY A REPRESENTATIVE TRADE (Coltrane):** no populations, no aggregation definition, and **a median of per-trade ratios is not the ratio of medians.**
⛔ **WITHDRAWN FROM r1:** that the spread exceeding a one-minute range means *"a resting order fills only if price crosses that gap."* ★ **A resting bid fills when an incoming seller trades against it — price need not traverse the spread at all.** Bounding passive-fill probability needs order-placement, queue and order-flow evidence. **The measurement stands; my inference from it does not.**
⚠️ **The 48–72 h result** is weakened to its measured form: **more eventual target touches do not establish improved net expectancy**, absent ordering against the stop, executable prices and intervening exits.

---

## 2. THE PROBLEM — ⛔⛔ AND IT IS **NOT A DEFECT**

### r1 IS WITHDRAWN, TWICE OVER

**r1 claimed:** the defect is that nothing in the expression which SETS the target contains a cost term.
⛔ **COLTRANE (algebra):** when `C` is constant across candidate targets, maximising `grossEV(T) − C` selects the **same** `T` as maximising `grossEV(T)`. Subtracting a constant changes **whether** a trade is worth taking, never **which** target is best. **Geometry followed by an economic gate is a sound architecture.**
⛔⛔ **LANGSTON (a second application of Coltrane's own argument, and it kills r2's residual framing too):** r2 still said *"the defect is narrower…"*. **It is not a defect at all.** ★ **The kernel is a GATE, scored on ONE supplied triple. It was never handed a choice set.** ⇒ **using a gate's score as an objective function over alternatives it was never calibrated against is a CATEGORY ERROR IN THE PROPOSER, not a fault in the gate.**
⇒ ✅ **BUG TAXONOMY: OUTCOME (2) — WORKING AS DESIGNED BUT UNADDRESSED ⇒ A SCOPE DECISION FOR KYLE, NEVER A UNILATERAL FIX.** **Written here explicitly so the next stateless reader cannot reinstate "defect".**

### ✅ THE PROBLEM STATEMENT (Coltrane's wording, adopted)

> **We have not established whether native exit policies leave economically worthwhile opportunities unused. Our current expectancy model cannot evaluate target changes reliably, because its win probability does not respond to those changes. We need to determine whether feasible alternative exit policies improve net outcomes under current costs and an explicit holding horizon.**

### ⭐ THE RESULT, RE-DERIVED AT THE REF — **EXACTLY AFFINE, SLOPE ≥ 0.40**

- **Kernel:** `pWin` reads `DI` or `|dbsScore|`; `distTarget` is consumed **only** in `rawEV = pWin·distTarget − pLoss·distStop`. Both branches target-invariant.
- ⭐ **THE ONE PLACE AN OFFSET COULD HAVE LIVED — FRICTION — AND LANGSTON CHECKED IT WHERE COLTRANE AND I DID NOT.** Friction is an **input**, so the producers decide. **Both price it on ENTRY NOTIONAL ONLY:** `expectancy.ts:640` `friction = frictionPct * tradeMeta.entryPrice`; `maker-taker-decision.ts` `totalFriction: takerFrictionPct * entryTaker` and the maker twin `makerFrictionPct * entryMaker`. **Neither reads `targetPrice`. I confirmed all three sites myself.**
- ⇒ **`netEV(T)` is EXACTLY AFFINE in `distTarget` with slope `pWin`, and `pWin` is clamped to `[pwin_floor, pwin_ceiling]` (seeds 0.40 / 0.60) ⇒ SLOPE BOUNDED BELOW BY 0.40 > 0.** Not merely monotone — **uniformly monotone with a known minimum slope.** Same for `netRewardToRisk`, `distStop` being invariant.

### ⛔⛔ MY FALSIFIER WAS UNFALSIFIABLE — AND THAT IS THIS BATCH'S OWN PATTERN, IN THE DOCUMENT ABOUT IT

r2 offered: *"falsified iff a nearer target outranks a further one on `netEV`, other inputs equal."* ★ **That is UNSATISFIABLE BY CONSTRUCTION — no observation can ever meet it, because the expression is affine with positive slope.** ⇒ **a falsifier no data can satisfy is not a falsifier**, and §7 would have carried it as a residual that could never close. **This is `control-that-cannot-fail`, written by me, inside the framing whose subject is controls that cannot fail.**
✅ **REPLACEMENT (Langston's, and he ran it):** **falsified iff any input to `computeNetExpectancyKernel`, or to either friction producer, responds to `targetPrice`. Three sites. All checked. None do.** ⇒ ⛔ **THE RESULT IS CONFIRMED, NOT PENDING-OBSERVATION.**

### ⚠️ THE SECOND-ORDER TERM, WITH ITS MAGNITUDE, SO NOBODY INFLATES IT

**The friction model bills BOTH legs at ENTRY notional, while the real exit fee is charged on EXIT notional.** ★ **That IS a missing offsetting term, with the correct sign.** ⛔ **At a 4 % target on a 0.80 % taker leg it is ~3 bps of notional — two orders of magnitude too small to bend a ranking. IT MUST NOT BE CITED AS THE FIX** (Langston).

### ⭐⭐ THE LIVE FOOTPRINT — **BOTH REVIEWERS AND I MISSED IT UNTIL LANGSTON FOUND IT**

⛔ **The RTB ranker ranks LIVE QUEUED SIGNALS on this kernel's own `netRewardToRisk`**, falling back to `chosenNetEv / distStop` — `ready_to_buy_service.ts` (`server/core/rtb/`), **re-derived by me at the object.**
⇒ ✅ **SO THE BOUNDED FORM OF THE SENTENCE I WITHDREW IS RESTORED: the live system ranks NO candidate targets for a signal — but it RANKS SIGNALS on a key that is monotone in target distance.** ⇒ **holding pWin, entry and stop equal, it systematically promotes the signal with the farther target, and that is MEASURABLE ON `rtb` ROWS TODAY.**
⛔⛔ **AND WORSE, ON THE SAME PATH: `const target = (p.target != null && Number.isFinite(p.target)) ? p.target : p.entry * 1.02` — a FABRICATED 2 % TARGET (`#927`) fed straight into a key that is monotone in target distance.**
⚠️ **A RECORDED PLAN FINDING THAT COMPOUNDS THIS, CITED AS RECORDED AND *NOT* RE-DERIVED BY ME:** `PHASE_19_PLAN` states **DI is recorded nowhere and defaults to 50, pinning pWin at the 0.60 CEILING** — *"a fail-OPEN default on a risk gate."* **If that still holds, the ranking key is very nearly pure geometry. It needs its own check before it is used.**

### ⇒ THE ACTUAL FINDING

⛔ **The degenerate argmax is the SYMPTOM. The finding is the OMISSION OF `P(target first | distance)` — plus the fact that the `[0.40, 0.60]` clamp means the kernel STRUCTURALLY CANNOT EXPRESS A LOW-PROBABILITY FAR TARGET even if one were fed to it.**

### ⛔ AND THE LEDGER ALREADY ANSWERED PART OF THIS — A §9.5(b-ii) MISS THAT IS MINE

**`P19_REORG_B2_1_SCOPE.md`, which Coltrane found and I owed:** it removed target-lifting **because the lift *"manufactures a target the strategy never chose"*** and duplicated the Net-Expectancy gate's cost coverage — **KYLE DECIDING, 2026-06-21, to rely on that gate as the cost-coverage judge and keep no separate floor.** ⇒ **r1 proposed restoring a mechanism we deliberately deleted. Any new proposal must state what NEW OUTCOME EVIDENCE distinguishes it.**

---

## 3. THE INTENT — ✅ Coltrane's wording, adopted

> **Select an evidence-supported trade policy, or abstain, using expected net outcomes under structural risk and holding constraints. Target distance is one possible decision variable; improvement must survive the corresponding changes in outcome probabilities, execution and capital use.**

⛔ Carrying *a* hit-probability term is **insufficient**: it must describe **this target, this stop, this horizon, this execution policy**. **A term that does not respond to the target is what we already have.**

---

## 4. HIGH-LEVEL DESIGN — ✅ Coltrane's four bullets, adopted

- **Define the feasible alternatives from the strategy** — its **native target** and **abstention** included. **Preserve the structural stop.** A target beyond a structural ceiling is a **changed strategy hypothesis**, not a cost adjustment.
- **Evaluate COMPLETE outcomes per alternative** — realised net P&L including **timeout exits** and execution costs. For passive entry, separate **P(entry fills)** from **P(target succeeds | filled)**. **Count spread and slippage once.**
- **Compare on the SAME eligible population**, including refused signals with usable later observations. **Report eligible / observed / censored / excluded.** ⛔ **A higher score from the EXISTING kernel cannot validate an alternative** — §2 is the proof.
- **Keep ONE economic judgment.** ⛔ **No target-lifting mechanism whose purpose is to manufacture a pass through the gate.** **Resolve the per-strategy `min_rr` floors explicitly** — calibrated under NATIVE targets, and that calibration does not carry to changed exits (`#372`).

---

## 5. ⛔⛔ PREREQUISITES — THE ONE THAT MAY RESIZE THE WHOLE BATCH

⛔⛔ **AN OUTCOME CORPUS MAY NOT EXIST, AND LANGSTON NAMED IT WHEN NEITHER COLTRANE NOR I DID.** The evaluator is **outcome-sourced**, so `#596` and `RUNNING_ISSUES.md:98-99` bind it. **Re-read by me at the object:**
- **The DB copy has NO outcome fields** — no `netProfit` / `exitPrice` / `pnl` column, and **zero such keys in `context` across all 39,080 closed rows.**
- ⇒ **the only record of what a trade actually EARNED is `logs/virtual_trades/*.json`** — the partial legacy sink, **no backup, no tier, no pruner.**
- **And closed trades are HARD-DELETED at 90 days** (`vts_open_trades` is absent from the retention sweep; GC is a `DELETE`).
⇒ ⛔ **BEFORE SCOPING: establish that a TARGET-DISTANCE-CONDITIONED OUTCOME CORPUS WITH ORDERING AGAINST THE STOP exists. If it does not, objective 1 is BUILDING it, and this is a far larger batch than r1 described.**

✅ **THE THREE CLOCKS ARE A PREREQUISITE INSIDE THIS BATCH, NOT A SEPARATE MEASUREMENT (Langston).** **Entry-order waiting time · maximum holding time · observation window** — the evaluator must take them **explicitly as inputs**, because **an evaluator that does not name its horizon cannot price a timeout exit**, and §4 already requires timeout exits in the outcome.
⛔ **`c·√H`'s horizon correspondence to the executable holding policy is UNESTABLISHED** (Coltrane) — it may not support any 4 h vs 48–72 h claim until shown.

---

## 6. DISPOSITION — TWO BATCHES, SEQUENTIAL BY DEPENDENCY

- ⭐ **`HOME: B-EXIT-POLICY-EVALUATOR, owner NEW Claude (CC-B), placed in `PHASE_19_PLAN` relative to the existing Phase-25 pWin-calibration item`** — §9.4 disposition **(3)**, exact position to be settled with Langston. ⛔ **NO DATE.**
- ⛔ **SEQUENTIAL BY DEPENDENCY, NOT PREFERENCE (Langston):** the policy question — *do native exits leave value unused* — is a **CONSUMER** of the evaluator, and §2 is the proof you cannot answer it with an instrument that cannot rank the alternatives. **Parallel is not available.**
- ✅ **`B-KRAKEN-FEE-WATCH` MAY RUN IN PARALLEL — approved, no shared surface.** ⚠️ **But row `3n` `B-PRICE-SIDE-BY-JOB` is placed FIRST and changes which price each job reads — do not derive a cost figure intended to outlive it.**

---

## 7. HONEST RESIDUALS

- ⛔ **The originating derivation is held by no one** (§0) and is decision-inert.
- ⛔ **The outcome corpus is the open prerequisite** and may resize the batch (§5).
- ⛔ **xStock economics invalid until re-derived post-`#1010`**; row 3n moves the operand.
- ⚠️ **The DI-default/pWin-ceiling claim is cited as recorded, NOT re-derived** — it needs its own check.
- ⚠️ **r1 shipped three errors and r2 shipped one more, all caught by reviewers before any code existed:** a defect claimed where an architecture stood · an untested inference about passive fills · an unsearched ledger · **and an unfalsifiable falsifier.** ★ **All four were in the document BEFORE it reached a reviewer. That is the argument for the early-framing pass Kyle asked for, and it is the strongest evidence this batch has produced about our own process.**
