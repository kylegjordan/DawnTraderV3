# Pattern promotion PROPOSAL — not yet landed anywhere

> **GENERATED:** 2026-09-05T14:02:50Z by `langston-promote-patterns` (P-8).
> ⛔ **THIS IS A PROPOSAL. IT HAS NOT BEEN WRITTEN TO `MISTAKE_PATTERNS.md`**
> **and must not be, without a session reading it and landing it inside a**
> **batch.** That file's promotion floor — 3 instances across 2 distinct
> batches — is a judgement, not a string match, and the counts below are
> **his own claim, unverified by me.**

> ✅ **LEAK SCREEN: PASSED.** No session name and no retraction word appears
> below. The screen is mechanical and over-broad by design — see the tool.

---

### `absence-measured-with-the-wrong-object` — **A ZERO DESCRIBES THE INSTRUMENT'S REACH, NOT THE WORLD**
**THE SHAPE:** A check runs cleanly and returns nothing, so the thing is reported missing, dead, never stored, or never called. The check was correct — it was pointed one hop off the object it needed: the module's own file instead of the whole tree that writes to it; a filtered sub-population instead of the table; a passthrough endpoint instead of the field's real read site; the lane whose header says it is the other lane. It is convincing precisely because the surrounding rigor is real, and an argument that no *duplicate* can exist gets mistaken for evidence that the row is *absent*.
**HOW TO SEE IT:** Before any "X does not exist / is not recorded / is never written" claim, re-run the same instrument with the narrowing removed and say what it returns — drop the WHERE clause and enumerate the whole table unfiltered; grep the exported symbol across the entire tree and list the EXTERNAL call sites, never the in-file ones; then read the writer and ask whether the gap is structurally possible on that path. State which fact you have: "no such thing exists" and "my query did not return it" are different claims, and only the second was measured.
**HOW OFTEN I HAVE SEEN IT:** Seven or more times over about two months, across at least five distinct pieces of work — three of them my own errors, caught by someone else re-running the check one scope wider.

### `silence-without-coverage-or-invocation` — **A CLEAN LOG IS READ AS PROOF, WHEN THE WINDOW HELD NO CHANCE TO FIRE**
**THE SHAPE:** A search over a large log returns zero hits and the instrument passes a positive control, so the absence is treated as settled. But a positive control proves only that the stream *can* carry the line. It says nothing about whether the window spanned even one expected occurrence of a periodic event, and nothing about whether the code path was ever armed — a path behind an off switch is silent no matter how loud its body. The size of the corpus does the persuading: hundreds of megabytes feels exhaustive.
**HOW TO SEE IT:** Require all three legs stated before accepting a zero: (1) capability — the control; (2) coverage — the window's SPAN against the phenomenon's PERIOD, with expected occurrences ≥ 1, or the reading is unreadable rather than negative; (3) invocation — read the live switch at its source and find the chokepoint function, because if the thing is gated off the correct re-check is a change to that switch, not a timer. A time-armed re-check on a config-gated condition measures nothing and trains everyone to ignore the queue.
**HOW OFTEN I HAVE SEEN IT:** Three times over about a month, in three separate pieces of work; in one, a re-check re-fired six times across 114 hours and measured nothing at all.

### `document-value-quoted-as-live-value` — **A NUMBER LIFTED FROM A DOCUMENT OR A NOTIFICATION IS A SNAPSHOT OF A MUTABLE OBJECT**
**THE SHAPE:** A settings registry, a governance doc, or an alert body carries a number, and it is quoted into a decision as though it were the current state. Registries drift silently from the rows they describe; notification bodies are frozen at the moment they were minted and merely re-posted afterwards, so a re-surface count reads like recency when it is age. Worse, a stuck notification can be the very thing blocking a fresh reading of the same gauge. Whole affordability models and threshold escalations get built on values that were superseded weeks earlier.
**HOW TO SEE IT:** Any number the decision rests on gets read from the live row or the emitter's own periodic output at review time, with its last-updated stamp and updater — never quoted from a document. Publish both when they differ: "the record says X, measured now Y." For an entity-scoped notification, check the SUBJECT still exists before triaging: "still unresolved" is not "still happening," and a notification whose subject closed days ago is closeable on that ground alone.
**HOW OFTEN I HAVE SEEN IT:** Four times over roughly six weeks, in four distinct pieces of work — the largest gap understated a capacity risk by nine points for eight days.

### `a-guard-that-cannot-go-red` — **THE CHECK PASSES FOR A REASON UNRELATED TO THE PROPERTY IT CLAIMS TO VERIFY**
**THE SHAPE:** A fence, probe, or regression test is present and green, so the invariant is treated as held. But the probe tests an adjacent condition — a name lookup where the real conflict is a range overlap, a fence pointed at a function that hardcodes the asserted value, probes that cannot syntactically reach the branch they certify. It looks like coverage, it is cited as coverage, and the swallowed real failure is indistinguishable from a healthy no-op run.
**HOW TO SEE IT:** Mutate and watch it go red. Break the property deliberately — delete the guard, hardcode the wrong action, feed the input the guard exists to reject — and confirm the check fails. If you find yourself predicting "that mutation would pass," you have already found the defect; the repair is to make the correct path CARRY the value so the shortcut no longer compiles. Ask of every green check: what exact change would turn this red, and can that change actually occur here?
**HOW OFTEN I HAVE SEEN IT:** Five times over about six weeks, across four distinct pieces of work; in two of them the guard's own comment certified behaviour none of its probes could reach.

### `matching-literal-mistaken-for-shared-root` — **TWO FAILURES SHARING A NUMBER OR A STRING GET FILED AS ONE CAUSE, AND THE MAP GOES WRONG**
**THE SHAPE:** Two incidents mention the same constant, so they are merged into one pattern with one root. The literal really did appear in both places; the causal link is assumed rather than tested. In the case I measured, the true cause was the PLACEMENT of a check between two writes — a completely correct constant produces the identical failure. This matters more in a shared pattern index than in any single review: a missing pattern is a gap, but a wrong one actively sends the next reader to fix the wrong thing.
**HOW TO SEE IT:** Counterfactual invariance, before merging: hold the suspected cause FIXED at its correct value and ask whether the failure still occurs. If it does, that is not the root — file two patterns with two roots. A matching number is not a matching thing, and that applies to causes exactly as it applies to counts.
**HOW OFTEN I HAVE SEEN IT:** Once, directly measured. I am nominating it on consequence rather than frequency, because the file it would enter is the one where a wrong root does the most damage.

