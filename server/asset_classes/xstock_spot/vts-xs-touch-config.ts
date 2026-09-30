/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3 (plan §C3.5; Langston Step-4 BLOCKER-1, 2026-09-30) — THE ONE SOURCE of
 * the VTS xStock exit guard's own knob: `vts_xstock_touch.exit_max_spread_fraction` (xstock_spot). The age ceiling is
 * paper's (`mark-staleness-config.ts`); this is the one standard VTS carries that paper does not.
 *
 * ⛔ The module is read SYNCHRONOUSLY on every xStock VTS exit look, so it MUST be in `b72-warmup.ts` `PREFETCH_MODULES`
 * — a seeded row in an unprefetched module is unreachable from a sync caller, and every read throws (the 2026-07-22
 * outage `book-state-config.ts` names; BLOCKER-1 would have repeated it). The boot assertion below makes a missing or
 * out-of-range row a deploy-time failure instead of an exit side that silently never decides.
 */
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

export const VTS_XSTOCK_TOUCH_MODULE = 'vts_xstock_touch';
const XSTOCK_KEY = { exchange: '*', assetClass: 'xstock_spot' as const, strategy: '*', regime: '*' };

/** Open bounds for the ceiling: ≤ 0 would refuse every quote; ≥ 5% would pass the `#1065` stub-bid frames it exists to
 *  refuse (the build derived 1.074% from the p10 stop distance, `2026-09-30-b-price-side-8a-p4c-inc3.sql`). */
export const VTS_XSTOCK_EXIT_MAX_SPREAD_BOUNDS = { gt: 0, lt: 0.05 } as const;

/** The exit spread ceiling (a fraction of mid). Throws on a missing row or a cold module; the caller fails closed. */
export function readVtsXstockExitMaxSpread(): number {
  return getCachedNumberRequired(VTS_XSTOCK_TOUCH_MODULE, 'exit_max_spread_fraction', XSTOCK_KEY);
}

/** Boot assertion: the row exists, is reachable from a sync reader, and is inside its bounds. Returns the value. */
export function assertVtsXstockTouchKnobsAtBoot(): number {
  let v: number;
  try {
    v = readVtsXstockExitMaxSpread();
  } catch (err) {
    throw new Error(
      `[8a-P4c][warmup] ${VTS_XSTOCK_TOUCH_MODULE}.exit_max_spread_fraction for asset_class='xstock_spot' is unreadable — `
      + `either migration drizzle/migrations/2026-09-30-b-price-side-8a-p4c-inc3.sql has not been applied, or the module is `
      + `missing from PREFETCH_MODULES. Without it every xStock VTS exit makes no decision. (${(err as Error).message})`,
    );
  }
  const { gt, lt } = VTS_XSTOCK_EXIT_MAX_SPREAD_BOUNDS;
  if (!(v > gt && v < lt)) {
    throw new Error(`[8a-P4c][warmup] ${VTS_XSTOCK_TOUCH_MODULE}.exit_max_spread_fraction=${v} outside (${gt}, ${lt}) — refusing to start.`);
  }
  return v;
}
