/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Equity Perp (PF_*XUSD) Archiver — FACADE over the generalized engine
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * P19-B-PERPFEED OBJ-3: the B74 module singleton became the parameterized
 * `KrakenFuturesArchiver` class (see `kraken-futures-archiver.ts`, which carries
 * the B74 original-intent record). This facade keeps the module's exact import
 * surface — `startEquityPerpArchiver` / `stopEquityPerpArchiver` /
 * `getEquityPerpStats` — so the bootstrap and the drift-dashboard monitor panel
 * are untouched by the conversion (behaviour-preservation per Step-1 review;
 * the xstock_perp leg's cadence is baseline-compared at deploy).
 *
 * The equity leg's universe stays the static JSON (10 symbols; #687 records its
 * 6-symbol staleness vs the live venue — whether CAPTURE expands 10 → 16 is an
 * OBJ-4 decision gated on the disk precondition, NOT silently changed here).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { loadEquityPerpUniverse } from './universe-loader.js';
import { KrakenFuturesArchiver, type KrakenFuturesArchiverStats } from './kraken-futures-archiver.js';

const instance = new KrakenFuturesArchiver({
  assetClass: 'xstock_perp',
  legLabel: 'equity-perp',
  loadUniverse: loadEquityPerpUniverse,
});

export function getEquityPerpStats(): KrakenFuturesArchiverStats {
  return instance.getStats();
}

export async function startEquityPerpArchiver(): Promise<void> {
  return instance.start();
}

export function stopEquityPerpArchiver(): void {
  instance.stop();
}
