// P19-B8.5 (OBJ-8) — the venue-validate leg: conservative classifier (Langston
// Step-2 condition: ONLY a definitive, parseable venue rejection fails closed;
// every ambiguity resolves OPEN as a visible skip) + precision formatting +
// the timeout-is-an-ambiguity contract.
import { describe, it, expect } from 'vitest';
import {
  classifyKrakenValidateError,
  formatToDecimals,
  validatePaperOrderWithVenue,
} from '../../services/execution/venue-validate.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';

describe('[P19-B8.5] classifyKrakenValidateError — the conservative classifier', () => {
  it('DEFINITIVE order-level venue rejections fail CLOSED', () => {
    for (const m of [
      'Kraken API error: EOrder:Order minimum not met',
      'Kraken API error: EGeneral:Invalid arguments:price',
      'Kraken API error: EQuery:Unknown asset pair',
    ]) {
      expect(classifyKrakenValidateError(new Error(m)).kind).toBe('rejected');
    }
  });

  it('venue-shaped AMBIGUITIES resolve OPEN (rate limit, service, lockout, auth)', () => {
    for (const m of [
      'Kraken API error: EAPI:Rate limit exceeded',
      'Kraken API error: EService:Unavailable',
      'Kraken API error: EService:Busy',
      'Kraken API error: EGeneral:Temporary lockout',
      'Kraken API error: EAPI:Invalid key',
    ]) {
      expect(classifyKrakenValidateError(new Error(m)).kind).toBe('skipped');
    }
  });

  it('transport/parse trouble and UNKNOWN codes resolve OPEN — never a guessed rejection', () => {
    expect(classifyKrakenValidateError(new Error('fetch failed: ECONNRESET')).kind).toBe('skipped');
    expect(classifyKrakenValidateError(new Error('validate timeout 4000ms')).kind).toBe('skipped');
    expect(classifyKrakenValidateError(new Error('Unexpected token < in JSON')).kind).toBe('skipped');
    expect(classifyKrakenValidateError(new Error('Kraken API error: EFuture:Some new code')).kind).toBe('skipped');
    expect(classifyKrakenValidateError('not-even-an-error')).toEqual(expect.objectContaining({ kind: 'skipped' }));
  });
});

describe('[P19-B8.5] formatToDecimals — venue precision, never OUR false rejection', () => {
  it('caps to the pair precision and trims trailing zeros', () => {
    expect(formatToDecimals(65123.123456789, 1, 5)).toBe('65123.1');
    expect(formatToDecimals(0.5, 8, 8)).toBe('0.5');
    expect(formatToDecimals(2, 4, 8)).toBe('2');
  });
  it('falls back when the pair metadata is absent/invalid', () => {
    expect(formatToDecimals(1.23456789012, undefined, 5)).toBe('1.23457');
    expect(formatToDecimals(1.5, -3 as any, 5)).toBe('1.5');
  });
});

describe('[P19-B8.5] validatePaperOrderWithVenue — end-to-end outcomes (stubbed venue)', () => {
  const SYM = 'B85TEST/USD';
  // Register a synthetic pair mapping so the resolver finds our test symbol.
  (krakenAssetPairsService as any).autoMap?.set?.(SYM.toUpperCase(), {
    internalSymbol: SYM, krakenRestPair: 'B85TESTUSD', krakenWsPair: SYM, krakenPairKey: 'B85TESTUSD',
    base: 'B85TEST', quote: 'USD', rawBase: 'B85TEST', rawQuote: 'ZUSD',
    isSpot: true, isMargin: false, isHalted: false, tier: 1, tierReason: 'test',
    pairDecimals: 1, lotDecimals: 4,
  });

  it('venue accepts → ok, with precision-formatted params sent', async () => {
    let sent: any;
    const r = await validatePaperOrderWithVenue({
      symbol: SYM, quantity: 0.123456789, limitPrice: 65123.987654,
      addOrder: async (p) => { sent = p; return {}; },
    });
    expect(r.outcome).toBe('ok');
    expect(sent).toMatchObject({ pair: 'B85TESTUSD', validate: true, ordertype: 'limit', type: 'buy' });
    expect(sent.price).toBe('65124'); // pairDecimals=1 → 65124.0 → trimmed
    expect(sent.volume).toBe('0.1235'); // lotDecimals=4
  });

  it('definitive venue rejection → rejected (the caller drops the open loudly)', async () => {
    const r = await validatePaperOrderWithVenue({
      symbol: SYM, quantity: 0.0001, limitPrice: 1,
      addOrder: async () => { throw new Error('Kraken API error: EOrder:Order minimum not met'); },
    });
    expect(r.outcome).toBe('rejected');
  });

  it('network throw → skipped; missing pair mapping → skipped (our map ≠ a venue verdict)', async () => {
    const r1 = await validatePaperOrderWithVenue({
      symbol: SYM, quantity: 1, limitPrice: 1,
      addOrder: async () => { throw new Error('fetch failed: ETIMEDOUT'); },
    });
    expect(r1.outcome).toBe('skipped');
    const r2 = await validatePaperOrderWithVenue({
      symbol: 'NOSUCHPAIR/USD', quantity: 1, limitPrice: 1,
      addOrder: async () => ({}),
    });
    expect(r2.outcome).toBe('skipped');
  });
});
