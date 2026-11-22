/**
 * B-DB-REGIME-ENUM-ALIGN (#1263) P3/P4 — the telemetry writer hands the repository a canonical regime only.
 *
 * recordPairTelemetry's pairRegime is typed CanonicalRegimeType, so a ghost label no longer compiles at a
 * call site. A value that reaches it untyped at runtime (a cast, a JSON payload) is normalized and warned —
 * never written raw (a raw label outside the stored enum is what failed every insert before this batch) and
 * never refused (Langston Step-2 condition (a)). With no pairRegime the writer uses the service's current
 * regime, which is canonical by type.
 * The repository is mocked: shouldPersist() → true, saveTelemetryRecord captured. No database.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const saved: Array<{ regime: string; symbol: string; mode: string }> = [];
vi.mock('../../services/telemetry-repository.js', async (orig) => {
  const actual = await orig<typeof import('../../services/telemetry-repository.js')>();
  return {
    ...actual,
    shouldPersist: () => true,
    saveTelemetryRecord: vi.fn(async (e: { regime: string; symbol: string; mode: string }) => {
      saved.push(e);
    }),
    loadRecentTelemetry: vi.fn(async () => []),
  };
});

import { TelemetryAggregatorService } from '../../services/telemetry-aggregator';
import { CANONICAL_REGIMES } from '../../config/canonical-regime-strategy-map';

const base = { assetClass: 'crypto_spot' as const, finalScore: 0.8, caller: 'vts' };

describe('B-DB-REGIME-ENUM-ALIGN — the telemetry writer persists canonical regimes only', () => {
  let svc: TelemetryAggregatorService;
  beforeEach(() => {
    saved.length = 0;
    svc = new TelemetryAggregatorService();
  });

  it('a canonical pairRegime is persisted unchanged, with no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.recordPairTelemetry('BTCUSD', { ...base, pairRegime: 'IMPULSE_EXPANSION' });
    await Promise.resolve();
    expect(saved.map((e) => e.regime)).toEqual(['IMPULSE_EXPANSION']);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[B-DB-REGIME-ENUM-ALIGN]'))).toBe(false);
    warn.mockRestore();
  });

  it('no pairRegime falls back to the service current regime (canonical)', async () => {
    svc.recordPairTelemetry('ETHUSD', { ...base });
    await Promise.resolve();
    expect(saved).toHaveLength(1);
    expect(CANONICAL_REGIMES).toContain(saved[0].regime);
    expect(saved[0].regime).toBe(svc.getCurrentMarketRegime());
  });

  it.each([
    ['HIGH_VOL_IMPULSE', 'IMPULSE_EXPANSION'],
    ['TRANSITION', 'STRUCTURAL_TRANSITION'],
  ])('a runtime ghost %s is normalized to %s and warned, never written raw', async (raw, expected) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Deliberate cast: this is the untyped-at-runtime path the type no longer admits at a call site.
    svc.recordPairTelemetry('SOLUSD', { ...base, pairRegime: raw as never });
    await Promise.resolve();
    expect(saved.map((e) => e.regime)).toEqual([expected]);
    const line = warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('[B-DB-REGIME-ENUM-ALIGN]'));
    expect(line).toContain('symbol=SOLUSD');
    expect(line).toContain(`raw=${raw}`);
    expect(line).toContain(`persisted=${expected}`);
    warn.mockRestore();
  });
});
