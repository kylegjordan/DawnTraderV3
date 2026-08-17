/**
 * P19-B-PERPFEED — the pinned classification + mapping tests Langston required
 * at Step-1/Step-2 review:
 *  - the 14 X-ending crypto collision names classify CRYPTO, never equity
 *    (the silent-wrong-answer class the old regex produced);
 *  - negative control: the 16 live equity names (incl. the 2 Pre-IPO) still
 *    classify EQUITY unchanged;
 *  - the 20 dated futures (FF_/FI_) are refused by the perpetuality test;
 *  - the 4 PI_ inverse perps are refused;
 *  - the 3 FX perps land UNCLASSIFIED (never silently binned as crypto);
 *  - canonicalizer: crypto members map by venue grammar (PF_TRXUSD →
 *    TRX/USD:PERP), equity members keep the X-separator grammar;
 *  - resolveAssetClass: membership decides; non-members THROW when the
 *    registries are live (the default-to-crypto else is gone);
 *  - OBJ-8: a class throttle override never touches the other legs
 *    (byte-identical default path).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  classifyKrakenFuturesInstrument,
  normalizeSpotBaseForJoin,
  fetchSpotAssetAltnames,
  fetchKrakenFuturesInstruments,
  assertClassifiedPlausible,
  type KrakenFuturesInstrument,
} from '../../services/passive-archive/universe-loader.js';
import {
  registerCryptoPerpVenueSymbols,
  registerXstockPerpVenueSymbols,
  resolveAssetClass,
  __resetPerpRegistriesForTest,
} from '../../../shared/asset-classes.js';
import { toCanonical } from '../../services/utils/symbol-canonicalizer.js';
import { bufferTickerSnap, setTickerThrottle, setTickerThrottleForClass } from '../../services/passive-archive/ticker-batch-writer.js';

// The 14 truncation victims (Langston's live enumeration 2026-08-17).
const COLLISION_CRYPTO: Array<[string, string]> = [
  ['PF_AVAXUSD', 'AVAX'], ['PF_CFXUSD', 'CFX'], ['PF_CVXUSD', 'CVX'],
  ['PF_DYDXUSD', 'DYDX'], ['PF_FLUXUSD', 'FLUX'], ['PF_GMXUSD', 'GMX'],
  ['PF_ICXUSD', 'ICX'], ['PF_IMXUSD', 'IMX'], ['PF_IOTXUSD', 'IOTX'],
  ['PF_SNXUSD', 'SNX'], ['PF_SPXUSD', 'SPX'], ['PF_STXUSD', 'STX'],
  ['PF_TRXUSD', 'TRX'], ['PF_ZRXUSD', 'ZRX'],
];

// The 16 live equity perps (lowercase-x base marker; ANTHROPICx/OPENAIx are
// category Pre-IPO — still tokenized equities by the complete naming marker).
const EQUITY_16: Array<[string, string]> = [
  ['PF_AAPLXUSD', 'AAPLx'], ['PF_AMZNXUSD', 'AMZNx'], ['PF_ANTHROPICXUSD', 'ANTHROPICx'],
  ['PF_COINXUSD', 'COINx'], ['PF_CRCLXUSD', 'CRCLx'], ['PF_GLDXUSD', 'GLDx'],
  ['PF_GOOGLXUSD', 'GOOGLx'], ['PF_HOODXUSD', 'HOODx'], ['PF_METAXUSD', 'METAx'],
  ['PF_MSTRXUSD', 'MSTRx'], ['PF_NVDAXUSD', 'NVDAx'], ['PF_OPENAIXUSD', 'OPENAIx'],
  ['PF_QQQXUSD', 'QQQx'], ['PF_SPCXXUSD', 'SPCXx'], ['PF_SPYXUSD', 'SPYx'],
  ['PF_TSLAXUSD', 'TSLAx'],
];

const DATED_20 = [
  'FF_XBTUSD_260925', 'FF_ETHUSD_260925', 'FF_SOLUSD_260925', 'FF_LTCUSD_260925', 'FF_XRPUSD_260925',
  'FF_XBTUSD_261225', 'FF_ETHUSD_261225', 'FF_SOLUSD_261225', 'FF_LTCUSD_261225', 'FF_XRPUSD_261225',
  'FI_XBTUSD_260828', 'FI_ETHUSD_260828', 'FI_SOLUSD_260828', 'FI_LTCUSD_260828', 'FI_XRPUSD_260828',
  'FI_XBTUSD_260925', 'FI_ETHUSD_260925', 'FI_SOLUSD_260925', 'FI_LTCUSD_260925', 'FI_XRPUSD_260925',
];

const INVERSE_4 = ['PI_XBTUSD', 'PI_ETHUSD', 'PI_LTCUSD', 'PI_XRPUSD'];

const FX_3: Array<[string, string]> = [['PF_EURUSD', 'EUR'], ['PF_GBPUSD', 'GBP'], ['PF_CHFUSD', 'CHF']];

// Crypto-spot universe bases for the positive test (superset of the collision bases).
const SPOT_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'LTC', 'XRP',
  ...COLLISION_CRYPTO.map(([, base]) => base),
]);

function inst(symbol: string, base: string, extra: Partial<KrakenFuturesInstrument> = {}): KrakenFuturesInstrument {
  return { symbol, base, tradeable: true, ...extra };
}

describe('P19-B-PERPFEED classification (field-driven, both-sides-positive)', () => {
  it('classifies all 14 X-ending crypto collision names as CRYPTO candidates (the silent-wrong-answer pin)', () => {
    for (const [symbol, base] of COLLISION_CRYPTO) {
      expect(classifyKrakenFuturesInstrument(inst(symbol, base), SPOT_BASES),
        `${symbol} (base ${base})`).toBe('crypto_perp_candidate');
    }
  });

  it('negative control: all 16 equity names (incl. the 2 Pre-IPO) classify EQUITY unchanged', () => {
    for (const [symbol, base] of EQUITY_16) {
      expect(classifyKrakenFuturesInstrument(inst(symbol, base), SPOT_BASES),
        `${symbol} (base ${base})`).toBe('equity_perp');
    }
  });

  it('perpetuality test: all 20 dated futures are refused — lastTradingTime is decisive regardless of prefix', () => {
    for (const symbol of DATED_20) {
      const base = symbol.split('_')[1].replace(/USD$/, '') === 'XBT' ? 'BTC' : symbol.split('_')[1].replace(/USD$/, '');
      expect(classifyKrakenFuturesInstrument(
        inst(symbol, base, { lastTradingTime: '2026-09-25T08:00:00Z' }), SPOT_BASES,
      ), symbol).toBe('dated');
    }
  });

  it('the 4 PI_ inverse perps are refused', () => {
    for (const symbol of INVERSE_4) {
      expect(classifyKrakenFuturesInstrument(inst(symbol, 'BTC'), SPOT_BASES), symbol).toBe('inverse');
    }
  });

  it('the 3 FX perps land UNCLASSIFIED — never silently binned as crypto', () => {
    for (const [symbol, base] of FX_3) {
      expect(classifyKrakenFuturesInstrument(inst(symbol, base, { tradfi: true }), SPOT_BASES), symbol).toBe('unclassified');
    }
  });

  it('non-tradeable instruments are excluded before any other test', () => {
    expect(classifyKrakenFuturesInstrument(inst('PF_TRXUSD', 'TRX', { tradeable: false }), SPOT_BASES)).toBe('not_tradeable');
  });
});

describe('P19-B-PERPFEED Step-4 BLOCKER-A: the join normalizer', () => {
  const altnames = new Map([['XLTC', 'LTC'], ['XETC', 'ETC'], ['XXBT', 'XBT']]);
  it('legacy X-named spot bases join as plain names — Litecoin classifies crypto, never UNCLASSIFIED', () => {
    expect(normalizeSpotBaseForJoin('XLTC', altnames)).toBe('LTC');
    expect(normalizeSpotBaseForJoin('XETC', altnames)).toBe('ETC');
    // XXBT hits XBASE_TO_PLAIN first (→ BTC), never the altname (XBT).
    expect(normalizeSpotBaseForJoin('XXBT', altnames)).toBe('BTC');
    // plain names pass through untouched
    expect(normalizeSpotBaseForJoin('SOL', altnames)).toBe('SOL');
    // the end-to-end pin: an XLTC-normalized spot set classifies PF_LTCUSD crypto
    const bases = new Set([normalizeSpotBaseForJoin('XLTC', altnames)]);
    expect(classifyKrakenFuturesInstrument(inst('PF_LTCUSD', 'LTC'), bases)).toBe('crypto_perp_candidate');
  });
});

describe('P19-B-PERPFEED membership-driven mapping (BOTH registries COMPLETE — the refuse path armed)', () => {
  beforeAll(() => {
    __resetPerpRegistriesForTest();
    registerCryptoPerpVenueSymbols(
      [...COLLISION_CRYPTO.map(([symbol, base]) => ({ symbol, base, quote: 'USD' })),
       { symbol: 'PF_XBTUSD', base: 'BTC', quote: 'USD' }],
      { complete: true },
    );
    registerXstockPerpVenueSymbols(EQUITY_16.map(([s]) => s), { complete: true });
  });

  it('canonicalizer: crypto members map from the PAYLOAD base — PF_TRXUSD → TRX/USD:PERP, never TR/USD:PERP', () => {
    expect(toCanonical('PF_TRXUSD')).toBe('TRX/USD:PERP');
    expect(toCanonical('PF_AVAXUSD')).toBe('AVAX/USD:PERP');
    expect(toCanonical('PF_DYDXUSD')).toBe('DYDX/USD:PERP');
    expect(toCanonical('PF_STXUSD')).toBe('STX/USD:PERP');
  });

  it('FINDING-D pin: PF_XBTUSD maps via the payload base to BTC/USD:PERP — never the XBT string slice', () => {
    expect(toCanonical('PF_XBTUSD')).toBe('BTC/USD:PERP');
  });

  it('canonicalizer: equity members keep the X-separator grammar unchanged', () => {
    expect(toCanonical('PF_AAPLXUSD')).toBe('AAPL/USD:PERP');
    expect(toCanonical('PF_TSLAXUSD')).toBe('TSLA/USD:PERP');
  });

  it('canonicalizer: a futures-shaped symbol in NEITHER complete registry throws (dated/inverse/FX refused)', () => {
    expect(() => toCanonical('FF_XBTUSD_260925')).toThrow(/UNCLASSIFIED/);
    expect(() => toCanonical('PI_XBTUSD')).toThrow(/UNCLASSIFIED/);
    expect(() => toCanonical('PF_EURUSD')).toThrow(/UNCLASSIFIED/);
  });

  it('resolveAssetClass: membership decides both sides; the default-to-crypto else is GONE', () => {
    expect(resolveAssetClass('PF_TRXUSD', 'kraken-futures')).toBe('crypto_perp');
    expect(resolveAssetClass('PF_AAPLXUSD', 'kraken-futures')).toBe('xstock_perp');
    expect(() => resolveAssetClass('FF_XBTUSD_260925', 'kraken-futures')).toThrow(/UNCLASSIFIED/);
    expect(() => resolveAssetClass('PI_XBTUSD', 'kraken-futures')).toThrow(/UNCLASSIFIED/);
  });
});

describe('P19-B-PERPFEED Step-4 BLOCKER-F: a degraded altname fetch REFUSES the recompute (negative leg)', () => {
  // The throw happens in fetchSpotAssetAltnames, which recomputeCryptoPerpUniverse
  // calls BEFORE any setConstant/registration — so "refused" structurally means
  // nothing persisted and both completeness flags stay false (the resolver
  // stays in fallback). These pin every degradation shape:
  const mkResp = (ok: boolean, status: number, body: unknown) =>
    ({ ok, status, json: async () => body }) as unknown as Response;

  it('HTTP failure → throws, never an empty map', async () => {
    await expect(fetchSpotAssetAltnames(async () => mkResp(false, 503, {}))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('venue error payload on a 200 → throws', async () => {
    await expect(fetchSpotAssetAltnames(async () => mkResp(true, 200, { error: ['EService:Unavailable'], result: {} }))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('empty result on a clean 200 → throws (an empty altname map cannot be a complete input)', async () => {
    await expect(fetchSpotAssetAltnames(async () => mkResp(true, 200, { error: [], result: {} }))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('healthy payload → the map, with altnames intact', async () => {
    const map = await fetchSpotAssetAltnames(async () => mkResp(true, 200, { error: [], result: { XLTC: { altname: 'LTC' }, XETC: { altname: 'ETC' } } }));
    expect(map.get('XLTC')).toBe('LTC');
    expect(map.get('XETC')).toBe('ETC');
  });
});

describe('P19-B-PERPFEED Step-4 BLOCKER-G: a degraded INSTRUMENTS fetch refuses the recompute (the primary input)', () => {
  const mkResp = (ok: boolean, status: number, body: unknown) =>
    ({ ok, status, json: async () => body }) as unknown as Response;

  it('HTTP failure → throws', async () => {
    await expect(fetchKrakenFuturesInstruments(async () => mkResp(false, 502, {}))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('venue result != success on a 200 → throws', async () => {
    await expect(fetchKrakenFuturesInstruments(async () => mkResp(true, 200, { result: 'error', error: 'apiLimitExceeded' }))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('missing/empty instrument list on a clean 200 → throws (an empty universe cannot be a complete input)', async () => {
    await expect(fetchKrakenFuturesInstruments(async () => mkResp(true, 200, { result: 'success', instruments: [] }))).rejects.toThrow(/REFUSING the recompute/);
    await expect(fetchKrakenFuturesInstruments(async () => mkResp(true, 200, { result: 'success' }))).rejects.toThrow(/REFUSING the recompute/);
  });
  it('healthy payload → the instrument list intact', async () => {
    const list = await fetchKrakenFuturesInstruments(async () => mkResp(true, 200, {
      result: 'success',
      instruments: [{ symbol: 'PF_XBTUSD', base: 'BTC', quote: 'USD', tradeable: true }],
    }));
    expect(list).toHaveLength(1);
    expect(list[0].base).toBe('BTC');
  });
});

describe('P19-B-PERPFEED Step-4 BLOCKER-H + §13 floor: the third input and partial degradation', () => {
  it('plausibility floor: a halved classified set REFUSES; above half passes; first-ever run has no floor', () => {
    // partial degradation of ANY input shows up as an imploded output
    expect(() => assertClassifiedPlausible(200, 99)).toThrow(/REFUSING the recompute/);
    expect(() => assertClassifiedPlausible(200, 100)).not.toThrow();
    expect(() => assertClassifiedPlausible(null, 5)).not.toThrow();  // birth recompute
    expect(() => assertClassifiedPlausible(0, 0)).not.toThrow();     // empty prior is no floor
  });
});

describe('P19-B-PERPFEED Step-4 ordering pin: both refuse-on-degraded fetches precede ALL persistence', () => {
  // Langston's non-blocking note on r3, converted from a filed hope into an
  // enforced pin: BLOCKER-F/G are STRUCTURAL only while the guarded fetches sit
  // above every write in recomputeCryptoPerpUniverse — a future edit moving a
  // setConstant above them would un-do both silently. This test reads the
  // SOURCE and asserts the ordering inside the recompute function body.
  it('in recomputeCryptoPerpUniverse: instruments + altnames fetches come before every setConstant/register call', () => {
    const src = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/passive-archive/universe-loader.ts'),
      'utf-8',
    );
    const fnStart = src.indexOf('export async function recomputeCryptoPerpUniverse');
    expect(fnStart).toBeGreaterThan(-1);
    const body = src.slice(fnStart);
    const idxInstruments = body.indexOf('fetchKrakenFuturesInstruments(');
    const idxAltnames = body.indexOf('fetchSpotAssetAltnames(');
    const idxFirstPersist = Math.min(
      ...['setConstant(', 'registerXstockPerpVenueSymbols(', 'registerCryptoPerpVenueSymbols(']
        .map(s => body.indexOf(s)).filter(i => i > -1),
    );
    expect(idxInstruments).toBeGreaterThan(-1);
    expect(idxAltnames).toBeGreaterThan(-1);
    expect(idxInstruments).toBeLessThan(idxFirstPersist);
    expect(idxAltnames).toBeLessThan(idxFirstPersist);
    // BLOCKER-H's call-site guard + the §13 floor also precede every write
    const idxEmptyGuard = body.indexOf('cryptoSpotBases.size === 0');
    const idxFloor = body.indexOf('assertClassifiedPlausible(');
    // Langston r12: the EXPLOSION guard sits beside its implosion twin, above persistence
    const idxCapGuard = body.indexOf('candidates.length > cap');
    expect(idxEmptyGuard).toBeGreaterThan(-1);
    expect(idxFloor).toBeGreaterThan(-1);
    expect(idxCapGuard).toBeGreaterThan(-1);
    expect(idxEmptyGuard).toBeLessThan(idxFirstPersist);
    expect(idxFloor).toBeLessThan(idxFirstPersist);
    expect(idxCapGuard).toBeLessThan(idxFirstPersist);
  });
});

describe('P19-B-PERPFEED Step-4 BLOCKER-C: incomplete registries NEVER arm the refuse path', () => {
  // Cross-reference: b74-symbol-canonicalizer-perp.test.ts:131,:137 assert
  // PI_XBTUSD/PF_XBTUSD → crypto_perp with EMPTY registries — that is this
  // fallback branch, and both files pass under vitest per-file isolation.
  // This block pins the gated-OFF-deploy state: equity side registered but
  // INCOMPLETE (the 10-name static JSON, #687), crypto side never started.
  it('equity-registered-but-incomplete + crypto-empty = pre-batch behavior verbatim, no throws', () => {
    __resetPerpRegistriesForTest();
    registerXstockPerpVenueSymbols(['PF_AAPLXUSD'] /* static JSON, NO complete flag */);
    // crypto perps fall to the shape fallback → crypto_perp (pre-batch behavior)
    expect(resolveAssetClass('PF_XBTUSD', 'kraken-futures')).toBe('crypto_perp');
    // the 6 live equity names missing from the static JSON (#687) fall to the
    // shape fallback → xstock_perp — NOT a throw
    expect(resolveAssetClass('PF_AMZNXUSD', 'kraken-futures')).toBe('xstock_perp');
    // dated futures unfortunately also fall through pre-switch-on (pre-batch
    // behavior preserved by design — the refuse path arms at first recompute)
    expect(resolveAssetClass('FF_XBTUSD_260925', 'kraken-futures')).toBe('crypto_perp');
  });
});

describe('P19-B-PERPFEED OBJ-8 per-class throttle (#440 takeover)', () => {
  it('an override on crypto_perp never touches the other legs (byte-identical default path)', () => {
    setTickerThrottle(50);
    setTickerThrottleForClass('crypto_perp', 10_000);

    const row = (symbol: string) => ({
      symbol, assetClass: 'x', exchange: 'kraken-futures', capturedAt: new Date(),
    }) as any;

    // crypto_perp: first accepted, immediate second THROTTLED by the override.
    expect(bufferTickerSnap('crypto_perp', row('PF_TESTUSD'))).toBe(true);
    expect(bufferTickerSnap('crypto_perp', row('PF_TESTUSD'))).toBe(false);

    // xstock_perp: governed by the GLOBAL value only — after the global window
    // passes, a second snap is accepted even though the crypto override is huge.
    expect(bufferTickerSnap('xstock_perp', row('PF_OTHERXUSD'))).toBe(true);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(bufferTickerSnap('xstock_perp', row('PF_OTHERXUSD'))).toBe(true);
        // clearing the override restores the global path for crypto_perp too
        setTickerThrottleForClass('crypto_perp', null);
        expect(bufferTickerSnap('crypto_perp', row('PF_TEST2USD'))).toBe(true);
        resolve();
      }, 60);
    });
  });
});
