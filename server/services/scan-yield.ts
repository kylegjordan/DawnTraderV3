/**
 * B-4.6-B chunk B — cooperative macrotask yields for the scan loops.
 * (Scope: B_4_6B_SCAN_STALL_SCOPE.md obj 2; design: B_4_6B_PRE_AUDIT.md §1-§2,
 * Langston soak-analysis PROCEED verdict in B_4_6B_SOAK_ANALYSIS_LANGSTON.md.)
 *
 * THE MECHANISM this fixes: the scan loops' per-pair `await`s resolve from
 * warm caches, and an await on an already-resolved promise yields only to the
 * MICROTASK queue — timers and I/O callbacks (macrotasks) never run. On warm
 * cycles the per-pair sync tails drain back-to-back into one contiguous block
 * (measured: 200-700ms event-loop stall EVERY 60s interval; crypto prefetch =
 * the proven hot segment). `setImmediate` is a MACROTASK boundary — one
 * `await new Promise(setImmediate)` lets every starved timer and I/O callback
 * run. `await Promise.resolve()` would NOT (microtask-only — the bug itself).
 *
 * ⚠ GRANULARITY LOCK (Langston Step-2 R3 — mirrored in the SIM): callers
 * invoke `maybeYield()` ONLY at pair boundaries or batch-of-10 boundaries,
 * NEVER inside a single pair's compute span. The pre-audit's shared-state
 * safety argument ("new yields add interleave FREQUENCY, not a new CLASS")
 * holds because these yields are strictly COARSER than the existing mid-pair
 * awaits; a future yield INSIDE a pair's span would split read-coherence
 * spans and must NOT assume that argument covers it.
 *
 * Trigger is MEASURED elapsed time, not pair count (Langston C2): a yield
 * fires only when >= thresholdMs has passed since the last one, so cheap
 * stretches cost nothing and heavy stretches are sliced to ~threshold-sized
 * atomic chunks. The residual stall floor is the largest single-PAIR span
 * (72ms observed worst case) — by design, not fixable at this granularity
 * (separate follow-up; soak finding 1).
 *
 * Note on the clock: elapsed is wall-clock, so a genuine I/O suspension
 * (cold-cache fetch) also advances it and the next boundary fires a yield
 * the loop technically didn't need. Cost: one no-op macrotask (~sub-ms) —
 * accepted for simplicity over sync-time bookkeeping.
 *
 * The threshold is a CODE constant, deliberately not a DB knob: it is coupled
 * to the instrument's 20-25ms decision rule and the <50ms/interval acceptance
 * gate — changing it invalidates the soak evidence, so it must travel through
 * a reviewed code change, not an operator dial.
 */

import { performance } from 'perf_hooks';
import { recordYield } from './scan-stall-instrument.js';

export const SCAN_YIELD_THRESHOLD_MS = 20;

export class ScanYielder {
  private lastYieldAt: number;
  private yieldsThisCycle = 0;

  constructor(
    private readonly lane: string,
    private readonly thresholdMs: number = SCAN_YIELD_THRESHOLD_MS,
  ) {
    this.lastYieldAt = performance.now();
  }

  /**
   * Yield to the macrotask queue iff >= thresholdMs elapsed since the last
   * yield (or construction). Call ONLY at pair/batch boundaries (see header).
   */
  async maybeYield(): Promise<void> {
    if (performance.now() - this.lastYieldAt < this.thresholdMs) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.lastYieldAt = performance.now();
    this.yieldsThisCycle++;
    recordYield(this.lane);
  }

  /** Yields taken since construction (per-cycle observability). */
  get count(): number {
    return this.yieldsThisCycle;
  }
}
