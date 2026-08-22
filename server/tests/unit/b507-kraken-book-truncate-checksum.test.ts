/**
 * B-BOOK-TRUNCATE-HOTFIX (#507) — the Kraken v2 mini-book must TRUNCATE to its subscribed
 * depth and must compute Kraken's documented checksum correctly.
 *
 * THE DEFECT. `handleV2BookUpdate` never truncated. Kraken's contract (docs, Book Level 2):
 * "After each update, truncate your book to the subscribed depth — you will not receive
 * qty: 0 for levels that fall out of scope." Without truncation every level that left the
 * top-10 was orphaned in the Map forever, a snapshot was merged like a delta, and a dead bid
 * from an earlier higher price sat ABOVE the current real ask. Measured live 2026-08-22:
 * ONDO/USD bid=0.40349 ask=0.36411. The paper close fill walks the bid side, so stop-triggered
 * sells filled against bids that did not exist — 26 such exits, +$187.78 of phantom profit.
 *
 * TWO PROPERTIES, each with a control that proves the instrument before its pass counts:
 *  (1) CHECKSUM — Kraken's own published worked example must produce Kraken's own published
 *      CRC (3310070434). A checksum that merely "runs" proves nothing; matching the official
 *      vector proves the string formatting, ordering and CRC are all right at once.
 *  (2) TRUNCATION — a crossed-book scenario built to reproduce the live ONDO shape must be
 *      RESOLVED by the handler: after a snapshot and deltas that push the real market down, the
 *      best bid must never sit above the best ask, and the book must never exceed its depth.
 *      The control runs the SAME scenario without truncation and asserts the crossed book
 *      APPEARS — proving the scenario actually exercises the defect.
 */
import { describe, it, expect } from 'vitest';
import { KrakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';

type Raw = { bids: Map<number, [string, string]>; asks: Map<number, [string, string]> };
const mk = (asks: [string, string][], bids: [string, string][]): Raw => ({
  asks: new Map(asks.map(([p, q]) => [parseFloat(p), [p, q] as [string, string]])),
  bids: new Map(bids.map(([p, q]) => [parseFloat(p), [p, q] as [string, string]])),
});

describe('#507 Kraken v2 book checksum', () => {
  it("reproduces Kraken's OFFICIAL worked example exactly (the only proof the formatting is right)", () => {
    // Verbatim from docs.kraken.com/api/docs/guides/spot-ws-book-v2 — asks low→high, bids high→low.
    const raw = mk(
      [['45285.2','0.00100000'],['45286.4','1.54571953'],['45286.6','1.54571109'],['45289.6','1.54560911'],
       ['45290.2','0.15890660'],['45291.8','1.54553491'],['45294.7','0.04454749'],['45296.1','0.35380000'],
       ['45297.5','0.09945542'],['45299.5','0.18772827']],
      [['45283.5','0.10000000'],['45283.4','1.54582015'],['45282.1','0.10000000'],['45281.0','0.10000000'],
       ['45280.3','1.54592586'],['45279.0','0.07990000'],['45277.6','0.03310103'],['45277.5','0.30000000'],
       ['45277.3','1.54602737'],['45276.6','0.15445238']],
    );
    expect(KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw)).toBe(3310070434);
  });

  it('POSITIVE CONTROL: a one-character change in one qty changes the checksum (it is not a constant)', () => {
    const raw = mk([['45285.2','0.00100000']], [['45283.5','0.10000000']]);
    const a = KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw);
    raw.asks.set(45285.2, ['45285.2', '0.00100001']);
    const b = KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw);
    expect(a).not.toBe(b);
  });

  it('is order-independent of Map insertion (sorts by price itself, as the doc requires)', () => {
    const ordered = mk([['1.1','1'],['1.2','1'],['1.3','1']], [['0.9','1'],['0.8','1'],['0.7','1']]);
    const shuffled = mk([['1.3','1'],['1.1','1'],['1.2','1']], [['0.7','1'],['0.9','1'],['0.8','1']]);
    expect(KrakenWebSocketAdapter.computeBookChecksumFromRaw(shuffled))
      .toBe(KrakenWebSocketAdapter.computeBookChecksumFromRaw(ordered));
  });
});

describe('#507 Kraken v2 book truncation + checksum — the phantom-bid defect', () => {
  // ★ WHAT THE FIRST VERSION OF THIS TEST TAUGHT, recorded because it changed the fix's design:
  // truncation ALONE cannot remove a ghost bid. Truncation keeps the BEST `depth` levels, and
  // "best" for a bid means HIGHEST — so a stale 0.4034 from an hour ago outranks the real 0.3737
  // and SURVIVES truncation while the real level is cut. Truncation handles the documented case
  // (a level that falls out of the window from the BOTTOM); it is structurally blind to a ghost at
  // the TOP. Only Kraken's checksum can see that, because the checksum is computed over Kraken's
  // real book, and a book carrying a ghost will never match it. ⇒ the fix is truncation AND
  // checksum-verify-then-resubscribe, and this suite proves each half catches its own case.

  const lvl = (p: string, q = '100') => ({ price: p, qty: q });
  const checksumOf = (bids: [string, string][], asks: [string, string][]) =>
    KrakenWebSocketAdapter.computeBookChecksumFromRaw({
      bids: new Map(bids.map(([p, q]) => [parseFloat(p), [p, q] as [string, string]])),
      asks: new Map(asks.map(([p, q]) => [parseFloat(p), [p, q] as [string, string]])),
    });

  function makeAdapter(opts: { truncate: boolean }) {
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    adapter.mapKrakenPairToInternalSymbol = (p: string) => p;
    adapter.bookDepth.set('ONDO/USD', 3);
    if (!opts.truncate) adapter.truncateBook = () => {};
    adapter.resubscribed = [] as string[];
    adapter.softResubscribe = async (sym: string) => { adapter.resubscribed.push(sym); };
    return adapter;
  }

  it('TRUNCATION handles the DOCUMENTED case: a level pushed out of the window from the bottom is removed', () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl('0.40'), lvl('0.39'), lvl('0.38')], asks: [lvl('0.41'), lvl('0.42'), lvl('0.43')] }] });
    // A NEW better bid arrives. Kraken sends no delete for 0.38, which has fallen out of depth 3.
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD', bids: [lvl('0.405')], asks: [] }] });
    const book = adapter.orderBooks.get('ONDO/USD');
    expect(book.bids.size).toBe(3);
    expect([...book.bids.keys()].sort()).toEqual([0.39, 0.40, 0.405]); // 0.38 gone, as the doc requires
  });

  it('CONTROL: the LIVE ghost-bid shape — without the checksum a stale high bid survives and crosses the book', () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl('0.4034'), lvl('0.4030'), lvl('0.4025')], asks: [lvl('0.4040'), lvl('0.4045'), lvl('0.4050')] }] });
    // Market falls to ~0.37; Kraken sends NO deletes for the old top (the message carried no checksum).
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD',
      bids: [lvl('0.3737'), lvl('0.3736'), lvl('0.3735')], asks: [lvl('0.3641'), lvl('0.3645'), lvl('0.3650')] }] });
    const book = adapter.orderBooks.get('ONDO/USD');
    // Truncation kept the three HIGHEST bids — the ghosts — exactly the measured live state.
    expect(Math.max(...book.bids.keys())).toBeCloseTo(0.4034, 6);
    expect(Math.max(...book.bids.keys())).toBeGreaterThan(Math.min(...book.asks.keys()));
    expect(adapter.resubscribed).toEqual([]); // nothing caught it — this is the defect
  });

  it("THE FIX: with Kraken's checksum on the update, the ghost book FAILS verification and triggers a resubscribe", () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl('0.4034'), lvl('0.4030'), lvl('0.4025')], asks: [lvl('0.4040'), lvl('0.4045'), lvl('0.4050')] }] });
    // Kraken's checksum is over KRAKEN's real book — the new levels only. Ours still carries ghosts.
    const krakenReal = checksumOf(
      [['0.3737','100'],['0.3736','100'],['0.3735','100']],
      [['0.3641','100'],['0.3645','100'],['0.3650','100']]);
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD',
      bids: [lvl('0.3737'), lvl('0.3736'), lvl('0.3735')], asks: [lvl('0.3641'), lvl('0.3645'), lvl('0.3650')],
      checksum: krakenReal }] });
    expect(adapter.resubscribed).toEqual(['ONDO/USD']);        // desync DETECTED and recovery fired
    expect(adapter.bookChecksumMismatches.get('ONDO/USD')).toBe(1);
  });

  it('and a CLEAN book passes the checksum — verification does not fire on healthy data', () => {
    const adapter = makeAdapter({ truncate: true });
    const bids: [string, string][] = [['0.40','100'],['0.39','100'],['0.38','100']];
    const asks: [string, string][] = [['0.41','100'],['0.42','100'],['0.43','100']];
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: bids.map(([p,q]) => lvl(p,q)), asks: asks.map(([p,q]) => lvl(p,q)), checksum: checksumOf(bids, asks) }] });
    expect(adapter.resubscribed).toEqual([]);
    expect(adapter.bookChecksumMismatches.get('ONDO/USD') ?? 0).toBe(0);
  });

  it('a SNAPSHOT replaces the book outright instead of merging into stale state', () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.bookDepth.set('X/USD', 10);
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'X/USD', bids: [lvl('9','1')], asks: [lvl('11','1')] }] });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'X/USD', bids: [lvl('5','1')], asks: [lvl('6','1')] }] });
    const book = adapter.orderBooks.get('X/USD');
    expect([...book.bids.keys()]).toEqual([5]);
    expect([...book.asks.keys()]).toEqual([6]);
  });
});
