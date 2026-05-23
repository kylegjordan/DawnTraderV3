/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-42b — Price-Discontinuity Detector unit tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Coverage:
 *   1. Cold-start fail-safe-skip (Langston pre-audit rev1 #1 NON-NEGOTIABLE)
 *   2. Crypto-symbol no-op (detector inactive for non-xStock symbols)
 *   3. Halt-resume-gap state machine: IDLE → ACTIVE → CLEARING → IDLE
 *   4. Halt-resume-gap hard-ceiling auto-clear (5min stateless timestamp check)
 *   5. Halt-resume-gap stays active across multiple gap-magnitude ticks
 *   6. Corp-action discontinuity (≥40% single-bar) + 24h TTL clear
 *   7. Ex-dividend curated calendar lookup (within block window, outside, unknown symbol)
 *   8. Lazy eviction at 24h staleness → next call is cold-start
 *
 * Production code path: `server/services/price-discontinuity-detector.ts`.
 * Test isolation: `_testClearAllState()` between tests; injected dividend
 * calendar via `_testInjectDividendCalendar()` for ex-div coverage.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isDiscontinuityActive,
  clearSymbolState,
  _testClearAllState,
  _testGetSymbolEntry,
  _testInjectDividendCalendar,
} from '../../services/price-discontinuity-detector.js';
import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';

// Test symbol guaranteed to be in XSTOCK_SPOT_SYMBOLS (per shared/asset-classes.ts).
// AAPL/USD is canonical xStock storage form.
const XSTOCK_SYMBOL = 'AAPL/USD';
// Crypto reference for the no-op test. BTC/USD is in crypto_spot universe.
const CRYPTO_SYMBOL = 'BTC/USD';

// Suppress console logs from the detector during tests for cleaner output.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // B-NEW-43 Phase 2: seed XSTOCK_SPOT_SYMBOLS via the same _replaceXstockUniverse()
  // path the universe-service uses post-boot. Pre-B79.0n.UNIVERSE-DISCOVERY the
  // universe was module-load-populated; post-commit-230348507 it requires explicit
  // boot/seed which unit tests don't run. See server/tests/helpers/seed-xstock-universe.ts.
  seedXstockUniverse();
  _testClearAllState();
  // Inject empty dividend calendar by default; specific tests override.
  _testInjectDividendCalendar([]);
});

describe('B-NEW-42b — price-discontinuity detector', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Cold-start fail-safe-skip
  // ──────────────────────────────────────────────────────────────────────────

  it('COLD-START: first call per symbol returns ACTIVE with kind=cold_start (fail-safe-skip)', () => {
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200, 1_000_000_000_000);
    expect(result.active).toBe(true);
    expect(result.kind).toBe('cold_start');
    // Cache populated for next call.
    expect(_testGetSymbolEntry(XSTOCK_SYMBOL)).toBeDefined();
  });

  it('COLD-START: second call (steady-state) returns INACTIVE', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    // Small price move, well within all thresholds.
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200.5, t0 + 10_000);
    expect(result.active).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Crypto no-op
  // ──────────────────────────────────────────────────────────────────────────

  it('CRYPTO: detector returns INACTIVE for crypto symbols immediately (no cold-start)', () => {
    const result = isDiscontinuityActive(CRYPTO_SYMBOL, 60000, 1_000_000_000_000);
    expect(result.active).toBe(false);
    // No cache entry created (detector exits before populating).
    expect(_testGetSymbolEntry(CRYPTO_SYMBOL)).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Halt-resume-gap state machine
  // ──────────────────────────────────────────────────────────────────────────

  it('HALT-RESUME: 10min gap with 2% drop transitions IDLE → DISCONTINUITY_ACTIVE', () => {
    const t0 = 1_000_000_000_000;
    // Step 1: cold-start (active=true, kind=cold_start)
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    // Step 2: steady-state at same price (IDLE)
    const steady = isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    expect(steady.active).toBe(false);
    // Step 3: 10-min gap, 2% drop → ACTIVE/halt_resume_gap
    const gap = isDiscontinuityActive(XSTOCK_SYMBOL, 196, t0 + 10_000 + 600_000);
    expect(gap.active).toBe(true);
    expect(gap.kind).toBe('halt_resume_gap');
    expect(gap.details?.gapSeconds).toBeCloseTo(600, 0);
    expect(gap.details?.priceChangePct).toBeCloseTo(-2, 1);
  });

  it('HALT-RESUME: ACTIVE → CLEARING on confirming tick within window and tolerance', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    // Trigger ACTIVE
    isDiscontinuityActive(XSTOCK_SYMBOL, 196, t0 + 10_000 + 600_000);
    // Confirming tick: 5 sec later, price moved <0.5% from resume price ($196)
    const confirming = isDiscontinuityActive(XSTOCK_SYMBOL, 196.5, t0 + 10_000 + 600_000 + 5_000);
    // Confirming call still returns ACTIVE — it's the call that transitions to CLEARING.
    expect(confirming.active).toBe(true);
    expect(confirming.kind).toBe('halt_resume_gap');
    // Next call should be INACTIVE (CLEARING → IDLE auto-transition).
    const cleared = isDiscontinuityActive(XSTOCK_SYMBOL, 196.6, t0 + 10_000 + 600_000 + 10_000);
    expect(cleared.active).toBe(false);
  });

  it('HALT-RESUME: stays ACTIVE when subsequent tick is still in gap-magnitude territory', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    // ACTIVE at price 196 (2% drop from 200)
    isDiscontinuityActive(XSTOCK_SYMBOL, 196, t0 + 10_000 + 600_000);
    // Still moving: tick at 194 (1% from resume price 196). >= 0.5% threshold.
    const stillActive = isDiscontinuityActive(XSTOCK_SYMBOL, 194, t0 + 10_000 + 600_000 + 5_000);
    expect(stillActive.active).toBe(true);
    expect(stillActive.kind).toBe('halt_resume_gap');
  });

  it('HALT-RESUME: hard ceiling (5min) auto-clears ACTIVE even without confirming tick', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    // ACTIVE at price 196
    isDiscontinuityActive(XSTOCK_SYMBOL, 196, t0 + 10_000 + 600_000);
    // 6 minutes later (past 5min hard ceiling); price still moving 5%
    const expired = isDiscontinuityActive(XSTOCK_SYMBOL, 186, t0 + 10_000 + 600_000 + 360_000);
    // Auto-clear at hard ceiling → returns INACTIVE for this call.
    expect(expired.active).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Corp-action discontinuity (≥40% single-bar)
  // ──────────────────────────────────────────────────────────────────────────

  it('CORP-ACTION: 50% single-bar drop triggers corp_action regardless of gap duration', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    // Single-bar 50% drop (2:1 split). Gap is small (10 sec) — corp_action wins
    // because |Δ%| >= 40%.
    const corpAction = isDiscontinuityActive(XSTOCK_SYMBOL, 100, t0 + 20_000);
    expect(corpAction.active).toBe(true);
    expect(corpAction.kind).toBe('corp_action');
    expect(corpAction.details?.priceChangePct).toBeCloseTo(-50, 1);
  });

  it('CORP-ACTION: 24h TTL auto-clears the ACTIVE state', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);
    isDiscontinuityActive(XSTOCK_SYMBOL, 100, t0 + 20_000);  // ACTIVE/corp_action
    // 24h + 1min later
    const expired = isDiscontinuityActive(XSTOCK_SYMBOL, 100, t0 + 20_000 + 86400_000 + 60_000);
    expect(expired.active).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Ex-dividend curated calendar
  // ──────────────────────────────────────────────────────────────────────────

  it('EX-DIVIDEND: tick within 8:30 ET (7:30-9:30 block) on known ex-date returns ACTIVE', () => {
    _testInjectDividendCalendar([
      { symbol: XSTOCK_SYMBOL, ex_dates: ['2026-06-12'] },
    ]);
    // 2026-06-12 08:30 ET = 12:30 UTC (EDT, UTC-4)
    const tInBlock = Date.UTC(2026, 5, 12, 12, 30, 0); // June = month 5 (0-indexed)
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200, tInBlock);
    expect(result.active).toBe(true);
    expect(result.kind).toBe('ex_dividend');
    expect(result.details?.knownExDate).toBe('2026-06-12');
  });

  it('EX-DIVIDEND: tick at 10:00 ET (after block ends) on known ex-date returns INACTIVE (cold-start path runs)', () => {
    _testInjectDividendCalendar([
      { symbol: XSTOCK_SYMBOL, ex_dates: ['2026-06-12'] },
    ]);
    // 2026-06-12 10:00 ET = 14:00 UTC (EDT). Block was 7:30-9:30 ET.
    const tAfterBlock = Date.UTC(2026, 5, 12, 14, 0, 0);
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200, tAfterBlock);
    // Cold-start fires because no prior tick. The ex-div block check ran first
    // and returned inactive (outside window) → fell through to state machine
    // which is cold-start.
    expect(result.active).toBe(true);
    expect(result.kind).toBe('cold_start');
  });

  it('EX-DIVIDEND: tick on date NOT in calendar returns through normal pipeline (cold-start on first)', () => {
    _testInjectDividendCalendar([
      { symbol: XSTOCK_SYMBOL, ex_dates: ['2026-06-12'] },
    ]);
    // 2026-06-13 08:30 ET (one day after the ex-date) — block window but wrong date.
    const tOffDate = Date.UTC(2026, 5, 13, 12, 30, 0);
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200, tOffDate);
    expect(result.kind).toBe('cold_start');
  });

  it('EX-DIVIDEND: symbol not in calendar returns through normal pipeline', () => {
    _testInjectDividendCalendar([
      { symbol: 'KO/USD', ex_dates: ['2026-06-12'] },  // different symbol
    ]);
    const tInBlock = Date.UTC(2026, 5, 12, 12, 30, 0);
    const result = isDiscontinuityActive(XSTOCK_SYMBOL, 200, tInBlock);
    expect(result.kind).toBe('cold_start');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Lazy eviction at 24h staleness
  // ──────────────────────────────────────────────────────────────────────────

  it('LAZY-EVICTION: cache entry older than 24h is dropped → next call is cold-start', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);  // cold-start
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);  // steady-state
    // 25 hours later (past 24h staleness threshold)
    const afterStale = isDiscontinuityActive(XSTOCK_SYMBOL, 201, t0 + 10_000 + 25 * 3600_000);
    expect(afterStale.active).toBe(true);
    expect(afterStale.kind).toBe('cold_start');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Explicit cache invalidation via clearSymbolState
  // ──────────────────────────────────────────────────────────────────────────

  it('CLEAR-SYMBOL-STATE: explicit invalidation forces re-cold-start on next call', () => {
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0);
    isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 10_000);  // steady-state
    clearSymbolState(XSTOCK_SYMBOL);
    const afterClear = isDiscontinuityActive(XSTOCK_SYMBOL, 200, t0 + 20_000);
    expect(afterClear.active).toBe(true);
    expect(afterClear.kind).toBe('cold_start');
  });
});
