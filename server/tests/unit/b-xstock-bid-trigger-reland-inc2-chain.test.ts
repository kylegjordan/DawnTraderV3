// B-XSTOCK-BID-TRIGGER-RELAND (`3n.q7`) increment 2 — OBJ-3: THE CHAIN TEST.
//
// Drives the REAL `ActiveExecutionEngine.prototype.checkOpenPositions` and the REAL `checkExitConditions` on a stub
// `this`, for ONE held xStock paper position, through a frame sequence, with the REAL book-state tracker and the REAL
// book-state predicate (`spreadBlownEnabled: true` injected through the config seam):
//   1. WARM    — a normal two-sided book that moves; the comparator seeds, validates, and the evaluator runs (no exit).
//   2. BLOWOUT — a SYMMETRIC widening (both sides move OUT, the mid stays near fair: the MDB/USD 2026-09-19 00:15Z
//                shape). It reads `hollow/spread_blown` ⇒ SKIP, SKIP, then YIELD at `hollow_skip_cap` (alert raised,
//                `book_state_yield_refused` recorded, comparator cleared, the healthy chain's ring RETAINED).
//   3. RESEED  — the next blown frame reseeds; the retained ring judges it IMPLAUSIBLE (`SEED_IMPLAUSIBLE`), so every
//                frame while the book stays wide is `REFUSE unvalidated` (`book_state_unvalidated`).
//   4. RECOVER — the book goes tight again and MOVES; once the chain's ring is mostly tight and the book has moved twice
//                inside its plausible run, `SEED_ESCAPED` ends the chain; the escape seed validates on the next
//                two-sided frame (which still refuses on its pre-advance snapshot), and the frame after that acts.
//   5. DECIDE  — the recovered mark is BELOW the stop ⇒ the real evaluator decides `stop_hit` ⇒ the engine calls
//                `closePosition` (a stub capturing its arguments — the real close path's fill contract could refuse,
//                which would let the negative arm pass for the wrong reason).
// Negative arm: the book never recovers ⇒ `closePosition` is never called; the yield alert was captured.
// Control arm: the SAME frames with the arm OFF (`spreadBlownEnabled: false`, the production value today) ⇒ the first
//   blown frame reads `two_sided`, is acted on, and fires a stop on the blown book's mark — the MDB false stop. This is
//   what makes the positive arm's refusals attributable to the arm and not to something else in the harness.
//
// ── WHAT IS MOCKED, AND WHY (everything else — the tracker, the predicate, the staleness ceiling, the transactable-sides
//    predicate, the frame-line builder, `evaluateTECExit` — runs real) ──
//   - `equity-spot-archiver.getLatestEquityTick`: THE FRAME SOURCE. Returns the current frame to BOTH readers (the
//     engine's mark read and the tracker's `assessBookStateNow`), exactly as the one in-memory tick store does.
//   - `book-state-config.resolveBookStateConfigSync`: THE CONFIG SEAM the tracker reads (it calls this function, and
//     the engine only ever sees `_bs.cfg`). Returns a full `BookStateConfig` with small `hollowSkipCap`/window.
//   - `mark-staleness-config` readers + `sigma-rate-cache` (`getCachedSigma`, `ensureSigmaFresh`): module_constants and
//     a DB aggregate. The ceiling itself (`computeStalenessCeiling`) is REAL; the tick is stamped `Date.now()`, so the
//     mark is ~0 ms old against a 10 s floor and clears it on every frame (including below the stop, where the policy
//     collapses to the floor).
//   - `trailing-exit-controller.resolveTECConfig`: the per-class TEC cache is primed from the DB at boot; unprimed it
//     throws `TEC_CACHE_MISS_FATAL`. Only this one export is replaced. ⚠️ CONSEQUENCE, STATED: the position carries no
//     `atr_at_open`, so the REAL evaluator takes its ATR-floor branch (hard stop/target on the trigger) rather than the
//     trailing state machine, whose internal config reads the mock cannot reach. The stop decision is still the real
//     evaluator's; what is not exercised here is the trailing machine's own stop.
//   - `storage` (`getActiveOpenPositions`, `updateActiveOpenPosition`): the DB.
//   - `system-alerts.addAlert`: the alert queue (captured, asserted).
//   - `priceCache.setReasonMembers`, `livePricingAdapter.updateCache`: shared caches with refresh machinery (spied to
//     no-ops; neither is a decision input on this path).
//   - on the stub `this`: `_recordPriceSkip`, `_recordBookStateEvent` (DB writes + the skip-rail's own alerting),
//     `closePosition` (see step 5). `checkExitConditions`, `_sigmaCacheCfg` and `isMaxHoldEnabled` are the REAL
//     prototype methods.
//
// Mutation checks run by hand while writing this file (code restored afterwards; see the report):
//   - `assessBookStateNow` forced to `{ ok:false, reason:'disabled' }` (the guard-off arm) ⇒ the positive test goes RED
//     (no SKIP/YIELD/REFUSE lines; the blown frame's mark fires the stop).
//   - the escape forced never to fire ⇒ the positive test goes RED (no `SEED_ESCAPED`; `closePosition` never called).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Frame = { bid: number; ask: number; last: number | null };

const h = vi.hoisted(() => ({
  frame: null as null | { bid: number; ask: number; last: number | null },
  spreadBlownEnabled: true,
  addAlert: vi.fn(async (_a: unknown) => undefined),
  getActiveOpenPositions: vi.fn(async (_mode: string) => [] as unknown[]),
  updateActiveOpenPosition: vi.fn(async () => undefined),
}));

vi.mock('../../services/system-alerts.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), addAlert: h.addAlert }));
vi.mock('../../storage', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    storage: new Proxy(real.storage ?? {}, {
      get(target, prop) {
        if (prop === 'getActiveOpenPositions') return h.getActiveOpenPositions;
        if (prop === 'updateActiveOpenPosition') return h.updateActiveOpenPosition;
        return (target as any)[prop];
      },
    }),
  };
});
vi.mock('../../services/passive-archive/equity-spot-archiver.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getLatestEquityTick: (_symbol: string) => {
    const f = h.frame;
    if (!f) return null;
    const now = Date.now();
    return { price: (f.bid + f.ask) / 2, tsMs: now, kind: 'mid', raw: { bid: f.bid, ask: f.ask, last: f.last, bidQty: 10, askQty: 10, atMs: now } };
  },
}));
vi.mock('../../asset_classes/xstock_spot/book-state-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveBookStateConfigSync: () => ({
    enabled: true,
    kRel: 3,
    floorPct: 1.0,
    otherSideHoldPct: 0.5,
    lastHoldPct: 0.5,
    trailingSpreadWindowSnaps: 5, // ringCap = max(5, window) = 5
    feedReadEnabled: false,
    feedStubFractionF: 0.1,
    feedStubWindowMs: 90_000,
    feedCohortFloor: 50,
    hollowSkipCap: 3,
    ownMarkDeviationDPct: 5,
    riAbsSpreadCeilingPct: 1.0,
    spreadBlownEnabled: h.spreadBlownEnabled,
  }),
}));
vi.mock('../../asset_classes/xstock_spot/mark-staleness-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readXstockMarkStalenessConfig: () => ({ budgetK: 0.5, nullStopBudgetPct: 0.005, floorMs: 10_000, capMs: 90_000, sigmaFullCreditMs: 60_000 }),
  readXstockSigmaCacheConfig: () => ({ windowMs: 3_600_000, refreshAfterMs: 60_000, maxAgeMs: 600_000, minObservations: 30, classwidePercentile: 0.9, queryTimeoutMs: 5_000 }),
}));
vi.mock('../../asset_classes/xstock_spot/sigma-rate-cache.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getCachedSigma: () => ({ sigmaRatePerSec: 1e-5, ageMs: 0, source: 'test' }),
  ensureSigmaFresh: () => ({ enqueued: 0, classwide: false }),
}));
vi.mock('../../services/trailing-exit-controller.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveTECConfig: () => ({ breakEvenTriggerR: 1.0, targetLockR: 1.5, trailDistanceAtrMultiplier: 1.0 }),
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import { VenueQuietState } from '../../services/venue-quiet-alerting.js';
import { priceCache } from '../../services/price-cache';
import { livePricingAdapter } from '../../services/live-pricing-adapter';
import { _resetBookStateComparatorsForTest, _peekRetainedRingForTest, readBookStateComparator } from '../../asset_classes/xstock_spot/book-state-tracker.js';

const SYMBOL = 'MDB/USD';
const STOP = 385;
const TARGET = 440;

// ── THE FRAMES ──
// WARM: ~400, 0.80 wide (0.20 %), both sides step +0.05 each frame so the chain OBSERVES MOVEMENT (a chain that never
// moved never retains its ring — `retainsRing`, r5).
const WARM: Frame[] = [0, 1, 2, 3, 4, 5].map((i) => ({ bid: 399.6 + 0.05 * i, ask: 400.4 + 0.05 * i, last: 400 }));
// BLOWOUT: symmetric outward — bid 320.00 / ask 445.00, spread 32.7 %, mid 382.50. Against the last warm frame the mid
// moved only −4.4 % (inside own_mark_deviation 5 %) and neither side HELD, so arms (i) and (iii) both pass: with the arm
// OFF this frame reads `two_sided`. ⚠️ Its mid sits BELOW the stop on purpose, so an unguarded evaluator WOULD fire.
const BLOWN: Frame = { bid: 320.0, ask: 445.0, last: 400 };
// RECOVERY: tight again (0.80 wide, 0.21 %), BELOW the stop, stepping −0.10 so every frame is a move.
const RECOVER: Frame[] = [0, 1, 2, 3, 4].map((i) => ({ bid: 379.6 - 0.1 * i, ask: 380.4 - 0.1 * i, last: 380 }));

const mid = (f: Frame) => (f.bid + f.ask) / 2;

function makePosition() {
  return {
    id: 'pos-MDB-chain',
    symbol: SYMBOL,
    assetClass: 'xstock_spot',
    strategyName: 'test_strategy',
    side: 'buy',
    state: 'open',
    quantity: '1',
    avgPrice: '400',
    entryPrice: '400',
    stopLoss: String(STOP),
    takeProfit: String(TARGET),
    openedAt: new Date(Date.now() - 3_600_000),
    // No `atr_at_open` ⇒ the real evaluator's ATR-floor branch (see header).
    metadata: {},
  };
}

type Stub = Record<string, any>;
function makeEngine(): Stub {
  const proto = ActiveExecutionEngine.prototype as unknown as Stub;
  const eng: Stub = Object.create(proto);
  Object.assign(eng, {
    mode: 'paper',
    lastEvaluateAt: 0,
    lastExitChecks: [],
    lastCycleAt: 0,
    lastPriceTickTime: new Map<string, number>(),
    priceTickLogs: [],
    MAX_PRICE_TICK_LOGS: 100,
    _bookStateSkipStreak: new Map<string, number>(),
    _priceSkipStreak: new Map<string, number>(),
    _priceSkipReasons: new Map<string, Map<string, number>>(),
    _noTriggerStreak: new Map<string, number>(),
    _exitEvalInvoked: 0,
    _noTriggerRefusals: 0,
    _exitEvalNoHit: 0,
    _exitEvalHit: 0,
    _exitEvalNoMark: 0,
    _venueMarkNonFinite: 0,
    _exitEvalByClass: { crypto: { invoked: 0, refused: 0 }, xstock: { invoked: 0, refused: 0 }, other: { invoked: 0, refused: 0 } },
    _xsBidDivergence: new Map(),
    _xsFramesEmitted: 0,
    _xsFrameClassMismatch: 0,
    _entryFillLooks: 0,
    _entryFillRefusedFirstLook: 0,
    _entryFillRefusedSteady: 0,
    _entryFillLooked: new Set<string>(),
    // B-VENUE-QUIET-ALERTING (row 3a1) fields the real constructor sets: the streak reset notes the venue price, and the
    // post-cycle sweep is held off by its throttle (this test drives the exit loop, not the alert sweep).
    _priceSkipEscalated: new Set<string>(),
    _venueQuiet: new VenueQuietState(),
    _lastVenueQuietSweepAt: Date.now(),
    // B-XSTOCK-BID-TRIGGER-RELAND increment A (P5) fields the real constructor sets.
    _exitRefusalTally: new Map(),
    _riMissSig: new Map<string, string>(),
    _riMissAcc: new Map(),
    _engineConstructedAt: 0,
    // B-XSTOCK-BID-TRIGGER-RELAND increment C fields the real constructor sets.
    _venuePauseExitTicks: 0,
    _venuePauseWouldFire: 0,
    _venuePauseBidWouldFire: 0,
    _venuePauseEntriesRefused: 0,
    _venuePausePending: new Map(),
    // Stubbed on the instance (see header).
    _recordPriceSkip: vi.fn(async (..._a: unknown[]) => undefined),
    _recordBookStateEvent: vi.fn(async (..._a: unknown[]) => undefined),
    closePosition: vi.fn(async (..._a: unknown[]) => undefined),
  });
  // Instrument control: the two methods under test are the REAL prototype methods, not stubs.
  expect(eng.checkExitConditions).toBe(proto.checkExitConditions);
  expect(eng.checkOpenPositions).toBe(proto.checkOpenPositions);
  expect(typeof proto.checkOpenPositions).toBe('function');
  return eng;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

type TickOut = {
  warns: string[];
  logs: string[];
  errors: string[];
  priceSkips: string[];
  bookEvents: Array<{ kind: string; streak: number; reasons: string[] }>;
  closes: unknown[][];
  alerts: number;
};

/** One exit-monitor tick on `frame`: returns everything that tick produced. */
async function tick(eng: Stub, frame: Frame): Promise<TickOut> {
  h.frame = frame;
  const w0 = warnSpy.mock.calls.length, l0 = logSpy.mock.calls.length, e0 = errSpy.mock.calls.length;
  const s0 = eng._recordPriceSkip.mock.calls.length, b0 = eng._recordBookStateEvent.mock.calls.length;
  const c0 = eng.closePosition.mock.calls.length, a0 = h.addAlert.mock.calls.length;
  await (eng.checkOpenPositions as () => Promise<void>).call(eng);
  const str = (c: unknown[]) => c.map((x) => (typeof x === 'string' ? x : x instanceof Error ? x.message : JSON.stringify(x))).join(' ');
  return {
    warns: warnSpy.mock.calls.slice(w0).map(str),
    logs: logSpy.mock.calls.slice(l0).map(str),
    errors: errSpy.mock.calls.slice(e0).map(str),
    priceSkips: eng._recordPriceSkip.mock.calls.slice(s0).map((c: unknown[]) => c[1] as string),
    bookEvents: eng._recordBookStateEvent.mock.calls.slice(b0).map((c: unknown[]) => c[1] as { kind: string; streak: number; reasons: string[] }),
    closes: eng.closePosition.mock.calls.slice(c0),
    alerts: h.addAlert.mock.calls.length - a0,
  };
}

const has = (lines: string[], re: RegExp) => lines.some((l) => re.test(l));
const count = (lines: string[], re: RegExp) => lines.filter((l) => re.test(l)).length;
const XS_FRAME = /^\[3n\.q7\]\[XS_FRAME\] MDB\/USD /;
const SKIP = /\[BOOK_STATE\] MDB\/USD SKIP hollow /;
const YIELD = /\[BOOK_STATE\] MDB\/USD YIELD after /;
const REFUSE = /\[BOOK_STATE\] MDB\/USD REFUSE unvalidated /;
const SEED_IMPLAUSIBLE = /\[BOOK_STATE\] MDB\/USD SEED_IMPLAUSIBLE /;
const SEED_ESCAPED = /\[8a-P4a\]\[BOOK_STATE\] MDB\/USD SEED_ESCAPED /;

/** A tick that reached the evaluator: one frame line, no guard verdict line, no skip recorded. */
function expectEvaluated(t: TickOut, frame: Frame, markExit: 'y' | 'n') {
  expect(count(t.warns, XS_FRAME)).toBe(1);
  const line = t.warns.find((l) => XS_FRAME.test(l))!;
  expect(line).toContain('frame=ok basis=raw_guarded');
  expect(line).toContain(`mark=${mid(frame)}`);
  expect(line).toContain(`bid=${frame.bid} ask=${frame.ask}`);
  expect(line).toContain(`markExit=${markExit}`);
  for (const re of [SKIP, YIELD, REFUSE, SEED_IMPLAUSIBLE]) expect(has(t.warns, re)).toBe(false);
  expect(t.priceSkips).toEqual([]);
  expect(t.bookEvents).toEqual([]);
}

/** A tick refused by the unvalidated gate: no frame line, one REFUSE with the given state, `book_state_unvalidated`. */
function expectRefused(t: TickOut, state: 'unknown' | 'two_sided') {
  expect(count(t.warns, XS_FRAME)).toBe(0);
  expect(count(t.warns, REFUSE)).toBe(1);
  expect(t.warns.find((l) => REFUSE.test(l))).toContain(`state=${state} validated=`);
  expect(t.priceSkips).toEqual(['book_state_unvalidated']);
  expect(t.closes).toEqual([]);
}

/** Warm the book: seed (REFUSE unknown), validate (REFUSE two_sided on the pre-advance snapshot), then act ×4. */
async function warm(eng: Stub) {
  const t1 = await tick(eng, WARM[0]);
  expect(has(t1.logs, /COMPARATOR_SEEDED/)).toBe(true);
  expectRefused(t1, 'unknown');
  expect(t1.warns.find((l) => REFUSE.test(l))).toContain('reasons=no_comparator');
  const t2 = await tick(eng, WARM[1]);
  expectRefused(t2, 'two_sided');
  expect(t2.warns.find((l) => REFUSE.test(l))).toContain('validated=false');
  expect(readBookStateComparator(SYMBOL)?.validated).toBe(true); // the W2 advance validated the chain
  for (const f of WARM.slice(2)) {
    const t = await tick(eng, f);
    expectEvaluated(t, f, 'n');
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain('tb=v'); // the cold chain seeded vacuously
    expect(t.closes).toEqual([]);
  }
  const cmp = readBookStateComparator(SYMBOL)!;
  expect(cmp.observedMovement).toBe(true);
  expect(cmp.spreads).toHaveLength(5);
}

/** The blowout up to and including the yield (cap 3): SKIP 1/3, SKIP 2/3, YIELD. */
async function blowoutToYield(eng: Stub) {
  for (const n of [1, 2]) {
    const t = await tick(eng, BLOWN);
    expect(count(t.warns, SKIP)).toBe(1);
    const line = t.warns.find((l) => SKIP.test(l))!;
    expect(line).toContain(`streak=${n}/3`);
    expect(line).toContain('reasons=spread_blown');
    expect(t.bookEvents).toEqual([expect.objectContaining({ kind: 'skip', streak: n, reasons: ['spread_blown'] })]);
    expect(count(t.warns, XS_FRAME)).toBe(0);
    expect(t.priceSkips).toEqual([]);
    expect(t.alerts).toBe(0);
    expect(t.closes).toEqual([]);
  }
  const ty = await tick(eng, BLOWN);
  expect(count(ty.warns, YIELD)).toBe(1);
  expect(ty.warns.find((l) => YIELD.test(l))).toMatch(/YIELD after 3 hollow ticks \(cap 3\) reasons=spread_blown/);
  expect(has(ty.warns, /COMPARATOR_CLEARED reason=yield_after_3_hollow validated=true .*observedMovement=true ringAfter=true/)).toBe(true);
  expect(ty.alerts).toBe(1);
  const alert = h.addAlert.mock.calls.at(-1)![0] as { title: string; dedupe_key: string; category: string };
  expect(alert.title).toBe('Hollow book held MDB/USD for 3 ticks — exit evaluation YIELDED');
  expect(alert.dedupe_key).toBe('book-state-hollow-paper-MDB/USD');
  expect(ty.bookEvents).toEqual([expect.objectContaining({ kind: 'yield', streak: 3, reasons: ['spread_blown'] })]);
  expect(ty.priceSkips).toEqual(['book_state_yield_refused']);
  expect(count(ty.warns, XS_FRAME)).toBe(0);
  expect(ty.closes).toEqual([]);
  // The healthy chain's ring was RETAINED — the outside datum the next seed is judged against.
  expect(readBookStateComparator(SYMBOL)).toBeNull();
  const ring = _peekRetainedRingForTest(SYMBOL)!;
  expect(ring).not.toBeNull();
  expect(ring.spreads).toHaveLength(5);
  expect(ring.seedBasis).toBe('vacuous');
}

/** The reseed while the book stays wide: SEED_IMPLAUSIBLE + REFUSE (unknown), then REFUSE (two_sided) × n. */
async function wideReseed(eng: Stub, extraWideFrames: number) {
  const ts = await tick(eng, BLOWN);
  expect(count(ts.warns, SEED_IMPLAUSIBLE)).toBe(1);
  expectRefused(ts, 'unknown');
  expect(has(ts.warns, /REFUSAL_BASIS seedImplausible=true /)).toBe(true);
  expect(readBookStateComparator(SYMBOL)?.seedImplausible).toBe(true);
  expect(_peekRetainedRingForTest(SYMBOL)).not.toBeNull(); // an implausible seed does NOT consume the ring (r4)
  for (let i = 0; i < extraWideFrames; i++) {
    const t = await tick(eng, BLOWN);
    expectRefused(t, 'two_sided');
    expect(has(t.warns, SKIP) || has(t.warns, YIELD) || has(t.warns, SEED_ESCAPED)).toBe(false);
    expect(t.alerts).toBe(0);
  }
}

beforeEach(() => {
  // ⛔ row 2 increment C: the exit loop now pauses xStock decisions at the venue's transition minutes, so this file is
  // CALENDAR-DEPENDENT. Pin the clock to an ordinary weekday morning (Wed 2026-10-14 11:00 ET) so a CI run that happens
  // to fall inside a window cannot change what these tests see. Only `Date` is faked; timers and promises run real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
  _resetBookStateComparatorsForTest();
  h.frame = null;
  h.spreadBlownEnabled = true;
  h.getActiveOpenPositions.mockImplementation(async () => [makePosition()]);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(priceCache, 'setReasonMembers').mockImplementation(() => {});
  vi.spyOn(livePricingAdapter, 'updateCache').mockImplementation(() => undefined as any);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  h.addAlert.mockClear();
  h.getActiveOpenPositions.mockReset();
  h.updateActiveOpenPosition.mockClear();
  _resetBookStateComparatorsForTest();
});

describe('3n.q7 inc-2 OBJ-3 — the chain, driven through the real exit loop', () => {
  it('★ warm → symmetric blowout (SKIP, SKIP, YIELD) → implausible reseed (REFUSE) → recovery + SEED_ESCAPED → stop decided on the recovered mark', async () => {
    const eng = makeEngine();
    await warm(eng);
    await blowoutToYield(eng);
    await wideReseed(eng, 2);

    // ── RECOVERY. R1, R2: tight and moving, still judged by the implausible chain ⇒ REFUSE (and the mark is BELOW the
    // stop the whole time: the refusal is what holds the position, not the price).
    for (const f of RECOVER.slice(0, 2)) {
      const t = await tick(eng, f);
      expectRefused(t, 'two_sided');
      expect(has(t.warns, SEED_ESCAPED)).toBe(false);
    }
    expect(readBookStateComparator(SYMBOL)?.plausibleRunMoves).toBe(2);

    // R3: the chain's ring is now mostly tight and the book has moved ≥2× in its plausible run ⇒ SEED_ESCAPED; the new
    // chain seeds on R3, consumes the retained ring, and — seeded BY an escape — does not validate on its own seed frame.
    const t3 = await tick(eng, RECOVER[2]);
    expect(count(t3.warns, SEED_ESCAPED)).toBe(1);
    expect(t3.warns.find((l) => SEED_ESCAPED.test(l))).toMatch(/runMoves=3 /);
    expect(has(t3.warns, /COMPARATOR_CLEARED reason=seed_escape_recovered /)).toBe(true);
    expect(has(t3.logs, /COMPARATOR_SEEDED/)).toBe(true);
    expectRefused(t3, 'two_sided');
    expect(has(t3.warns, /REFUSAL_BASIS seedImplausible=false /)).toBe(true); // the NEW chain's first refusal
    const esc = readBookStateComparator(SYMBOL)!;
    expect(esc.seedImplausible).toBe(false);
    expect(esc.validated).toBe(false);
    expect(_peekRetainedRingForTest(SYMBOL)).toBeNull(); // a plausible seed consumed the ring

    // R4: the next two_sided frame VALIDATES the chain — but refuses on its pre-advance snapshot (two ticks, FINDING-3).
    const t4 = await tick(eng, RECOVER[3]);
    expectRefused(t4, 'two_sided');
    expect(readBookStateComparator(SYMBOL)?.validated).toBe(true);

    // R5: validated ⇒ the evaluator runs on the recovered mark, which is below the stop ⇒ stop ⇒ closePosition.
    const R5 = RECOVER[4];
    const t5 = await tick(eng, R5);
    expectEvaluated(t5, R5, 'y');
    expect(t5.warns.find((l) => XS_FRAME.test(l))).toContain('exitReason=stop_hit');
    expect(t5.warns.find((l) => XS_FRAME.test(l))).toContain('bidWouldFire=stop');
    expect(has(t5.logs, /\[EXIT_TRIGGER\] symbol=MDB\/USD type=stop_hit trigger=/)).toBe(true);
    expect(t5.closes).toHaveLength(1);
    const [positionId, requestedPrice, exitCondition, priceSource, opts] = t5.closes[0] as [string, number, any, string, any];
    expect(positionId).toBe('pos-MDB-chain');
    expect(requestedPrice).toBe(mid(R5));
    expect(requestedPrice).toBeLessThan(STOP);
    expect(exitCondition).toMatchObject({ type: 'stop_hit', price: mid(R5) });
    expect(priceSource).toBe('kraken_equities_ws');
    expect(opts.exitProvenance).toMatchObject({
      decisionPrice: mid(R5),
      bookStateAtDecision: 'two_sided',
      bookStateYielded: false,
      producer: 'kraken_equities_ws_mid',
      source: 'kraken_equities_ws',
    });

    // Across the whole run: exactly one close, exactly one alert (the yield), and the frame population reconciled.
    expect(eng.closePosition).toHaveBeenCalledTimes(1);
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).filter((l) => /RECONCILE_BROKEN|PARTITION_BROKEN|Error checking position/.test(l))).toEqual([]);
  });

  it('NEGATIVE: the book never recovers ⇒ closePosition is never called; the yield alert was captured', async () => {
    const eng = makeEngine();
    await warm(eng);
    await blowoutToYield(eng);
    // Twenty more ticks on the blown book (mid 382.50, BELOW the stop 385): every one refuses, none yields again,
    // none escapes, and nothing reaches the evaluator.
    await wideReseed(eng, 20);
    expect(eng.closePosition).not.toHaveBeenCalled();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect((h.addAlert.mock.calls[0][0] as { dedupe_key: string }).dedupe_key).toBe('book-state-hollow-paper-MDB/USD');
    expect(mid(BLOWN)).toBeLessThan(STOP); // non-vacuous: an unguarded evaluator WOULD have fired on this mark
    expect(readBookStateComparator(SYMBOL)?.validated).toBe(false);
    expect(errSpy.mock.calls.map((c) => String(c[0])).filter((l) => /RECONCILE_BROKEN|PARTITION_BROKEN|Error checking position/.test(l))).toEqual([]);
  });

  it('CONTROL: the same frames with the arm OFF — the first blown frame reads two_sided and fires the stop on its mark (the MDB false stop)', async () => {
    h.spreadBlownEnabled = false;
    const eng = makeEngine();
    await warm(eng);
    const t = await tick(eng, BLOWN);
    for (const re of [SKIP, YIELD, REFUSE, SEED_IMPLAUSIBLE]) expect(has(t.warns, re)).toBe(false);
    expect(count(t.warns, XS_FRAME)).toBe(1);
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain('markExit=y');
    expect(t.closes).toHaveLength(1);
    const [, requestedPrice, exitCondition, , opts] = t.closes[0] as [string, number, any, string, any];
    expect(exitCondition.type).toBe('stop_hit');
    expect(requestedPrice).toBe(mid(BLOWN));
    expect(opts.exitProvenance).toMatchObject({ decisionPrice: mid(BLOWN), bookStateAtDecision: 'two_sided' });
  });
});

describe('row 2 increment C (C-P2, Langston Step 4 C1) — the venue-transition pause, driven through the real exit loop', () => {
  const PAUSE = /\[VENUE_PAUSE\] MDB\/USD /;
  const RESUMED = /\[VENUE_PAUSE_RESUMED\] MDB\/USD /;
  it('a paused tick decides nothing, records no skip, closes nothing, still advances the guard; the bid arm is counted; the first tick after decides', async () => {
    // A stop just under the warm book, so the BID crosses it while the MARK does not (the C2 case).
    h.getActiveOpenPositions.mockImplementation(async () => [{ ...makePosition(), stopLoss: '400.0' }]);
    const eng = makeEngine();
    await warm(eng);
    const framesBefore = readBookStateComparator(SYMBOL)!.framesSinceSeed;

    vi.setSystemTime(new Date('2026-10-14T20:20:00Z')); // Wed 16:20 ET — inside the 16:15 window
    const t1 = await tick(eng, { bid: 399.9, ask: 400.7, last: 400 }); // mark 400.3 > stop; bid 399.9 <= stop
    expect(t1.closes).toEqual([]);
    expect(t1.priceSkips).toEqual([]);
    expect(t1.alerts).toBe(0);
    expect(count(t1.warns, XS_FRAME)).toBe(0); // the exit decision did not run
    const p1 = t1.warns.filter((l) => PAUSE.test(l));
    expect(p1).toHaveLength(1);
    expect(p1[0]).toContain('window=16:15');
    expect(p1[0]).toContain('wouldFire=none');
    expect(p1[0]).toContain('bidWouldFire=stop');
    expect(readBookStateComparator(SYMBOL)!.framesSinceSeed).toBe(framesBefore + 1); // the guard still advanced
    expect(eng._venuePauseExitTicks).toBe(1);
    expect(eng._venuePauseBidWouldFire).toBe(1);
    expect(eng._venuePauseWouldFire).toBe(0);
    expect(eng._venuePausePending.size).toBe(1);

    const t2 = await tick(eng, { bid: 399.95, ask: 400.75, last: 400 });
    expect(t2.warns.filter((l) => PAUSE.test(l))).toHaveLength(0); // one line per position per window
    expect(t2.closes).toEqual([]);
    expect(eng._venuePauseExitTicks).toBe(2);

    vi.setSystemTime(new Date('2026-10-14T20:40:00Z')); // 16:40 ET — the window has ended
    const f3: Frame = { bid: 400.0, ask: 400.8, last: 400 };
    const t3 = await tick(eng, f3);
    const r = t3.warns.filter((l) => RESUMED.test(l));
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('window=16:15');
    expect(r[0]).toContain('pausedS=1200');
    expect(r[0]).toContain('bidWouldFireDuring=stop');
    expectEvaluated(t3, f3, 'n');
    expect(eng._venuePausePending.size).toBe(0);
  });

  it('CONTROL: the same tick outside a window is decided, with no pause line', async () => {
    h.getActiveOpenPositions.mockImplementation(async () => [{ ...makePosition(), stopLoss: '400.0' }]);
    const eng = makeEngine();
    await warm(eng);
    const f: Frame = { bid: 399.9, ask: 400.7, last: 400 };
    const t = await tick(eng, f);
    expect(t.warns.filter((l) => PAUSE.test(l))).toHaveLength(0);
    expectEvaluated(t, f, 'n');
    expect(eng._venuePauseExitTicks).toBe(0);
  });
});
