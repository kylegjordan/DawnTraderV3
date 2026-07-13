// P19-B8.5b (OBJ-1) — decision-time indicator scalars + settled-window hash tests.
import { describe, it, expect } from 'vitest';
import { buildBarProvenance } from '../../services/data-archive/signal-eval-archiver';

const bar = (ts: number, o: number) => ({ open: o, high: o + 1, low: o - 1, close: o + 0.5, volume: 100 + o, timestamp: ts });
const bars = [bar(1000, 10), bar(2000, 11), bar(3000, 12)]; // last = forming; first two = settled

describe('[P19-B8.5b] provenance scalars + settled-window hash', () => {
  it('passes the indicators through BY VALUE', () => {
    const p = buildBarProvenance(bars, 9, 15, { vwap: 10.5, atr: 0.8, sma: 10.2, high24h: 13, low24h: 9, currentVolume: 555 });
    expect(p?.indicators).toEqual({ vwap: 10.5, atr: 0.8, sma: 10.2, high24h: 13, low24h: 9, currentVolume: 555 });
  });

  it('omitted indicators stay absent (honest NULL downstream, never fabricated)', () => {
    const p = buildBarProvenance(bars);
    expect(p?.indicators).toBeUndefined();
  });

  it('settled-window hash is versioned, deterministic, and covers ONLY the settled bars (forming excluded)', () => {
    const a = buildBarProvenance(bars)!;
    const b = buildBarProvenance(bars.map((x) => ({ ...x })))!; // deep-equal copy → same hash
    expect(a.settledWindowHash).toMatch(/^swh1:[0-9a-f]{64}$/);
    expect(b.settledWindowHash).toBe(a.settledWindowHash);
    // Mutating the FORMING bar must NOT change the hash (it hashes the settled set only)…
    const formingMutated = [...bars.slice(0, 2), bar(3000, 99)];
    expect(buildBarProvenance(formingMutated)!.settledWindowHash).toBe(a.settledWindowHash);
    // …but mutating a SETTLED bar must change it (byte-parity oracle).
    const settledMutated = [bar(1000, 10.0001), bars[1], bars[2]];
    expect(buildBarProvenance(settledMutated)!.settledWindowHash).not.toBe(a.settledWindowHash);
  });

  it('single-bar input (no settled set) → no hash, still builds', () => {
    const p = buildBarProvenance([bar(1000, 10)]);
    expect(p).toBeDefined();
    expect(p?.settledWindowHash).toBeUndefined();
  });
});
