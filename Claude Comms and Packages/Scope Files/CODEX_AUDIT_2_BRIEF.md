# DAWNTRADER V3 — CODEX ADVISOR, ASSIGNMENT 2: THE TRADING LOGIC, THE MATHS, AND WHAT TO BUILD (r2)

**Written by:** Claude New (CC-B), 2026-09-05, at Kyle's direction, after Langston's design review.
**Your standing is unchanged: ADVISOR, not a gate.** Langston's review gates are untouched and Kyle remains the sole decider. Nothing waits on you.
**Read `CODEX_AUDIT_BRIEF.md` first** — the workspace rules, the two paths, the crew mirror, the evidence standard and the three-valued ledger check all carry over and are **not** repeated here.

> ⛔ **THE COMMIT: `c7f18c5c7291b14a21a654ca3a35625c0533ca38`** — the audit clone `C:\DawnTrader-Audit` is re-pinned there, detached, clean, push-disabled.
> **Run `git rev-parse HEAD` and `git status --porcelain` and put both at the top of your deliverable**, as before.
> *(r2, Langston's condition 3: this sha was verified PRESENT AT ORIGIN before being written here — `git ls-remote` names it as a remote ref tip. A `rev-parse HEAD` on a rebased clone can name an object that does not exist upstream, and we ate exactly that on another batch last week. The clone now fetches from GitHub directly rather than through another clone, so its provenance is the review branch itself.)*

---

## 0. ⛔⛔ THE ONE INSTRUCTION MOST LIKELY TO BE IGNORED, SO IT IS FIRST

**YOU MAY NOT VALIDATE ANYTHING BY BACKTEST. THAT ARM IS CLOSED TO US AND IT IS CLOSED TO YOU.**

We have hit this wall **three times** (`W2.0a` Mode-A, `RI-a`, `W2.0b`). The entry-trigger replay maxed out at **80% parity against a ≥99% gate**, and `BATCH_CATALOG.md:313` records the conclusion verbatim: *"the exact decision-time inputs were never persisted = the 3rd study at this wall."* **The in-progress forming bar was never stored, so a faithful replay of our own decisions is not reconstructable.**

⇒ **Every proposal you make must be validated FORWARD** — on a marked window, with a **pre-registered pass/fail criterion written before the data arrives.** A criterion chosen after seeing the window can always be made to pass.
⇒ ⛔ **A proposal whose only offered validation is a backtest is one we cannot evaluate, and we will not.** If you cannot state how a thing would be tested forward, say so and mark it unvalidatable rather than proposing it.

---

## 1. WHAT KYLE IS ACTUALLY ASKING — in his framing, not softened

He believes we may have built something that cannot work, and he wants an outsider to say so if true. His words, close to verbatim:

- Can this system **profitably trade at the horizon it is attempting** — trades entered and exited within hours — **or does clearing Kraken's fees require holding for days?** And if it is the latter, **what changes: new strategies, different variables, or something else?** We are **long-only**.
- Are our **paper and passive-system simulations realistic enough to learn from** before real money goes in?
- Do we **act on what our market-condition work tells us** at pair and global level, or merely compute it? **Are we missing opportunities we cannot see?**
- **The 100% framing, which is deliberate and not naive:** we will never find a strategy that is right every time. **Name that as the target anyway, measure the gap, and ask what closes the largest part of it.** Reaching for something provably impossible and landing closer than we are now beats not reaching.

⚠️ **CONTEXT YOU SHOULD HAVE, STATED AS FACT AND AS HYPOTHESIS SEPARATELY.**
**FACT:** since the order-book fix and the metrics reset roughly two weeks ago, paper trading has been **consistently in the red, with no profitable days.**
**HYPOTHESIS, NOT ESTABLISHED (Langston's condition, and he is right):** that the results worsened *because* the simulation became more honest. Showing that needs the same population before and after, and **the metrics reset may have destroyed that comparison.** ⛔ **Do not adopt it as a premise.** If you find you need it, say so and flag it as an assumption you proceeded under.

---

## 2. THE CONDITIONS YOU MUST UNDERSTAND BEFORE JUDGING ANYTHING

You cannot assess whether a strategy can work without the constraints it operates under. Establish each **from the code and the data**, not from this brief:

1. **Two asset classes** — crypto and xStocks — with different venues, hours, tick behaviour and liquidity.
2. ⛔⛔ **THE FEE QUESTION IS TWO OBJECTS AND THEY MUST NOT BE COLLAPSED.** *(r2, Langston BLOCKER-1 — r1 asked for one measurement that the instrument cannot reach, on the one question this whole assignment turns on.)*
   - **(a) THE SCHEDULE is a MECHANISM READ.** The venue's published ladder, and **the line of our code that implements it.** Cite both. ⛔ **Do not take it from any document, including this one.**
   - **(b) THE REALIZED FRICTION is a MODEL OUTPUT and must be labelled as one.** ⛔ **We have ZERO live fills.** Friction derived from our trade records measures **what our fee model produced**, not what the venue charged. **If the implemented tier is wrong, that measurement reproduces the error with a confident denominator and a clean-looking population** — the exact shape §5 bans, one section earlier.
   - **(c) ⭐ THE DIVERGENCE BETWEEN (a) AND (b) IS ITSELF A FINDING, and possibly the most valuable one in Part 1.** If the ladder we implement is not the ladder the venue publishes, every expected-value number in the system is wrong by that amount and nothing downstream could tell.
   ⇒ **Report (a) and (b) separately, always. A single "friction is X" is not an acceptable answer** — it would have no way to be wrong.
3. **The regime categories, their numeric RANGES, and the strategy routing those ranges imply.** Which regime a pair is judged to be in decides which strategies may run on it. **That mapping is a design decision we made and have never had audited by anyone outside it.**
4. **Long-only.** No shorting. Every proposal must respect it.
5. **The risk envelope** — kill-switch, daily-loss budget, position sizing, concurrency caps. **These are hard boundaries set by Kyle, never dials, and no proposal may quietly assume one moved.**
   ✅ **BUT A PROPOSAL THAT NEEDS ONE RELAXED IS NOT DISCARDED — IT IS QUARANTINED.** *(r2, Langston condition 1, correcting me: r1 said "refused on sight", which contradicts §8. "Your risk envelope is what makes this horizon unprofitable" IS the well-evidenced no that §8 calls the most valuable outcome available — and r1 would have discarded it unread.)*
   ⇒ **Say it in the proposal's first line, and put the proposal in a SEPARATE SECTION ADDRESSED TO KYLE.** The default set stays clean, the boundary stays his, **and the information still reaches him.**

---

## 3. ⛔⛔ THE CAVEAT THAT WOULD SILENTLY INVERT YOUR HEADLINE — DURATION IS CENSORED IN BOTH CORPORA, IN OPPOSITE DIRECTIONS

**This lands on exactly the question Kyle is asking, and the failure is completely silent.**

- **Paper and live have no time-based force close.** A position that drifts stays **open** and never enters the closed-trade record. **The closed corpus systematically drops the slow resolvers — it is right-censored and biased SHORT.**
- **The passive system is truncated at the top** by a hardcoded maximum-hold valve that ships **on**.

⭐ **MEASURED JUST NOW, so this is not theoretical: there are 5 open paper positions; the oldest has been open 2.7 DAYS and the newest 3.9 hours.** That 2.7-day holder is precisely the multi-day trade Kyle is asking about, **and it appears in no closed-trade analysis.**

⇒ ⛔ **If you compute a median holding period from closed trades, see "hours", and conclude our strategies are short-horizon and cannot clear the fees, YOU WILL HAVE MEASURED OUR EXIT MACHINERY AND CALLED IT OUR STRATEGIES.** That is a wrong answer that inverts the headline, and nothing in the data would tell you.

✅ **REQUIRED:** the export ships **open positions with their age at export** alongside the closed rows, and **every row is stamped with its lane's force-close state.** **Any duration analysis is done as survival analysis with censoring, or it is not done.**

✅ **THE MAX-HOLD QUESTION IS SETTLED — Langston read the constants at the ref, and the answer is more complicated than either figure in our documents.** *(r2, condition 2. r1 told you to ask; do not ask, use this.)*
| constant | value | what it bounds |
|---|---|---|
| `vts-runner.ts:1149` `MAX_HOLD_MS` | **7 days** | the **real** passive pass |
| `vts-runner.ts:780` `SHADOW_MAX_HOLD_MS` | **48 hours** | the **shadow/counterfactual** arm. Its own comment reads *"48h (was 6h pre-OBJ-2)"* |
| `vts-service.ts:160` `TRADE_DURATION` | 3 hours | a **third, unrelated** constant — named here because it is a likely source of confusion |

⛔ **The "6 hours" in our governed documents is STALE** and survives in three other places in the tree. **Do not use it.**
**Live switch rows, all three enumerated:** `enabled_vts=true`, `enabled_paper=false`, `enabled_live=false`. Both passive caps apply as `enabled ? cap : Infinity`.

⇒ ⛔⛔ **THIS CHANGES WHAT §3 REQUIRES, AND IT IS NOT A LABELLING NICETY.** The active lanes genuinely have **no** force close — confirmed. But the passive side is **NOT one ceiling: it is a MIXTURE of two** (7 days real, 48 hours shadow). **A pooled passive duration distribution therefore has TWO right-hand walls and no single truncation point.**
⇒ ✅ **THE STAMP IS PER-ARM, NOT PER-LANE.** Every exported row names **which arm produced it** and **which cap applied to it**. **A survival model fitted to the pooled passive corpus is fitted to a mixture and its truncation term is meaningless.**

---

## 4. THE DATASETS — and the one that answers the selection question directly

⛔ **A PROVENANCE SHEET SHIPS WITH THE EXPORT AND IS PART OF IT.** Every number you report **names its dataset and its time window**, or it does not count.

| dataset | what it IS | what it is NOT |
|---|---|---|
| **closed paper trades** | what the **whole pipeline** produced, post-selection | not a strategy sample — selection and execution are confounded, and it is **duration-censored short** (§3) |
| **the passive-system corpus** | what the strategy families do across nearly the whole opportunity set | **no quality gate, no ranking contest** — a much larger and *differently* selected population, **truncated long** (§3) |
| ⭐ **the ranking-counterfactual corpus** | **the matched control, and the reason this assignment can answer more than the last one** | see below |
| **the decline corpus** | why signals were rejected | ⛔ **a decline carries its REASON and not the geometry that caused it** — see §5 |
| **open positions with age** | the censored tail | required for §3, not a performance sample |

⭐⭐ **THE RANKING-COUNTERFACTUAL CORPUS IS THE IMPORTANT ONE AND IT IS BETTER THAN ANYTHING I EXPECTED TO HAND YOU.** For each ranking cycle it records **every candidate in the pool — the one we promoted AND the ones that lost — with the decision-time ranking inputs attached and the counterfactual outcome.** **MEASURED: 53,794 rows, 29,186 cycles, 35,025 promoted, 18,769 that lost the ranking, 53,296 with outcomes, 487 symbols, both classes.**

⇒ **It answers "is our selection finding edge, or destroying it?" DIRECTLY — same instant, same pool, same population.**
⚠️ ⛔ **AND IT SUPERSEDES THE OBVIOUS APPROACH, WHICH IS WRONG.** Differencing the paper corpus against the passive corpus does **not** isolate selection, because the passive system has **no quality gate and no ranking contest at all** — the difference carries every population and lane difference between two systems, not the selection step. **Kyle raised exactly this objection on 2026-08-10 and it was conceded then.** I proposed it again anyway; Langston caught it. **Do not repeat it.**

⚠️ **PRE-ORDER-BOOK-FIX PAPER DATA SHIPS LABELLED AND SEPARATED.** Never blended into a headline number. Report it as a **labelled sensitivity arm**, and require the primary and the sensitivity to agree in **sign** — silently excluding it is its own bias.

⚠️ **THERE IS NO EPOCH MARKER ON THE TRADE ROWS.** *(My earlier claim that there was is withdrawn.)* You **cannot** split the export by one. Instead the provenance sheet ships an explicit **table of UTC boundary instants per source and asset class**. **There are several, not one** — the order-book fix, the metrics reset, and three later changes to cost accounting and pricing. **A window straddling any of them is two populations.** ⛔ **Do not date a boundary from a row's `updated_at`; those are known stale by months.**

---

## 5. PART 1 — THE AUDIT. What to attack, and what is NOT answerable

### ATTACK THESE

1. ⭐ **THE FEE-VIABILITY QUESTION, MEASURED.** What must a trade achieve to break even on realized friction, and **what do our own trades say about whether the attempted horizon clears it** — treated as censored data per §3. **This is the decision Kyle needs. Everything else is secondary.**
2. ⭐ **DO WE ACT ON IT, OR MERELY COMPUTE IT?** For every market-condition quantity computed at pair and global level, name the read sites and **show a decision that changes with the value.** Computed-and-never-consumed is the expected yield — we have found two already. **This is the most tractable of Kyle's questions and it is pure code.**
3. **THE FAVOURABLE-ASSUMPTION CENSUS** *(this replaces "are the simulations realistic enough", see below)*: **enumerate every assumption in the fill, fee and exit models that favours us, and bound each one.** Precedent for the shape: exits were found deciding on the midpoint while sells actually fill on the bid, with 24 of 24 crypto stop-outs landing below their stop.
4. **THE REGIME BOUNDARIES AND THE ROUTING THEY IMPLY.** Are the ranges defensible? Does a pair near a boundary get routed sensibly? Is any threshold applied to a population it was not calibrated on?
5. **UNITS, SIGN, LEG AND ANCHOR.** Where the maths meets the code: a formula right on paper and wrong in what it is applied to.

### ⛔ DO NOT ATTEMPT THESE — they are unanswerable from what you have, and an answer would be an opinion wearing a measurement's clothes

1. ⛔ **"Are the simulations realistic enough to learn from"** as a **verdict**. **We have ZERO live fills** — there is no venue truth to calibrate against. Do the census in item 3 instead.
2. ⛔ **Any decline attributed to GEOMETRY.** **0 of 8,767 archived declines carry a target.** A decline carries its reason, not the geometry that caused it. *"We declined X because its target was too small"* is **not derivable.**
3. ⛔ **Any conclusion from the xStock decline table being empty.** **It is empty BY CONSTRUCTION, not by behaviour** — the recorder sites sit inside the crypto detection loop and xStock enters below them. **An absence wearing a plausible number's clothes.**
4. ⛔ **Outcome-based verdicts on the six of nineteen strategies that have never traded.** Only an **arithmetic** verdict is available for those — target produced versus target required.

### ⭐ START FROM WHAT IS ALREADY DONE, AND ATTACK IT

**`STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md` already establishes a large part of Part 1 and Kyle has read it.** Re-deriving it burns your budget; **refuting it would be worth more than anything else in this assignment.** It carries what is currently our best structural finding: **there are four families of profit-target construction, and for three of them more volatility structurally CANNOT produce a bigger target** — one computes the target as a level *minus* a volatility multiple, so the target gets **smaller** as volatility rises. **If that is right, it constrains every strategy proposal you might make. If it is wrong, say so and show why.**

---

## 6. PART 2 — THE DESIGN. Propose, with your work shown

**After the audit, in the same document, propose strategy concepts that could profit under the conditions you established.** Kyle's framing is the instruction: **name the impossible target, measure the gap to it, and say what closes the largest part of that gap.**

⛔ **BINDING RULES, and the first two exist because a proposal that absorbs a finding is unauditable:**
1. **Every audit finding gets a NUMBER.** Every proposal **opens by naming the findings it rests on.** When we vet the audit and finding 7 falls, we must be able to see which proposals fall with it. **A proposal that CITES a finding is auditable; one that absorbed it is not.**
2. **AUDIT FINDINGS FREEZE AT SUBMISSION.** No amending a finding to serve a proposal that needs it.
3. **Every proposal carries its FORWARD test and a pre-registered pass/fail criterion** (§0).
4. **Every proposal touching an existing component is labelled `INFERRED-FROM-CODE`.** You have no access to why it was built that way. **That is not a criticism — it is the honest label, and it tells us which proposals need a history read before we can scope them.**
5. ⛔ **You do not evaluate your own designs.** Everything you propose is vetted, audited and tested by us. **Kyle's condition, and mine: a model that both designs and judges has no way to be wrong.**
6. **Respect long-only and the risk envelope** (§2). A proposal needing either relaxed must say so in its first line.

---

## 7. THE DELIVERABLE

One document, as before. Header check first; then the **positive enumeration of what you read, by path**; then the numbered audit findings; then the proposals, each naming its findings.

⛔ **THE OUTPUT IS BOUND BY THE SAME SHAPE AS THE INPUT** *(Langston's condition)*: **every number names its object, its population and its denominator. Every zero or absence carries a positive control** stating what the instrument would have returned had the thing been present. **Twenty pages of confident absences is the outcome we most want to avoid.**

**Questions go to `QUESTIONS.md` as before** — numbered, each stating what you would do differently depending on the answer. **Do not block; record the assumption you proceeded under.**

---

## 8. WHAT SUCCESS LOOKS LIKE

⛔ **Not a count of findings, and not a strategy we adopt.**

**Success is a defensible answer to one question: can what we have clear the real cost at some horizon — and if so which, and if not what would have to change.** A well-evidenced *no* is the most valuable outcome available here, because it would stop us spending months calibrating something that cannot work. **Kyle has said plainly he would rather learn that now than with money on the table.**
