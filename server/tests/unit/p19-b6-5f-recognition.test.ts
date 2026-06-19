/**
 * P19-B6.5f (reorg-B1) — Symbol-recognition completeness, BOTH classes.
 *
 * Locks the both-class recognition fix:
 *  - the newer Kraken stablecoin quotes (EUROP/PYUSD/RLUSD, 5-char) now classify crypto_spot
 *    (the 6 B6.5e classify-fallthrough alerts) — via the QUOTE_LEN length widen;
 *  - the quote-LENGTH bound is the SSOT (regex BUILT from QUOTE_LEN_MAX — a literal revert fails CI);
 *  - the quote-LIST SSOT is self-healing (a quote injected via setDiscoveredQuotes is recognized
 *    in the compact/no-slash form — proves the raw-form regexes rebuild from the SSOT, not a literal);
 *  - the xStock display form widens in LOCKSTEP (5-char quote);
 *  - an UNRECOGNIZED quote fires the NAMED hook (meta.unknownQuote) + still fail-closed-skips;
 *  - collision precedence preserved (SUI/USD → crypto_spot).
 */
import {
  resolveAssetClass,
  safeResolveAssetClass,
  setClassifyFallthroughHook,
  setDiscoveredQuotes,
  getRecognitionQuotes,
  CRYPTO_SPOT_CANONICAL,
  KNOWN_QUOTE_CURRENCIES,
  QUOTE_LEN_MAX,
  ASSET_CLASSES,
  type ClassifyFallthroughMeta,
} from '../../../shared/asset-classes.js';
import { toCanonical } from '../../services/utils/symbol-canonicalizer.js';

describe('P19-B6.5f (reorg-B1) — recognition completeness', () => {
  afterEach(() => {
    setClassifyFallthroughHook(null);
    setDiscoveredQuotes(null); // reset the SSOT slot to the curated fallback
  });

  describe('crypto: newer stablecoin quotes classify (the 6 alerts)', () => {
    it('slash-form 5-char quotes resolve crypto_spot', () => {
      expect(resolveAssetClass('ETH/EUROP', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
      expect(resolveAssetClass('ETH/PYUSD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
      expect(resolveAssetClass('XRP/RLUSD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
      expect(resolveAssetClass('ETH/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT); // control
    });

    it('compact (no-slash) form splits on the SSOT quote, longest-first', () => {
      expect(toCanonical('ETHEUROP')).toBe('ETH/EUROP'); // EUROP wins over EUR
      expect(toCanonical('XRPPYUSD')).toBe('XRP/PYUSD');
      expect(resolveAssetClass('ETHEUROP', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
    });
  });

  describe('length bound is the SSOT (built from QUOTE_LEN_MAX — literal revert fails here)', () => {
    it('accepts a quote of exactly QUOTE_LEN_MAX and rejects QUOTE_LEN_MAX+1', () => {
      const okQuote = 'Q'.repeat(QUOTE_LEN_MAX);
      const tooLong = 'Q'.repeat(QUOTE_LEN_MAX + 1);
      expect(CRYPTO_SPOT_CANONICAL.test(`AAA/${okQuote}`)).toBe(true);
      expect(CRYPTO_SPOT_CANONICAL.test(`AAA/${tooLong}`)).toBe(false);
    });

    it('confirms the live longest leg (5) is covered', () => {
      expect(QUOTE_LEN_MAX).toBeGreaterThanOrEqual(5);
    });
  });

  describe('quote-LIST SSOT is self-healing (raw-form regexes rebuild, not literals)', () => {
    it('a quote injected via setDiscoveredQuotes is recognized in compact form', () => {
      expect(safeResolveAssetClass('FOOZZ', 'kraken')).toBeNull(); // ZZ unknown → not recognized
      setDiscoveredQuotes(new Set([...KNOWN_QUOTE_CURRENCIES, 'ZZ']));
      expect(getRecognitionQuotes().has('ZZ')).toBe(true);
      expect(resolveAssetClass('FOOZZ', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT); // rebuilt RAW_2 matches
    });
  });

  describe('xStock display form widens in lockstep (D2)', () => {
    it('a 5-char-quote display form resolves xstock_spot', () => {
      // exchange-context-free display form: AAPLx/<5-char> must classify xstock_spot
      expect(resolveAssetClass('AAPLx/EUROP', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
      expect(resolveAssetClass('AAPLx/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT); // control
    });
  });

  describe('named unknown-quote alert + fail-closed (OBJ-4)', () => {
    it('an unrecognizable over-length quote names the quote on the hook and returns null', () => {
      const seen: Array<{ s: string; e: string; meta?: ClassifyFallthroughMeta }> = [];
      setClassifyFallthroughHook((s, e, meta) => seen.push({ s, e, meta }));
      const result = safeResolveAssetClass('ETH/TOOLONGQ', 'kraken'); // 8-char quote → length fail
      expect(result).toBeNull(); // fail-closed
      expect(seen).toHaveLength(1);
      expect(seen[0].meta?.unknownQuote).toBe('TOOLONGQ');
    });

    it('a throwing hook never breaks the resolver', () => {
      setClassifyFallthroughHook(() => { throw new Error('boom'); });
      expect(safeResolveAssetClass('ETH/TOOLONGQ', 'kraken')).toBeNull();
    });
  });

  describe('collision precedence preserved (OBJ-7)', () => {
    it('SUI/USD on kraken without x-suffix → crypto_spot', () => {
      expect(resolveAssetClass('SUI/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
    });
  });
});
