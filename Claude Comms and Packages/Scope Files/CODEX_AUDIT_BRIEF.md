# DAWNTRADER V3 — AUDIT BRIEF FOR THE CODEX ADVISOR (r2)

**Written by:** Claude New (CC-B), 2026-09-04, at Kyle's direction.
**Your standing:** **ADVISOR, not a gate.** Nothing waits on you. Langston's review gates are unchanged and Kyle remains the sole decider. You are not blocking anyone, so take the time to be right rather than fast.
**The assignment:** one full audit, done in one pass, delivered as a single document. Not piece by piece.

> ⛔ **THE COMMIT YOU AUDIT — `5a7fc2eccef6c8d30b35006f3c27c53fb4d21da1`.**
> **The tree:** `C:\DawnTrader-Audit` — a dedicated clone, detached at that commit, push-disabled at the git level.
> ⛔ **BEFORE YOU READ ANYTHING ELSE, RUN BOTH AND PUT THE RESULTS AT THE TOP OF YOUR DELIVERABLE:** `git rev-parse HEAD` must equal the sha above, and `git status --porcelain` must be **empty**. **Every `path:line` you write is unanchored until you have done this** — if the tree moved or is dirty, your citations point at something nobody else can reproduce.
> *(r2, Langston's condition: r1 said "a clone pinned to a stated commit" and never stated it. This is our own worktree-versus-ref defect, one layer out.)*

---

## 1. WHAT YOU ARE LOOKING FOR — AND WHAT WOULD MAKE THIS A WASTE

**Kyle's words: systematic flaws.** ⛔ **We are not asking for a bug list.** Four sessions and a reviewer already hunt individual defects daily and the ledger has a thousand numbered entries. **A list of twenty more instances is worth almost nothing to us.**

**What we cannot do for ourselves is see the SHAPE of our own errors.** You are the only reader here with no history, no stake in past decisions, and no memory of why anything was built. That is your entire advantage. Spend it on questions like:

- **What does this system ASSUME and never check?** An assumption nobody has stated is invisible to everyone who has been here since it was made.
- **Where does the same mistake appear in more than one place?** One instance is a bug. Three instances with one shape is a flaw in how we build, and that is worth ten bug reports.
- **What is DESIGNED CORRECTLY and IMPLEMENTED DIFFERENTLY?** We have a System Manual describing what the system is supposed to do. Divergences between it and the code are the highest-value thing you can find. ⛔ **BUT A DIVERGENCE NEEDS A THIRD INPUT BEFORE IT IS A FINDING** *(r2, Langston)*: §4(a) says our documents carry stale content, so *"the code does not match the Manual"* is, on its own, most often **documentation debt**. **Use the git history or the batch record to say WHICH SIDE MOVED.** A divergence where the CODE moved and the Manual did not is doc debt; one where the Manual states an intent the code never implemented is the finding you are looking for.
- **Where does the maths not survive contact with the code?** A formula that is right on paper and wrong in units, in sign, in population, or in what it is applied to.
- **What are we systematically over- or under-confident about?**

★ **A single well-evidenced structural finding beats fifty instances. If you find one thing of that kind, the audit has paid for itself.**

---

## 2. THE SYSTEM, BRIEFLY

An autonomous trading system across two asset classes — **cryptocurrency** and **xStocks** (tokenized equities; call them xStocks, never "stocks", because real equities will be their own class later).

It runs in **paper mode** with **active trading ON**: the full pipeline executes and produces an internally-vetted fill rather than sending a real order. **Live mode is a later, gated phase.** These are two orthogonal axes and confusing them is our most common terminology error — *mode* is paper/live, *active trading* is on/off. There is also a separate passive system (**VTS**) that generates many virtual trades for telemetry and learning; **VTS is not the trading pipeline** and does not share its gating.

**The stated edge is SELECTION, not frequency:** pick and size the single best signal per cycle, gate it on expected value, size it inside a hard risk envelope, compound. **The risk limits are hard boundaries, never dials** — if growth and risk tolerance conflict, risk tolerance wins.

**Rough pipeline order:** market scanning → regime detection → signal generation → filtering and quality evaluation (the **SQE**) → a ready-to-buy pool (**RTB**) that ranks and promotes → trade execution configuration (**TEC**) → the active execution engine → open, manage, exit.

---

## 3. HOW TO READ 16 MEGABYTES

**The surface is about 5 MB of documents and 11.6 MB of code across 896 files.** You cannot hold it. Do not try. Read on demand from the pinned clone, and keep your own notes.

**Your workspace:** `C:\DawnTrader-Codex\` — the only place you may write. `notes\` is yours to structure as you like; put the deliverable in `out\`.
**The tree you audit:** a clone pinned to a stated commit. **Record that commit at the top of your deliverable and quote `path:line` against it.** Do not read any other clone on this machine — three of them are being edited continuously and contain unreviewed, half-finished work.

**Work in sessions. Write as you go.** At the end of every session append to your notes; at the start of the next, read them back. Your notes are the continuity, not your memory. **This is deliberate** — it is the same discipline our own reviewer works under, and it is why his findings survive.

**A reading order that will not waste your first day:**
1. `1-system-manual/SYSTEM_MANUAL.md` — the architectural and mathematical truth the system is *supposed* to implement. Start with its table of contents and read the chapters on strategy logic, regime detection, filter design and the quantitative maths.
2. `1-system-manual/SYSTEM_IMPACT_MAP.md` — per component: upstream feeders, downstream consumers, shared state, background execution, blast radius. Read its "Cross-Cutting Runtime State, Singletons and Liveness Registry" section before forming any view about state.
3. Then the code, following the pipeline order in §2 above.
4. `1-system-manual/PHASE_19_PLAN.md` and `POST_AUDIT_ROADMAP.md` — what is in flight and what is planned.

---

## 4. ⛔ WHAT WILL MISLEAD YOU — READ THIS BEFORE YOU FORM ANY VIEW

These are not hypotheticals. Each has burned one of us.

**(a) OUR DOCUMENTS CONTAIN STALE NUMBERS, AND WE KNOW IT.** We have a standing rule that an always-loaded file must name *where* to read a live value and never state *what it currently is* — because nothing compares a written figure to the world, and every reader then loads a wrong fact with full confidence. One of our own always-loaded files asserted a wrong configuration value for seventeen days. **Treat every number in a document as a claim with a date, not as truth. Verify at the code or the data before building on it.**

**(b) MUCH OF THE GOVERNANCE CORPUS IS HISTORY, NOT CURRENT STATE.** `RUNNING_ISSUES.md` is 2.4 MB and largely closed items with their full reasoning preserved. An entry describing a defect is not evidence the defect is live. **Check whether it is CLOSED before citing it.**

**(c) SEVERAL COMPONENTS CARRY NAMES FROM AN EARLIER ERA.** A name is not a specification. Verify behaviour in code, never from a component's name and never from a governance document's wording.

**(d) `bridge/canonical/` IS PRE-GOVERNANCE HISTORY.** It records what we *intended* to build in an earlier architecture. **Never cite it as current truth.** Its value is intent — why something was built the way it was.

**(e) THE BIGGEST TIME-WASTER, AND WE HAVE A RULE ABOUT IT:** *a deliberate, approved, reviewed decision reported as a defect is WORSE than no finding.* It burns review cycles and impugns work that was done correctly. **Before filing anything as a flaw, search `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports for the component AND for the symbol.** If a code comment names its own provenance — a batch id, an issue number, "Langston-approved" — **follow it rather than reading past it.**

⛔⛔ **AND REPORT THAT SEARCH AS A THREE-VALUED RESULT ON THE FACE OF EVERY FINDING — NEVER AS A SILENT CLEARANCE.** *(r2, Langston: this check has the exact failure mode §4(c) warns about — names drift, so a symbol search over a 2.4 MB corpus WILL return false absences, and a not-found would read to you as cleared.)*
| value | meaning |
|---|---|
| **FOUND-AND-CLOSED** | we already decided this. Say so, cite the entry — and tell us anyway if you think the decision was wrong, but label it a challenge to a decision, not a defect. |
| **FOUND-AND-LIVE** | a known open item. Your finding may still add evidence or reach further. Cite the entry. |
| **NOT FOUND** | ⛔ **A WEAK RESULT, NOT A CLEARANCE.** State the exact queries you ran and the corpora you searched, so we can spot the false absence in seconds — we have the history and you do not. |
★ **This costs you one line per finding and costs your independence nothing.** It is deliberately better than us handing you a list of our known problems, which would anchor you and destroy the only thing you bring.

⛔⛔ **(f) THE PINNED TREE CANNOT SEE THE LIVE CONFIGURATION — AND OUR REVIEWER RANKS THIS ABOVE THREE OF THE FOUR ABOVE.** *(r2, Langston, from his own retracted finding.)*
**Much of this system's behaviour is governed by values in the DATABASE, not in the repository** — a settings table and a guardrails row. **They are not in the tree you are reading, at all.** Our own reviewer once asserted a mechanism from code that was in fact gated off by two database values, and retracted it.
⇒ ★★ **REACHABILITY IN CODE IS NOT LIVENESS. The repo does not contain the settings.**
⇒ **This cuts BOTH ways and you must look in both directions:** a hardcoded constant making a decision that should be database-governed **and** a code path that reads as live but is switched OFF in the database, or a "default" in the code that is never the value actually used.
⇒ **You cannot settle either from files. When behaviour depends on a setting, that is a QUESTION for §8, not a finding** — and a finding that assumes a config value without asking is the single most likely way this audit produces confident nonsense.

---

## 5. THE EVIDENCE STANDARD WE HOLD OURSELVES TO

Your findings will be read against this, so meeting it makes them usable and missing it makes them arguable.

- **Every number names its OBJECT and its POPULATION**, and why that population is the right one. *"Errors went up"* is not a finding; *"across all 406 closed crypto trades in this table, N had X"* is.
- **A zero, an absence or a near-total needs a POSITIVE CONTROL.** Show the instrument returning a known-positive before its silence counts as evidence. *"No errors in that log"* is worth nothing until you show the log is capable of holding one.
- **A mechanism claim cites the line that implements it**, or is explicitly labelled a hypothesis.
- **A matching name is not a matching thing.** Our single most repeated failure. The path can be right while the content is another thing entirely; a search can match a shape you never controlled for.
- **Truncated output is not a population.** If a result becomes a count or an absence claim, re-run it unbounded or state the truncation next to the number.
- ⭐ **Label evidence against your own interest.** If something weakens your finding, say so in the finding. We would rather have a narrower true claim than a wide arguable one.

⚠️ **YOU CANNOT MEET THE POSITIVE-CONTROL BAR ON ANYTHING NEEDING RUNTIME, LOGS OR THE DATABASE — you have none of them.** *(r2, Langston.)* ⛔ **Do not let that bar go quietly unmet.** In those cases: **label the claim a HYPOTHESIS, and put the control you WOULD have run into `QUESTIONS.md` as a request for us to run it.** That converts a standard you cannot meet into a work item we can, which is honest and is exactly the traffic §8 exists for.

---

## 6. SPECIFIC THINGS WORTH ATTACKING

⛔⛔ **STOP. DO NOT READ THE REST OF THIS SECTION YET.** *(r2, Langston's design, and it is the cleverest thing in this brief.)*

**In your FIRST session, before reading past this line, write your own top questions into `notes\my-questions-before-section-6.md`** — what YOU would go after, given §1 to §5 and a first look at the system. Then read §6, and record the delta **both ways** in the same file:
- what WE listed that you would not have asked
- what YOU asked that we did not list

★★ **THAT DELTA IS THE POINT, AND IT IS THE ONE ARTIFACT WE CANNOT PRODUCE OURSELVES: IT MEASURES OUR BLIND SPOT DIRECTLY.** The hooks below are the places *we* have historically been wrong — which is exactly why they may be the wrong list to hand an outsider. By construction, a map of the blind spots we already know about is not where our blind spots are. **Include the delta in your deliverable; it may be worth more than the findings.**

---

Offered as hooks, not as a checklist, and deliberately phrased as questions rather than suspicions. **Do not treat these as the scope — they are examples of the altitude we want.**

**On the trading logic and maths:**
- The stated edge is **selection, not frequency**. Does the code actually implement that, or does it implement something that merely correlates with it?
- **Fees are large here** — the real venue schedule is on the order of 0.80% taker and 0.40% maker. Does every place that computes expected value carry the true round-trip cost, in the right direction, for the right leg? A sign or a leg error here is invisible and expensive.
- Is any threshold applied to a number **derived from a different population** than the one the threshold was calibrated on?
- Does **regime detection** do what the System Manual says it does, including at the boundaries between regimes?
- Are there **hardcoded constants making decisions** that should be governed by the database? We have a hard rule that a database-governed setting must fail loudly when absent rather than silently defaulting. Is that honoured everywhere? ⭐ **And the INVERSE, which r1 missed: is there a path that reads as live in the code but is switched OFF by a setting — or a code "default" that is never the live value?** See §4(f); neither direction is settleable from files, so both are questions.
- Where a value is **smoothed, averaged, clamped or defaulted**, is the resulting number still the thing its consumer believes it is?

**On the machinery:**
- **Is anything done twice by two mechanisms?** We ran a duplicate execution path for seven months through two audits, because tracing forward from one entry point structurally cannot discover a second entry point. Enumerate entry points before tracing.
- **Is anything WRITTEN that nothing reads, or READ that nothing writes?** Both are real defects here and both have bitten us.
- **What happens on partial failure?** Where does the system fail open, and is that the right direction in each case?
- **Shared mutable state** across the pipeline: who writes it, who reads it, and can they race?
- Where does a value cross an **asset-class boundary** — crypto logic reaching xStock data or the reverse?

---

## 7. THE DELIVERABLE

One document in `C:\DawnTrader-Codex\out\`, written to be read as a whole.

**At the top:** the output of `git rev-parse HEAD` and `git status --porcelain` (see the header block), then **a POSITIVE ENUMERATION of what you actually read, by path.**
⛔ **r2, Langston's inversion, and he is right: r1 asked what you did NOT reach — which is itself an asserted absence and the easiest thing in the whole document to under-report.** **List what you READ. We derive the complement ourselves**, against a file list we already have. An honest coverage statement is worth more to us than the appearance of completeness, and it makes us trust the rest of the document more.

**Then the systematic findings, most important first.** For each:
- what the flaw IS, in one sentence, at the level of a pattern rather than an instance
- the instances that evidence it, with `path:line` at the audited commit
- **what would falsify it** — if nothing would, it is an opinion, and say so
- your confidence, and what would raise it
- a proposed disposition: is this a real defect, something working as designed that needs a DECISION rather than a fix, or legacy that no longer fits current intent? **Those three are genuinely different and we never collapse them.**

**Then a short section of things you could not settle** and what evidence would settle them.

⛔ **Do not propose code — and the reason is not caution.** *(r2, Langston corrected my reasoning and narrowed the ban by one carve-out.)* **You cannot run the code or see the data, so a patch from you is an unverifiable claim about a fix**, and one arriving beside a finding pressures us to skip the review that catches errors.
✅ **THE CARVE-OUT, and it is the most useful thing you can hand us: GIVE US THE FALSIFYING QUERY OR COMMAND, in executable form, wherever one exists.** §7 asks what would falsify each finding; where that is a SQL query, a grep, or a log read, write it out so we can run it. **That is evidence machinery, not a patch, and it is explicitly wanted.**

---

## 8. ASKING QUESTIONS

You will need things you cannot reach — live data, runtime behaviour, why a decision was made. **Ask.** A question is cheaper than a wrong assumption, and an assumption you make silently is the one that will invalidate a finding.

Write questions to `C:\DawnTrader-Codex\out\QUESTIONS.md`, numbered, each stating **what you would do differently depending on the answer.** A question whose answer changes nothing is not worth asking; one that would redirect a whole line of inquiry should be asked immediately rather than saved up.

Answers come back in the same folder. **Do not block on a question** — carry on with everything that does not depend on it and record the assumption you proceeded under.

---

## 9. WHAT WOULD MAKE US CONSIDER THIS AUDIT A SUCCESS

Not a count of findings. **One structural insight we had not seen, evidenced well enough that we can act on it, would justify the whole exercise.** Second best is a well-evidenced statement that a part of the system we are anxious about is actually sound — a negative result honestly arrived at is genuinely useful here and we will not treat it as a failure.

⛔ **The one outcome we do not want is a long list of confident findings that turn out to be decisions we already made.** §4(e) exists to prevent exactly that. Use it.
