# `B-PRICE-SIDE-BY-JOB` row `8a-P2` — PROGRESS REPORT (Step 7 record, batch OPEN)

**Deployed:** `7d4cdf5a8985facb06189216c2375f0e79f5bf64` · 2026-09-14 · `--by cc-c`
**CI:** run `34823167983` on that exact head — TypeScript Check (baseline gate) · Test Suite · Build · Docker Build, **4/4 success, verified per-job.**
**Status:** deployed and observing. **NOT closed.** Step 8 corrections landed; Steps 9–11 outstanding.

---

## §0 — ⛔⛔ CORRECTIONS TO MY OWN STEP-7 REPORT, FIRST, BECAUSE THEY WENT OUT WRONG

I published four headline readings from the live deploy. **Langston re-derived them and three did not survive.** All three are re-verified by me at the objects below. They are placed at the top rather than in a footnote because the wrong versions were already sent.

### F1 — ⛔ "THE SELECTOR EXECUTED FOR THE FIRST TIME" IS FALSE, AND IT FAILED IN THE DIRECTION THAT FLATTERS THE DEPLOY

**WHAT I SAID:** *"the selector that had never executed once on crypto has now run and accepted"*, attributed to this deploy.

**MEASURED, `out.log`, split at `pm_uptime` 08:34:34.852Z:**

| | lines | value |
|---|---|---|
| **PRE-deploy** | **546** | **every one `ladderAccepted=1 ladderRefused=0`** |
| post-deploy | 241+ | same shape |
| earliest line at all | — | **08:20:55Z** |

⇒ **THE ARM WAS ALREADY ACCEPTING UNDER THE OLD BUILD.** `8a-P1`'s shadow shipped at `f7d84d99` and had been walking the ladder since `FIL/USD` opened at **08:04:15Z — thirty minutes BEFORE the deploy.**

⛔⛔ **AND THE SHAPE OF THE ERROR IS WORSE THAN THE ERROR: I STATED THE 08:04 OPEN TIME AS A FACT IN THE SAME MESSAGE, THEN READ IT BACKWARDS INTO THE DEPLOY.** The evidence that refutes the claim was inside the sentence making it. **This deploy INHERITED a running arm; it did not start one.**
★ It is the deploy-boundary rule — *a deploy wipes and restarts in-memory state, so attribute nothing across it* — **failing in the direction that credits the new code.** That direction is not a coincidence and is why it needs to be at the top of this document.

### F2 — ⛔ "20/20, EVERY ONE VIA THE BOOK TOP" WAS A TAIL SAMPLE PUBLISHED AS THE POPULATION

**WHAT I SAID:** 20 consecutive cycles, all `ladderViaBook=1`.
**MEASURED, post-boundary, unbounded rather than `tail -20`:** **246 cycles — 244 `ladderViaBook=1`, 2 `ladderViaBook=0`.**

⇒ **THE TICKER-FALLBACK ARM IS LIVE-EXERCISED.** Langston's read caught it at n=110/1; it is 2 at n=246 as the window grows. ★ **That is BETTER news than I reported — an exercised arm beats an unexercised one, and the rung-2 path is no longer `#661` leg 3 — but the sentence as written was false at the population.**
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
✅ **`FINDING-5` genuinely discharged** — `shadowEntered` survives at exactly ONE site under `server/`, a **comment**; **546 log emissions PRE-boundary, ZERO after.** Removed, not renamed.
✅ **The new counter emits:** `noTriggerRefusals=0` in `EVAL_EXIT`.
✅ **No new `8a-P2` / `NO_TRIGGER` / `LADDER_SHADOW_ERROR` entries since the boundary** — with a positive control (9,929 hits on the known-positive term), so the silence is instrument-backed.
✅ **The ladder's live accept/refuse split on the crypto exit lane exists at all**, which `BLOCKER-3` required before this could be more than an unexercised gate — **but it predates the deploy and is P1's measurement, not P2's.**

## §2 — WHAT IS NOT VERIFIED, STATED PLAINLY
⛔ **No crypto exit has fired under the new trigger.** `slHits=0`, `tpHits=0` throughout. **The decision path has been EXERCISED but its OUTPUT has never been tested** — the split changes which price crosses a level, and no level has been crossed.
⛔ **`NO_TRIGGER_STREAK_ALERT_AT` has never fired.** Correct silence (zero refusals), **not a tested rail** — and it must not be cited as working.
⛔ **The trailing-path trigger surfaces have no behavioural divergent coverage** (parity header): they are held by source-text regex alone, and are dormant only because `atr_at_open` is 0.

## §3 — §9.4, FOLDED IN (disposition 1)
**`unvalidatedRefusals=3` fires at 08:34:44 and 08:34:46 on the three xStock rows, then stops.** It **looks** like boot warm-up. ⚠️ **That is a HYPOTHESIS, not a finding** — recorded with the two `ladderViaBook=0` frames, both of which sit in the cold-boot window, and neither is dispositioned until the implementing line is cited.
