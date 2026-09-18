/**
 * B-PRICE-SIDE-BY-JOB row `8a-P4a` — THE BOOK-STATE RESEED ESCAPE, AT THE REAL TRACKER.
 *
 * The defect: a seed-implausible chain ended only at the hollow-skip yield, and a book that RECOVERED while
 * staying two-sided never yields — so the exit path refused it forever (measured 2026-09-18: ANET 106,623 /
 * AMC 88,588 / LOW 25,471 refused frames on books back at normal spreads; LOW held below its stop).
 *
 * ⛔ Every assertion drives `advanceBookStateComparator` / `clearBookStateComparator` / `readBookStateComparator`
 * — the state machine the engine branches on. No rule is restated here (the `8a` r2 C1 lesson).
 * ⛔ RED ON TODAY'S CODE: without the escape, test 1's chain stays `seedImplausible` forever.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advanceBookStateComparator,
  clearBookStateComparator,
  readBookStateComparator,
  takeChainRefusalBasis,
  _resetBookStateComparatorsForTest,
} from '../../asset_classes/xstock_spot/book-state-tracker';
import { buildPriceSkipAlertCopy } from '../../services/active-execution-engine';

const SYM = 'LOW/USD';
const K_REL = 3;
const WINDOW = 20;

let warn: ReturnType<typeof vi.spyOn>;
let t = 1_000;
const tick = () => (t += 1_500);

/** A live, moving, tight book (spread ≈ 0.10%), then a yield-clear, so the ring is RETAINED (r4/r5). */
function retainHealthyRing(): void {
  for (let i = 0; i < 25; i++) {
    const bid = 100 + i * 0.01;
    advanceBookStateComparator(SYM, { bid, ask: bid + 0.1, last: bid + 0.05, atMs: tick() }, WINDOW, true, K_REL);
  }
  clearBookStateComparator(SYM, 'yield_after_60_hollow');
}

/** One frame at a given spread fraction around a moving mid; `i` moves the book. */
function frameAt(spreadFrac: number, i: number, validatedByTwoSided = true): void {
  const mid = 100 + (i % 7) * 0.02;
  const half = (mid * spreadFrac) / 2;
  advanceBookStateComparator(SYM, { bid: mid - half, ask: mid + half, last: mid, atMs: tick() }, WINDOW, validatedByTwoSided, K_REL);
}

const escapedLines = () => warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes(' SEED_ESCAPED framesHeld='));
const clearedEscape = () => warn.mock.calls.map((c) => String(c[0]))
  .filter((l) => l.includes('COMPARATOR_CLEARED') && l.includes('reason=seed_escape_recovered'));

beforeEach(() => {
  _resetBookStateComparatorsForTest();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('8a-P4a — a recovered book escapes; nothing else does', () => {
  it('1: an off-hours implausible seed on a book that RECOVERS ends, re-seeds, and validates on the next two-sided frame', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false); // the off-hours seed: 2% vs a ~0.10% ring ⇒ implausible
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    for (let i = 1; i <= 10; i++) frameAt(0.02, i); // still wide, still moving
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(escapedLines()).toHaveLength(0);
    // the book recovers to its normal spread and keeps moving
    let escapedAt = -1;
    for (let i = 0; i < 40 && escapedAt < 0; i++) {
      frameAt(0.0011, i);
      if (escapedLines().length > 0) escapedAt = i;
    }
    expect(escapedAt).toBeGreaterThanOrEqual(0); // ⛔ RED on today's code: no escape exists
    expect(escapedAt).toBeLessThan(WINDOW); // bounded by the ring, not by a clock
    expect(clearedEscape()).toHaveLength(1); // routed through clearBookStateComparator, never in place
    const c = readBookStateComparator(SYM)!;
    expect(c.seedImplausible).toBe(false);
    expect(c.framesSinceSeed).toBe(0);
    expect(c.validated).toBe(false); // the escape frame's verdict was taken against the OLD chain
    expect(c.observedMovement).toBe(false); // r5: a chain earns movement, it does not inherit it
    frameAt(0.0011, 99, true);
    expect(readBookStateComparator(SYM)!.validated).toBe(true); // the next two-sided frame, as any seed
  });

  it('2: the CRM hollow book (7.00 / 1000.00, wandering) never escapes', () => {
    retainHealthyRing();
    for (let i = 0; i < 300; i++) {
      advanceBookStateComparator(SYM, { bid: 7 + (i % 5) * 0.01, ask: 1000 - (i % 3) * 0.01, last: 247.25, atMs: tick() }, WINDOW, true, K_REL);
    }
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(escapedLines()).toHaveLength(0);
  });

  it('3: a single lucky tight print inside a wide book does not escape (the median needs the window)', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false);
    for (let i = 1; i <= 30; i++) frameAt(i === 15 ? 0.0011 : 0.02, i);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(escapedLines()).toHaveLength(0);
  });

  it('4: a book that jumps to a tight quote and then FREEZES does not escape (one move is not a live book)', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false);
    for (let i = 1; i <= 5; i++) frameAt(0.02, i);
    for (let i = 0; i < 60; i++) {
      advanceBookStateComparator(SYM, { bid: 100.0, ask: 100.11, last: 100.05, atMs: tick() }, WINDOW, true, K_REL);
    }
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(escapedLines()).toHaveLength(0);
  });

  it('4b: a QUIET but healthy book (moves once every 25 frames, AMC-like) still escapes — the move count is not windowed', () => {
    // Langston, Step 2 gate 2 BLOCKER-2: AMC moved on 2.33% of consecutive captured frames on 09-17. A count of moves
    // INSIDE the 20-frame ring would never see two here and would strand it; the plausible-run count waits for two real
    // moves however many frames that takes. (A windowed count fails this test: at most one move in any 20 frames.)
    retainHealthyRing();
    frameAt(0.02, 0, false);
    let escapedAt = -1;
    let mid = 100;
    for (let i = 0; i < 200 && escapedAt < 0; i++) {
      if (i % 25 === 0) mid += 0.01; // the only moves
      advanceBookStateComparator(SYM, { bid: mid - 0.055, ask: mid + 0.055, last: mid, atMs: tick() }, WINDOW, true, K_REL);
      if (escapedLines().length > 0) escapedAt = i;
    }
    expect(escapedAt).toBeGreaterThanOrEqual(25); // not before its second real move
    expect(escapedAt).toBeLessThan(80);
  });

  it('5: an unreadable kRel never escapes (fail-safe, as the seed judgement is)', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false);
    for (let i = 0; i < 40; i++) {
      const mid = 100 + (i % 7) * 0.02;
      advanceBookStateComparator(SYM, { bid: mid - 0.055, ask: mid + 0.055, last: mid, atMs: tick() }, WINDOW, true, null);
    }
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(escapedLines()).toHaveLength(0);
  });

  it('6: a PLAUSIBLE chain is untouched by the escape path (no clear, no log)', () => {
    retainHealthyRing();
    for (let i = 0; i < 40; i++) frameAt(0.0011, i);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false);
    expect(escapedLines()).toHaveLength(0);
    expect(clearedEscape()).toHaveLength(0);
  });
});

describe('8a-P4a — every refusal episode carries its own basis', () => {
  it('7: the basis is returned once per chain as `first`, with the seed spread, both medians and the real ratio', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false);
    for (let i = 1; i <= 25; i++) frameAt(0.02, i);
    const b1 = takeChainRefusalBasis(SYM)!;
    expect(b1.first).toBe(true);
    expect(b1.seedImplausible).toBe(true);
    expect(b1.seedSpread).toBeCloseTo(0.02, 4);
    expect(b1.seedRetainedMedian).not.toBeNull();
    expect(b1.ratio).not.toBeNull();
    expect(b1.ratio!).toBeGreaterThan(K_REL); // a genuinely wide book reads as one
    expect(takeChainRefusalBasis(SYM)!.first).toBe(false); // once per chain
  });

  it('8: a new chain (after an escape) logs its basis again', () => {
    retainHealthyRing();
    frameAt(0.02, 0, false);
    expect(takeChainRefusalBasis(SYM)!.first).toBe(true);
    for (let i = 0; i < 40 && escapedLines().length === 0; i++) frameAt(0.0011, i);
    expect(escapedLines()).toHaveLength(1);
    expect(takeChainRefusalBasis(SYM)!.first).toBe(true);
  });
});

describe('8a-P4a — the named arm: the lock is not reported as a missing price', () => {
  it('9: book_state_unvalidated takes its own branch (pin the branch, not the wording)', () => {
    const copy = buildPriceSkipAlertCopy({ symbol: SYM, mode: 'paper', streak: 40, reason: 'book_state_unvalidated', detail: 'ratio=2.40 vs kRel=3' });
    expect(copy.dominantReason).toBe('book_state_unvalidated');
    expect(copy.isStaleReject).toBe(false);
    expect(copy.isSelfThrottled).toBe(false);
    expect(copy.title).not.toMatch(/no Kraken price/);
    expect(copy.body).toContain('ratio=2.40');
  });
});

describe('8a-P4a — no clock term (Kyle, 2026-09-03)', () => {
  it('10: the tracker reads no clock', () => {
    const src = readFileSync(join(__dirname, '../../asset_classes/xstock_spot/book-state-tracker.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(/);
    expect(src).not.toMatch(/get(UTC)?Hours\(/);
    expect(src).not.toMatch(/getDay\(/);
  });
});
