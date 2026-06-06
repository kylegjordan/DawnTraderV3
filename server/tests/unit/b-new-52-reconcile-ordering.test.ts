/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-52 (2026-06-06) — Weekend reconcile is the single source of truth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The fire-once weekend node-cron was retired. The 30s poll-reconcile in
 * xstockSpotScanner is now the ONLY driver of the Fri-close / Sun-reopen
 * boundary transitions. These tests lock two invariants that a future refactor
 * must never silently break:
 *
 *   1. ORDERING: the per-tick reconcile runs ABOVE the `if (this.isPaused)
 *      return` early-out, so the Sunday reopen (restart) fires even though the
 *      scanner is PAUSED over the weekend. (If the reconcile were below the
 *      early-out, a paused scanner would never detect it should resume.)
 *
 *   2. IDEMPOTENCY: repeated reconcile ticks while inside the weekend-closed
 *      window do NOT double-trigger the shutdown — once the scanner is paused,
 *      subsequent ticks see state-matches and no-op (no double-suspend).
 *
 * These exercise the REAL scanner handleTick / reconcileWindowState via the
 * B-NEW-52 test-only seams, with the heavy static imports mocked.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the market-hours predicate so the test controls inside-window. ──
let mockInsideWindow = false;
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockMarketOpenUTC: vi.fn((_symbol: string, _now?: Date) => !mockInsideWindow),
}));

// ── Mock the session-lifecycle-controller the scanner dynamically imports.
//    We drive scanner paused-state ourselves; the controller stubs just
//    record that the correct reconcile entry point was called.            ──
const shutdownFromPollCalls: Date[] = [];
const restartFromPollCalls: Date[] = [];
vi.mock('../../services/session-lifecycle-controller.js', () => ({
  sessionLifecycleController: {
    runShutdownFromPoll: vi.fn(async (now: Date) => { shutdownFromPollCalls.push(now); }),
    runRestartFromPoll: vi.fn(async (now: Date) => { restartFromPollCalls.push(now); }),
  },
}));

// ── Mock heavy static deps so importing the scanner module is cheap. ──
vi.mock('../../services/central-clock.js', () => ({
  centralClock: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    start: vi.fn(),
    getIsRunning: vi.fn(() => true),
  },
}));
vi.mock('../../services/asset-class-instances.js', () => ({
  getXstockSpotInstances: vi.fn(() => ({})),
}));
vi.mock('../../db.js', () => ({ db: { execute: vi.fn(async () => ({ rows: [] })) } }));

beforeEach(() => {
  shutdownFromPollCalls.length = 0;
  restartFromPollCalls.length = 0;
  mockInsideWindow = false;
});

async function loadScanner() {
  const mod = await import('../../asset_classes/xstock_spot/scanner.js');
  return mod.xstockSpotScanner as any;
}

describe('B-NEW-52 — reconcile-before-pause ordering (Sunday reopen fires while paused)', () => {
  it('reconcileWindowState triggers RESTART while isPaused === true', async () => {
    const scanner = await loadScanner();
    // Weekend is over (market OPEN) but scanner is still PAUSED → must restart.
    mockInsideWindow = false;
    scanner._setIsPausedForTest(true);

    await scanner.reconcileWindowState(new Date('2026-06-07T01:00:00Z'));

    expect(restartFromPollCalls).toHaveLength(1);
    expect(shutdownFromPollCalls).toHaveLength(0);

    scanner._setIsPausedForTest(false); // reset shared singleton
  });

  it('handleTick runs the reconcile (restart) BEFORE the isPaused early-out', async () => {
    const scanner = await loadScanner();
    // Scanner PAUSED, market OPEN, on a reconcile-boundary tick (multiple of 30).
    // If the reconcile were below the isPaused early-out, this would NOT fire.
    mockInsideWindow = false;
    scanner._setIsRunningForTest(true);
    scanner._setIsPausedForTest(true);

    await scanner._handleTickForTest({ tickNumber: 30, timestamp: Date.parse('2026-06-07T01:00:00Z') });

    // The restart reconcile fired DESPITE the scanner being paused → proves the
    // reconcile sits above the `if (isPaused) return` early-out.
    expect(restartFromPollCalls).toHaveLength(1);

    scanner._setIsPausedForTest(false);
    scanner._setIsRunningForTest(false);
  });
});

describe('B-NEW-52 — reconcile idempotency (no double-suspend across ticks)', () => {
  it('repeated reconcile ticks inside the closed window do not double-trigger shutdown', async () => {
    const scanner = await loadScanner();
    // Weekend window CLOSED (market closed). First tick: scanner running →
    // shutdown reconcile fires. We then mark the scanner paused (as the real
    // shutdown core would) and tick again: state matches → no second trigger.
    mockInsideWindow = true;
    scanner._setIsRunningForTest(true);
    scanner._setIsPausedForTest(false);

    // Tick 1 — drift detected (window closed, scanner running) → shutdown.
    await scanner._handleTickForTest({ tickNumber: 30, timestamp: Date.parse('2026-06-06T01:00:00Z') });
    expect(shutdownFromPollCalls).toHaveLength(1);

    // Simulate the shutdown core having paused the scanner.
    scanner._setIsPausedForTest(true);

    // Ticks 2 & 3 — state now matches (window closed, scanner paused) → NO further
    // shutdown triggers (idempotent; no double-suspend).
    await scanner._handleTickForTest({ tickNumber: 60, timestamp: Date.parse('2026-06-06T01:00:30Z') });
    await scanner._handleTickForTest({ tickNumber: 90, timestamp: Date.parse('2026-06-06T01:01:00Z') });

    expect(shutdownFromPollCalls).toHaveLength(1); // still only the first
    expect(restartFromPollCalls).toHaveLength(0);

    scanner._setIsPausedForTest(false);
    scanner._setIsRunningForTest(false);
  });

  it('reconcileWindowState is a no-op when window state matches scanner state', async () => {
    const scanner = await loadScanner();
    // Window closed + scanner already paused → matched state, no action.
    mockInsideWindow = true;
    scanner._setIsPausedForTest(true);

    await scanner.reconcileWindowState(new Date('2026-06-06T02:00:00Z'));

    expect(shutdownFromPollCalls).toHaveLength(0);
    expect(restartFromPollCalls).toHaveLength(0);

    scanner._setIsPausedForTest(false);
  });
});
