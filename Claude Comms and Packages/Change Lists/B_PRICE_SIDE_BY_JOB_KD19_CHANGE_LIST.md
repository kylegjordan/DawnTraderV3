# B-PRICE-SIDE-BY-JOB KD-19 (b) + (c) exit leg — Step-4 CHANGE LIST (CC-C)

## Dispatch header (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope `B_PRICE_SIDE_BY_JOB_SCOPE.md:3`; KD-19 pre-audit line 3, unchanged) |
| ii | **DOC SET (architecture)** | SCOPE — present, `Scope Files/B_PRICE_SIDE_BY_JOB_KD19_SCOPE.md` · PRE_AUDIT — present, `Scope Files/B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` · COMPLETION_REPORT — absent, Step 11 · BATCH_CATALOG, PHASE_HISTORY — absent, Step 10 · SYSTEM_MANUAL (§18.0.1, three divergences), SYSTEM_IMPACT_MAP (§2.2 + registry: `CachedPrice`, `PriceTickEvent`, `TouchQuote` change shape) — absent, Step 10 = plan P10 · SPRINT_TO_LIVE_PLAN row 17 — present (Step-2 line), Step-10 wording owed · the rest judged at Step 10 |
| iii | **STEP-2 REFERENCE** | `B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` §9 (r1 CHANGES, `1568448834638712893`) + §10 (r2 PROCEED on P1-P10 with L1-L4, `1568451565965152297`) |

**Code commits (rebased onto the joint-deploy head, no content change):** the five `B-PRICE-SIDE-BY-JOB KD-19 Step-3 …` commits ending at the ref named in the dispatch. **29 files, +789 / −47.** tsc 328 = baseline. KD-19 tests + the five re-pinned suites: 10 files, 135 pass. Full unit suite: the only failures are local-environment ones that fail identically at the head without this diff (a stale agent worktree under `.claude/worktrees`, `b-tsc-baseline-fix`, `b-disk-file-tiering-amendment1`, DB-integration skips) — CI is the authority.

## Item map (plan → code)
| P | what shipped | file |
|---|---|---|
| P1 | `closeFillFull` returns `CloseFillResult { …WalkResult, walkedQty, extrapolatedQty }`; `exhausted` is now TRUE on the penalty path; `avgFillPrice` byte-identical. Paper seam refuses a non-finite / ≤0 quantity with `rejected` `invalid_close_qty` (C-1, through the counted non-filled path). | `depth-walk.ts`, `order-placer.ts` |
| P2 | `FilledResult.closeSplit { branch: 'walk' \| 'cold_reference', walkedQty, extrapolatedQty }`; the engine stamps it as `exitFillSplit` in `closed_trades.metadata`. | `types.ts`, `order-placer.ts`, `active-execution-engine.ts` |
| P3 | `SideSizes { bidQty, askQty, basis }` rides on `CachedPrice` and moves ONLY with a stated side pair; a sideless/sizeless write writes `null` (W-3). REST ticker `b[2]/a[2]` → `rest_rounded_up`; WS v2 raw `bid_qty/ask_qty` → `exact`; book emit → `exact` from the level map; v1 → null. | `price-cache.ts`, `kraken-websocket-adapter.ts`, `live-pricing-adapter.ts` |
| P4 | `TouchQuote` carries `bidQty` + `sizeBasis`; `CryptoBookTop` levels carry `qty`; `selectCryptoTouch` returns `acceptedBookBids` ONLY when the book rung carried the selection (K6 by construction). | `touch-price.ts`, `crypto-touch.ts` |
| P5 | `bookVtsExit` (pure): unpriced → top/`absent`; **qty ≤ 0 → top/`unit_lane` BEFORE any guard (L1)**; no sized level (qty ≤ 0 filtered, BLOCKER-2) → `absent`; no penalty → `no_depth_config` (logged at error); else `closeFillFull`. `sizeCertain = exact \|\| quantity ≤ stated − 1`; `impactPriced = sizeCertain`. The walk wrapper throws only after the sized-level test. A non-null price implies `arm === 'bid'` (`resolveVtsBookedExitPrice`), so "walk on the bid arm only" holds by construction. Shadow lane books through the same function with `depth: null` (quantity 0 ⇒ `unit_lane`, unchanged price). | `vts-exit-booking.ts`, `vts-runner.ts` |
| P6 | `composeVtsLegFriction` splits the doubled slippage per leg; exit term 0 iff `exitImpactPriced`. `vtsSlippageShareByLeg` uses the same `recomposed` gate as the spread share (**L2**: a `stamped` close keeps exit share 1). Wired in the open table (`{}`, open ⇒ both legs 1) and the CSV export (`closed`). | `vts-friction.ts`, `vts-runner.ts`, `export-csv.ts` |
| P7 | The close record carries **one nested object `exitWalk { levelsSeen, walkedQty, extrapolatedQty, sizeBasis, sizeCertain, impactPriced }`** (closed JSON, persist payload, archive `state_snapshot.exitWalk`). **DEVIATION, stated:** the plan named flat fields `exitLevelsSeen`…`exitImpactPriced`; same content, one key. `sizeCertain` is STORED (**L3**). | `vts-runner.ts`, `vts-service.ts` |
| P8 | Migration `2026-11-07-b-price-side-kd19-vts-epoch.sql` (+ rollback, MANIFEST last): `calibration_epoch` vts +1 for `crypto_spot` and `xstock_spot`, every other epoch row asserted unchanged against its pre-image, one transaction, `updated_by 'b-price-side-kd19'`, `updated_at = now()`. | drizzle |
| P9 | Per-class counters on the `[8a-P3][VTS_TOUCH]` pass line: `walked`, `walkExtrapolated`, `walkUncertain`, `sizeAbsent`, `noDepthConfig`. **DEVIATION, stated:** the plan's `restRounded` is reported as `walkUncertain` (a rounded size that failed the certainty bound); a rounded size that PASSED it counts in `walked`. | `vts-exit-counters.ts` |
| P10 | Step 10 (not in this diff). | — |

## Load-bearing hunks
**`vts-exit-booking.ts` — the booking order (L1, BLOCKER-1, BLOCKER-2):**
```ts
const booked = resolveVtsBookedExitPrice(i.observedBid, i.observedMark);
if (booked.price === null) return top('absent');
if (!(Number.isFinite(i.quantity) && i.quantity > 0)) return top('unit_lane');           // L1
const levels = (i.depth?.levels ?? []).filter((l) => l.price > 0 && Number.isFinite(l.qty) && l.qty > 0); // BLOCKER-2
if (i.depth === null || levels.length === 0) return top('absent');
if (typeof i.penaltyBps !== 'number' || !Number.isFinite(i.penaltyBps)) return top('no_depth_config');
const walked = walkVtsExit(i.quantity, levels, i.penaltyBps);
const stated = levels.reduce((s, l) => s + l.qty, 0);
const sizeCertain = i.depth.basis === 'exact' || i.quantity <= stated - 1;              // BLOCKER-1, L4 ratchet
return { price: walked.avgFillPrice, arm: booked.arm, levelsSeen: levels.length,
  walkedQty: walked.walkedQty, extrapolatedQty: walked.extrapolatedQty, sizeBasis: i.depth.basis,
  sizeCertain, impactPriced: sizeCertain };
```
**`vts-runner.ts` — the depth the trigger accepted (K6), per class:**
```ts
// xStock: one level at the guarded bid, from the row the guard judged
_vtsExitDepth = _xsExit.bid !== null && _xsBidQty !== null ? { levels: [{ price: _xsExit.bid, qty: _xsBidQty }], basis: 'exact' } : null;
// crypto: the book's accepted levels, else the ticker quote's one sized level
_vtsExitDepth = _et.acceptedBookBids !== null
  ? { levels: _et.acceptedBookBids, basis: 'exact' }
  : _et.selection.ok && _et.selection.quote.bidQty !== null && _et.selection.quote.sizeBasis !== null
    ? { levels: [{ price: _et.selection.quote.bid, qty: _et.selection.quote.bidQty }], basis: _et.selection.quote.sizeBasis }
    : null;
const _vtsPenaltyBps = trade.assetClass === 'crypto_spot' || trade.assetClass === 'xstock_spot'
  ? (await resolveFillDepthGateConfig(trade.assetClass))?.beyondDepthPenaltyBps ?? null : null;   // cached per class
const _vtsBooked = bookVtsExit({ observedBid: _vtsExitBid, observedMark: currentPrice, quantity: trade.quantity, depth: _vtsExitDepth, penaltyBps: _vtsPenaltyBps });
…
const _closeFr = recomposeVtsCloseFriction(trade, exitArm, exitWalk.impactPriced);
```
**`vts-friction.ts` — (c):**
```ts
- return i.entryFee + i.exitFee + i.slippage * 2 + entrySpread + exitSpread;
+ const exitSlippage = i.exitImpactPriced === true ? 0 : i.slippage;
+ return i.entryFee + i.exitFee + i.slippage + exitSlippage + entrySpread + exitSpread;
// recompose: exitImpactPriced: exitArm === 'bid' && exitImpactPriced
// split: exit share 0 only when closed && frictionBasis === 'recomposed' && exitWalk.impactPriced === true   (L2)
```
**`depth-walk.ts` — P1:**
```ts
- if (!walked.exhausted) return walked;
+ if (!walked.exhausted) return { ...walked, walkedQty: walked.filledQty, extrapolatedQty: 0 };
  … penalty path:
- exhausted: false,
+ exhausted: true, walkedQty: walked.filledQty, extrapolatedQty: remainder,
```

## Judgement calls — attack these
1. **`no_depth_config` books the top bid WITH the allowance** (error-logged, counted) where paper REJECTS the close. Chosen because a VTS close has no position to leave open and refusing would strand the learning row; recorded as divergence 3 in System Manual §18.0.1 at Step 10. Is that the right divergence, or should the VTS close also refuse?
2. **`exhausted` flips to true on the penalty path.** Census: `closeFillFull` has two callers after this diff (paper `closeOrder`, VTS `walkVtsExit`); neither reads `exhausted`. `openFill` / `walkBook` unchanged.
3. **P7 as one nested object, P9 `walkUncertain` for `restRounded`** — the two naming deviations above.
4. **The xStock depth is ONE level** (the row's `bidQty`, exact). Any order larger than it prices the remainder at the 50 bps penalty — the same rule paper applies to its own captured book.

## Pre-registered Step-7 read
Pre-audit §7 (written before the data), unchanged.
