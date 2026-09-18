# B-PRICE-SIDE-BY-JOB row `8a-P4b` — PAPER xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — CHANGE LIST (Step 4)

**Graded ref:** the commit that adds this file on `origin/migration/aws-supabase` (sha in the dispatch).
**Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4B_AUDIT_AND_PLAN.md`. Step 3 was cleared by Langston at `bdaa2f345` (22:38Z), with conditions (a)/(b) folded at `ae203e05f`. J5 was accepted as (b') at 23:00Z, and its five conditions are folded here.
**Depends on:** `8a-P4a` (the reseed escape), in its own Step 4 at `82a55bd00`. **They deploy together or `8a-P4a` first.**

**Change set:**
- **Engine and services:** `active-execution-engine.ts` (X1-X3, the per-class counter split, `MAKER_PLACED`, the corrected taker-stamp comment, `sentinelLane: this.mode`) · `price-discontinuity-detector.ts` (lane-keyed state) · `tec-evaluator.ts` (`sentinelLane` required, `resolveSentinelLane`) · `trailing-exit-controller.ts` (`discontinuity` required, detector fallback deleted) · `vts-runner.ts` (`sentinelLane: 'vts'` / `'vts_shadow'` only; **no VTS price change**).
- **Migration:** NEW `drizzle/migrations/2026-09-18-b-price-side-8a-p4b-paper-xstock-epoch.sql` + `-rollback.sql` + a MANIFEST line.
- **Tests:** NEW `b-price-side-8a-p4b-paper-xstock.test.ts`. Deliberately amended fences: `b-price-side-8a-p1-exit-fence` 2d (+ new 2f, renumbered from 2e at r2), `b-price-side-8a-p3-crypto-finish` "paper C2", `b-exit-provenance-fence` OBJ-9. Lane argument added: `b-new-42b-price-discontinuity-detector`, `b-new-42-tec-halt-resilience`.

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
- **Fence 2d** is amended deliberately (two classes reach the trigger; the sentinel question is answered at J5), and **2f** pins each lane's name AND its trigger quantity.
- **Local:** tsc 377 = baseline; **673/673 across the 50 test files that touch this code** (excluding `b-tsc-baseline-fix`, which fails to load its `.mjs` on this Windows clone before and after the change).

## 5. Calls worth attacking
1. **The guard-off arm (J2)** trades refusal for unjudged raw sides. With the guard off, nothing refuses a hollow frame (rider 2, stated in the plan).
2. **`resolveSentinelLane` THROWS on a contradiction** inside the exit path. It is a wiring error that fence 2f rules out for every production caller, and both lanes have per-trade isolation. Say if you would rather it logged and fell back to `callerMode`.
3. **The vts/xstock epoch moves in a paper piece.** It moves because the lane keying changes VTS deferral timing where paper and VTS share a symbol. `8a-P4c` moves it again.

---

## 6. Step 4 r2 — Langston CHANGES-NEEDED at `e413c0983` (23:33Z), folded

| item | fold |
|---|---|
| **BLOCKER-1** — the guard-ON capture admitted a CROSSED frame (`two_sided` does not carry `ask >= bid`: `book-state.ts` computes `twoSidedNow` and the exit path never uses it; a crossed mid is null, so the departure arms compare NaN and pass). | NEW exported `xstockTransactableSides(raw)` in `aee`: both sides present, bid > 0, `ask >= bid` (NaN refused). **Both capture sites go through it** (`_gSides` at J1, `_offSides` at J2), so the two arms judge identically. A crossed frame at either site captures nothing (⇒ no decision, no fill this tick, as a missing side) and prints `[8a-P4b][BOOK_STATE] <sym> CROSSED_NOT_CAPTURED basis=guarded|unguarded bid= ask=` (warn ⇒ `error.log`). |
| **Fence for BLOCKER-1** | the two sites each call the predicate exactly once and before their capture; the predicate has exactly three mentions (definition + two sites); a behavioural test on the real function (crossed, zero, negative, null, NaN refused; locked and normal admitted). |
| **CONDITION-1** — two labels lied | `MAKER_FILLED` prints `ask`/`bid` for crypto AND xStock (was `mark` on xStock, which fills on the ask); `EXIT_REST_FILLED` prints `bid` for crypto AND xStock. Fenced. |
| **CONDITION-2** — fence the declaration site | the one `let xsBid` sits after `for (const position of openPositions) {` + `try {`, beside `let currentPrice: number;`, and before both captures. |
| **CONDITION-3** — the exit seam carries no decision basis | **Homed, not fixed here:** `#1064`, `HOME: B-EXIT-DECISION-RUNG-STAMP, owner CC-C, placed in PHASE_19_PLAN at row 3n.q6, after 8a-P4c`. The standing window statement (guard `enabled = 1`; a mid-window flip splits the exit population silently) is on the issue and the row. |
| **Nit** — two tests labelled `2e.` | the new lane test is `2f.`; references here updated. |
| **Your note on call 2** | kept the throw; a contradiction is visible only on the per-position catch line (`_exitEvalInvoked` never increments), so the Step-8 read greps the catch line, not the partition counter. |

**Mutation checks (each turns exactly one test red, restored after):** dropping `ask >= bid` from the predicate; J1 bypassing the predicate; hoisting `let xsBid` above the loop.
**Local:** tsc 377 = baseline; the five `8a` fence/test files 116/116.
**CI:** the branch head carries CC-B's `B-FEED-MISMATCH-FIX` commits under this one; the graded ref's own CI is run on a temporary branch (`migration/ci-cc-c-*`) so a later push cannot cancel it.

## 7. Step 4 r2 — APPROVED at `00ba34873` (23:46Z), condition met, residuals folded

- **Condition — CI on the graded head:** run `35406705232` on `00ba34873` (temporary branch `migration/ci-cc-c-e413c0983`, so a later push cannot cancel it): **4/4 per-job green.**
- **Residual 1 — one fact per log line.** The guarded arm now prints `CROSSED_NOT_CAPTURED` only on a genuine cross and `SIDES_NOT_CAPTURED reason=non_finite` otherwise; the unguarded arm already printed only on a genuine cross. (Below the refusal both sides are finite-positive, so today only a cross reaches the guarded arm.)
- **Residual 2 — the limit of the three-mention fence, stated:** `toBe(3)` counts mentions of `xstockTransactableSides(` **in `active-execution-engine.ts` only**. The predicate is exported, so a fourth caller elsewhere in the tree is unfenced. It is not a tree-wide census.
- **Step 8, stated before the data (#661 leg 3):** **zero `CROSSED_NOT_CAPTURED` lines is a PENDING control, not a pass.** The refusal arm is live-unexercised at both sites, as is the predicate's NaN path; silence means no crossed frame reached a decision, never that the guard fired correctly.
