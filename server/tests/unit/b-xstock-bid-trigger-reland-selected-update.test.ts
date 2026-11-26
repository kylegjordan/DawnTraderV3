import { describe, expect, it } from 'vitest';
import { XsVtsInstrument, type XsQuoteRow } from '../../asset_classes/xstock_spot/vts-xs-instrument.js';
import { guardXstockQuote } from '../../asset_classes/xstock_spot/vts-xs-guard.js';
import { linkSelectedXstockUpdate } from '../../asset_classes/xstock_spot/vts-xs-selected-update.js';

const current = { bootId: 'boot-1', generation: 2, acknowledgedAtMs: 100 };
const receipt = {
  bootId: current.bootId, generation: current.generation, role: 'update',
  frameOrdinal: 6, rowOrdinal: 0, receivedMonotonicMs: 110, verifiedUpdate: true,
};
const monotonicRead = 115;
const monotonicLook = 118;
const selected = (source: Record<string, unknown>) => ({
  rowId: '9007199254740993',
  selectedAtMs: monotonicRead,
  metadata: { equityTickerSource: source },
});

describe('#1191 VTS selected xStock update witness', () => {
  it('keeps the exact persisted row id and the three clocks of the accepted look', () => {
    expect(linkSelectedXstockUpdate(selected(receipt), current, monotonicLook)).toEqual({
      rowId: '9007199254740993', bootId: 'boot-1', generation: 2, frameOrdinal: 6, rowOrdinal: 0,
      receivedAtMs: 110, selectedAtMs: monotonicRead, acceptedAtMs: monotonicLook,
    });
  });

  it('cannot link replay, old-generation, pre-acknowledgement or legacy rows', () => {
    for (const source of [
      { ...receipt, role: 'snapshot' }, { ...receipt, bootId: 'old-boot' },
      { ...receipt, generation: 1 }, { ...receipt, receivedMonotonicMs: 99 },
      { ...receipt, receivedMonotonicMs: 116 }, { ...receipt, rowOrdinal: -1 },
      { ...receipt, frameOrdinal: Number.NaN }, { ...receipt, verifiedUpdate: false },
    ]) {
      expect(linkSelectedXstockUpdate(selected(source), current, monotonicLook)).toBeNull();
    }
    expect(linkSelectedXstockUpdate(selected(receipt), null, monotonicLook)).toBeNull();
    expect(linkSelectedXstockUpdate({ ...selected(receipt), metadata: {} }, current, monotonicLook)).toBeNull();
    expect(linkSelectedXstockUpdate(selected(receipt), current, monotonicRead - 1)).toBeNull();
  });

  it('records one exact accepted update sample per pass with distinct symbols, leaving the old quote totals intact', () => {
    const lines: string[] = [];
    const instrument = new XsVtsInstrument('vts', line => lines.push(line));
    const now = Date.parse('2026-11-27T14:50:00Z');
    const quote: XsQuoteRow = { last: 100, bid: 99.95, ask: 100.05, atMs: now, bidQty: 2, askQty: 3 };
    const symbol = 'ABC/USD';
    const guard = guardXstockQuote(quote, now, { maxAgeMs: 15_000, maxSpreadFraction: 0.0107 });
    expect(guard.sides?.bid).toBe(99.95);
    const live = { reason: guard.reason, ceilingMs: 15_000 };

    instrument.beginPass(now);
    instrument.recordLook(symbol, quote, now, 98, 102, live);
    instrument.recordLook(symbol, quote, now, 98, 102, live);
    expect(linkSelectedXstockUpdate(selected({ ...receipt, role: 'snapshot' }), current, monotonicLook)).toBeNull();
    instrument.endPass();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('looks=2');

    instrument.beginPass(now);
    const witness = linkSelectedXstockUpdate(selected(receipt), current, monotonicLook);
    if (!witness) throw new Error('positive current genuine update could not be linked');
    instrument.recordLook(symbol, quote, now, 98, 102, live, witness);
    instrument.recordLook(symbol, quote, now, 98, 102, live, witness);
    instrument.endPass();
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(lines[0]);
    expect(lines[2]).toContain('linkedSymbols=1');
    expect(lines[2]).toContain('"rowId":"9007199254740993"');
  });
});
