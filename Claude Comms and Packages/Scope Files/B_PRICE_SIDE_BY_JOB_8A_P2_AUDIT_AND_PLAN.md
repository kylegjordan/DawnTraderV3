# `B-PRICE-SIDE-BY-JOB` row `8a-P2` — MOVE THE EXIT TRIGGER OFF THE MIDPOINT

change-class: architecture
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

---

# r2 — LANGSTON SENT IT BACK, ALL FOUR BLOCKERS ACCEPTED, AND ONE OF THEM INVERTS AT THE OBJECT

⚠️ **CHANGE-CLASS RE-DECLARED AT THE HEADER (line 3) FROM `non_architecture` TO `architecture`, per FINDING-2** — this adds a field to a shared evaluator with three callers and changes the decision basis of the risk-control path, so it is signal-pipeline/exit-math content: the System Manual row is REQUIRED and may not take N/A. ⛔ **Deliberately NOT written here as a second `change-class` line — the checker parses that marker at line start and two of them is the `#641` two-homes shape, which would leave the file graded on whichever it read first.**

## r2-A — BLOCKER-1 ACCEPTED, AND THE LIVE CONSEQUENCE IS THE OPPOSITE OF THE ONE STATED

**His catch is correct and my A-1 was incomplete:** `tec-evaluator.ts:330` passes `currentPrice` into `tecUpdatePosition`, which drives four further trigger decisions in `trailing-exit-controller.ts` (`:1095` high-water, `:1127` break-even, `:1197` target-lock, `:1235` rung ladder). It was in neither of my lists.

**But the gate runs the other way today, and I measured it rather than reasoned it.** `tec-evaluator.ts:267` is `if (!input.useTrailing || atrUnavailableForTrailing)` with `atrUnavailableForTrailing = !(input.atr > 0)`. `atr` is `atrAtOpen`, and `aee:2461` reads it as `metadata?.atr_at_open ? parseFloat(...) : 0`.

> **MEASURED — `closed_trades`, `opened_at` within 14 days, read 2026-09-14:**
> **`atr_at_open` is ABSENT on 91 of 91 trades — crypto 60/60, xStock 31/31 — and on all 5 currently-open positions.**

⇒ `atrAtOpen` is **0 for every live position**, so `atrUnavailableForTrailing` is **true**, the floor block RUNS, and **`:330`'s four decisions cannot engage at all.** Today `:270`/`:279` ARE the live trigger — the reverse of BLOCKER-1's stated consequence.

**POSITIVE CONTROL, because this is an absence claim (rule 29):** the floor path emits `[TEC][P19-B6.5b][F5][ATR_FLOOR]` when it fires. Found in `error.log`: *"BMNR/USD target_hit via hard floor (useTrailing but ATR<=0=0)"*. **Stream control: the same grep on `out.log` returns 0** — PM2 splits `console.warn` to `error.log`, so out.log would have been the wrong instrument.
⚠️ **STATED LIMIT: that line carries a SHADOW trade id.** It proves the floor path EXECUTES and self-reports `ATR<=0`; what establishes it for live positions is the 91/91 absence above, not this line.

⇒ **PLAN CHANGE (supersedes P2-2): P2 MOVES BOTH `:270`/`:279` AND `:330`.** Not because both are live, but because **only one is live and which one is live is a one-line fix away.** Moving only the currently-live pair ships a row that is correct today and silently half-unmet the moment `atr_at_open` starts being stamped — the same "reads shipped, is half-unmet" failure BLOCKER-1 names, arriving by the other door.

## r2-B — BLOCKER-2 ACCEPTED, AND THE GAP IS 30x, NOT 4x — THE APPROVED SCOPE'S B3 IS WRONG ON THIS LANE

`aee:2152` builds `_lsSel` with `maxAgeMs: LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` = **60,000**. Confirmed, and BLOCKER-2 stands.

⛔⛔ **BUT ITS COMPARATOR IS AN xSTOCK CONSTANT ON A CRYPTO-ONLY ROW.** Re-derived at the ref: **`active_fill_max_age_ms` exists ONLY under `server/asset_classes/xstock_spot/`** (`fill-safety-config.ts:45`, `:85`) — there is no crypto row for it. The crypto lane's own freshness bound is **`WS_CACHE_FRESH_MS = 2000`** (`live-pricing-adapter.ts:368`).
⇒ **the ladder ceiling is 30x the crypto standard, not 4x.** `8a` scope B3 and BLOCKER-2 both carry the 4x/15,000 figure; **both are corrected here.** *(This is the third time this project has applied that xStock-only constant to the crypto lane. It is now pinned in the row rather than in a session's memory.)*

**WHY I AM NOT NAMING THE CEILING IN THIS REVISION — stated rather than deferred silently.** It can be set three ways and only one is defensible:
- **2,000 ms** (match the crypto standard) — refuses on an unknown but likely large share of exit cycles;
- **60,000 ms** (status quo) — a loosening Kyle ruled against on 2026-09-03, so it is excluded;
- ⭐ **RISK-DERIVED** — the age at which price can move a material fraction of the **stop distance**. The only one that is a number rather than a preference, and the NO-PATCHES answer.

⛔ **The skip-rate consequence of any of them is UNKNOWN, because the exit-lane age distribution is `P1-OBJ-2` and is still unread.** A-4's 0.64% is the BIRTH lane and remains a prior only.
⇒ ★ **THIS IS THE ONE PIECE OF THE MEASUREMENT WORK THAT IS LOAD-BEARING FOR THE CHANGE — and it is the piece we do not have.** It does **not** justify another observation window: the ceiling is derived from RISK, and the distribution only predicts the skip rate. **r3 names the number with its derivation; the row does not ship before it.**

## r2-C — A-2 WITHDRAWN IN FULL. LANGSTON IS RIGHT, AND MY "CHECK ME" WAS THE RIGHT ASK

Reusing `:227` is **not** a skip. His three side effects are accepted; the third is the one I would never have found: the early return exits before `:305`, `:330` and `:390`, so **a refused cycle does not advance the tick-driven state machines** — high-water, break-even, the rung ladder, and the discontinuity detector's 2-tick deferral. **A skip is a dropped observation, not a no-op.** An excursion landing entirely inside refused cycles is never ratcheted against.
⇒ **P2-3 REPLACED: a NEW no-decision guard placed AFTER step 2's timeout valve, with its own refusal reason distinct from `stale_timeout`.** Not a reuse of `:227`.

## r2-D — BLOCKER-3 ACCEPTED: MY OWN FENCE GOES RED BY CONSTRUCTION

`b-price-side-8a-p1-exit-fence.test.ts:86` forbids `_lsSel` in **either** evaluator argument object; `:99` pins `args[0]` to `/currentPrice\s*,/`. Writing the bid into `args[0]` fails test 2.
⇒ **test 2's subject is retired FOR THE LIVE ARM ONLY and re-pointed at `args[1]` (the shadow); tests 1 and 3 are instrument controls and stay untouched.** Folded into P2-6'.

## r2-E — BLOCKER-4 ACCEPTED: THE F-G-2 SHADOW ARM WOULD BECOME DEGENERATE

`aee:2590` calls the same evaluator with `currentPrice: fg2BookBid`. Once the live arm reads a bid it is bid-against-bid: the discordant cell collapses **by construction**, and F-G-2 pre-registers discordant n=0 ⇒ INCONCLUSIVE-EXTEND, never PASS — **it could never resolve after this deploy.** And the two bids are different objects: mine walks the full ladder (book top **or** ticker sides), the shadow is book-only, so it would be a ladder-vs-book comparison wearing a bid-vs-mid label.
**DISPOSITION (§9.4 #1 — FOLD INTO THE WORK IN HAND):** P2 removes the `aee:2590` shadow arm, **keeping the `bookState` carry**, exactly as the `P-8a` pre-audit row already specifies. Recorded as **P2-7**.

## r2-F — FINDING-1 ACCEPTED, AND THE COMMENT REFUTES ITSELF

The `catch` at `aee:2182` says *"A RECORDER MAY NEVER BREAK THE EXIT LOOP… which would turn a telemetry fault into a skipped stop check."* **Correct for a recorder, self-refuting for a decider:** once `_lsSel` is load-bearing, that same swallow converts a telemetry fault into `triggerPrice = null` into a silently skipped stop check — the precise outcome the comment exists to forbid.
⇒ **P2-8: the SELECTION moves OUT of the swallowed region; only the RECORDING stays inside it.** A selection fault must surface, not be absorbed.

## r2-G — REVISED PLAN TABLE (supersedes §2 where they conflict)

| # | item | from |
|---|---|---|
| **P2-1** | `triggerPrice: number \| null` added to `TECExitInput`; `currentPrice` neither reassigned nor removed. | A-1 |
| **P2-2'** | **BOTH** trigger surfaces read `triggerPrice`: the floor pair `:270`/`:279`, `:330`'s hand-off to `tecUpdatePosition`, and `:390`. Every `exitPrice:` keeps `currentPrice`. | r2-A |
| **P2-3'** | **NEW** no-decision guard after step 2's valve, own refusal reason, NOT a reuse of `:227`. | r2-C |
| **P2-4'** | `aee:2501` passes the ladder bid; `_lsSel` hoisted, **and built with the r3 exit ceiling, not 60,000**. | r2-B |
| **P2-5** | xStock passes `triggerPrice: currentPrice` explicitly — today's behaviour by statement, not by omission. | A-5 |
| **P2-6'** | Tests + the fence re-pointed at `args[1]`; mutation "fall back to the mid" must go RED. | r2-D, A-3 |
| **P2-7** | Remove the `aee:2590` F-G-2 shadow arm, keep the `bookState` carry. | r2-E |
| **P2-8** | Selection out of the swallowed `catch`; recording stays in. | r2-F |

## r2-H — NEW ITEM SURFACED BY r2-A, NOT PART OF THIS ROW (§9.4)

⭐ **THE TRAILING EXIT CONTROLLER IS INERT ON EVERY TRADE WE HAVE OPENED IN 14 DAYS.** Break-even, target-lock, the high-water ratchet and the rung ladder are all gated on `atr > 0`, and `atr_at_open` is absent on 91/91. The hard floor is carrying every exit.

⚠️ **HYPOTHESIS, NOT A VERDICT (rule 24).** Three outcomes are open: a real defect (the stamp was lost), working-as-designed-but-undecided (trailing deliberately parked — note that `break_even_enabled=false` on all four classes since May is a **separate**, known, Kyle-owned switch and must not be conflated with this), or legacy that no longer fits. **The provenance read has NOT been done.**

**HOME: its own row `3b.m` `B-ATR-AT-OPEN-STAMP`, owner CC-C, placed in `PHASE_19_PLAN` immediately after `3n` `B-PRICE-SIDE-BY-JOB`** — it must not precede the price work, and it must not be folded into it.

## r2-I — KYLE, 2026-09-14: *"Should we record the answer instead of dropping it? Is this something we may want to analyze at some point?"* — YES, AND IT REPLACES THE SHADOW RATHER THAN EXTENDING IT

**What is already recorded, corrected against my own chat wording.** I told Kyle the answer "goes into a counter and is thrown away." The PRICE is dropped — that part is right. But the derived COUNTS are not: `_ladderFlushIfDue` (`aee:692-693`) mutates `position.metadata` and **`await`s `storage.updateActiveOpenPosition`**, and the close-time carry writes `metadata.ladderShadow` onto the closed-trade row (`aee:3245`). ⚠️ **So the shadow is not pure telemetry — it is an awaited DB write on the exit path.** *(Surfaced by a fresh claim-only reader; re-derived at the ref before being written here.)*

**What is NOT recorded: the two sides themselves at the decision instant.** `exitProvenance` already stamps `decisionPrice` (`aee:2311`, `:2389`) — **a single number with no side.**

⇒ **P2-9 — STAMP THE DECISION-TIME SIDES ON THE ROW WE ALREADY WRITE.** Add the selected `bid`, `ask`, `basis` (book-top vs ticker) and quote age to the EXISTING `exitProvenance` object, beside `decisionPrice`.

★ **WHY THIS IS THE RIGHT SHAPE, AND WHY IT IS NOT MORE SHADOW WORK:** it makes the change **auditable after the fact instead of gated before it.** With both numbers on the row, *"did moving to the bid help?"* is answerable at any time from records we already write — no observation window, no second instrument, no blocked row. **The shadow measured BEFORE the change and blocked it; this records DURING the change and never blocks.** That is the distinction Kyle's objection was actually pointing at.

⛔ **COST CONTROL, STATED BECAUSE THE CONSTRAINT IS LIVE:** stamp at the DECISION/EXIT instant only — **never per-tick per-position.** Alert `74424570` has the database at **65.3% of the 200 GB cap** and `signal_eval_archive` already grows ~1.5 GB/day. Per-tick sides across every open position is a new high-rate sink; two fields on an existing per-close row is not.

⇒ **AND IT SUBSUMES `P1-OBJ-2`.** The exit-lane age distribution that `r2-B` needs to derive the ceiling becomes a query over stamped rows rather than a pre-registered observation window. **The ceiling still derives from RISK; this only supplies the skip-rate prediction — and it does so from history instead of from waiting.**

## r2-J — READER HITS, RE-DERIVED, THAT DID **NOT** SURVIVE AS FINDINGS

⛔ **Recorded because a clean is not evidence and a hit is only a lead (§8 asymmetry) — both directions belong in the record.**
- **"A throw in the shadow block suppresses signal generation."** Control-flow coupling is REAL — `signal-orchestrator.ts:3335` catches and returns `signals` (possibly zero for that symbol), and `vts-runner:1588`'s nearest enclosing `try` is at `:1239`, far above. **But the only throw path is `keyOf`'s missing-`stage` guard (`level-basis.ts:479-485`), which every production caller passes a literal for and tsc enforces.** ⇒ **structurally unreachable in production; NOT a live risk.** Logged, not escalated.
- ⚠️ **STILL OPEN, NOT DISMISSED: the engine's shadow carries its own `try/catch` and the other two lanes do not.** That asymmetry is not a defect today; it becomes one if any future throw path is added. Folded into **P2-8**'s split rather than homed separately.

**REVIEWER: claim-only (mode B) · "what other states of the world are consistent?" · 3 claims · HITS on the awaited-DB-write and the control-flow coupling · re-derived y**

---

# r3 — BLOCKER-5 ACCEPTED IN FULL. MY ATR EVIDENCE WAS THE WRONG OBJECT TWICE OVER

## r3-A — THE MEASUREMENT WAS A FALSE ABSENCE FROM THE WRONG TABLE

**r2-A's 91/91 figure is WITHDRAWN.** Re-derived at the object, 2026-09-14:

| object | result |
|---|---|
| `closed_trades`, all-time | **758 rows · `atr_at_open` present on 0 · `regime` present on 621** |
| `active_open_positions` | **5 of 5 rows: key PRESENT, value `0`, `jsonb_typeof` = `number`** |

⇒ `closed_trades` carries rich admission metadata and simply **does not have this key in its shape**. My "absent on 91 of 91" measured a key that was never in that table — **a false absence, not a measurement.** The live read is `aee:2461`, off `active_open_positions`.

⇒ ⛔ **AND THE CORRECTED FACT IS A DIFFERENT FACT: PRESENT-AND-ZERO, NOT UN-STAMPED.** `aee:4888` writes `atr_at_open: (signal as any)?.metadata?.atr ?? 0` — **the stamp fires on every open. The site works. The SIGNAL's ATR is zero.**
⇒ **`3b.m` IS RE-SUBJECTED AND RENAMED: `B-SIGNAL-ATR-ABSENT`, owner CC-C, same placement.** The old name pointed at a functioning site — `fix-follows-pointer` on a row created to chase the pointer.

⭐ **AND ONE THING NEITHER OF US NAMED, WHICH I FOUND WHILE RE-DERIVING:** `aee:2461` is `metadata?.atr_at_open ? parseFloat(...) : 0`. **A legitimate numeric `0` is FALSY, so "ATR is genuinely zero" and "the key is absent" resolve to the same cell.** Same outcome today, but the read cannot distinguish them — **a `#546` read inside the very gate this whole argument is about.** Third `#546`-shaped read this batch has surfaced. Folded into `B-SIGNAL-ATR-ABSENT`, not into `8a-P2`.

## r3-B — AND THE LANE WAS WRONG TOO, WHICH IS THE HALF THAT BITES THIS ROW

**All 5 open positions are `xstock_spot`. There are ZERO crypto open positions.** Row `8a` is **crypto-only** by its own P2-OBJ-3.
⇒ **r2-A's "the floor is the live trigger" is EVIDENCED FOR xSTOCK AND UNEVIDENCED FOR THE LANE THIS ROW GOVERNS.** Same lane error as BLOCKER-2, one level down, and I made it twice in one document.

⇒ **THE `ATR_FLOOR` CONTROL IS WITHDRAWN AS SUPPORT FOR DURATION.** `error.log` begins `2026-09-14 00:00:00`; the single hit is 02:42, `BMNR/USD`, a **shadow xStock** id. **n=1 over ~4.5 hours cannot carry "inert on every trade for 14 days"** — `#661` leg 2, instrument reach. **The duration claim is struck, not softened.** What survives: the floor path executes and self-reports `ATR<=0`.

✅ **"P2 MOVES BOTH SURFACES" STANDS** — it never rested on which one is live, only on the fact that which one is live is a one-line change away.

## r3-C — BLOCKER-2's CORRECTION ACCEPTED, AND I VERIFIED IT RATHER THAN TAKING IT

**"30×" is WITHDRAWN.** Re-derived:
- **`WS_CACHE_FRESH_MS` is `private readonly` with exactly TWO appearances** — the declaration `lpa:368` and one use, `lpa:1332`, inside a single venue branch. **It is not a lane-wide standard and may not be cited as one.**
- **`getPriceWithFallback` is called with THREE different literals repo-wide** (tests excluded): **5000 ×9 · 30000 ×1 · 2000 ×2**.

⇒ **THERE IS NO SINGLE "CRYPTO FRESHNESS STANDARD" TO MULTIPLY.** My "30×" was the same class of error as the 4× it corrected — an xStock constant swapped for a private field governing one branch.
⛔ **r3 THEREFORE NAMES NO MULTIPLE AT ALL.** The ceiling is **risk-derived** — the age at which price can move a material fraction of the **stop distance** — and the row states the exit path's own literal at its own call site as context, never as the derivation. **The row does not ship without that derivation.**

★ **PINNED, BECAUSE THIS CONSTANT HAS NOW BITTEN FOUR TIMES:** `active_fill_max_age_ms` = **xStock only**, one site. `WS_CACHE_FRESH_MS` = **private, one branch**. The fallback literals = **three values, per call site**. **Any freshness claim on this project names its CALL SITE, or it is not a claim.**

## r3-D — P2-9's CONDITION ACCEPTED, AND IT IS THE WHOLE POINT OF THE ITEM

**Stamp the REFUSED and SKIPPED cycles too, paired with the new guard and carrying the same reason string.** Stamping only cycles that decided conditions the distribution on exactly the population r2-C established we are dropping — **it would answer the question using only the rows that are not the question.** Added to **P2-9**.

## r3-E — THE FLUSH THRESHOLDS ARE AN EXIT-LATENCY BUDGET, NOT A TELEMETRY CADENCE

`aee:693` `await storage.updateActiveOpenPosition` sits on the exit path. The `try/catch` at `:699` stops it **throwing**, not **delaying** — and by r2-C's own logic a delayed cycle is a dropped observation.
⇒ **`_ladderShouldFlush`'s `LADDER_FLUSH_WALKS` / `LADDER_FLUSH_MS` are restated in-code as an EXIT-LATENCY BUDGET with that reason written at the constant**, so the next reader cannot re-tune them as a telemetry knob. Added as **P2-10**.

---

# r4 — THE THREE PROCEED CONDITIONS, DISCHARGED

## r4-A — CONDITION 1: "NO SINGLE STANDARD" WITHDRAWN AS OVERSTATED, AND THE REPLACEMENT IS SHARPER

**Re-derived scoped and counted, per the census fence below.** `server/`, production only (tests and `verification-test-protocol.ts` excluded):

| literal | production call sites |
|---|---|
| **5000** | **10** |
| **2000** | **2 — of which ONE is a doc comment (`aee:32`) and ONE is a real call: `aee:1891`** |

⇒ **THERE IS A PREVAILING VALUE (5000), AND THE SITE THIS ROW GOVERNS CARRIES A DELIBERATE TIGHTER EXCEPTION (2000).** My r3 claim that no standard exists is **withdrawn** — it was drawn from a mixed population that folded in the parameter default, two doc-comment lines and four test files. *(Langston's own count was 5000 ×8; mine is ×10. The difference is not load-bearing and neither figure is cited below — the SHAPE is what carries.)*

⭐ **AND THE ARGUMENT IS STRONGER AT THE CALL SITE THAN IT EVER WAS AS A REPO-WIDE MULTIPLE.** `aee:1891` — the exit loop's own price fetch — is `getPriceWithFallback(position.symbol, **2000**)`. The ladder that would supply the trigger bid sits **beside it** at `aee:2125` with `maxAgeMs: 60_000`.
⇒ ⛔ **THE EXIT PATH ALREADY DEMANDS A ≤2-SECOND PRICE FOR ITS MARK, AND THE LADDER WOULD HAND IT A TRIGGER UP TO 60 SECONDS OLD — 30×, SAME SITE, SAME LOOP, SAME TICK.** That is not a comparison against a repo-wide number; it is an internal contradiction inside one iteration, and it is the form the row now carries.

⚠️ **THREE SURFACES GOVERN FRESHNESS AND THEY ARE NOT INTERCHANGEABLE** — `getPriceWithFallback`'s window, the per-symbol mark-staleness ceiling (25s/28s/49s in today's live alerts), and `active_fill_max_age_ms` = 15,000 (xStock entry). **Naming the call site is doing real work; a bare number is not a claim.**

## r4-B — CONDITION 2: THE ROW IS RENAMED TO THE DEFECT THAT IS ESTABLISHED, NOT THE ONE THAT IS SUSPECTED

**Langston's point is decisive: `P19-B8.5h` deliberately did NOT carry DI on the xStock lane** (`#377` H1 / `#502`), which is exactly why `di_at_open` reads `50` on all five rows. **A by-design non-carry and a broken carry land in the same cell**, and all five zero rows are xStock — so my ATR zero may be that carve-out's analogue rather than a defect. **Outcome (1) vs (2) is NOT established and the name must not assert one.**

⇒ ✅ **RENAMED: `B-OPEN-STATE-DEFAULT-CONFLATION`** (was `B-SIGNAL-ATR-ABSENT`, was `B-ATR-AT-OPEN-STAMP` — **three names in one night, each aimed at a site that turned out to be working**). Owner CC-C, same placement.

**WHAT THE NEW NAME ASSERTS IS ESTABLISHED AT THE CODE AND IS LANE-INDEPENDENT** — `aee:2461-2463`:
```ts
const atrAtOpen     = metadata?.atr_at_open     ? parseFloat(...) : 0;
const diAtOpen      = metadata?.di_at_open      ? parseFloat(...) : 50;
const volNoiseAtOpen= metadata?.vol_noise_at_open? parseFloat(...) : 0.3;
```
**THREE fields, not one.** A legitimate numeric `0` is falsy, so *"measured as zero"* and *"never carried"* resolve to one cell in all three.
⛔⛔ **AND THE OTHER TWO ARE WORSE THAN THE ATR CASE, WHICH IS LANGSTON'S CATCH AND IT IS THE BEST POINT IN THE EXCHANGE: `0` at least LOOKS like nothing. `50` and `0.3` LOOK MEASURED.** A reader seeing `di_at_open = 50` has no way to know nothing was ever carried — and `50` is precisely the constant `#378` already caught the dead `metadata.DI` read producing.

**OPEN INSIDE THAT ROW, NOT INSIDE `8a-P2`:** whether the crypto lane carries a real ATR. **Unanswerable from today's objects — there are ZERO crypto open positions and `closed_trades` has never held the key.** It is a precondition of that row, not a blocker on this one.

## r4-C — CONDITION 3 ACCEPTED as written: P2-9 stamps refused/skipped cycles with the guard's reason string; P2-10 states the flush thresholds as an exit-latency budget.

## r4-D — THE CENSUS FENCE, ADOPTED AS A WORKING RULE HERE AND NOW

Langston found his own read path silently truncating an unscoped whole-tree grep — **223 lines / 70 `.ts` hits reduced to 60 lines and ZERO `.ts` hits, labelled "Full output," cut alphabetically so `server/` is systematically lost first.** Homed as `B-CENSUS-TRUNCATION-FENCE`, owner Infra Claude, `PHASE_19_PLAN` row 4.51b.
⇒ ⛔ **UNTIL IT SHIPS: EVERY CENSUS IN THIS ROW IS PATH-SCOPED AND HIT-COUNTED, AND r4-A's TABLE WAS PRODUCED THAT WAY.** An unscoped census is a prefix, not a population — **and it fails in the most dangerous direction: it looks complete.**

⇒ **STEP 2 CLOSED. PROCEEDING TO STEP 3.**

---

# r5 — THE CEILING DERIVATION, HALF MEASURED AND THE OTHER HALF NAMED

⛔ **THE ROW DOES NOT SHIP WITHOUT THIS NUMBER, AND I AM NOT INVENTING IT UNDER TIME PRESSURE.** A rushed ceiling on a live stop path is a patch, which rule 15 forbids outright.

## r5-A — THE PRINCIPLE
**The trigger quote may be stale by at most the time in which price can move a MATERIAL FRACTION OF THE STOP DISTANCE.** Rationale: a stale bid costs nothing while price is far from the stop; it costs exactly the error in the exit decision when price is near it. So the ceiling is not a freshness preference — it is *"how long until this quote could be wrong enough to matter against the level it is being compared to."*

## r5-B — HALF ONE, MEASURED
**`closed_trades`, `opened_at` within 30 days, `entry_price > 0` and `stop_loss` non-null — stop distance as a fraction of entry:**

| class | n | p10 | median | p90 |
|---|---|---|---|---|
| **crypto_spot** | **147** | **0.926 %** | **2.909 %** | **5.149 %** |
| xstock_spot | 69 | 2.168 % | 2.604 % | 4.474 % |

⇒ **THE BINDING CASE IS THE TIGHT STOP, NOT THE MEDIAN.** A ceiling safe for a 2.9 % stop is wrong for the p10 trade at 0.926 %, and the p10 trade is where a stale trigger does its damage. **The ceiling derives from p10 (crypto 0.926 %), not from the median.**

## r5-C — HALF TWO, NAMED NOT GUESSED
**Required: the crypto per-second price-movement scale**, so the ceiling solves `move(t) ≤ f × 0.926 %` for a material fraction `f`.
⛔ **WHAT MAY NOT BE SUBSTITUTED FOR IT:**
- **the SPREAD** (crypto median 0.199 %) — a spread is a cost, not a movement rate;
- **`atr_at_open`** — it is `0` on every row we can read (`r3-A`), and `r4-B` has not established whether that is by design;
- **any of the freshness literals** — that is precisely the borrowed-constant error `r4-A` just corrected, arriving a third time.
⇒ **It must be measured from observed price movement over known intervals, on the crypto lane, and it is the FIRST act of Step 3.**

## r5-D — WHAT `f` IS, AND WHY IT IS A DECISION NOT A MEASUREMENT
`f` is the share of the stop distance we accept as decision error. **It is a risk-tolerance parameter, so it is Kyle's if it is ever set loosely — but the direction is fixed by his 2026-09-03 ruling that the exit standard does not loosen**, so r5 proposes `f = 0.10` (a stale trigger may not misjudge the stop by more than a tenth of the stop distance) and escalates ONLY if the resulting ceiling is so tight that it refuses a materially large share of exit cycles. **That trade-off, if it appears, is a Kyle decision and will be put to him as one — not absorbed silently.**

---

# r6 — THE CEILING, DERIVED. **2,000 ms.**

## r6-A — HALF TWO, MEASURED — AND THE FIRST READ WAS CONTAMINATED BY THE SAME `#546` SHAPE

`crypto_spot_ohlc_1m_2026_09`, `interval_begin` within 24 h, `close > 0`. Movement over a known 60-second interval = `(high − low) / close`.

⛔ **FIRST READ, ALL BARS — DO NOT USE:** 147,317 bars / 455 symbols, median **0.0083 %**, p90 0.2786 %, p99 2.5798 %.
⚠️ **50,593 of those 147,317 bars (34.3 %) have `trade_count <= 1`.** A bar with one trade has `high = low = close` and a range of exactly zero. **That is NOT a calm minute — it is an untraded minute**, and pooling the two says "crypto barely moves" when a third of the sample never had the chance to. **Same cell-conflation this row has now found three times** (`r4-B`'s falsy defaults, `r3-A`'s absent key, and here).

✅ **CORRECTED READ — `trade_count > 1`:**

| bars | median | p90 | p99 |
|---|---|---|---|
| **96,724** | **0.0524 %** | **0.4363 %** | **3.4064 %** |

⇒ **the median moves 6.3× once untraded bars are removed.** The contaminated figure would have flowed straight into the ceiling and made it ~6× too loose.

## r6-B — THE DERIVATION
**Budget** = `f` × the tight stop = `0.10 × 0.926 %` = **0.0926 %** of price (`r5-B`, `r5-D`).
**Scaling**: `move(t) = move(60s) × √(t/60)` ⇒ `t = 60 × (budget / move(60s))²`.

| movement percentile | move(60s) | ⇒ ceiling |
|---|---|---|
| median | 0.0524 % | 187 s |
| **p90** | **0.4363 %** | **2.70 s** |
| p99 | 3.4064 % | 0.04 s |

⛔ **THE MEDIAN IS THE WRONG PERCENTILE AND IT IS WRONG IN THE DANGEROUS DIRECTION.** A stop is hit *during movement*, so setting the ceiling from a typical minute sets it for precisely the conditions in which the stop is least likely to fire. **p99 (0.04 s) is below what any feed can deliver** and would refuse everything. **p90 is the defensible choice**: the bound holds in nine minutes out of ten, including the volatile ones where the decision actually matters.

## r6-C — THE ANSWER, AND IT CONVERGES ON A NUMBER ALREADY IN THE CODE
⇒ **CEILING = 2,000 ms** (p90 derivation gives 2.70 s; 2,000 ms is the achievable value below it).

⭐ **AND IT LANDS ON `aee:1891`'s EXISTING 2,000 ms — THE EXIT LOOP'S OWN PRICE FETCH.** An independent risk derivation and the constant already governing the mark agree to within a rounding step.
⇒ **THE TRIGGER AND THE MARK COME UNDER ONE STANDARD, AND `r4-A`'s CONTRADICTION DISSOLVES**: the 60,000 ms ladder ceiling was the outlier all along — not 2,000, and never `active_fill_max_age_ms`.
⛔ **STATED PLAINLY SO IT IS NOT OVERSOLD: this does NOT prove 2,000 was originally chosen for this reason.** It is convergence, not provenance. **The number is now DERIVED rather than INHERITED, which is the property the row needed** — `r4-A` corrected a borrowed constant, and a borrowed constant that happens to be right is still borrowed.

## r6-D — LIMITS, STATED
1. **√t assumes a random walk.** Reasonable over 2–60 s, not exact; it understates jump risk, which argues for the tighter side of the estimate — the direction we took.
2. **The p90 is across all 455 crypto symbols, not weighted to the ones we hold.** Held names may be more or less volatile than the pool. **The ceiling is therefore a pool-level bound, not a per-symbol one** — a per-symbol ceiling is the better instrument and is named as follow-on work, not smuggled in here.
3. **`f = 0.10` remains a risk-tolerance choice, not a measurement** (`r5-D`). At 2,000 ms it costs nothing to hold the line, so **no Kyle escalation is required** — the trade-off `r5-D` reserved for him does not arise.
4. **60-second bars are the shortest history available**; the 2–60 s region is extrapolated into, not observed directly.

⇒ **`P2-4′` IS NOW COMPLETE: `_lsSel` is built with `maxAgeMs: 2_000`, matching `aee:1891`, with this derivation written at the constant.**

---

# r7 — THE THREE RECORD CONDITIONS. **THE NUMBER SURVIVES; THE DERIVATION THAT PRODUCED IT DOES NOT.**

⛔⛔ **LANGSTON'S CENTRAL OBJECTION IS ACCEPTED AND IT IS THE BEST CATCH OF THE ROW: `trade_count > 1` WAS A FREE PARAMETER I CHOSE, AND THE p90 IS NOT STABLE AGAINST IT.** The contamination `r6-A` found is **continuous**, and `> 1` strips only its degenerate end. So `p90 = 0.4363 %` was a value at a threshold, not a property of crypto — **and 2,000 ms converged with the LOOSEST member of that family.** Fourth cell-conflation on this row, and this one is mine.

## r7-A — CONDITION 1: PRIMARY = HELD-NAME, SENSITIVITY = POOL, PUBLISHED WITH THE Δ

**Re-derived by me, not taken on report.** Held names = symbols with a `crypto_spot` close in the last 30 days, joined to `crypto_spot_ohlc_1m_2026_09`, 24 h:

| `trade_count >` | bars | **held p90** | pool p90 | Δ | ⇒ ceiling (held) |
|---|---|---|---|---|---|
| **1** | 27,439 | **0.2567 %** | 0.4359 % | **−41 %** | **7.81 s** |
| 2 | 21,562 | 0.2907 % | 0.5871 % | −50 % | 6.09 s |
| 5 | 13,053 | 0.3737 % | 0.9435 % | −60 % | 3.68 s |
| 10 | 7,435 | 0.4534 % | 1.3485 % | −66 % | 2.50 s |

⇒ **THE POOL WAS NOT CONSERVATIVE, IT WAS WRONG-POPULATION.** ~400 thin names we never trade were driving the p90 up. **Held-name sensitivity across the sweep is 1.77×, against the pool's 4.8×** — the free parameter stops mattering once the population is right, which is the tell that the population was the error.

⇒ ⭐ **THE DERIVATION DOES NOT PRODUCE 2,000 ms. IT PRODUCES A BOUND: ≥ 2.50 s at the most conservative threshold, 7.81 s at the least.** **2,000 ms sits below EVERY cell in that column.**

⛔⛔ **SO THE CEILING SHIPS AS TWO NUMBERS, NEVER ONE, EXACTLY AS REQUIRED:**
> **DERIVED BOUND: ≥ 2.50 s** (held-name, `f = 0.10`, worst threshold in the sweep).
> **SHIP VALUE: 2,000 ms** — a **TIGHTENING below that bound**, chosen to equal `aee:1891`'s mark-loop constant so the trigger and the mark are held to one standard.
⚠️ **STATED SO A FUTURE READER CANNOT MISS IT: if `aee:1891` is ever changed, THE TRIGGER CEILING DOES NOT AUTOMATICALLY FOLLOW.** The bound is the derivation's; the 2,000 is a deliberate match. **Re-derive before dragging one with the other.**

*(Langston's own figures: 55 held symbols, p90 0.2613 %; mine: 68 symbols, 0.2567 %. The gap is a held-set definition difference and is NOT load-bearing — both give a −40 %-class Δ and a bound far above 2,000 ms. **Mine are the ones used above and the query is the one in this commit.**)*

## r7-B — CONDITION 2: THE RESIDUAL, RECORDED — NOT DISSOLVED WITH A PERCENTILE

At 2,000 ms the budget consumed is `move60 × √(2/60)` = `move60 × 0.1826`:

| case | move60 | consumed | **effective `f`** | verdict |
|---|---|---|---|---|
| held p90 | 0.2567 % | 0.0469 % | **0.051** | comfortably inside |
| **held p99** | **0.8385 %** | **0.1531 %** | **0.165** | ⚠️ **exceeds `f = 0.10`** |
| pool p99 | 3.4091 % | 0.6225 % | **0.672** | wrong population, shown for sensitivity only |

⛔ **THE EXPOSURE IS NOT FIXABLE BY A CEILING, AND THAT IS THE POINT OF RECORDING IT.** Holding `f = 0.10` at the held p99 requires **730 ms**, which no feed delivers reliably. **A tighter ceiling does not buy this back — it only converts a mispriced trigger into a refused one.**
⇒ **STATED PLAINLY: in the worst ~1 % of traded minutes on names we actually hold, a 2-second-old trigger can misjudge the stop by ~16 % of the stop distance rather than 10 %.** That is a property of triggering on a quote at all, not of this ceiling.
⇒ **WHERE IT LIVES: `3n.o` (below), whose scope question is exactly the form of the bound.** It is NOT carried as a limitation of `8a-P2`, because `8a-P2` cannot fix it.

## r7-C — CONDITION 3: THE PER-SYMBOL CEILING IS **PLACED**, AND IT DOES NOT NEED A NEW ROW

⛔ **"Named as follow-on" was a non-disposition and Langston was right to refuse it — queued is not placed.** But the correct home **already exists and is already placed**, so minting `3n.q` would duplicate it:

> **HOME: `3n.o` `B-CRYPTO-MARK-AGE-GATE`, owner CC-C, PLACED 2026-09-14 after `3n.n`.**

**Its own scope question, in its own words, is this question:** *"NOT a reflex port of the xStock ceiling: that one is RISK-DERIVED PER SYMBOL from a σ cache, and whether crypto wants that form or a flat one is the scope question, not a formality."*
⇒ **r6/r7 is the risk derivation that row was waiting for, and it now carries two inputs it did not have:** the **bound** (≥ 2.50 s held-name) and the **residual** (`r7-B`'s held-p99 `f ≈ 0.165`, unreachable by any flat value). ⭐ **The residual is itself the argument FOR the per-symbol form** — a flat ceiling cannot be simultaneously right for a 0.26 % name and a 0.84 % name.

## r7-D — `f` AND THE `√t` CAVEAT, BOTH SETTLED ON LANGSTON'S BETTER REASONS

- ✅ **`f = 0.10` HELD — and the `r5-D` escalation is retired for the RIGHT reason, which was not mine.** I said *"it costs nothing."* The real reason: **the effective `f` at the ship value is 0.051, so `f = 0.05` yields the same ceiling. `f` is not load-bearing here at all**, so there is no risk-tolerance choice for Kyle to make.
- ✅ **THE `√t` CAVEAT IS WITHDRAWN AS A WEAKNESS.** `r6-D(1)` called range-over-`t` an approximation. **Langston's reframe is correct: for a MISSED STOP TRIGGER the estimand is an EXCURSION, not a displacement — the stop is hit by the path touching it, not by where the price ends up.** Range-over-`t` is therefore the *right* estimand, not a proxy for one. **Kept, and no longer listed as a limit.**
