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
// STEP 4 r2 (Langston chunk-2 BLOCKER-1): tests 11-13 fail against r1 (`f61dcbae2`), where the warm left P at the per-step
// model's steady state, so the first live read moved the estimate only ~13% of the way and the REWARM line carried no
// live price. Tests 6 and 7 now build their reference with the same P inflation.
// STEP 4 r3 (Langston chunk-2 r2 conditions 2-3): test 12 pins the DECAY LENGTH (the 12th live observation is the first
// within 10% of the steady-state gain) and test 14 pins the LAZY inflation; test 14 fails against r2 (`ba36cc5ad`).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AdaptiveKalmanFilter,
  REWARM_FIRST_LIVE_GAIN,
  measurementNoise,
  processNoise,
  getSmoothedPrice,
  clearKalmanFilter,
  getAllKalmanDiagnostics,
} from '../../utils/adaptive-kalman.js';

const SYM = 'P7J-TEST/USD';
const ER = 0.5;
const VN = 1;
const smooth: (...a: any[]) => number = getSmoothedPrice as any;
const CLOSES = [100, 101, 102, 103, 104];

// The r2 reference, written out independently of the module: absorb the closes, inflate P exactly as the re-warm states
// it (R from ER; never lowering P), then absorb the live reads. Returns the warmed estimate and each live estimate.
function reference(closes: readonly number[], ...live: number[]): { warmed: number; out: number[] } {
  const ref = new AdaptiveKalmanFilter('REF');
  for (const c of closes) ref.update(c, ER, VN);
  const R = Math.max(1, Math.min(50, 1 + (1 - ER) * 50));
  const st = ref.getInternalState();
  ref.restoreState({ ...st, P: Math.max(st.P, (R * REWARM_FIRST_LIVE_GAIN) / (1 - REWARM_FIRST_LIVE_GAIN)) });
  return { warmed: st.x as number, out: live.map((p) => ref.update(p, ER, VN)) };
}

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
    const [expected] = reference(CLOSES, 110).out;

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

    const [, expectedNext] = reference(CLOSES, 110, 111).out;
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
    expect(diag?.P).toBe(1); // no closes absorbed, so no inflation: the legacy seed's covariance is untouched
  });

  it('10. without history the legacy cold start is unchanged (the raw first observation)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(smooth(SYM, 110, ER, VN, 'obs-1')).toBe(110);
  });
});

describe('P-7j r2 — Langston chunk-2 BLOCKER-1: the re-warm is continuous AND current', () => {
  const diagOf = () => getAllKalmanDiagnostics().find((d) => d.symbol === SYM);

  it('11. ★ the first live observation after a re-warm receives REWARM_FIRST_LIVE_GAIN', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { warmed } = reference(CLOSES);
    const got = smooth(SYM, 110, ER, VN, 'obs-1', CLOSES);
    expect(diagOf()?.lastK).toBeCloseTo(REWARM_FIRST_LIVE_GAIN, 9);
    expect(Math.abs(got - 110)).toBeLessThanOrEqual((1 - REWARM_FIRST_LIVE_GAIN) * Math.abs(110 - warmed) + 1e-9);
  });

  it('12. ★ STIFFNESS FIXTURE: 720 hourly closes at 100, then a live 105 — the estimate moves at least 90% of the way', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const hourly = Array.from({ length: 720 }, () => 100);
    const got = smooth(SYM, 105, ER, VN, 'obs-1', hourly);
    // r1 left P at the steady state of P^2 = Q(P + R) (R 26, Q 0.5: P about 3.86, K about 0.13), so this read was ~100.65.
    expect(got).toBeGreaterThanOrEqual(100 + REWARM_FIRST_LIVE_GAIN * 5 - 1e-9);
    // r3 (Langston condition 2): pin the DECAY LENGTH, not just "less than the first". The steady state comes from the
    // model's own noise functions (r3 FINDING-2), so it cannot go stale if R or Q changes: P solves P^2 = Q(P + R), and
    // the gain is P / (P + R). At ER 0.5 and VolNoise 1 that is R 26, Q 0.5.
    const R = measurementNoise(ER);
    const Q = processNoise(VN);
    const pSteady = (Q + Math.sqrt(Q * Q + 4 * Q * R)) / 2;
    const kSteady = pSteady / (pSteady + R);
    const gains = [diagOf()?.lastK as number];
    for (let i = 2; i <= 14; i++) {
      smooth(SYM, 105, ER, VN, `obs-${i}`);
      gains.push(diagOf()?.lastK as number);
    }
    const firstWithin10Pct = gains.findIndex((k) => k <= kSteady * 1.1) + 1; // the 1-based live observation number
    expect(gains[0]).toBeCloseTo(REWARM_FIRST_LIVE_GAIN, 9);
    expect(gains[1]).toBeCloseTo(0.479, 3);
    // ⚠️ A KNIFE-EDGE PIN, deliberately: observation 11 sits at 0.142795 against a threshold of 0.142332 (0.33% margin).
    // A flip to 11 or 13 is the pin doing its job on a model change, not a flaky test.
    expect(firstWithin10Pct).toBe(12);
  });

  it('13. ★ the REWARM line names the live price and |x - raw| / raw, so a deploy is a measurement', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { warmed } = reference(CLOSES);
    smooth(SYM, 110, ER, VN, 'obs-1', CLOSES);
    const line = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[9.3][REWARM]'));
    expect(line).toBeDefined();
    expect(line).toContain('rawPrice=110.0000');
    expect(line).toContain(`gapFrac=${(Math.abs(warmed - 110) / 110).toFixed(6)}`);
  });

  it('14. ★ r3 LAZY: the first live gain is REWARM_FIRST_LIVE_GAIN even when the live read carries a different ER', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const filter = new AdaptiveKalmanFilter('P7J-LAZY');
    filter.warmFromHistory(CLOSES, 0.95, VN, 110); // R 3.5 at the warm
    filter.update(110, 0.05, VN); // R 48.5 at the live read
    // r2 inflated against the warm's R: P 31.5, so K was about 0.39 here.
    expect(filter.getDiagnostics().lastK).toBeCloseTo(REWARM_FIRST_LIVE_GAIN, 9);
  });

  it('15. r3: a reset clears a pending inflation, so a re-seeded filter starts from the legacy covariance', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const filter = new AdaptiveKalmanFilter('P7J-RESET');
    filter.warmFromHistory(CLOSES, ER, VN, 110);
    filter.reset();
    filter.update(110, ER, VN); // seeds
    filter.update(111, ER, VN); // first update after the seed: K = 1 / (1 + 26)
    expect(filter.getDiagnostics().lastK).toBeCloseTo(1 / 27, 9);
  });

  it('16. r3 residual (Langston FINDING-3): a restore is not a warm, so it clears a pending inflation, the key and the warm count', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const donor = new AdaptiveKalmanFilter('P7J-DONOR');
    for (const c of CLOSES) donor.update(c, ER, VN);
    const saved = donor.getInternalState();

    const filter = new AdaptiveKalmanFilter('P7J-RESTORE');
    filter.warmFromHistory([1, 2, 3], ER, VN, 3); // leaves an inflation pending
    filter.restoreState(saved);
    filter.update(110, ER, VN);
    // the restored covariance governs the first read, not the pending 0.9
    expect(filter.getDiagnostics().lastK).toBeCloseTo(saved.P / (saved.P + measurementNoise(ER)), 12);
    expect(filter.getDiagnostics().warmedFromCloses).toBe(0);

    const keyed = new AdaptiveKalmanFilter('P7J-RESTORE-KEY');
    keyed.updateIfNew('k1', 100, ER, VN);
    keyed.restoreState(saved);
    const before = keyed.getState();
    keyed.updateIfNew('k1', 200, ER, VN); // a key seen before the restore is still a new observation after it
    expect(keyed.getState()).not.toBe(before);
  });
});
