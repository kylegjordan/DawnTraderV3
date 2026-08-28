/**
 * F-G-1 / B-GRID-REPRESENTABILITY (OBJ-7, OBJ-3) — RESOLVE THE VENUE PRICE GRID PER SYMBOL.
 *
 * Two legs, and they are NOT symmetric — that asymmetry is the whole reason this module exists
 * rather than a one-line lookup:
 *
 *   CRYPTO  — AUTHORITATIVE. Kraken publishes `tick_size` per pair on `/0/public/AssetPairs`
 *             (1,437 pairs, 11 distinct values). Read straight off the asset-pairs service.
 *             ⛔ Keyed on `tick_size`, NEVER `pairDecimals`: measured 2026-08-27, the two
 *             disagree on 4 of 1,437 pairs (CELRUSD, REQUSD, VTHOUSD, WINUSD) and the decimals
 *             are the LOOSER of the two, so they can permit a price the tick rejects.
 *
 *   xSTOCK  — DERIVED, AND RECORDED AS A FLOOR, NOT A TICK. Kraken does not index xStocks in
 *             `AssetPairs` at all (documented: `symbol-canonicalizer.ts` KNOWN_NONEXISTENT_NAMES,
 *             B-NEW-36 sub-batch (c), #120), and `venue-validate.ts:92` returns `skipped` for
 *             every xStock, so there is no `validate=true` oracle either — I looked for one
 *             before proposing this, and recorded its absence rather than leaving it untried.
 *             ⇒ the venue's true xStock tick is UNKNOWABLE from anything we can call.
 *
 * ⛔ WHY GCD AND NOT A DECIMAL-PLACE COUNT. My first method was "round to the coarsest
 * well-observed decimal place." It does not hold, and the hole is not the obvious one:
 * coarser-is-safe requires the coarse increment to be an INTEGER MULTIPLE of the true tick,
 * which is only guaranteed when the grid is a power of ten. I measured that on CRYPTO and
 * asserted it onto xSTOCK — the one class with no published tick. Counter-example: a true tick
 * of 0.0025 with a "coarser" 0.001 makes EVERY price invalid. Non-decimal increments are
 * ordinary on equity venues. A GCD over observed increments recovers the actual increment
 * whatever its shape, and is guaranteed to nest.
 *
 * ⛔ NO HARD-CODED FALLBACK ANYWHERE IN HERE. An unresolvable grid returns null and the caller
 * refuses the signal. A default tick would be a silently-wrong price, which is the exact class
 * of defect this batch exists to remove.
 */
import { krakenAssetPairsService } from './kraken-asset-pairs-service.js';

/** How the grid for a symbol was established — stamped so a reader never has to guess. */
export type GridProvenance = 'venue_published' | 'derived_gcd' | 'derived_decimals' | 'unknown';

export interface VenueGrid {
  tick: number | null;
  provenance: GridProvenance;
  /** Observations behind a DERIVED grid. Null for a published one. */
  sampleN?: number;
  /** Window the observations were drawn from. Null for a published one. */
  windowDesc?: string;
}

const UNKNOWN: VenueGrid = { tick: null, provenance: 'unknown' };

/** Derived xStock grids, keyed by symbol. Populated by `setDerivedGrid` (see the refresher). */
const derived = new Map<string, VenueGrid>();

/**
 * Greatest common divisor over a set of positive price increments, computed in integer space at
 * `scale` decimal places. Returns null when the result is unstable — which is a real outcome and
 * must not be smoothed into a plausible-looking number.
 */
export function gcdOfIncrements(increments: number[], scale = 8): number | null {
  const mult = Math.pow(10, scale);
  const ints = increments
    .map((d) => Math.round(Math.abs(d) * mult))
    .filter((n) => n > 0);
  if (ints.length < 2) return null;
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  let g = ints[0];
  for (const n of ints) {
    g = gcd2(g, n);
    if (g === 1) break;
  }
  const tick = g / mult;
  // A GCD of one integer unit means the increments share no common factor above our resolution.
  // That is NOT a 1e-8 tick — it is a failure to establish one. Say so rather than return it.
  if (g <= 1) return null;
  return Number(tick.toFixed(scale));
}

/** Register a derived grid for an xStock symbol. Called by the refresher, not by the pipeline. */
export function setDerivedGrid(symbol: string, grid: VenueGrid): void {
  derived.set(symbol.toUpperCase(), grid);
}

/** Test/diagnostic access. */
export function getDerivedGridCount(): number {
  return derived.size;
}

/**
 * THE ONE RESOLVER. Everything that needs a venue price grid calls this.
 *
 * ⚠️ Asset class is REQUIRED and is not inferred from the symbol, because xStock and crypto
 * tickers collide (`XSTOCK_SPOT_KRAKEN_COLLISIONS` — 17 of them, e.g. DASH is both DoorDash and
 * the Dash coin). Resolving by name alone would return the wrong venue's grid for those symbols.
 * That collision is handled correctly elsewhere in the system; this module must not re-open it.
 */
export function resolveVenueGrid(symbol: string, assetClass: string): VenueGrid {
  if (!symbol) return UNKNOWN;

  if (assetClass === 'xstock_spot' || assetClass === 'xstock_perp') {
    return derived.get(symbol.toUpperCase()) ?? UNKNOWN;
  }

  // crypto_spot / crypto_perp — the venue publishes it.
  const entry = krakenAssetPairsService.resolveByInternal(symbol);
  const raw = entry?.tickSize;
  if (raw == null) return UNKNOWN;
  const tick = Number(raw);
  if (!Number.isFinite(tick) || tick <= 0) return UNKNOWN;
  return { tick, provenance: 'venue_published' };
}

/** Venue SIZE constraints, for OBJ-7b kind (i). Same no-fallback rule. */
export function resolveVenueSizeLimits(symbol: string, assetClass: string): {
  lotDecimals: number | null;
  ordermin: number | null;
  costmin: number | null;
} {
  if (assetClass === 'xstock_spot' || assetClass === 'xstock_perp') {
    return { lotDecimals: null, ordermin: null, costmin: null };
  }
  const e = krakenAssetPairsService.resolveByInternal(symbol);
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    lotDecimals: e?.lotDecimals ?? null,
    ordermin: num(e?.ordermin),
    costmin: num(e?.costmin),
  };
}
