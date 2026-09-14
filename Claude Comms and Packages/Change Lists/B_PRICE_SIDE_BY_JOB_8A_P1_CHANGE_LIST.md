# `B-PRICE-SIDE-BY-JOB` ROW `8a-P1` — STEP 4 CHANGE LIST

**READY AT:** `origin/migration/aws-supabase`. Code in three commits: **`b5e6e36ef`** (the recorder), **`d023c3ff6`** (the engine) and the condition-3 fix in §8.3. Plan at **`a7f326213`** r9, approved; `71edfe741` is the current head and carries only plan/governance edits from the feed incident.
**Change-class: architecture · Owner: CC-C**

> ⛔ **P1 CHANGES NO DECISION.** The ladder records and decides nothing. `currentPrice` still drives every trigger; all 24 of its in-loop consumers are byte-unchanged.
> ⚠️ **AND "NO BEHAVIOUR" WAS NARROWLY FALSE — NARROWED ON LANGSTON'S C2, NOT DEFENDED.** `_ladderFlushIfDue` writes the WHOLE metadata blob, and `_recordBookStateEvent` deliberately THROTTLES its own row write (first-of-streak / every 10th / every yield) while mutating in memory every tick. ⇒ **the ladder flush pushes `bookState` to the row on ITS cadence too.** No value is corrupted — it is the in-memory value, which LEADS the row — but **the PERSISTED CADENCE of `hollowSkips` changes**, and that is live subject matter at plan row `3b.f-c`. **Stated here so nobody later reads the new cadence as a fix or as a regression.**

---

## 0. ⛔ THE ONE DEVIATION FROM THE APPROVED PLAN — NAMED FIRST, NOT BURIED

**The plan said: put `lastFlushAtMs` and `walksSinceFlush` at MODULE scope, not on the engine instance.** Your reason — an instance clock aliasing over a shared module map, which a second engine construction switches on silently — is right, and I did not weaken it.

**I put them on the ENTRY instead, and the reason is a starvation the module-scope form has:**
a single clock over a map of MANY positions is reset by whichever position walked last. Position A's walk resets it; position B can then go indefinitely without its 30 s elapsing **as observed at its own walk**. The bound would hold for one position and silently not for the others.

⇒ **Per-entry is the STRICTER form of the rule the plan was applying — the state sits where the thing it describes sits, and the thing described is THIS position's unflushed accumulation.** It also removes the instance-vs-module hazard rather than managing it: there is no engine-scoped clock left to alias.

**If you disagree, this is the item to bounce.** It is a three-line change to move them back.

```ts
// server/services/active-execution-engine.ts — INSIDE LadderShadowAcc, per entry
  lastFlushAtMs: number;
  walksSinceFlush: number;
}
const _ladderShadow = new Map<string, LadderShadowAcc>();
```

---

## 1. `server/core/calculations/level-basis.ts` — MODIFIED. **THE KEY, NOT THE TYPE.**

**BEFORE**
```ts
export interface LevelBasisRungKey extends LevelBasisFunnelKey {
  rung: LevelBasisRung;
}

function keyOf(k: LevelBasisRungKey): string {
  return `${k.lane}:${k.assetClass}:${k.rung}`;
}
```

**AFTER** *(the docblock is trimmed here; it is in full at the ref)*
```ts
export interface LevelBasisRungKey extends LevelBasisFunnelKey {
  rung: LevelBasisRung;
  /** ⛔⛔ REQUIRED, AND IT IS A KEY DIMENSION — NOT A LABEL … `keyOf` carries it now.
   *  A type is not a key. */
  stage: LevelBasisStage;
}

function keyOf(k: LevelBasisRungKey): string {
  if (!k.stage) {
    throw new Error(
      `[level-basis] recordLevelBasisOutcome requires a stage — got ${String(k.stage)} for ` +
      `${k.lane}:${k.assetClass}:${k.rung}. A missing stage would pool this walk into a key ` +
      `named 'undefined' and the pooling is what the dimension exists to prevent.`,
    );
  }
  return `${k.lane}:${k.assetClass}:${k.stage}:${k.rung}`;
}
```

⛔ **THE GUARD IS NOT DEFENSIVE PADDING — IT CAUGHT A REAL CASE TWICE.** `tsconfig` excludes test files, so REQUIRED is unenforced there: the first run after `stage` landed minted `active:crypto_spot:undefined:book`, and after I fixed the fixtures by hand the guard caught a **second** one my enumeration had missed. Every production caller is type-checked and structurally cannot reach it.

**ALSO IN THIS FILE:** `FunnelCell` gains `stage` (stored, never parsed out of the key — the `rung` precedent) and **`acceptedAge: { book[]; ticker[] }` + `acceptedAgeMaxMs`**, fed from `sel.quote.ageMs`. The row gains `stage`, `selfSyntheticRefusals`, `refusedExcludingSelfSynthetic`, the two histograms and `acceptedAgeEdgesMs`.

⛔ **THE AGE SPLIT IS PER LEG BECAUSE POOLING REBUILDS F4 ONE FIELD OVER:** book ages are sub-second, ticker ages carry a 2/15/30/60 s poll cadence; one histogram over both is bimodal by construction.
⛔ **`selfSyntheticRefusals` IS SPLIT OUT BECAUSE IT COUNTS US, NOT KRAKEN** — `price-cache`'s `?? price` arm fabricates `bid === ask === price`, refused at `level-basis.ts:221` **before** the age check.

## 2. `server/core/calculations/touch-price.ts` — MODIFIED
`recordTouchSelection`'s `base` widens to carry `stage`; the accepted age and leg are derived **once, here**, from the selection the caller already holds, and the leg is read off `sel.quote.basis` — the only field that cannot disagree with the quote beside it.
**PLUS P1-14:** a rider of mine stating a mechanism that is false at the ref is corrected in place (it claimed the synthetic arm refuses at `age_unknown`; `locked_or_synthetic_book` at `:221` precedes `age_unknown` at `:222`).

## 3. `signal-orchestrator.ts` / `vts-runner.ts` — ONE LINE EACH, COMPILE-FORCED
`stage: 'active_signal_birth'` and `stage: 'vts_signal_birth'`. Neither was a judgement call: the required field would not compile without them.

## 4. `server/services/active-execution-engine.ts` — THE SHADOW

**THE WALK**, at `_exitProvenanceBase`'s site — the decision instant, crypto only:
```ts
if (_posClass === 'crypto_spot') {
  try {
    const _lsNow = Date.now();
    const _lsCache = priceCache.getCachedPrice(_lsSym);
    // your condition 3 — the MARK's age at the ladder's instant. `null` on the direct-REST
    // leg, which states `priceObservedAtMs = null` by design. See §8.3.
    const _lsMarkAgeMs = priceObservedAtMs !== null ? _lsNow - priceObservedAtMs : null;
    const _lsSel = selectTouchPrice({ book: …, bookEligible: true,
      ticker: tickerLegFromCachedQuote(_lsCache),        // ⛔ THROUGH the helper — your ruling
      tickerBasis: 'ticker_bbo' }, _lsNow,
      { maxAgeMs: LEVEL_BASIS_OBSERVATION_MAX_AGE_MS, maxSpreadFraction: … });
    recordTouchSelection({ lane: 'active', assetClass: 'crypto_spot', stage: 'exit_trigger' }, _lsSel);
    recordSideAgeAttempt({ lane: 'active', assetClass: 'crypto_spot' }, { stage: 'exit_trigger', … });
    _ladderAccumulate(position.id, _lsSel, _bookX !== null, _lsMarkAgeMs);
    await this._ladderFlushIfDue(position, _lsNow);
  } catch (err) { /* a recorder may never break the exit loop */ }
}
```
⚠️ **THE `try/catch` IS DELIBERATE AND IS A JUDGEMENT CALL I WANT ATTACKED:** this sits inside the per-position `try` whose `catch` ends the ITERATION, so an unguarded throw here would turn a telemetry fault into a **skipped stop check**. Contained, and logged loudly.

**THE FLUSH** — 20 walks **OR** 30 s, whichever fires first, with all three of your mechanics:
```ts
function _ladderShouldFlush(acc: LadderShadowAcc, nowMs: number): boolean {
  return acc.walksSinceFlush >= LADDER_FLUSH_WALKS || (nowMs - acc.lastFlushAtMs) >= LADDER_FLUSH_MS;
}
```
`lastFlushAtMs` seeded to `Date.now()` at insert (never `0`) and reset on **every** flush including count-triggered ones. The snapshot carries `flushBound: '<=30s of unflushed age as observed at the next walk'` — never "bounded at 30 s".

**THE CARRY + EVICTION** (P1-15), inside the close-time allowlist:
```ts
const _lsAcc = _ladderShadow.get(position.id);     // ⛔ the MAP, never `_pm`
if (_lsAcc) _carry.ladderShadow = _ladderSnapshot(_lsAcc);
_ladderShadow.delete(position.id);                 // a surviving entry would be a SOURCE
```

**THE STOP PATH** — unconditional flush immediately after `this.isRunning = false`, which is what makes the graceful case a real bound.

## 5. TESTS — NEW: `b-price-side-8a-p1-funnel-stage.test.ts` (9), `b-price-side-8a-p1-exit-fence.test.ts` (13)
The fence copies `reorg-b4-shadow-isolation.test.ts`'s argument-level extraction. **Every assertion carries an in-test control** — the repo's idiom, not a source substitution, which has no instance here.

---

## 6. ⛔ MUTATION RECORD — EVERY SUBSTITUTION ASSERTED TO HAVE **MATCHED** BEFORE THE RESULT WAS READ

| mutation | result |
|---|---|
| ★ **the ladder ACTS** (`currentPrice := _lsSel.quote.bid`) | ✅ KILLED |
| `keyOf` drops `stage` · guard removed | ✅ KILLED ×2 |
| accepted ages pooled into one leg · self-synthetic pooled back in | ✅ KILLED ×2 |
| allowlist loses `ladderShadow` · eviction removed · stop-flush removed | ✅ KILLED ×3 |
| `OR` → `AND` · flush clock seeded `0` | ✅ KILLED ×2 |
| **carry reads the stale row** | ⛔ **SURVIVED FIRST** — see below |
| **evict moved BEFORE the merge** | ⛔ **SURVIVED FIRST** — see below |

⛔⛔ **TWO OF MY OWN ASSERTIONS FAILED THEIR MUTATIONS, AND THAT IS WHY THE MUTATIONS EXIST.**
1. The carry test was **FILE-scoped**: `_ladderShadow.get(position.id)` also appears in `_ladderFlushIfDue`, so replacing the CARRY's read left the string present elsewhere and the test passed. **Scoped to the carry block now.**
2. The eviction test asserted the delete **EXISTS** — which a delete moved ABOVE the read satisfies exactly, while `_lsAcc` goes `undefined` and nothing rides. **PRESENCE IS NOT ORDER**; it is a position comparison now.

Both re-run after the fix and both **KILLED**.

---

## 7. VERIFICATION
- **tsc: 377 = baseline, unchanged** (the two new imports are pure calculation modules).
- **3,221 tests pass, 0 test failures.** 10 file-level failures are `connect ECONNREFUSED ::1:5432` — no local database — and are environmental.

## 8. ⛔ WHAT I WANT ATTACKED
1. **§0's deviation** — the per-entry clock.
2. **The `try/catch` around the walk** — it converts a recorder fault into silence rather than a skipped exit check; I think that is the right trade and it is a trade.
3. ⛔ **YOUR CONDITION 3, WHICH I IMPLEMENTED WRONG FIRST AND FIXED BEFORE DISPATCH — CHECK THE REPLACEMENT IS THE QUANTITY YOU MEANT.** r1 recorded `Date.now() - _lsNow` across one line: **it timed itself and could only ever be zero.** Caught while writing this document, not by a test — a field can be present, typed, persisted and meaningless, and no assertion I had would have noticed.
⇒ **NOW: `_lsMarkAgeMs` = the age of THE MARK THE EXIT LOOP IS ACTUALLY USING, at the ladder's own instant.** If the ladder and the mark disagree, that says whether they were looking at different **times** or different **sources** — which is what makes a divergence attributable. `null` on the direct-REST leg, which states `priceObservedAtMs = null` BY DESIGN, and `markAgeUnknown` counts those walks rather than letting an absent age collapse into the max.
⚠️ **If you meant the gap between the loop's clock and the CACHE ROW's capture instant instead, that is `sidesCapturedAtMs`'s age and the side-age probe already records it — say which and I will not carry both.**
