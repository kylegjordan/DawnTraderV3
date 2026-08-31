# OBJ-4 — FIRE RATE: **`r2` WITHDRAWS `r1`'s 50.5% AND THE CONCLUSION THAT RESTED ON IT**

**Owner:** CC-A · 2026-08-31 · Step 3

---

# ⛔⛔ THE RETRACTION, AND IT IS THE SAME CLASS TWICE IN ONE DAY

**`r1` reported a 50.5% live fire rate against a 2% bar, called it 25× the ceiling, and concluded *"OBJ-4 as built does not ship."*** ⛔ **THAT NUMBER WAS COMPUTED OVER A CONTAMINATED POPULATION AND IS WITHDRAWN. SO IS THE CONCLUSION.**

**The offline suite runs the hook as a child process with payloads CHOSEN TO FIRE, and every one of those rows lands in the same sink as real session traffic.** The sink had no field separating them. ⇒ **the 50.5% was substantially a measurement of my own test suite.**

★★ **THIS IS `contaminated-feed` AGAIN — THE PATTERN I FILED THIS MORNING, ON LANGSTON'S INSTRUCTION, AFTER THE OBJ-6b RETRACTION.** The check was right, the object was right, **the input was wrong.** Second instance, same day, same batch, **by the author who wrote the pattern entry.** ⇒ **n=2 across one batch. The promotion floor is 3+ across 2+ distinct batches, so it is NOT promoted — but the floor is now one instance away and that should be visible.**

---

## 1. ✅ THE INSTRUMENT IS FIXED — the two populations are separated at the source

The suite sets `GUARD_SYNTHETIC=1`; the hook records `synthetic: true`. **Rows are separable at read time from here on.**
⛔ **RETROACTIVELY THEY ARE NOT.** Every row written before the marker is unlabelled, so **the earlier session's rows cannot be cleaned and are not usable as a rate.** Stated rather than quietly re-baselined.

**Current version `ffa833100dbe`, first minutes of life:**

| population | decided | fired | rate |
|---|---|---|---|
| SYNTHETIC (payloads chosen to fire) | 21 | 10 | 47.6% |
| **REAL session traffic** | **1** | 1 | ⛔ **n=1 — NOT A RATE** |

⇒ ⛔⛔ **THE REAL-TRAFFIC FIRE RATE IS UNMEASURED. It is not high, it is not low, it is UNKNOWN, and no disposition may rest on it until a real window exists.**

---

## 2. ⚠️ WHAT SURVIVES THE RETRACTION, AND WHAT DOES NOT

⛔ **DOES NOT SURVIVE:** *"50.5%"* · *"25× the bar"* · *"as built it does not ship"* · *"the bar is unreachable no matter how the fires adjudicate."* **All four rested on the contaminated number.**

✅ **SURVIVES AS AN ARGUMENT — clearly labelled reasoning, not measurement:**
> **The signal *"is this reading about to become a claim?"* is not present before execution.** It lives in the result and in what the session does next. A pre-execution stage can therefore only fire on the INSTRUMENT — and instruments like `grep -c` are ubiquitous in ordinary work here.
★ **That is an argument that a pre-execution predicate will have a high floor. It is NOT a measurement that it does, and `r1` conflated the two.** ⇒ **it remains an argument for Langston's Q2 predicate (*a result that could not have answered the request* — claim-linked, and only available on `PostToolUse`), and it is now offered as reasoning for him to weigh, not as a finding.**

✅ **ALSO SURVIVES, and it is measured rather than argued:** `count-is-not-a-set` and `absence-without-control` were **one detector wearing two names** — across 54 `r1` fires the first NEVER fired alone and the second fired alone once. **Merged into `count-from-search` in `r2`.** Presenting them as two overstated the design's coverage.

---

## 3. ⛔ AND `r1`'s OTHER HEADLINE — *"a true positive on its author"* — IS ALSO WITHDRAWN

A fresh reader traced it to the object. **The predicate did not match the author's instrument.** `r1`'s `absence-without-control` required a search token and a count token **anywhere in the command, with no locality**. In the flagged command the `| wc -l` belonged to `git diff --numstat` and the `grep` was an unrelated later stage feeding `cut`.
⇒ **A RIGHT ANSWER FROM AN UNRELATED CONJUNCT.** ⛔ **And the same erroneous instrument had already run TWICE, SILENTLY, 34 and 17 minutes earlier in the same session.** A detector credited with catching an error it missed two of three times.
✅ **Fixed in `r2`: matching is PER PIPELINE STAGE**, so a token pair must co-occur in one stage. The author's command is now a regression case (`E1b`) and is silent.

---

## 4. ✅ WHAT THE `r2` WORK ACTUALLY PRODUCED

- **The write-redirection elision leg now EXISTS.** `r1`'s docstring and commit message both asserted it; the function elided heredocs only, **so the motivating incident — a crew post quoting a shape in a `--message` argument — still false-positived.** The suite passed because its one mention case was itself a heredoc.
- **Real mutation arms.** `r1`'s "mutations" mutated nothing — they fed different inputs to an unmodified hook. **`r2` patches a copy of the hook, re-runs the whole suite against it, and requires the suite to FAIL:** remove mention-elision · remove locality · drop a shape · make it block. **All four now fail the suite.**
- ★ **AND ARM `G` IMMEDIATELY EARNED ITS KEEP: the locality mutation PASSED.** `E1` had been written against the author's own command, which stopped firing because the **predicate was narrowed**, not because of locality — so the arm tested nothing. **The mutation caught a test that was passing for the wrong reason**, which is the same shape as everything else in this document, one level further down.
- **No throw can escape.** `main()` is wrapped; the top-level identity computation is wrapped. **The honest claim is "no REACHABLE path exits non-zero", not "none exists"** — an uncaught throw would exit 1, which still does not block.

---

## 5. ⇒ THE DISPOSITION

⛔ **NOTHING IS DECIDED ABOUT SHIPPING OBJ-4 UNTIL A REAL-TRAFFIC WINDOW EXISTS.** The hook is warn-only, fail-open, and live; it costs nothing to leave running while the window accrues. **That window is the deliverable, and it did not exist when `r1` declared its verdict.**
