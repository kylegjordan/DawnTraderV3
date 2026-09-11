// B-PRICE-SIDE-BY-JOB r5 — P-7j (decision D7; SIM S26; Coltrane PR-A6): the adaptive smoother advances once per NEW
// observation, not once per repeated read of the same cached price — and after a restart it RE-WARMS EXPLICITLY.
//
// `getSmoothedPrice` has one production caller (signal-orchestrator.ts, the crypto quant lane). It reads a cached
// price that is rewritten only when the cache refreshes, and it used to advance the smoothing state on every
// evaluation — treating each repeated read of one observation as new market information. And because the
// registry is in-memory and never persisted (SIM S26), every restart re-seeded each symbol from ONE raw
// observation, so the level basis was discontinuous at every deploy while presenting as warm.
//
// POSITIVE CONTROL: against the smoother before P-7j the fifth and sixth arguments do not exist, so test 1's second
// read advances the state, test 6's cold filter returns the raw observation, and the orchestrator fence (test 5)
// finds neither the observation key nor the history.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AdaptiveKalmanFilter,
  getSmoothedPrice,
  clearKalmanFilter,
  getAllKalmanDiagnostics,
} from '../../utils/adaptive-kalman.js';

const SYM = 'P7J-TEST/USD';
const ER = 0.5;
const VN = 1;
const smooth: (...a: any[]) => number = getSmoothedPrice as any;
const CLOSES = [100, 101, 102, 103, 104];

afterEach(() => {
  clearKalmanFilter(SYM);
  vi.restoreAllMocks();
});

describe('P-7j — the smoother advances only on a new observation', () => {
  it('1. a repeated read of the SAME observation returns the current estimate unchanged', () => {
    const seed = smooth(SYM, 100, ER, VN, 'obs-1');
    expect(seed).toBe(100);
    // same observation key, even with a different price argument: no new information, no movement
    expect(smooth(SYM, 120, ER, VN, 'obs-1')).toBe(100);
    expect(smooth(SYM, 120, ER, VN, 'obs-1')).toBe(100);
  });

  it('2. a NEW observation advances the state toward the new price', () => {
    smooth(SYM, 100, ER, VN, 'obs-1');
    const next = smooth(SYM, 120, ER, VN, 'obs-2');
    expect(next).toBeGreaterThan(100);
    expect(next).toBeLessThan(120);
  });

  it('3. with no key, the legacy behaviour holds: every call advances', () => {
    smooth(SYM, 100, ER, VN);
    const a = smooth(SYM, 120, ER, VN);
    const b = smooth(SYM, 120, ER, VN);
    expect(a).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(a);
  });

  it('4. clearing the filter forgets the last key, so the next observation re-seeds', () => {
    smooth(SYM, 100, ER, VN, 'obs-9');
    clearKalmanFilter(SYM);
    expect(smooth(SYM, 50, ER, VN, 'obs-9')).toBe(50);
  });
});

describe('P-7j — the single production caller passes an observation key and its history (source fence)', () => {
  it('5. signal-orchestrator keys getSmoothedPrice on the cache row write time and hands it the bar closes', () => {
    const src = readFileSync(resolve(__dirname, '../../services/signal-orchestrator.ts'), 'utf-8');
    const calls = src.match(/getSmoothedPrice\([^)]*\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('lastUpdatedAt');
    expect(calls[0]).toContain('closePrices');
  });
});

describe('P-7j — a cold filter re-warms EXPLICITLY (the restart fixture)', () => {
  it('6. after a restart the first estimate is the re-warmed value, not the raw observation', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const ref = new AdaptiveKalmanFilter('REF');
    for (const c of CLOSES) ref.update(c, ER, VN);
    const expected = ref.update(110, ER, VN);

    clearKalmanFilter(SYM); // a restart: the registry holds nothing for this symbol
    const got = smooth(SYM, 110, ER, VN, 'obs-1', CLOSES);
    expect(got).not.toBe(110); // the legacy cold start returned the raw observation here
    expect(got).toBeCloseTo(expected, 12);
  });

  it('7. the re-warm happens once: a warm filter ignores later history', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const first = smooth(SYM, 110, ER, VN, 'obs-1', CLOSES);
    expect(smooth(SYM, 110, ER, VN, 'obs-1', [1, 1, 1])).toBe(first); // same observation: unchanged
    const diag = getAllKalmanDiagnostics().find((d) => d.symbol === SYM);
    expect(diag?.warmedFromCloses).toBe(CLOSES.length);

    const ref = new AdaptiveKalmanFilter('REF');
    for (const c of CLOSES) ref.update(c, ER, VN);
    ref.update(110, ER, VN);
    const expectedNext = ref.update(111, ER, VN);
    expect(smooth(SYM, 111, ER, VN, 'obs-2', [5, 5, 5])).toBeCloseTo(expectedNext, 12);
  });

  it('8. the re-warm is VISIBLE: one REWARM line, and no per-step lines polluting the gain instrument', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    smooth(SYM, 110, ER, VN, 'obs-1', CLOSES);
    const lines = spy.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes('[9.3][REWARM]')).length).toBe(1);
    expect(lines.filter((l) => l.includes('[9.3][INIT]')).length).toBe(0);
    expect(lines.filter((l) => l.includes('[9.3][KALMAN]')).length).toBe(1); // the live observation only
  });

  it('9. unusable history falls back to the legacy raw seed, stated as zero closes', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(smooth(SYM, 110, ER, VN, 'obs-1', [Number.NaN, -1, 0])).toBe(110);
    const diag = getAllKalmanDiagnostics().find((d) => d.symbol === SYM);
    expect(diag?.warmedFromCloses).toBe(0);
  });

  it('10. without history the legacy cold start is unchanged (the raw first observation)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(smooth(SYM, 110, ER, VN, 'obs-1')).toBe(110);
  });
});
