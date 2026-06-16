# P19-B4b.1 — Change List (Langston Step-4 code review)

**Batch:** P19-B4b.1 (paper fill fidelity: crypto depth-walked fill + partial-open + #295 24/5 depth-sufficiency gate) · **Author:** Claude New (CC-B) · **Date:** 2026-06-16
**Local commit (pre-push):** `b74526dc3` on `migration/aws-supabase` (18 files). **DORMANT until B7b** (active trading off).
**Bench:** tsc baseline **404 < 494 (no regressions)**; vitest **1979** (the 2 "failures" are 5s load-timeouts that pass in isolation at 1.8s — confirmed flakes, files I didn't touch).

> **INFRASTRUCTURE NOTE:** do NOT cd `/mnt/gdrive` or git on the FUSE mount. The load-bearing diffs are embedded below; for anything beyond them use `ssh staging 'cd /home/deploy/dawntrader && git show b74526dc3 -- <path>'` after push, or read the local files under `server/services/execution/`.

## How each Step-2 condition is met
- **Q-A (close full-fill + DB-resolved penalty, NOT 0.5% literal):** `closeFillFull` always returns the full qty; the beyond-book remainder is priced with `beyondDepthPenaltyBps` passed from `fill_depth_gate` (DB). The golden test pins the *helper*'s 0.5%-on-exceed to the legacy value, but the active seam ships ZERO magic % — grep `order-placer.ts`/`paper-execution-engine.ts` for a literal slippage/depth constant → none (only the DB-resolved value).
- **Q-B (both-class gate):** the engine `_evaluateOpenDepthGate` runs for crypto (10-level walk) AND xStock (top-of-book `askDepthUsd` via `xstock_spot_ticker_snap`). Not freshness-only.
- **Q-C (per-class DB ratio + warmth, fail-closed; specific EV-justified seeds):** `fill_depth_gate` seeds crypto `multiple=3 / warmth=5000ms`, xStock `multiple=2 / warmth=15000ms` — net-expectancy justification embedded in the migration header (consume-fraction ≤1/multiple keeps walked slippage within the EV-gate's friction headroom; precise calibration → Phase-25 run). Missing config → refuse+alarm (fail-closed); no silent constant.
- **Q-D (#300 → B4b.2 + B7b gate-#13):** **TO LAND AT STEP-10 GOVERNANCE** (not in this code commit): RUNNING_ISSUES #300 (dead-executor + dup-WS sweep, the 3 clean cuts independent of the #297-entangled pre-execution-validator) homed to a numbered PHASE_19_PLAN §1 B4b.2 row before B7b; B7b gate-#13 written requiring BOTH crypto depth-sufficiency AND xStock #236 liveness per class. Flagging now so you can confirm the plan at Step-4; the artifacts land with the governance push.
- **Q-A golden (C-Q2a):** `depth-walk.test.ts` embeds the verbatim `calculatePriceImpact` consume-loop as the golden reference and pins `walkBook`'s avg fill across 6 fixtures + the >book case.
- **Q-C5 (RNG-free):** no `Math.random`/jitter anywhere in `depth-walk.ts` / `order-placer.ts` / the seam; the Box-Muller micro-move is dropped. Determinism test included.
- **Hold #1 (filled-qty propagation):** the engine reassigns `quantity = _openFill.fillQty` at ONE point right after the fill → every downstream consumer (trade+position writes, heat, risk-concentration, broadcasts, SLAL) uses filled qty. No in-memory heat object is seeded with the requested qty before this (the EV/risk pre-checks run *earlier* on requested size, correctly). See the seam diff.
- **Hold #2 (partial-close double-count):** N/A by design — closes never return partial (R2 full-fill), so no decrement/double-count path exists.
- **Verify-before-cut correction:** I initially removed `isXstockLiquidFillWindowET` + its config keys, then the grep sweep found `equity-spot-archiver.ts:316` still uses them for the silent-stall watchdog's RTH-vs-off-RTH threshold (a valid, non-fill use). RESTORED predicate + keys + migration (no DELETE); retired ONLY the active-dispatch FILL gate. Flagging explicitly.

---

## NEW — `server/services/execution/depth-walk.ts` (pure, RNG-free)
```ts
export function walkBook(orderQty, levels): WalkResult {           // VWAP over consumed best-first levels
  let remaining=orderQty, consumedNotional=0, filledQty=0;
  for (const {price,qty} of levels) { if (remaining<=0) break; if(!(price>0)||!(qty>0)) continue;
    const take=Math.min(remaining,qty); consumedNotional+=take*price; filledQty+=take; remaining-=take; }
  return { filledQty, avgFillPrice: filledQty>0?consumedNotional/filledQty:0, consumedNotional,
           exhausted: filledQty+1e-12 < orderQty }; }
export function openFill(q, asks) { return walkBook(q, asks); }    // partial if exhausted
export function closeFillFull(q, bids, penaltyBps) {               // ALWAYS full-fill (R2)
  const w=walkBook(q,bids); if(!w.exhausted) return w;
  const remainder=q-w.filledQty; const lastTouched=[...bids].reverse().find(l=>l.price>0&&l.qty>0);
  const refPrice=w.filledQty>0?(lastTouched?.price??w.avgFillPrice):(bids.find(l=>l.price>0)?.price??0);
  const penalized=refPrice*(1-penaltyBps/10_000); const total=w.consumedNotional+remainder*penalized;
  return { filledQty:q, avgFillPrice:total/q, consumedNotional:total, exhausted:false }; }
```

## MODIFIED — `server/services/execution/order-placer.ts` (flat % → depth-walk)
```ts
async openOrder(req) {
  const asks=req.bookAsks; if(!asks||!asks.length) return {status:'rejected',reason:'no_ask_book_for_open',code:'DEPTH_UNAVAILABLE'};
  const w=openFill(req.quantity,asks); if(w.filledQty<=0) return {status:'rejected',...};
  const fillPrice=w.avgFillPrice, fillQty=w.filledQty, feeQuote=fillPrice*fillQty*(this.feePercentFor(req.symbol)/100);
  const slippageQuote=(fillPrice-req.intendedPrice)*fillQty;       // vs signal price, over filled
  return w.exhausted ? {status:'partial',fillPrice,fillQty,requestedQty:req.quantity,feeQuote,slippageQuote,remainingQty:req.quantity-fillQty}
                     : {status:'filled',fillPrice,fillQty,feeQuote,slippageQuote}; }
async closeOrder(req) {                                            // always 'filled'
  const bids=req.bookBids, penaltyBps=req.beyondDepthPenaltyBps; let fillPrice;
  if (bids?.length && typeof penaltyBps==='number') fillPrice=closeFillFull(req.quantity,bids,penaltyBps).avgFillPrice;
  else if (typeof penaltyBps==='number') { fillPrice=req.requestedPrice*(1-penaltyBps/10_000); console.warn('[CLOSE_COLD_BOOK]...'); }
  else { fillPrice=req.requestedPrice; console.error('[CLOSE_NO_DEPTH_CONFIG]... LOUD'); }     // must still exit
  return {status:'filled',fillPrice,fillQty:req.quantity,feeQuote:fillPrice*req.quantity*(this.feePercentFor(req.symbol)/100),
          slippageQuote:(req.requestedPrice-fillPrice)*req.quantity}; }
```

## MODIFIED — `server/services/paper-execution-engine.ts` open seam (gate + filled-qty reassign)
```ts
const _openClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol,'kraken');
if (_openClass===null) { console.warn('[OPEN_SKIP] unclassifiable...'); return; }
const _gate = await this._evaluateOpenDepthGate(signal.symbol, _openClass, signal.entryPrice*quantity);   // 24/5 #295 gate
if (!_gate.pass || !_gate.snapshot) { console.warn('[DEPTH_GATE_BLOCK]...'); recordDepthGateBlock(_openClass,_gate.reason); return; }
const _openFill = await this.orderPlacer.openOrder({ symbol:signal.symbol, side:'buy', quantity,
  intendedPrice:signal.entryPrice, mode:this.mode, assetClass:_openClass, bookAsks:_gate.snapshot.asks });
if (_openFill.status==='rejected') { ...return; }
if (_openFill.status!=='filled' && _openFill.status!=='partial') { ...return; }
if (_openFill.status==='partial') console.warn('[OPEN_PARTIAL] requested=... filled=... — sizing to filled qty');
quantity = _openFill.fillQty;                          // ← SINGLE point: all downstream uses filled qty (hold #1)
if (!(quantity>0)) { ...return; }
const actualEntryPrice=_openFill.fillPrice; const positionValue=actualEntryPrice*quantity; ...
```
`_evaluateOpenDepthGate(symbol,assetClass,orderNotional)`: `resolveFillDepthGateConfig` (null→block) → `getDepthSnapshot` → `assessWarmth(asks)` → `assessSufficiency(asks, orderNotional)`; returns `{pass,reason,snapshot}`.
**Close seam:** resolves `_closeClass`/config/snapshot, passes `bookBids:_closeSnap?.bids, beyondDepthPenaltyBps:_closeCfg?.beyondDepthPenaltyBps` to `closeOrder` (no gate — closes always exit).

## MODIFIED — `server/exchanges/kraken/kraken-websocket-adapter.ts`
- new `private bookUpdatedAt = new Map<string,number>()`; stamped each applied book delta in `handleV2BookUpdate`.
- new `getBookForFill(symbol)`: returns `{asks ascending, bids descending, ageMs}` or null (book-specific freshness, distinct from `symbolStats.lastUpdate`).

## NEW — depth-source.ts / depth-gate-config.ts + migration (per-class, fail-closed)
- `getDepthSnapshot(symbol,class)`: crypto → `krakenWebSocketAdapter.getBookForFill`; xStock → latest `xstock_spot_ticker_snap` top-of-book + `captured_at` age. `assessWarmth`/`assessSufficiency` pure. `recordDepthGateBlock`/`getDepthGateBlockStats` observable counter.
- `resolveFillDepthGateConfig(class)`: `module_constants 'fill_depth_gate'`, 4 REQUIRED keys, null on miss (fail-closed), cached.
- migration seeds crypto `(5000,3,3,50)` / xStock `(15000,2,1,50)` — header carries the EV justification; KEEPS the `liquid_fill_window_*` keys (watchdog).

## #295 disposal (active-dispatch.ts + market-hours.ts)
- `active-dispatch.ts`: removed the `isXstockLiquidFillWindowET` FILL-gate block + `_outOfSessionSkips` counter + the import. Freshness (b) + config gates stay.
- `market-hours.ts`: `isXstockLiquidFillWindowET` RETAINED (re-documented as watchdog-threshold-only, NOT a fill gate) — the verify-before-cut correction.

## Tests (+37 net): `depth-walk.test.ts` (14, golden), `p19-b4b1-depth-gate.test.ts` (10), `order-placer.test.ts` (rewritten 10), `p19-b4a-c3-predicates.test.ts`/`-c2-dispatch`/`-gate-watchdog` updated for the retired fill-gate.

**Ask (Step-4):** review the diff (`git show b74526dc3` after push, or the embedded snippets); confirm the depth-walk math, the filled-qty reassign single-point, the close full-fill + DB penalty (no magic %), the fail-closed gate, and the verify-before-cut watchdog retention. Confirm the #300/B4b.2 + B7b gate-#13 plan to land at Step-10. APPROVE or CHANGES-NEEDED.
