// B-XSTOCK-BID-TRIGGER-RELAND (`3n.q7`) increment 2 — OBJ-3: THE CHAIN TEST.
//
// Drives the REAL `ActiveExecutionEngine.prototype.checkOpenPositions` and the REAL `checkExitConditions` on a stub
// `this`, for ONE held xStock paper position, through a frame sequence, with the REAL book-state tracker and the REAL
// book-state predicate (`spreadBlownEnabled: true` injected through the config seam):
//   1. WARM    — a normal two-sided book that moves; the comparator seeds, validates, and the evaluator runs (no exit).
//   2. BLOWOUT — a SYMMETRIC widening (both sides move OUT, the mid stays near fair: the MDB/USD 2026-09-19 00:15Z
//                shape). It reads `hollow/spread_blown` ⇒ SKIP, SKIP, then YIELD at `hollow_skip_cap` (NO alert — row 2
//                objective 6: a spread_blown-only hold pages nobody; `book_state_yield_refused` recorded; comparator cleared).
//   3. STILL WIDE — row 2 objective 6 made the arm ABSOLUTE and comparator-independent, so a wide frame with the reference
//                gone is STILL `hollow/spread_blown`: it never seeds on the blown book and the hold simply continues.
//   4. RECOVER — the first TIGHT frame has no reference ⇒ `no_comparator` ⇒ it seeds on the plausible book and refuses
//                (unvalidated); the next validates (still refusing on its pre-advance snapshot); the third acts.
//   5. DECIDE  — the recovered mark is BELOW the stop ⇒ the real evaluator decides `stop_hit` ⇒ the engine calls
//                `closePosition` (a stub capturing its arguments — the real close path's fill contract could refuse,
//                which would let the negative arm pass for the wrong reason).
// Negative arm: the book never recovers ⇒ `closePosition` is never called, the comparator is never seeded, nothing pages.
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
  guardEnabled: true, // row 2 (4b) P4 (c): the book-state guard's own switch, for the `guard_off` arm
  addAlert: vi.fn(async (_a: unknown) => undefined),
  getActiveOpenPositions: vi.fn(async (_mode: string) => [] as unknown[]),
  updateActiveOpenPosition: vi.fn(async () => undefined),
  // row 33 P1b: the mark's age and `observed` flag, so a COLD mark (a subscribe replay) can be driven. null/undefined =
  // the default fresh, observed mark every earlier test in this file was written against (`observed` is required on
  // the real tick; the harness states it).
  markTsMs: null as number | null,
  markObserved: undefined as boolean | undefined,
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
    return { price: (f.bid + f.ask) / 2, tsMs: h.markTsMs ?? now, kind: 'mid', raw: { bid: f.bid, ask: f.ask, last: f.last, bidQty: 10, askQty: 10, atMs: now }, observed: h.markObserved ?? true };
  },
}));
vi.mock('../../asset_classes/xstock_spot/book-state-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveBookStateConfigSync: () => ({
    enabled: h.guardEnabled,
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
  readXstockColdMarkMaxMs: () => 15_000, // row 33 P1b
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
import { restRateLimiter } from '../../services/market-data/rest-rate-limiter.js';
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
    _spreadBlownSkipAcc: new Map(), // row 2 objective 6, Step 4 (the spread_blown SKIP summary)
    _xsSizeCounts: { x1Short: 0, x1Unknown: 0, x2Short: 0, x2Unknown: 0, trigShort: 0, trigUnknown: 0, invalidQty: 0, closeCrossedWalks: 0 }, _xsInvalidQtyPaged: new Set(), // row 2 increment B (P3/P7)
    _xsSizeWindow: { startMs: Date.now(), n: 0, unknown: 0 }, // row 2 increment B (the size tripwire)
    _engineConstructedAt: 0,
    // B-XSTOCK-BID-TRIGGER-RELAND increment C fields the real constructor sets.
    _venuePauseExitTicks: 0,
    _venuePauseWouldFire: 0,
    _venuePauseBidWouldFire: 0,
    _venuePauseEntriesRefused: 0,
    _venuePausePending: new Map(),
    // B-PRICE-STALENESS-BOUND (row 33) P1b fields the real constructor sets.
    _coldMarkTicks: 0,
    _coldMarkPending: new Map(),
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
// ⛔ Row 2 increment B (P1, P8b): with the guard ON and `spread_blown` ON (this harness's default) the BID decides, and the
//   frame line prints the decision as `bidExit=` with `on=bid`; with either switch off it is `markExit=` with `on=mark`.
function expectEvaluated(t: TickOut, frame: Frame, exit: 'y' | 'n', on: 'bid' | 'mark' = 'bid') {
  expect(count(t.warns, XS_FRAME)).toBe(1);
  const line = t.warns.find((l) => XS_FRAME.test(l))!;
  expect(line).toContain('frame=ok basis=raw_guarded');
  expect(line).toContain(`mark=${mid(frame)}`);
  expect(line).toContain(`bid=${frame.bid} ask=${frame.ask}`);
  expect(line).toContain(`${on === 'bid' ? 'bidExit' : 'markExit'}=${exit}`);
  expect(line).toContain(` on=${on}`);
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
async function warm(eng: Stub, on: 'bid' | 'mark' = 'bid') {
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
    expectEvaluated(t, f, 'n', on);
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain('tb=v'); // the cold chain seeded vacuously
    expect(t.closes).toEqual([]);
  }
  const cmp = readBookStateComparator(SYMBOL)!;
  expect(cmp.observedMovement).toBe(true);
  expect(cmp.spreads).toHaveLength(5);
}

/** The blowout up to and including the yield (cap 3): SKIP 1/3 (printed), SKIP 2/3 (counted, not printed), YIELD. */
async function blowoutToYield(eng: Stub) {
  for (const n of [1, 2]) {
    const t = await tick(eng, BLOWN);
    // Row 2 objective 6, Step 4 (Coltrane send-back 2 / Langston JC2): a spread_blown run prints its FIRST SKIP line; later
    // ticks are COUNTED, not printed, and summarised when the run ends. The tally and the event record still see every tick.
    expect(count(t.warns, SKIP)).toBe(n === 1 ? 1 : 0);
    if (n === 1) {
      const line = t.warns.find((l) => SKIP.test(l))!;
      expect(line).toContain(`streak=${n}/3`);
      expect(line).toContain('reasons=spread_blown');
      expect(line).toContain('spread_blown run: further ticks are counted');
    }
    expect((eng as any)._exitRefusalTally.get('pos-MDB-chain')?.spreadBlownTicks).toBe(n);
    expect(t.bookEvents).toEqual([expect.objectContaining({ kind: 'skip', streak: n, reasons: ['spread_blown'] })]);
    expect(count(t.warns, XS_FRAME)).toBe(0);
    expect(t.priceSkips).toEqual([]);
    expect(t.alerts).toBe(0);
    expect(t.closes).toEqual([]);
  }
  const ty = await tick(eng, BLOWN);
  expect(count(ty.warns, YIELD)).toBe(1);
  // the run's summary is FLUSHED at the yield: one suppressed tick (SKIP 2/3), with its spread range
  expect(ty.warns.filter((l) => /SPREAD_BLOWN_SKIPS pos=pos-MDB-chain at=yield suppressedTicks=1 suppressedMinSpread=0\.\d{5} suppressedMaxSpread=0\.\d{5}/.test(l))).toHaveLength(1);
  expect((eng as any)._exitRefusalTally.get('pos-MDB-chain')?.spreadBlownTicks).toBe(3);
  expect(ty.warns.find((l) => YIELD.test(l))).toMatch(/YIELD after 3 hollow ticks \(cap 3\) reasons=spread_blown/);
  expect(has(ty.warns, /COMPARATOR_CLEARED reason=yield_after_3_hollow validated=true .*observedMovement=true ringAfter=true/)).toBe(true);
  // Row 2 objective 6 (objective 9): a yield whose ONLY reason is `spread_blown` is the expected wide-book hold — logged,
  // recorded (bookEvents below) and refused, but it mints NO `book-state-hollow-*` page. (Mutation: drop the
  // `_expectedWideHold` guard in the engine and this reads 1.) The non-spread_blown yield still pages — pinned below.
  expect(ty.alerts).toBe(0);
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
/**
 * Row 2 objective 6 — the blown book AFTER the yield. The arm is ABSOLUTE and runs before `no_comparator`, so a wide frame
 * with the reference gone is STILL `hollow/spread_blown`: it never seeds (no `SEED_IMPLAUSIBLE`, the comparator stays
 * empty), the hold continues (SKIP … YIELD at the cap, again and again), nothing is decided, and nothing pages.
 * (Before objective 6 this frame read `unknown/no_comparator`, seeded ON the blown book, and the exit was later released
 * against that seed — PCAR/USD 2026-10-13.)
 */
async function wideAfterYield(eng: Stub, wideFrames: number) {
  for (let i = 0; i < wideFrames; i++) {
    const t = await tick(eng, BLOWN);
    expect(count(t.warns, XS_FRAME)).toBe(0);
    expect(has(t.warns, SEED_IMPLAUSIBLE)).toBe(false);
    expect(has(t.logs, /COMPARATOR_SEEDED/)).toBe(false);
    expect(readBookStateComparator(SYMBOL)).toBeNull();
    const line = t.warns.find((l) => SKIP.test(l) || YIELD.test(l));
    // a mid-run SKIP is counted, not printed (Step 4): then the event record carries it
    if (line) expect(line).toContain('reasons=spread_blown');
    else expect(t.bookEvents).toEqual([expect.objectContaining({ kind: 'skip', reasons: ['spread_blown'] })]);
    expect(t.alerts).toBe(0);
    expect(t.closes).toEqual([]);
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
  h.markTsMs = null;
  h.markObserved = undefined;
  h.spreadBlownEnabled = true;
  h.guardEnabled = true;
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
  it('★ warm → symmetric blowout (SKIP, SKIP, YIELD) → the hold CONTINUES without ever seeding on the wide book → recovery re-seeds on a TIGHT frame → stop decided on the recovered mark', async () => {
    const eng = makeEngine();
    await warm(eng);
    await blowoutToYield(eng);
    await wideAfterYield(eng, 4); // 4 more blown ticks: SKIP 1/3, SKIP 2/3, YIELD, SKIP 1/3 — all held, none seeded

    // RECOVERY: the first tight frame has no reference ⇒ `no_comparator` ⇒ it SEEDS — on a plausible book — and refuses
    // (an unvalidated chain); the next validates and still refuses on its pre-advance snapshot; the third acts.
    const R1 = RECOVER[0];
    const t1 = await tick(eng, R1);
    expect(has(t1.logs, /COMPARATOR_SEEDED/)).toBe(true);
    expectRefused(t1, 'unknown');
    expect(readBookStateComparator(SYMBOL)?.seedImplausible).toBe(false); // seeded on the TIGHT book, never the blown one
    const t2 = await tick(eng, RECOVER[1]);
    expectRefused(t2, 'two_sided');
    expect(readBookStateComparator(SYMBOL)?.validated).toBe(true);

    const R3 = RECOVER[2];
    const t3 = await tick(eng, R3);
    expectEvaluated(t3, R3, 'y');
    expect(t3.warns.find((l) => XS_FRAME.test(l))).toContain('exitReason=stop_hit');
    expect(has(t3.logs, /\[EXIT_TRIGGER\] symbol=MDB\/USD type=stop_hit trigger=/)).toBe(true);
    expect(t3.closes).toHaveLength(1);
    const [positionId, requestedPrice, exitCondition, priceSource, opts] = t3.closes[0] as [string, number, any, string, any];
    expect(positionId).toBe('pos-MDB-chain');
    expect(requestedPrice).toBe(mid(R3));
    expect(requestedPrice).toBeLessThan(STOP);
    expect(exitCondition).toMatchObject({ type: 'stop_hit', price: mid(R3) });
    expect(priceSource).toBe('kraken_equities_ws');
    expect(opts.exitProvenance).toMatchObject({ decisionPrice: mid(R3), bookStateAtDecision: 'two_sided', bookStateYielded: false });

    // Across the whole run: exactly one close (on the RECOVERED book), NO alert (every hold was spread_blown-only), and
    // the frame population reconciled.
    expect(eng.closePosition).toHaveBeenCalledTimes(1);
    expect(h.addAlert).toHaveBeenCalledTimes(0);
    expect(errSpy.mock.calls.map((c) => String(c[0])).filter((l) => /RECONCILE_BROKEN|PARTITION_BROKEN|Error checking position/.test(l))).toEqual([]);
  });

  it('NEGATIVE: the book never recovers ⇒ closePosition is never called; the spread_blown yield is LOGGED but pages nobody', async () => {
    const eng = makeEngine();
    await warm(eng);
    await blowoutToYield(eng);
    // Twenty more ticks on the blown book (mid 382.50, BELOW the stop 385): every one refuses, none yields again,
    // none escapes, and nothing reaches the evaluator.
    await wideAfterYield(eng, 20);
    expect(eng.closePosition).not.toHaveBeenCalled();
    // Row 2 objective 6 (objective 9): the yield happened and is on the log — but a spread_blown-only hold mints no page.
    expect(warnSpy.mock.calls.map((c) => String(c[0])).some((l) => /YIELD after \d+ hollow ticks .*reasons=spread_blown /.test(l))).toBe(true);
    expect(h.addAlert).toHaveBeenCalledTimes(0);
    expect(mid(BLOWN)).toBeLessThan(STOP); // non-vacuous: an unguarded evaluator WOULD have fired on this mark
    expect(readBookStateComparator(SYMBOL)).toBeNull(); // never seeded on the wide book
    expect(errSpy.mock.calls.map((c) => String(c[0])).filter((l) => /RECONCILE_BROKEN|PARTITION_BROKEN|Error checking position/.test(l))).toEqual([]);
  });

  it('CONTROL: the same frames with the arm OFF — the first blown frame reads two_sided and fires the stop on its mark (the MDB false stop)', async () => {
    h.spreadBlownEnabled = false;
    const eng = makeEngine();
    await warm(eng, 'mark'); // row 2 increment B (P1): spread_blown OFF ⇒ the trigger falls back to the MARK
    const t = await tick(eng, BLOWN);
    for (const re of [SKIP, YIELD, REFUSE, SEED_IMPLAUSIBLE]) expect(has(t.warns, re)).toBe(false);
    expect(count(t.warns, XS_FRAME)).toBe(1);
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain('markExit=y');
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain(' on=mark');
    // Langston Step-2 call 1: the trigger line says WHICH switch left it on the mark — never a silent fall-back.
    expect(has(t.logs, /\[EXIT_TRIGGER\] symbol=MDB\/USD type=stop_hit .* basis=mark reason=spread_blown_off /)).toBe(true);
    expect(t.closes).toHaveLength(1);
    const [, requestedPrice, exitCondition, , opts] = t.closes[0] as [string, number, any, string, any];
    expect(exitCondition.type).toBe('stop_hit');
    expect(requestedPrice).toBe(mid(BLOWN));
    expect(opts.exitProvenance).toMatchObject({ decisionPrice: mid(BLOWN), bookStateAtDecision: 'two_sided' });
  });
});

describe('row 2 (4b) P4 (c) — the GUARD-OFF arm of the mark fallback, through the real exit loop (the fence increment B left)', () => {
  // Increment B fenced only `reason=spread_blown_off` (the CONTROL above). With the book-state guard switched OFF the
  // guard does not judge the book (`assessBookStateNow` → `disabled`), the trigger is NOT armed, and the one exit-trigger
  // rule must take the MARK and say why: `reason=guard_off`. MUTATION: give an unarmed xStock the bid, or drop the
  // reason, and this goes red.
  it('guard OFF ⇒ the blown frame is not judged, the stop fires on the MARK, and the line names guard_off', async () => {
    h.guardEnabled = false;
    const eng = makeEngine();
    const t = await tick(eng, BLOWN);
    for (const re of [SKIP, YIELD, REFUSE]) expect(has(t.warns, re)).toBe(false); // no verdict: the guard did not run
    expect(count(t.warns, XS_FRAME)).toBe(1);
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain('markExit=y');
    expect(t.warns.find((l) => XS_FRAME.test(l))).toContain(' on=mark');
    expect(has(t.logs, /\[EXIT_TRIGGER\] symbol=MDB\/USD type=stop_hit .* basis=mark reason=guard_off /)).toBe(true);
    expect(has(t.logs, /reason=unset/)).toBe(false); // P10: the dead default label is gone
    expect(t.closes).toHaveLength(1);
    const [, requestedPrice, exitCondition] = t.closes[0] as [string, number, any];
    expect(exitCondition.type).toBe('stop_hit');
    expect(requestedPrice).toBe(mid(BLOWN)); // the mark, not the 320 stub bid
  });
});

describe('row 2 increment C (C-P2, Langston Step 4 C1) — the venue-transition pause, driven through the real exit loop', () => {
  const PAUSE = /\[VENUE_PAUSE\] MDB\/USD /;
  const RESUMED = /\[VENUE_PAUSE_RESUMED\] MDB\/USD /;
  it('a paused tick decides nothing, records no skip, closes nothing, still advances the guard; the bid arm is counted; the first tick after decides', async () => {
    // A stop just under the warm book, so the BID crosses it while the MARK does not (the C2 case).
    // ⛔ Row 2 increment B: moved 400.0 → 399.5 — the warm bids (399.60-399.85) would now fire a 400.0 stop on the BID.
    h.getActiveOpenPositions.mockImplementation(async () => [{ ...makePosition(), stopLoss: '399.5' }]);
    const eng = makeEngine();
    await warm(eng);
    const framesBefore = readBookStateComparator(SYMBOL)!.framesSinceSeed;

    vi.setSystemTime(new Date('2026-10-14T20:20:00Z')); // Wed 16:20 ET — inside the 16:15 window
    const t1 = await tick(eng, { bid: 399.4, ask: 400.2, last: 400 }); // mark 399.8 > stop; bid 399.4 <= stop
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

    const t2 = await tick(eng, { bid: 399.45, ask: 400.25, last: 400 });
    expect(t2.warns.filter((l) => PAUSE.test(l))).toHaveLength(0); // one line per position per window
    expect(t2.closes).toEqual([]);
    expect(eng._venuePauseExitTicks).toBe(2);

    vi.setSystemTime(new Date('2026-10-14T20:40:00Z')); // 16:40 ET — the window has ended
    const f3: Frame = { bid: 399.42, ask: 400.22, last: 400 };
    const t3 = await tick(eng, f3);
    const r = t3.warns.filter((l) => RESUMED.test(l));
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('window=16:15');
    expect(r[0]).toContain('pausedS=1200');
    expect(r[0]).toContain('bidWouldFireDuring=stop');
    // Row 2 increment B: the first tick after the window decides ON THE BID — and the bid is through the stop, so it exits.
    expectEvaluated(t3, f3, 'y');
    expect(t3.closes).toHaveLength(1);
    expect(eng._venuePausePending.size).toBe(0);
  });

  it('CONTROL: the same tick outside a window is decided, with no pause line', async () => {
    h.getActiveOpenPositions.mockImplementation(async () => [{ ...makePosition(), stopLoss: '399.5' }]);
    const eng = makeEngine();
    await warm(eng);
    const f: Frame = { bid: 399.4, ask: 400.2, last: 400 };
    const t = await tick(eng, f);
    expect(t.warns.filter((l) => PAUSE.test(l))).toHaveLength(0);
    expectEvaluated(t, f, 'y'); // row 2 increment B: decided on the BID, which is through the stop (the mark is not)
    expect(t.closes).toHaveLength(1);
    expect(eng._venuePauseExitTicks).toBe(0);
  });
});

describe('row 33 B-PRICE-STALENESS-BOUND P1b — a COLD mark (a subscribe replay) through the real exit loop', () => {
  const COLD_CLEARED = /\[EQUITY_MARK_COLD_CLEARED\] MDB\/USD /;
  const COLD_EXPIRED = /\[EQUITY_MARK_COLD_EXPIRED\] MDB\/USD /;

  it('inside the allowance: no decision, no skip, no position or cache write, counted; the first update clears it and the tick proceeds', async () => {
    const eng = makeEngine();
    h.markObserved = false;
    h.markTsMs = Date.now() - 2_000; // replayed 2 s ago; allowance = min(15 s, ceiling >= the 10 s floor)
    const cacheCalls0 = (livePricingAdapter.updateCache as any).mock.calls.length;
    const posCalls0 = h.updateActiveOpenPosition.mock.calls.length;
    const t1 = await tick(eng, WARM[0]);
    expect(t1.priceSkips).toEqual([]);
    expect(t1.closes).toEqual([]);
    expect(t1.alerts).toBe(0);
    expect(count(t1.warns, XS_FRAME)).toBe(0);
    expect(has(t1.logs, /COMPARATOR_SEEDED/)).toBe(false); // the book-state guard sits downstream — never reached
    expect(t1.bookEvents).toEqual([]);
    expect((livePricingAdapter.updateCache as any).mock.calls.length).toBe(cacheCalls0); // condition 3: no display cache
    expect(h.updateActiveOpenPosition.mock.calls.length).toBe(posCalls0);              // condition 3: no current_price
    expect(eng._coldMarkTicks).toBe(1);
    expect(eng._coldMarkPending.size).toBe(1);

    h.markObserved = true; // the first venue UPDATE lands
    h.markTsMs = null;
    const t2 = await tick(eng, WARM[0]);
    const cl = t2.warns.filter((l) => COLD_CLEARED.test(l));
    expect(cl).toHaveLength(1);
    expect(cl[0]).toContain('coldTicks=1 expired=false');
    expect(eng._coldMarkPending.size).toBe(0);
    expectRefused(t2, 'unknown'); // the tick went on to the guard, which seeds as it always does
  });

  it('past the allowance: one stale skip with an honest detail, the expiry line once per episode', async () => {
    const eng = makeEngine();
    h.markObserved = false;
    h.markTsMs = Date.now() - 60_000;
    const t1 = await tick(eng, WARM[0]);
    expect(t1.priceSkips).toHaveLength(1);
    expect(t1.priceSkips[0]).toBe('equity_tick_stale_cold_unobserved'); // its own reason, never a ceiling basis
    const detail = (eng._recordPriceSkip.mock.calls.at(-1) as unknown[])[2] as string;
    expect(detail).toContain('no update since subscribe, ≥60s');
    expect(detail).not.toMatch(/\d{6,}s/); // never the epoch-sized age an unset stamp would print
    expect(count(t1.warns, COLD_EXPIRED)).toBe(1);
    expect(t1.closes).toEqual([]);
    const t2 = await tick(eng, WARM[0]);
    expect(t2.priceSkips).toHaveLength(1);
    expect(count(t2.warns, COLD_EXPIRED)).toBe(0);
    expect(eng._coldMarkTicks).toBe(0);
  });

  it('condition 1: a cold tick touches neither the streak increment nor its reset; CONTROL: an observed tick resets it', async () => {
    h.getActiveOpenPositions.mockImplementation(async () => [{ ...makePosition(), stopLoss: '380.0' }]);
    const eng = makeEngine();
    await warm(eng);
    const id = makePosition().id;
    eng._priceSkipStreak.set(id, 7);
    h.markObserved = false;
    h.markTsMs = Date.now() - 1_000;
    const t1 = await tick(eng, { bid: 400.0, ask: 400.8, last: 400 });
    expect(t1.priceSkips).toEqual([]);
    expect(eng._priceSkipStreak.get(id)).toBe(7);
    h.markObserved = true;
    h.markTsMs = null;
    const f: Frame = { bid: 400.05, ask: 400.85, last: 400 };
    const t2 = await tick(eng, f);
    expectEvaluated(t2, f, 'n');
    expect(eng._priceSkipStreak.has(id)).toBe(false);
  });
});

describe('row 33 B-PRICE-STALENESS-BOUND P4 (8g) — the crypto exit age check, through the real exit loop', () => {
  const REFUSED = /\[EXIT_AGE_REFUSED\] BTC\/USD: 'kraken_rest_rate_limited_reserve' stale/;
  // The evaluator was reached on this price. (Whether the stop then FIRES is the bid-side trigger's job, which needs book
  // sides this harness does not seed — it refuses for want of a side, counted as exitEvalRefused. Reaching the evaluator
  // is the property the age check governs.)
  const EVALUATED = /\[8\.8\.3-I6\]\[EXIT_EVAL\] symbol=BTC\/USD livePrice=94 /;
  function cryptoPosition() {
    return { ...makePosition(), id: 'pos-BTC-8g', symbol: 'BTC/USD', assetClass: 'crypto_spot', avgPrice: '100', entryPrice: '100', stopLoss: '95', takeProfit: '120' };
  }
  function cryptoEngine(): Stub {
    const eng = makeEngine();
    eng.krakenService = { getTicker: vi.fn(async () => { throw new Error('must not be reached: the token bucket is empty'); }) };
    return eng;
  }
  // The rate-limited re-serve: a venue source, the ORIGINAL observation 14.3 s old (the #951 sawtooth's first rung),
  // and a price BELOW the stop — so if it were allowed to decide, the stop would fire.
  const reserve = (observedAgoMs: number) => ({
    symbol: 'BTC/USD', price: 94, timestamp: new Date().toISOString(), source: 'kraken_rest',
    producer: 'kraken_rest_rate_limited_reserve', observedAt: Date.now() - observedAgoMs,
    lastTradePrice: null, lastTradeReceivedAtMs: null,
  });

  it('a re-serve past the window HOLDS the exit: refused, sent to REST, the empty bucket skips the tick, nothing closes', async () => {
    h.getActiveOpenPositions.mockImplementation(async () => [cryptoPosition()]);
    vi.spyOn(livePricingAdapter, 'getPriceWithFallback').mockImplementation(async () => reserve(14_300) as any);
    vi.spyOn(restRateLimiter, 'takeToken').mockImplementation(() => false);
    const eng = cryptoEngine();
    const t = await tick(eng, WARM[0]);
    expect(count(t.warns, REFUSED)).toBe(1);
    expect(t.warns.find((l) => REFUSED.test(l))).toContain('observed 14300ms ago, clock=receipt, limit 2000ms');
    expect(t.priceSkips).toEqual(['rest_token_exhausted']);
    expect(t.closes).toEqual([]);
    expect(has(t.logs, EVALUATED)).toBe(false); // the stale price never reached the evaluator
    expect(eng.krakenService.getTicker).not.toHaveBeenCalled();
    expect(has(t.logs, /exitAgeRefused=1 /)).toBe(true);
  });

  it('CONTROL: the same price observed inside the window reaches the exit evaluator', async () => {
    h.getActiveOpenPositions.mockImplementation(async () => [cryptoPosition()]);
    vi.spyOn(livePricingAdapter, 'getPriceWithFallback').mockImplementation(async () => reserve(500) as any);
    vi.spyOn(restRateLimiter, 'takeToken').mockImplementation(() => false);
    const eng = cryptoEngine();
    const t = await tick(eng, WARM[0]);
    expect(count(t.warns, REFUSED)).toBe(0);
    expect(t.priceSkips).toEqual([]);
    expect(has(t.logs, EVALUATED)).toBe(true);
    expect(has(t.logs, /exitEvalInvoked=1 /)).toBe(true);
    expect(has(t.logs, /exitAgeRefused=0 /)).toBe(true);
  });
});
