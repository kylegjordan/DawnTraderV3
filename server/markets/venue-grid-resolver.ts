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
 *             B-NEW-36 sub-batch (c), #120), and `venue-validate.ts:123-126` returns `skipped` for
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
/**
 * ⛔⛔ THE ONE HOME OF PUBLISHED-vs-DERIVED — the distinction Langston's J1 ruling turns on, and
 * the reason blocker-5 happened.
 *
 *   PUBLISHED (crypto): the tick is the VENUE'S OWN STATEMENT. Its absence means we genuinely do
 *     not know what the venue will accept ⇒ REFUSE.
 *   DERIVED (xStock): the "grid" is OUR INFERENCE FROM OUR OWN ARCHIVE. Its absence tells you
 *     about our observation coverage, not about the venue ⇒ PASS THROUGH, loudly.
 *
 * ⚠️ IT IS EXPORTED BECAUSE IT WAS WRITTEN TWICE — once here as an inline `assetClass === ...`
 * test, once in `signal-orchestrator.ts` as `_gridIsDerived`. Two copies of a decided rule is
 * exactly the defect `B-EPOCH-KEYING-PARITY` is held on, and here the two copies were the SAME
 * rule the batch's central ruling depends on. A fresh reader then proved the orchestrator's copy
 * had ZERO test coverage: reverting it to the blocker-5 tautology left the whole suite green.
 * ⇒ ONE function, ONE home, directly fenced.
 */
export function gridIsDerivedForClass(assetClass: string): boolean {
  return assetClass === 'xstock_spot' || assetClass === 'xstock_perp';
}

/**
 * ⛔⛔ THE SEAM'S DECISION, EXTRACTED — AND THE REASON IS MEASURED, NOT STYLISTIC.
 *
 * This branch used to live inline in `signal-orchestrator.ts` inside a long private method that
 * **no test executes** — a fresh reader replaced the class test there with a literal `true`
 * (reinstating blocker-5: crypto passing through UNROUNDED) and the entire suite stayed green.
 * The previous round had extracted `gridIsDerivedForClass` and fenced it, which fenced the
 * FUNCTION and left the CALL unguarded: the same gap the commit claimed to close, moved one line.
 * ⇒ Extracting the whole decision is the only version of this fix that can be tested, because a
 * pure function CAN be called by a test and a private method on a 3,000-line service cannot.
 *
 *   PUBLISHED (crypto) + no tick  -> REJECT.      The venue's own statement is missing, so we
 *                                                 genuinely do not know what it would accept.
 *   DERIVED (xStock)  + no tick  -> PASSTHROUGH.  Absence is OUR archive-coverage gap, not a
 *                                                 venue fact; refusing would be a self-inflicted
 *                                                 outage wearing venue-safety clothes (J1).
 *   any other refusal            -> REJECT.       Shape, degeneracy and self-check failures are
 *                                                 refusals for BOTH classes. This arm is why the
 *                                                 passthrough is keyed on the REASON and not on
 *                                                 the class alone.
 */
/**
 * ⛔⛔ THE `apply` ARM CARRIES THE PRICES, AND THAT IS A FENCE RATHER THAN A CONVENIENCE.
 * Langston predicted — correctly, I ran it — that a caller could keep the call, DISCARD its
 * result and dispatch on a hardcoded `{ action: 'apply' }`, reinstating blocker-5 in full with
 * every test green. The fence had gone *identifier present* → *call form present* and still not
 * *the value decides*, which is J5's shape two steps out.
 * ★ A REGEX CANNOT CLOSE THAT, AND NEITHER CAN ANOTHER ASSERTION. Making the decision carry the
 * only copy of the rounded prices means a hardcoded action does not COMPILE — the caller has
 * nothing to assign. Rule 29: prefer impossible over intercepted; a hook is the fallback.
 */
export type GridAction =
  | { action: 'apply'; entryPrice: number; stopPrice: number; targetPrice: number }
  | { action: 'passthrough'; reason: string }
  | { action: 'reject'; reason: string };

export function decideGridAction(
  assetClass: string,
  r: { ok: boolean; reason?: string; entryPrice: number; stopPrice: number; targetPrice: number },
): GridAction {
  if (r.ok) {
    return {
      action: 'apply',
      entryPrice: r.entryPrice,
      stopPrice: r.stopPrice,
      targetPrice: r.targetPrice,
    };
  }
  // ⛔ BRANCH ON THE ASSET CLASS, NEVER ON THE PROVENANCE OF A LOOKUP THAT FAILED. Blocker-5 was
  // exactly that: `provenance !== 'venue_published'` is TRUE BY CONSTRUCTION inside the
  // grid_unknown branch, because a miss returns the shared UNKNOWN for every class.
  if (r.reason === 'grid_unknown' && gridIsDerivedForClass(assetClass)) {
    return { action: 'passthrough', reason: 'unresolved_grid' };
  }
  return { action: 'reject', reason: r.reason ?? 'unknown' };
}

export function resolveVenueGrid(symbol: string, assetClass: string): VenueGrid {
  if (!symbol) return UNKNOWN;

  if (gridIsDerivedForClass(assetClass)) {
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
  // ⚠️ USES THE SHARED PREDICATE. This site held a byte-identical inline copy of the
  // xStock test, three functions below the function extracted to be its one home — so the
  // extraction removed one duplicate and walked past another in the same file. Adding a derived
  // class would have updated one and silently not the other: the `B-EPOCH-KEYING-PARITY` shape,
  // inside the fix that cites it. Fresh-reader finding.
  if (gridIsDerivedForClass(assetClass)) {
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
