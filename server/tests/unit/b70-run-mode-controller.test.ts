/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70 — Run-mode controller unit tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 * - Default mode is 'vts' before any refresh
 * - refreshMode reads tradingStateSync.isEngineActive flags and resolves
 *   to the correct mode
 * - Live takes precedence over paper-sim
 * - Paper takes precedence over vts
 * - Hold-previous-value on transient error
 * - getCurrentMode() returns synchronously without waiting
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const isEngineActiveMock = vi.fn();

vi.mock('../../services/trading-state-sync.js', () => ({
  tradingStateSync: {
    isEngineActive: isEngineActiveMock,
  },
}));

import {
  getCurrentMode,
  refreshMode,
  _resetForTests,
} from '../../services/run-mode-controller';

describe('B70 — run-mode-controller', () => {
  beforeEach(() => {
    _resetForTests();
    isEngineActiveMock.mockReset();
  });

  it("default mode before any refresh is 'vts'", () => {
    expect(getCurrentMode()).toBe('vts');
  });

  it("refreshMode resolves to 'vts' when neither paper nor live is active", async () => {
    isEngineActiveMock.mockResolvedValue(false);
    const mode = await refreshMode();
    expect(mode).toBe('vts');
  });

  it("refreshMode resolves to 'paper_sim' when paper engine is active", async () => {
    isEngineActiveMock.mockImplementation(async (mode: string) => mode === 'paper');
    const mode = await refreshMode();
    expect(mode).toBe('paper_sim');
  });

  it("refreshMode resolves to 'live' when live engine is active (overrides paper)", async () => {
    isEngineActiveMock.mockImplementation(async (mode: string) => mode === 'live' || mode === 'paper');
    const mode = await refreshMode();
    expect(mode).toBe('live');
  });

  it('holds previous value on transient error', async () => {
    isEngineActiveMock.mockImplementation(async (mode: string) => mode === 'paper');
    await refreshMode();
    expect(getCurrentMode()).toBe('paper_sim');

    // Simulate transient DB error on next refresh
    isEngineActiveMock.mockRejectedValueOnce(new Error('connection reset'));
    const mode = await refreshMode();
    expect(mode).toBe('paper_sim');
  });

  it('getCurrentMode is synchronous', () => {
    // No await — should return immediately
    const t0 = Date.now();
    const mode = getCurrentMode();
    const elapsed = Date.now() - t0;
    expect(typeof mode).toBe('string');
    expect(elapsed).toBeLessThan(5);
  });
});
