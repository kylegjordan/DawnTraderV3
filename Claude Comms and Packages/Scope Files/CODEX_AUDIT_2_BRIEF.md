# DAWNTRADER V3 — CODEX ADVISOR, ASSIGNMENT 2: THE TRADING LOGIC, THE MATHS, AND WHAT TO BUILD (r5)

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
| ⭐ **the ranking-counterfactual corpus** | **A CONSERVATIVE ONE-SIDED INSTRUMENT — not the matched control r2 claimed, and not the dead end r3 claimed either. Read the block below in full before using it.** | fee-free in its STORED labels — which is fixable, because the PRIMITIVES are retained |
| **the decline corpus** | why signals were rejected | ⛔ **a decline carries its REASON and not the geometry that caused it** — see §5 |
| **open positions with age** | the censored tail | required for §3, not a performance sample |

⭐⭐ **THE RANKING-COUNTERFACTUAL CORPUS — WHAT IT IS, AFTER TWO WRONG DESCRIPTIONS OF IT.** *(r2 called it a matched control: wrong. r3 called the selection question unanswerable: also wrong, and over-declared — an asserted absence needs presence-grade evidence. r4 is the settled position, every claim re-derived at the ref.)*

**IT IS A SIMULATION-VERSUS-SIMULATION CORPUS OF RANKED CANDIDATES.** Every row is a shadow simulation, including the ones flagged promoted. It cannot be joined to any real trade — `promoted` is `i < limit` (the ranker's top-N, `ready_to_buy_service.ts:1950`), `shared/schema.ts:2170-2177` says **"NOT execution-confirmed"** in those words, and `promoted_trade_id` is never written.

### ⭐ WHY IT IS STILL USABLE — THE BIAS HAS A KNOWN SIGN

⛔ **The stored outcome is FEE-FREE.** `vts-runner.ts:929` hardcodes `frictionCost: 0`; `:3827` computes `netPnl = grossPnl − frictionCost`. ⇒ **`net_pnl` is IDENTICALLY `gross_pnl` on every shadow row, both arms.** *(Real passive trades DO carry a booked friction; the shadow arm alone does not.)*
✅ **BUT THE RANKER ITSELF IS FEE-AWARE AT DECISION TIME** — `predicted_r_multiple` is net expected value over risk, and a net-EV gate sits in front of it. **Only the OUTCOME is fee-blind.**
⇒ ★★ **SO THE BIAS RUNS IN ONE KNOWN DIRECTION: it FLATTERS exactly the candidates the ranker DECLINED because friction ate their edge.** That makes this a **conservative one-sided instrument**, not a broken one:
- **Ranker wins on this data ⇒ a REAL LOWER BOUND.** The bias was working against it. **That answers the question.**
- **Ranker ties or loses ⇒ INCONCLUSIVE. NEVER a fail.** The bias points that way by construction. ⛔ **Do not report a loss as a finding.**

### ✅ AND THE STORED LABELS CAN BE DISCARDED — THE PRIMITIVES ARE THERE

**VERIFIED against the live table `rtb_shadow_pairings` (38 columns):** the row retains `entry_price`, `exit_price`, `stop_price`, `target_price`, `opened_at`, `closed_at`, `holding_ms` and `close_reason`, alongside the derived `gross_pnl` / `net_pnl` / `r_multiple`.
⇒ ✅ **THROW AWAY EVERY STORED DERIVED LABEL AND RECOMPUTE FROM THE PRIMITIVES.** This is Kyle's gross-not-net instruction applied one level up. **A stored `net_pnl` here is not a net figure; it is a gross figure wearing the wrong column name.**

⛔⛔ **BUT THAT IS ONLY TRUE IN RATIO CURRENCIES, AND r4 OVER-STATED IT.** *(r5, Langston.)* **MEASURED with a positive control: `rtb_shadow_pairings` has ZERO columns matching quantity, size, side, direction, fee, friction or notional — while the SAME query over the real closed-trades table returns EIGHT** (`quantity`, `side`, `entry_fee`, `entry_fee_rate`, `exit_fee`, `exit_fee_mode`, `fees`, `total_fee`). **The instrument works; the absence is real.**
✅ **SO RECOMPUTE IN RATIO CURRENCY ONLY** — R-multiple, `(exit − entry) / (entry − stop)`, and per-unit return. **Both are fee-free by construction and are the RIGHT currency for comparing a ranker's ordering anyway.**
⛔ **A DOLLAR-DENOMINATED RECOMPUTATION IS CIRCULAR AND YOU MUST NOT DO ONE SILENTLY.** The only route to position size is backing quantity out of `gross_pnl` — **the very column you were just told to discard** — and it additionally assumes a long-only direction **that this table does not record.** If you need dollars, **state the quantity derivation and the long-only assumption as assumptions we may challenge**, and put the question in `QUESTIONS.md`.

### ⛔ THE CUT — use this design, not a naive comparison

**WITHIN-CYCLE PAIRED.** Use `rtb_shadow_pool_members`, which — unlike the pairings table — is **deliberately NOT deduped** and records rank and promotion **per cycle**. Compare **rank 0 against ranks 1..N inside the SAME `cycle_key`.**
✅ **This neutralises two confounds by construction:** every member of one cycle was **equally eligible at the same instant**, which removes both the symbol-state effect *(a traded symbol is excluded from later pools while a rejected one re-enters)* and any regime or timing drift.
⛔ **RESTRICT to members whose shadow first appeared at THAT cycle** — the shadow opens at a signal's first appearance, so a candidate promoted at cycle 8 carries a cycle-1 entry price. **That price-basis freeze is the real residual defect, and subsetting is what removes it.**
⛔ **SPLIT, NEVER POOL:** the ranker's sort **changed on 2026-06-30**, so rank means a different thing either side. The **6-hour hold-ceiling era is its own arm** and is never pooled with the 48-hour era — the 6h ceiling truncated **27.3% of shadow closes (10,804 of 39,641)**.
⛔ **PUBLISH THE SUBSET `n` BEFORE THE RESULT.** After these restrictions the usable sample may be small; we would rather know that first.
⚠️ **STILL NAMED AS A POPULATION LIMIT ON EITHER READING:** nothing is captured when the system is at capacity or warming up, so **busy periods are absent by construction, not by chance.**

⚠️ **PRE-ORDER-BOOK-FIX PAPER DATA SHIPS LABELLED AND SEPARATED.** Never blended into a headline number. Report it as a **labelled sensitivity arm**, and require the primary and the sensitivity to agree in **sign** — silently excluding it is its own bias.

### ⛔⛔ THE FEE HISTORY — MEASURED, AND THE CONTAMINATION IS NOT WHERE ANYONE EXPECTED

⭐ **THE RATES CHANGED ONCE, NOT REPEATEDLY.** `spot_taker_fee 0.008` / `spot_maker_fee 0.004`, both classes, written **2026-06-10 21:50:44Z** and untouched since. Before that, 0.26%/0.16% hardcoded in three copies.
⇒ ⛔⛔ **WHAT CHANGED REPEATEDLY IS *WHICH LEGS GET CHARGED WHICH RATE*, AND THAT IS THE WORSE CONTAMINATION — because the RATE is identical across the boundary, it is INVISIBLE in any per-row fee number.** Charging-rule boundaries:
| from | rule |
|---|---|
| → 2026-06-10 | taker on both legs @ 0.26%, hardcoded |
| **2026-06-10 21:50Z** | taker on both legs @ 0.80%, database-governed |
| **2026-07-01/02** | maker **activated** — the entry leg may now be 0.40% |
| **2026-09-02 08:49:47Z** | the passive system starts charging the maker entry leg at all three write paths |
| **not yet** | a 0.05%-per-leg slippage constant is **welded into every friction number to date** and has not been separated |

⛔ **THERE IS NO PER-ROW ERA KEY ANYWHERE.** Measured: **0** columns matching `%epoch%` across the whole schema, against a positive control of **22** `%fee%` columns over 7,752. ⇒ **the date table is not a convenience, it is the ONLY join available.**
⛔ **AND THE OBVIOUS DATE SOURCE IS UNSOUND.** At least one migration sets a constant's value and author but **not its `updated_at`** — a live row right now reads a **September author against a June timestamp.** Migration *filenames* are not write times either. ⇒ **Boundaries are built from deploy times in the batch records, and where we only have the day, the brief states an INTERVAL rather than an instant.**
⚠️ **`calibration_epoch` values are NOT comparable across classes** — the passive crypto and xStock scopes carry different integers for reasons unrelated to time.
⇒ ⛔⛔ **AND THE DEEPEST CONSEQUENCE, which Kyle identified and which applies to EVERY corpus: THE NET-EV GATE THAT DECIDED WHAT GOT TRADED WAS ITSELF COMPUTED FROM THESE CHANGING RULES.** So it is not only the outcomes that carry a stale fee model — **it is the SELECTION.** A candidate rejected in July for negative net expected value might pass today. ⇒ **"what we traded" is not a stable population across the window. Report per fee-era as well as pooled, and never treat the pooled population as one thing.**

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

⭐⭐ **AND KYLE'S STANDING INSTRUCTION ON THE DATA, which supersedes any export we might have pre-designed: TELL US WHAT YOU NEED.**
We are **not** pre-baking a perfect export, because — as the section above shows — **we can only partially date our own data.** What exists and what state it is in is described here **including its defects, as defects**. ✅ **If you need something rawer, with fewer of our calculations already applied, ASK FOR IT.** Kyle's words: the Codex may tell us what it needs instead. **A request for cleaner primitives is a good outcome, not a failure of the brief.**

**Questions go to `QUESTIONS.md` as before** — numbered, each stating what you would do differently depending on the answer. **Do not block; record the assumption you proceeded under.**

---

## 8. WHAT SUCCESS LOOKS LIKE

⛔ **Not a count of findings, and not a strategy we adopt.**

**Success is a defensible answer to one question: can what we have clear the real cost at some horizon — and if so which, and if not what would have to change.** A well-evidenced *no* is the most valuable outcome available here, because it would stop us spending months calibrating something that cannot work. **Kyle has said plainly he would rather learn that now than with money on the table.**
