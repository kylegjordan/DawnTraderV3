# B-PRICE-SIDE-BY-JOB row `8a-P3` — CHANGE LIST (Step 4)

**Graded ref:** the commit that adds this file on `origin/migration/aws-supabase` (sha in the dispatch).
**Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P3_SCOPE_AUDIT_AND_PLAN.md` r4, approved at `0b6c93d20` with conditions.
**Change set (18 files):** NEW `server/core/trading/crypto-touch.ts` · NEW `server/tests/unit/b-price-side-8a-p3-crypto-finish.test.ts` · NEW `drizzle/migrations/2026-09-15-b-price-side-8a-p3-vts-crypto-epoch.sql` + `-rollback.sql` · MODIFIED `pending-maker-logic.ts`, `vts-exit-booking.ts`, `level-basis.ts`, `active-execution-engine.ts`, `vts-runner.ts`, `xstock_spot/eval-cycle.ts`, `shared/schema.ts`, `drizzle/migrations/MANIFEST.txt`, and six existing tests.

---

## 1. Cell → code

| cell | where | now |
|---|---|---|
| C1 paper resting entry | `aee` `_processPendingMaker` | `selectCryptoTouch(…, { ENTRY_FILL_TOUCH_MAX_AGE_MS, ENTRY_LEG_NO_SPREAD_CEILING })` → `transactablePrice: fillPrice` (the ASK); stage `active_entry_fill`; xStock `fillPrice = safePrice` |
| C2 paper resting target sale | `aee` exit-rest seam | `_restFillPrice = _posClass === 'crypto_spot' ? (_lsSel ok ? bid : null) : currentPrice`; `decisionPrice: _restFillPrice` |
| C3 VTS resting entry | `vts-runner` pending pre-pass | `_pFillPrice` = ASK via `selectCryptoTouch` (90,000 ms, no spread ceiling); stage `vts_entry_fill` |
| C4 VTS placement | `generatePhase10Signal` | NEW `placementAsk`; `currentMarketPrice` untouched (B53 guard); no ask ⇒ rests + `makerPlacedNoAsk` |
| C5 VTS trigger | real + shadow lane | `triggerPrice: _vtsTriggerPrice` (BID) / shadow `_sExitBid`; stage `vts_exit_trigger` (real lane only) |
| C6 VTS booking | real + shadow lane | `resolveVtsBookedExitPrice(assetClass, bid, mark, clamp)` → `{ price, arm }`; `clamp_no_bid` counted |
| C7 VTS twin placement | `planTwin` / `maybeOpenTwin` | `placementTransactablePrice: number \| null`; null ⇒ not marketable (as paper) |

## 2. Load-bearing hunks

**The touch read — normalise before the book lookup (r4 CONDITION-1):**
```ts
export function selectCryptoTouch(rawSymbol, readers, nowMs, policy) {
  const internalSymbol = readers.normalize(rawSymbol);
  const book = readers.getBook(internalSymbol);
  const selection = selectTouchPrice({ book: book ? { bid, ask, stampMs: nowMs - book.ageMs, clockBasis: 'receipt', producer: 'kraken_ws_book' } : null,
    bookEligible: true, ticker: tickerLegFromCachedQuote(readers.getCached(internalSymbol)), tickerBasis: 'ticker_bbo' }, nowMs, policy);
  return { internalSymbol, selection };
}
```
Readers in both engines: `normalize: normalizeToInternalSymbol`, `getBook: getBookForFill`, `getCached: priceCache.getCachedPrice` — never `priceDataMap` (r3 FINDING-2). Fence: test 1 drives an external symbol form whose book exists only under the internal form; 1b is the control without the normaliser.

**C1 — the fill, the first-look split, and the stamp:**
```ts
    let fillPrice: number | null = safePrice;                       // xStock: the mark, explicitly
    if (_isCryptoPending) {
      const _ft = selectCryptoTouch(position.symbol, CRYPTO_TOUCH_READERS, Date.now(), {
        maxAgeMs: ENTRY_FILL_TOUCH_MAX_AGE_MS, maxSpreadFraction: ENTRY_LEG_NO_SPREAD_CEILING });
      fillPrice = transactableSide(_ft.selection, side);
      const _firstLook = !this._entryFillLooked.has(position.id); …
      if (!_ft.selection.ok) { if (_firstLook) this._entryFillRefusedFirstLook++; else this._entryFillRefusedSteady++; }
    }
    const outcome = evaluatePendingMaker({ side, transactablePrice: fillPrice, limit, nowMs: Date.now(), deadlineMs });
    …
          entryPriceSource: _fillSource,              // `${basis}:${producer}` on crypto, provenance.source otherwise
          entryDecisionPrice: _fillDecisionPrice.toString(),   // the ASK on crypto, the limit on xStock
          entryBookAgeMs: _fillBookAgeMs,             // book rung only; null = ticker rung (post-cutover)
```

**C2:**
```ts
          const _restFillPrice: number | null = _posClass === 'crypto_spot' ? (_lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : null) : currentPrice;
          const _restOutcome = evaluatePendingMaker({ side: 'sell', transactablePrice: _restFillPrice, limit: _exitRestLimit, … });
```

**C4 / C7 — placement, the permissive arm matching paper:**
```ts
  const placementAsk: number | null = _assetClass === 'crypto_spot'
    ? transactableSide(selectCryptoTouch(symbol, VTS_CRYPTO_TOUCH_READERS, Date.now(), { VTS_EXIT_TOUCH_MAX_AGE_MS, ENTRY_LEG_NO_SPREAD_CEILING }).selection, 'buy')
    : currentMarketPrice;
  if (_vtsMtDecision.chosenMode === 'maker') {
    if (placementAsk !== null && isMarketableAtPlacement({ side: 'buy', transactablePrice: placementAsk, limit: entryPrice })) { … }
    else { if (placementAsk === null) _vtsTouch.makerPlacedNoAsk++; _vtsPendingMaker = true; }
```
Paper's matching arm gains the same counter: `if (_b72cBestAsk == null) this._makerPlacedNoAsk++;`.

**C5 / C6 — real lane:**
```ts
    let _vtsExitBid: number | null = null;
    let _vtsTriggerPrice: number | null = currentPrice;          // xStock
    if (trade.assetClass === 'crypto_spot') {
      const _et = selectCryptoTouch(trade.symbol, VTS_CRYPTO_TOUCH_READERS, Date.now(), { VTS_EXIT_TOUCH_MAX_AGE_MS, VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION });
      _vtsExitBid = transactableSide(_et.selection, 'sell');
      _vtsTriggerPrice = _vtsExitBid;                              // null ⇒ no_transactable_side, no fallback
    }
    …        triggerPrice: _vtsTriggerPrice,
    const _vtsBooked = resolveVtsBookedExitPrice(trade.assetClass, _vtsExitBid, currentPrice, decision.exitPrice);
    if (_vtsBooked.arm === 'clamp_no_bid') _vtsTouch.bookedNoBidClamp++;
```

**Booking arms (`vts-exit-booking.ts`):** non-crypto → `clamp_class_seam`; no usable mark → `clamp_no_mark` (unchanged); mark but no usable bid → `clamp_no_bid` (NEW, counted); else `bid`.

**Epoch migration:** `UPDATE … +1 WHERE calibration_epoch / crypto_spot / vts`, then a DO block asserting exactly one such row existed and that every epoch row moved by exactly `+1` if it is vts/crypto_spot and `0` otherwise. Rollback bumps +1 again and deletes the `_migrations` row.

## 3. Conditions (r4) — where each landed
| condition | landed |
|---|---|
| CONDITION-1 — book lookup normalised; fence with external ≠ internal form | `crypto-touch.ts` normalises inside the one helper; test 1 + control 1b |
| CONDITION-2 — P-7g scope comment corrected; exit ceiling homed at `3n.o` with the citation | `aee` P-7g block rewritten; `3n.o` home stated there (plan row text owed at Step 10) |
| FINDING-1 — first-look vs steady-state refusals | separate counters on both lanes; printed with their denominators |
| r3 CONDITION-1 — `entry_book_age_ms` null has two meanings | both schema comments name the cutover by the `entry_price_source` form |

## 4. Judgement calls worth attacking
1. **`_fillDecisionPrice` on xStock stays the LIMIT** while crypto now stores the ASK — one column, two quantities, disambiguated only by `entry_price_source`. The alternative (xStock also storing its mark) would change xStock rows in a crypto-only batch.
2. **`entryObservedAtMs` still stamps the MARK's observation time** on a crypto fill decided by a touch quote. The rung's age is recorded only on the book rung. I left it because re-deriving it means reconstructing an instant from an age on the ticker rung; say if you want it moved.
3. **The shadow lane decides and books on the bid but records no counters or funnel cells**, so it never pools into the real lane's cells.
4. **The VTS `[8a-P3][VTS_TOUCH]` line prints once per resolve pass** only when a crypto look, a fill look or a no-ask placement happened.

## 5. Verified locally
`scripts/check-tsc-baseline.mjs`: 377 = baseline 377. The 10 affected test files: 158/158. Full unit run: 270 files pass; 4 files fail to load on this Windows clone and touch nothing in this change set (two `SyntaxError` on `.mjs` parsing, two need a local Postgres on 5432). CI is the authoritative run.
