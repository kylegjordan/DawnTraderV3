# B-PRICE-SIDE-BY-JOB row `8a-P4a` — THE BOOK-STATE RESEED ESCAPE — CHANGE LIST (Step 4)

**Graded ref:** the commit that adds this file on `origin/migration/aws-supabase` (sha in the dispatch).
**Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4A_AUDIT_AND_PLAN.md`, Step 2 cleared by Langston at `ae203e05f` (22:52Z).
**Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4A_SCOPE.md` (r3).
**Change set:** `server/asset_classes/xstock_spot/book-state-tracker.ts` · `server/services/active-execution-engine.ts` (the REFUSE basis line, the skip-alert detail, the alert branch) · NEW `server/tests/unit/b-price-side-8a-p4a-reseed-escape.test.ts`. Commits `31d90772c` (first build), `7b000c18d` (the plausible-run count, fixture 4b), and this commit (the movement-fact fold, Langston's Step-2 nit). **No migration, no knob, no schema.**

---

## 1. Plan item → code

| item | where | what |
|---|---|---|
| **P1** the escape | `book-state-tracker.ts` `advanceBookStateComparator` | (a) full 20-frame ring median ≤ `kRel` × retained median · (b) this frame ≤ the same bound · (c) `plausibleRunMoves >= 2` over the current plausible run ⇒ `clearBookStateComparator(key, 'seed_escape_recovered')`, then the ordinary no-`prev` seed. The escape seed does not validate on its own frame. |
| **P2** the basis | tracker `takeChainRefusalBasis` + `aee` REFUSE | one `[8a-P4a][BOOK_STATE] REFUSAL_BASIS` line per chain (mutating read); `ratio=` on every REFUSE line |
| **P3** the escape line | tracker | `SEED_ESCAPED framesHeld runMoves seedSpread escapeMedian spreadNow retainedMedian kRel seededAt` (warn) |
| **P4/P5** the named arm | `aee` `buildPriceSkipAlertCopy` + `_recordPriceSkip` detail | a `book_state_unvalidated` branch: *"Exit checks refused — book-state guard has not validated"*, carrying the ratio and exposure. **Deploy step: resolve (never ack) `3a85ba22`, `c50238db`, `ef81571d`, `f248f7f0`.** |
| **P6** fixtures | new test file | 11 tests on the real state machine (below) |

## 2. Load-bearing hunks

**The escape (tracker):**
```ts
  const movedNow = prev ? (frame.bid !== prev.priorBid || frame.ask !== prev.priorAsk) : false;
  const escRetained = _retainedSpreads.get(key);
  const escRetainedMedian = escRetained ? medianOf(escRetained) : null;
  const escThreshold = kRel !== null && escRetainedMedian !== null && escRetainedMedian > 0 ? kRel * escRetainedMedian : null;
  const runMovesNow = prev && prev.seedImplausible && escThreshold !== null
    ? (spreadNow <= escThreshold ? prev.plausibleRunMoves + (movedNow ? 1 : 0) : 0)
    : 0;
  if (prev && prev.seedImplausible && prev.observedMovement && escThreshold !== null) {
    const trailing = prev.spreads.concat(spreadNow);
    while (trailing.length > ringCap) trailing.shift();
    const trailingMedian = trailing.length >= ringCap ? medianOf(trailing) : null;
    if (retainedMedian !== null && trailingMedian !== null && trailingMedian <= threshold
        && spreadNow <= threshold && runMovesNow >= 2) {
      console.warn(`… SEED_ESCAPED framesHeld=… runMoves=… …`);
      clearBookStateComparator(key, 'seed_escape_recovered');
      prev = undefined;
      escapedThisFrame = true;
    }
  }
  …
  const movedThisFrame = prev ? movedNow : false;       // one movement fact (Step-2 nit)
  …
    validated: !seedImplausible && ((prev?.validated ?? false) || (validatedByTwoSided && !escapedThisFrame)),
    plausibleRunMoves: prev ? runMovesNow : 0,
```
**Why the clear cannot touch the retained ring** (Langston derived it at Step 2): `clearBookStateComparator` retains only from a chain that is `!seedImplausible && observedMovement`. So the re-seed reads the SAME retained median the escape used; (b) makes the seed plausible by construction, and the ring is consumed.

**The refusal basis (aee, at REFUSE unvalidated):**
```ts
  const _basis = takeChainRefusalBasis(position.symbol);
  const _inherited = _basis !== null && _openedAtMs !== null && _basis.seededAtMs < _openedAtMs;
  if (_basis?.first) console.warn(`[8a-P4a][BOOK_STATE] ${sym} REFUSAL_BASIS seedImplausible=… seedSpread=… seedRetainedMedian=…
     retainedMedianNow=… currentMedian=… ratio=… kRel=… inherited=… seededAt=… framesSinceSeed=…`);
  console.warn(`… REFUSE unvalidated state=… ${_cmpV} ratio=${_ratioTxt} reasons=…`);
  await this._recordPriceSkip(position, 'book_state_unvalidated', `ratio=… vs kRel=…, current median spread … vs retained …, bid … vs stop … / target …`);
```

**The alert branch (aee `buildPriceSkipAlertCopy`):** `dominantReason === 'book_state_unvalidated'` returns its own title and body before the absence branch, which used to say *"no Kraken price"*.

## 3. Fixtures and mutation checks

| # | fixture | mutation that turns it red |
|---|---|---|
| 1 | an implausible seed on a recovering book escapes inside the ring, via the clear, and **does not validate on the escape frame**; validates on the next | disabling the escape; deleting `&& !escapedThisFrame` |
| 2 | the CRM 7.00/1000.00 book (wandering) never escapes | — |
| 3 | one tight print inside a wide book does not escape | — |
| 4 | a book frozen after one jump does not escape | `runMovesNow >= 1` |
| 4b | a quiet healthy book moving once per 25 frames DOES escape | `>= 1` (escapes too early); the r1 windowed count (checked against the pushed r1 code) |
| 5 | an unreadable kRel never escapes | — |
| 6 | a plausible chain is untouched (no clear, no log) | — |
| 7-8 | the basis is first-once per chain; a new chain logs again | disabling the escape (8) |
| 9 | `book_state_unvalidated` takes its own alert branch | — |
| 10 | the tracker reads no clock | — |

**Local:** tsc 377 = baseline; 74/74 across `b-price-side-8a-p4a-reseed-escape`, `b-price-side-obj8-reseed-selfvalidation`, `b-xstock-feed-sanity-book-state`; 142/142 across the seven files that touch this code. CI on `420c5ba44` (the first build): run 35401182959, all four jobs green.

## 4. Calls worth attacking
1. **The unbounded horizon (Langston's Step-2 carry 1).** An artefact that moves twice over hours inside the bound now escapes. The named arm measures only the stranding direction, so at Step 8 `SEED_ESCAPED framesHeld` is read against A8's re-armed escapes per day, and a symbol escaping far more often than predicted is the signature of a false escape.
2. **`inherited` = `seededAtMs < openedAt`.** `openedAt` is stamped at PLACEMENT for a maker entry, so a chain seeded between placement and fill reads as not inherited. That is the conservative direction: it under-counts inheritance, and never invents it.
3. **The named arm reuses the existing skip threshold (39 of 40 ticks)** rather than adding a new alert. The price is that its dedupe key stays reason-blind, which is why the deploy step exists.
