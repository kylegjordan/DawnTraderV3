/**
 * P19-B4a C3 — active-fill safety GATE + silent-stall WATCHDOG behavior.
 *
 * All deps mocked so we exercise the gate/watchdog WIRING (the real predicates +
 * config resolver are covered in p19-b4a-c3-predicates.test.ts). Verifies every
 * fail-closed block path increments its counter and never dispatches, that a
 * fresh in-window signal dispatches, and that the watchdog forces a reconnect +
 * critical alert on an open-but-silent socket while staying inert during the
 * weekend or when a reconnect is already pending.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FULL_CONFIG = {
  activeFillMaxAgeMs: 15000,
  liquidFillWindowOpenMinEt: 570,
  liquidFillWindowCloseMinEt: 960,
  stallReconnectMsRth: 75000,
  stallReconnectMsOffrth: 750000,
};

let captured: any = null;
let engineActive = true;
let safetyConfig: any = { ...FULL_CONFIG };
let inLiquidWindow = true;
let weekendClose = false;
let alertSpy = vi.fn();

vi.mock('../../services/active-engine-service.js', () => ({
  getOrchestratorByMode: () => ({
    dispatchExternalSignal: async (rawSignal: any, strategyId: any, sizingContext: any, marketContext: any) => {
      captured = { rawSignal, strategyId, sizingContext, marketContext };
      return null;
    },
  }),
}));
vi.mock('../../storage.js', () => ({
  storage: {
    // P19-B6.5a: the per-class active gate runs right after the master isEngineActive check, so the
    // mocked context must opt xstock_spot ACTIVE for these C3 fill-safety assertions to be reached.
    getSystemContext: async () => ({ isEngineActive: engineActive, activeAssetClasses: { xstock_spot: true } }),
    getGuardrailsV2: async () => null,
  },
}));
// B-BALANCE-SESSION-PAIRING (pre-audit P10): the xStock dispatch sizes against getMoneyHeld now.
vi.mock('../../services/guardrail-settings.js', () => ({ getMoneyHeld: async () => 1000, MoneyHeldUnavailable: class MoneyHeldUnavailable extends Error { constructor(public readonly reason: string) { super(reason); this.name = 'MoneyHeldUnavailable'; } } }));
// The archiver import needs a db; gate (b) no longer reads a DB age (B-PRICE-FEED-COVERAGE increment 0), so the row is inert.
vi.mock('../../db.js', () => ({ db: { execute: async () => ({ rows: [] }) } }));
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: (...a: any[]) => { alertSpy(...a); return Promise.resolve({}); },
}));
vi.mock('../../asset_classes/xstock_spot/fill-safety-config.js', () => ({
  resolveXstockFillSafetyConfig: async () => safetyConfig,
}));
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockLiquidFillWindowET: () => inLiquidWindow,
  isInXstockWeekendClose: () => weekendClose,
  // row 33 P2: the watchdog also skips the Sunday reopen pause; never inside one in these tests (the P2 sequence is
  // driven on the real calendar in b-price-staleness-bound.test.ts).
  isXstockVenueTransitionPause: () => ({ paused: false, window: null }),
}));

import {
  dispatchXstockActiveSignal,
  getXstockActiveDispatchStats,
} from '../../asset_classes/xstock_spot/active-dispatch.js';
import {
  runStallWatchdogTick,
  _setArchiverStateForTest,
  _handleMessageForTests,
  _getArchiverClocksForTest,
} from '../../services/passive-archive/equity-spot-archiver.js';

function input(over: Record<string, any> = {}) {
  return {
    symbol: 'TSLA/USD',
    strategyKey: 'vwap_pullback',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    predictiveConfidence: 0.8,
    signalType: 'QUANT',
    sourcePool: 'quant',
    atr: 1.2,
    high24h: 105,
    low24h: 98,
    ...over,
  };
}

describe('P19-B4a C3 — active-fill safety gate', () => {
  beforeEach(() => {
    captured = null;
    engineActive = true;
    safetyConfig = { ...FULL_CONFIG };
    inLiquidWindow = true;
    alertSpy = vi.fn();
  });

  // B-PRICE-FEED-COVERAGE increment 0: gate (b) reads the REAL in-memory equity tick, so each case feeds the archiver the
  // frame it describes (an `update` is a venue change; a `snapshot` is the venue replaying the book on a subscribe).
  const frame = (symbol: string, type: 'update' | 'snapshot') =>
    Buffer.from(JSON.stringify({ channel: 'ticker', type, data: [{ symbol, bid: 99.9, ask: 100.1, last: 100 }] }));

  it('fresh tick + in liquid window → dispatches', async () => {
    _handleMessageForTests(frame('TSLA/USD', 'update'));
    await dispatchXstockActiveSignal(input());
    expect(captured, 'should have dispatched').toBeTruthy();
    expect(captured.sizingContext.assetClass).toBe('xstock_spot');
  });

  it('fill-safety config missing → blocked + configClosedSkips (fail-closed)', async () => {
    safetyConfig = null;
    const before = getXstockActiveDispatchStats().configClosedSkips;
    await dispatchXstockActiveSignal(input());
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().configClosedSkips).toBe(before + 1);
  });

  // P19-B4b.1 (#295): the active-dispatch "outside the liquid fill window → blocked"
  // test is REMOVED — the RTH clock is no longer a fill gate here (the 24/5 book-depth-
  // sufficiency gate at the engine open seam replaced it; the watchdog block below still
  // exercises `inLiquidWindow` for its RTH-vs-off-RTH stall threshold).

  it('stale latest tick (> max age) → blocked + staleSkips + the STALE alert key + its stderr line', async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0, toFake: ['Date'] });
    try {
      _handleMessageForTests(frame('STALE1/USD', 'update'));
      vi.setSystemTime(t0 + 30_000); // > 15000ms
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const before = getXstockActiveDispatchStats().staleSkips;
      await dispatchXstockActiveSignal(input({ symbol: 'STALE1/USD' }));
      expect(captured).toBeNull();
      expect(getXstockActiveDispatchStats().staleSkips).toBe(before + 1);
      expect(alertSpy.mock.calls.at(-1)?.[0]?.dedupe_key).toBe('xstock-stale-fill-block');
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
        '[B-PRICE-FEED-COVERAGE][INC0][DISPATCH_REFUSE] arm=stale symbol=STALE1/USD ageMs=30000');
      warn.mockRestore();
    } finally { vi.useRealTimers(); }
  });

  it('no tick at all → blocked + staleSkips (arm=absent)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getXstockActiveDispatchStats().staleSkips;
    await dispatchXstockActiveSignal(input({ symbol: 'NOTICK/USD' }));
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().staleSkips).toBe(before + 1);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
      '[B-PRICE-FEED-COVERAGE][INC0][DISPATCH_REFUSE] arm=absent symbol=NOTICK/USD ageMs=null');
    warn.mockRestore();
  });

  it('INCREMENT 0: a book that exists only as the venue REPLAY after a restart → refused cold, on its OWN alert key', async () => {
    // The DB snapshot of this replay would read ~0 ms old (the defect). The in-memory tick is born `observed: false`.
    _handleMessageForTests(frame('COLDREPLAY/USD', 'snapshot'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getXstockActiveDispatchStats();
    await dispatchXstockActiveSignal(input({ symbol: 'COLDREPLAY/USD' }));
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().coldSkips).toBe(before.coldSkips + 1);
    expect(getXstockActiveDispatchStats().staleSkips).toBe(before.staleSkips); // not counted as stale
    expect(alertSpy.mock.calls.at(-1)?.[0]?.dedupe_key).toBe('xstock-cold-tick-fill-block');
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith(
      '[B-PRICE-FEED-COVERAGE][INC0][DISPATCH_REFUSE] arm=cold symbol=COLDREPLAY/USD ageMs='))).toBe(true);
    warn.mockRestore();
  });

  it('INCREMENT 0: a later REPLAY of a book last changed 30 s ago keeps the old age → refused stale (a replay never refreshes)', async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0, toFake: ['Date'] });
    try {
      _handleMessageForTests(frame('OLDBOOK/USD', 'update'));
      vi.setSystemTime(t0 + 30_000);
      _handleMessageForTests(frame('OLDBOOK/USD', 'snapshot')); // the reconnect replay — its DB row would read fresh
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const before = getXstockActiveDispatchStats();
      await dispatchXstockActiveSignal(input({ symbol: 'OLDBOOK/USD' }));
      expect(captured).toBeNull();
      // MEASURED, not inferred from `captured`: refused STALE on the 30 s-old age the replay did not refresh — not cold
      // (a replay that reset `observed` would be refused too, but as cold, and this claim would go unmeasured).
      expect(getXstockActiveDispatchStats().staleSkips).toBe(before.staleSkips + 1);
      expect(getXstockActiveDispatchStats().coldSkips).toBe(before.coldSkips);
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
        '[B-PRICE-FEED-COVERAGE][INC0][DISPATCH_REFUSE] arm=stale symbol=OLDBOOK/USD ageMs=30000');
      warn.mockRestore();
    } finally { vi.useRealTimers(); }
  });
});

describe('P19-B4a C3 — silent-stall watchdog', () => {
  const RTH_CLOCK = new Date('2026-06-17T14:30:00Z'); // Wed 10:30 ET

  beforeEach(() => {
    safetyConfig = { ...FULL_CONFIG };
    inLiquidWindow = true;
    weekendClose = false;
    alertSpy = vi.fn();
  });

  it('open socket silent past the RTH threshold → forces reconnect (close) + critical alert', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 200_000,
      lastDataMsgAt: Date.now() - 200_000, // #594: the watchdog now reads the DATA clock // 200s silent > 75s RTH threshold
      ws: { readyState: 1, close } as any, // 1 = WebSocket.OPEN
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('reconnect already pending → does NOT close (no race with in-flight backoff)', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: true,
      lastMsgAt: Date.now() - 200_000,
      lastDataMsgAt: Date.now() - 200_000, // #594: the watchdog now reads the DATA clock
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).not.toHaveBeenCalled();
  });

  it('weekend close → inert (no reconnect even on a silent socket)', async () => {
    weekendClose = true;
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 999_000,
      lastDataMsgAt: Date.now() - 999_000, // #594: the watchdog now reads the DATA clock
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-20T14:30:00Z'));
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // ── #594: the watchdog must measure DATA arrival, not socket chatter ──
  // Each of these MUST FAIL with #594 reverted (watchdog reading `lastMsgAt`), or it asserts nothing.

  it('#594: CHATTER-ONLY socket (frames arriving, NO prices) → STALL fires + forces reconnect', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now(),              // acks/heartbeats landing RIGHT NOW — socket looks alive
      lastDataMsgAt: Date.now() - 200_000, // but no PRICE for 200s > 75s RTH threshold
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    // THE WHOLE POINT: pre-#594 the fresh `lastMsgAt` masked this and the watchdog stayed silent.
    expect(close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('#594 BLOCKER FENCE: boot/reconnect with NO ticks yet → SILENT (no close, no alert)', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now(),
      lastDataMsgAt: Date.now(), // seeded at ws-open — "never had a price" must NOT read as infinitely stale
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-17T06:00:00Z')); // off-RTH, legitimately quiet
    // Without the ws-open seed this is `Infinity > threshold` ⇒ CRITICAL + forced close of the ONLY
    // venue price source for xStock marks, on a loop. "Never had data" ≠ "had data, then stopped".
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('#594: UNSEEDED clock (lastDataMsgAt=0) FIRES on a legitimately quiet off-RTH stretch — this is the danger the ws-open seed exists to prevent', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now(),
      lastDataMsgAt: 0,   // "never yet had a price" — the state at boot IF the ws-open seed is absent
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-17T06:00:00Z')); // off-RTH, legitimately quiet
    // 0 ⇒ `Infinity` ⇒ unconditionally > threshold ⇒ CRITICAL + forced close of the ONLY venue
    // price source for xStock marks, then repeat. THIS ASSERTION DOCUMENTS THE HAZARD; the ws-open
    // seed is what guarantees the field is never 0 in production.
    // ⚠ HONEST LIMIT: this harness sets state directly and never reaches `ws.on('open')`, so it
    // CANNOT mutation-prove the seed itself — removing the seed leaves every test here passing.
    // The seed is verified by code inspection + the live check in §4. Stated, not glossed.
    expect(close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('#594 REGRESSION FENCE: a data frame refreshes the DATA clock → watchdog silent', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 200_000, // socket chatter stale — irrelevant to the watchdog now
      lastDataMsgAt: Date.now(),        // prices ARE arriving
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('within off-RTH threshold → no reconnect (does not thrash on sparse off-hours gaps)', async () => {
    inLiquidWindow = false; // off-RTH → 750s threshold
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 200_000,
      lastDataMsgAt: Date.now() - 200_000, // #594: the watchdog now reads the DATA clock // 200s < 750s off-RTH threshold
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-17T06:00:00Z')); // Wed 02:00 ET, feed-live but off-RTH
    expect(close).not.toHaveBeenCalled();
  });

  it('config missing → raises config-missing alert + stays inert', async () => {
    safetyConfig = null;
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 999_000,
      lastDataMsgAt: Date.now() - 999_000, // #594: the watchdog now reads the DATA clock
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled(); // config-missing alert
  });
});

/**
 * #594 STAMP-SITE fences (Langston Step-8 ①).
 *
 * ⚠️ WHY THESE EXIST, AND WHY THE OTHER #594 TESTS DO NOT COVER IT.
 * Every other #594 test injects BOTH clocks via `_setArchiverStateForTest` and asserts the
 * watchdog thresholds on the DATA one. That fences the READER. But the defect WAS A WRITER —
 * `lastDataMsgAt` being refreshed by any frame, heartbeats included — and re-adding
 * `state.lastDataMsgAt = Date.now()` to handleMessage's first line leaves every one of those
 * tests GREEN. A fence that stays green with the bug restored does not fence the bug.
 * These drive REAL frames through `handleMessage` and assert WHICH frame moves WHICH clock.
 */
describe('#594 stamp sites — which frames move which clock', () => {
  const frame = (o: unknown) => Buffer.from(JSON.stringify(o));

  beforeEach(() => {
    // Distinct sentinels, deliberately: a shared value cannot distinguish "advanced"
    // from "was already equal", which is the whole assertion here.
    _setArchiverStateForTest({ enabled: true, lastMsgAt: 1_000, lastDataMsgAt: 2_000 });
  });

  it('heartbeat advances the CONNECTION clock and leaves the DATA clock untouched', () => {
    _handleMessageForTests(frame({ channel: 'heartbeat' }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);   // the socket IS talking
    expect(c.lastDataMsgAt).toBe(2_000);          // ...but no PRICE arrived
  });

  it('subscribe-ack advances the CONNECTION clock only', () => {
    _handleMessageForTests(frame({
      method: 'subscribe',
      result: { channel: 'ohlc', symbol: 'A/USD' },
      success: true,
    }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBe(2_000);
  });

  it('a ticker frame advances BOTH clocks', () => {
    _handleMessageForTests(frame({
      channel: 'ticker',
      data: [{ symbol: 'AAPL/USD', bid: 100, ask: 100.5, last: 100.2 }],
    }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBeGreaterThan(2_000);
  });

  it('an ohlc frame advances BOTH clocks', () => {
    _handleMessageForTests(frame({
      channel: 'ohlc',
      data: [{ symbol: 'AAPL/USD', interval_begin: '2026-07-31T09:00:00Z', open: 1, high: 2, low: 1, close: 2 }],
    }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBeGreaterThan(2_000);
  });

  it('MALFORMED ticker snap (no symbol) advances the CONNECTION clock but NOT the DATA clock', () => {
    // The stamp sits AFTER the `!data?.symbol` guard by design: junk is not proof of life.
    _handleMessageForTests(frame({ channel: 'ticker', data: [{ bid: 100, ask: 100.5 }] }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBe(2_000);
  });

  it('a validator-REJECTED OHLC frame advances the CONNECTION clock but NOT the DATA clock', () => {
    // B-OHLC-FRAME-GUARD (#1028, pre-audit A14): the frame guard REPLACED the old truthiness check and runs
    // BEFORE the data-clock stamp — the twin of the malformed-ticker case above. A bar whose close is not a
    // number is junk, and junk is not proof of life. Moving the stamp above the validator turns this red.
    _handleMessageForTests(frame({
      channel: 'ohlc',
      data: [{ symbol: 'AAPL/USD', interval_begin: '2026-07-31T09:00:00Z', open: 1, high: 2, low: 1, close: 'NaN' }],
    }));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBe(2_000);
  });

  it('unparseable JSON advances the CONNECTION clock and neither parser runs', () => {
    _handleMessageForTests(Buffer.from('{not json'));
    const c = _getArchiverClocksForTest();
    expect(c.lastMsgAt).toBeGreaterThan(1_000);
    expect(c.lastDataMsgAt).toBe(2_000);
  });
});
