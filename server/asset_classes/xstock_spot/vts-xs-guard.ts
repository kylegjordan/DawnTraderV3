/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3 (plan §C3, P7) — THE VTS xSTOCK QUOTE GUARD.
 *
 * Decides whether an xStock quote is fit to TRANSACT on, and hands back its sides. STATELESS by rule A (the window
 * read, progress report §9.6: K = 0 and the union share ≤ 2.76% at every candidate age on both lanes), so it carries no
 * memory to lose on a restart. It refuses — returns `null` sides with a reason — when:
 *   - there is no row (`no_row`), or its age is not a finite non-negative number (`age_unknown`, a fault);
 *   - the row is older than the ceiling the CALLER supplies (`too_old`) — exits pass paper's risk-derived per-symbol
 *     ceiling (`computeStalenessCeiling`, J2 r2), entries pass paper's entry ceiling;
 *   - either side is unusable by THE shared predicate (`side_unusable` — `xstockTransactableSides`, the one paper uses);
 *   - the spread is wider than the ceiling the caller supplies (`too_wide`). Exit legs pass the risk-derived spread
 *     ceiling; entry legs pass `Infinity` (crypto's precedent, `ENTRY_LEG_NO_SPREAD_CEILING`).
 * ⚠️ The stateless spread ceiling is the ONE standard VTS carries that paper does not — paper judges a quote with the
 * stateful book-state guard (plan §C3.7). It is what refuses the `#1065` stub-bid frame by construction.
 * A refusal is NO DECISION — never a fallback to the mark.
 * Pure: no I/O, no clock of its own.
 */
import { xstockTransactableSides } from './transactable-sides.js';
import type { XsQuoteRow } from './vts-xs-instrument.js';

export type XsGuardReason = 'ok' | 'no_row' | 'age_unknown' | 'too_old' | 'side_unusable' | 'too_wide';

export interface XsGuardResult {
  /** Both sides when `reason === 'ok'`; otherwise `null` — nothing to transact on. */
  sides: { bid: number; ask: number } | null;
  reason: XsGuardReason;
  /** The quote's age at `nowMs`, or `null` when it has no row or no usable stamp. */
  ageMs: number | null;
  /** `(ask − bid) / mid` when both sides are usable, else `null`. */
  spread: number | null;
}

export function guardXstockQuote(
  row: XsQuoteRow | null,
  nowMs: number,
  limits: { maxAgeMs: number; maxSpreadFraction: number },
): XsGuardResult {
  if (row === null) return { sides: null, reason: 'no_row', ageMs: null, spread: null };
  const ageMs = row.atMs === null ? null : nowMs - row.atMs;
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return { sides: null, reason: 'age_unknown', ageMs: null, spread: null };
  }
  if (!(ageMs <= limits.maxAgeMs)) return { sides: null, reason: 'too_old', ageMs, spread: null }; // also refuses a NaN ceiling
  const sides = xstockTransactableSides({ bid: row.bid, ask: row.ask });
  if (sides === null) return { sides: null, reason: 'side_unusable', ageMs, spread: null };
  const mid = (sides.bid + sides.ask) / 2;
  const spread = (sides.ask - sides.bid) / mid;
  if (!(spread <= limits.maxSpreadFraction)) return { sides: null, reason: 'too_wide', ageMs, spread };
  return { sides, reason: 'ok', ageMs, spread };
}
