/**
 * F-G-1 / B-GRID-REPRESENTABILITY (OBJ-3) — DERIVE THE xSTOCK PRICE GRID FROM OBSERVED PRICES.
 *
 * Kraken does not publish a tick for xStocks and offers no `validate=true` oracle for them
 * (`venue-validate.ts:123-126` — no asset-pairs entry ⇒ `skipped` — for every xStock), so the
 * grid must be DERIVED. See
 * `venue-grid-resolver.ts` for why this is a GCD over observed increments rather than a
 * decimal-place count — and note that the distinction is not academic: measured 2026-08-28 over
 * one day of live prices, 6 of 40 symbols derive a 0.0025 grid and 3 more derive 0.0005. A
 * decimal-place method would have emitted invalid prices for all nine.
 *
 * ⛔ WHAT THIS PRODUCES IS A FLOOR, NOT A TICK, AND EVERY ROW SAYS SO. Observation can only ever
 * establish that the grid is AT LEAST this fine. The derived value is guaranteed to be a multiple
 * of the venue's true tick — every observed increment is a whole number of true ticks, so their
 * GCD is too — which means a derived grid always NESTS inside the real one. It can be too coarse;
 * it cannot produce an unrepresentable price. That one-directional error is the whole safety
 * argument, and it is why the coarser-is-safe reasoning that FAILS for a decimal count HOLDS here.
 *
 * ⛔ NO FALLBACK. A symbol that cannot be derived is simply absent from the cache, and the
 * resolver then returns `unknown`, and the caller refuses the signal. We do not invent a tick.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { gcdOfIncrements, setDerivedGrid } from './venue-grid-resolver.js';

/**
 * Observations required before a symbol's grid is trusted. Below this we record nothing.
 *
 * ⛔ COVERAGE, MEASURED — the denominator Langston required and I had omitted (rule 29(a), mine).
 * Over a 6-hour window on 2026-08-26: **476 xStock symbols seen, 436 covered at this threshold,
 * 40 NOT (8.4%).** Under the original code those 40 resolved to `grid_unknown` and were REFUSED
 * outright on the active path — so this constant silently gated 8.4% of the xStock universe out
 * of trading, labelled as a venue-grid refusal for what is OUR archive-coverage gap.
 * ⇒ The seam now PASSES THROUGH unrounded on a missing DERIVED grid rather than refusing
 * (published-vs-derived, Langston J1). Raising this number tightens grid quality and widens the
 * passthrough population; lowering it does the reverse. **It is a coverage/precision dial, not a
 * safety one — it can no longer stop a trade.**
 */
const MIN_INCREMENTS = 50;
/** How far back to look. Bounded because the ticker table is partitioned and wide. */
const WINDOW_HOURS = 24;
/** Re-derive on this cadence; venue precision changes rarely but the symbol set does not. */
const REFRESH_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export async function refreshXstockGrids(): Promise<{ derived: number; skipped: number }> {
  const windowDesc = `last ${WINDOW_HOURS}h`;
  let derivedCount = 0;
  let skipped = 0;

  // DISTINCT prices only: repeated identical prints carry no increment information, and
  // including them would not change the GCD while multiplying the row count.
  const rows: Array<{ symbol: string; prices: string }> = (await db.execute(sql`
    SELECT symbol, string_agg(DISTINCT last::text, ',') AS prices
    FROM xstock_spot_ticker_snap
    WHERE captured_at > NOW() - (${WINDOW_HOURS} || ' hours')::interval
      AND last IS NOT NULL AND last > 0
    GROUP BY symbol
  `)) as any;

  const list = Array.isArray(rows) ? rows : ((rows as any)?.rows ?? []);
  for (const r of list) {
    const prices = String(r.prices ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const increments: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      if (d > 0) increments.push(d);
    }
    if (increments.length < MIN_INCREMENTS) {
      skipped++;
      continue;
    }
    const tick = gcdOfIncrements(increments);
    if (tick == null) {
      // UNSTABLE, and that is a real outcome rather than a reason to fall back to decimals.
      skipped++;
      continue;
    }
    setDerivedGrid(r.symbol, {
      tick,
      provenance: 'derived_gcd',
      sampleN: increments.length,
      windowDesc,
    });
    derivedCount++;
  }

  console.log(
    `[F-G-1][xstock-grid] derived ${derivedCount} grids, skipped ${skipped} ` +
      `(min ${MIN_INCREMENTS} increments, ${windowDesc})`,
  );
  return { derived: derivedCount, skipped };
}

/**
 * Start the periodic refresh. Runs once immediately so the cache is warm before the first
 * signal, then on the interval.
 *
 * ⚠️ A FAILED REFRESH IS LOUD AND LEAVES THE CACHE UNCHANGED — it does not clear it. An empty
 * cache would refuse every xStock signal, which is a far worse failure than a slightly stale
 * grid, and venue precision changes on a scale of months rather than hours.
 */
export function startXstockGridRefresher(): void {
  if (timer) return;
  const run = () => {
    refreshXstockGrids().catch((err) => {
      console.error(
        '[F-G-1][xstock-grid] refresh FAILED — cache left unchanged, grids may be stale:',
        err instanceof Error ? err.message : err,
      );
    });
  };
  run();
  timer = setInterval(run, REFRESH_MS);
}

export function stopXstockGridRefresher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
