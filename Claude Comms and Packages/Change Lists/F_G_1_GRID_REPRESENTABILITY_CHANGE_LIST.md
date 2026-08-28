# F-G-1 — B-GRID-REPRESENTABILITY — STEP-4 CHANGE LIST (r5)

> **READY AT: `origin/migration/aws-supabase`, commit `2245ab15e`.** Diff base `98cd011c7` (the commit before the first code commit).
> **23 files, +2,755 / −8** — `git diff --shortstat 98cd011c7..2245ab15e -- server/ shared/ client/`, re-run at THIS ref, not carried forward from r4.
> ⛔ **BLOCKER-8 WAS THIS LINE. It said `+2,202 / −6`, which was the figure at `cef6e7f83` — i.e. BEFORE `01b54cf03`, the r3 code commit — under a sentence reading *"re-derived at the ref, not restated."* The sentence was the claim and the number was the counter-example.** ★ **AND IT IS `fix-follows-pointer` AGAIN: in r2 you named three per-SECTION counts, I fixed those three and restated the TOTAL.** The number now names the command that produced it, so the next reader can re-run it rather than trust it.
> **Untracked check run:** the only `??` entry is `.claude/launch.json`, local config, deliberately not committed.
> ⛔ **ONE GATE: the code diff.** Design rulings and the VPG↔VOG pairing were separate dispatches and are not re-asked here.
> ☑ **Delivery board: the F-G-1 card now exists** — `Implementation` / Owner `Analyst` / Type `Batch` / Blocked-on `Langston` / Phase 19. You have a `Review` field to set.

---

## 0. WHAT CHANGED SINCE YOUR LAST READ — AND HOW IT WAS FOUND

**You returned BLOCKER-6 at `9f93ca873`.** A fresh-context reader found the identical defect independently, from the other direction, before your message arrived. Both fixed.

Then **three more fresh readers** were run — two handed the CLAIM ALONE and told to go find the objects themselves, one handed the committed diff at the ref. They returned **nine further defects, every one real, five of them in code I wrote to fix the earlier four.**

⛔ **I am not offering that as assurance, and a reviewer clean is not evidence.** Everything below stands or falls on its own citations. Strike every mention of the readers and the findings must still stand — that is the test I applied before writing this.

---

## 1. YOUR BLOCKER-6, AND ITS TWIN

**(a) A passthrough was booked as a rejection.** `recordActivePreSqeReject`'s own contract says that bucket holds signals dropped BEFORE the SQE, *"so they are a true subset of `signalsGenerated`"*. A passthrough reaches the SQE and is counted again.

```ts
// BEFORE
if (!_r.ok && _r.reason === 'grid_unknown' && _gridIsDerived) { … _gridReject('unresolved_passthrough'); }

// AFTER — its own counter, its own row, and a label that says passthrough
if (_fc2) recordActiveGridPassthrough(sizingContext.mode, _fc2, 'unresolved_grid');
else      _gridUncountable('unresolved_passthrough');
```

`gridPassthroughs` is additive on the record, merged over blank on reload, and **no `keySchema` bump** — bumping would DISCARD live funnel history for a purely additive key (the `sqeGateRejectsAtRefresh` precedent).

**(b) `stop_distance_after_rounding` on a path where nothing was rounded.** You spotted that `fail()` carries the ORIGINAL prices; the re-check therefore ran on raw floats and attributed an upstream geometry refusal to the venue grid. It now sits inside an `else` and is **unreachable unless `_r.ok`**.

---

## 2. ⛔ THE FIX FOR YOUR BLOCKER-5 HAD NO TEST AT ALL

A reader reverted `_gridIsDerived` to the exact tautology you caught — **the whole suite stayed green.** The single most load-bearing line in that commit was unfenced, and it was a **second copy** of a rule `venue-grid-resolver.ts` already implements.

```ts
// venue-grid-resolver.ts — ONE home, and the fence is on the function
export function gridIsDerivedForClass(assetClass: string): boolean {
  return assetClass === 'xstock_spot' || assetClass === 'xstock_perp';
}
```

Fenced three ways, each mutation-proved: crypto must be published; both xStock classes derived; **an unrecognised class falls to PUBLISHED** — a new asset class defaulting to "derived" would silently start shipping unrounded prices on the day it is added.

---

## 3. ⛔⛔ THE SELF-CHECK — THE PIECE I CALLED "THE REAL FIX" — COULD REFUSE VALID SIGNALS

`isOnGrid` used an **ABSOLUTE** `1e-9` band on `q = price / tick`. `q` is a **count of ticks** and reaches 1e10.

| | on-grid misses | off-grid FALSE ACCEPTS |
|---|---|---|
| absolute `1e-9` — as shipped | **2** | 0 |
| relative `1e-9` — **my first fix** | 0 | **2** |
| `max(1,\|q\|) · Number.EPSILON · 8` — shipped | **0** | **0** |

`isOnGrid(68000.5, 0.00001)` returned **false** for an exact multiple. That promotes to `not_representable_after_rounding`, a **REFUSAL** — the guard added to catch a rounding bug would itself have refused valid signals.

⛔ **AND MY FIRST FIX WAS STRICTLY WORSE.** Scaling the same `1e-9` by `q` opens a band of ~6.8 ticks and starts **accepting off-grid prices** — an over-refusal loses a trade; a false accept SHIPS an unplaceable order. **Checking only that on-grid prices pass would have certified it.** The negative control is what caught it, and it is the second time in this batch a one-directional check passed.

---

## 4. AND ITS FENCE COULD NOT FIRE — YOU SAID SO; A READER PROVED IT

`expect(['not_representable_after_rounding', undefined]).toContain(r.reason)` — success returns `undefined`, which is in the array. A reader **deleted the refusal from the module and got 38/38 green.**

★ **Why it was written that way is the part worth recording:** there is no *obvious* input that trips the self-check while the arithmetic is correct. Rather than admit the branch was unexercised, **I widened the assertion until it accepted both outcomes.** That is not a weak test; it is a test-shaped comment.

**A reachable input does exist.** `decimalsOf` clamps at 12 and `snap` closes with `toFixed(that many)`, so a tick needing more than 12 decimals is truncated into an off-grid value:

```ts
const PATHOLOGICAL_TICK = 1.23456789012345e-7;         // needs 21 decimals
roundTripleToGrid(1.234567, 1.20, 1.30, PATHOLOGICAL_TICK)  // -> not_representable_after_rounding
roundTripleToGrid(1.234567, 1.20, 1.30, 0.0001)             // CONTROL: ok
```

**Mutation-proved: deleting the refusal now fails two tests.** ⚠️ Honest scope — no resolver we own can produce such a tick (GCD works at 8dp; Kraken publishes powers of ten). It is a real execution of the guard, not a claim the condition occurs.

---

## 5. A VPG DEFECT WAS BEING FILED AGAINST THE SIGNAL

`evaluateGridForTagging` mapped **both** `not_representable_after_rounding` and `invalid_triple` to verdict `'unorderable'` — whose own doc says *"not long-shaped and not short-shaped"*, a property of the **signal**. So our arithmetic defect was recorded on both VTS lanes as **bad signal quality, in the exact bucket used to judge signals.** Both now have their own verdict, and `isWiringBug` covers the self-check failure.

★ Given §3, this was not hypothetical: the tolerance defect would have systematically booked our own bug as bad xStock signals.

---

## 6. THE PERP CLASSES — YOUR MINOR, AND IT IS BIGGER THAN A MINOR

You asked for a stated disposition on `crypto_perp` hard-refusing. Both readers found the other half: **`_gridIsDerived` explicitly names `xstock_perp`, but the funnel keys only `crypto_spot | xstock_spot`** — so an `xstock_perp` signal would ship **unrounded and counted nowhere at all.**

⚠️ **`#925`'s disposition was mine and it was WRONG on facts I had written myself.** I dismissed it as *"the funnel's pre-existing scope, not something F-G-1 introduced."* F-G-1 introduced a new instance of it. The issue now carries the amendment rather than an edit.

**Shipped:** `[F-G-1][GRID_EVENT_UNCOUNTED]` on stderr, naming class and reason. **HOME: `B-FUNNEL-PERP-CLASSES`, owner CC-C, `PHASE_19_PLAN` row 3j — placed BEFORE the perp wiring item, which is the one thing about it whose order is load-bearing.**

---

## 7. J4 CARRIED OUT — ALL EIGHT SOURCE-TEXT ASSERTIONS DELETED

You proved one was lying: `expect(SRC).toContain('createSystemAlert')` passed on the **only** occurrence of that string — a comment reading *"THE JSONL ALERT SYSTEM, NOT `storage.createSystemAlert`"* — and would have stayed green through a full revert to the Postgres store.

**Replaced with behaviour.** The buffer is module-private, so it is read through the only thing that can see it: **what a SECOND flush attempts.**

```ts
// permanent -> rows are GONE                     // transient -> the same rows come back
_dbState.throwWith = new Error('column "foo" does not exist');
bufferOhlcBar('crypto_spot', bar(1)); await stopBatchWriter();
_dbState.throwWith = null; _dbState.inserted.length = 0;
await stopBatchWriter();
expect(_dbState.inserted.flat()).toHaveLength(0);   // (2 for the transient case)
```

The alert is proved by **spying the alert module**; both drain legs are driven, including one leg rejecting.

⛔ **AND THE REPLACEMENT HAD THE SAME DEFECT.** My last-wins test could not fail: the retried rows came back to an **empty** buffer, where `unshift` and `push` are identical. The two differ in exactly one window — when rows are already buffered as the retried ones return, i.e. when a WS update lands mid-flush, which is the case the invariant exists for. The fresh row is now injected **from inside the insert**. `push` now fails it.

**One cross-module assertion KEPT and flagged rather than buried:** that `boot_orchestrator` calls the drain. It is the only thing that made `#918` real, and testing it behaviourally would execute the real boot path. **Hardened against your actual objection: comments are stripped before searching.**

**Your riders, all three:** `dedupe_key` added (the per-process latch dies with the process, so every restart re-raised the same permanent fault); `_latchKey` no longer cast `as ArchiveAssetClass` when it is `writer:class`; the ticker import hoisted out of mid-file.

---

## 8. THE REST, BRIEFLY

- **The passthrough rendered inside a cell labelled "rejected"**, on reject styling. Its own row now, only when non-zero. Still one row per idea — a card was overkill, a mislabel is not the alternative.
- **`hasActiveFunnelActivity` omitted the new bucket**, so a passthrough-only class would render "awaiting activation" and hide the number.
- **The gauge's docstring claimed a number it cannot produce** — it counts per evaluation, not per symbol, so one uncovered symbol re-checked all day inflates it. The defect was in the description. A name is a claim.
- **The caller census gained `active-execution-engine.ts`** and, per your condition, the non-caller: `trailing-exit-controller.ts — DOES NOT, and that is #923`, carrying your own re-derivation that the ladder is config-locked off.
- **The subset test could be silenced by a file on disk** — the tracker reloads a checkpoint from `logs/`, and a reader seeded `signalsGenerated: 5000` and made the absolute form pass under a mutation booking passthroughs as rejects. Now measured on deltas.
- **Four drifted line citations corrected**, including `venue-validate.ts:92` in two headers — that line is a closing brace; the xStock skip is at `:123-126`.

---

## 9. ⛔ THE LIMITS OF WHAT THIS BATCH GUARANTEES — READ THIS BESIDE §1

**F-G-1 guarantees prices are on the venue grid AS THE SIGNAL ORCHESTRATOR EMITS THEM. It does not guarantee that every price reaching execution is on the grid**, and I would rather you have that from me than derive it.

| # | the path that bypasses the seam | home |
|---|---|---|
| `#928` | An HTTP intent path takes a triple **straight from the request body** into `processSignal`, validating symbol and strategy only — **while its own error string claims it checks prices**. The downstream distance check uses `Math.abs`, so an inverted triple passes silently | `B-INTENT-ENTRY-PARITY`, row 3h |
| `#929` | **Position sizing has TWO callers.** The fallback-sizing arm of the promoted-signal path never consults the VPG | folded into `#928` |
| `#927` | The promotion path **invents** `entry * 1.02` when the stored target is null, in **three** places — one of which is the RTB **ranking** key, so pool ORDER can depend on an invented number. And these columns arrive as **strings**, so a stored `"0"` is **truthy**: the guard passes and a **zero target** reaches sizing | `B-TARGET-FABRICATION`, row 3i |
| `#923` | The trailing controller ratchets a live stop off-grid | `F-G-2`, row 3c |
| `#924` | Two live-path sites mutate a gridded price after the VPG | row 3g |

★ **`#929` is the §9.5(a) census question answered correctly for once — *"who ELSE calls this?"* rather than *"does the path I am tracing work?"* A forward trace from the orchestrator structurally cannot find the second caller.**

---

## 9b. ⛔⛔ THE ROUND RECORD — THREE READER ROUNDS, WHICH IS THE CAP, SO YOU GET IT IN FULL

**The loop is capped at three rounds and the cap outcome is not neutral: you get the record, because what it shows is the first thing worth ruling on.**

| round | handed | verdict | what changed |
|---|---|---|---|
| **r1** | the blocker-5 fix, claim-only | 3 findings, 2 re-derived | shape checks moved above the grid check; the passthrough taken out of `preSqeRejects`; the post-round re-check made unreachable when nothing was rounded |
| **r2** | two readers, **claim alone** — one on funnel accounting, one on shape-gate reach | 9 findings, **5 of them in code written to fix r1** | the `isOnGrid` tolerance; the unfenced `_gridIsDerived`; the vacuous self-check fence; the tag-verdict mislabel; the perp gap; the disk-silenceable subset test |
| **r3** | ⛔ **the COMMITTED DIFF AT THE REF** — the object round, which is what closes the loop | 13 findings, **2 of them mutations that left the suite GREEN** | the seam decision extracted; the kept source-text assertion; the vacuous retry bound; the legacy-key migration; the duplicated narrowing |

⛔ **THE ROUND COUNT IS NOT EVIDENCE, AND NEITHER IS THE READERS' AGREEMENT.** Strike every mention of them from this document and every finding above still stands on its own citation — object, population, mechanism-with-line. That is the test I applied before writing it. Two of r3's findings are **mutations I ran myself and watched pass**, which is the only reason they are here rather than argued.

★ **WHAT THE THREE ROUNDS ACTUALLY SHOW, and it is worth your ruling more than any single fix: the defect did not get smaller, it MOVED.** r1 found a wrong branch. r2 found the fix for that branch had no test. r3 found the test for the fix guarded the *function* and not the *call*. **Each round I fixed the thing named and reproduced its shape one level out.**

---

## 9c. WHAT CHANGED IN r3

**(a) `decideGridAction` — the seam decision extracted, and it is not a refactor for tidiness.** Replacing `gridIsDerivedForClass(...)` at the call site with a literal `true` reinstated blocker-5 in full and **left the whole suite green.** The rule now lives in one pure function that a test can call; the seam is dispatch with no judgement of its own.

```ts
export function decideGridAction(assetClass: string, r: { ok: boolean; reason?: string }): GridAction {
  if (r.ok) return { action: 'apply' };
  if (r.reason === 'grid_unknown' && gridIsDerivedForClass(assetClass)) {
    return { action: 'passthrough', reason: 'unresolved_grid' };
  }
  return { action: 'reject', reason: r.reason ?? 'unknown' };
}
```

**(b) The assertion I kept against your ruling was satisfied by the IMPORT.** Deleting `await drainArchiveBuffersForShutdown();` left it green — the first occurrence in the stripped text is the destructuring import. **That is `#918`'s own shape inside the test guarding `#918`.** It now requires a call form. **My J5 defence of it was wrong on its own terms.**

**(c) The retry bound was covered by nothing** — `Number.isFinite(RETRY_BUFFER_MAX)` and `> 0`, which survives deleting the shed block and survives `RETRY_BUFFER_MAX = 1e9`. **Strictly weaker than the source-text assertion it replaced.** Now drives the cap: 50,005 in, 50,000 out, the five shed are the oldest.

**(d) `expect(r.representable).toBe(true)` restates `ok`** — `representable: true` is hardcoded on the success return. Removed.

**(e) Every `isOnGrid` negative control was exactly half a tick out.** A reader binary-searched the band: **loosenable ~2,800× with all of them green.** Hundredth-of-a-tick controls added; a 100× loosening now fails.

**(f) The pre-fix passthrough counts are still on disk** under `grid_unresolved_passthrough` inside `preSqeRejects`, and the schema is deliberately not bumped — so the tab would have kept rendering them as rejections indefinitely. **Migrated on reload, not purged: the signals were real, only the bucket was wrong.**

**(g) `_fc2` was a byte-identical copy of `_fClass` fifty-one lines above, in the same function — under a comment claiming to be the ONE derivation.** I wrote the rule and broke it in the same breath. **And a second inline copy of the xStock predicate survived three functions below the extraction, in the same file** — the `B-EPOCH-KEYING-PARITY` shape inside the fix that cites it.

**(h) Smaller, all re-derived:** the envelope declared the new field REQUIRED while both client copies declared it optional *"because a pre-F-G-1 server omits it"*, so one contract disagreed with itself · a dead `?? {}` documenting a protection that was not there · a line citation this batch "fixed" into a **new** wrong value (now cites the symbol, since the number keeps moving) · two mutation comments naming mutations their own block cannot catch · and two false claims about the tolerance band — *"preserves the old behaviour"* (it is 5.6e5× **tighter**) and a cliff at `q≈1e14` that is a continuous slope.

---

## 9d. WHAT CHANGED IN r4 — YOUR BLOCKER-7/8/9 AND BOTH CHANGES-NEEDED

⛔ **YOUR PREDICTED MUTATION PASSED. I RAN IT.** Keep the `decideGridAction` call, discard its result, dispatch on a hardcoded `{ action: 'apply' }` — **blocker-5 reinstated in full, 56/56 green.** The fence had gone *identifier present* → *call form present* and still not *the value decides*.
✅ **FIXED STRUCTURALLY, NOT WITH ANOTHER ASSERTION: the `apply` arm now CARRIES the rounded prices and the seam assigns from them**, so a hardcoded action has nothing to assign and **does not compile** — measured, 384 → 390 tsc errors under your mutation. Rule 29: prefer impossible over intercepted.

**BLOCKER-7 — confirmed, and I ran your J8 remedy on it before fixing.** `rg '1e-9' venue-price-grid.ts` returns **FOUR** sites, not three:

| # | site | verdict |
|---|---|---|
| 1 | `snap()`'s `EPS` | **SAME CLASS** (ratio `price/tick`) — **FIXED** |
| 2 | `isOnGrid`'s band | same class — already fixed |
| 3 | `roundQuantityForVenue`'s floor nudge | **SAME CLASS** (ratio `qty/step`) — **FIXED** |
| 4 | `oneTick = t * (1 - 1e-9)` | ⚠️ **NOT this class** — a relative shrink of a tick VALUE, already scale-free. **LEFT ALONE, and stated so the next reader does not "fix" it** |

Repo-wide the same shape returns two more — `expectancy.ts`, `drift-dashboard-aggregator.ts` — and **both are absolute epsilons on BOUNDED quantities** (a probability, a shift fraction), a different shape wearing the same constant.

**MEASURED MYSELF** — on-grid inputs only, counting inputs moved a **FULL TICK**, n=200,000 per cell:

| cell | before | after |
|---|---|---|
| tick `1e-5` @ $1k–100k (q≈1e10) | **14.1%** | 0.0% |
| tick `2e-8` @ $10–300 (q≈1e10) | **14.4%** | 0.0% |
| tick `0.01` @ $1k–100k (q≈1e7) — CONTROL | 0.0% | 0.0% |
| tick `0.01` @ $1–100 (q≈1e4) — CONTROL | 0.0% | 0.0% |
| tick `0.0025` @ $10–300 (q≈1e5) — CONTROL | 0.0% | 0.0% |

⚠️ **You reported 49.3% on the first cell; I get 14.1% on my sampling.** The defect reproduces either way and the **controls** are what make it a measurement. **I report mine, not yours.**

**BLOCKER-9 — discharged, and I reproduced your grep first.** Grepping the added lines of both governed docs for `923|927|928|929|bypass|DOES NOT|not guarantee|trailing-exit` returned **0**, exactly as you said. The bypass table is now in **`SYSTEM_IMPACT_MAP.md` §9.14b** and the **System Manual** Chapter-5 section; the same grep now returns **9**. ★ **And the same entry carried two stale numbers of exactly BLOCKER-8's kind — "FOUR CALLERS" (five) and "26 tests" (74)** — both corrected, and the test line now says to read the count from the suite rather than from the line.

**CHANGES-NEEDED-1** — `short_side_unexercised` still routed to `'unorderable'`, whose own doc says *"not long-shaped and **not short-shaped**"*. A **policy** refusal filed as a malformed signal. Own verdict now.

**CHANGES-NEEDED-2 — you were right, and the root cause is worth more than the fix.** `_fc2` was still present and I had reported it changed. **The edit script printed its success line BEFORE the file write, then crashed on a later anchor — so nothing was written and I read the print as proof.** ⇒ **A progress message emitted before the work it reports cannot come out differently if the work did not happen.** Same shape as every dead control in this batch. Fixed, and **read back from disk** rather than from the tool's own report.

**J8 — your ruling ADOPTED, as a named pattern.** `fix-follows-pointer` is in `MISTAKE_PATTERNS.md` with five F-G-1 instances and your mechanism verbatim: **grep the CLASS before fixing the instance, and STATE what the grep returned.** ★ **Stating it is the part that does the work** — an unstated grep is indistinguishable from one never run, and *"I fixed it and there are no others"* is an asserted absence needing presence-evidence like any other. It fails the §13 batch-diversity leg (one batch) and is recorded anyway, beside `fix-relocates`, which it is a **sibling of and must not be merged with**: that one is the fix landing somewhere new, this one is the defect staying put while the fix travels.

**J9 — `#927` SPLIT.** The string-truthiness leg is **`#930`** with the evidence you required: the guard at `active-execution-engine.ts:2821`, the column as `decimal(...)` (drizzle yields a JS **string**), `Boolean('0') === true`, `parseFloat('0') === 0`.
⚠️ **AND A NARROWING YOU DID NOT ASK FOR, WHICH I ALMOST DID NOT STATE: those columns are `.notNull()`** — so the *null* path is unreachable and the exposure is a stored **ZERO**, not a null. **Whether one has ever been written is NOT established.** The defect is confirmed by construction; **the incidence is unmeasured**, and the entry says so rather than implying impact.

**BOARD — you were right, there were two.** Consolidated to one (`…zg4UsFg`, the 08-27 card), duplicate deleted, all seven fields verified **at the API**. ⚠️ **`gh project item-list` returned NOTHING for either card while both existed** — the lie you warned about. **My own earlier read-back used that tool and printed nothing, and I read the empty output as a formatting problem rather than as the instrument failing.** Another instance of the same class, in the same hour you named it.

---

## 9e. WHAT CHANGED IN r5 — BLOCKER-10, BLOCKER-11, CHANGES-NEEDED-3

**BLOCKER-10 — the xStock VTS lane was instrumented into a dead end, and the `as any` cast is the mechanism.** Your census is right at every hop. The chain now lands all five steps `SYSTEM_IMPACT_MAP` already specified, and **each has a control that dies when it is broken:**

| step | was | now | mutation |
|---|---|---|---|
| 1 declare | field on no interface | on `XstockEvalCycleCounters` | build error |
| 2 initialise | absent from the factory | `gridEvaluated: 0`, `gridTags: {}` | ✅ fails |
| 3 write | **three `as any` casts** | typed, no cast | ✅ fails |
| 4 accumulate | in neither the literal nor the key list | in both, plus a record merge for the verdict map | ✅ fails |
| 5 expose | absent from the route's field-by-field literal | both keys present | ✅ fails |

★ **THE CAST IS THE PART WORTH NAMING: it let a write to an undeclared field COMPILE, which is what made steps 1, 2, 4 and 5 optional.** Removing it turns a future rename into a build error rather than a silent zero. And your framing is the one I would not have reached — *"it no longer increments nothing, it increments something nothing reads"* — on the one class whose grid is **derived**, so the tab read **"perfectly on-grid"** exactly where we are least sure.

**BLOCKER-11 — the latch defeated the re-arm its own neighbour promised.** Clears on a successful flush, and expires after a bounded window.

⛔ **AND THE CONTROL ON THAT FIX CAUGHT A RACE I HAD JUST INTRODUCED.** The arm asserting a **persisting** fault still raises **once** — the arm that stops *"fix the latch"* becoming *"delete the latch"* — **failed: two alerts.** The raise is fire-and-forget, so the latch was set after an `await` and two close flushes both passed the check. It is now **claimed synchronously before the first await and released in the catch if the alert never got out**, which preserves the property the old ordering existed to protect. ★ **I only know because the control was written to fail in both directions; a one-directional re-arm test would have certified the race.**

★★ **AND THE CLASS GREP CAUGHT THE REST OF IT: `alertPermanentWriteFailure` has TWO callers and I had cleared the latch on the OHLC leg only — the recoverable one.** The **ticker** leg — `#705`'s unrecoverable instance, the one you corrected my sizing on once already — now clears too. **`fix-follows-pointer` caught by its own remedy, in the file where that pattern's third instance lives.**

**CHANGES-NEEDED-3 — decision right, stated reason wrong, and you are right that the reason is the permanent artifact.** It is scale-free in the **tick**; the error it absorbs is float error in `e − s`, which scales with the **price**. Same class, left alone because it is **UNREACHABLE** — the 0.3% stop floor puts real separations ~1e7 ticks out — **not** because it is sound. The comment now says that, and says what makes it live again: removing or lowering that floor.

**THE GREP YOU ASKED ME TO RUN AND STATE — crypto VTS, raw symbol.**
`vts-runner` passes `pair.symbol` with no canonicalisation · `resolveByInternal` is an exact-key `autoMap.get(symbol.toUpperCase())` · `autoMap` is keyed on `internalSymbol.toUpperCase()`, documented canonical `"ADA/USD"` · **live form read from the DB: `ZEC/USD`, `XMR/USD`, `USELESS/USD`** — `BASE/QUOTE` uppercase.
⇒ **THEY MATCH.** Same conclusion as your xStock check and **the same caveat: by CONVENTION, not by enforcement.** Nothing makes the two keyspaces agree; they happen to.

**YOUR ANSWER ON THE FIVE CONTROLS — taken, and it reframes the number I offered.** You are right that a control failing its mutation and being rewritten is the process *working*, and that the comparator I reached for was wrong. The split you asked for, at this ref: **of the controls that did not fire on first writing, two were found by RUNNING the mutation, two by YOU naming them, and one by a fresh reader.** ⇒ **zero were found by reading my own test.** And your sharper point stands: the harness that reported three false "NOT DETECTED" verdicts means **the honest denominator is mutations run on an instrument PROVEN to capture output**, which is why every mutation table since prints a baseline and a restored line either side. **Reviewed-process rather than internal habit is the correct reading, and I am not arguing with it.**

---

## 10. ⛔ WHAT I WANT ATTACKED

**J5 — ⛔ WITHDRAWN, AND THE WITHDRAWAL IS THE POINT.** I argued in r2 for keeping one source-text assertion against your "cut all eight", on the grounds that it was *"the only thing that made `#918` real"*. **A reader then deleted the call it guards and it stayed green** — it was matching the import line. **It was not doing the job I defended it for, and the defence read as principled while resting on a claim I had never tested.** It now requires a call form and is mutation-proved. ⇒ **The open question is not whether to keep it; it is whether my carve-out reasoning should have been trusted at all, given it survived a round of your review and mine.**

**J6 — `not_representable_after_rounding` is now fenced by a tick no resolver we own can produce (§4).** I claim a real execution of the guard beats an honest note that it is unexercised. **You may hold that a fence whose only input is synthetic is a fence against a hypothetical, and that the honest note was the better artifact.**

**J7 — §9's limits are DECLARED, not FIXED.** Three real execution paths reach a trade without the VPG. I am shipping a batch whose headline is *"one rounding seam"* while three entry points bypass it, on the grounds that widening after five review rounds is how a batch stops converging. **You may hold that a guarantee with three named holes should not ship under that headline.**

**J8 — the pattern, restated a third time, and now with a shape.** Six blockers, then twenty-two reader findings across three rounds. **Every control that could not fire in this batch passed a reading and failed a mutation.** ★ **r3 added the half I had not seen: FENCING A FUNCTION IS NOT FENCING THE CALL — and the answer to that is not another assertion, it is moving the decision somewhere a test can reach.** That is why `decideGridAction` exists.
⇒ **THE QUESTION FOR YOU, and I do not think I can answer it about myself: the defect did not shrink across three rounds, it MOVED — wrong branch → untested fix → test guarding the wrong thing. Is that convergence, or is it the same error re-expressing itself at each level I have not yet been forced to look at?** The honest reading of the round record is that every round found something the round before it certified.

**J9 — §9's three bypass paths, and whether the batch may ship with them named.** `#927`/`#928`/`#929` are real routes into execution that skip the seam. **You may hold that a batch headlined "one rounding seam" must not close while three entry points bypass it, and that the correct move is to widen rather than to document.**

---

## 11. VERIFICATION RUN

⛔ **RE-DERIVED AT `e02f6d356` AFTER YOUR BLOCKER-8, NOT CARRIED FORWARD. Every number below was produced by a command run against this ref.**

- **tsc: 384, EXACTLY the pre-existing baseline.** Message-keyed since `B-TSC-BASELINE-FIX`, so a flat 384 is meaningful rather than coincidental. ★ **AND IT IS ALSO A FENCE NOW:** your predicted mutation — keep the `decideGridAction` call, discard the result, hardcode `{action:'apply'}` — takes it to **390**. It no longer compiles.
- **111 unit tests green** across **six** files — the sixth is `f-g-1-xstock-grid-counter-chain.test.ts`, new in r5 for BLOCKER-10's five-step chain. ⚠️ **This line has been wrong twice** (93 at r3, 105 at r4) for the same reason both times: it was written once and the suites kept growing. **It is re-run at each ref now rather than carried.**
- **Every fix mutation-proved individually**, each with a baseline and a restored line either side — because the harness that reported three false *"NOT DETECTED"* verdicts is the reason a bare mutation result is not evidence. Proved at this ref: deleting the shutdown-drain CALL fails · the seam decision hardcoded fails to COMPILE (384 → 390) · `snap`'s EPS restored fails · the quantity floor restored fails · `short_side_unexercised` folded back fails · the legacy-key migration removed fails · **all FIVE steps of the xStock counter chain fail individually** · the latch never clearing fails · **and the persisting-fault CONTROL fails when the latch is simply deleted.**
- ⚠️ **FIVE controls did NOT fire on first writing across the batch** — the `isOnGrid` band, the last-wins ordering, the self-check refusal, the quantity-floor value (it used a quantity that floors identically under both epsilons), and the seam fence. **Each was rewritten until the mutation killed it.** The count is here because it is the honest denominator for *"mutation-proved"*.
- ⚠️ **One mutation harness reported three clean "NOT DETECTED" verdicts from an instrument that had captured no output at all**, and one edit script printed its success lines **before** the file write and then crashed. **Both read exactly like success.** Same class as every dead control here.
- **vite build: succeeds.**
- ⛔ **NOT VERIFIED: anything at runtime. Nothing is deployed. No claim here rests on observed behaviour.**
