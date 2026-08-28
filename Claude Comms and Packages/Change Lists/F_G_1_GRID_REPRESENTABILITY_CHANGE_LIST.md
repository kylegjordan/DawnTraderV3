# F-G-1 — B-GRID-REPRESENTABILITY — STEP-4 CHANGE LIST

> **READY AT: `origin/migration/aws-supabase`.** Diff base `98cd011c7` (the commit immediately before the first code commit) → the branch head.
> **18 files, +1,429 / −5.** Untracked check run: the only `??` entry is `.claude/launch.json`, local config, deliberately not committed. Nothing else is missing from this set.
> ⛔ **ONE GATE: the code diff.** Design rulings and the VPG↔VOG pairing were separate dispatches and are not re-asked here.

---

## ⚠️ READ THIS FIRST — WHO WROTE THIS CODE

**Kyle granted me write scope for this batch on 2026-08-28, after I put the counter-argument to him myself: the analyst who scoped and audited a batch also writing it removes a separation he drew deliberately.** He decided with that in front of him.

⇒ **YOUR STEP-4 REVIEW IS THE ONLY INDEPENDENT CHECK ON THIS BATCH.** It is not a formality here.

**Three fresh-context readers were run over the finished implementation before this dispatch and found SIX defects, all fixed** (§6). ⛔ **I am not offering that as assurance** — a reviewer clean is not evidence, and the finding below stands or falls on its own citations. **I mention it only so you know what has already been swept, not as a reason to sweep less.**

---

## 1. WHAT SHIPPED — TWO NAMED SERVICES

**THE VPG — Venue Price Grid** · `server/core/calculations/venue-price-grid.ts` (NEW, pure, no imports)
Answers *"is this a price the venue can express, and if not what is the nearest one that is?"*
**THE VOG — Venue Order Gate** · `server/services/execution/venue-validate.ts` (renamed/documented, pre-existing)
Asks Kraken *"would you ACCEPT this order?"* — **the VPG runs first and feeds it.**

*(Named at Kyle's instruction: "if it just remains code instead of something we refer to specifically by name, then it is easier to forget that it is there.")*

---

## 2. THE SEAM — `signal-orchestrator.ts`, +80

**MODIFIED.** Inserted in `buildSizedSignalForStrategy`, **after** the funnel denominator and **before** sizing / SQE / target gate.

```ts
    if (_fClass) recordActiveSignalsGenerated(sizingContext.mode, _fClass, 1);

    // ⚠️ THE ORDERING HERE IS DELIBERATE AND WAS A DEFECT WHEN I FIRST WROTE IT. This block
    // sat ABOVE `recordActiveSignalsGenerated`, so a grid-rejected signal was counted as a
    // pre-SQE DROP without ever being counted as GENERATED — rejects could exceed the
    // denominator and the Filter Diagnostics funnel would not reconcile.
    ...
      const _grid = resolveVenueGrid(rawSignal.symbol, sizingContext.assetClass);
      const _isCap = strategyId === ('volatility_edge' as StrategyType);
      const _r = roundTripleToGrid(
        rawSignal.entryPrice, rawSignal.stopPrice, rawSignal.targetPrice,
        _grid.tick, { targetIsCap: _isCap, symbol: rawSignal.symbol },
      );
      if (!_r.ok) { _gridReject(_r.reason ?? 'unknown'); ...; return null; }
      if (!validateStopDistance(_r.entryPrice, _r.stopPrice)) {
        _gridReject('stop_distance_after_rounding'); ...; return null;
      }
      rawSignal = { ...rawSignal, entryPrice: _r.entryPrice, stopPrice: _r.stopPrice, targetPrice: _r.targetPrice };
```

**Why one seam:** `strategy-engine.ts` alone computes a stop price at **33 sites**. Rounding at 33 sites guarantees one is missed and a future strategy is born broken.
**Why P2 is ONE check:** `normalizeAndGateTarget:1662` already re-derives RR, reachability and ordering downstream of this seam. **`MIN_STOP_DISTANCE_BPS` is the only check with no downstream re-run** — `validateStrategySignal:2980` tests ordering, not distance.

---

## 3. THE VPG'S RULES — `venue-price-grid.ts`, NEW +207

```ts
export function roundPriceForRole(price, tick, role, isLong, targetIsCap = false): number {
  if (role === 'entry') return snap(price, tick, 'nearest');
  const awayIsUp = role === 'stop' ? !isLong : isLong;
  const dir: Dir = (role === 'target' && targetIsCap) ? (awayIsUp ? 'down' : 'up')
                                                      : (awayIsUp ? 'up' : 'down');
  return snap(price, tick, dir);
}
```

| price | direction | evidence |
|---|---|---|
| entry | NEAREST | an observed print — a point estimate |
| **stop** | **AWAY** | **nearest moves the stop TOWARD entry on 197 of 398 long crypto trades (49.5%)**, and our stops are structural levels — half would land inside the structure they were placed behind. Cost of away: **+0.241% median extra risk** |
| target | AWAY | preserves *"at least K × ATR"* |
| **target, `volatility_edge` ONLY** | **TOWARD** | `Math.min(measuredMove, atrTarget)` is a **CEILING** — away pushes it past the bound it was defined by. **Your catch; the only cap in the set** |

**THE PAIRWISE ASSERTION** — the defect my first fence could not have seen:

```ts
  const e = snap(entryPrice, t, 'nearest');
  const s = roundPriceForRole(stopPrice, t, 'stop', true);
  const g = roundPriceForRole(targetPrice, t, 'target', true, opts.targetIsCap === true);
  const oneTick = t * (1 - 1e-9);
  if (!(e - s >= oneTick) || !(g - e >= oneTick)) return fail('degenerate_after_rounding');
```

Tick `0.01`, stop `99.99` (already representable, does not move), entry `99.9949` → rounds to `99.99`. **Risk distance zero.** "Away" is measured from the **ROUNDED** entry.

**REFUSALS, none of which silently compute:** `invalid_triple` · `short_side_unexercised` (refuse-and-raise while unexercised, per your condition) · `unorderable_triple` (the `#915` shape) · `grid_unknown` (**no invented tick**) · `degenerate_after_rounding`.

---

## 4. xSTOCK — DERIVED BY GCD · `venue-grid-resolver.ts` +130, `xstock-grid-refresher.ts` +114 (both NEW)

⛔ **YOUR INVENTED COUNTER-EXAMPLE IS REAL IN OUR DATA.** You killed my decimal-place method with a hypothetical `0.0025` tick. Measured over one day of live xStock prices, 40 symbols with >500 observations: **31 derive `0.0001`, SIX derive `0.0025`, three derive `0.0005`.** The decimal method would have emitted **invalid prices for 9 of 40**.

**GCD is safe by proof, not hope:** every observed increment is a whole number of true ticks, so their GCD is too ⇒ **a derived grid always NESTS.** Too coarse is possible; unrepresentable is not.
`gcdOfIncrements` returns **null** when `g <= 1` — a failure to establish a grid, not a `1e-8` tick.
Refresher: 24h window, **min 50 increments**, 6-hourly. **A failed refresh leaves the cache UNCHANGED** — an empty cache would refuse every xStock signal.

---

## 5. THE VTS LANES TAG · `vts-runner.ts` +54, `xstock_spot/eval-cycle.ts` +10

Per your ruling: **(a) round and TAG, never drop.** Inserted **per-lane at the normalizer**, not at `callStrategyDetect` — because that dispatcher has **two** production callers and the xStock ACTIVE signal is born in the xStock VTS lane (`eval-cycle.ts:640-642` → `dispatchXstockActiveSignal:1133`).

**Your explicit verification condition, discharged:** `entryPrice`/`stopLoss`/`takeProfit` are `const`, declared once, never reassigned — the tag block only reads them, so the active dispatch still receives native geometry and is rounded on its own path where the refusal IS counted.

`stop_distance_after_rounding` → **quality** → tag + simulate native. Unresolvable tick → **wiring bug** → tag + simulate, **loud on stderr like `invalid_atr`**. **No drop arm.**

---

## 6. THE WRITER · `ohlc-batch-writer.ts` +140, `ticker-batch-writer.ts` +36

Built on **`#705`'s own three constraints**, which that issue already specified and which I argued with you for a round before reading.

```ts
  if (!isTransientWriteError(err)) {
    console.error(`... PERMANENT flush failure (${rows.length} rows dropped, NOT retried):`, detail);
    void alertPermanentWriteFailure('ohlc', assetClass, detail.slice(0, 300), rows.length);
    return;
  }
  const buf = buffers[assetClass];
  buf.unshift(...rows);          // FRONT — preserves B-NEW-35's temporal last-wins
  if (buf.length > RETRY_BUFFER_MAX) { ... buf.splice(0, shed); console.error(`... SHED ${shed} oldest ...`); }
```

**Eviction end and re-add end decided TOGETHER, per your rider.** Both are the front. At the cap the retry is failing persistently and shedding oldest is honest — **and it is not silent, which was your objection: the shed is counted and logged.**

⛔ **AND I FIXED THE WRONG WRITER FIRST.** `#705`'s own title records you correcting my sizing: *"I sized the risk on the OHLC writer, where it is recoverable, and the UNRECOVERABLE instance is the ticker writer."* I fixed OHLC and left ticker — **reproducing, in the fix, the mis-sizing you had already corrected once.** The ticker writer now **imports** the policy rather than copying it.

**`#918`:** `stopBatchWriter` had zero callers; the live shutdown handler called `stopVTSRunner()` and nothing else. Now wired, in a try/catch. ⚠️ **Measured impact NIL at n=4** — bar-continuity across four restarts showed every restart minute inside its neighbour range. **It ships because it is trivially correct, NOT because it is load-bearing, and it must not become OBJ-9's headline.**

---

## 7. ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

**J1 — `_sizeKnown`: "no fallback for a PRICE, skip-on-missing for a PRE-FILTER."** My first version rejected the trade when venue size metadata was unresolvable, which would have **blocked live trades on a data gap** — the same drop-arm-on-missing-data defect you refused for the VTS lane, by me, one file over. I caught it pre-commit and drew that line. **Is the line principled, or convenient?**

**J2 — the front-evict / front-re-add pairing (§6).** I claim "not silent" answers your objection. **You may hold that a bound whose eviction end is the retry's own end is wrong regardless of logging.**

**J3 — `#923` disposition.** The trailing exit ratchets stops off-grid by float `Math.max` and contains **zero** VPG references. I put it in **F-G-2** (disposition 2) rather than here, on the grounds that F-G-1 rounds at signal BIRTH and this is an EXIT mutation. **You may hold that shipping a grid guarantee that the trailing logic then breaks is worse than widening this batch.**

**J4 — the fence's reach.** The VPG fence (26) is behavioural. The writer fence is **8 source-text assertions + 4 behavioural**; the source-text half proves wording and one of them broke when I *improved* the classifier. **I think the behavioural four carry it and the text eight are near-worthless. Rule on whether that half should exist at all.**

---

## 8. VERIFICATION RUN

- **tsc: 384 errors, EXACTLY the pre-existing baseline.** The one `signal-orchestrator` error exists at origin at `:1582` and my change only shifts its line — confirmed by stashing and re-running, not by reading.
- **Fences: 42 green** across three files. **Mutation-proved individually:** pairwise check removed → fails · stop rounds nearest → fails · short branch computes → fails · tick fallback added → fails · `push` instead of `unshift` → fails · bound removed → fails · alert call removed → fails · bare `timeout` match restored → fails.
- ⚠️ **One control did NOT fire on first writing** — the alert test asserted the function NAME, which survives deleting the call site. Re-anchored inside the permanent-failure block. **Found by running the mutation, not by reading the test.**
- **vite build: succeeds.**
- ⛔ **NOT VERIFIED: anything at runtime.** Nothing is deployed. No claim here rests on observed behaviour.
