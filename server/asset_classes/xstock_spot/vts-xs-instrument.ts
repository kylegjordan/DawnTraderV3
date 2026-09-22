/**
 * xstock_spot — the VTS xStock DECISION-QUOTE INSTRUMENT (`B-PRICE-SIDE-BY-JOB` row `8a-P4c`, increment 1).
 *
 * WHAT IT IS FOR. Before VTS xStock moves off `last` onto the transactable side (a SELL on the BID, a BUY on the ASK),
 * the guard that will judge those sides has to be chosen: a STATELESS age + spread ceiling (crypto VTS's pattern) or a
 * STATEFUL comparator (the paper book-state guard). That is an empirical question about the quote AT VTS DECISION
 * INSTANTS, split by New York session and by symbol — so this module measures exactly that, and changes no decision.
 * The rules for reading it were pre-registered before this code existed:
 * `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §B4 (committed `9bcf6ab9c`, amended r3 `9c64e9a2d`).
 *
 * ⛔ TELEMETRY ONLY. Nothing reads these counters to decide anything. Every xStock VTS decision still reads `last`.
 * ⛔ No pooled rate is ever formed here — every line is per lane, per session, and the roll-up per symbol.
 * ⚠️ In-memory: a restart loses the current pass and the partial hour of symbol roll-ups; the window records restarts.
 */
import { xstockTransactableSides } from './transactable-sides.js';
import { getXstockSession, type XstockSession } from './time-of-day.js';
import { isInXstockWeekendClose } from './market-hours.js';

/**
 * The spread ceiling the instrument measures against — an INSTRUMENT constant fixed by the pre-registration, not a
 * decision knob. Derived by `8a-P2`'s formula `spread ≤ 2·D·(1+f)` with D = the p10 VTS xStock stop distance and
 * f = 0.10: D = 0.507% (n = 2,805 VTS xStock trades opened 2026-09-08 → 2026-09-22), so 2 × 0.00507 × 1.1 = 0.01115.
 * The guard built in increment 3 re-derives its own ceiling from the then-current D; this value does not carry over.
 */
export const XS_VTS_SPREAD_CEILING = 0.01115;

/** Candidate age ceilings, pre-registered rule B. */
export const XS_VTS_AGE_CANDIDATES_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

/** Age bucket upper edges (ms): ≤5 s, ≤15 s, ≤30 s, ≤60 s, ≤120 s, ≤300 s; index 6 = older (unreachable while the
 *  lane's own query keeps a 5-minute window, kept so a widened window cannot fold into the last bucket unseen). */
const AGE_EDGES_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
/** Spread bucket upper edges (fraction of mid): ≤0.25%, ≤0.5%, ≤ceiling, ≤2%, ≤5%; index 5 = wider. */
const SPREAD_EDGES = [0.0025, 0.005, XS_VTS_SPREAD_CEILING, 0.02, 0.05];

export type XsLane = 'vts' | 'shadow';

/** A pass's session label. `weekend` = the Fri 20:00 → Sun 20:00 ET close: the shadow lane and pending real-lane rests
 *  still run then (the audit's §A1), and a time-of-day label alone would file a Saturday look under `regular`. The
 *  pre-registered window is weekday sessions only, so weekend looks carry their own label and are never read. */
export type XsPassSession = XstockSession | 'weekend';

/** The quote row a VTS xStock decision reads, with its sides UNDEFAULTED (null when absent or non-finite). */
export interface XsQuoteRow {
  last: number;
  bid: number | null;
  ask: number | null;
  atMs: number | null;
}

export interface XsLook {
  noRow: boolean;
  ageUnknown: boolean;
  ageMs: number | null;
  sideUnusable: boolean;
  spread: number | null;
  wide: boolean;
  ageBucket: number | null;
  spreadBucket: number | null;
  /** Per candidate age ceiling: `noRow` OR age unknown OR age > c. */
  ageOver: boolean[];
  /** Per candidate age ceiling: the UNION a stateless guard would refuse — age over OR side unusable OR wide. */
  refusedAt: boolean[];
  /** The bid would fire the static stop while `last` does not (the rule would change the decision). */
  bidFiresStop: boolean;
  /** `last` fires the static target while the bid has not reached it. */
  lastFiresTarget: boolean;
}

function bucketOf(value: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) if (value <= edges[i]) return i;
  return edges.length;
}

/**
 * PURE. Classifies ONE decision look. `stop` / `target` are the trade's STATIC levels — a trailing or break-even
 * ratchet is not modelled (stated in the plan); the divergence counters are descriptive (rule D), never a gate.
 */
export function classifyXstockVtsLook(
  row: XsQuoteRow | null,
  nowMs: number,
  stop: number | null,
  target: number | null,
): XsLook {
  if (row === null) {
    return {
      noRow: true, ageUnknown: false, ageMs: null, sideUnusable: false, spread: null, wide: false,
      ageBucket: null, spreadBucket: null,
      ageOver: XS_VTS_AGE_CANDIDATES_MS.map(() => true),
      refusedAt: XS_VTS_AGE_CANDIDATES_MS.map(() => true),
      bidFiresStop: false, lastFiresTarget: false,
    };
  }
  // Langston Step-4 CONDITION-1: a NEGATIVE age (a row stamped after the decision instant) is `ageUnknown`, never the
  // freshest possible — the same disposition as the crypto stateless guard (`level-basis.ts:230`, `age_unknown`). It
  // should never happen (the archiver stamps with its own clock), which is exactly why it is COUNTED, not rounded away.
  const rawAgeMs = row.atMs !== null && Number.isFinite(row.atMs) ? nowMs - row.atMs : null;
  const ageMs = rawAgeMs !== null && rawAgeMs >= 0 ? rawAgeMs : null;
  const ageUnknown = ageMs === null;
  const sides = xstockTransactableSides({ bid: row.bid, ask: row.ask });
  const sideUnusable = sides === null;
  const spread = sides !== null ? (sides.ask - sides.bid) / ((sides.ask + sides.bid) / 2) : null;
  const wide = spread !== null && spread > XS_VTS_SPREAD_CEILING;
  const ageOver = XS_VTS_AGE_CANDIDATES_MS.map((c) => ageUnknown || (ageMs as number) > c);
  const refusedAt = ageOver.map((over) => over || sideUnusable || wide);
  const bidFiresStop = sides !== null && stop !== null && Number.isFinite(stop)
    && sides.bid <= stop && row.last > stop;
  const lastFiresTarget = sides !== null && target !== null && Number.isFinite(target)
    && row.last >= target && sides.bid < target;
  return {
    noRow: false, ageUnknown, ageMs, sideUnusable, spread, wide,
    ageBucket: ageMs === null ? null : bucketOf(ageMs, AGE_EDGES_MS),
    spreadBucket: spread === null ? null : bucketOf(spread, SPREAD_EDGES),
    ageOver, refusedAt, bidFiresStop, lastFiresTarget,
  };
}

interface PassCounters {
  looks: number; noRow: number; ageUnknown: number; sideUnusable: number; wide: number;
  age: number[]; spread: number[]; ageOver: number[]; refused: number[];
  bidFiresStop: number; lastFiresTarget: number;
  pendingLooks: number; pendingNoRow: number; pendingAskAtOrBelow: number; pendingLastAtOrBelow: number;
}

interface SymbolCounters {
  looks: number; noRow: number; ageUnknown: number; sideUnusable: number; wide: number;
  ageOver: number[]; refused: number[];
}

const zeros = (n: number) => new Array<number>(n).fill(0);

function emptyPass(): PassCounters {
  return {
    looks: 0, noRow: 0, ageUnknown: 0, sideUnusable: 0, wide: 0,
    age: zeros(AGE_EDGES_MS.length + 1), spread: zeros(SPREAD_EDGES.length + 1),
    ageOver: zeros(XS_VTS_AGE_CANDIDATES_MS.length), refused: zeros(XS_VTS_AGE_CANDIDATES_MS.length),
    bidFiresStop: 0, lastFiresTarget: 0,
    pendingLooks: 0, pendingNoRow: 0, pendingAskAtOrBelow: 0, pendingLastAtOrBelow: 0,
  };
}

function emptySymbol(): SymbolCounters {
  return {
    looks: 0, noRow: 0, ageUnknown: 0, sideUnusable: 0, wide: 0,
    ageOver: zeros(XS_VTS_AGE_CANDIDATES_MS.length), refused: zeros(XS_VTS_AGE_CANDIDATES_MS.length),
  };
}

const HOUR_MS = 3_600_000;
const list = (a: number[]) => `[${a.join(',')}]`;

/**
 * One instance per lane. A resolve pass calls `beginPass`, then `recordLook` / `recordPendingLook` per xStock trade,
 * then `endPass`. The per-pass line carries the pass's session; the per-(session, symbol) roll-up is flushed when the
 * clock hour changes. Lines go to `console.warn` ⇒ PM2's `error.log` (~14-day reach) — NOT `console.log`, whose
 * `out.log` rotates in ~20 minutes and is how `8a-P3` lost ~70 h of lines.
 */
export class XsVtsInstrument {
  private pass: PassCounters = emptyPass();
  private passSession: XsPassSession = 'overnight';
  private symbols = new Map<string, SymbolCounters>();
  private hour: number | null = null;

  constructor(
    private readonly lane: XsLane,
    private readonly emit: (line: string) => void = (line) => console.warn(line),
  ) {}

  beginPass(nowMs: number): void {
    const h = Math.floor(nowMs / HOUR_MS);
    if (this.hour !== null && h !== this.hour) this.flushSymbols();
    this.hour = h;
    this.pass = emptyPass();
    this.passSession = isInXstockWeekendClose(new Date(nowMs)) ? 'weekend' : getXstockSession(nowMs);
  }

  recordLook(symbol: string, row: XsQuoteRow | null, nowMs: number, stop: number | null, target: number | null): void {
    const l = classifyXstockVtsLook(row, nowMs, stop, target);
    const p = this.pass;
    p.looks++;
    if (l.noRow) p.noRow++;
    if (l.ageUnknown) p.ageUnknown++;
    if (l.sideUnusable) p.sideUnusable++;
    if (l.wide) p.wide++;
    if (l.ageBucket !== null) p.age[l.ageBucket]++;
    if (l.spreadBucket !== null) p.spread[l.spreadBucket]++;
    l.ageOver.forEach((v, i) => { if (v) p.ageOver[i]++; });
    l.refusedAt.forEach((v, i) => { if (v) p.refused[i]++; });
    if (l.bidFiresStop) p.bidFiresStop++;
    if (l.lastFiresTarget) p.lastFiresTarget++;

    const key = `${this.passSession}|${symbol}`;
    const s = this.symbols.get(key) ?? emptySymbol();
    s.looks++;
    if (l.noRow) s.noRow++;
    if (l.ageUnknown) s.ageUnknown++;
    if (l.sideUnusable) s.sideUnusable++;
    if (l.wide) s.wide++;
    l.ageOver.forEach((v, i) => { if (v) s.ageOver[i]++; });
    l.refusedAt.forEach((v, i) => { if (v) s.refused[i]++; });
    this.symbols.set(key, s);
  }

  /** A resting (pending) xStock entry: would the ASK have filled it, and would `last` (today's rule)? */
  recordPendingLook(row: XsQuoteRow | null, limit: number): void {
    const p = this.pass;
    p.pendingLooks++;
    if (row === null) { p.pendingNoRow++; return; }
    const sides = xstockTransactableSides({ bid: row.bid, ask: row.ask });
    if (sides !== null && sides.ask <= limit) p.pendingAskAtOrBelow++;
    if (row.last <= limit) p.pendingLastAtOrBelow++;
  }

  endPass(): void {
    const p = this.pass;
    if (p.looks + p.pendingLooks === 0) return;
    this.emit(
      `[8a-P4c][VTS_XS_TOUCH] lane=${this.lane} session=${this.passSession} looks=${p.looks} noRow=${p.noRow} `
      + `ageUnknown=${p.ageUnknown} sideUnusable=${p.sideUnusable} wide=${p.wide} age=${list(p.age)} spread=${list(p.spread)} `
      + `ageOver=${list(p.ageOver)} refused=${list(p.refused)} bidFiresStop=${p.bidFiresStop} lastFiresTarget=${p.lastFiresTarget} `
      + `pendingLooks=${p.pendingLooks} pendingNoRow=${p.pendingNoRow} pendingAskAtOrBelow=${p.pendingAskAtOrBelow} `
      + `pendingLastAtOrBelow=${p.pendingLastAtOrBelow}`,
    );
  }

  /** Emits one roll-up line per (session, symbol) for the hour just ended, then clears. */
  flushSymbols(): void {
    if (this.hour === null) return;
    const hourIso = new Date(this.hour * HOUR_MS).toISOString().slice(0, 13) + 'Z';
    for (const [key, s] of Array.from(this.symbols.entries())) {
      const [session, symbol] = key.split('|');
      this.emit(
        `[8a-P4c][VTS_XS_SYM] lane=${this.lane} hour=${hourIso} session=${session} symbol=${symbol} looks=${s.looks} `
        + `noRow=${s.noRow} ageUnknown=${s.ageUnknown} sideUnusable=${s.sideUnusable} wide=${s.wide} `
        + `ageOver=${list(s.ageOver)} refused=${list(s.refused)}`,
      );
    }
    this.symbols.clear();
  }
}

/** Parses a DB numeric-as-text into a finite number, or null — the instrument never defaults a side to zero. */
export function parseQuoteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
