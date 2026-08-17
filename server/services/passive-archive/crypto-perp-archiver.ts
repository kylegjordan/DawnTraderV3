/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B-PERPFEED — Crypto Perp (PF_*) Archiver — FACADE over the generalized engine
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The fourth leg of the B74 passive-archive family: crypto perpetuals from
 * Kraken Futures (same venue + dual capture path as the xstock_perp leg —
 * see `kraken-futures-archiver.ts`). CAPTURE ONLY: prices, funding rate, open
 * interest recorded for Phase-26 learning; nothing reads this data yet, and
 * perp TRADING stays Phase 26 post-launch (Kyle 2026-05-27 / 2026-08-11).
 *
 * Universe: dynamic, field-driven, budget-capped — see
 * `loadCryptoPerpUniverse` in `universe-loader.js` (the classification rules,
 * the perpetuality test, and the UNCLASSIFIED refuse-and-log live there).
 *
 * ⛔ SWITCH-ON GATE (scope §4): this leg does not start until the disk
 * retention work (OBJ-7) has landed its measured byte drop. The bootstrap's
 * module-constants kill-switch for this leg DEFAULTS OFF (fail-closed) —
 * unlike the B74 legs' default-on — precisely so deploying the code does not
 * itself start the writer.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { loadCryptoPerpUniverse } from './universe-loader.js';
import { KrakenFuturesArchiver, type KrakenFuturesArchiverStats } from './kraken-futures-archiver.js';

const instance = new KrakenFuturesArchiver({
  assetClass: 'crypto_perp',
  legLabel: 'crypto-perp',
  loadUniverse: loadCryptoPerpUniverse,
});

export function getCryptoPerpStats(): KrakenFuturesArchiverStats {
  return instance.getStats();
}

export async function startCryptoPerpArchiver(): Promise<void> {
  return instance.start();
}

export function stopCryptoPerpArchiver(): void {
  instance.stop();
}
