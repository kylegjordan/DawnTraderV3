/**
 * `B-RTB-REFRESH-LIVE-PRICE` (sprint row 59e; Langston Step-2 C1, C5, C6, C8) — THE ASK THE RTB REFRESH MAY RETIRE A SIGNAL ON.
 *
 * ⛔ ONE CONTRACT, BUILT ONLY FROM THE EXIT'S OWN PIECES — "the retirement may not act on an ask the exit side would refuse to
 * decide on" (C1). A refusal is a REASON TOKEN, never a fallback: no midpoint, no cache mark, no archive witness.
 *
 * ⛔ DISPATCH IS ON THE ROW'S PERSISTED `asset_class`, NEVER ON THE SYMBOL (C5): 12 tickers were quoted in BOTH ticker tables in
 * a week (`STX/USD` reads ~0.39 on the crypto book and ~780 on the xStock book); a symbol-resolved read is a price ~2,000× wrong.
 *
 * ⛔ EVERY AMBIGUOUS ARM IS "NOT ADMISSIBLE" (C6). At the entry seam an absent yardstick PASSES (fail-open protects against an
 * invented refusal); here "admissible" means DELETE, so the same absence must KEEP. Row 59 increment 1 refuses the bad open at
 * the fill regardless — this read is queue hygiene, not the capital safety net (see `server/core/rtb/rtb-price-retirement.ts`).
 *
 * crypto — `selectCryptoTouch` with the PAPER EXIT's policy (`EXIT_TRIGGER_MAX_AGE_MS`, `EXIT_TRIGGER_MAX_SPREAD_FRACTION`), NOT the
 *   entry fill's (whose spread ceiling is +Infinity); the transactable side for a buy is the ASK.
 * xStock — the in-memory equities tick the exit reads (`getLatestEquityTick`), refused on: no tick; a COLD mark (only the venue's
 *   replay on a subscribe, `observed === false`); a crossed or one-sided book (`xstockTransactableSides`); no ask quantity (the
 *   hollow arm); an age above the exit's per-symbol ceiling (`computeStalenessCeiling`, σ from the cache, its floor when absent);
 *   a spread failing `judgeEntrySpread` against the symbol's own regular-session yardstick — which stands in for `ask_spiked`,
 *   whose comparator exists only for HELD symbols (`active-execution-engine.ts`, the entry seam's note); an unavailable yardstick ⇒
 *   not admissible.
 */
import { asValidAssetClass } from '../../shared/asset-classes.js';
import { selectCryptoTouch, EXIT_TRIGGER_MAX_AGE_MS, EXIT_TRIGGER_MAX_SPREAD_FRACTION } from '../core/trading/crypto-touch.js';
import type { RetirementAsk } from '../core/rtb/rtb-price-retirement.js';
import { CRYPTO_TOUCH_READERS } from './execution/crypto-touch-readers.js';
import { getLatestEquityTick } from './passive-archive/equity-spot-archiver.js';
import { xstockTransactableSides } from '../asset_classes/xstock_spot/transactable-sides.js';
import { computeStalenessCeiling } from '../asset_classes/xstock_spot/mark-staleness.js';
import { readXstockMarkStalenessConfig, readXstockSigmaCacheConfig } from '../asset_classes/xstock_spot/mark-staleness-config.js';
import { getCachedSigma } from '../asset_classes/xstock_spot/sigma-rate-cache.js';
import { resolveBookStateConfigSync } from '../asset_classes/xstock_spot/book-state-config.js';
import { resolveEntryYardstick, judgeEntrySpread } from '../asset_classes/xstock_spot/entry-spread-plausibility.js';

export async function readRetirementAsk(
  signal: { symbol: string; assetClass: string | null | undefined; stopPrice: number },
  nowMs: number = Date.now(),
): Promise<RetirementAsk> {
  try {
    const cls = asValidAssetClass(signal.assetClass);
    if (cls === null) return { ok: false, reason: 'class_unresolved' };

    if (cls === 'crypto_spot') {
      const { selection } = selectCryptoTouch(signal.symbol, CRYPTO_TOUCH_READERS, nowMs, {
        maxAgeMs: EXIT_TRIGGER_MAX_AGE_MS,
        maxSpreadFraction: EXIT_TRIGGER_MAX_SPREAD_FRACTION,
      });
      if (!selection.ok) return { ok: false, reason: `crypto_${selection.bookRefusal}_${selection.tickerRefusal}` };
      const { bid, ask, ageMs, basis } = selection.quote;
      return { ok: true, ask, bid, ageMs, basis: String(basis), readAtMs: nowMs, ceilingMs: EXIT_TRIGGER_MAX_AGE_MS };
    }

    if (cls === 'xstock_spot') {
      const tick = getLatestEquityTick(signal.symbol);
      if (!tick || !tick.raw) return { ok: false, reason: 'xstock_no_tick' };
      if (tick.observed === false) return { ok: false, reason: 'xstock_cold_mark' };
      const sides = xstockTransactableSides(tick.raw);
      if (sides === null) return { ok: false, reason: 'xstock_not_two_sided' };
      if (!(tick.raw.askQty !== null && tick.raw.askQty > 0)) return { ok: false, reason: 'xstock_ask_qty_absent' };
      const ageMs = nowMs - tick.tsMs;
      // σ is a pure-memory read; a miss lands the ceiling on its FLOOR — the exit's own fail-closed direction.
      const sigma = getCachedSigma(signal.symbol, readXstockSigmaCacheConfig());
      const ceiling = computeStalenessCeiling(
        {
          currentPrice: tick.price,
          stopPrice: Number.isFinite(signal.stopPrice) ? signal.stopPrice : null,
          sigmaRatePerSec: sigma?.sigmaRatePerSec ?? null,
          sigmaAgeMs: sigma?.ageMs ?? null,
        },
        readXstockMarkStalenessConfig(),
      );
      if (!(ageMs >= 0) || ageMs > ceiling.ceilingMs) return { ok: false, reason: 'xstock_stale' };
      const cfg = resolveBookStateConfigSync();
      const spread = (sides.ask - sides.bid) / ((sides.ask + sides.bid) / 2);
      const yardstick = await resolveEntryYardstick(signal.symbol, cfg.trailingSpreadWindowSnaps);
      if (yardstick.median === null) return { ok: false, reason: `xstock_yardstick_${yardstick.basis}` };
      if (judgeEntrySpread(spread, yardstick.median, cfg.kRel, cfg.floorPct).refuse) {
        return { ok: false, reason: 'xstock_implausible_spread' };
      }
      return { ok: true, ask: sides.ask, bid: sides.bid, ageMs, basis: 'xstock_equities_tick', readAtMs: nowMs, ceilingMs: ceiling.ceilingMs };
    }

    return { ok: false, reason: 'class_unsupported' };
  } catch (err) {
    // A thrown read (a knob missing, a DB read failing) is ambiguous by definition ⇒ not admissible (C6).
    return { ok: false, reason: `read_error:${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}` };
  }
}
