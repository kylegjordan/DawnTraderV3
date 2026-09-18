/**
 * `8a-P3` — EVERY CRYPTO MAKER FILL, PLACEMENT CHECK AND VTS EXIT ON THE TRANSACTABLE SIDE.
 *
 * Each divergent case puts the MIDPOINT on one side of a limit and the transactable side on the
 * other, and asserts both arms — so a revert to the midpoint fails here rather than passing quietly.
 * Scope: `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P3_SCOPE_AUDIT_AND_PLAN.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  selectCryptoTouch,
  transactableSide,
  ENTRY_FILL_TOUCH_MAX_AGE_MS,
  VTS_EXIT_TOUCH_MAX_AGE_MS,
  VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION,
  ENTRY_LEG_NO_SPREAD_CEILING,
  type CryptoBookTop,
  type CryptoTouchReaders,
} from '../../core/trading/crypto-touch.js';
import { resolveVtsBookedExitPrice } from '../../core/trading/vts-exit-booking.js';
import { evaluatePendingMaker, isMarketableAtPlacement, planTwin } from '../../core/trading/pending-maker-logic.js';

const NOW = 1_000_000_000;
const book = (bid: number, ask: number, ageMs = 100): CryptoBookTop => ({ bids: [{ price: bid }], asks: [{ price: ask }], ageMs });
const sides = (bid: number, ask: number, ageMs: number) => ({
  bid, ask, venueObservedAtMs: null, sidesCapturedAtMs: NOW - ageMs, lastSource: 'kraken_rest',
});
const readers = (o: {
  books?: Record<string, CryptoBookTop>;
  cached?: Record<string, ReturnType<typeof sides>>;
  normalize?: (s: string) => string;
}): CryptoTouchReaders => ({
  normalize: o.normalize ?? ((s) => s),
  getBook: (s) => o.books?.[s] ?? null,
  getCached: (s) => o.cached?.[s] ?? null,
});
const EXIT_VTS = { maxAgeMs: VTS_EXIT_TOUCH_MAX_AGE_MS, maxSpreadFraction: VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION };
const ENTRY_PAPER = { maxAgeMs: ENTRY_FILL_TOUCH_MAX_AGE_MS, maxSpreadFraction: ENTRY_LEG_NO_SPREAD_CEILING };

describe('8a-P3 — the touch read', () => {
  it('1. ⛔ CONDITION-1: the book is looked up under the NORMALISED symbol', () => {
    const r = readers({ books: { 'BTC/USD': book(99.9, 100.1) }, normalize: (s) => (s === 'XBTUSD' ? 'BTC/USD' : s) });
    const { internalSymbol, selection } = selectCryptoTouch('XBTUSD', r, NOW, ENTRY_PAPER);
    expect(internalSymbol).toBe('BTC/USD');
    expect(selection.ok && selection.quote.basis).toBe('book_top');
  });

  it('1b. CONTROL: without the normaliser the same external form finds no book at all', () => {
    const r = readers({ books: { 'BTC/USD': book(99.9, 100.1) } });
    expect(selectCryptoTouch('XBTUSD', r, NOW, ENTRY_PAPER).selection.ok).toBe(false);
  });

  it('2. a BUY takes the ASK, a SELL takes the BID, a refusal takes nothing', () => {
    const { selection } = selectCryptoTouch('ETH/USD', readers({ books: { 'ETH/USD': book(99, 101) } }), NOW, ENTRY_PAPER);
    expect(transactableSide(selection, 'buy')).toBe(101);
    expect(transactableSide(selection, 'sell')).toBe(99);
    const refused = selectCryptoTouch('ETH/USD', readers({}), NOW, ENTRY_PAPER).selection;
    expect(transactableSide(refused, 'buy')).toBeNull();
  });

  it('3. entry legs take NO spread ceiling; the VTS exit lane refuses the same wide book', () => {
    const r = readers({ books: { 'ETH/USD': book(90, 110) } });
    expect(selectCryptoTouch('ETH/USD', r, NOW, ENTRY_PAPER).selection.ok).toBe(true);
    expect(selectCryptoTouch('ETH/USD', r, NOW, EXIT_VTS).selection.ok).toBe(false);
  });

  it('4. ages gate the SIDES: VTS 90 s, paper entry 8 s — both edges', () => {
    const at = (ageMs: number) => readers({ cached: { 'SOL/USD': sides(99.9, 100.1, ageMs) } });
    expect(selectCryptoTouch('SOL/USD', at(89_000), NOW, EXIT_VTS).selection.ok).toBe(true);
    expect(selectCryptoTouch('SOL/USD', at(91_000), NOW, EXIT_VTS).selection.ok).toBe(false);
    expect(selectCryptoTouch('SOL/USD', at(7_900), NOW, ENTRY_PAPER).selection.ok).toBe(true);
    expect(selectCryptoTouch('SOL/USD', at(8_100), NOW, ENTRY_PAPER).selection.ok).toBe(false);
  });
});

describe('8a-P3 — divergent fixtures: the midpoint and the transactable side disagree', () => {
  const base = { limit: 100, nowMs: 0, deadlineMs: null };

  it('C1/C3. a resting BUY: mid 100 reaches the limit, the ask 100.2 does not — only the ask decides', () => {
    expect(evaluatePendingMaker({ ...base, side: 'buy', transactablePrice: 100 })).toBe('fill'); // what the mid did
    expect(evaluatePendingMaker({ ...base, side: 'buy', transactablePrice: 100.2 })).toBe('rest'); // what a seller allows
  });

  it('C2. a resting SELL: mid 100.1 is through the limit, the bid 99.9 is not', () => {
    expect(evaluatePendingMaker({ ...base, side: 'sell', transactablePrice: 100.1 })).toBe('fill');
    expect(evaluatePendingMaker({ ...base, side: 'sell', transactablePrice: 99.9 })).toBe('rest');
  });

  it('C1/C3. no transactable side ⇒ no fill, but the hard-drop deadline still fires', () => {
    expect(evaluatePendingMaker({ side: 'buy', transactablePrice: null, limit: 100, nowMs: 5, deadlineMs: 10 })).toBe('rest');
    expect(evaluatePendingMaker({ side: 'buy', transactablePrice: null, limit: 100, nowMs: 10, deadlineMs: 10 })).toBe('drop');
  });

  it('C4. placement is marketable on the ASK at or through the limit', () => {
    expect(isMarketableAtPlacement({ side: 'buy', transactablePrice: 99.5, limit: 100 })).toBe(true);
    expect(isMarketableAtPlacement({ side: 'buy', transactablePrice: 100.5, limit: 100 })).toBe(false);
  });

  const twin = (placementTransactablePrice: number | null) => planTwin({
    twinEnabled: true, pendingMaker: false, decisionChosenMode: 'taker', limitPrice: 100,
    placementTransactablePrice, feeRateMaker: 0.004, feeRateTaker: 0.008, makerMaxPendingMs: () => 3_600_000, nowMs: 0,
  });

  it('C7. the maker twin skips when the ASK is marketable', () => {
    expect(twin(99)).toEqual({ kind: 'skip', reason: 'marketable_maker' });
  });

  it('C7/P5. NO usable ask ⇒ the maker twin RESTS — the permissive arm, matching paper', () => {
    const plan = twin(null);
    expect(plan.kind).toBe('open');
    expect(plan.kind === 'open' && plan.twinMode).toBe('maker');
  });

  it('C6. crypto books the BID; every clamp arm is named', () => {
    expect(resolveVtsBookedExitPrice('crypto_spot', 99.5, 100, 101)).toEqual({ price: 99.5, arm: 'bid' });
    expect(resolveVtsBookedExitPrice('crypto_spot', null, 100, 101)).toEqual({ price: 101, arm: 'clamp_no_bid' });
    expect(resolveVtsBookedExitPrice('crypto_spot', 99.5, null, 101)).toEqual({ price: 101, arm: 'clamp_no_mark' });
    expect(resolveVtsBookedExitPrice('xstock_spot', 99.5, 100, 101)).toEqual({ price: 101, arm: 'clamp_class_seam' });
  });
});

describe('8a-P3 — the call sites read the transactable side, and xStock is explicit', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
  const AEE = read('server/services/active-execution-engine.ts');
  const VTS = read('server/services/vts-runner.ts');
  const XS = read('server/asset_classes/xstock_spot/eval-cycle.ts');

  it('paper C1: the pending fill passes the touch side under its own stage and ceiling', () => {
    expect(AEE).toMatch(/transactablePrice:\s*fillPrice/);
    expect(AEE).toMatch(/stage:\s*'active_entry_fill'/);
    expect(AEE).toMatch(/maxAgeMs:\s*ENTRY_FILL_TOUCH_MAX_AGE_MS,\s*maxSpreadFraction:\s*ENTRY_LEG_NO_SPREAD_CEILING/);
    expect(AEE).not.toMatch(/currentPrice:\s*safePrice/);
  });

  it('paper C2: the resting target sale fills on the exit trigger\'s own bid; xStock on its guard-validated bid (`8a-P4b`); any other class keeps the mark', () => {
    // ⛔ AMENDED DELIBERATELY by `8a-P4b` X2 (2026-09-18): this pinned "xStock keeps the mark explicitly", which was the
    // `8a-P3` statement of scope. xStock now fills on `xsBid`; the mark survives only as the named default arm.
    expect(AEE).toMatch(/_restFillPrice:\s*number \| null = _posClass === 'crypto_spot'\s*\?\s*\(_lsSel !== null && _lsSel\.ok \? _lsSel\.quote\.bid : null\)\s*\n\s*:\s*_posClass === 'xstock_spot' \? xsBid\s*\n\s*:\s*currentPrice;/);
    expect(AEE).toMatch(/transactablePrice:\s*_restFillPrice/);
  });

  it('VTS C3/C5/C6: ask for the fill, bid for the trigger and the booking — no midpoint fallback', () => {
    expect(VTS).toMatch(/transactablePrice:\s*_pFillPrice/);
    expect(VTS).toMatch(/triggerPrice:\s*_vtsTriggerPrice/);
    expect(VTS).toMatch(/resolveVtsBookedExitPrice\(trade\.assetClass,\s*_vtsExitBid,\s*currentPrice/);
    expect(VTS).not.toMatch(/_vtsTriggerPrice\s*=\s*_vtsExitBid\s*\?\?/);
    expect(VTS).not.toMatch(/triggerPrice:\s*currentPrice,/);
  });

  it('VTS C4/C7: placement reads placementAsk, never currentMarketPrice; the B53 guard keeps the mid', () => {
    expect(VTS).not.toMatch(/isMarketableAtPlacement\([^)]*currentMarketPrice/);
    expect(VTS).toMatch(/placementTransactablePrice:\s*placementAsk/);
    expect(VTS).toMatch(/const currentMarketPrice = priceData\.price;/);
  });

  it('xStock passes its mark explicitly at both shared placement sites (8a-P4 moves it)', () => {
    expect(XS).toMatch(/isMarketableAtPlacement\(\{\s*side:\s*'buy',\s*transactablePrice:\s*lastPrice/);
    expect(XS).toMatch(/placementTransactablePrice:\s*lastPrice/);
  });
});

describe('8a-P3 Step-4 r2 — the refusal rail and the per-event rest record', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
  const AEE = read('server/services/active-execution-engine.ts');
  const VTS = read('server/services/vts-runner.ts');

  it('BLOCKER-1: a VTS exit refusal is tracked PER TRADE ID with a once-per-streak alert, and cleared on a decision', () => {
    expect(VTS).toMatch(/_vtsNoTriggerStreak\.get\(tradeId\)/);
    expect(VTS).toMatch(/if \(!_nt\.alerted && _ntNow - _nt\.sinceMs >= VTS_NO_TRIGGER_ALERT_AFTER_MS\)/);
    expect(VTS).toMatch(/dedupe_key: `no-trigger-vts-\$\{trade\.symbol\}`/);
    // r3: the streak runs over EVERY no-decision reason and clears ONLY on a real decision.
    expect(VTS).toMatch(/if \(decision\.noDecisionReason !== undefined && trade\.assetClass === 'crypto_spot'\) \{/);
    expect(VTS).toMatch(/\} else \{\s*_vtsNoTriggerStreak\.delete\(tradeId\);/);
    expect(VTS).not.toMatch(/if \(decision\.noDecisionReason === 'no_transactable_side'\) \{\s*_vtsTouch\.exitNoTransactableSide\+\+;\s*const _ntNow/);
    expect(VTS).not.toMatch(/_vtsNoTriggerStreak\.get\(trade\.symbol\)/);
  });

  it('BLOCKER-1 floor: the shadow lane counts its refusals', () => {
    expect(VTS).toMatch(/_vtsShadowTouch\.noTransactableSide\+\+/);
    expect(VTS).toMatch(/\[8a-P3\]\[VTS_SHADOW_TOUCH\]/);
  });

  it('C2: the no-ask rest is a per-event record in the placement path on both lanes, not a pass counter', () => {
    expect(AEE).toMatch(/\[8a-P3\]\[MAKER_RESTED:\$\{this\.mode\}\] \$\{signal\.symbol\} \(\$\{_openClass\}\)[^`]*ask=\$\{_b72cBestAsk \?\? 'none'\}/);
    expect(VTS).toMatch(/\[8a-P3\]\[VTS\]\[MAKER_RESTED\][^`]*ask=\$\{placementAsk \?\? 'none'\}/);
    expect(AEE).not.toMatch(/makerPlacedNoAsk/);
    expect(VTS).not.toMatch(/makerPlacedNoAsk/);
  });

  it('r3 BLOCKER-2: the paper first-look record is pruned against the CYCLE\'S POSITIONS, not the looked-set', () => {
    expect(AEE).toMatch(/const _cyclePositionIds = new Set\(openPositions\.map/);
    expect(AEE).not.toMatch(/_entryFillLookedThisCycle/);
  });

  it('r3 CONDITION-1: the fallback and dropped placement lines carry the asset class on every lane', () => {
    const XS = read('server/asset_classes/xstock_spot/eval-cycle.ts');
    expect(AEE).toMatch(/MARKETABLE_TAKER_FALLBACK:\$\{this\.mode\}\] \$\{signal\.symbol\} \(\$\{_openClass\}\)/);
    expect(AEE).toMatch(/MAKER_MARKETABLE_DROPPED:\$\{this\.mode\}\] \$\{signal\.symbol\} \(\$\{_openClass\}\)/);
    expect(VTS).toMatch(/\[VTS\]\[MARKETABLE_TAKER_FALLBACK\] \$\{symbol\}\/\$\{strategy\} \(\$\{_assetClass\}\)/);
    expect(VTS).toMatch(/\[VTS\]\[MAKER_MARKETABLE_DROPPED\] \$\{symbol\}\/\$\{strategy\} \(\$\{_assetClass\}\)/);
    expect(XS).toMatch(/\[VTS\]\[MARKETABLE_TAKER_FALLBACK\] \$\{symbol\}\/\$\{strategyKey\} \(xstock_spot\)/);
    expect(XS).toMatch(/\[VTS\]\[MAKER_MARKETABLE_DROPPED\] \$\{symbol\}\/\$\{strategyKey\} \(xstock_spot\)/);
    // r3 BLOCKER-1/1b: the shared twin seam serves both lanes, so every twin line carries the class, and the
    // denominator's discriminator is a literal token in the line rather than a code-only reason string.
    expect(VTS).toMatch(/\[VTS\]\[TWIN_SKIPPED\] \$\{symbol\}\/\$\{strategy\} \(\$\{tradeAssetClass\}\) reason=marketable_maker/);
    expect(VTS).toMatch(/\[VTS\]\[TWIN_SKIPPED\] \$\{symbol\}\/\$\{strategy\} \(\$\{tradeAssetClass\}\) reason=degenerate_fallback/);
    expect(VTS).toMatch(/\[VTS\]\[TWIN_OPENED\] \$\{symbol\}\/\$\{strategy\} \(\$\{tradeAssetClass\}\)/);
  });

  it('nit: the resting-sale fill narrows the side instead of casting it', () => {
    expect(AEE).toMatch(/if \(_restOutcome === 'fill' && _restFillPrice !== null\)/);
    expect(AEE).not.toMatch(/_restFillPrice as number/);
  });
});
