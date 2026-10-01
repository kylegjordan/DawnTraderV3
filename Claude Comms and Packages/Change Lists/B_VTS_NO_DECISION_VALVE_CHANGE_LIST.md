# B-VTS-NO-DECISION-VALVE (row `3n.q3`) — Step-4 change list

**Code at `b24b755cd`** (the Step-3 commit; CI `36938896888` 4/4 green), **plus the commit carrying this file** (the reader fix: `vts-service.ts` outcome feedback on the carried class, one test).
⚠️ **`server/services/vts-runner.ts` carries the `🔒 LOCKED MODULE` header — named here per `#1076` (Langston ruled (b)): changes go through the eleven-step workflow, with this change list naming the header.**

## Header (the three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `architecture` (scope header, unchanged) |
| ii | **the class's doc set** | **scope** present — `Scope Files/B_VTS_NO_DECISION_VALVE_SCOPE.md` (r2, approved) · **pre_audit** present — `Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` (approved, C4-C7 folded, P9 amendment) · **completion_report** absent — Step 11 · **batch_catalog** absent — Step 10 · **phase_history** absent — Step 10 · **system_manual** absent — Step 10 (§18.0.1: a forced exit with no sell side closes unpriced) · **sim** absent — Step 10 (VTS close path both lanes, the shadow sink column, the weekend controller's reach, the collision set) · conditional: **running_issues** present (`#1141`, `#1143`, `#1144`, `#1145`) · **adjustment_framework** owed at Step 10 (rule 8 register: closes to new A/B members; the `#1145` exclusion selector) · **roadmap** N/A (no roadmap item) · **changes_and_fixes** judged at Step 10 · **deleted_log** owed at Step 10 (the `stale_timeout → shadow_max_hold` relabel and `bookedNoBidClamp` removed) · **phase_19_plan** N/A (the active plan is `SPRINT_TO_LIVE_PLAN`, rows 4/4a-4c written) |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` at `b24b755cd` |

## What to attack (the judgement calls)
1. **P2's helper extraction.** The archive write and the finishing steps moved out of the close loop into `archiveVtsExit` / `finishVtsClose` so the priced and unpriced closes share them. Content moved unchanged except where marked `3n.q3`; the priced call is now `await archiveVtsExit(...)` (the inline block awaited its imports too).
2. **The unpriced test is `exitPrice === null || exitReason === 'timeout_unpriced'`** — one fact tested twice so the compiler narrows both on the priced path.
3. **P9 extended by `#1145` (the collision re-run): 8 tickers added to `XSTOCK_SPOT_KRAKEN_COLLISIONS` (USD + EUR, 17 → 33 entries).** On `exchange = 'kraken'` these 8 now resolve `crypto_spot`. That is what fixes the STX/STRK contamination, and it is the one change in this batch that alters what the resolver returns.
4. **The boot repair (`bootstrapOpenTradesFromMemory`) now KEEPS a valid carried class** — B79.0g's design (re-resolve everything) is inverted; its tests are rewritten to the new intent.
5. **P6's skip placement** — before `recordLook`, keyed on `isInXstockWeekendClose(new Date(now))`.

## Load-bearing hunks

**P1 — `server/core/trading/vts-exit-booking.ts`**
```ts
-  clampPrice: number,
-): VtsBookedExit {
-  if (!usable(observedMark)) return { price: clampPrice, arm: 'clamp_no_mark' };
-  if (!usable(observedBid)) return { price: clampPrice, arm: 'clamp_no_bid' };
+): VtsBookedExit {
+  if (!usable(observedMark)) return { price: null, arm: 'clamp_no_mark' };
+  if (!usable(observedBid)) return { price: null, arm: 'clamp_no_bid' };
```

**P1/P7 — the real-lane push site (`vts-runner.ts`)**
```ts
+    const _vtsBooked = resolveVtsBookedExitPrice(_vtsExitBid, currentPrice);
+    if (_vtsBooked.price === null) countUnpricedArm(countersFor(_vtsExitByClass, trade.assetClass), _vtsBooked.arm);
     tradesToClose.push({ id: tradeId, trade, exitPrice: _vtsBooked.price,
+      exitReason: _vtsBooked.price === null ? 'timeout_unpriced' : normalizedReason,
       exitArm: _vtsBooked.arm });
```

**P2 — the close loop leaves before any outcome**
```ts
+    if (exitPrice === null || exitReason === 'timeout_unpriced') {
+      await closeVtsTradeUnpriced(id, trade, exitArm, now, holdDurationStr);
+      unpriced++;
+      continue;
+    }
     // Calculate P&L
     const grossPnl = (exitPrice - trade.entryPrice) / trade.entryPrice;
```
**P2 — `closeVtsTradeUnpriced`** (new): twin ⇒ Map delete, soft-close, `clearVtsTrailingState`, no record; otherwise ⇒ `archiveVtsExit(trade, { exitReason: 'timeout_unpriced', exitArm, exitPrice: null, pnlPercent: null, grossPnl: null, netPnl: null, finalTradeMode, now })` then `finishVtsClose(id, trade)`; counter `closedUnpriced`; one `console.warn` `[3n.q3][VTS_UNPRICED_CLOSE]`.
**P2/P4/P9 — inside `archiveVtsExit` (marked changes only)**
```ts
+      timeout_unpriced: 'time_stop_unpriced',
-      trade.entryPrice && trade.stopLoss && trade.entryPrice !== trade.stopLoss
+      exitPrice !== null && Number.isFinite(exitPrice) && trade.entryPrice && trade.stopLoss && trade.entryPrice !== trade.stopLoss
-      assetClass: vtsResolveClassOrLoggedDefault(trade.symbol),
+      assetClass: asValidAssetClass(trade.assetClass) ?? vtsResolveClassOrLoggedDefault(trade.symbol),
-      exitPrice,
-      pnlPct: pnlPercent !== undefined ? Number(pnlPercent) : undefined,
+      exitPrice: exitPrice ?? undefined,
+      pnlPct: pnlPercent !== null ? Number(pnlPercent) : undefined,
+        exitBookingArm: exitArm,   // in stateSnapshot
```
**`finishVtsClose`** = the removed inline block (Map delete → `markOpenTradeClosed` → both cooldown keys → trailing state), unchanged.
**Fix-on-find:** the priced twin path now ends `await clearVtsTrailingState(id, trade.symbol); continue;` (it never cleared trailing state).

**P3/P5 — shadow lane**
```ts
+  if (exitPrice === null || !Number.isFinite(exitPrice)) {
+    return { grossPnl: null, netPnl: null, rMultiple: null, holdingMs: now - openedAt };
+  }
...
+  const _sFr = exitPrice === null ? null : recomposeVtsCloseFriction(trade, exitArm);
+      exitBookingArm: exitArm,
...
-    const reason = decision.exitReason === 'stale_timeout' ? 'shadow_max_hold' : (decision.exitReason ?? 'timeout');
-    const _sBooked = resolveVtsBookedExitPrice(_sExitBid, currentPrice, decision.exitPrice);
+    const _sBooked = resolveVtsBookedExitPrice(_sExitBid, currentPrice);
+    if (_sBooked.price === null) countUnpricedArm(countersFor(_vtsShadowByClass, trade.assetClass), _sBooked.arm);
+    const reason = _sBooked.price === null ? 'timeout_unpriced' : (decision.exitReason ?? 'timeout');
```
Migration `2026-10-02-b-vts-no-decision-valve-shadow-arm.sql` (+ rollback, both in git; MANIFEST): `ALTER TABLE rtb_shadow_pairings ADD COLUMN IF NOT EXISTS exit_booking_arm VARCHAR(16)`, `lock_timeout 5s`, comment *"NULL = written before 2026-10-02, never an arm"* (C7). Drizzle column added.

**P6 — the shadow pass**
```ts
   for (const [tradeId, trade] of openShadowTrades) {
     if (!trade.assetClass) { openShadowTrades.delete(tradeId); continue; }
+    if (trade.assetClass === 'xstock_spot' && isInXstockWeekendClose(new Date(now))) continue;
```

**P7 — `server/core/trading/vts-exit-counters.ts`** (new, pure): per-class `exitLooks`, `exitNoTransactableSide`, `unpricedNoBid`, `unpricedNoMark`, `closedUnpriced`; both lines print `crypto_spot{…} xstock_spot{…}` when any class has a count; `bookedNoBidClamp` retired.

**P8** — `_vtsExitRefusal` = the crypto selection's `tickerRefusal` (or `no_bid_side`) / the xStock guard's `reason`; the streak reason becomes `no_transactable_side (<refusal>)`; the alert body says the trade *"closes with NO recorded price (`time_stop_unpriced`)"* and that a `crossed_book` cannot be fixed by any ceiling.

**P9** — the open-time friction fallback and the boot repair use `asValidAssetClass(…) ?? <ticker resolver>`; `shared/asset-classes.ts` +8 USD +8 EUR collision entries (names read from `xstock_spot_universe`, 2026-10-02).

## A second reader at `a7b54d991` (object round) — what it found, and what changed
- **Priced closes are NOT byte-for-byte unchanged, and I said they were.** The order and awaiting hold (persist → archive → finish → log; finish = Map delete → soft-close → both cooldown keys → trailing state). The changes, all intended: the archive row's class is the carried one (collision xStocks now archive `xstock_spot`); every snapshot gains `exitBookingArm`; the priced twin clears its trailing state; and **a priced close with a valid stamp no longer calls the ticker resolver, so its per-close collision WARN and the classify-fall-through counter stop firing for those closes** (that counter's population shrinks).
- **The collision additions flip the ticker resolver for 8 tickers to `crypto_spot` — and one re-derivation site served xStock CLOSES:** `persistRealPriceTrade` (`vts-service.ts:1139`) chose the outcome-feedback EMA and EV-gap bucket from the ticker. **Fixed in this commit** (carried class first) — it was already wrong for the original 9 collision tickers. The reader's other sites: the crypto pair loop and crypto open (`vts-runner.ts:1543, :2331, :5395`) and the RTB crypto-cache telemetry (`rtb-refresh-service.ts:454`) only see crypto symbols, so the flip CORRECTS them for STX/STRK; `rtb-refresh-service.ts:349` is a no-stamp fallback; `vts-service.ts:352` is inside `simulateTrade`, which has **zero callers** (`git grep`) — dead code, homed to row 4a (rule 18).
- **Limits, stated:** the archive is the unpriced close's only durable record, and it is switchable (`b70_exit_decision_capture_enabled`) and queued, not flushed; `closedUnpriced` lands on the NEXT printed line (it can wait, or be lost on a restart, when the map empties first); a trade skipped as an unsupported class appears in no counter; the shadow skip keys on the window while the real lane keys on `state` (they can disagree for one controller poll), and neither covers US holidays.

## Tests
New `server/tests/unit/b-vts-no-decision-valve.test.ts` (18 tests: the resolver; the counters; the shadow math with a priced positive control; `closeVtsTradeUnpriced` driven for real with the archiver and the soft-close mocked — one archive row with null price/P&L/R, the arm, the carried class for a MET xStock, the LEGACY cooldown key for crypto (C6), no archive row for a twin; source fences for what it never calls, the loop order, P4, P6's placement, P8). Updated: `b-price-side-8a-p3-crypto-finish`, `b65-tec-parity` (D7 inverted, as its own comment said it would be), `fg2-obj5-vts-cost-truth`, `b-price-side-8a-p4c-instrument`, `b79-0f-asset-class-collisions` (17 → 33), `b79-0g-vts-trade-persistence` (a valid carried class is kept). `tsc` 339 = baseline. Local full suite: the only failures are files I did not touch that need a database (ECONNREFUSED :5432) or fail to load on Windows — CI is the arbiter.
