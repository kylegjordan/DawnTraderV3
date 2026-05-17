/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — TEC refresh-hang hostile-scenario test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that when the underlying pg refresh promise hangs (neither resolves
 * nor rejects — the silent-TCP-death failure mode that produced 4832
 * TEC_STALE_FAIL_CLOSED events between 2026-05-08 and 2026-05-16), the new
 * Promise.race-against-45s-timeout escape hatch:
 *
 *   (a) releases `tecConfigRefreshInFlight` Map entry within 45s + ε
 *   (b) increments `tecRefreshFailCount` for the affected asset class
 *   (c) emits `[TEC_REFRESH_TIMEOUT]` log line exactly once for that incident
 *   (d) keeps returning cached config from `resolveTECConfig` until 5min ceiling
 *   (e) at 5min ceiling, `resolveTECConfig` throws TEC_STALE_FAIL_CLOSED
 *
 * The expanded assertion set (vs the prior B65/B80 tests) is intentional —
 * silent regressions where the catch path is bypassed are the exact failure
 * mode B-NEW-40 closes; the test must verify the catch path is provably
 * traversed (b + c), not just that the Map eventually frees (a alone).
 *
 * Implementation note: uses vitest fake timers to advance simulated time
 * deterministically. The hung promise stays pending across the entire test
 * (never created with reject/resolve handlers exposed externally), so the
 * timeout race is the ONLY thing that can free the Map entry.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- DB mock: getModuleConstants returns a never-resolving promise so the
//     real refreshTECConfigForClass call (which awaits getModuleConstants) hangs.
//     This simulates the silent-TCP-death scenario where pg-pool returns a
//     dead-but-ESTABLISHED socket and the query write succeeds but the
//     response never comes back. ---
const moduleConstantsHangControl = { hang: false };
vi.mock('../../services/module-constants-service.js', async () => {
  return {
    getModuleConstants: vi.fn(async (..._args: unknown[]) => {
      if (moduleConstantsHangControl.hang) {
        // Hang forever — never resolves, never rejects. The failure mode.
        return new Promise(() => {});
      }
      // Normal mode: return the rowset trailing_exit would resolve to.
      return {
        break_even_enabled: false,
        break_even_trigger_r: 1.0,
        target_lock_r: 1.5,
        trail_distance_atr_multiplier: 1.0,
        persistence_debounce_ms: 5000,
        moonbag_qualifying_strategies: ['strong_bull_trend'],
        moonbag_qualifying_source_pools: {},
        moonbag_max_duration_ms: 14_400_000,
        moonbag_cap_mode: 'reserved_slots',
        moonbag_reserved_slots: 1,
        rung_floor_slippage_buffer_multiplier: 1.0,
      };
    }),
    hasExplicitAssetClassRow: vi.fn(async () => true),
  };
});

// Storage stub — module imports it but the path under test doesn't exercise it.
vi.mock('../../storage.js', () => ({
  storage: {
    getPaperSimOpenPositions: async () => [],
    updatePaperSimOpenPosition: async () => undefined,
  },
}));

// Cost model stub.
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));

// Import the SUT. vi.mock() calls above are hoisted by vitest so this static
// import resolves against the mocked module-constants-service. Matches the
// pattern in b65-tec-parity.test.ts (no top-level await).
import {
  primeTECConfig,
  resolveTECConfig,
  _testClearEngineConfigCache,
  getTECDiagnostics,
} from '../../services/trailing-exit-controller.js';

describe('B-NEW-40 — TEC refresh-hang hostile scenario', () => {
  const ASSET_CLASS = 'crypto_spot' as const;
  const REFRESH_TIMEOUT_MS = 45_000;
  const CONFIG_TTL_MS = 60_000;
  const MAX_STALENESS_MS = 5 * CONFIG_TTL_MS; // 300_000

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    moduleConstantsHangControl.hang = false;
    _testClearEngineConfigCache();
    // Prime cache with a fresh successful refresh.
    await primeTECConfig();
    // Verify priming worked — cached snapshot for crypto_spot should exist.
    const diag0 = getTECDiagnostics();
    const cs0 = diag0.classes.find((c) => c.assetClass === ASSET_CLASS);
    expect(cs0?.cached).toBe(true);
    expect(cs0?.refreshInFlight).toBe(false);
    expect(cs0?.consecutiveFailCount).toBe(0);
    // From here on, switch the mock to hang mode so the NEXT background
    // refresh (triggered by TTL expiry) will simulate a stuck query.
    moduleConstantsHangControl.hang = true;
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('(a) inFlight Map releases within 45s + ε after a hung refresh; (b) tecRefreshFailCount increments; (c) TEC_REFRESH_TIMEOUT logs exactly once', async () => {
    // Advance past TTL so next resolve call triggers the background refresh.
    vi.advanceTimersByTime(CONFIG_TTL_MS + 100);

    // Trigger the background refresh. resolveTECConfig returns the cached
    // snapshot synchronously and schedules the refresh in the background.
    const cached1 = resolveTECConfig(ASSET_CLASS);
    expect(cached1).toBeDefined();

    // Refresh should be in flight now.
    const diagDuring = getTECDiagnostics();
    const csDuring = diagDuring.classes.find((c) => c.assetClass === ASSET_CLASS);
    expect(csDuring?.refreshInFlight).toBe(true);

    // Advance time past the 45s refresh-timeout fence. The hung promise will
    // never settle on its own; only the Promise.race timeout can free the Map.
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 250);

    // (a) inFlight Map entry released
    const diagAfter = getTECDiagnostics();
    const csAfter = diagAfter.classes.find((c) => c.assetClass === ASSET_CLASS);
    expect(csAfter?.refreshInFlight).toBe(false);

    // (b) fail counter incremented exactly once
    expect(csAfter?.consecutiveFailCount).toBe(1);

    // (c) TEC_REFRESH_TIMEOUT log fired exactly once
    const timeoutLogCalls = consoleErrorSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].startsWith('[TEC_REFRESH_TIMEOUT]'),
    );
    expect(timeoutLogCalls.length).toBe(1);
    // Sanity: did NOT log [TEC_REFRESH_FAIL] (timeout path is distinct).
    const failLogCalls = consoleErrorSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].startsWith('[TEC_REFRESH_FAIL]'),
    );
    expect(failLogCalls.length).toBe(0);
  });

  it('(d) resolveTECConfig keeps returning cached snapshot until 5min ceiling; (e) throws TEC_STALE_FAIL_CLOSED past ceiling', async () => {
    // Snapshot cached value before any refresh.
    const cachedRef = resolveTECConfig(ASSET_CLASS);
    expect(cachedRef.breakEvenEnabled).toBe(false);

    // Advance past TTL, trigger first hung refresh.
    vi.advanceTimersByTime(CONFIG_TTL_MS + 100);
    resolveTECConfig(ASSET_CLASS); // triggers background refresh, returns cache

    // Advance to 45s + ε so the timeout fence frees the Map.
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 250);

    // (d) Between 45s and 5min, resolveTECConfig keeps returning the cache.
    // Walk forward minute by minute and confirm.
    for (let elapsedMin = 1; elapsedMin <= 4; elapsedMin++) {
      const cfg = resolveTECConfig(ASSET_CLASS);
      expect(cfg.breakEvenEnabled).toBe(false);
      // Each call triggers another background refresh (TTL still expired).
      // Each of those refreshes will also hang and time out at 45s.
      await vi.advanceTimersByTimeAsync(60_000); // advance 1 min, draining any 45s timeouts en route
    }

    // (e) Past 5min ceiling, resolveTECConfig throws TEC_STALE_FAIL_CLOSED.
    // We're now at roughly 4 min + first refresh trigger + 45s. Advance enough
    // to cross the 5min staleness ceiling from the LAST successful refresh
    // (which happened in beforeEach via primeTECConfig).
    await vi.advanceTimersByTimeAsync(MAX_STALENESS_MS + 1000);

    expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_STALE_FAIL_CLOSED/);
  });
});
