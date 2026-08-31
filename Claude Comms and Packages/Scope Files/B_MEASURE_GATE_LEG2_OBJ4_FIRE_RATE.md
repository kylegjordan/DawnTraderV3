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

⛔⛔ **`r4` — THIS TABLE NAMED A `hook_sha` AND THE NAME WENT STALE ONE COMMIT LATER, WHICH IS `#978` SHAPE A IN THE DOCUMENT THAT EXISTS TO CATCH IT.** It read *"current version `ffa833100dbe`"*; that is the **r2** hook. The r3 commit changed elision and stage-splitting — **the very behaviour the table is about** — and the label did not follow. **A reader accruing the real-traffic window against the named sha would have measured r2.**
⛔ **AND THE `REAL` ROW DID NOT REPRODUCE (2 decided / 1 fired, not 1/1), because under that sha the key was written `|| undefined` and omitted on real traffic — so real, bail and pre-marker rows are ONE UNDIFFERENTIATED SET.** That is precisely the ambiguity the explicit `false` was added to remove; **the table predated its own fix.**

✅ **CORRECTED FORM — NAME THE READ-SITE, NEVER THE VALUE:**
> **The current identity is whatever `.claude/hooks/guard-measurement-shape.mjs` hashes to THROUGH ITS OWN CODE PATH** (sha256 of the file with `\r\n` normalised to `\n`, first 12 chars). **Compute it; do not copy it from here.** Any figure below is pinned to the moment it was taken and is superseded by the next change to the hook.

**Taken at `37706d574`, first minutes of that version's life:**

| population | decided | fired | rate |
|---|---|---|---|
| SYNTHETIC (payloads chosen to fire) | 21 | 10 | 47.6% |
| **REAL session traffic** | **small** | — | ⛔ **NOT A RATE — see the self-contamination limit in §4b** |

⇒ ⛔⛔ **THE REAL-TRAFFIC FIRE RATE IS UNMEASURED. It is not high, it is not low, it is UNKNOWN, and no disposition may rest on it until a real window exists.**

---

## 2. ⚠️ WHAT SURVIVES THE RETRACTION, AND WHAT DOES NOT

⛔ **DOES NOT SURVIVE:** *"50.5%"* · *"25× the bar"* · *"as built it does not ship"* · *"the bar is unreachable no matter how the fires adjudicate."* **All four rested on the contaminated number.**

✅ **SURVIVES AS AN ARGUMENT — clearly labelled reasoning, not measurement:**
> **The signal *"is this reading about to become a claim?"* is not present before execution.** It lives in the result and in what the session does next. A pre-execution stage can therefore only fire on the INSTRUMENT — and instruments like `grep -c` are ubiquitous in ordinary work here.
★ **That is an argument that a pre-execution predicate will have a high floor. It is NOT a measurement that it does, and `r1` conflated the two.** ⇒ **it remains an argument for Langston's Q2 predicate (*a result that could not have answered the request* — claim-linked, and only available on `PostToolUse`), and it is now offered as reasoning for him to weigh, not as a finding.**

⚠️⚠️ **`r3` — AND THE ONE THING `r2` LABELLED "MEASURED RATHER THAN ARGUED" IS THE ONE I HAVE TO PULL THE LABEL OFF.**
`r2` wrote: *"across 54 `r1` fires the first NEVER fired alone and the second fired alone once."*
⛔ **THE FIGURE DOES NOT REPRODUCE — the sink holds 58 such fires, and the "alone" count reads 2 or 3 at every window tried, not 1. No `hook_sha` subset sums to 54.**
⛔⛔ **AND THE DEEPER PROBLEM IS THE POPULATION, NOT THE ARITHMETIC: ALL 58 OF THOSE ROWS ARE UNLABELLED — THE EXACT ROWS §1 DECLARES "CANNOT BE CLEANED AND ARE NOT USABLE AS A RATE."** I disowned the population two sections earlier and then derived a finding from it. ★ **Contamination reaches a RATE through the denominator; it reaches a CO-OCCURRENCE claim through the NUMERATOR — and 39 of the 58 are the pair firing together, inside bursts where the suite was running payloads chosen to fire.** ⇒ **a state fully consistent with the evidence is that one shape "never fired alone" because no test payload isolated it.**
✅ **WHAT SURVIVES, AS DESIGN REASONING AND NOT AS MEASUREMENT: the two predicates both keyed on `grep -c`, so they were structurally one detector.** That is readable from the two regexes without any fire data at all. **Merged into `count-from-search` on that ground alone.**

---

## 3. ⛔ AND `r1`'s OTHER HEADLINE — *"a true positive on its author"* — IS ALSO WITHDRAWN

A fresh reader traced it to the object. **The predicate did not match the author's instrument.** `r1`'s `absence-without-control` required a search token and a count token **anywhere in the command, with no locality**. In the flagged command the `| wc -l` belonged to `git diff --numstat` and the `grep` was an unrelated later stage feeding `cut`.
⇒ **A RIGHT ANSWER FROM AN UNRELATED CONJUNCT.**
⚠️⚠️ **`r3` — AND `r2`'s SUPPORTING SENTENCE HAS NO OBJECT BEHIND IT, SO IT IS WITHDRAWN.** It read *"the same erroneous instrument had already run TWICE, SILENTLY, 34 and 17 minutes earlier."* ⛔ **THE SINK STORES NO COMMAND TEXT — only `cmd_bytes` — so it cannot identify "the same instrument", and its earliest row POSTDATES the times cited.** ★ **The claim came from a reader's transcript analysis, and I restated it as though the sink carried it. That is `RULED ON REPORTED FACT` — the standard Langston refuses — inside a retraction written to fix exactly that.**
✅ **What is left standing on an object I hold: the predicate as written could not have matched the instrument, which is readable from the two regexes.**
✅ **Fixed in `r2`: matching is PER PIPELINE STAGE**, so a token pair must co-occur in one stage. The author's command is now a regression case (`E1b`) and is silent.

---

## 4. ✅ WHAT THE `r2` WORK ACTUALLY PRODUCED

- **The write-redirection elision leg now EXISTS.** `r1`'s docstring and commit message both asserted it; the function elided heredocs only, **so the motivating incident — a crew post quoting a shape in a `--message` argument — still false-positived.** The suite passed because its one mention case was itself a heredoc.
- **Real mutation arms.** `r1`'s "mutations" mutated nothing — they fed different inputs to an unmodified hook. **`r2` patches a copy of the hook, re-runs the whole suite against it, and requires the suite to FAIL:** remove mention-elision · remove locality · drop a shape · make it block. **All four now fail the suite.**
- ★ **AND ARM `G` IMMEDIATELY EARNED ITS KEEP: the locality mutation PASSED.** `E1` had been written against the author's own command, which stopped firing because the **predicate was narrowed**, not because of locality — so the arm tested nothing. **The mutation caught a test that was passing for the wrong reason**, which is the same shape as everything else in this document, one level further down.
- **No throw can escape.** `main()` is wrapped; the top-level identity computation is wrapped. **The honest claim is "no REACHABLE path exits non-zero", not "none exists"** — an uncaught throw would exit 1, which still does not block.

---

## 4b. ⛔ `r3` — THE STATED LIMITS, WRITTEN DOWN BEFORE ANY WINDOW IS QUOTED

**A second object round found the `r2` fix had made the guard BLIND in four ways it was not blind before.** All are fixed and all are now regression cases — but the class is the finding:

⛔⛔ **OVER-ELISION IS WORSE THAN UNDER-ELISION, AND `r2` TRADED ONE FOR THE OTHER WITHOUT NOTICING.** A missed mention is noise. **A swallowed instrument is a blind guard that reads as a clean one.** The worst case: `cc-send --message "count: $(grep -c X f)"` — the instrument RUNS, its output goes into a crew post AS A CLAIM, and `r2` was silent on it. ⇒ **a quoted region containing `$(` or a backtick is not prose and is no longer elided.**

**STILL TRUE AND NOT SOLVED — stated rather than discovered later:**
- **`stages()` is quote- and substitution-unaware.** A quoted `;` splits a stage that should not split; a pipe inside `$( )` splits one instrument into two. **Both directions known, neither handled.** ⇒ **this is a shell-shaped problem being solved with regexes, and each fix has so far produced a new blind spot.**
- ⛔ **`hook_sha` WAS SPLITTING ONE SOURCE VERSION INTO TWO IDENTITIES BY LINE ENDING** — LF blob vs CRLF checkout — **so the live hook stamped one sha while `r2`'s own table filtered on the other.** ★ **That is this hook's own `worktree-not-ref` shape landing on the hook's own identity field.** ✅ Fixed: the hash normalises line endings, so it identifies SOURCE rather than checkout form.
- ⛔ **The sink carries NO SESSION OR CLONE ID**, so "real traffic" pools every session.
- ⛔⛔ **AND THE REAL WINDOW IS SELF-CONTAMINATING: auditing this guard is itself real-marked traffic, enriched in the very shapes being audited.** A window accrued while the batch is under active development measures the developer working on the guard. **Any future rate must exclude the batch's own sessions or say plainly that it does not.**
- ⛔⛔ **`r4` — AND THERE WAS A PERMANENT FLOOR UNDERNEATH THAT ONE, WHICH DOES NOT WASH OUT: GOVERNANCE MANDATES A FIRING COMMAND EVERY TURN.** `CLAUDE.md` §10.5 requires `tail -50 …/system-alerts.jsonl` **before responding to any user message**, and shared `MEMORY.md` item 4 requires `tail -30 …/cc-discord-inbox.jsonl` at session start. **Both matched `truncation-is-not-population`. Both fired. Neither can ever become a claim.**
  ★ **Unlike batch-session contamination this scales with TURN COUNT, in EVERY session, FOREVER.** ⇒ ⛔ **a guard that fires on a command the rules oblige you to run every turn is a banner-blindness generator by construction, and no amount of window accrual fixes it.**
  ✅ **FIXED BY REMOVING `tail` FROM THE SHAPE**, keeping `head` and `git log -N`, which are not mandated. **Both mandated reads are now regression cases (D13, D14).** ⚠️ **Reader-found — I had named self-contamination and missed the floor beneath it.**

---

## 5. ⇒ THE DISPOSITION

⛔ **NOTHING IS DECIDED ABOUT SHIPPING OBJ-4 UNTIL A REAL-TRAFFIC WINDOW EXISTS.** The hook is warn-only, fail-open, and live; it costs nothing to leave running while the window accrues. **That window is the deliverable, and it did not exist when `r1` declared its verdict.**
