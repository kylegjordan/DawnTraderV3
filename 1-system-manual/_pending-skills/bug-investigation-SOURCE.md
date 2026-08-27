# BUG-INVESTIGATION SKILL — SOURCE TEXT (staged, not yet built)

> **This is CLAUDE.md rule 24 + 24.a, moved here VERBATIM by B-CONDUCT-FILE Step-3 on 2026-08-20.**
>
> ⛔ **WHY THIS FILE EXISTS RATHER THAN A DELETION.** The scope's disposition for rule 24 is
> *"→ SKILL: conduct keeps ONE trigger line; 5.3 KB out for one sentence."* But the skills build is
> explicitly **OUT OF SCOPE** for this batch (scope §8 — it belongs to 1d). Removing 5.3 KB of live
> rule into a skill that **does not exist yet** would leave it operationally lost between the two
> batches, with only git history as its home — which is exactly the absent-as-valid failure this
> codebase keeps paying for, and it would breach scope §7(c) (*every moved rule findable at its new
> home; nothing deleted*).
>
> **The behavioural core — the trigger, the three outcomes, and Kyle's named fear — is LIVE NOW in
> `CONDUCT.md` §9, and the announce discipline in §8.** What is staged here is the full protocol:
> the provenance binding (24.0), the evidence standard, and the origin cases.
>
> **B-RULES-1d builds the skill FROM THIS FILE and then deletes it.** Until that lands, this is the
> authoritative long-form text and `CONDUCT.md` §9 points at it.

---

24. **THE BUG TAXONOMY — "that's a bug" is a hypothesis, not a verdict (Kyle directive 2026-07-18, standing rule for ALL THREE Claudes; the fix-on-find rule 23's front door).** Every apparent bug, error, or legacy find gets at most a few seconds of "it's broken" before the verification work starts: **FIRST PRINCIPLES = DIG THROUGH THE CODE** (Kyle: the code itself will make it stick out clearly whether it's malfunctioning or functioning as intended — don't rely on situational instinct), then the SIM, the Phase-19 active-trading-path audit, every informing doc, and the **INTENT of the system we're building NOW** (five-plus months of change means older code is judged against today's design, not its own era). **THREE outcomes, never collapsed into one:** (1) **real defect** → root-cause fix through the full workflow, no patch; (2) **working-as-designed-but-UNADDRESSED** → the system is fine; what's missing is a DECISION on how it should handle that situation — that's a SCOPE CALL (an options paper to Kyle, never unilateral code); (3) **legacy that no longer fits intent** → adapt it to today's system or remove it cleanly per rule 18. **Kyle's named fear this rule exists to prevent: "fixing" behavior that was working perfectly and injecting new bugs we then spend days chasing** — collapsing outcomes 2/3 into outcome 1 manufactures exactly that. Rule on code + intent, not first impression. And CHECK EACH OTHER — including pushing back on Kyle himself with reasons; he has asked for it explicitly and will yield when wrong. Origin cases: the xStock weekend-shutdown alerts (an obvious cause a system-state check names instantly) and the #530 pattern-DBS find (the DBS WAS computed — dropped in transit; only the thorough review distinguished the two).

    **★ 24.0 — THE PROVENANCE READ IS NOT ONLY A SCOPE OBLIGATION; IT BINDS EVERY FOUND BUG, ONE AT A TIME (Kyle directive 2026-07-30, closing the gap between §2 1.b and this rule).** §2 1.b binds a BATCH to read the history and original intent of what it touches. Rule 24 says judge on code + intent. **Kyle's directive joins them explicitly, because the seam between them is where things were slipping: EVERY bug / error / misfunction you FIND — including one surfaced mid-batch, by an alert, by a review, or in passing — gets its OWN history-and-intent read BEFORE you judge it, and the judgment then states which of rule 24's three outcomes applies.** Verbatim: *"scope every batch and every found bug/error/misfunction by investigating the history and historical intent. Then judge if it is still an error or something that needs to be updated."* ⇒ **a find is not dispositioned by reading only the code that is there today.** The tiering of §2 1.b still applies (full provenance where BEHAVIOUR changes; a one-line intent note where merely read). **Why it earns its cost — the case that produced it:** a live route substituting an absent field looked like a defect on the code alone, and the intent read showed the substituted field is an ANCHOR that deliberately does not track P&L, so the number is CORRECT today — and that the obvious "fix" to a loud neighbouring alarm would have broken it. **Code-only reading would have inverted the disposition.**

    **★ 24.a — INVESTIGATE BEFORE YOU ANNOUNCE (Kyle directive 2026-07-22; Langston-approved).** **ANNOUNCE THE SYMPTOM FREELY; ANNOUNCE THE CAUSE ONLY AFTER ITS REACH IS TESTED.** A symptom is an OBSERVATION and costs nothing to be wrong about ("the exit monitor is skipping ticks on CDNS" — say it at once). A **cause is a CLAIM, and a claim sends people to work.** Restrain causes, never observations — otherwise this rule produces the opposite failure, people sitting on what they have seen.
    **Before announcing a cause, do THREE things:** (1) **check its ARITHMETIC against the symptom** — can that endpoint fire every 5s? does a 15-min window contain a 15.4-min-old row? does the function you verified against even appear on this call path? *(seconds each; each has overturned a confident wrong answer)*; (2) **read the code**; (3) **★ READ THE IMPLEMENTATION'S HISTORY AND INTENT** — find the batch/commit that built it, what it was built to do, and why. **The system may have changed since that intent was set, in which case the SYSTEM may need to change — but you cannot tell that apart from a defect without knowing the original intent.** **CITE the history and the intent in the finding itself.**
    **THE EXCEPTION — active trading, requiring an immediate stop, OR actively causing irreversible loss (capital, or corruption of live/training data) → ANNOUNCE AT ONCE.** Speed beats certainty when a position is exposed or damage compounds. **If in doubt, announce.**
    **What you do announce still meets this rule's read-the-code bar and carries its citations** — quiet must never mean unaudited. **Why:** on 2026-07-22 eleven defect claims were announced and retracted in one day across all three sessions; each pulled peers into work that evaporated, and left Kyle unable to tell a real break from a false alarm. A retraction does not undo the cost. Evidence + full tally: `Claude Comms and Packages/Langston Design Asks/B_GOV_INVESTIGATE_BEFORE_ANNOUNCE_PROPOSAL.md`.

---

## ★★ BEFORE A FINDING LEAVES YOUR HANDS — A FRESH READER CHECKS IT (Kyle directive 2026-08-27)

⛔ **THIS IS NOT OPTIONAL AND IT IS NOT ONLY FOR WORKFLOW STEPS. Kyle: *"after a session has investigated and thinks they have a finding — where they have a solution or an understanding of whatever it is they're investigating — then that should also go through the subagent review process."*** ✅ **Standing approval granted the same day: spawn one without asking.**

**WHY AN INVESTIGATION NEEDS IT MORE THAN A STEP DOES:** by the time you have a finding you have built a story, and **re-reading your own reasoning tests the story against your memory of forming it — which is exactly as wrong as the story.** A reader with no memory of forming the belief cannot do that.

**HAND IT ONLY THE OBJECT AND THE CLAIM.** ⛔ **Not your summary — hand it your summary and it reviews your summary, the same failure one level down.**
★★ **ASK IT ONE THING, AND NOT THE OBVIOUS ONE:** not *"does this support my finding?"* but **"WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — that question reaches the wrong-object error; a yes/no cannot.
⛔ **SCOPE IT TO THAT ONE OUTPUT.** Never a disposition, never a verdict on the finding. The moment it rules on your conclusion it is guessing from a stub.
⚠️ **AND ITS LIMIT, which is Langston’s own measured case: a fresh context is blind to context it NEEDS, not only to context it should ignore.** He vacated a ruling of his own because a fresh invoke could not see his three earlier ones.
