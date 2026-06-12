/**
 * B-4.6-B chunk A — scan-stall instrumentation. MEASUREMENT ONLY: no
 * behavioral change to any scan loop. (Scope: B_4_6B_SCAN_STALL_SCOPE.md;
 * design: B_4_6B_PRE_AUDIT.md §4, Langston Step-1 ACK + Step-2 APPROVE.)
 *
 * Two instruments, one 60s METRIC cadence:
 *
 * 1. `perf_hooks.monitorEventLoopDelay` histogram — the definitive
 *    event-loop stall measure. The pre-existing `metrics-service.ts`
 *    1s timer-drift sampler under-counts short stalls (point samples,
 *    positive-drift-only — throughput-study caveat 0); this histogram
 *    observes every loop turn. **`reset()` per logging interval** so each
 *    METRIC line is interval-scoped and before/after soak windows compare
 *    like with like (Langston step-6 + Step-1 note).
 *
 * 2. Per-segment SYNC-span aggregates (sum / count / MAX single span per
 *    interval). The MAX matters most: chunk-B yields land only at pair /
 *    batch boundaries, so the largest atomic span is the residual stall
 *    floor — per-cycle aggregates alone cannot reveal an 80ms single pair
 *    (Langston Step-2 R2). Decision rule lives in the pre-audit: pairs
 *    materially exceeding ~20-25ms become their own finding; we do not
 *    ship yields that structurally cannot reach the latency target.
 *
 * Segment keys (wrap points; see the pre-audit appendix for loop maps):
 *  - 'crypto_prefetch_pair'  — per-pair ATR/DBS sync math inside the
 *    AdaptiveScan batch-of-10 callbacks (market-scanner.ts).
 *  - 'crypto_prefetch_batch' — SUM of one batch-of-10's pair spans = the
 *    worst-case atomic span for that batch (all-warm microtask drain runs
 *    the callbacks' sync tails back-to-back).
 *  - 'xstock_eval'           — the contiguous pre-fan-out sync block per
 *    pair (lane composition + scanPatterns + regime-strategy set) in
 *    eval-cycle.ts. The fan-out's per-strategy sync chunks are bounded by
 *    per-strategy conditional awaits and are read via the ELD histogram;
 *    if this segment reads cold while ELD stays hot, the fan-out gets its
 *    own wrap in an instrumentation iteration. The SAME escalation rule
 *    covers the two other deliberately-unwrapped sync zones (Langston
 *    chunk-A R1): Loop 1's MAIN FILTER loop (~market-scanner 699-836) and
 *    the 19F PATTERN loop (~882-956) — both carry per-pair awaits
 *    (passesHistoryFilter) INSIDE their spans, so a naive wrap would
 *    pollute the sync reading with genuine I/O suspension on cold pairs.
 *    If ELD reads hot while all four shipped segments read cold, those
 *    two loops are the next wrap candidates.
 *  - 'vts_eval'              — the post-OHLC-fetch sync block per pair
 *    (computeContext + scanPatterns ×2 + regime/family mapping) up to the
 *    per-strategy loop in vts-runner.ts.
 *  Early-skip paths (continue/return before the span end) are not
 *  recorded — their sync spans are trivial; undercount documented.
 *
 * Lazy start: the 60s timer arms on the first record/ensure call (the scan
 * modules import this file at boot). Timer is unref'd — never holds the
 * process open (unit tests included).
 */

import { monitorEventLoopDelay, performance, PerformanceObserver } from 'perf_hooks';

const LOG_INTERVAL_MS = 60_000;

type SegmentKey =
  | 'crypto_prefetch_pair'
  | 'crypto_prefetch_batch'
  | 'xstock_eval'
  | 'vts_eval'
  // B-4.6-B chunk-B iteration 2 (the chunk-A R1 escalation, fired): post-yield
  // ELD max stayed 283-566ms/interval while ALL FOUR original segments read
  // cold (<17ms max spans) — the residual block is elsewhere. These two wraps
  // cover the never-measured market-scanner loops. ⚠ CAVEAT (documented at
  // chunk A): both loops carry per-pair awaits (passesHistoryFilter) INSIDE
  // the span, so a COLD pair's span includes genuine I/O suspension — read
  // the per-interval MAX with that pollution in mind (warm cycles ≈ pure
  // sync; a polluted max coexists with a healthy ELD).
  | 'crypto_main_filter_pair'
  | 'crypto_pattern_pair';

interface SegAgg {
  spans: number;
  sumMs: number;
  maxSpanMs: number;
}

const segs = new Map<SegmentKey, SegAgg>();
// B-4.6-B chunk B: per-lane yield counts (ScanYielder reports here so the
// yield witness rides the SAME 60s METRIC stream the soak analysis reads).
const yields = new Map<string, number>();
const eld = monitorEventLoopDelay({ resolution: 10 });
let timer: NodeJS.Timeout | null = null;

// B-4.6-B chunk-B iteration 2: GC pause attribution. A major GC of the ~450MB
// heap can block the loop for hundreds of ms — pre-audit risk 2 named this
// explicitly ("the 2s freeze may be a different beast, e.g. a GC pause").
// If max_gc_ms per interval ≈ the ELD max_ms, the residual stall is GC, not
// scan compute — a DIFFERENT fix family (heap/allocation), its own finding.
// kind values (perf_hooks constants): 1=Scavenge 2=MinorMC 4=MarkSweepCompact
// 8=IncrementalMarking 16=ProcessWeakCallbacks.
let gcCount = 0;
let gcSumMs = 0;
let gcMaxMs = 0;
let gcMaxKind = 0;
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcCount++;
    gcSumMs += entry.duration;
    if (entry.duration > gcMaxMs) {
      gcMaxMs = entry.duration;
      gcMaxKind = (entry as { detail?: { kind?: number } }).detail?.kind
        ?? (entry as unknown as { kind?: number }).kind ?? 0;
    }
  }
});

function nsToMs(v: number): number {
  // histogram values are nanoseconds; 2-decimal ms
  return Math.round(v / 10_000) / 100;
}

function flush(): void {
  console.log(
    `[4.6B][ELD] METRIC event_loop_delay interval_s=60 ` +
      `p50_ms=${nsToMs(eld.percentile(50))} p95_ms=${nsToMs(eld.percentile(95))} ` +
      `p99_ms=${nsToMs(eld.percentile(99))} max_ms=${nsToMs(eld.max)}`,
  );
  eld.reset();
  for (const [key, agg] of segs) {
    if (agg.spans === 0) continue;
    console.log(
      `[4.6B][SEG] METRIC segment=${key} interval_s=60 spans=${agg.spans} ` +
        `sum_ms=${Math.round(agg.sumMs)} max_span_ms=${Math.round(agg.maxSpanMs * 100) / 100}`,
    );
    agg.spans = 0;
    agg.sumMs = 0;
    agg.maxSpanMs = 0;
  }
  for (const [lane, n] of yields) {
    if (n === 0) continue;
    console.log(`[4.6B][YIELD] METRIC lane=${lane} interval_s=60 yields=${n}`);
    yields.set(lane, 0);
  }
  if (gcCount > 0) {
    console.log(
      `[4.6B][GC] METRIC gc interval_s=60 count=${gcCount} sum_ms=${Math.round(gcSumMs)} ` +
        `max_gc_ms=${Math.round(gcMaxMs * 100) / 100} max_kind=${gcMaxKind}`,
    );
    gcCount = 0;
    gcSumMs = 0;
    gcMaxMs = 0;
    gcMaxKind = 0;
  }
}

// B-4.6-B chunk-B iteration 3: stall WATCHDOG — generic attribution when the
// named-suspect wraps all read cold (iteration-2 result: GC max 20-47ms,
// main-filter ≤59ms await-polluted, pattern ≤3ms — yet ELD max 286-451ms
// EVERY interval). A 50ms heartbeat timestamps each blockage window:
// any gap > STALL_GAP_MS logs wall-clock start/end so the culprit is named
// by the out.log lines bracketing the window. Diagnostic-grade; remove or
// quiet once the residual source is identified and fixed.
const HEARTBEAT_MS = 50;
const STALL_GAP_MS = 150;
let lastBeat = 0;
let beatTimer: NodeJS.Timeout | null = null;

/** Idempotent. Arms the histogram + the 60s interval-scoped METRIC line. */
export function ensureScanStallInstrument(): void {
  if (timer) return;
  eld.enable();
  gcObserver.observe({ entryTypes: ['gc'] });
  timer = setInterval(flush, LOG_INTERVAL_MS);
  timer.unref();
  lastBeat = Date.now();
  beatTimer = setInterval(() => {
    const now = Date.now();
    const gap = now - lastBeat - HEARTBEAT_MS;
    if (gap > STALL_GAP_MS) {
      console.log(
        `[4.6B][STALL] gap_ms=${gap} blocked_from=${new Date(lastBeat).toISOString()} ` +
          `blocked_until=${new Date(now).toISOString()}`,
      );
    }
    lastBeat = now;
  }, HEARTBEAT_MS);
  beatTimer.unref();
  console.log('[4.6B][ELD] scan-stall instrument armed (monitorEventLoopDelay; 60s interval-scoped histogram + segment sync-spans + gc observer + 50ms stall watchdog)');
}

/** Monotonic start marker for a sync span. */
export function syncSpanStart(): number {
  ensureScanStallInstrument();
  return performance.now();
}

/** Record one contiguous synchronous span (ms since `startedAt`). */
export function recordSyncSpan(key: SegmentKey, startedAt: number): number {
  const ms = performance.now() - startedAt;
  let agg = segs.get(key);
  if (!agg) {
    agg = { spans: 0, sumMs: 0, maxSpanMs: 0 };
    segs.set(key, agg);
  }
  agg.spans++;
  agg.sumMs += ms;
  if (ms > agg.maxSpanMs) agg.maxSpanMs = ms;
  return ms;
}

/** Record a pre-computed span value in ms (used for batch sums). */
export function recordSyncSpanMs(key: SegmentKey, ms: number): void {
  ensureScanStallInstrument();
  let agg = segs.get(key);
  if (!agg) {
    agg = { spans: 0, sumMs: 0, maxSpanMs: 0 };
    segs.set(key, agg);
  }
  agg.spans++;
  agg.sumMs += ms;
  if (ms > agg.maxSpanMs) agg.maxSpanMs = ms;
}

/** B-4.6-B chunk B: count one cooperative yield for `lane` (ScanYielder). */
export function recordYield(lane: string): void {
  ensureScanStallInstrument();
  yields.set(lane, (yields.get(lane) ?? 0) + 1);
}

/** Test-only. */
export function _resetScanStallInstrument(): void {
  segs.clear();
  yields.clear();
  eld.reset();
}
