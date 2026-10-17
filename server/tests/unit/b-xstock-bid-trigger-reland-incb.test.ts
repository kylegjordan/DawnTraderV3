/**
 * Row 2 `B-XSTOCK-BID-TRIGGER-RELAND` increment B (objectives 5 + 8) — the size test, its call sites, the crossed-book
 * close arm and the epoch migration. Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md`
 * (r2: Langston's Step-2 BLOCKER-1..3 and calls 1-5). The trigger fence itself is `b-price-side-8a-p1-exit-fence.test.ts`
 * (2d + 2g); the chain is `b-xstock-bid-trigger-reland-inc2-chain.test.ts`; the crossed snapshot is in `…-inca.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { xstockSideSize } from '../../asset_classes/xstock_spot/transactable-sides.js';
import { vtsXstockSideSize } from '../../asset_classes/xstock_spot/vts-xs-select.js';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const AEE = stripComments(read('server/services/active-execution-engine.ts'));
const VTS = stripComments(read('server/services/vts-runner.ts'));
const XS = stripComments(read('server/asset_classes/xstock_spot/eval-cycle.ts'));
const RTB = read('server/services/rtb-retirement-ask.ts');
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

describe('P2 — xstockSideSize: the ONE top-of-book size test', () => {
  const raw = { bid: 100, ask: 100.2, bidQty: 5, askQty: 2 };
  it('ok when the shown quantity × price covers the notional, on the side asked', () => {
    expect(xstockSideSize('bid', raw, 500)).toBe('ok'); // 5 × 100 = 500
    expect(xstockSideSize('ask', raw, 200)).toBe('ok'); // 2 × 100.2 = 200.4
  });
  it('size_short when it does not — and the side matters (a SELL reads the bid, a BUY the ask)', () => {
    expect(xstockSideSize('bid', raw, 500.01)).toBe('size_short');
    expect(xstockSideSize('ask', raw, 500)).toBe('size_short'); // the ask shows only 2
    expect(xstockSideSize('bid', { ...raw, bidQty: 0 }, 1)).toBe('size_short'); // a zero quantity is shown-and-empty
  });
  it('size_unknown on a missing or non-finite quantity or price — NEVER `?? 0` (short) or `?? Infinity` (ok)', () => {
    expect(xstockSideSize('bid', { ...raw, bidQty: null }, 1)).toBe('size_unknown');
    expect(xstockSideSize('bid', { ...raw, bidQty: Number.NaN }, 1)).toBe('size_unknown');
    expect(xstockSideSize('bid', { ...raw, bid: null }, 1)).toBe('size_unknown');
    expect(xstockSideSize('ask', { ...raw, ask: 0 }, 1)).toBe('size_unknown');
    expect(xstockSideSize('ask', { ...raw, askQty: -1 }, 1)).toBe('size_unknown');
    // CONTROL: the other side's missing quantity does not touch this side's verdict
    expect(xstockSideSize('ask', { ...raw, bidQty: null }, 200)).toBe('ok');
  });
  it('a non-finite or non-positive notional THROWS — a caller bug, not a market state', () => {
    for (const n of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => xstockSideSize('bid', raw, n)).toThrow(/notional/);
  });
  it('the VTS wrapper reads the quote row\'s quantities, and makes no verdict where the selector made no price', () => {
    const row = { last: 100.1, bid: 100, ask: 100.2, atMs: 1, bidQty: 5, askQty: 2 };
    expect(vtsXstockSideSize('bid', row, 100, 500)).toBe('ok');
    expect(vtsXstockSideSize('ask', row, 100.2, 500)).toBe('size_short');
    expect(vtsXstockSideSize('ask', { ...row, askQty: null }, 100.2, 1)).toBe('size_unknown');
    expect(vtsXstockSideSize('bid', null, 100, 500)).toBeNull();
    expect(vtsXstockSideSize('bid', row, null, 500)).toBeNull();
  });
});

describe('P8(d) — the size question\'s call-site census (Langston Step-2 BLOCKER-1: SIX sites, plus one named non-size site)', () => {
  it('paper: X1 (resting entry), X2 (resting target) — both through the ONE gate; the trigger only LOGS + COUNTS', () => {
    expect(count(AEE, /this\._xsRestSizeGate\('x1',/g)).toBe(1);
    expect(count(AEE, /this\._xsRestSizeGate\('x2',/g)).toBe(1);
    expect(count(AEE, /xstockSideSize\(/g)).toBe(2); // the gate's own call and the trigger frame's size — nothing else
    expect(AEE).toMatch(/size: xsBid === null \? null : \(\(\) => \{/); // the trigger's verdict is a LOG field
  });
  it('VTS: the rest fill, the taker entry and the fired exit — through the ONE wrapper', () => {
    expect(count(VTS, /vtsXstockSideSize\('ask', _pxRow, _pFillPrice, trade\.dollarValue\)/g)).toBe(1); // rest fill
    expect(count(VTS, /vtsXstockSideSize\('bid', _xsExitRow, _vtsExitBid,/g)).toBe(1); // fired exit (count only)
    expect(count(XS, /vtsXstockSideSize\('ask', entryQuote, _xEntryAsk, VTS_XSTOCK_ENTRY_DOLLAR_VALUE\)/g)).toBe(1); // taker entry
    expect(count(VTS, /vtsXstockSideSize\(/g)).toBe(2);
    expect(count(XS, /vtsXstockSideSize\(/g)).toBe(1);
  });
  it('r2 condition 1: the SHADOW lane (a bid-deciding exit) is EXCLUDED on the record — no quantity column, no size call', () => {
    expect(VTS).toMatch(/bidQty: null, askQty: null \}/);
    expect(count(VTS, /bid_qty::text AS bid_qty/g)).toBe(1); // the real lane's query only
    expect(read('server/services/vts-runner.ts')).toMatch(/the shadow lane is EXCLUDED from the size test/);
    expect(VTS).not.toMatch(/vtsXstockSideSize\([^)]*_sExitBid/);
  });
  it('BLOCKER-2: the VTS entry notional is ONE constant shared with the booked dollar value — never a literal twice', () => {
    expect(read('server/asset_classes/xstock_spot/eval-cycle.ts')).toMatch(/const VTS_XSTOCK_ENTRY_DOLLAR_VALUE = 150;/);
    expect(XS).toMatch(/const dollarValue = VTS_XSTOCK_ENTRY_DOLLAR_VALUE;/);
    expect(XS).not.toMatch(/dollarValue = 150/);
  });
  it('the RTB retirement read is a DIFFERENT job (hollow-book presence, refuses on unknown) — named, not re-pointed', () => {
    expect(RTB).toMatch(/if \(!\(tick\.raw\.askQty !== null && tick\.raw\.askQty > 0\)\) return \{ ok: false, reason: 'xstock_ask_qty_absent' \};/);
    expect(RTB).toMatch(/THE `askQty` TEST BELOW IS NOT THE SIZE TEST/);
    expect(stripComments(RTB)).not.toMatch(/xstockSideSize/); // the header NAMES it; the code must not CALL it
  });
});

describe('P3 — what each site does with the verdict: exits never wait on size; fills and entries refuse', () => {
  it('a fired trigger on a short/unknown bid is COUNTED, never refused (the trigger slot never reads the size)', () => {
    expect(AEE).toMatch(/xsFrame\.size === 'size_short' \|\| xsFrame\.size === 'size_unknown'\)\) \{\s*this\._xsSizeCounts\[/);
    const evalInput = AEE.slice(AEE.indexOf('const decision = await evaluateTECExit({'));
    expect(evalInput.slice(0, evalInput.indexOf('});'))).not.toMatch(/size/);
  });
  it('a resting fill on a short/unknown side is refused (the gate returns null), and the refusal is counted only when touched', () => {
    expect(AEE).toMatch(/if \(verdict === 'ok'\) return price;\s*const touched = orderSide === 'buy' \? price <= limit : price >= limit;/);
    expect(AEE).toMatch(/return null;\s*\}\s*\n/);
  });
  it('the VTS taker entry refuses on short or unknown, under its own reasons', () => {
    expect(XS).toMatch(/if \(_xSize !== 'ok'\) \{\s*_xRefuseBooking\(_xSize === 'size_short' \? 'taker_entry_size_short' : 'taker_entry_size_unknown',/);
  });
});

describe('P5 — the CROSSED close arm (Langston Step-2 BLOCKER-3): the entry refuses; the close NEVER holds on it', () => {
  it('the entry depth gate refuses on crossed', () => {
    expect(AEE).toMatch(/snapshot\.verdict\.bid !== 'ok' \|\| snapshot\.verdict\.ask !== 'ok' \|\| snapshot\.verdict\.crossed\)/);
  });
  it('the normal close refusal reads the SIDE verdicts only — crossed is absent from it', () => {
    const m = AEE.match(/if \(!_isFlatten && _closeSnap\?\.verdict && \(([^)]*)\)\) \{/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("_closeSnap.verdict.bid !== 'ok' || _closeSnap.verdict.ask !== 'ok'");
  });
  it('r2 condition 2: a crossed newest row is walked as before — recorded and counted, never substituted or refused', () => {
    expect(AEE).toMatch(/if \(_closeSnap\?\.verdict\?\.crossed\) \{\s*this\._xsSizeCounts\.closeCrossedWalks\+\+;/);
    const DS = stripComments(read('server/services/execution/depth-source.ts'));
    expect(DS).toMatch(/if \(verdict\.bid === 'ok' && verdict\.ask === 'ok'\) \{/); // the newest row, crossed or not
    expect(DS).not.toMatch(/allowLastTwoSided \|\| verdict\.crossed/);
  });
  it('MUTATION — the close-blocking version would be caught by the same matcher', () => {
    const mutated = "if (!_isFlatten && _closeSnap?.verdict && (_closeSnap.verdict.bid !== 'ok' || _closeSnap.verdict.ask !== 'ok' || _closeSnap.verdict.crossed)) {";
    const m = mutated.match(/if \(!_isFlatten && _closeSnap\?\.verdict && \(([^)]*)\)\) \{/);
    expect(m![1]).not.toBe("_closeSnap.verdict.bid !== 'ok' || _closeSnap.verdict.ask !== 'ok'");
  });
});

describe('r2 condition 3 — the tripwire bar and the invalid quantity', () => {
  it('the bar is 10% over 200 looks an hour, and only size_unknown feeds its numerator', () => {
    expect(AEE).toMatch(/const XS_SIZE_TRIPWIRE_SHARE = 0\.10;/);
    expect(AEE).toMatch(/const XS_SIZE_TRIPWIRE_MIN_N = 200;/);
    expect(AEE).toMatch(/if \(xsFrame\.size === 'size_unknown'\) this\._xsSizeWindow\.unknown\+\+;/);
    // gate A condition 1: size_invalid is out of the DENOMINATOR too
    expect(AEE).toMatch(/if \(xsFrame !== null && xsFrame\.size != null && xsFrame\.size !== 'size_invalid'\) \{\s*this\._xsSizeWindow\.n\+\+;/);
    // gate A condition 3: once per position per cycle
    expect(AEE).toMatch(/if \(this\._xsInvalidQtySeenThisCycle\.has\(id\)\) return;/);
  });
  it('a non-positive quantity is its OWN verdict (size_invalid): counted, paged once per position, never pooled', () => {
    expect(count(AEE, /this\._noteInvalidQuantity\(position, /g)).toBe(2); // the rest gate and the trigger frame
    expect(AEE).toMatch(/return 'size_invalid' as const;/);
    expect(AEE).toMatch(/dedupe_key: `xstock-invalid-quantity-\$\{this\.mode\}-\$\{id\}`/);
    expect(AEE).toMatch(/if \(xsFrame !== null && decision\.shouldExit && \(xsFrame\.size === 'size_short' \|\| xsFrame\.size === 'size_unknown'\)\)/);
  });
  it('the size lines go to the surviving stream (error.log)', () => {
    expect(AEE).toMatch(/console\.warn\(`\[B-XSTOCK-BID-TRIGGER-RELAND\]\[XS_SIZE\] /);
    expect(AEE).toMatch(/console\.warn\(`\[B-XSTOCK-BID-TRIGGER-RELAND\]\[XS_SIZE_TRIPWIRE\] /);
  });
});

describe('P6 — the epoch migration moves ONLY paper xStock, by +1, and says the objective-6 boundary is not machine-visible', () => {
  const FWD = read('drizzle/migrations/2026-10-17-b-xstock-bid-trigger-reland-incb-epoch.sql');
  const RB = read('drizzle/migrations/2026-10-17-b-xstock-bid-trigger-reland-incb-epoch-rollback.sql');
  it('forward: one UPDATE scoped to xstock_spot/paper_sim, a delta post-condition over every epoch row, updated_at set', () => {
    expect(count(FWD, /^UPDATE module_constants/gm)).toBe(1);
    expect(FWD).toMatch(/AND asset_class = 'xstock_spot' AND constant_name = 'paper_sim';/);
    expect(FWD).toMatch(/updated_by = 'b-xstock-bid-trigger-reland-incb', updated_at = now\(\)/);
    expect(FWD).toMatch(/THE OBJECTIVE-6 BOUNDARY .* IS NOT MACHINE-VISIBLE/);
  });
  it('rollback: moves FORWARD again and removes the forward migration\'s ledger row', () => {
    expect(RB).toMatch(/value = to_jsonb\(\(value\)::text::numeric \+ 1\)/);
    expect(RB).toMatch(/DELETE FROM _migrations WHERE name = '2026-10-17-b-xstock-bid-trigger-reland-incb-epoch\.sql';/);
  });
  it('the forward file is registered; the rollback is not', () => {
    const M = read('drizzle/migrations/MANIFEST.txt');
    expect(M).toMatch(/^2026-10-17-b-xstock-bid-trigger-reland-incb-epoch\.sql$/m);
    expect(M).not.toMatch(/incb-epoch-rollback/);
  });
});
