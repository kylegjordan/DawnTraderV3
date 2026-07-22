/**
 * P19-B8.5e — the σ cache's FAIL-CLOSED aging (`#548`).
 *
 * WHAT THIS PROTECTS. The cache is what makes the per-symbol ceiling affordable, and it is
 * also the component most likely to fail QUIETLY: if a database outage stops refreshes, a
 * naive cache keeps serving its last σ forever and the ceiling keeps widening off a
 * statistic nobody is checking any more. These tests pin the opposite behaviour — a σ that
 * is too old is DROPPED, the read returns `null`, and the documented caller contract turns
 * that into the FLOOR (tightest window).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSigma,
  __resetSigmaCacheForTests,
  __seedSigmaForTests,
  type SigmaCacheConfig,
} from '../../asset_classes/xstock_spot/sigma-rate-cache.js';

// Seeded values from 2026-07-21-p19-b8-5e-mark-staleness-knobs.sql
const CFG: SigmaCacheConfig = {
  windowMs: 1_800_000,
  refreshAfterMs: 300_000,
  maxAgeMs: 900_000,
  minObservations: 200,
  classwidePercentile: 0.9,
  queryTimeoutMs: 4_000,
};

const RESOLVED = { sigmaRatePerSec: 6.877e-5, source: 'self' as const, observations: 900 };
const T0 = 1_800_000_000_000;

describe('P19-B8.5e — σ cache: a stale statistic must FAIL CLOSED, not persist', () => {
  beforeEach(() => __resetSigmaCacheForTests());

  it('returns null for a symbol never computed — caller must floor, not run unconstrained', () => {
    expect(getCachedSigma('MUx', CFG, T0)).toBeNull();
  });

  it('serves a fresh entry', () => {
    __seedSigmaForTests('MUx', RESOLVED, T0);
    const got = getCachedSigma('MUx', CFG, T0 + 60_000);
    expect(got).not.toBeNull();
    expect(got!.sigmaRatePerSec).toBe(RESOLVED.sigmaRatePerSec);
  });

  it('still serves an entry PAST its refresh age but INSIDE maxAge — refresh is async, reads must not stall', () => {
    // This is the normal steady state: slightly-overdue entries keep working while the
    // background refresh runs. If this returned null we would floor on every ordinary tick.
    __seedSigmaForTests('MUx', RESOLVED, T0);
    expect(getCachedSigma('MUx', CFG, T0 + CFG.refreshAfterMs + 1_000)).not.toBeNull();
  });

  it('★ THE FAIL-CLOSED RULE: past maxAge the entry is DROPPED and null is returned', () => {
    __seedSigmaForTests('MUx', RESOLVED, T0);
    expect(getCachedSigma('MUx', CFG, T0 + CFG.maxAgeMs + 1)).toBeNull();
  });

  it('★ and the drop is REAL — a later in-window read does not resurrect it', () => {
    // Pins that the expired entry was evicted rather than merely hidden by the clock check.
    // A "hidden" entry would reappear if anything ever queried with an earlier timestamp,
    // silently reviving a σ we already judged untrustworthy.
    __seedSigmaForTests('MUx', RESOLVED, T0);
    expect(getCachedSigma('MUx', CFG, T0 + CFG.maxAgeMs + 1)).toBeNull();
    expect(getCachedSigma('MUx', CFG, T0 + 1_000)).toBeNull();
  });

  it('ages symbols independently — one dead symbol must not blind the others', () => {
    __seedSigmaForTests('MUx', RESOLVED, T0 - CFG.maxAgeMs - 1);
    __seedSigmaForTests('Cx', RESOLVED, T0);
    expect(getCachedSigma('MUx', CFG, T0)).toBeNull();
    expect(getCachedSigma('Cx', CFG, T0)).not.toBeNull();
  });

  it('carries the σ SOURCE through so a log reader can tell earned from inherited', () => {
    __seedSigmaForTests('NEWx', { sigmaRatePerSec: 9e-5, source: 'classwide', observations: 12 }, T0);
    expect(getCachedSigma('NEWx', CFG, T0)!.source).toBe('classwide');
  });
});
