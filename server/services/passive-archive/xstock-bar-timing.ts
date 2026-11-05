/**
 * R6a (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan r5, Langston-ruled design) — success-path timing
 * for the xStock bar writer's three transactions, written as ONE aggregate line on stderr every
 * 15 minutes.
 *
 * WHY stderr and an aggregate: `out__*.log` keeps about one day; `error__*.log` keeps 14, and the read
 * (R6b) spans at least two US regular sessions. Per-flush lines on stdout cannot hold the window.
 * WHY histograms: percentiles do not add across intervals. Fixed-edge bucket counts do, so a window
 * p50/p95/p99 can be recomputed from the log by anyone — bucket-resolved, not point values; the max
 * composes exactly. The per-interval percentiles stay because they show episodes.
 * Every accumulator RESETS at each line. Each line carries the writer boot id and a per-boot monotonic
 * `seq`, so a restart's dropped partial interval shows as a gap, never as silence.
 * ⛔ The top edge (20,000 ms) equals R5a's `SET LOCAL statement_timeout`: on the success path the
 * overflow bucket is unreachable, so overflow > 0 means that bound is NOT in effect (a named fence).
 */

export const XSTOCK_TIMING_LEGS = ['admit', 'apply', 'certify', 'guardWait'] as const;
export type XstockTimingLeg = typeof XSTOCK_TIMING_LEGS[number];
/** Upper edges, ms; a sample goes in the first bucket whose edge it does not exceed; the last bucket is overflow. */
export const XSTOCK_TIMING_EDGES_MS = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 20_000] as const;
export const XSTOCK_TIMING_INTERVAL_MS = 15 * 60 * 1_000;

interface LegAccumulator {
  samples: number[];
  buckets: number[];
  max: number;
}

function emptyLeg(): LegAccumulator {
  return { samples: [], buckets: new Array(XSTOCK_TIMING_EDGES_MS.length + 1).fill(0), max: 0 };
}

let legs: Record<XstockTimingLeg, LegAccumulator> = freshLegs();
let timeouts: Record<XstockTimingLeg, number> = freshTimeouts();
let seq = 0;
let intervalStartedAt = Date.now();
let reporter: NodeJS.Timeout | null = null;

function freshLegs(): Record<XstockTimingLeg, LegAccumulator> {
  return { admit: emptyLeg(), apply: emptyLeg(), certify: emptyLeg(), guardWait: emptyLeg() };
}
function freshTimeouts(): Record<XstockTimingLeg, number> {
  return { admit: 0, apply: 0, certify: 0, guardWait: 0 };
}

export function bucketIndex(ms: number): number {
  for (let i = 0; i < XSTOCK_TIMING_EDGES_MS.length; i += 1) {
    if (ms <= XSTOCK_TIMING_EDGES_MS[i]) return i;
  }
  return XSTOCK_TIMING_EDGES_MS.length;
}

/** Record one SUCCESSFUL transaction's duration. Non-finite or negative values are ignored. */
export function recordXstockBarTiming(leg: XstockTimingLeg, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const acc = legs[leg];
  acc.samples.push(ms);
  acc.buckets[bucketIndex(ms)] += 1;
  if (ms > acc.max) acc.max = ms;
}

/** Count a statement-timeout failure of a leg (the failure itself is logged where it happens). */
export function recordXstockBarStatementTimeout(leg: XstockTimingLeg): void {
  timeouts[leg] += 1;
}

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

export interface XstockTimingLine {
  bootId: string;
  seq: number;
  intervalStartedAt: string;
  intervalEndedAt: string;
  edgesMs: readonly number[];
  legs: Record<XstockTimingLeg, { n: number; p50: number | null; p95: number | null; p99: number | null; max: number | null; buckets: number[] }>;
  timeouts: Record<XstockTimingLeg, number>;
}

/** Build the interval's line and RESET every accumulator. */
export function takeXstockTimingLine(bootId: string, now: number = Date.now()): XstockTimingLine {
  seq += 1;
  const out = {} as XstockTimingLine['legs'];
  for (const leg of XSTOCK_TIMING_LEGS) {
    const acc = legs[leg];
    const sorted = [...acc.samples].sort((a, b) => a - b);
    out[leg] = {
      n: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      max: sorted.length ? Math.round(acc.max) : null,
      buckets: [...acc.buckets],
    };
  }
  const line: XstockTimingLine = {
    bootId,
    seq,
    intervalStartedAt: new Date(intervalStartedAt).toISOString(),
    intervalEndedAt: new Date(now).toISOString(),
    edgesMs: XSTOCK_TIMING_EDGES_MS,
    legs: out,
    timeouts: { ...timeouts },
  };
  legs = freshLegs();
  timeouts = freshTimeouts();
  intervalStartedAt = now;
  return line;
}

/** Start the 15-minute reporter. Idempotent; `unref` so it never holds the process open. */
export function startXstockTimingReporter(bootId: string, intervalMs: number = XSTOCK_TIMING_INTERVAL_MS): void {
  if (reporter) return;
  intervalStartedAt = Date.now();
  reporter = setInterval(() => {
    try {
      console.error(`[B-XSTOCK-BAR-AVAILABILITY][TIMING] ${JSON.stringify(takeXstockTimingLine(bootId))}`);
    } catch (error) {
      console.error('[B-XSTOCK-BAR-AVAILABILITY][TIMING] line failed:', error instanceof Error ? error.message : error);
    }
  }, intervalMs);
  reporter.unref?.();
}

export function stopXstockTimingReporter(): void {
  if (reporter) clearInterval(reporter);
  reporter = null;
}

/** Test seam: reset all state. */
export function __resetXstockTimingForTests(): void {
  stopXstockTimingReporter();
  legs = freshLegs();
  timeouts = freshTimeouts();
  seq = 0;
  intervalStartedAt = Date.now();
}
