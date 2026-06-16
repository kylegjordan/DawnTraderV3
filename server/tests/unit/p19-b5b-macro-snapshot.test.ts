/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B5b — xStock decision-time macro snapshot (#94)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Tests the `buildMacroSnapshot()` shaping contract Langston gated on at Step-2:
 *  - captures all 8 fields (z-scores + RAW vix/dxy + freshness + partialFeed);
 *  - EXPLICIT NULL preserved (market-closed) and DISTINCT from a genuine 0 — the
 *    structural refinement that makes the capture honest;
 *  - `Infinity` ageSeconds (never-polled) becomes an explicit null, not a silent
 *    JSON coercion;
 *  - `partialFeed` carried (degraded-feed signal, not derivable from value-nulls).
 *
 * The helper lives in its own module (extracted from eval-cycle.ts) so it tests
 * in isolation — the only dependency, `getLatestEquitySnapshot`, is mocked.
 * (Crypto-no-macro / all-4-sites-threaded are verified by construction in the
 * eval-cycle diff at Step-4, not unit-testable here.)
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSnap = vi.fn();
vi.mock('../../services/amr-equity-feed.js', () => ({
  getLatestEquitySnapshot: () => mockSnap(),
}));

import { buildMacroSnapshot } from '../../asset_classes/xstock_spot/macro-snapshot';

function fullSnap(overrides: Record<string, unknown> = {}) {
  return {
    vix: 18.5, vixZ: 1.2, vixObservedAt: '2026-06-16T15:00:00Z', vixObservationCount: 50,
    dxy: 104.3, dxyZ: -0.4, dxyEcbDate: '2026-06-16', dxyObservationCount: 40,
    ageSeconds: 42, partialFeed: false, fredCrossCheck: 'ok' as const, fredDivergencePoints: null,
    schemaGuardTripped: false, ...overrides,
  };
}

describe('P19-B5b — buildMacroSnapshot', () => {
  beforeEach(() => mockSnap.mockReset());

  it('captures all 8 fields incl. RAW vix/dxy (baseline-independent ground truth) + z + freshness', () => {
    mockSnap.mockReturnValue(fullSnap());
    expect(buildMacroSnapshot()).toEqual({
      vixZ: 1.2, dxyZ: -0.4, vix: 18.5, dxy: 104.3,
      ageSeconds: 42, partialFeed: false,
      vixObservedAt: '2026-06-16T15:00:00Z', dxyEcbDate: '2026-06-16',
    });
  });

  it('preserves explicit null (market-closed) — key NOT dropped, survives serialization', () => {
    mockSnap.mockReturnValue(fullSnap({ vixZ: null, vix: null, vixObservedAt: null }));
    const m = buildMacroSnapshot();
    expect('vixZ' in m).toBe(true);
    expect(m.vixZ).toBeNull();
    expect(JSON.stringify(m)).toContain('"vixZ":null'); // not omitted
  });

  it('a genuine z=0 stays 0 — never coerced to null (the distinct-from-null guarantee)', () => {
    mockSnap.mockReturnValue(fullSnap({ vixZ: 0, dxyZ: 0 }));
    const m = buildMacroSnapshot();
    expect(m.vixZ).toBe(0);
    expect(m.dxyZ).toBe(0);
    expect(JSON.stringify(m)).toContain('"vixZ":0');
  });

  it('Infinity ageSeconds (never-polled) becomes explicit null, not a silent JSON coercion', () => {
    mockSnap.mockReturnValue(fullSnap({ ageSeconds: Infinity }));
    const m = buildMacroSnapshot();
    expect(m.ageSeconds).toBeNull();
    expect(JSON.stringify(m)).toContain('"ageSeconds":null');
  });

  it('partialFeed carries through — degraded-feed signal not derivable from the value-nulls', () => {
    mockSnap.mockReturnValue(fullSnap({ partialFeed: true, dxyZ: null, dxy: null }));
    const m = buildMacroSnapshot();
    expect(m.partialFeed).toBe(true);
    expect(m.dxyZ).toBeNull();
    expect(m.vixZ).toBe(1.2); // the flowing source still present
  });
});
