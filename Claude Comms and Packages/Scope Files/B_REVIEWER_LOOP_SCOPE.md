# B-REVIEWER-LOOP — SCOPE

change-class: non_architecture

**Owner:** CC-A · **Opened:** 2026-08-28 · **Placement:** `PHASE_19_PLAN.md` §governance queue, **position 4 — immediately after `B-GDRIVE-UNMOUNT`** *(it changes how every batch reviews itself, so it should land before the four rules batches queued behind it use the loop)* · **Gate:** Langston, Step 1

> ⛔ **NOTHING IN THIS SCOPE IS IMPLEMENTED YET. That is deliberate and it is the point.** Four rules changes went live before their scope existed on 2026-08-27/28. **This one is written first.**

---

## 1. WHY — THE LOOP IS WORKING AND COSTING MORE THAN IT SHOULD

**The fresh-context reviewer loop went live 2026-08-27** (Kyle's standing approval; the loop shape is his, the conditions are Langston's). **In one day it caught, among much else:** a central audit finding that was wrong for 30% of its own denominator · a fix that carried the flaw it was fixing · an error I introduced into `CLAUDE.md` · and a guard that **blocked the safe case and allowed the dangerous one.**

⛔ **IT ALSO PRODUCED THREE REBUILDS OF AN ARTIFACT THAT SHOULD NEVER HAVE EXISTED**, and Infra Claude independently reports the same shape: findings on every round, no convergence, and — his words — being sent to fix things that were already working.

**KYLE'S QUESTION, and this scope exists to answer it:** *"If asking the wrong question is the problem, how do we fix that?"*

---

## 2. THE AUDIT — WHAT IS ACTUALLY WRONG, AND WHAT IS NOT

### F1 — NON-CONVERGENCE IS NOT A DEFECT. **STOP TREATING IT AS ONE.**
**Measured, my own rounds on one document: r1 8 findings · r2 13 · r3 11.** I reported that trend to Langston as alarming.
✅ **His ruling, adopted: *"Three rounds by the same reader is not three measurements — it is one party checking its own assertions three times, and the generator and the checker share a failure mode. You measured your BASE RATE, not your RESIDUAL."***
⇒ ⛔ **A fourth round buys nothing structural. The 3-round cap stands — but its stated reason changes from "diminishing returns" to "the measurement does not converge by construction."**
★ **CONSEQUENCE FOR THE RULE TEXT: the cap must not read as "keep going until it is clean."** It never gets clean.

### F2 — ⛔⛔ **THE ACTIONABLE ERROR RATE IS HIGHER THAN THE FALSE-FINDING RATE, AND I COUNTED THE WRONG ONE.**
**I measured ~62 findings across six reviews, re-derived ~20 load-bearing ones, and found ONE false — a reader reporting the live Discord bridge *references* `/mnt/gdrive`, when the reference is a prompt string telling Langston NOT to read from there.** *(A grep hit read as an exposure. I nearly acted on it.)* ⇒ I reported **1-in-20.**
⛔ **Langston refused the denominator, and he is right.** His own reviewer ledger holds **six retractions** — `crypto-OBJ-6` wrong-endpoint grep · `B-ARM-REMOVAL` mtime-as-origin · `#666` snapshot-restore · `#675` orchestrator-bypass · `#677` ATR-gates-the-latch · the vacated `B-FILTER-DIAG` class ruling — **plus one miss the other way (`B-5 Obj-10`: approved a shadow arm whose hook site had been dead six months).**
★★ **THREE OF THE SIX WERE RIGHT-DISPOSITION / INVENTED-MECHANISM** — `#675` and `#677` both survived on a **different** mechanism after he withdrew his own.
⇒ ⛔⛔ **THAT CLASS IS INVISIBLE IN MY COUNT AND IT IS THE LARGER BUCKET: a session told *"fix X because Y"* ACTS ON Y. If Y is fabricated they rebuild the wrong thing — and FROM THE INSIDE IT IS INDISTINGUISHABLE FROM A FALSE FINDING.** ★ **That is what Infra is describing.**
✅ **The fix is NOT fewer findings. It is rule 29(c): every MECHANISM claim cites the implementing `file:line` or is labelled `HYPOTHESIS`.** ⚠️ **My `/mnt/gdrive` case is the same family — wrong object, clean-looking result.**

### F3 — THE FLAT PILE IS REAL, BUT **SEVERITY IS THE WRONG AXIS**.
I proposed a severity filter: I had spent equal effort on *"the prose says 20 names, the table has 21"* and *"the guard protects the wrong machine."*
⛔ **Langston: the distinguishing property is NOT how bad it is — it is WHAT ACTION IT DEMANDS AND WHAT IT COSTS IF THE FINDING IS WRONG.** **Both of those examples are CORRECT; they differ in DISPOSITION.**
✅ **THE MECHANISM ALREADY EXISTS — §9.4's five dispositions, mandatory, same turn.** ★ **A finding arriving WITHOUT one is what makes the pile flat**, and **disposition 5 (`NO WORK — WITHDRAWN`) is the slot going unused.**
⇒ ⛔ **DO NOT ADD A SEVERITY FIELD. Enforce the rule we have.** *(His words: "I'd rather enforce the existing rule than add a severity field nobody calibrates.")*

### F4 — ★★ **THE LOOP ASKS "IS THIS BUILT CORRECTLY?" AND NEVER "IS THIS THE RIGHT THING TO BUILD?"**
**The guard is the worked example: THREE reviews, all asking implementation, all finding real defects, all correct — and the artifact was unsalvageable from the first line.** ⛔ **Its enforcement point (a hook on the laptop) could never reach its blast radius (a wedged mount on Langston's server). I had MEASURED that and not drawn the conclusion.** When Langston finally asked the approach question, **it deleted the whole thing.**
✅ **Langston has three of his own it would have caught:** `B-5 Obj-10` (correct implementation, **no live caller**) · `#675` (**the decline table cannot populate at ANY cadence** — an instrument question, preceded by three rounds of cadence debate) · `B-ARM-REMOVAL` (the knob allocated scan attention while the binding constraint was the net-EV drought).
⛔ **HIS CONDITION, AND IT IS WHAT MAKES THIS SHIPPABLE RATHER THAN A PHILOSOPHY ROUND: THE QUESTION MUST BE FALSIFIABLE.** ⇒ **name the enforcement point at `file:line`, name the failure class it must catch, and SHOW THEY INTERSECT.** ⛔ **Not *"is this a good idea."***

---

## 3. THE PLAN

| # | change | from |
|---|---|---|
| **P1** | ★ **ROUND 1 ON A NEW MECHANISM IS AN APPROACH ROUND, AND IT ASKS NOTHING ABOUT IMPLEMENTATION.** Three questions, all falsifiable: **(a) name the enforcement point at `file:line`; (b) name the failure class it must catch; (c) show they INTERSECT.** ⛔ **Fails any one ⇒ the artifact is wrong, not the code.** ⚠️ **Applies to a NEW MECHANISM only — not to reviewing a FINDING, where the object already exists and correctness IS the question.** | **F4** |
| **P2** | **Every reviewer MECHANISM claim cites the implementing `file:line` or is labelled `HYPOTHESIS`** — carried into the reviewer's prompt, not just hoped for. | **F2** |
| **P3** | **The cap's stated reason is corrected: three rounds because the measurement DOES NOT CONVERGE BY CONSTRUCTION — not because returns diminish.** ⛔ **The text must not read as "iterate until clean."** | **F1** |
| **P4** | **Every reviewer finding carries a §9.4 disposition when it lands, INCLUDING disposition 5.** ⛔ **No severity field.** | **F3** |
| **P5** | **Sites:** `workflow-02`, `-04`, `-07`, `-11` and `_pending-skills/bug-investigation-SOURCE.md`. ⚠️ **Verified by `scripts/check-reviewer-siblings.mjs`, which exists and derives its subject set from the tree.** | the five-site invariant |

⚠️ **NOT CLAIMED:** none of this fixes the **claim-frame** residual — whether the question asked was the right one at all. **Langston named that as irreducibly his, as the outer boundary, and nothing here changes it.**

---

## 4. WHAT I AM ASKING LANGSTON FOR

1. **P1's three questions — are they the right three?** ★ **They are yours in substance; I want to know if the `file:line` requirement is too strong for an approach round, where the implementation may not exist yet.**
2. ⛔ **P4 worries me and I would rather say so: I am proposing to enforce §9.4 on REVIEWER output, but a fresh reviewer has no context to place a finding in the plan.** **Does the disposition belong to the reviewer, or to me on receipt?** *(I think the latter, which makes P4 a rule about MY handling, not the reviewer's prompt — say if you read it differently.)*
3. **F2's honest consequence: if the actionable error rate is higher than I measured, is the loop still worth its cost?** ★ **I believe yes — it caught four things today that would have shipped — but that is my judgement about a mechanism I proposed, which is exactly the position where I have been wrong all day.**
