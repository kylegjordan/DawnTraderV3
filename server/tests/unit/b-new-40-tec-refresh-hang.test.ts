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
// The mocked module-constants service (vi.mock above) — imported so the
// B-TEC-SELFHEAL coalescer test can assert exactly-one refresh fired.
import { getModuleConstants } from '../../services/module-constants-service.js';

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

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-TEC-SELFHEAL (2026-06-25, RUNNING_ISSUES #349) — OBJ-1 self-heal + coalescer
 * ═════════════════════════════════════════════════════════════════════════════
 * Verifies the refresh-before-throw fix: a stale-past-ceiling consult still
 * FAILS CLOSED (the safety property is preserved), but it now ALSO schedules the
 * coalesced background refresh, so once that refresh SUCCEEDS the next consult
 * self-heals WITHOUT a process restart — converting the old latch-until-restart
 * into a transient ~1-cycle fence. Both halves are tested (Langston Step-1):
 * hung refresh → still throws + inFlight appears; successful refresh → next
 * consult returns cached. Plus the coalescer invariant (N stale consults → 1
 * refresh) and the unprimed-class guard (no self-heal — boot hard-fail stays).
 * ═════════════════════════════════════════════════════════════════════════════
 */
describe('B-TEC-SELFHEAL — OBJ-1 self-heal (refresh-before-throw) + coalescer', () => {
  const ASSET_CLASS = 'crypto_spot' as const;
  const CONFIG_TTL_MS = 60_000;
  const MAX_STALENESS_MS = 5 * CONFIG_TTL_MS; // 300_000
  const REFRESH_TIMEOUT_MS = 45_000;

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    moduleConstantsHangControl.hang = false;
    _testClearEngineConfigCache();
    await primeTECConfig();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('SUCCESS half: a stale-past-ceiling consult STILL throws (fail-closed) AND schedules a self-heal refresh; once it succeeds the next consult returns cached — no restart', async () => {
    moduleConstantsHangControl.hang = false; // the scheduled refresh will succeed
    // Cross the 5min staleness ceiling from the prime in beforeEach.
    vi.advanceTimersByTime(MAX_STALENESS_MS + 1000);

    // First consult: past ceiling → fail-closed throw (safety property intact)…
    expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_STALE_FAIL_CLOSED/);
    // …AND the OBJ-1 fix scheduled a self-heal refresh (inFlight now appears).
    const during = getTECDiagnostics().classes.find((c) => c.assetClass === ASSET_CLASS);
    expect(during?.refreshInFlight).toBe(true);

    // Advance past the 45s fence. This is the drain the existing test (a) uses:
    // advancing across the timer boundary pumps the faked microtask queue
    // (hasExplicitAssetClassRow → getModuleConstants → cache set). With hang=false
    // the refresh RESOLVES via those microtasks and clears its own timeout before
    // the 45s mark, so it lands and heals the cache. (A bare `await Promise.resolve()`
    // and a sub-45s advance do NOT pump vitest's faked queue.)
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 1000);

    // The cache self-healed: the next consult no longer throws and returns cached
    // (lastSuccess was advanced by the refresh; age is now well under the ceiling).
    expect(() => resolveTECConfig(ASSET_CLASS)).not.toThrow();
    expect(resolveTECConfig(ASSET_CLASS).breakEvenEnabled).toBe(false);
    const healed = getTECDiagnostics().classes.find((c) => c.assetClass === ASSET_CLASS);
    expect(healed?.refreshInFlight).toBe(false);
  });

  it('HUNG half: while the refresh hangs, the stale consult STILL throws and only a SUCCESSFUL refresh clears staleness (fail-closed survives a hung refresh)', async () => {
    moduleConstantsHangControl.hang = true; // the scheduled refresh hangs
    vi.advanceTimersByTime(MAX_STALENESS_MS + 1000);

    // Stale consult throws + schedules a (hung) refresh.
    expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_STALE_FAIL_CLOSED/);
    expect(
      getTECDiagnostics().classes.find((c) => c.assetClass === ASSET_CLASS)?.refreshInFlight,
    ).toBe(true);

    // Hung refresh never clears staleness → still fails closed.
    await vi.advanceTimersByTimeAsync(100);
    expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_STALE_FAIL_CLOSED/);
  });

  it('COALESCER: N repeated stale consults of one class fire exactly ONE refresh (not N)', async () => {
    moduleConstantsHangControl.hang = true; // the single refresh will hang then time out
    vi.advanceTimersByTime(MAX_STALENESS_MS + 1000);

    // 10 stale consults back-to-back — all fail closed; the FIRST schedules the
    // refresh (sets inFlight synchronously), consults 2-10 short-circuit on the
    // `!inFlight` coalescer guard.
    for (let i = 0; i < 10; i++) {
      expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_STALE_FAIL_CLOSED/);
    }
    // Exactly one in-flight refresh after all 10 stale consults.
    expect(
      getTECDiagnostics().classes.find((c) => c.assetClass === ASSET_CLASS)?.refreshInFlight,
    ).toBe(true);

    // Advance past the 45s fence: the SINGLE hung refresh times out and records
    // exactly ONE consecutive failure. If the coalescer had failed and all 10
    // consults each fired a refresh, the count would be 10 — so failCount === 1
    // is the proof that the ~120/hr stuck-consult pattern costs a single refresh.
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 1000);
    expect(
      getTECDiagnostics().classes.find((c) => c.assetClass === ASSET_CLASS)?.consecutiveFailCount,
    ).toBe(1);
  });

  it('UNPRIMED guard: an unprimed class does NOT schedule a self-heal refresh — it falls through to TEC_CACHE_MISS_FATAL (boot hard-fail invariant preserved)', () => {
    // Clear the cache so the class is genuinely unprimed (no entry).
    _testClearEngineConfigCache();
    (getModuleConstants as unknown as { mockClear: () => void }).mockClear();

    expect(() => resolveTECConfig(ASSET_CLASS)).toThrow(/TEC_CACHE_MISS_FATAL/);
    // The unprimed-class guard returned early — NO self-heal refresh was fired.
    expect((getModuleConstants as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
