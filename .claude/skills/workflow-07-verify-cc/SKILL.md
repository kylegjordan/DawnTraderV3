---
name: workflow-07-verify-cc
description: STEP 7 ONLY of the DawnTrader batch workflow - first-pass verification by the implementing Claude session. Use when gathering evidence that a deployed change works - PM2 logs, Supabase queries, and mandatory navigation of the staging UI in a browser. NOT for Langston second-pass verification, which is step 8.
---

# STEP 7 — FIRST-PASS VERIFICATION (CC)

**Ends when:** evidence is captured **and the UI has been navigated**.

## ⛔ "STAGING VERIFIED" MEANS UI-NAVIGATED, NOT CURL-CHECKED
It is **NOT** satisfied by a successful API curl, a psql row count, a PM2 log line, or a build + restart. Those are backend health checks — **they do not prove the panel renders, that values are not showing as "--", or that the layout is not broken.**
**Requires:** navigate the staging URL in the browser, read the actual DOM, cross-check rendered values, screenshot where useful.

## ⛔ UI VERIFICATION IS THE DEFAULT, NOT AN EXTRA
With active trading on, **most changes have a staging-visible surface.** For any change with one, load the affected tabs and verify it renders and behaves. **"Working in the background but not showing on the front end" is a failure state Kyle cannot detect.**
**If there is genuinely no UI surface, SAY SO AND SAY WHY** — state the judgement rather than skipping the step.

## ALSO
- PM2 logs, psql, CI status, server health — **as well as**, not instead of.
- ⚠️ **The application log retains only a couple of hours.** An empty grep over an older window proves nothing; **state the window the instrument actually covers.**
- **Every issue Kyle raises gets reproduced, located in code, and quoted from real data** — never dismissed, never marked N/A without evidence.

## ⛔ VERIFY THE THING THAT CHANGED, WITH THE INSTRUMENT THAT SHOWED THE PROBLEM
**"The server came back up" is not verification. Neither is "no errors in the log."**
- **Re-run the SAME measurement that established the problem.** A different instrument showing a different number proves nothing about the change; **the same instrument, before and after, is the only comparison that carries.**
- **PROVE THE INSTRUMENT FIRST.** Run it where you already KNOW the answer — the positive control — before reading its silence as good news. *(Three log-filter tests read as PASS while processing nothing at all: a missing header meant every line was silently dropped. It was caught only when a known-good line also produced nothing.)*
- ⛔⛔ **A POSITIVE CONTROL MUST MATCH THE POPULATION’S *SIZE*, NOT ONLY ITS *STREAM* (Langston, 2026-08-23).** A fixture drawn from the right source but the wrong SHAPE passes while the real thing fails. **MEASURED:** an alert-routing fix was proven with six hand-written controls — correct stream, correct field, all passing — and shipped a mechanism that could not execute on **99.5%** of real traffic, because the controls were a few hundred characters and the real bodies have a **median of 2,289**, putting the matched token past a 400-char truncation. **Re-run against the REAL population: old code routed 4 of 1,026; the fix routes 1,018.** ⇒ **Before trusting a control, ask what the real inputs LOOK like — length, position, multiplicity — and draw at least one fixture from the actual data.**
- ⛔ **TESTING THE FILE IS NOT TESTING THE PROCESS.** A running service holds the code it started with. **Verifying a fixed file proves the file; it says nothing about the process still running the old one.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). This step IS the object-check — but apply it to your own evidence too: **prove the instrument on a known answer, and confirm your fixtures match the real population’s SIZE, not just its source.**
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM, DO NOT SIMULATE STATELESSNESS — PRODUCE IT (Langston ruling, 2026-08-27)
⛔ **A SESSION CANNOT REVIEW ITS OWN WORK STATELESSLY, AND WILL REPORT THAT IT DID.** *(Langston: "a session verifying its own statelessness would have to compare against the state it is claiming not to have" — the instrument that cannot fail.)* ★ **What makes HIM catch things is not discipline, it is a PROCESS BOUNDARY: a fresh process holding only what it was handed.**
⇒ **For a number, a cause, or a completion that this step rests on: spawn a fresh-context reviewer and hand it ONLY THE OBJECT AND THE CLAIM.** ✅ **STANDING APPROVAL — KYLE, 2026-08-27: spawn them for load-bearing claims at ANY point in the workflow, no permission needed.** ⚠️ **This line previously read *"Kyle must approve spawning one"* — MINE, and it turned the mechanism into a request. MEASURED CONSEQUENCE: it was written into four skills and SPAWNED ZERO TIMES in two days, including on the dispatches whose errors it was built to catch.** ★ **A rule that cannot be executed without asking is worse than no rule — it reads as covered.** *(Never call it a "process boundary" to Kyle; it is "a second reader who was never in the room.")*
★★ **ASK IT ONE THING, AND NOT THE OBVIOUS ONE:** not *"does this support the claim?"* but **"WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — handed a directory listing for *"the key was dropped"* it answers *present / absent / empty* **without needing to know the right file. The ASK reaches wrong-object; a yes/no handoff cannot.**
⛔ **SCOPE IT TO THAT ONE OUTPUT — never a disposition, never true/false.** The moment it rules on the conclusion it is guessing from a stub.
⚠️ **THE LIMIT THAT WILL BITE, and it is Langston’s own measured case: a fresh context is blind to context it NEEDS, not only to context it should ignore.** He vacated a ruling of his own because a fresh invoke could not see his three earlier ones. **Hand it your SUMMARY and it reviews your summary — the same failure one level down.**

★★ **TWO MODES, AND MODE B IS MANDATORY FOR A MECHANISM CLAIM OR AN ABSENCE CLAIM (Langston condition (ii), 2026-08-27).**
| mode | you hand it | use for |
|---|---|---|
| **A** | the **object + the claim** | *"is this number right"* — cheap, and cheap is fine here |
| **B** | ★ **THE CLAIM ALONE** — *"name the objects that would settle this, then: what other states of the world are consistent with them?"* | ⛔ **MANDATORY: any MECHANISM claim and any ABSENCE claim** |
★ **WHY B EXISTS — IT MOVES THE OBJECT SELECTION ACROSS THE BOUNDARY, WHICH IS THE HALF MODE A CANNOT REACH.** In mode A **you** still choose what to hand it, and **a fresh reviewer handed the ADJACENT object returns a clean, confident, useless verdict.** ⚠️ **Langston’s own #675 retraction is the proof: his failure was not misreading the file, it was believing that file WAS the object.** A reader given only the claim must go and find it.
★ **WHAT DOES NOT CROSS THE BOUNDARY, and it is smaller than it looks: the CLAIM FRAME** — whether that was the right question at all. **A wrongly-framed claim is on the page and auditable; a wrongly-chosen object never was.** That residual is Langston’s, as the outer boundary.

⛔⛔ **A HIT IS A LEAD; A CLEAN IS NOT EVIDENCE (Langston condition (i), and it is the asymmetry that licenses the whole mechanism).**
- **A reviewer HIT must be RE-DERIVED at the ref, with a control, before it moves anything.** Same standing as his `langston-recall` §19.
- ⛔ **A reviewer CLEAN may NEVER be cited as support for a claim — not in a scope, not in a report, not to Langston.** *"The reviewer found nothing"* **is not evidence and he will bounce it as one.** ⚠️ **This is #453: a silence is not an absence.**
- ⛔ **EVERY SPAWN LEAVES A ONE-LINE RECORD where its finding lands** (the §9.4 disposition slot is the home): **`REVIEWER: <object handed | claim-only> · <question> · <verdict> · re-derived y/n`**. ★ **WITHOUT A DENOMINATOR THE BAR CAN NEVER RISE ABOVE "one run"** — we would be arguing from anecdote in a month, **with no way to tell a mechanism that works from one that is simply not firing.** *(That is exactly how the gated version read as covered while spawning zero times.)*

⛔⛔ **AND IT IS A LOOP, NOT A ONE-SHOT (Kyle, 2026-08-27).**
> **you produce the claim → fresh reviewer → CORRECT what it calls out → hand the corrected version BACK to a fresh reviewer → repeat until IT SAYS ITS OWN CALLED-OUT ITEMS ARE SATISFIED → only then dispatch to Langston.**
★ **WHY THE SECOND ROUND IS THE POINT: THE CORRECTION IS ITSELF UNREVIEWED WORK**, written by the same session, in the same context, that produced the error. **An uninspected correction is exactly as likely to be wrong as the thing it replaced.** ⚠️ **Each round gets a FRESH reviewer** — one that has seen your earlier draft has rebuilt the memory-of-forming-the-belief the boundary exists to remove.

✅ **WHAT THE END OF THE LOOP MEANS — KYLE’S OWN WORDS, AND IT IS NARROWER THAN IT SOUNDS: *"that is the best version of what they can put forward in front of Langston."*** ⛔ **IT IS NOT A CLAIM THAT THE FINDING IS CORRECT.** The loop closes when **the reviewer’s OWN called-out items have been satisfied** — nothing wider. **Langston still pokes holes in it, and is expected to.**
⇒ ✅ **NO CONFLICT WITH THE HIT/CLEAN ASYMMETRY ABOVE:** the loop decides **WHEN YOU STOP ITERATING**; it never decides **WHETHER YOU ARE RIGHT.** ⛔⛔ **AND IT IS ENFORCED BY A DELETION TEST, NOT BY BANNING A PHRASE (Langston, 2026-08-28 — he struck my phrase ban and he is right).**
⚠️ **A PRESSURED SESSION WILL NEVER TYPE *"the reviewer agreed."* IT WILL TYPE *"three rounds, converged"* or *"high confidence after iteration"* — identical warrant, none of the banned words.** ★ **A phrase ban polices a STRING; the inference routes around strings.** *(Same shape as rule 29’s own origin: the rule fires at announce time, the failure happens before it.)*
✅ **THE TEST, and it runs in ten seconds: STRIKE EVERY MENTION OF THE LOOP FROM THE DISPATCH. If the finding still stands on its own citations — object, population, mechanism-with-line — dispatch it. If anything sags, it was never a finding.** ⛔ **The round count is not evidence either.**

⛔⛔ **TERMINATION REQUIRES AN *OBJECT* ROUND — A `claim-only` CLEAN MAY NOT CLOSE THE LOOP (Langston).** ★ **A reviewer that never reached the artifact is SILENT WITH ZERO OPPORTUNITY** — #661 leg 3, applied to a reader instead of an instrument. **The last round reads the object at the ref, or you polled rather than iterated.**

⚠️ **TWO WAYS THE LOOP FAILS:**
1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Verification`**.
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

7. **First-Pass Verification (CC)** — Check PM2 logs, psql to Supabase, UI via Claude-in-Chrome, CI status, server health. Capture evidence.
