# B-AMR-EVGAP-DROP-VISIBILITY — Step-1 scope

**change-class: `non_architecture`**
**Owner:** CC-B · **Date:** 2026-07-28 · **Parent:** #604 (leg A of B-AMR-INPUT-INTEGRITY)
**Authorisation:** Langston approved the instrumentation explicitly — *"instrument the `:156` drop before choosing — approved. It's the residue, it's cheap, it's not a behaviour change, and it's the last invisible drop on this path."*
**Evidence base at a ref:** `1-system-manual/AMR_INPUT_CHARACTERIZATION_2026-07-28.md` + `RUNNING_ISSUES.md` #604.

---

## 0. 🚨 SCAFFOLDING DECLARATION (§9.1)

> 🚨 **THIS BATCH DOES NOT FIX THE AMR EV-GAP INPUT. THE INPUT WILL REMAIN ABSENT ON ~98% OF CRYPTO CYCLES AFTER THIS BATCH SHIPS.**
> It makes **one currently-invisible drop countable**. It changes no behaviour, recovers no observations, and moves no threshold. Its entire product is a number we cannot obtain today.

---

## 1. Why this is worth a batch of its own

`server/services/amr-weather-report.ts:156` is the first line of `feedEvGapObservation`:

```ts
if (!Number.isFinite(predictedNetEv) || !Number.isFinite(realizedNetPnl)) return;
```

It **logs nothing, counts nothing, and mutates nothing.** An observation that dies here is indistinguishable from one that was never offered.

★ **This is not merely one unmeasured item — it is the reason candidate (a) cannot be excluded or confirmed.** Every attempt to size it today has failed, and each failure taught the same lesson:

| attempt | why it failed |
|---|---|
| the store's `sample_count` (8,334) | counts successful **writes**, after the guards — a low total is *consistent with* the drop, not evidence against it. Window is also a mixed floor (durable persistence only from 2026-05-25; `/tmp` wiped on restart before; 7-day hard expiry each start). |
| `PERSIST 60 = [B67.4] 60` | covers `:1083` → `:1094` → `updateEma`'s success line. **`feedEvGapObservation` fails silently inside that span and leaves nothing to count.** |
| `updateEma`'s two logged guards | ⚠️ **tests a DIFFERENT OPERAND.** `updateEma` guards on `netPnlPct` (from `tradeData.pnl`); `:156` guards on `predictedNetEv` = `expectedEdge * 100`. **An undefined `expectedEdge` drops at `:156` and passes `updateEma` cleanly** — so these warns are blind to exactly the failure we suspect. |

⇒ **The one measurement that would settle it is blind to the thing being looked for.** That is the definition of a visibility defect, and it is why this precedes any fix decision.

## 1b. ★ PROVENANCE READ (§2 MANDATORY 1.b — Kyle directive 2026-07-29; RETROFITTED to this already-approved scope, because the rule does not grandfather)

> ⚠ **This section was ABSENT when Step-1 was approved. Added before Step-2.** ★ **And this batch's own sibling is the case FOR the rule: `#607 B-VTS-FRICTIONCOST-NAN` was scoped, homed, sequenced-first and APPROVED to fix a "7.3% corrupted cost figure" that turned out to be maker/taker TWIN rows correctly carrying no cost of their own. Nobody asked what `persistTwinClosedRecord` was BUILT TO DO. The intent read would have killed it at Step-1 instead of after approval — and would have pre-empted two independent wrong measurements (CC-B's AND Langston's).**

**Archaeology (`git log -S … --reverse`, then the introducing commit's message):** every component this batch touches was introduced **on 2026-06-11 by B-5**, the AMR body batch — `feedEvGapObservation` + the EV-gap window + the ledger writer at **`0e62ad97f`** (chunks 3+3b+5b), and `ev_gap_window_n` at **`ed9be95cd`** (chunk 1).

| component | ORIGINAL INTENT (from the introducing commit) | disposition |
|---|---|---|
| `feedEvGapObservation` / the EV-gap window | Introduced as part of the **"M2 score contract w/ caps-not-overrides"** — i.e. a **calibration-honesty input** to the weather score, deliberately expressed as a **CAP** on optimism rather than an override. ★ **"M2" is the machine-learning seam** — this input exists so the eventual ML bolt-on inherits a predicted-vs-realized signal. | **(1) still relevant and correct.** Its purpose is intact; nothing about it is being changed by this batch. |
| `ev_gap_window_n` (crypto 100 / xstock 30) | Seeded in a migration of **"~140 provenance-commented seeds (friction/DBS distributions captured pre-seed per Pull-in B)"**. ★ **The values were CAPTURED FROM MEASURED DISTRIBUTIONS, not chosen arbitrarily** — which materially raises the bar for changing them. | **(2) relevant, may need updating to today's intent** — but **NOT by this batch**, and #604 leg (a) must argue against the measured-seed provenance, not around it. |
| the `:156` guard | Present from the same introduction as a **defensive input-validation guard** on a public feed function. **No evidence it was ever intended to be a silent DISCARD of a learning observation** — the silence reads as an unexamined consequence of a standard `!isFinite → return`, not a decision. | **(2) relevant but needs an update to today's intent** — **this batch's whole subject.** The guard stays; its silence does not. |
| the ledger `weather` json / `recordWouldBlock` relay | Introduced in the same commit as the ledger writer; the drain pattern's own comment says it **"avoids a second write path."** | **(1) still relevant and correct** — which is precisely why amendment 1 REUSES it rather than adding a counter. |

★ **WHAT THE READ CHANGED IN THIS SCOPE (a provenance section that changes nothing is a rubber stamp):** the `ev_gap_window_n` seeds being **measured-distribution-derived** is new information, and it **strengthens the case against #604 leg (a)'s constant split** — lowering 100→30 is not a free knob-turn, it discards a value captured from a real distribution. **Recorded here so leg (a) cannot later be argued as a trivial config change.**

## 2. Objectives

**OBJ-1 — make the drop countable, SPLIT BY PRECONDITION.** Langston's condition, and the reason for it: *"a bare counter reproduces the defect one level up — it tells you drops happened, not which precondition fired. **Count is not a set.**"*

**THREE distinct preconditions can produce this drop, and they are not interchangeable:**

| # | precondition | why it matters |
|---|---|---|
| 1 | `tradeData.expectedEdge` **present but NaN** | ★ the live H1 — **`??` does NOT catch NaN.** Requires `taker.netEV` to arrive *as NaN*, not missing. |
| 2 | the `:928` fallback itself NaN | ⚠ **TRIPWIRE, NOT A LIVE CANDIDATE (Langston, at the ref).** The `??` at `:1119` can fall through on **exactly one** path — `vts-runner.ts:2658`, `expectedEdge: persistedTrade?.expectedEdge ?? null` (**restart-recovered trades**). ⇒ **a hit here means "a recovered-trade close" — specific, useful, and worth having said IN ADVANCE.** |
| 3 | `realizedNetPnl` non-finite (`tradeData.pnl * 100`) | independent leg, **nothing to do with `a8242a3bc`** |

★★ **CONSEQUENCE FOR PLACEMENT — this changes the design, not just the payload.** At `:156`, preconditions **1 and 2 are indistinguishable**: both present as "`predictedNetEv` non-finite," because the `??` has already collapsed them into one value. **Telling 1 from 2 requires recording whether `tradeData.expectedEdge` was present/finite at the CALL SITE (`vts-service.ts:1119`), before the `??` resolves.**
⇒ **Instrumentation goes in TWO places: the `:156` guard (which argument failed + `assetClass`) AND the `:1119` call site (was `tradeData.expectedEdge` absent / NaN / finite).** A `:156`-only counter answers the smaller question and would send us back for the rest.

★★ **AMENDMENT 1 (Langston, ruled against the file rather than the tradeoff): THE DURABLE HALF GOES IN THE LEDGER — NOT A COUNTER, NOT A LOG.**
I had asked counter-only vs counter+log. **Both were wrong.** `amr_decision_ledger` already writes **every cycle per class** (134,595 crypto cycles / 47 days) with a **90-day** in-service prune, and **this exact pattern lives 370 lines below the line being changed**: `recordWouldBlock` / `drainWouldBlocks` (`amr-weather-report.ts:525-543`), whose own comment says it *"avoids a second write path."*

**Design:** accumulate per-class drop counts in an in-memory relay; **drain onto the next row's `weather` json.** That buys three things a bare counter cannot:
1. **90-day durability** instead of out.log's ~2 days;
2. ★ **a known interval for free** — every row carries `cycleTs`, so it reads as a **RATE, not a bare count.** *(A bare in-memory counter is zeroed by every deploy, and we would be quoting "since last restart" without knowing it — exactly the mistake the 8,334 figure already made once tonight.)*
3. **zero flood risk by construction.**

Keep a log line as the **convenience** half only, and emit on **stderr (`console.warn`)** — matching `:517`/`:573`/`:585` and `vts-service.ts:1123` — **never `console.log`** (out.log is ~2-day retention; a `console.log` signal evaporates before anyone asks).

⚠ **PRECONDITION, STATED NOT ASSUMED (Langston):** `amr-weather-report.ts:576` **`continue`s a `disabled` class BEFORE any ledger write.** ⇒ the ledger route only records for a class that is shadow-or-active. **Crypto is — the 134,595 rows prove it.** If a class is ever disabled, its drops go unrecorded by this mechanism, and that is a known limit rather than a silent one.

⛔ **AND A RATIONALE OF MINE THAT WAS BACKWARDS (Langston) — recorded because the ledger route above supersedes the CONCLUSION but not the LESSON.** I wrote *"the counter is the durable half, the log merely convenient."* **False as stated.** `trackers` is a module-level in-memory `Map` with **no rehydrate path** — my own characterization doc says so at `:47` — so **a counter hung off `ClassTrackers` is zeroed on every deploy and restart, exactly like `evGap`.** The real durability ordering is: `console.log` → `out.log` (rotates 6-8×/day at 1G, **~2 days**); `console.warn` → `error.log` (daily rotation, `retain=14`, **~14 days**). ⇒ **the LOG is the more durable of those two, and only on stderr.** *(The ledger beats both at 90 days, which is why amendment 1 wins — but I had the counter-vs-log ordering inverted, and would have argued it confidently.)*

★ **THREE BINDING CONSTRAINTS ON THE LOG HALF (Langston):**
1. ★ **THE COUNTER INCREMENTS UNCONDITIONALLY — ONLY THE LOG *LINE* IS RATE-LIMITED.** *The standard trap is suppressing BOTH, which reintroduces the silent drop under exactly the load where it matters most.*
2. **The suppressed count must appear in the periodic summary** — a rate-limiter that hides its own suppressions is the same defect one layer up.
3. **Any in-memory read must be ANCHORED TO PROCESS START — state uptime alongside the number.** Otherwise a mid-window deploy silently resets the interval and **a small number reads as a small effect.** *(The ledger route gets this free via `cycleTs`; this constraint binds any counter read that does not go through it.)*

★★ **AMENDMENT 3 (Langston — the real gap; it would have cost a second batch): OBJ-1 AS ORIGINALLY SCOPED CANNOT SAY *WHICH SOURCE* PRODUCED THE NON-FINITE `predictedNetEv`.**
`vts-service.ts:1119` is `tradeData.expectedEdge ?? expectedEdge`, where the local (`:928`) is `tpDistance - frictionCost`. **Two different bugs with different fixes collapse into one counter:**

| source | signature | fix lives in |
|---|---|---|
| **carried-in value present-but-non-finite** | a **NaN `taker.netEV`** — ⛔ **NOT a "07-14 re-source signature"; see the misattribution note below** | the `taker.netEV` producer |
| **nullish → fell through to a local compute that went NaN** | bad `takeProfit` / `frictionCost`, or `entryPrice === 0` | the VTS cost path (**#607**) |

⛔⛔ **MISATTRIBUTION CORRECTED — THE SUSPECT COMMIT IS THE WRONG ONE (Langston, full-patch read at `450efae94`).** `a8242a3bc` touches `expectedEdge` in **exactly one place: `xstock_spot/eval-cycle.ts`**. **ZERO `expectedEdge` hunks in `vts-runner.ts`** (grep-verified across all 5 files of the patch). The **crypto** producer is stamped in-code as **`#558 A3`** (`vts-runner.ts:2056` — *"expectedEdge re-sourced off the retired finalScore onto the kernel NET EV"*), and both `:2065`/`:2235` emit `entryPrice > 0 ? taker.netEV / entryPrice : 0` — **always assigned, and `entryPrice === 0` yields 0, not NaN.**
⇒ **`a8242a3bc` does not produce the value H2 was about, so every "07-14 `expectedEdge` re-source" attribution for the CRYPTO path is wrong**, and my H2 refutation **cannot bear the weight I put on it. H2 reverts to RULED ON REPORTED FACT.**
⇒ ★ **THE OUTSTANDING DIFF READ IS `#558 A3`'s, NOT `a8242a3bc`'s.**
⇒ ★★ **AND THE DATE ORDERING NOW BREAKS THE WHOLE 07-14 STORY: `#558 A3` is `90f6a3f72`, 2026-07-27T23:31:13Z — FOURTEEN DAYS AFTER the last ev-gap day (07-13).** A change that landed on 07-27 **cannot** have caused a discontinuity on 07-14. **The 07-14 boundary is therefore NOT an `expectedEdge` re-source at all, and its cause is unexplained again.** *(H1-re-derived still holds as a MECHANISM — a NaN `taker.netEV` is the only route in — but it is now detached from any dated commit.)*

★ **`:156` only ever sees the PRODUCT — it is structurally incapable of separating them.** My own argument for splitting the operands applies **harder one level up the call**. ⇒ **tag it at the call site (`:1119`); it is a boolean.** Without it, OBJ-1 lands, reports *"N drops on `predictedNetEv`"*, and **the very next question needs another batch and another soak.**

★ **OBJ-1b — AMENDMENT 2 (Langston): `realizedNetPnl` IS UNREACHABLE ON TODAY'S ONLY CALLER PATH — KEEP THE LEG, AND *STATE* THAT.**
`vts-service.ts:1094` already guarantees `Number.isFinite(tradeData.pnl)`, and `:1105` is `pnl * 100`. ⇒ **on the sole caller repo-wide, that leg of the `:156` guard CANNOT fire.**
⇒ ★ **This makes the three-way split MORE valuable, not less: a non-zero `realizedNetPnl` count would not be a diagnostic nicety — it would be PROOF of a second caller or a changed upstream guard.** The earlier draft presented the three buckets as equally live, which understated what one of them would mean.
*(This is a structural fact derived from an outer guard, **not a predicted outcome** — it says nothing about the disputed magnitude, so it does not violate §4 or #606.)*
⇒ **precondition 3 of the table above is dead on today's path; it is retained as a TRIPWIRE, and the scope says so.**
⚠⚠ **AND THE COROLLARY THAT MUST BE WRITTEN DOWN OR SOMEONE WILL LATER QUOTE IT (Langston): A ZERO IN BUCKET 3 IS NOT EVIDENCE OF ANYTHING.** It is a gauge with a **permanently-pinned needle** on today's call path. **Only a NON-zero reading carries information.**
★ **USEFUL CONSEQUENCE, and it makes the batch STRONGER not weaker: the counter therefore collapses to preconditions 1+2 — i.e. it is a NEAR-BINARY TEST OF `expectedEdge`.** That is a sharper instrument than the three-way split it replaces.

★★ **OBJ-1c — THE COUNTER MUST EXCLUDE MAKER/TAKER TWIN ROWS, OR IT RE-MEASURES AN ARTEFACT WE ALREADY DISMISSED (added 2026-07-28 after #607 closed as NOT-a-defect).**
`persistTwinClosedRecord` (`vts-service.ts:783-836`) writes a **counterfactual** row whose literal sets `mtTwin: true`, `mtPairId`, **`countsInAggregates: false`**, and **never sets `frictionCost` / `expectedEdge` / `finalScore`** — correctly, because those belong to the DECISION, not to the counterfactual leg.
⚠ **THIS EXACT SHAPE ALREADY PRODUCED A FALSE DEFECT: a "7.3% non-finite `frictionCost`" reading that was twin rows counted as primary trades — measured INDEPENDENTLY AND WRONGLY BY BOTH CC-B AND LANGSTON, and it got a batch scoped, homed, sequenced FIRST and approved before two read-it-first checks killed it.**
⇒ **REQUIREMENT: filter on the writer's own declaration — `countsInAggregates: false` (and/or `mtTwin`) — NOT on field-presence.** ★ **The writer already states these rows are not to be aggregated; a counter that ignores that declaration is repeating the mistake with a new number.**
⇒ **AND STATE THE EXCLUDED COUNT SEPARATELY** — a silently-filtered population is the same failure this batch exists to fix, one level up.

**OBJ-2 — no behaviour change.** The `return` stays. No observation is admitted that is not admitted today. **This batch must be provably inert to trading behaviour** — that is a verification criterion, not an aspiration.

**OBJ-3 — state the taxonomy for THE SILENCE, and for nothing else.** A silent discard on a learning input is a defect **regardless** of how many observations it is losing. Record **bucket 1 on the *visibility* axis**, independent of whatever the magnitude turns out to be.
⚠ **EXPLICITLY (Langston): bucket 1 is assigned to THE SILENCE — NOT to the non-finite `predictedNetEv` itself.** The latter is precisely what OBJ-1 exists to bucket, and it may well turn out to be **#607**'s NaN `frictionCost` or correct-behaviour-reported-honestly. **A later reader will conflate the two unless this says otherwise.**

## 3. Explicitly OUT of scope

- ❌ **Splitting `ev_gap_window_n`** (#604 leg (a)) — parked; it was never the volume cause.
- ❌ **Changing what feeds the window** (#604 leg (b)) — **Kyle's decision, not CC's.**
- ❌ **Fixing whatever makes `expectedEdge` undefined** — cannot be scoped before OBJ-1 says whether it happens.
- ❌ **The routing finding** (#604 leg (c)) — the ~60-closes/day volume answer stands on its own and needs no code here.

## 4. Verification

- Unit: non-finite `predictedNetEv`, non-finite `realizedNetPnl`, both, and the clean path — assert the counter increments correctly **and that the clean path still pushes**.
- Live (§9.3): after deploy, read the counter over a known interval and **state (a)'s magnitude directly, not by subtraction.** Near-zero ⇒ (a) genuinely excluded and the conclusion is *earned*; large ⇒ (a) is dominant and the 07-14 `expectedEdge` re-source becomes the prime suspect again.
- ⚠️ **The result is not predicted here.** Writing an expected outcome into the scope of a measurement designed to settle a disputed question is how the measurement stops being one (#606).

## 5. Governance

Tier 1 per §3. ★ **SIM: WRITTEN, not judged at close (Langston) — adopting the ledger route makes this non-discretionary: a new observability field on the ledger's `weather` json IS a SIM-scope change.** The earlier "judge at close" wording stopped being a judgement the moment amendment 1 was accepted. System Manual: **not applicable** (no architecture, math, or pipeline change). #604 updated with the measured magnitude when it lands; **#606** carries the method note.
