/**
 * B-RTB-REFRESH-LIVE-PRICE (sprint row 59e) — the retirement ask's contract (`server/services/rtb-retirement-ask.ts`), driven
 * through every refusal arm with the venue reads mocked. Langston's Step-2 conditions: C1 (the exit's own pieces), C5 (dispatch on
 * the persisted class, never the symbol), C6 (every ambiguous arm keeps).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: any = {
  book: null as any, cached: null as any, tick: null as any, sigma: null as any,
  yard: { median: 0.001, basis: 'regular_session', n: 200 } as any, throwKnobs: false,
};
vi.mock('../../services/execution/crypto-touch-readers.js', () => ({
  CRYPTO_TOUCH_READERS: {
    normalize: (s: string) => s,
    getBook: () => state.book,
    isBookTrusted: () => state.bookTrusted !== false,
    getCached: () => state.cached,
  },
}));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({ getLatestEquityTick: () => state.tick }));
vi.mock('../../asset_classes/xstock_spot/sigma-rate-cache.js', () => ({ getCachedSigma: () => state.sigma }));
vi.mock('../../asset_classes/xstock_spot/mark-staleness-config.js', () => ({
  readXstockMarkStalenessConfig: () => {
    if (state.throwKnobs) throw new Error('mark_staleness knobs missing');
    return { budgetK: 0.5, nullStopBudgetPct: 0.005, floorMs: 15_000, capMs: 300_000, sigmaRefreshAfterMs: 300_000 };
  },
  readXstockSigmaCacheConfig: () => ({}),
}));
vi.mock('../../asset_classes/xstock_spot/book-state-config.js', () => ({
  resolveBookStateConfigSync: () => ({ kRel: 3, floorPct: 1.0, trailingSpreadWindowSnaps: 200 }),
}));
vi.mock('../../asset_classes/xstock_spot/entry-spread-plausibility.js', async (orig) => {
  const real: any = await orig();
  return { ...real, resolveEntryYardstick: async () => state.yard };
});

import { readRetirementAsk } from '../../services/rtb-retirement-ask.js';

const NOW = 1_800_000_000_000;
const tick = (bid: number | null, ask: number | null, opts: Partial<{ askQty: number | null; ageMs: number; observed: boolean }> = {}) => ({
  price: bid !== null && ask !== null ? (bid + ask) / 2 : (ask ?? bid ?? 0), tsMs: NOW - (opts.ageMs ?? 1_000), kind: 'mid',
  observed: opts.observed ?? true,
  raw: { bid, ask, last: null, bidQty: 10, askQty: opts.askQty === undefined ? 10 : opts.askQty, atMs: NOW - (opts.ageMs ?? 1_000) },
});

beforeEach(() => {
  state.book = null; state.cached = null; state.tick = null; state.sigma = null; state.throwKnobs = false;
  state.yard = { median: 0.001, basis: 'regular_session', n: 200 };
});

describe('xStock — every arm of the contract', () => {
  const xs = (stop = 160) => readRetirementAsk({ symbol: 'SKHY/USD', assetClass: 'xstock_spot', stopPrice: stop }, NOW);
  it('a fresh, two-sided, plausible tick ⇒ admissible, the ASK', async () => {
    state.tick = tick(167.78, 167.95);
    expect(await xs()).toMatchObject({ ok: true, ask: 167.95, bid: 167.78 });
  });
  it('no tick ⇒ keep', async () => { expect(await xs()).toEqual({ ok: false, reason: 'xstock_no_tick' }); });
  it('a COLD mark (only the venue replay on a subscribe) ⇒ keep', async () => {
    state.tick = tick(167.78, 167.95, { observed: false });
    expect(await xs()).toEqual({ ok: false, reason: 'xstock_cold_mark' });
  });
  it('a crossed or one-sided book ⇒ keep', async () => {
    state.tick = tick(168, 167.95);
    expect(await xs()).toEqual({ ok: false, reason: 'xstock_not_two_sided' });
    state.tick = tick(null, 167.95);
    expect(await xs()).toEqual({ ok: false, reason: 'xstock_not_two_sided' });
  });
  it("Langston's weekend placeholders (ORCL 135.50/210.00, AMAT 400.00/520.51) carried NULL ask quantity ⇒ keep (the hollow arm)", async () => {
    state.tick = tick(135.5, 210, { askQty: null });
    expect(await xs(130)).toEqual({ ok: false, reason: 'xstock_ask_qty_absent' });
    state.tick = tick(400, 520.51, { askQty: 0 });
    expect(await xs(390)).toEqual({ ok: false, reason: 'xstock_ask_qty_absent' });
  });
  it('older than the exit ceiling (σ missing ⇒ the 15 s floor) ⇒ keep', async () => {
    state.tick = tick(167.78, 167.95, { ageMs: 16_000 });
    expect(await xs()).toEqual({ ok: false, reason: 'xstock_stale' });
  });
  it("RCL's 276/300 book (~8 % spread, quantities present) against a ~0.1 % yardstick ⇒ keep (stands in for ask_spiked)", async () => {
    state.tick = tick(276, 300);
    expect(await xs(270)).toEqual({ ok: false, reason: 'xstock_implausible_spread' });
  });
  it('⛔ C6: no yardstick (under_window / read_failed) ⇒ NOT admissible — the entry seam passes here, the retirement keeps', async () => {
    state.tick = tick(167.78, 167.95);
    state.yard = { median: null, basis: 'under_window', n: 12 };
    expect(await xs()).toEqual({ ok: false, reason: 'xstock_yardstick_under_window' });
  });
  it('⛔ C6: a thrown read (knobs missing) ⇒ keep', async () => {
    state.tick = tick(167.78, 167.95);
    state.throwKnobs = true;
    expect((await xs()) as any).toMatchObject({ ok: false });
    expect(((await xs()) as any).reason).toMatch(/^read_error:/);
  });
});

describe('crypto — the paper exit policy (2 s, 2 % spread)', () => {
  const cr = () => readRetirementAsk({ symbol: 'DOT/USD', assetClass: 'crypto_spot', stopPrice: 0.9878 }, NOW);
  it('a fresh two-sided book ⇒ admissible, the ASK', async () => {
    state.book = { bids: [{ price: 1.2767 }], asks: [{ price: 1.2768 }], ageMs: 300 };
    expect(await cr()).toMatchObject({ ok: true, ask: 1.2768, bid: 1.2767 });
  });
  it('a book older than 2 s with no fresh ticker sides ⇒ keep', async () => {
    state.book = { bids: [{ price: 1.2767 }], asks: [{ price: 1.2768 }], ageMs: 5_000 };
    const r: any = await cr();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^crypto_/);
  });
  it('a spread above 2 % ⇒ keep (the entry policy would have admitted it: its ceiling is +Infinity)', async () => {
    state.book = { bids: [{ price: 1.0 }], asks: [{ price: 1.05 }], ageMs: 300 };
    const r: any = await cr();
    expect(r.ok).toBe(false);
  });
});

describe('⛔ C5 — dispatch on the persisted class, never the symbol', () => {
  it('STX/USD stamped crypto_spot reads the CRYPTO book even though an equities tick exists for STX', async () => {
    state.book = { bids: [{ price: 0.3856 }], asks: [{ price: 0.3857 }], ageMs: 300 };
    state.tick = tick(777.87, 782.23); // the xStock STX — must never be read for the crypto row
    expect(await readRetirementAsk({ symbol: 'STX/USD', assetClass: 'crypto_spot', stopPrice: 0.37 }, NOW)).toMatchObject({ ok: true, ask: 0.3857 });
  });
  it('STX/USD stamped xstock_spot reads the EQUITIES tick even though a crypto book exists for STX', async () => {
    state.book = { bids: [{ price: 0.3856 }], asks: [{ price: 0.3857 }], ageMs: 300 };
    state.tick = tick(777.87, 778.2);
    state.yard = { median: 0.003, basis: 'regular_session', n: 200 };
    expect(await readRetirementAsk({ symbol: 'STX/USD', assetClass: 'xstock_spot', stopPrice: 760 }, NOW)).toMatchObject({ ok: true, ask: 778.2 });
  });
  it('an unresolvable class ⇒ keep; a class with no rule ⇒ keep', async () => {
    expect(await readRetirementAsk({ symbol: 'STX/USD', assetClass: null, stopPrice: 1 }, NOW)).toEqual({ ok: false, reason: 'class_unresolved' });
    expect(await readRetirementAsk({ symbol: 'BTC-PERP', assetClass: 'crypto_perp', stopPrice: 1 }, NOW)).toEqual({ ok: false, reason: 'class_unsupported' });
  });
});
