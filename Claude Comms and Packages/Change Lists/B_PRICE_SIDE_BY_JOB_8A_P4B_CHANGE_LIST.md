# B-PRICE-SIDE-BY-JOB row `8a-P4b` — PAPER xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — CHANGE LIST (Step 4)

**Graded ref:** the commit that adds this file on `origin/migration/aws-supabase` (sha in the dispatch).
**Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4B_AUDIT_AND_PLAN.md`. Step 3 was cleared by Langston at `bdaa2f345` (22:38Z), with conditions (a)/(b) folded at `ae203e05f`. J5 was accepted as (b') at 23:00Z, and its five conditions are folded here.
**Depends on:** `8a-P4a` (the reseed escape), in its own Step 4 at `82a55bd00`. **They deploy together or `8a-P4a` first.**

**Change set:**
- **Engine and services:** `active-execution-engine.ts` (X1-X3, the per-class counter split, `MAKER_PLACED`, the corrected taker-stamp comment, `sentinelLane: this.mode`) · `price-discontinuity-detector.ts` (lane-keyed state) · `tec-evaluator.ts` (`sentinelLane` required, `resolveSentinelLane`) · `trailing-exit-controller.ts` (`discontinuity` required, detector fallback deleted) · `vts-runner.ts` (`sentinelLane: 'vts'` / `'vts_shadow'` only; **no VTS price change**).
- **Migration:** NEW `drizzle/migrations/2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql` + `-rollback.sql` + a MANIFEST line.
- **Tests:** NEW `b-price-side-8a-p4b-paper-xstock.test.ts`. Deliberately amended fences: `b-price-side-8a-p1-exit-fence` 2d (+ new 2e), `b-price-side-8a-p3-crypto-finish` "paper C2", `b-exit-provenance-fence` OBJ-9. Lane argument added: `b-new-42b-price-discontinuity-detector`, `b-new-42-tec-halt-resilience`.

---

## 1. Cells → code (`aee`)

| cell | code |
|---|---|
| **J1 capture** | `let xsBid, xsAsk, xsSideBasis` beside `bookStateAtDecision`. Set ONLY (i) on the line below the unvalidated refusal, from `_raw` (`raw_guarded`), and (ii) on the guard-off arm from `_eqTick.raw`, when it is two-sided and positive (`raw_unguarded`). Never re-read. |
| **X3 trigger** | call site: `_posClass === 'xstock_spot' ? xsBid : (crypto ladder bid)` into the `triggerBid` slot. `checkExitConditions`: `triggerPrice: crypto_spot ? triggerBid : xstock_spot ? triggerBid : currentPrice` — the third arm is the mark for any other class. |
| **X2 rest fill** | `_restFillPrice = crypto_spot ? (ladder bid) : xstock_spot ? xsBid : currentPrice` |
| **X1 entry fill** | `_processPendingMaker(…, provenance, { bid: xsBid, ask: xsAsk, basis })` (required). xStock `fillPrice = side === 'buy' ? ask : bid`; other classes keep `safePrice`. The fill stamps `entryDecisionPrice` = the ask and `entryPriceSource` = `kraken_equities_ws:raw_ask` (`…_unguarded` with the guard off). |
| **P2 counter** | `_exitEvalByClass` = the same `invoked` / `refused` facts split crypto / xstock / other, additively; the totals are untouched. EVAL_EXIT prints `noTriggerByClass=crypto:r/n,xstock:r/n,other:r/n`. |
| **P5** | `[8a-P3][MAKER_RESTED]` is unmoved; a NEW `[8a-P4b][MAKER_PLACED:<mode>] <sym> (<class>): limit=… ask=… tradeId=…` is printed just before `return { opened: true }`. |
| **P6** | the taker `exitProvenance` comment is corrected: the stamp is the mark (a label), and the booked price is the bid walk. |

## 2. J5 — the sentinel is lane-exclusive (load-bearing)

```ts
// price-discontinuity-detector.ts
export type SentinelLane = 'paper' | 'live' | 'vts' | 'vts_shadow';
const laneKey = (lane: SentinelLane, symbol: string): string => `${lane}|${symbol}`;
export function isDiscontinuityActive(symbol, currentPrice, currentTs: number, lane: SentinelLane) {
  const key = laneKey(lane, symbol); …            // every get / set / delete uses `key`
export function clearSymbolState(symbol) { for (const k of […keys]) if (k.endsWith(`|${symbol}`)) delete }  // every lane

// tec-evaluator.ts
export function resolveSentinelLane(callerMode, lane) {
  if (lane === undefined) return callerMode;       // untyped callers only; tsc requires the lane in production
  const ok = callerMode === 'vts' ? (lane === 'vts' || lane === 'vts_shadow') : lane === callerMode;
  if (!ok) throw new Error(`[8a-P4b][SENTINEL_LANE] sentinelLane '${lane}' contradicts callerMode '${callerMode}'`);
  return lane;
}
const discontinuity = isDiscontinuityActive(input.symbol, triggerPrice, tickTs, resolveSentinelLane(callerMode, input.sentinelLane));

// trailing-exit-controller.ts — PositionUpdate.discontinuity REQUIRED; the detector fallback is deleted
    : (update.discontinuity ?? { active: false });  // untyped callers: shouldClosePosition's long-standing default
```
**Callers:** `aee` passes `sentinelLane: this.mode`; `vts-runner` real passes `'vts'`, and shadow passes `'vts_shadow'`.

## 3. Migration
`calibration_epoch` `xstock_spot` `paper_sim` AND `vts` each +1. Both rows are asserted present (created by `2026-09-03-b-xstock-feed-sanity.sql` and `2026-06-11c-b5-amr-body.sql`, so they exist in a fresh CI database); every other row is asserted unchanged. The rollback bumps both again and deletes the `_migrations` row. Live staging values before: paper_sim/xstock 4, vts/xstock 7.

## 4. Tests and mutation checks
- **New file (20):**
  - J1 capture sites (exactly two arms, each asserting xsBid and xsAsk; after the refusal; one equity-tick read).
  - The class three-way at X1/X2/X3.
  - The X1/X2 decisions on the shared pure logic.
  - `MAKER_PLACED` after `MAKER_RESTED`.
  - The counter split.
  - **J5:** separate `lastPrice` series; VTS calls cannot clear paper's deferral; **non-advance** (VTS cold-starts while paper is ACTIVE); the lane is required; `resolveSentinelLane` pairs and throws; no controller fallback and no fifth lane.
- **Red on the pre-change engine:** 10 of the 14 wiring tests (the 4 that stay green test the shared pure logic and the single equity-tick read).
- **Re-keying the detector by symbol alone turns all three lane tests red.**
- **Fence 2d** is amended deliberately (two classes reach the trigger; the sentinel question is answered at J5), and **2e** pins each lane's name AND its trigger quantity.
- **Local:** tsc 377 = baseline; **673/673 across the 50 test files that touch this code** (excluding `b-tsc-baseline-fix`, which fails to load its `.mjs` on this Windows clone before and after the change).

## 5. Calls worth attacking
1. **The guard-off arm (J2)** trades refusal for unjudged raw sides. With the guard off, nothing refuses a hollow frame (rider 2, stated in the plan).
2. **`resolveSentinelLane` THROWS on a contradiction** inside the exit path. It is a wiring error that fence 2e rules out for every production caller, and both lanes have per-trade isolation. Say if you would rather it logged and fell back to `callerMode`.
3. **The vts/xstock epoch moves in a paper piece.** It moves because the lane keying changes VTS deferral timing where paper and VTS share a symbol. `8a-P4c` moves it again.
