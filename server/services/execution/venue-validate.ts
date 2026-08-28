/**
 * P19-B8.5 (OBJ-8) — real-venue WELL-FORMEDNESS vetting for paper opens.
 *
 * Every paper open is sent to Kraken `AddOrder validate=true` (executes NOTHING)
 * BEFORE the internal depth-walk fill, so a paper fill never happens on an order
 * the venue would refuse (unknown pair, size below `ordermin`, price/volume
 * precision). This is the recorded rule-20 design (P19-B2), wired here for the
 * switch-on. It is NOT a fill simulation — Kraken spot has none; fill honesty is
 * the depth-walk's job and never depends on this leg.
 *
 * PAPER-ONLY BY CONSTRUCTION (Kyle 2026-07-14 "same pipes" directive): the caller
 * gates on mode === 'paper'; in live mode the REAL order is the venue contact and
 * this module must never add a second API call there.
 *
 * FAIL-MODE (Langston Step-2 ruling, 2026-07-14): fail-CLOSED only on a
 * DEFINITIVE, PARSEABLE venue rejection; EVERY ambiguity — timeout, network
 * error, 5xx, rate limit, auth trouble, unparseable body, unknown error code —
 * resolves to a VISIBLE 'skipped' and the open proceeds to the depth-walk.
 * Rationale (his words): mis-reading a transient as a rejection destroys learning
 * data on a Kraken hiccup; mis-reading a rejection as a skip merely loses the
 * well-formedness veto for one order while fill honesty stays intact. The two
 * errors are not symmetric — ambiguity resolves OPEN.
 */

import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';

export type VenueValidateOutcome =
  | { outcome: 'ok'; detail: string }
  | { outcome: 'rejected'; detail: string }   // definitive venue rejection → the caller DROPS the open, loudly
  | { outcome: 'skipped'; detail: string };   // anything ambiguous → the caller COUNTS it and proceeds

/** Time budget for the validate round-trip. An overrun is an AMBIGUITY → skip. */
export const VALIDATE_TIMEOUT_MS = 4000;

/**
 * The conservative classifier (pure, unit-tested). DEFINITIVE = Kraken answered
 * with a well-formed error naming an ORDER-LEVEL problem. Everything else skips.
 * The rejection allowlist is deliberately narrow — growing it requires evidence
 * of a new definitive class, never a guess (Langston: "don't let an ambiguous
 * response fail closed").
 */
export function classifyKrakenValidateError(err: unknown): { kind: 'rejected' | 'skipped'; detail: string } {
  const msg = err instanceof Error ? err.message : String(err);
  // makePrivateRequest surfaces venue errors as "Kraken API error: <codes>" —
  // anything NOT in that shape is transport/parse trouble, never a venue verdict.
  if (!msg.includes('Kraken API error:')) {
    return { kind: 'skipped', detail: `non-venue error: ${msg.slice(0, 160)}` };
  }
  // Venue-shaped, but ambiguity classes resolve OPEN (availability/limits/auth are
  // not verdicts ABOUT THE ORDER):
  const AMBIGUOUS = ['EAPI:Rate limit', 'EService:', 'EGeneral:Temporary lockout', 'EAPI:Invalid key', 'EAPI:Invalid signature', 'EAPI:Invalid nonce'];
  if (AMBIGUOUS.some((c) => msg.includes(c))) {
    return { kind: 'skipped', detail: `venue-ambiguous: ${msg.slice(0, 160)}` };
  }
  // Definitive ORDER-LEVEL rejection classes:
  const DEFINITIVE = ['EOrder:', 'EGeneral:Invalid arguments', 'EQuery:Unknown asset pair', 'EAPI:Feature disabled'];
  if (DEFINITIVE.some((c) => msg.includes(c))) {
    return { kind: 'rejected', detail: msg.slice(0, 200) };
  }
  // Unknown E-code = not parseable as a known verdict = ambiguity → OPEN.
  return { kind: 'skipped', detail: `unknown venue code: ${msg.slice(0, 160)}` };
}

/** Format a number to at most `decimals` places without scientific notation (pure, tested). */
export function formatToDecimals(value: number, decimals: number | undefined, fallbackDecimals: number): string {
  const d = Number.isInteger(decimals) && (decimals as number) >= 0 ? (decimals as number) : fallbackDecimals;
  // toFixed then trim trailing zeros — Kraken accepts fewer decimals, never more.
  return value.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export interface VenueValidateRequest {
  /** Internal symbol, e.g. "BTC/USD". */
  symbol: string;
  quantity: number;
  limitPrice: number;
  /** The venue caller — injected so tests stub it (shape: KrakenService.addOrder). */
  addOrder: (params: {
    pair: string; type: 'buy' | 'sell'; ordertype: 'limit'; volume: string; price: string; validate: boolean;
  }) => Promise<unknown>;
}

/**
 * Validate a paper BUY against the real venue. Resolves the Kraken REST pair +
 * per-pair precision from the asset-pairs service (so OUR formatting never
 * manufactures a false precision rejection — a genuine `ordermin`/pair problem
 * still rejects, which is exactly the learning this leg buys). An unresolvable
 * pair mapping is an AMBIGUITY (our map, not the venue's verdict) → skip.
 */
export async function validatePaperOrderWithVenue(req: VenueValidateRequest): Promise<VenueValidateOutcome> {
  const entry = krakenAssetPairsService.resolveByInternal(req.symbol);
  if (!entry) {
    return { outcome: 'skipped', detail: `no pair mapping for ${req.symbol} (asset-pairs service)` };
  }
  // F-G-1 (Kyle's question, 2026-08-28): ONE BASIS FOR THE PRICE GRID, NOT TWO.
  // This line formatted to `pairDecimals` while the orchestrator now rounds to `tick_size`, so the
  // system held two implementations of the same idea on two different bases. MEASURED across all
  // 1,437 pairs: `pair_decimals` is COARSER than the tick on ZERO of them (1,433 exactly equal,
  // 4 harmlessly finer), so this could never corrupt a price the orchestrator had already put on
  // the grid -- it is redundancy rather than a live defect, and that is stated so nobody reads
  // this change as a bug fix. It is here because a FUTURE change to the rounding rule would
  // otherwise have to be found in two places, which is exactly how a rule ends up shipped into
  // one reader out of several.
  const _tickDecimals = (() => {
    const t = Number(entry.tickSize);
    if (!Number.isFinite(t) || t <= 0) return undefined;   // no fallback invented -- see below
    const e = t.toExponential();
    const exp = Number(e.slice(e.indexOf('e') + 1));
    return exp < 0 ? Math.min(12, -exp) : 0;
  })();
  // `pairDecimals` remains the fallback ONLY because it is what this leg has always used and is
  // never coarser than the tick; dropping to it loses precision, never validity.
  const price = formatToDecimals(req.limitPrice, _tickDecimals ?? entry.pairDecimals, 5);
  const volume = formatToDecimals(req.quantity, entry.lotDecimals, 8);
  try {
    await Promise.race([
      req.addOrder({ pair: entry.krakenRestPair, type: 'buy', ordertype: 'limit', volume, price, validate: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`validate timeout ${VALIDATE_TIMEOUT_MS}ms`)), VALIDATE_TIMEOUT_MS)),
    ]);
    return { outcome: 'ok', detail: `venue accepted ${entry.krakenRestPair} ${volume}@${price}` };
  } catch (err) {
    const c = classifyKrakenValidateError(err);
    return c.kind === 'rejected'
      ? { outcome: 'rejected', detail: c.detail }
      : { outcome: 'skipped', detail: c.detail };
  }
}
