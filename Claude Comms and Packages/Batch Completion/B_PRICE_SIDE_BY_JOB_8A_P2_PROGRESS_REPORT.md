# `B-PRICE-SIDE-BY-JOB` row `8a-P2` — PROGRESS REPORT (Step 7 record, batch OPEN)

**Deployed:** `7d4cdf5a8985facb06189216c2375f0e79f5bf64` · 2026-09-14 · `--by cc-c`
**CI:** run `34823167983` on that exact head — TypeScript Check (baseline gate) · Test Suite · Build · Docker Build, **4/4 success, verified per-job.**
**Status:** deployed and observing. **NOT closed.** Step 8 corrections landed; Steps 9–11 outstanding.

---

## §0 — ⛔⛔ CORRECTIONS TO MY OWN STEP-7 REPORT, FIRST, BECAUSE THEY WENT OUT WRONG

I published four headline readings from the live deploy. **Langston re-derived them and three did not survive.** All three are re-verified by me at the objects below. They are placed at the top rather than in a footnote because the wrong versions were already sent.

### F1 — ⛔ "THE SELECTOR EXECUTED FOR THE FIRST TIME" IS FALSE, AND IT FAILED IN THE DIRECTION THAT FLATTERS THE DEPLOY

**WHAT I SAID:** *"the selector that had never executed once on crypto has now run and accepted"*, attributed to this deploy.

⛔⛔ **AND MY FIRST CORRECTION SPLIT THE DATA WITH AN INSTRUMENT THAT CANNOT RESOLVE THE BOUNDARY.** I used `pm_uptime` **08:34:34.852Z** against a log stamped to the **SECOND**. ⇒ **a one-second ambiguity band — WITH A FRAME SITTING IN IT.** `F4` moved the split point correctly and then handed it to a ruler too coarse to use it, which put an OLD-BUILD frame on the NEW-BUILD side. (Langston, DEFECT-1.)

✅ **THE DISCRIMINATOR THAT ACTUALLY RESOLVES IT IS THE COUNTER SCHEMA, NOT THE CLOCK.** `shadowEntered`/`shadowSkippedNoBook` exist only in the OLD build; `noTriggerRefusals` only in the NEW one. **Re-measured by me, `EVAL_EXIT` frames, read at 2026-09-14T08:48:42Z:**

| partition | frames |
|---|---|
| **OLD schema only** | **547** — every one `ladderAccepted=1 ladderRefused=0` |
| **NEW schema only** | **563** |
| **BOTH** | **0** |
| last OLD / first NEW | **08:34:34** / **08:34:39** — a 5-second restart gap |

⇒ **A CLEAN PARTITION WITH NO OVERLAP, so the build a frame came from is READ OFF THE FRAME rather than inferred from a timestamp it cannot support.** ★ The conclusion is unchanged and now actually carries: **547 frames of the arm accepting BEFORE this build existed.**
⚠️ **AND THE `earliest line` ROW IS STRUCK: `out.log`'s own first line is 08:20:54 — that is a RETENTION FLOOR on a log rotating 6-8x/day, NOT a series origin.** The honest statement is *"the arm was already accepting at the first frame the log retains."* F1 rests on the 547, which carries it alone.

⇒ **THE ARM WAS ALREADY ACCEPTING UNDER THE OLD BUILD.** `8a-P1`'s shadow shipped at `f7d84d99` and had been walking the ladder since `FIL/USD` opened at **08:04:15Z — thirty minutes BEFORE the deploy.**

⛔⛔ **AND THE SHAPE OF THE ERROR IS WORSE THAN THE ERROR: I STATED THE 08:04 OPEN TIME AS A FACT IN THE SAME MESSAGE, THEN READ IT BACKWARDS INTO THE DEPLOY.** The evidence that refutes the claim was inside the sentence making it. **This deploy INHERITED a running arm; it did not start one.**
★ It is the deploy-boundary rule — *a deploy wipes and restarts in-memory state, so attribute nothing across it* — **failing in the direction that credits the new code.** That direction is not a coincidence and is why it needs to be at the top of this document.

### F2 — ⛔ "20/20, EVERY ONE VIA THE BOOK TOP" WAS A TAIL SAMPLE PUBLISHED AS THE POPULATION

**WHAT I SAID:** 20 consecutive cycles, all `ladderViaBook=1`.
**MEASURED on the NEW-schema partition, unbounded — READ AT 2026-09-14T08:48:51Z:** **568 cycles — 566 `ladderViaBook=1`, 2 `ladderViaBook=0`.**

⛔ **EVERY COUNT HERE IS A READING OF A GROWING FILE AND CARRIES ITS READ TIME.** Langston caught this at 110/1, then 469/2, then 708/2; mine is 568/2 at 08:48:51Z.
⛔⛔ **AND "~0.35% AND FALLING" IS STRUCK — IT WAS A RATE BUILT FROM n=1.** (Langston, RIDER-2.) `08:34:39` is BOOT; **only `08:40:24` is steady state, and nothing in ~460 cycles since.** ⇒ **THE HONEST STATEMENT IS: the ticker leg HAS BEEN INVOKED OUTSIDE BOOT, ONCE. That discharges `#661` leg 3 (INVOCATION) and IS NOT A RATE** — publishing a percentage off a single observation is the denominator error wearing a decimal point.
✅ **MECHANISM NOW CITABLE rather than inferred:** `touch-price.ts:112-121` is the book arm, `:126-135` the ticker arm (`basis: input.tickerBasis`), `:236` sets the binary `acceptedLeg`, counted at `aee:2352` ⇒ **`ladderAccepted=1 ∧ ladderViaBook=0` IS the ticker leg, by construction and not by inference.**
⇒ **THE TICKER-FALLBACK ARM IS LIVE-EXERCISED.** ★ **BETTER news than I reported — an exercised arm beats an unexercised one, and rung 2 is no longer `#661` leg 3 — but the sentence as written was false at the population.**
⚠️ **`tail -20` is `chosen-subset-as-suite` again, four hours after I filed that pattern.** The fix is the same and it is not discipline: **state the denominator, or take the whole window.**

### F3 — ⛔ "xSTOCK UNCHANGED: `positionsEvaluated=4`" IS A MIXED DENOMINATOR AND CANNOT CARRY THE CLAIM

`active_open_positions` at the read: **`CRWD`, `MDB`, `MSFT` (xstock_spot) + `FIL/USD` (crypto_spot)**. One `EVAL_EXIT` cycle covers **both classes**, so **4 = 3 xStock + 1 crypto.**
⇒ **THE NUMBER CANNOT SUPPORT A P2-5 xSTOCK CLAIM — it is not an xStock count.** And Langston's second leg kills it independently: **`positionsEvaluated=4` appears 431 times PRE-deploy**, so it is invariant across the boundary for reasons unrelated to what P2-5 asserts. **A number that reads the same on both sides of the change cannot be evidence the change was safe.**
✅ **WHAT DOES CARRY P2-5 is the source fact, not the log line:** xStock passes `triggerPrice: currentPrice` explicitly at the evaluator call, fenced by test `2d`/`2e`.

### F4 — ⚠️ THE WINDOW OPENS AT `pm_uptime`, NOT AT THE DEPLOY STAMP
`pm_uptime` **08:34:34.852Z**; `dt-deploy`'s `deployed_at` is **08:34:45Z**, a POST-CHECK stamp. Ten seconds, and **two outlier frames sit inside that gap**, so it is the split point for F1/F2 and not a rounding note.

---

## §1 — WHAT IS ACTUALLY VERIFIED (after the corrections)

✅ **Deploy identity:** deployed sha on the box matches; `dist/index.js` mtime 08:34:33.764Z vs `pm_uptime` 08:34:34.852Z ⇒ **the running process is the new build**, not merely a rebuilt file.
✅ **`FINDING-5` genuinely discharged** — `shadowEntered` survives at exactly ONE site under `server/`, a **comment** (Langston pulled the `dist` string by byte offset rather than assume the bundler strips comments). **547 emissions on the OLD-schema partition, ZERO on the NEW one, BOTH = 0.** Removed, not renamed. ⚠️ **Stated on the SCHEMA partition, not the 546 timestamp count, which was off by one for the reason in F1.**
✅ **The new counter emits:** `noTriggerRefusals=0` in `EVAL_EXIT`.
✅ **No new `8a-P2` / `NO_TRIGGER` / `LADDER_SHADOW_ERROR` entries since the boundary** — with a positive control (9,929 hits on the known-positive term), so the silence is instrument-backed.
✅ **The ladder's live accept/refuse split on the crypto exit lane exists at all**, which `BLOCKER-3` required before this could be more than an unexercised gate — **but it predates the deploy and is P1's measurement, not P2's.**

## §2 — WHAT IS NOT VERIFIED, STATED PLAINLY
⛔ **No crypto exit has fired under the new trigger.** `slHits=0`, `tpHits=0` throughout. **The decision path has been EXERCISED but its OUTPUT has never been tested** — the split changes which price crosses a level, and no level has been crossed.
⛔ **`NO_TRIGGER_STREAK_ALERT_AT` has never fired.** Correct silence (zero refusals), **not a tested rail** — and it must not be cited as working.
⛔ **The trailing-path trigger surfaces have no behavioural divergent coverage** (parity header): they are held by source-text regex alone, and are dormant only because `atr_at_open` is 0.

## §3 — §9.4, FOLDED IN (disposition 1)
⛔⛔ **THIS SECTION PREVIOUSLY EXPLAINED AWAY THE EXACT TWO OBSERVATIONS `F2` RESTS ON. TWO SECTIONS OF ONE DOCUMENT, CONTRADICTING EACH OTHER ON THE SAME TWO FRAMES.** (Langston, DEFECT-2.) Corrected below and the correction cuts in the batch's FAVOUR.

**THE TWO `ladderViaBook=0` FRAMES — MEASURED, read at 2026-09-14T08:48:51Z:**

| frame | shape | verdict |
|---|---|---|
| **08:34:39** | `positionsEvaluated=1 withWsPrice=1 withRestPrice=0 withoutPrice=3` | cold boot, 5 s after restart |
| **08:40:24** | `positionsEvaluated=4 withWsPrice=4 withRestPrice=0 withoutPrice=0` | ⭐ **FULLY STEADY STATE, 5m49s after boot** |

⇒ ⛔ **MY "both sit in the cold-boot window" WAS FALSE AT THE OBJECT, AND IT WAS FALSE WHEN I WROTE IT** — that frame was already inside my own n=246 read.
⇒ ★★ **AND IT MAKES `F2` STRONGER, NOT WEAKER: THE TICKER-FALLBACK ARM FIRES IN STEADY STATE, NOT ONLY AT BOOT.** Rung 2's `#661`-leg-3 discharge is therefore real rather than a boot artefact. **I wrote a paragraph that dismissed my own best evidence.**

**`unvalidatedRefusals=3` at 08:34:44 and 08:34:46 — RESTORED AS MEASURED. MY WITHDRAWAL WAS THE ERROR.**

⛔⛔ **I WITHDREW A TRUE CLAIM AND INVENTED A FALSE MECHANISM TO JUSTIFY DOING SO.** I called `withoutPrice=3` / `unvalidatedRefusals=3` *"two fields that happen to read 3 — a matching literal, not a shared root."* **That reasoning is wrong at the code.** (Langston, RIDER-1.)

✅ **MEASURED, at the implementing line:** `active-execution-engine.ts:1998-1999` increments **`unvalidatedRefusals++` AND `withoutPrice++` IN THE SAME BRANCH** ⇒ `withoutPrice >= unvalidatedRefusals` **structurally**, and **equality at 3 means every without-price row that cycle came from that refusal.** That is a **SHARED ROOT**, not a coincidence of literals.
✅ **AND THE SYMBOLS ARE NAMED — I was reading the wrong stream.** `:2000` prints them to **`error.log`** (a `console.warn`), which I never checked; I searched `out.log`. Both frames, verbatim:
  · `08:34:44` — **MSFT/USD · MDB/USD · CRWD/USD**, `state=unknown reasons=no_comparator`
  · `08:34:46` — **MSFT/USD · MDB/USD · CRWD/USD**, `state=two_sided validated=false framesSinceSeed=0`
⇒ **THE THREE xSTOCK ROWS, EXACTLY AS ORIGINALLY WRITTEN**, and `framesSinceSeed=0` is the ONE-TICK SEED COST the comment at `:1994` already declares — so it is **working as designed**, not warm-up guesswork.

⛔⛔ **AND THE META-LESSON IS THE REASON THIS PARAGRAPH IS LONG: I DID NOT FILE `matching-literal-not-shared-root` AS A PATTERN, AND MUST NOT.** ★ **A FALSE INSTANCE IN THE PATTERN INDEX IS WORSE THAN A MISSING ONE** — withdrawing a true claim for an invented mechanism does not leave a gap, it leaves **a wrong generalisation with a name**, which the next session will apply to a case where it is also false. **My own `#507` discipline, firing in the mirror direction: over-retraction is a claim too.**

---

## §4 — THE OBSERVABILITY ROUND (2026-09-14, after Step 8)

⛔⛔ **THE OPEN ITEM WAS NOT WAITING FOR AN EXIT — IT WAS A CONJUNCTION THAT COULD NOT BE READ.** `slHits=0 tpHits=0` renders *the engine never called the evaluator* and *it called and nothing was in range* as **the same cell**, and only the first is `#661` leg 3. ★ **A natural exit discharges BOTH AT ONCE, which is exactly why waiting for one FELT like the answer and could never be stated as a close condition.** (Langston.) **It is the same shape this batch already filed: a 404 rendering as ZERO DRIFT.**

**WHAT WAS BUILT (measured first — no invocation counter existed; `positionsEvaluated` sits upstream of ten `continue`s and counts positions CONSIDERED, not evaluator INVOCATIONS):**
a **four-arm partition at the evaluator's call site** — `invoked = refused + noMark + noHit + hit` — **fenced in code**, with the residual emitted every cycle and a non-zero raising a loud error stating that **until it is fixed a zero in ANY arm is not evidence of absence.** ★ *A partition in a comment is a claim; a partition in code is a fence.*

**LIVE READ (deployed `2fbdef295`, read 2026-09-14T09:51:42Z, unbounded, 11 frames, streams named — `EVAL_EXIT` is `console.log`⇒`out.log`, `VENUE_MARK_NON_FINITE` is `console.warn`⇒`error.log`):** residual **0 on every frame**, fence never fired, `invoked == positionsEvaluated` on 10 of 11 (the exception is that deploy's own boot frame). ⚠️ **That equality is CONDITIONAL, not an identity — a pending-maker or REST-maker-exit frame breaks it benignly.**

### §4a — THE FIVE THINGS I GOT WRONG IN THIS ROUND, BECAUSE THEY ARE THE ROUND'S VALUE
1. **`_exitEvalInvoked` sat 110 lines and two awaited DB writes from the call it counted**, inside the loop's `catch`, while its comment claimed *"before any branch"*. ⛔ **And the loss direction was the bad one: a DB blip under-counts invocations, which reads as "never evaluated" — reproducing the exact conflation the counter exists to end.**
2. **I wrote "THE PARTITION, EXHAUSTIVE BY CONSTRUCTION" over a partition that leaks AND over-counts**, and which balances only because THREE config switches are off. **`#677` — three config locks are not a construction — and I typed the word "construction".**
3. ⛔⛔ **`_exitEvalNoHit` read `shouldExit` ALONE, so the evaluator's stale-mark branch (a BARE false) landed in it. MY OWN DOCBLOCK ON `noDecisionReason` NAMES THAT EXACT CALLER SHAPE IN MY OWN WORDS.** I added the field to end the conflation, wrote the warning, and built its instance one file over.
4. **I withdrew that figure claiming contamination — without measuring whether the contaminating path was REACHABLE.** It was not, except through one missing finite/positive predicate. ⇒ **`over-retraction-is-a-claim`, firing two hours after I filed it.**
5. **Closing that predicate MUTED ITS OWN TRIGGER** — a venue-sourced bad mark routed to REST with no log and no counter. ★ **A correction that removes a defect AND the evidence of the defect leaves you unable to tell FIXED from NEVER HAPPENED — and I would have read the resulting zero as proof.**

### §4b — AND THE INSTRUMENT'S OWN ZERO IS NOW READABLE
I reported `venueMarkNonFinite=0` and refused to interpret it for want of a positive control. ★ **Langston: *"'I have no positive control' is a claim about what you RAN, not about what EXISTS."*** The branch is a pure function of one object ⇒ **driven offline, 10 tests, mutation-proved both ways.** ⇒ **`#661` LEG 1 DISCHARGED; a live zero now reads as legs 2/3 only.**
⚠️ **AND THE COUNTER IS BROADER THAN THE HOLE AS A MATTER OF CODE** — it also counts a venue-sourced `null`, which the accept branch already excluded ⇒ **a future non-zero is an UPPER BOUND; partition by emitted value before quoting a rate.**

⇒ **NONE OF THIS MOVED `slHits=0 tpHits=0`. THE INSTRUMENT WORK IS COMPLETE; THE OUTPUT IS STILL UNTESTED, AND NO FURTHER BUILDING WILL PRODUCE A LIVE CRYPTO EXIT.**
