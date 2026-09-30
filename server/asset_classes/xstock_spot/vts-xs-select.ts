/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3 (plan §C3; 3a-i P7 exits, 3b P7a entries) — THE VTS xSTOCK SIDE
 * SELECTORS. One module so both VTS lanes (vts-runner) and the xStock evaluator (eval-cycle) judge a quote by ONE rule.
 *
 * A VTS xStock leg transacts only on a quote fit to transact: no older than PAPER'S risk-derived per-symbol ceiling
 * (`computeStalenessCeiling` over the shared σ cache — VTS owns no age knob, so a paper tuning moves VTS by design).
 *   - EXIT (sell) legs take the BID and must also be no wider than the VTS exit spread ceiling
 *     (`vts_xstock_touch.exit_max_spread_fraction` — what refuses the `#1065` stub-bid frame).
 *   - ENTRY (buy) legs take the ASK with NO spread ceiling (P7a; the crypto precedent `ENTRY_LEG_NO_SPREAD_CEILING`):
 *     a wider spread makes `ask ≤ limit` harder and a taker's ask dearer, so it can never make an entry optimistic.
 * STATELESS (rule A). A missing knob, row or usable side ⇒ `price = null` — never the mark. `ceilingMs` is the age
 * ceiling actually applied and `reason` the guard's own verdict (both feed the instrument's S1, Langston Step-4
 * BLOCKER-2). A guard that cannot run (`knobs_unavailable`) applies no ceiling, is counted by reason, and LOGS — at most
 * once a minute per side, with the looks it missed — so an outage can never read as "no xStock trades".
 * Moved here from `vts-runner.ts` in 3b so the evaluator can use it; the exit behaviour is unchanged.
 */
import { guardXstockQuote } from './vts-xs-guard.js';
import { computeStalenessCeiling } from './mark-staleness.js';
import { readXstockMarkStalenessConfig, readXstockSigmaCacheConfig } from './mark-staleness-config.js';
import { readVtsXstockExitMaxSpread } from './vts-xs-touch-config.js';
import { getCachedSigma } from './sigma-rate-cache.js';
import type { XsLiveReason, XsQuoteRow } from './vts-xs-instrument.js';

export interface XsSideSelection {
  price: number | null;
  ceilingMs: number | null;
  reason: XsLiveReason;
}

const knobLog = { bid: { lastMs: 0, missed: 0 }, ask: { lastMs: 0, missed: 0 } };

/** The guarded side of `row` for a leg: `'bid'` for a sell (exit), `'ask'` for a buy (entry). */
export function selectVtsXstockSide(side: 'bid' | 'ask', symbol: string, row: XsQuoteRow | null, stop: number | null,
  nowMs: number): XsSideSelection {
  let msCfg: ReturnType<typeof readXstockMarkStalenessConfig>;
  let sigmaCfg: ReturnType<typeof readXstockSigmaCacheConfig>;
  let maxSpread: number;
  try {
    msCfg = readXstockMarkStalenessConfig();
    sigmaCfg = readXstockSigmaCacheConfig();
    maxSpread = side === 'bid' ? readVtsXstockExitMaxSpread() : Number.POSITIVE_INFINITY;
  } catch (err) {
    const k = knobLog[side];
    k.missed++;
    if (nowMs - k.lastMs >= 60_000) {
      console.error(`[8a-P4c][VTS_XS_KNOBS_UNAVAILABLE] side=${side} ${k.missed} xStock VTS ${side === 'bid' ? 'exit' : 'entry'} `
        + `look(s) made NO decision since the last line — the guard's knobs are unreadable: `
        + `${err instanceof Error ? err.message : String(err)}`);
      k.lastMs = nowMs;
      k.missed = 0;
    }
    return { price: null, ceilingMs: null, reason: 'knobs_unavailable' };
  }
  if (row === null) return { price: null, ceilingMs: msCfg.floorMs, reason: 'no_row' };
  const sigma = getCachedSigma(symbol, sigmaCfg, nowMs);
  const ceiling = computeStalenessCeiling(
    { currentPrice: row.last, stopPrice: stop, sigmaRatePerSec: sigma?.sigmaRatePerSec ?? null, sigmaAgeMs: sigma?.ageMs ?? null },
    msCfg,
  );
  const g = guardXstockQuote(row, nowMs, { maxAgeMs: ceiling.ceilingMs, maxSpreadFraction: maxSpread });
  return { price: g.sides ? g.sides[side] : null, ceilingMs: ceiling.ceilingMs, reason: g.reason };
}

/** EXIT: the guarded BID (3a-i). */
export function selectVtsXstockExitBid(symbol: string, row: XsQuoteRow | null, stop: number | null, nowMs: number):
  { bid: number | null; ceilingMs: number | null; reason: XsLiveReason } {
  const s = selectVtsXstockSide('bid', symbol, row, stop, nowMs);
  return { bid: s.price, ceilingMs: s.ceilingMs, reason: s.reason };
}

/** ENTRY: the guarded ASK, no spread ceiling (3b, P7a). */
export function selectVtsXstockEntryAsk(symbol: string, row: XsQuoteRow | null, stop: number | null, nowMs: number):
  { ask: number | null; ceilingMs: number | null; reason: XsLiveReason } {
  const s = selectVtsXstockSide('ask', symbol, row, stop, nowMs);
  return { ask: s.price, ceilingMs: s.ceilingMs, reason: s.reason };
}
