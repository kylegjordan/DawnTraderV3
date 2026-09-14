/**
 * row `8a-P1` — THE FUNNEL'S STAGE DIMENSION, THE SELF-SYNTHETIC SPLIT, AND THE PER-LEG
 * ACCEPTED-AGE HISTOGRAM.
 *
 * ⛔ WHY THIS FILE EXISTS, AND IT IS NOT "MORE COVERAGE": `8a-P1`'s first proposed fix added
 * `stage` to `LevelBasisRungKey` AND NOTHING ELSE. `keyOf` builds the map key and would have gone
 * on ignoring it — the TYPE advertising a separation the KEY did not implement. Langston caught
 * it at the object. **Every test below asserts the KEY or the ROW, never the interface**, because
 * the interface is exactly what was already wrong once.
 *
 * ⚠️ AND THE FIXTURES NAME THEIR STAGE EXPLICITLY. `tsconfig` excludes test files, so a REQUIRED
 * field is not enforced here: the first run after `stage` landed minted
 * `active:crypto_spot:undefined:book`. That is what test 2 pins.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordLevelBasisOutcome,
  getLevelBasisFunnel,
  getLevelBasisFunnelRow,
  __resetLevelBasisFunnelForTest,
  SIDE_AGE_BUCKET_EDGES_MS,
} from '../../core/calculations/level-basis.js';

const BIRTH = { lane: 'active' as const, assetClass: 'crypto_spot', stage: 'active_signal_birth' as const };
const EXIT = { lane: 'active' as const, assetClass: 'crypto_spot', stage: 'exit_trigger' as const };

describe('row 8a-P1 — the funnel separates by stage', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('1. ⛔ THE KEY CARRIES THE STAGE — two stages on the SAME lane/class/rung do NOT pool', () => {
    recordLevelBasisOutcome({ ...BIRTH, rung: 'ladder' }, { ok: true, acceptedSource: 'ticker_bbo:kraken_ws' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'no_book' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'no_book' });

    // The assertion is on the KEY STRING, because the key is the object that was wrong.
    const keys = getLevelBasisFunnel().map((r) => r.key).sort();
    expect(keys).toEqual([
      'active:crypto_spot:active_signal_birth:ladder',
      'active:crypto_spot:exit_trigger:ladder',
    ]);

    expect(getLevelBasisFunnelRow({ ...BIRTH, rung: 'ladder' })).toMatchObject({ attempted: 1, accepted: 1, refused: 0 });
    expect(getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })).toMatchObject({ attempted: 2, accepted: 0, refused: 2 });
  });

  it('2. ⭐ A MISSING STAGE REFUSES — it never mints a key named `undefined`', () => {
    // The one population that can reach this: a test file, which tsc does not check. A production
    // caller cannot construct this object at all.
    expect(() =>
      recordLevelBasisOutcome({ lane: 'active', assetClass: 'crypto_spot', rung: 'book' } as never, { ok: false, reason: 'no_book' }),
    ).toThrow(/requires a stage/);
    // ⛔ AND NOTHING WAS WRITTEN — a guard that refuses after mutating is not a guard.
    expect(getLevelBasisFunnel()).toHaveLength(0);
  });

  it('3. the stage is on the ROW, so a consumer never parses it back out of the key', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'book' }, { ok: false, reason: 'no_book' });
    expect(getLevelBasisFunnelRow({ ...EXIT, rung: 'book' })).toMatchObject({ stage: 'exit_trigger', rung: 'book' });
  });
});

describe('row 8a-P1 — the self-synthetic refusals are split out, because they count US', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('4. ⛔ `locked_or_synthetic` IS EXCLUDED FROM THE FEED-FACING NUMERATOR, AND STILL COUNTED', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'locked_or_synthetic_book' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'locked_or_synthetic_book' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'stale_book' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: true, acceptedSource: 'ticker_bbo:kraken_rest' });

    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    expect(r.attempted).toBe(4);
    expect(r.refused).toBe(3);                       // the whole refusal count still reconciles
    expect(r.selfSyntheticRefusals).toBe(2);          // ours
    expect(r.refusedExcludingSelfSynthetic).toBe(1);  // the venue's
    // ⭐ THE INVARIANT THAT MAKES THE SPLIT CHECKABLE RATHER THAN ASSERTED.
    expect(r.selfSyntheticRefusals + r.refusedExcludingSelfSynthetic).toBe(r.refused);
  });

  it('5. ⭐ CONTROL — with no synthetic refusals the two numerators AGREE, so test 4 discriminates', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'stale_book' });
    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    expect(r.selfSyntheticRefusals).toBe(0);
    expect(r.refusedExcludingSelfSynthetic).toBe(r.refused);
  });
});

describe('row 8a-P1 — the accepted quote age, per leg, never pooled', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('6. ⛔ A BOOK AGE AND A TICKER AGE LAND IN DIFFERENT HISTOGRAMS', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' },
      { ok: true, acceptedSource: 'book_top:kraken_ws_book', acceptedAgeMs: 120, acceptedLeg: 'book' });
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' },
      { ok: true, acceptedSource: 'ticker_bbo:kraken_rest', acceptedAgeMs: 31_000, acceptedLeg: 'ticker' });

    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    const first = 0;                                              // < 1,000 ms
    const thirtyPlus = SIDE_AGE_BUCKET_EDGES_MS.indexOf(45_000);   // 30,000-45,000
    expect(r.acceptedAge.book[first]).toBe(1);
    expect(r.acceptedAge.ticker[thirtyPlus]).toBe(1);
    // ⛔ AND NEITHER LEG SAW THE OTHER'S OBSERVATION — this is the assertion that would go red if
    // the two were pooled, which is the F4 defect this split exists to avoid rebuilding.
    expect(r.acceptedAge.ticker[first]).toBe(0);
    expect(r.acceptedAge.book[thirtyPlus]).toBe(0);
    expect(r.acceptedAgeMaxMs).toEqual({ book: 120, ticker: 31_000 });
  });

  it('7. a 0 ms age is RECORDED, not dropped by truthiness', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' },
      { ok: true, acceptedSource: 'book_top:kraken_ws_book', acceptedAgeMs: 0, acceptedLeg: 'book' });
    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    expect(r.acceptedAge.book[0]).toBe(1);
  });

  it('8. ⭐ an accepted walk with NO age supplied is counted as accepted and adds NO bucket', () => {
    // The same discipline `byAcceptedSource` follows: an absent value is not invented.
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: true, acceptedSource: 'ticker_bbo:kraken_ws' });
    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    expect(r.accepted).toBe(1);
    expect(r.acceptedAge.book.reduce((a, b) => a + b, 0)).toBe(0);
    expect(r.acceptedAge.ticker.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('8b. ⛔⛔ AN EMPTY LEG REPORTS `n: 0` — SO THE MAX CANNOT BE READ AS A MEASUREMENT', () => {
    // The first LIVE read published `ageMax book 0` beside `accepted: 0`, where the zero was the
    // INITIALISER. "0 ms" and "no accepted book sample" were the same cell — #546 inside the
    // instrument this batch built to prevent #546. `n` is what separates them.
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' },
      { ok: true, acceptedSource: 'ticker_bbo:kraken_rest', acceptedAgeMs: 31_000, acceptedLeg: 'ticker' });
    const r = getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!;
    expect(r.acceptedAgeN).toEqual({ book: 0, ticker: 1 });
    // ⛔ THE DISCRIMINATOR: the book max is STILL 0, and now it is visibly unsupported.
    expect(r.acceptedAgeMaxMs.book).toBe(0);
    expect(r.acceptedAgeN.book).toBe(0);
    // …while the ticker leg's max IS supported.
    expect(r.acceptedAgeMaxMs.ticker).toBe(31_000);
    expect(r.acceptedAgeN.ticker).toBe(1);
  });

  it('9. the row carries the edge set, so a reader never has to go and find it', () => {
    recordLevelBasisOutcome({ ...EXIT, rung: 'ladder' }, { ok: false, reason: 'no_book' });
    expect(getLevelBasisFunnelRow({ ...EXIT, rung: 'ladder' })!.acceptedAgeEdgesMs).toEqual(SIDE_AGE_BUCKET_EDGES_MS);
  });
});
