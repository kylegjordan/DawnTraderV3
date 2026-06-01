/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-XSTOCK-CALIB · F-NOW — calibration_state tag plumbing (VTS-only)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Locks the two risk-bearing pieces of F-NOW:
 *
 *  1. buildCalibrationClause(assetClass) — the pre-calibration exclusion only
 *     fires when scoped to xstock_spot. The /api/analytics view (assetClass=null)
 *     and the crypto path stay byte-identical (no calibration clause emitted).
 *
 *  2. resolveCalibrationState(vtsOpenTradeId) — the SSOT-from-parent resolver.
 *     Langston Q2 (2026-06-01): the whole batch hinges on the resolved VALUE
 *     landing on the row, not on a sub-select merely being emitted. These tests
 *     prove the parent value is returned for a real open id, and that every
 *     null path (undefined id / missing parent / lookup error) returns null
 *     WITHOUT throwing — null → untagged → INCLUDED (only pre-cal is excluded).
 *
 * Reference: Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_F_NOW_SCOPE.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

// Mock the db module so importing the replay-service + aggregator doesn't open a
// real Postgres connection, and so resolveCalibrationState's db.execute is a stub.
// vi.hoisted so the mock fn exists before the hoisted vi.mock factories run.
const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));
vi.mock('../../db.js', () => ({
  db: { execute: executeMock },
}));
vi.mock('../../db', () => ({
  db: { execute: executeMock },
}));

import { resolveCalibrationState } from '../../services/exit-strategy-replay-service';
import { buildCalibrationClause } from '../../services/exit-strategy-ablation-aggregator';

const dialect = new PgDialect();
/** Render a clause fragment to its SQL text (wrapped so an empty clause is legal). */
function render(frag: ReturnType<typeof buildCalibrationClause>): string {
  return dialect.sqlToQuery(sql`SELECT 1 FROM t WHERE 1=1 ${frag}`).sql;
}

describe('[F-NOW] buildCalibrationClause — pre-cal exclusion gated on xstock_spot', () => {
  it('emits the IS DISTINCT FROM exclusion when scoped to xstock_spot', () => {
    const out = render(buildCalibrationClause('xstock_spot'));
    expect(out).toContain("calibration_state IS DISTINCT FROM 'pre_calibration_xstock_2026_05'");
  });

  it('emits NO calibration clause when assetClass is null (analytics view)', () => {
    const out = render(buildCalibrationClause(null));
    expect(out).not.toContain('calibration_state');
  });

  it('emits NO calibration clause for crypto_spot (crypto byte-identical)', () => {
    const out = render(buildCalibrationClause('crypto_spot'));
    expect(out).not.toContain('calibration_state');
  });
});

describe('[F-NOW] resolveCalibrationState — SSOT-from-parent, null-safe', () => {
  beforeEach(() => executeMock.mockReset());

  it('returns the parent value for a real xStock open id (value lands, not NULL)', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ calibration_state: 'pre_calibration_xstock_2026_05' }] });
    const v = await resolveCalibrationState('vts_xstock_spot_1717000000000_ab12cd3');
    expect(v).toBe('pre_calibration_xstock_2026_05');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('returns a post-flip parent value verbatim (flip-proof — no hardcoded tag)', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ calibration_state: 'calibrated_xstock_2026_07' }] });
    const v = await resolveCalibrationState('vts_xstock_spot_postflip');
    expect(v).toBe('calibrated_xstock_2026_07');
  });

  it('returns null and does NOT hit the DB when vtsOpenTradeId is undefined (paper / VTS-only)', async () => {
    const v = await resolveCalibrationState(undefined);
    expect(v).toBeNull();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('returns null when the parent row is missing or GC\'d (empty result)', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const v = await resolveCalibrationState('vts_already_gc_swept');
    expect(v).toBeNull();
  });

  it('returns null and never throws when the lookup errors', async () => {
    executeMock.mockRejectedValueOnce(new Error('db unavailable'));
    const v = await resolveCalibrationState('vts_err');
    expect(v).toBeNull();
  });

  it('tolerates a bare-array drizzle result shape (rows ?? result)', async () => {
    executeMock.mockResolvedValueOnce([{ calibration_state: 'pre_calibration_xstock_2026_05' }]);
    const v = await resolveCalibrationState('vts_bare_array_shape');
    expect(v).toBe('pre_calibration_xstock_2026_05');
  });
});
