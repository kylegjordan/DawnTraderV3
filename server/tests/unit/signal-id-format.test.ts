// P19-B8.10 (OBJ-2): pins the signal-ID format across the SLAL-purge relocation.
// The mint moved VERBATIM from signal_lifecycle_audit.ts:107 to utils/signal-id.ts;
// the format is a stored-data contract (rtb_signals.signal_id, position metadata
// originalSignalId, closed_trades joins) and must never change shape.
import { describe, it, expect } from 'vitest';
import { generateSignalId } from '../../utils/signal-id';

describe('[P19-B8.10] generateSignalId format pin', () => {
  it('produces <symbol>-<strategy>-<epochMs>-<6 base36 chars>', () => {
    const id = generateSignalId('ETH/EUR', 'pivot_shift');
    const m = id.match(/^ETH\/EUR-pivot_shift-(\d{13})-([a-z0-9]{1,6})$/);
    expect(m).not.toBeNull();
    const ts = Number(m![1]);
    expect(Math.abs(Date.now() - ts)).toBeLessThan(5_000);
  });

  it('is unique across rapid successive mints', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSignalId('BTC/USD', 'breakout')));
    expect(ids.size).toBe(50);
  });
});
