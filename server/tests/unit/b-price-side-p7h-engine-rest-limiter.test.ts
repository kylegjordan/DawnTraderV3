// B-PRICE-SIDE-BY-JOB r5 — P-7h (decision D7; pre-audit A-9.4; Langston's P-7h ruling (a) and three conditions,
// 2026-09-11): the engine's direct Kraken REST fallback goes through the SHARED REST token bucket.
//
// POSITIVE CONTROLS: before P-7h, `takeToken`, `resolveEngineRestFallback` and `AGE_EXEMPTION_BY_PRODUCER` do not
// exist and the engine's crypto REST leg calls `this.krakenService.getTicker(restPair)` bare. The behavioural controls
// are mutations, recorded in the Step 4 change list: calling the venue before taking the token fails test 4;
// collapsing the venue rate-limit refusal into `rest_failed` fails test 6; handing the engine a token source that
// always says yes fails test 10.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RestRateLimiter } from '../../services/market-data/rest-rate-limiter.js';
import { resolveEngineRestFallback, classifyEngineRestFailure } from '../../services/market-data/engine-rest-fallback.js';
import { markKindOf } from '../../services/market-data/mark-kind.js';
import {
  AGE_EXEMPTION_BY_PRODUCER,
  BASIS_BY_PRODUCER,
  ageExemptionOfProducer,
} from '../../services/market-data/price-basis.js';

afterEach(() => vi.restoreAllMocks());

const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {});
// Refill far beyond any test's runtime, so the bucket moves only when a test moves it.
const limiter = (maxTokens: number) => new RestRateLimiter({ maxTokens, refillIntervalMs: 1e12 });
const TICKER = { XXBTZUSD: { a: ['101', '1', '1.000'], b: ['99', '1', '1.000'], c: ['100.5', '0.1'] } };

describe('P-7h — the limiter: a token from the shared bucket, and nothing else', () => {
  it('1. takeToken draws from the SAME bucket check() uses', () => {
    quiet();
    const lim = limiter(3);
    expect(lim.takeToken()).toBe(true);
    expect(lim.takeToken()).toBe(true);
    expect(lim.takeToken()).toBe(true);
    expect(lim.check('ETH/USD')).toBe(false);
    expect(lim.getBlockedReason('ETH/USD')).toBe('no_tokens');
  });

  it('2. takeToken never reads or arms the per-symbol cooldown', () => {
    quiet();
    const lim = limiter(5);
    expect(lim.check('BTC/USD')).toBe(true); // the adapter's fetch arms BTC's 60 s cooldown
    expect(lim.takeToken()).toBe(true); // the engine leg is not held by it
    const fresh = limiter(5);
    fresh.takeToken();
    fresh.takeToken();
    expect(fresh.getCooldownRemaining('BTC/USD')).toBe(0);
    expect(fresh.check('BTC/USD')).toBe(true); // and it arms none for the adapter
  });

  it('3. a token refusal is counted apart from check() refusals', () => {
    quiet();
    const lim = limiter(1);
    expect(lim.takeToken()).toBe(true);
    expect(lim.takeToken()).toBe(false);
    const s = lim.getStats();
    expect(s.tokenOnlyAllowedCount).toBe(1);
    expect(s.tokenOnlyBlockedCount).toBe(1);
    expect(s.blockedCount).toBe(0);
    expect(s.allowedCount).toBe(0);
  });
});

describe('P-7h — the engine REST fallback, as behaviour', () => {
  it('4. ★ a refused token never reaches the venue: a refused action, not a bare fetch', async () => {
    quiet();
    const lim = limiter(1);
    lim.takeToken(); // the budget is now empty
    const getTicker = vi.fn(async (_pair: string) => TICKER as Record<string, any>);
    const r = await resolveEngineRestFallback('XXBTZUSD', { takeToken: () => lim.takeToken(), getTicker });
    expect(r).toEqual({ kind: 'skip', reason: 'rest_token_exhausted' });
    expect(getTicker).not.toHaveBeenCalled();
  });

  it('5. a normal read spends exactly one token and keeps the 8.9.2 arithmetic', async () => {
    quiet();
    const lim = limiter(3);
    const r = await resolveEngineRestFallback('XXBTZUSD', {
      takeToken: () => lim.takeToken(),
      getTicker: async () => TICKER,
    });
    expect(lim.getStats().tokens).toBe(2);
    expect(r).toEqual({ kind: 'price', price: 100, bid: 99, ask: 101, lastTrade: 100.5, markKind: markKindOf(99, 101) });
  });

  it('6. ★ a token taken is never refunded — a request that THROWS still spends it — and a venue rate-limit is its own reason', async () => {
    quiet();
    const lim = limiter(3);
    const r = await resolveEngineRestFallback('XXBTZUSD', {
      takeToken: () => lim.takeToken(),
      getTicker: async () => {
        throw new Error('Kraken API error: EAPI:Rate limit exceeded');
      },
    });
    expect(r.kind).toBe('skip');
    expect(r.kind === 'skip' ? r.reason : null).toBe('rest_venue_rate_limited');
    expect(lim.getStats().tokens).toBe(2);
  });

  it('7. any other throw is rest_failed; an empty answer is rest_no_data; a one-sided book falls back to the last trade', async () => {
    quiet();
    const failed = await resolveEngineRestFallback('X', {
      takeToken: () => true,
      getTicker: async () => {
        throw new Error('fetch failed');
      },
    });
    expect(failed.kind === 'skip' ? failed.reason : null).toBe('rest_failed');
    const empty = await resolveEngineRestFallback('X', { takeToken: () => true, getTicker: async () => ({}) });
    expect(empty).toEqual({ kind: 'skip', reason: 'rest_no_data' });
    const oneSided = await resolveEngineRestFallback('X', {
      takeToken: () => true,
      getTicker: async () => ({ P: { a: ['101'], b: ['0'], c: ['100.5'] } }),
    });
    expect(oneSided.kind === 'price' ? oneSided.markKind : null).toBe('last');
    expect(oneSided.kind === 'price' ? oneSided.price : null).toBe(100.5);
  });

  it('8. classifyEngineRestFailure splits out only the venue rate-limit code', () => {
    expect(classifyEngineRestFailure(new Error('Kraken API error: EAPI:Rate limit exceeded'))).toBe('rest_venue_rate_limited');
    expect(classifyEngineRestFailure('EAPI:Rate limit exceeded')).toBe('rest_venue_rate_limited');
    expect(classifyEngineRestFailure(new Error('Kraken API error: EGeneral:Internal error'))).toBe('rest_failed');
    expect(classifyEngineRestFailure(new Error('fetch failed'))).toBe('rest_failed');
    expect(classifyEngineRestFailure(undefined)).toBe('rest_failed');
  });
});

describe('P-7h — the named age exemption (Langston condition 2)', () => {
  it('9. the exemption is total over producers and names exactly the direct engine REST fetch', () => {
    expect(Object.keys(AGE_EXEMPTION_BY_PRODUCER).sort()).toEqual(Object.keys(BASIS_BY_PRODUCER).sort());
    const exempt = Object.entries(AGE_EXEMPTION_BY_PRODUCER)
      .filter(([, v]) => v !== null)
      .map(([k]) => k)
      .sort();
    expect(exempt).toEqual(['kraken_rest_engine_fallback_last', 'kraken_rest_engine_fallback_mid']);
    expect(ageExemptionOfProducer('kraken_rest_engine_fallback_mid')).toBe('fetch_fresh_by_construction');
    // the adapter's REST reads carry a real observedAt, and its re-serves carry an OLD one: neither is exempt
    expect(ageExemptionOfProducer('kraken_rest_poller')).toBeNull();
    expect(ageExemptionOfProducer('kraken_rest_rate_limited_reserve')).toBeNull();
    expect(ageExemptionOfProducer('last_known_good_reserve')).toBeNull();
  });
});

describe('P-7h — the engine wires it (source fence)', () => {
  const src = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf-8');
  const legStart = src.indexOf('[I7][REST_FALLBACK] symbol=${position.symbol}');
  const legEnd = src.indexOf('← closes the P19-B8.5 xstock/crypto pricing-leg split');
  const leg = src.slice(legStart, legEnd);

  it('10. the crypto REST leg goes through the helper with the shared bucket, and no bare fetch is left', () => {
    expect(legStart).toBeGreaterThan(-1);
    expect(legEnd).toBeGreaterThan(legStart);
    expect(leg).toContain('resolveEngineRestFallback(restPair');
    expect(leg).toContain('takeToken: () => restRateLimiter.takeToken()');
    expect(leg).not.toContain('this.krakenService.getTicker(restPair)');
    expect(leg).toContain('this._recordPriceSkip(position, _rest.reason)');
    expect(leg).toContain('ageExemptionOfProducer(priceProducer)');
  });

  it('11. the engine uses only takeToken on the limiter, and its catch neither refunds nor pools the venue refusal', () => {
    const uses = src.match(/restRateLimiter\.\w+/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    expect(new Set(uses)).toEqual(new Set(['restRateLimiter.takeToken']));
    const c0 = leg.indexOf('} catch (krakenError) {');
    expect(c0).toBeGreaterThan(-1);
    const catchBody = leg.slice(c0, leg.indexOf('continue;', c0));
    expect(catchBody).not.toContain('restRateLimiter');
    expect(catchBody).toContain('classifyEngineRestFailure(krakenError)');
  });

  it('12. the three new counts are printed on the EVAL_EXIT line', () => {
    const from = src.slice(src.indexOf('[I7-PRICE-FIX][EVAL_EXIT]'));
    const oneLine = from.slice(0, from.indexOf('\n'));
    for (const k of [
      'restTokenExhausted=${restTokenExhausted}',
      'restVenueRateLimited=${restVenueRateLimited}',
      'restAgeExempt=${restAgeExempt}',
    ]) {
      expect(oneLine).toContain(k);
    }
  });
});
