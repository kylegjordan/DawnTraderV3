# ASSIGNMENT 4 — WHAT WE DID WITH YOUR FINDINGS, AND WHAT NOBODY HAS LOOKED AT (draft r1 — CC-C, awaiting Langston)

> ⛔ **STATUS: DRAFT. NOT DISPATCHABLE.** Two things are outstanding: **Langston's ruling on which §4 topics are genuinely still open** (see §4's own warning), and **his additions**. Kyle directed the co-draft 2026-09-07.
> ✅ **The pricing assignment is SEPARATE and goes out on its own** (`CODEX_PRICING_ARCHITECTURE_BRIEF.md`). **This one must not absorb it** — that brief asks you to disagree with one specific proposal, and mixing five topics into it would buy five shallow answers.

---

## 1. ⭐⭐ WHY THIS IS NOT ASSIGNMENT 1 AGAIN — READ THIS FIRST

**Assignment 1 asked you to look at a system you had never seen, and we handed you a list of places we had historically been wrong.** You found things. Some we fixed. **This assignment is the follow-through, and it is a different question in three ways:**

1. ⭐ **YOU NOW KNOW THE SYSTEM.** The expensive part — orientation — is paid for. **Do not re-spend it.**
2. ⭐⭐ **WE CAN NOW BE GRADED ON WHAT WE DID WITH WHAT YOU FOUND.** That is the first ask, and it is the one we cannot do ourselves without marking our own work.
3. ⭐⭐ **AND THE MOST VALUABLE THING YOU PRODUCED LAST TIME MAY NOT HAVE BEEN A FINDING.** See §2.

---

## 2. ⛔⛔ FIRST, BEFORE ANYTHING ELSE — **THE BLIND-SPOT DELTA. RETRIEVE IT, OR REPRODUCE IT.**

**Assignment 1 asked you to write your own questions into `notes\my-questions-before-section-6.md` BEFORE reading our list of things worth attacking, and then to record the difference BOTH WAYS** — what we listed that you would not have asked, and **what you asked that we did not list.**

★★ **THE REASONING, unchanged and worth restating: a map of the blind spots we already know about is, by construction, not where our blind spots are.** **That delta is the single artifact we cannot produce ourselves at any price.**

⚠️ **WE CANNOT FIND IT.** It is not in our repository. **We are not asserting you never produced it** — you write to your own folder and our instrument does not reach there. **Two branches:**
- ✅ **IF IT EXISTS: send it back first, before doing anything else in this brief.** Even unchanged, even if you now think some of it was wrong. **The stale version is still evidence about us.**
- ✅ **IF IT DOES NOT: reproduce it now, and the instruction is the same** — write your own list of what you would go after in this system, **from what you now know and before reading §4 of this document**, then read §4 and record the delta both ways.

⛔ **DO NOT SKIP THIS BECAUSE §4 IS RIGHT THERE.** Reading our list first destroys the measurement permanently and it cannot be recovered by trying to un-know it.

---

## 3. ⭐ THE OBJECTIVE — UNCHANGED, AND EVERY RECOMMENDATION SERVES IT

> **Find the best way for this system to trade as profitably as possible, and as fast as possible, within the risk limits its owner has set.**

**The risk limits are hard boundaries, not dials.** If growth and risk tolerance conflict, risk tolerance wins. **Never recommend loosening a risk control to improve returns.**

---

## 4. ⏳ THE TOPICS — **STATUS UNVERIFIED BY US; LANGSTON RULES BEFORE DISPATCH**

⛔⛔ **A WARNING THAT IS OURS, NOT YOURS, AND WE ARE STATING IT BECAUSE IT WOULD OTHERWISE WASTE YOUR TIME: WE HAVE NOT ESTABLISHED WHICH OF THESE ARE STILL OPEN.** Some may have been fixed since. **A keyword sweep of our own ledger is weak evidence in both directions — a term being present does not mean the topic is covered, and its absence does not mean it is open, because we may have addressed it under different words.**
⇒ ⛔ **THIS SECTION DOES NOT SHIP UNTIL LANGSTON HAS RULED EACH LINE OPEN, CLOSED OR PARTIAL.** *(Placeholder markers below are `⏳` until he does.)*

### 4.a THE FOLLOW-THROUGH — grade us on your own findings
- ⏳ **Take each finding from your earlier assignments and tell us what we ACTUALLY did with it.** Fixed / partially fixed / recorded and not acted on / misunderstood the finding and fixed something adjacent.
- ⭐ **THE LAST CATEGORY IS THE ONE WE MOST NEED AND ARE LEAST ABLE TO SEE.** We have a measured habit of fixing the object next to the one the finding was about.
- ⏳ **And where we recorded a finding as *"working as designed, needs a decision"* — say whether you think that classification was honest, or a way of not acting.**

### 4.b THE MACHINERY QUESTIONS NOT COVERED BY THE PRICING WORK
- ⏳ **DO WE ACT ON WHAT WE COMPUTE?** For every market-condition quantity computed at pair or global level, name the read sites and **show a decision that changes with the value.** *(Two cases of computed-and-never-consumed were already found.)*
- ⏳ **THE FAVOURABLE-ASSUMPTION CENSUS.** Enumerate every assumption in the fill, fee and exit models that **favours us**, and bound each one. **Not "are the simulations realistic" — that is unanswerable while we have zero live fills.**
- ⏳ **IS ANYTHING DONE TWICE BY TWO MECHANISMS?** We ran a duplicate execution path for seven months through two audits, because **tracing forward from one entry point structurally cannot discover a second entry point.** Enumerate entry points before tracing.
- ⏳ **WRITTEN-BUT-NEVER-READ, AND READ-BUT-NEVER-WRITTEN.** Both are real defects here and both have bitten us.
- ⏳ **WHERE DOES THE SYSTEM FAIL OPEN ON PARTIAL FAILURE, AND IS THAT THE RIGHT DIRECTION EACH TIME?** We have a hard rule that a database-governed setting must fail LOUDLY when absent rather than silently defaulting.
- ⏳ **HARDCODED CONSTANTS MAKING DECISIONS THAT SHOULD BE DATABASE-GOVERNED — AND THE INVERSE:** a path that reads as live in the code but is switched OFF by a setting, or a code "default" that is never the live value.
- ⏳ **REGIME DETECTION AT THE BOUNDARIES.** Does it do what the System Manual says, including between regimes? **Is any threshold applied to a number derived from a different population than the one it was calibrated on?**
- ⏳ **SHARED MUTABLE STATE AND RACES** — who writes, who reads, can they collide.
- ⏳ **ASSET-CLASS BOUNDARY CROSSINGS** — crypto logic reaching xStock data or the reverse.

### 4.c ⛔ AN OPEN ITEM YOU FOUND THAT IS STILL WAITING ON A HUMAN DECISION
**Your first audit found that our checked-in schema declares a different unique index than the live database holds, under the same name.** We re-derived it, confirmed nothing is broken today, and **recorded that a fresh environment built from our repository would break.** ⇒ **It is unresolved because it needs an owner's decision, not because it was disbelieved.**
⏳ **If you have a view on the second half — whether two assets sharing a canonical symbol should be one identity or two at every queue operation — say so.** *(Awaiting Kyle; may be resolved before dispatch.)*

---

## 5. ⛔ HOW WE WANT IT ANSWERED — VERIFY, DO NOT ACCEPT

**You have the repository. Where we state something, check it.** Where we cite a file and line, open it. Where we claim a census, **re-run it and satisfy yourself the search could have found a counterexample.**

**Three standards we hold ourselves to and ask you to apply:**
- **An asserted absence needs presence-evidence.** Before accepting *"nothing does X"*, satisfy yourself the search could have found an X.
- ⛔ **A zero with more than one sufficient cause is not evidence for any one of them.** Cite the mechanism, not the zero.
- ⛔ **NAME THE OBJECT AND THE POPULATION FOR EVERY NUMBER.** A count with no stated denominator is a claim, not a measurement.

⛔⛔ **AND WE ARE DELIBERATELY NOT TELLING YOU WHICH OF OUR CLAIMS WE SUSPECT.** *(The owner's ruling, and we think he is right: pointing you at our own doubts steers your search, and a search steered by our doubts can only find what we already doubt.)* **Check what the code tells you, not what we flag.**

---

## 6. WHAT WOULD MAKE THIS A WASTE

- **Re-finding what you already found.** §4.a exists so you do not have to.
- **A list of everything that could be improved.** We want the few things that would change what this system earns, ranked, with the reasoning we can re-derive.
- ⛔ **Confirming us.** A review that only agrees is a review we wasted. **Where you think we are wrong, say so plainly and say what you would do instead.**

---

## 7. HOW TO RETURN IT
**§2's delta first, on its own.** Then §4.a as a table — finding, what we did, your verdict. Then the rest, **ranked by how much it would change the answer to §3's objective**, each item citing the file and line you checked. **Where you could not establish something, say so** — an explicit *"I could not establish this"* is worth more to us than a confident guess, and that standard applies to us as much as to you.
