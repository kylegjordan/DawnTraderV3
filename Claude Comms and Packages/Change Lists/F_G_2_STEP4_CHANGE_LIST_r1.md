# F-G-2 / `B-EXIT-TRANSACTABLE-SIDE` — STEP 4 CHANGE LIST (r1)

**READY-AT: `d3e64303227982bacd61e816977067392a8e4f28`** on `origin/migration/aws-supabase` (one commit, 11 files, +456/−18). Pre-audit r3 cleared by Langston 2026-09-02T07:31 at `840df8a5d`; his conditions 1-2 applied at `a433b1b49`, condition 3 carried to Step 11.

**Gates before this dispatch:** `node scripts/check-tsc-baseline.mjs` — **377 vs baseline 384, no regressions** (the push guard re-ran it and passed) · `vitest` — **9 new tests + 11 existing pending-maker tests pass** · CI: run on this sha pending at dispatch time (Step 5 cites it).

## THE ONE-SENTENCE CHANGE
**The active engine now runs a crypto SHADOW arm of the exit decision on the book BID beside the live MID decision and records the first exit each arm would take (OBJ-0, shadow first — the live decision is untouched); VTS books the OBSERVED exit mark on crypto rows instead of TEC's clamp (OBJ-5a), charges the MAKER entry fee where a maker was actually paid at all three write paths (OBJ-5b), and bumps the two class-scoped `vts` calibration epochs once (OBJ-5c).**

## WHAT THIS DEPLOY DOES NOT DO — STATED FIRST
- ⛔ **It does NOT switch the live exit decision to the bid.** OBJ-0: shadow first, switch second. P1's bid-trigger is the SHADOW candidate; the switch waits on OBJ-0's discordant cell.
- ⛔ **xStock decision-side legs (P2/P7) are NOT built** — §7.4 row 1, HELD behind 3b.b + 3b.d.
- ⛔ **xStock VTS rows keep the clamp** — §7.4 row 2 seam on the BOOKING (`resolveVtsBookedExitPrice`).
- ⛔ **Admission is unchanged** — `:1795`/`:2014` still read the taker-priced pre-decision estimate (P13).
- ⛔ **`evaluateTECExit` is untouched** (OBJ-4). One evaluator; the shadow arm is a second KEY, not a second implementation.

## THE JUDGEMENT CALLS I WANT ATTACKED
1. **The shadow arm's seed.** When the live trailing state already exists but the shadow key does not (first shadow evaluation mid-life), the shadow seeds from the POSITION's persisted `tradeMode`/`ladderRungsHit`/`originalStopPrice` — the same expression the live seed uses on a cold start. Is that the right baseline for the bid arm, or should it copy the live in-memory state (ladder rung, latch) at that instant?
2. **Recording only the FIRST exit per arm.** `bidFirstExit` / `midFirstExit` are written once. OBJ-0's 2×2 needs (bid-arm first exit reason) × (live close reason). A later reversal (bid arm says stop, then the trade recovers and the live arm targets) is exactly the discordant cell, and first-exit capture is what makes it observable. Anything the 2×2 needs that a first-only record loses?
3. **`costFeeFraction` = mean of legs (P12).** Reconciles the 5-col `fee×2` on the open-trades table; per-leg truth rides in `costEntryFeeFraction`/`costExitFeeFraction`. Your condition 3 (Step 11) records that the table renders 0.60/0.60 while context carries 0.40/0.80.
4. **Epoch rows.** Pre-audit P14 said "wildcard row". Measured live: `vts/*=3`, `vts/crypto_spot=4`, `vts/xstock_spot=5` — class rows exist and supersede the wildcard (most-specific-wins). The migration bumps the TWO class rows. A wildcard bump would have marked nothing.
5. **Two stale-interface declarations riding the diff.** `OpenVirtualTrade` never declared the five cost fractions it has carried since P19-B8.7, nor `filterTier` (unmasked when the first declaration removed the excess-property error that hid it). Declaring them retires 7 baseline tsc errors; the baseline file is left as-is (drops enumerated below, per the gate's own instruction to VERIFY rather than sync).

## OBSERVATIONS SURFACED AT STEP 3 (not blockers; for the record)
- **OBJ-2 has no plan item in the cleared pre-audit** (zero mentions). The producer already states the mark KIND (`markKind` → `kraken_ws_ticker_mid|_last`, B-EXIT-BOOK-AGE-STAMP P2) and the adapter's own comment at `:681` says the `lastPrice` rename is deliberately left alone. I read OBJ-2's label fence as discharged by `markKind`; the two comments asserting a "clean print" are `#941`'s leg. **If you read OBJ-2 as still owing a rename, say so and it becomes a Step-9 item.**
- **OBJ-0 ③ (n-floor + window) was owed at Step 2 and is not in the pre-audit.** The shadow run cannot start before F-G-1's criterion returns PASS (alert `2093a98a`, 09-04), so the pre-registration lands in the progress report BEFORE the run starts. Proposed: window 14 d from shadow start; n-floor 30 crypto closes carrying `fg2Shadow`; report every cell of the 2×2 with a Wilson 95% interval on the discordant rate; PASS = discordant cell's value forgone < concordant cell's shortfall avoided over the window. **Attack the estimand before it is armed.**

## THE DIFF — LOAD-BEARING HUNKS INLINE (full diff: `git show d3e643032`)

### NEW `server/core/trading/vts-exit-booking.ts` — the ONE resolver both VTS lanes call (OBJ-5a)
```ts
export function resolveVtsBookedExitPrice(assetClass: string, observedMark: number | null | undefined, clampPrice: number): number {
  if (assetClass !== 'crypto_spot') return clampPrice;                                          // §7.4 row 2 seam
  if (observedMark == null || !Number.isFinite(observedMark) || observedMark <= 0) return clampPrice; // null arm
  return observedMark;
}
```

### `vts-runner.ts` — the two booking sites (real `:3270`, shadow `:3965`)
```ts
-      exitPrice: decision.exitPrice,
+      exitPrice: resolveVtsBookedExitPrice(trade.assetClass, currentPrice, decision.exitPrice),
```
```ts
-    toClose.push({ id: tradeId, trade, exitPrice: decision.exitPrice, exitReason: reason });
+    toClose.push({ id: tradeId, trade, exitPrice: resolveVtsBookedExitPrice(trade.assetClass, currentPrice, decision.exitPrice), exitReason: reason });
```

### `cost-model.ts` — the shared formula (OBJ-5b, Langston condition 3)
```ts
+export function composeBookedFriction(feeEntry: number, feeExit: number, slippage: number, spread: number): number {
+  return feeEntry + feeExit + (slippage * 2) + spread;
+}
```

### `vts-runner.ts` — crypto inline, AFTER `_vtsEffectiveMode` lands (P11 i / P12)
```ts
+  const _vtsEntryFee = _vtsEffectiveMode === 'maker' ? _vtsFriction.feeRateMaker : _vtsFriction.feeRateTaker;
+  const _vtsExitFee = _vtsFriction.feeRateTaker;
+  const bookedFrictionCost = composeBookedFriction(_vtsEntryFee, _vtsExitFee, costMetrics.slippage, costMetrics.spread);
   const openTrade: OpenVirtualTrade = {
...
-    frictionCost,
+    frictionCost: bookedFrictionCost,
-    costFeeFraction: costMetrics.fee,
+    costFeeFraction: (_vtsEntryFee + _vtsExitFee) / 2,
+    costEntryFeeFraction: _vtsEntryFee,
+    costExitFeeFraction: _vtsExitFee,
```
Same shape at the `VirtualSignal` record (`:2348`) and the at-open `Phase10TradeRecord` (`:2381-2387`, the 4th `costFeeFraction` writer). `frictionCost` at `:1795` and its consumer `:2014` are NOT touched.

### `pending-maker-logic.ts` — the twin re-prices INSIDE `planTwin` (P11 ii, your FINDING)
```ts
+  const twinEntryFee = twinMode === 'maker' ? params.feeRateMaker : params.feeRateTaker;
+  const repriced =
+    Number.isFinite(params.chosenFrictionCost) && Number.isFinite(params.chosenEntryFeeRate)
+      ? { frictionCost: (params.chosenFrictionCost as number) + (twinEntryFee - (params.chosenEntryFeeRate as number)),
+          costFeeFraction: (twinEntryFee + params.feeRateTaker) / 2,
+          costEntryFeeFraction: twinEntryFee, costExitFeeFraction: params.feeRateTaker }
+      : {};
   return { kind: 'open', twinMode, overlay: { chosenEntryMode: twinMode,
-      entryFeeRate: twinMode === 'maker' ? params.feeRateMaker : params.feeRateTaker,
+      entryFeeRate: twinEntryFee,
+      ...repriced,
```
`maybeOpenTwin` (`:4416`) passes `chosenFrictionCost: chosenTrade.frictionCost, chosenEntryFeeRate: chosenTrade.entryFeeRate` — read from the chosen leg's own record, so BOTH callers (`vts-runner:2270`, `eval-cycle:1211`) are covered with no caller change. The overlay spreads AFTER `...chosenTrade`, so the twin's friction wins.

### `eval-cycle.ts` — xStock inline (P11 iii, fee exemption §7.4 row 3)
```ts
+        const _xEntryFee = _xEffectiveMode === 'maker' ? _xFriction.feeRateMaker : _xFriction.feeRateTaker;
+        const _xExitFee = _xFriction.feeRateTaker;
+        const _xBookedFriction = composeBookedFriction(_xEntryFee, _xExitFee, costMetrics.slippage, costMetrics.spread);
...
-          frictionCost: totalFriction,
+          frictionCost: _xBookedFriction,
-          costFeeFraction: costMetrics.fee,
+          costFeeFraction: (_xEntryFee + _xExitFee) / 2,
+          costEntryFeeFraction: _xEntryFee,
+          costExitFeeFraction: _xExitFee,
```

### `vts-runner.ts` / `vts-service.ts` — the fractions reach the closed record (`:3353-3358`), the persist payload (`:3458-3463`) and `persistRealPriceTrade`'s param + both stored copies (P12, your (a)).

### `active-execution-engine.ts` — the shadow arm (OBJ-0), 108 lines
```ts
   private async checkExitConditions(position, currentPrice, avgPrice, stopLoss, takeProfit, traceId?,
+    fg2BookBid: number | null = null,   // decision-time book bid; null on xStock and when no book is held
```
Call site (`:1484`): `_bookX && _bookX.bids.length > 0 ? _bookX.bids[0].price : null` — the SAME mini-book snapshot the provenance stamps, built once per position above the evaluation.
```ts
+      if (fg2BookBid !== null && Number.isFinite(fg2BookBid) && fg2BookBid > 0 && positionAssetClass === 'crypto_spot') {
+          const _shadowId = `${position.id}:fg2bid`;
+          const _shadowSeed = _getTSForSeed(_shadowId) ? undefined : { tradeMode, ladderRung, originalStopPrice };   // from the position, as the live seed does
+          const shadowDecision = await evaluateTECExit({ ...same inputs as the live call..., tradeId: _shadowId, currentPrice: fg2BookBid, seed: _shadowSeed });
+          // first exit per arm, written once each:
+          if (shadowDecision.shouldExit && !_prior.bidFirstExit) _next = { ..._prior, bidFirstExit: { reason, bid, mid: currentPrice, clamp: shadowDecision.exitPrice, atMs } };
+          if (decision.shouldExit && !((_next ?? _prior).midFirstExit)) _next = { ...(_next ?? _prior), midFirstExit: { reason: decision.exitReason, mid: currentPrice, bid, atMs } };
+          if (_next !== null) {
+            // P5 third read-out: raw bid/ask from getTickerWitness (separate socket; never the `c` field)
+            ...witnessAtEvent...
+            await storage.updateActiveOpenPosition(this.mode, position.id, { metadata: { ..._meta, fg2Shadow: _next } });
```
At close (`:2378`): `fg2Shadow` is merged into `closed_trades.metadata` **only when one exists** (never a wipe). Cleanup (`:2612`): `clearTrailingState(`${position.id}:fg2bid`)` beside the live key.

### Migration `2026-09-02-fg2-obj5c-vts-epoch-bump.sql` (OBJ-5c)
```sql
UPDATE module_constants mc SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'fg2-obj5c-vts-cost-truth'
WHERE mc.module_name = 'calibration_epoch' AND mc.constant_name = 'vts'
  AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class IN ('crypto_spot', 'xstock_spot') AND mc.updated_by <> 'fg2-obj5c-vts-cost-truth';
```
Registered in `MANIFEST.txt`; idempotent via the `updated_by` guard (same form as `2026-06-12a-b5-evgap-units-epoch.sql`).

## THE tsc BASELINE DROPS, ENUMERATED (all in `vts-runner.ts`, all explained by the two interface declarations)
| count | code | message |
|---|---|---|
| 2→0 | TS2353 | `'costFeeFraction' does not exist in type 'OpenVirtualTrade'` (the `:2128` and `:4218` literals) |
| 2→0 | TS2339 | `'filterTier' does not exist on type 'OpenVirtualTrade'` (`:3463`, `:3562`) |
| 1→0 each | TS2339 | `costFeeFraction` / `costSlippageFraction` / `costSpreadFraction` on `OpenVirtualTrade` (`:5865` renderer read) |

## TESTS ADDED — `server/tests/unit/fg2-obj5-vts-cost-truth.test.ts` (9)
Mutation-proved booking (crypto books a DIFFERING mark; xStock does not; five null-arm inputs) · the formula (maker entry ≠ maker×2; P12 mean reconciles fee×2 and is honestly NOT either leg) · `planTwin` re-price both branches (maker twin of taker leg; taker twin of pending-maker leg; no inputs ⇒ no friction field, never 0; skip paths unchanged).

## VERIFICATION PLAN (Steps 7/8, pre-registered here so the diff can be graded against it)
Per §8.7: the OBJ-5a sample is `stop_hit`/`target_hit` crypto VTS closes ONLY, reported per reason with the clamp-traversal count, plus the negative control that pass-through reasons are unchanged. OBJ-5b: first 20 post-deploy real VTS closes reconstruct `frictionCost` from `vts_open_trades.context` as `costEntryFeeFraction + costExitFeeFraction + 2·costSlippageFraction + costSpreadFraction`, split by origin (inline / twin / xStock). OBJ-5c: boot log shows `vts` epochs 5/6 and the Welford reset line. OBJ-0: `[F-G-2][OBJ-0][SHADOW_ARM]` lines appear on crypto positions; `fg2Shadow` reaches `closed_trades.metadata` on the first crypto close; NO position closes on the shadow arm (the discordant read-out itself waits for F-G-1's PASS + the n-floor).
