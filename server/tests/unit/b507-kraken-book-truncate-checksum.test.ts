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
 * sells filled against bids that did not exist.
 * ⛔ The "+$187.78 of phantom profit" that used to close this line is WITHDRAWN and deliberately
 * not replaced with a newer figure — see `1-system-manual/CHANGES_AND_FIXES.md` for the current
 * estimate and its bounds. Three successive figures were withdrawn as unreproducible; restating
 * any of them here would rebuild the same wrong record one file over.
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

describe('#507 Kraken v2 book truncation — the phantom-bid defect', () => {
  // ★ WHAT LANGSTON'S GATE CORRECTED, and it changed both the fix and this suite.
  //
  // (1) MY INTERDEPENDENCE CLAIM WAS WRONG. I argued truncation could not prevent a top-of-book
  //     ghost and that only the checksum could catch it. He showed the ghost is MINTED at the
  //     moment a level exits the window from the BOTTOM (market rises, the old top-10 level drops
  //     out, Kraken sends no delete; the market later falls and that orphan is now the highest
  //     bid). Truncating AT THAT MOMENT prevents the mint. My control only showed truncation
  //     cannot EVICT a ghost that already exists — true, and not the same claim. With truncation
  //     running from process start, one cannot form. The tests below now model the mint, which is
  //     the actual mechanism, instead of a pre-existing ghost the real system would never have.
  //
  // (2) THE CHECKSUM COULD NEVER HAVE MATCHED, and this suite could not see it. Kraken sends
  //     price/qty as JSON NUMBERS; JSON.parse drops trailing zeros, so String(qty) yields "2993"
  //     where Kraken's CRC input is "299300000". He measured 0/40 matches on the live venue with
  //     my algorithm, 40/40 once formatted at instrument precision. My tests fed hand-written
  //     STRINGS with the exact formatting the wire does not send — a positive control on the
  //     adjacent object. Verification is now OBSERVE-ONLY (count, never resubscribe) until the
  //     precision feed lands, and the tests below feed NUMBERS, as the wire does.

  const lvl = (p: number, q = 100) => ({ price: p, qty: q }); // NUMBERS — what Kraken actually sends
  function makeAdapter(opts: { truncate: boolean; depth?: number }) {
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    adapter.mapKrakenPairToInternalSymbol = (p: string) => p;
    adapter.bookDepth.set('ONDO/USD', opts.depth ?? 3);
    if (!opts.truncate) adapter.truncateBook = () => {};
    adapter.resubscribed = [] as string[];
    adapter.softResubscribe = async (sym: string) => { adapter.resubscribed.push(sym); };
    return adapter;
  }

  // ★ THE REAL MECHANISM — and my FIRST version of this scenario was wrong in a way that
  // matters, so the correction is recorded here rather than quietly fixed.
  //
  // I modelled the crash by sending only the NEW low bids and no deletes, which left the old
  // HIGH bids alive and made truncation look powerless (it keeps the highest bids, which were
  // the stale ones). That is not what the venue does. A level INSIDE the window that gets
  // consumed IS deleted — Kraken sends qty:0 for it. The levels that vanish SILENTLY are the
  // ones pushed out of the BOTTOM of the window when the market RISES and better bids arrive.
  //
  // So the ghost is minted in three beats:
  //   1. book at 0.40 / 0.39 / 0.38 (depth 3)
  //   2. market RISES: 0.42 and 0.41 arrive. 0.39 and 0.38 fall out of the bottom of the
  //      window. NO delete is sent for them — this is the moment the orphan is created.
  //   3. market CRASHES: 0.42 / 0.41 / 0.40 are consumed, so Kraken DOES delete them, and the
  //      new real bids arrive at ~0.37.
  // Without truncation the orphaned 0.39 survives beat 2 and is the highest bid after beat 3 —
  // above the real ask. With truncation it is cut at beat 2 and can never form.
  // ⇒ Langston's reading is correct and mine was not: (a)+(b) prevent the mint on their own.
  // ⚠️ THIRD CORRECTION TO THIS SCENARIO, recorded because the pattern is the point: each time,
  // I modelled the venue doing something it does not do, and each time a failing test caught it.
  //   1st: crash with no deletes at all -> stale HIGH bids survived and truncation looked useless.
  //   2nd: fixed the crash, but the RISE still left the consumed asks alive -> the fix's own
  //        crossed-detector fired, because bids climbed past asks that should have been taken out.
  //   3rd (this): when the market moves, the levels it EATS are inside the window and Kraken
  //        DELETES them. Only the levels pushed out of the far END of the window vanish silently.
  // That silent drop-out is the whole defect, and it is the only thing this scenario should model
  // as silent. Everything else gets an explicit qty:0, exactly as the venue sends it.
  function mintGhost(adapter: any) {
    // beat 1 — snapshot at ~0.40, depth 3, uncrossed
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.40), lvl(0.39), lvl(0.38)], asks: [lvl(0.41), lvl(0.42), lvl(0.43)] }] });
    // beat 2 — market RISES to ~0.425. The asks it eats (0.41, 0.42) are deleted explicitly.
    // New bids arrive above the old ones. 0.39 and 0.38 are pushed out of the bottom of the
    // window and get NO delete — this is the moment the orphan is minted.
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.425), lvl(0.42)],
      asks: [lvl(0.41, 0), lvl(0.42, 0), lvl(0.44), lvl(0.45)] }] });
    // beat 3 — market CRASHES to ~0.37. Everything it eats is in-window and deleted explicitly.
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.425, 0), lvl(0.42, 0), lvl(0.40, 0), lvl(0.37), lvl(0.369), lvl(0.368)],
      asks: [lvl(0.43, 0), lvl(0.44, 0), lvl(0.45, 0), lvl(0.371), lvl(0.372), lvl(0.373)] }] });
    const book = adapter.orderBooks.get('ONDO/USD');
    return { bestBid: Math.max(...book.bids.keys()), bestAsk: Math.min(...book.asks.keys()),
             bidDepth: book.bids.size, askDepth: book.asks.size };
  }

  it('CONTROL: WITHOUT truncation the ghost is MINTED and the book crosses — the live ONDO shape', () => {
    const adapter = makeAdapter({ truncate: false });
    const r = mintGhost(adapter);
    expect(r.bestBid).toBeGreaterThan(r.bestAsk);  // a dead bid above the real ask
    expect(r.bidDepth).toBeGreaterThan(3);         // and the book has grown past its depth
    // ★ THE POSITIVE CONTROL FOR THE POST-DEPLOY INTEGRITY SIGNAL (Langston, hotfix gate).
    // `crossedDetections` is the ONLY thing that proves the fix works in production, and my
    // 0-of-31,059 was measured on a REPLICA of the fix's logic, not on this handler -- that zero
    // does not transfer to shipped code. Asserting the counter HERE, on the real handler, with
    // the paired 0 below, is what makes a post-deploy zero readable instead of vacuous.
    expect(adapter.bookCrossedDetections.get('ONDO/USD') ?? 0).toBeGreaterThan(0);
  });

  it('WITH truncation the ghost never forms: book stays at depth, never crosses, best bid is REAL', () => {
    const adapter = makeAdapter({ truncate: true });
    const r = mintGhost(adapter);
    expect(adapter.bookCrossedDetections.get('ONDO/USD') ?? 0).toBe(0); // the paired zero
    expect(r.bidDepth).toBeLessThanOrEqual(3);
    expect(r.askDepth).toBeLessThanOrEqual(3);
    expect(r.bestBid).toBeLessThan(r.bestAsk);
    expect(r.bestBid).toBeCloseTo(0.37, 6);        // the real best bid, not an orphan
  });

  it('a SNAPSHOT replaces the book outright instead of merging into stale state', () => {
    const adapter = makeAdapter({ truncate: true, depth: 10 });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD', bids: [lvl(9, 1)], asks: [lvl(11, 1)] }] });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD', bids: [lvl(5, 1)], asks: [lvl(6, 1)] }] });
    const book = adapter.orderBooks.get('ONDO/USD');
    expect([...book.bids.keys()]).toEqual([5]);
    expect([...book.asks.keys()]).toEqual([6]);
  });

  it('qty 0 deletes a level (the one delete Kraken DOES send)', () => {
    const adapter = makeAdapter({ truncate: true, depth: 10 });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.40), lvl(0.39)], asks: [lvl(0.41)] }] });
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: 'ONDO/USD', bids: [lvl(0.40, 0)], asks: [] }] });
    const book = adapter.orderBooks.get('ONDO/USD');
    expect([...book.bids.keys()]).toEqual([0.39]);
  });

  it('FAILS OPEN: with precision UNKNOWN the checksum is SKIPPED, never resubscribed', () => {
    // Langston's condition, and it is the difference between a fix and an outage: an unmapped
    // symbol must skip verification. Before the precision feed, EVERY symbol was unmapped and
    // EVERY message mismatched -- arming this without the fail-open would have resubscribed on
    // every update for every pair, replacing phantom fills with a book outage and a subscribe storm.
    const adapter = makeAdapter({ truncate: true });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.40), lvl(0.39), lvl(0.38)], asks: [lvl(0.41), lvl(0.42), lvl(0.43)],
      checksum: 1 }] });                                   // a checksum that cannot match
    expect(adapter.resubscribed).toEqual([]);              // no storm
    expect(adapter.bookChecksumSkippedNoPrecision.get('ONDO/USD')).toBe(1); // counted, not silent
    expect(adapter.bookChecksumAttempts.get('ONDO/USD') ?? 0).toBe(0);      // not even attempted
  });

  it('ARMED: with precision KNOWN, a desynced book fails verification and triggers a resubscribe', () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.handleInstrumentMessage({ type: 'snapshot', data: { pairs: [
      { symbol: 'ONDO/USD', price_precision: 5, qty_precision: 5 } ] } });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.40), lvl(0.39), lvl(0.38)], asks: [lvl(0.41), lvl(0.42), lvl(0.43)],
      checksum: 1 }] });                                   // wrong on purpose
    expect(adapter.resubscribed).toEqual(['ONDO/USD']);    // desync DETECTED, recovery fired
    expect(adapter.bookChecksumMismatches.get('ONDO/USD')).toBe(1);
  });

  it('the instrument channel supplies precision, and a CLEAN book then passes', () => {
    const adapter = makeAdapter({ truncate: true });
    adapter.handleInstrumentMessage({ type: 'snapshot', data: { pairs: [
      { symbol: 'ONDO/USD', price_precision: 5, qty_precision: 5 } ] } });
    expect(adapter.symbolPrecision.get('ONDO/USD')).toEqual({ price: 5, qty: 5 });
    // Compute the checksum the way the venue would, at that precision, and feed it back.
    const raw = { bids: new Map<number,[string,string]>(), asks: new Map<number,[string,string]>() };
    raw.bids.set(0.40, ['0.40','100']); raw.asks.set(0.41, ['0.41','100']);
    const theirs = KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw, { price: 5, qty: 5 });
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: 'ONDO/USD',
      bids: [lvl(0.40)], asks: [lvl(0.41)], checksum: theirs }] });
    expect(adapter.resubscribed).toEqual([]);              // healthy book, no action
    expect(adapter.bookChecksumMatches.get('ONDO/USD')).toBe(1);
  });

  it('PRECISION FORMATTING is what the venue actually needs: JSON numbers lose their trailing zeros', () => {
    // The whole reason verification was inert. Kraken's CRC input for qty 2993.00000 is
    // '299300000'; JSON.parse gives the number 2993, whose String() is '2993'. Only formatting
    // at the instrument's qty precision reconstructs it.
    const raw = { bids: new Map<number,[string,string]>(), asks: new Map<number,[string,string]>() };
    raw.asks.set(1, ['1', '2993']);   // as it arrives off the wire, zeros already gone
    raw.bids.set(0.5, ['0.5', '1']);
    const withPrec = KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw, { price: 5, qty: 5 });
    const without  = KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw);
    expect(withPrec).not.toBe(without);  // they are different inputs -- this is the entire defect
  });

  it('depth is taken from the subscribe ACK, never the request (a rejected depth:1 must not shrink the book)', () => {
    const adapter = makeAdapter({ truncate: true, depth: 10 });
    adapter.handleV2SystemMessage({ method: 'subscribe', success: true,
      result: { channel: 'book', symbol: 'ONDO/USD', depth: 10 } });
    expect(adapter.bookDepth.get('ONDO/USD')).toBe(10);
    // A REJECTED subscribe never reaches the ack path, so the granted depth stands.
    adapter.handleV2SystemMessage({ method: 'subscribe', success: false, error: 'Subscription depth not supported' });
    expect(adapter.bookDepth.get('ONDO/USD')).toBe(10);
  });
});
