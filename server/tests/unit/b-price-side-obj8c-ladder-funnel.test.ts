// B-PRICE-SIDE-BY-JOB row `8c` (P1) — THE LADDER'S FUNNEL: one walk, two cells, never pooled.
//
// ⛔ WHAT THIS ROW CHANGED AND WHY IT NEEDED A NEW TEST FILE. Until 2026-09-13 the level shadow
// assessed the BOOK and nothing else — rung 1 of D3's three-rung rule — and it was written on
// 2026-09-05, six days BEFORE D3 was decided. Measured live at 05:40Z on 2026-09-13: the active
// crypto lane refused 530 of 546 level builds, 526 of them `no_book`, because the Kraken socket
// carries a book for the TWO symbols we hold while the other ~500 are REST-priced. That refusal
// was measuring the ABSENCE OF RUNG 2, not the absence of a transactable price.
//
// ⛔⛔ THE POPULATION BOUNDARY IS A KEY, NOT A SENTENCE (Langston condition 1, 2026-09-13).
// Before this row, one `attempted` was one book assessment. After it, one `attempted` is one
// ladder walk. Those are two instruments, and a reader comparing them would be comparing neither.
// So the `book` cell keeps counting exactly what it counted before — the book rung's own verdict,
// a CONTINUOUS series across the change — and the `ladder` cell counts the walk. The gap between
// their ACCEPTED counts is the measurement: it is how much rung 2 recovers.
//
// ⭐ THE MUTATIONS THAT PROVE THIS SUITE CAN FAIL — **MEASURED, NOT PREDICTED**, 2026-09-13.
// Each was applied with an assertion that it actually matched (an unfired mutation is not
// evidence — that has cost this batch a round already), run, then reverted:
//   1. drop the book-cell recording, keep only the ladder    → 7 of 8 fail
//   2. record the book rung's reason into the ladder cell    → 1 of 8 fails (test 3)
//   3. drop `rung` from `keyOf`, collapsing both cells       → 6 of 8 fail
//   4. accept the ladder only when the BOOK carried it       → 5 of 8 fail
//
// ⛔⛔ MUTATION 2 PASSED 8 OF 8 ON THE FIRST ATTEMPT, AND THAT IS THE MOST USEFUL THING IN THIS
// FILE. Test 3 originally used `book: null, ticker: null`, so BOTH rungs returned the same string
// `no_book` — and a test whose two arms are identical cannot tell them apart, however many
// assertions it makes. The fixture now uses a STALE book against an ABSENT ticker so the two
// reasons DIFFER, and the mutation fails. **My predicted failure counts above were also wrong
// before I ran them (I guessed 2 for mutation 1; it is 7), which is exactly why they are measured
// and why a predicted mutation result may never be cited.**
import { describe, it, expect, beforeEach } from 'vitest';
import { selectTouchPrice, recordTouchSelection, type TouchLegInput } from '../../core/calculations/touch-price.js';
import {
  getLevelBasisFunnel,
  getLevelBasisFunnelRow,
  __resetLevelBasisFunnelForTest,
} from '../../core/calculations/level-basis.js';

const NOW = 1_700_000_000_000;
const POLICY = { maxAgeMs: 15_000, maxSpreadFraction: 0.5 };
const LANE = { lane: 'active' as const, assetClass: 'crypto_spot' };
const BOOK_CELL = { ...LANE, rung: 'book' as const };
const LADDER_CELL = { ...LANE, rung: 'ladder' as const };

const book = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({
  bid: 100, ask: 100.2, stampMs: NOW - 1_000, clockBasis: 'receipt', producer: 'kraken_ws_book', ...o,
});
const ticker = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({
  bid: 99.9, ask: 100.3, stampMs: NOW - 2_000, clockBasis: 'receipt', producer: 'kraken_rest', ...o,
});

/** One walk, recorded. Returns nothing — the assertions read the funnel, not a return value. */
function walk(input: Parameters<typeof selectTouchPrice>[0]): void {
  recordTouchSelection(LANE, selectTouchPrice(input, NOW, POLICY));
}

describe('row 8c P1 — the ladder funnel', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('1. a book-carried walk accepts on BOTH cells', () => {
    walk({ book: book(), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    expect(getLevelBasisFunnelRow(BOOK_CELL)).toMatchObject({ attempted: 1, accepted: 1, refused: 0 });
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toMatchObject({ attempted: 1, accepted: 1, refused: 0 });
  });

  it('2. ⭐ THE WHOLE POINT OF 8c — no book, good ticker: the book cell REFUSES and the ladder ACCEPTS', () => {
    // This is the live case. 526 of 546 refusals were `no_book`, and every one of them had a
    // REST-priced ticker carrying real, dated sides sitting right beside it.
    walk({ book: null, bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });

    const b = getLevelBasisFunnelRow(BOOK_CELL)!;
    expect(b).toMatchObject({ attempted: 1, accepted: 0, refused: 1 });
    expect(b.byReason.no_book).toBe(1);

    // The recovery. Before this row there was no cell that could show it.
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toMatchObject({ attempted: 1, accepted: 1, refused: 0 });
  });

  it('3. when BOTH rungs fail, the ladder records the TICKER reason, not the book one', () => {
    // The book's reason is already in its own cell. Recording it twice would double-count one
    // cause across two cells and make the ladder cell unreadable as an independent series.
    //
    // ⛔⛔ THE TWO REASONS MUST DIFFER OR THIS TEST CANNOT FAIL, AND MY FIRST VERSION COULD NOT.
    // It used `book: null, ticker: null`, so BOTH rungs returned `no_book` — the same string —
    // and the mutation that records the BOOK's reason into the ladder cell passed 8 of 8. A
    // fixture whose two arms are identical cannot discriminate between them. So: the book is
    // STALE (`stale_book`) and the ticker is ABSENT (`no_book`), two distinct reasons, and the
    // assertion names which cell must hold which.
    walk({ book: book({ stampMs: NOW - 20_000 }), bookEligible: true, ticker: null, tickerBasis: 'ticker_bbo' });

    const b = getLevelBasisFunnelRow(BOOK_CELL)!;
    expect(b.byReason.stale_book).toBe(1);
    expect(b.byReason.no_book).toBe(0);

    const l = getLevelBasisFunnelRow(LADDER_CELL)!;
    expect(l).toMatchObject({ attempted: 1, accepted: 0, refused: 1 });
    expect(l.byReason.no_book).toBe(1);
    // The discriminating assertion: the book's reason must NOT appear in the ladder cell.
    expect(l.byReason.stale_book).toBe(0);
  });

  it('4. an INELIGIBLE book records `book_not_eligible`, which is a funnel reason and not a basis refusal', () => {
    // `touch-price.ts` owns eligibility; `level-basis.ts` never judges it. The reason exists in
    // the funnel's vocabulary and deliberately not in `LevelBasisRefusal`.
    walk({ book: book(), bookEligible: false, ticker: ticker(), tickerBasis: 'ticker_bbo' });

    const b = getLevelBasisFunnelRow(BOOK_CELL)!;
    expect(b.byReason.book_not_eligible).toBe(1);
    expect(b.byReason.no_book).toBe(0);
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toMatchObject({ accepted: 1 });
  });

  it('5. a STALE book with a fresh ticker: book refuses `stale_book`, ladder still accepts', () => {
    walk({ book: book({ stampMs: NOW - 20_000 }), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    expect(getLevelBasisFunnelRow(BOOK_CELL)!.byReason.stale_book).toBe(1);
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toMatchObject({ accepted: 1, refused: 0 });
  });

  it('6. ⛔ THE TWO CELLS ARE SEPARATE ROWS AND THEIR DENOMINATORS ARE EQUAL BY CONSTRUCTION', () => {
    // Separate rows: this is Langston's condition 1 made structural. Equal denominators: every
    // walk increments both exactly once, so a reader who finds them unequal has found a bug in
    // the recorder, not a property of the feed.
    walk({ book: book(), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    walk({ book: null, bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    walk({ book: null, bookEligible: true, ticker: null, tickerBasis: 'ticker_bbo' });

    const rows = getLevelBasisFunnel();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key).sort()).toEqual([
      'active:crypto_spot:book',
      'active:crypto_spot:ladder',
    ]);

    const b = getLevelBasisFunnelRow(BOOK_CELL)!;
    const l = getLevelBasisFunnelRow(LADDER_CELL)!;
    expect(b.attempted).toBe(3);
    expect(l.attempted).toBe(3);
    // 1 book-carried vs 2 ladder-carried — the gap IS the rung-2 recovery.
    expect(b.accepted).toBe(1);
    expect(l.accepted).toBe(2);
  });

  it('7. the VTS lane does not pool with the active lane, rung for rung', () => {
    walk({ book: null, bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    recordTouchSelection(
      { lane: 'vts', assetClass: 'crypto_spot' },
      selectTouchPrice({ book: null, bookEligible: true, ticker: null, tickerBasis: 'ticker_bbo' }, NOW, POLICY),
    );

    expect(getLevelBasisFunnelRow(LADDER_CELL)).toMatchObject({ accepted: 1, refused: 0 });
    expect(getLevelBasisFunnelRow({ lane: 'vts', assetClass: 'crypto_spot', rung: 'ladder' }))
      .toMatchObject({ accepted: 0, refused: 1 });
    expect(getLevelBasisFunnel()).toHaveLength(4);
  });

  it('8. ⭐ POSITIVE CONTROL — a never-walked cell is `undefined`, not a zero row', () => {
    // A zero row reads as "measured, and nothing happened". Nothing was measured. Without this,
    // a future zero in the ladder cell would be indistinguishable from a recorder that never ran
    // — which is the exact shape this batch has now hit three times.
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toBeUndefined();
    walk({ book: book(), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    expect(getLevelBasisFunnelRow(LADDER_CELL)).toBeDefined();
  });
});
