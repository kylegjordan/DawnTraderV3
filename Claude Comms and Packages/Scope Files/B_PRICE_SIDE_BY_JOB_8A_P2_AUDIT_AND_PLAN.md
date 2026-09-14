# `B-PRICE-SIDE-BY-JOB` row `8a-P2` — MOVE THE EXIT TRIGGER OFF THE MIDPOINT

change-class: non_architecture
owner: CC-C · reviewer: Langston · ref: `origin/migration/aws-supabase`

> ⛔⛔ **WHY THIS DOCUMENT IS SHORT, AND WHY IT EXISTS AT ALL.** Kyle, 2026-09-14:
> *"I thought we were dictating to the system that it was going to take the ticker best...
> Now it seems like we're observing... It's a waste of time. We know we don't want the
> midpoint anymore so change it. That's all this batch should be about."*
> **HE IS RIGHT AND THE EVIDENCE IS IN OUR OWN CODE** — see §1. P1 shipped an instrument;
> P2 is the change he authorised at Step 1 and it has not been made.

---

## §1 AUDIT — THE SELECTOR IS BUILT, WIRED, AND CONNECTED TO NOTHING

**Every production caller of `selectTouchPrice`, enumerated repo-wide at the ref, tests excluded — there are exactly THREE and I say so explicitly (rule 22):**

| site | what it does with the result |
|---|---|
| `signal-orchestrator.ts:2657` | `:2692` `recordTouchSelection(...)` — a counter |
| `vts-runner.ts:1588` | `:1613` `recordTouchSelection(...)` — a counter |
| `active-execution-engine.ts:2125` | `:2159` `recordTouchSelection(...)`, `:2178` `_ladderAccumulate(...)` — counters |

⇒ **NOT ONE OF THEM CHANGES A PRICE.** `selectTouchPrice` returns `{ ok: true, quote: { bid, ask, basis, ageMs, ... } }` (`touch-price.ts:76-78`) — both sides, already freshness- and spread-checked — and all three sites discard it.

**Meanwhile the levels are still built from a single side-less number:** `signal-orchestrator.ts:2296-2298` derives `entryPrice`, `stopPrice` and `targetPrice` from one `currentPrice`. The correct sides are computed **361 lines later** and thrown away.

**A-1. `currentPrice` does TWO JOBS inside `tec-evaluator.ts`, and only one of them is this row's.** Measured at the ref, 17 occurrences:
- **TRIGGERING** — `:270` `currentPrice <= input.stopPrice` · `:279` `currentPrice >= input.targetPrice` · `:305` `isDiscontinuityActive(...)` · `:390` `tecShouldClose(...)`
- **BOOKING the exit price** — `:246`, `:362`, `:408`, `:411`, `:436`, `:453` `exitPrice: currentPrice`
⚠️ **On a stop/target hit the exit books at the LEVEL, not at `currentPrice`** (`:18-19` docblock, clamped), so the booking set is the safety-valve/discontinuity/no-exit paths only.
⇒ **P2 CHANGES TRIGGERING ONLY. Booking stays on this row's `currentPrice` and is NOT silently widened** — it is a different one of the four jobs and gets its own row (§4).

**A-2. ⭐ THE SKIP-ON-REFUSAL BRANCH ALREADY EXISTS — WE DO NOT BUILD ONE.** `tec-evaluator.ts:227`:
```ts
if (input.currentPrice === null || input.currentPrice <= 0) {
  if (input.holdDurationMs > input.maxHoldMs) { /* stale_timeout */ }
  return { shouldExit: false, exitReason: null, exitPrice: 0, resolvedConstants };
}
```
and `:114` states the contract outright — *"Pass null or <=0 to signal stale/unavailable price"*, *"no decision this cycle — caller should skip and try again."*

**A-3. ⛔ A CORRECTION I OWE, AGAINST MYSELF AND IN THE SAME DAY.** I told Kyle at 03:5xZ that on refusal I would *"fall back to today's price rather than skip."* **That is wrong and it contradicts his own 2026-09-03 ruling** that the exit standard does not loosen — and the approved `8a` scope pins the opposite as a test: *"P2-OBJ-2: on refusal the check is SKIPPED. **Mutation: fall back to the mid — must go red.**"* **The scope stands; my chat line is withdrawn.** Falling back to the mid re-introduces exactly the defect this row removes.

**A-4. REFUSAL RATE, MEASURED, WITH ITS POPULATION STATED.** Active crypto birth lane, `pm_uptime` 2026-09-14T01:14:30Z → 03:10:31Z: ladder `attempted` 8,222 · `accepted` 8,169 · `refused` 53 = **0.64%** (42 `stale_ticker`, 11 `locked_or_synthetic_ticker`).
⚠️ **THIS IS THE BIRTH LANE, NOT THE EXIT LANE — it is an ORDER-OF-MAGNITUDE PRIOR, not the exit refusal rate.** The exit-lane figure is P1-OBJ-2 and is still unread. **A-4 may not be cited as the exit rate.**

**A-5. BLAST RADIUS — xStock.** `_bookX` is null by construction on xStock and its ticker store is a different object (`aee:2108-2109`). **xStock stays byte-unchanged**, as P2-OBJ-3 requires.

---

## §2 PLAN — each item back-references its finding

| # | item | from |
|---|---|---|
| **P2-1** | Add `triggerPrice: number \| null` to `TECExitInput`. **`currentPrice` is NOT reassigned and NOT removed** — booking keeps it. | A-1 |
| **P2-2** | In `evaluateTECExit`, the four TRIGGER sites read `triggerPrice`; every `exitPrice:` site keeps `currentPrice`. | A-1 |
| **P2-3** | `triggerPrice === null` takes the SAME early-return as a null `currentPrice` — reuse `:227`, do not add a second guard. | A-2 |
| **P2-4** | At `aee:2501`, pass `triggerPrice: _lsSel.ok ? _lsSel.quote.bid : null`. Requires hoisting `_lsSel` out of the crypto block (the `_lsAcc` hoist pattern already used on this row). | A-1, A-2 |
| **P2-5** | xStock passes `triggerPrice: currentPrice` — explicitly, so the class keeps today's behaviour by STATEMENT rather than by omission. | A-5 |
| **P2-6** | Tests: stop fires on the BID and not on the mid; **mutation — replace the null-refusal with a mid fallback, must go RED**; xStock arm unchanged; a paired control on each. | A-3 |

## §3 WHAT WOULD FALSIFY THIS
A stop that should have fired on the bid and did not, or an exit skipped at a rate materially above A-4's prior once the exit-lane figure is read.

## §4 DELIBERATELY NOT IN THIS ROW — NAMED, NOT DROPPED (§9.4)
- **BOOKING the exit price on the transactable side** (A-1's second job). **HOME: `B-PRICE-SIDE-BY-JOB` row `8a-P3`, placed immediately after `8a-P2`.**
- **BIRTH-SIDE levels** (`signal-orchestrator.ts:2296-2298` — entry off the ASK, stop/target off the BID). **HOME: row `8b`, already in the plan.**
