/**
 * `B-RTB-REFRESH-LIVE-PRICE` (row 59e, Langston Step-2 C8) — THE ONE SET OF CRYPTO TOUCH READERS.
 *
 * The active engine (`CRYPTO_TOUCH_READERS`) and the VTS (`VTS_CRYPTO_TOUCH_READERS`) each built this object, identical in
 * content (Langston diffed them, 2026-10-12); the RTB refresh's retirement contract needs it too. It lives here, in the
 * services layer, because `server/core/trading/crypto-touch.ts` is PURE by injection and must stay so.
 *
 * Every read is IN-MEMORY: `getBookForFill` reads the WS mini-book map, `getCachedPrice` the price cache — not a venue call.
 * `selectCryptoTouch` normalises the symbol before the book lookup (Langston r4 CONDITION-1).
 */
import type { CryptoTouchReaders } from '../../core/trading/crypto-touch.js';
import { normalizeToInternalSymbol } from '../../markets/kraken-symbol-resolver.js';
import { krakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';
import { priceCache } from '../price-cache.js';

export const CRYPTO_TOUCH_READERS: CryptoTouchReaders = {
  normalize: normalizeToInternalSymbol,
  getBook: (s) => krakenWebSocketAdapter.getBookForFill(s),
  isBookTrusted: (s) => krakenWebSocketAdapter.isBookTrusted(s),
  getCached: (s) => priceCache.getCachedPrice(s),
};
