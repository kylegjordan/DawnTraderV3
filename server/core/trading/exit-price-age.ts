/**
 * `B-PRICE-STALENESS-BOUND` P4 — `B-PRICE-SIDE-BY-JOB` row 8g, moved here by Langston's Step-2 ruling (2026-10-10).
 *
 * THE CRYPTO EXIT AGE CHECK. D7 (`PRICING_DECISIONS_2026-09-11.md`): *"a cache re-serve or a failed refresh never renews
 * observation age … and every action rechecks the retained observation against D6."* D6 for crypto exits is the exit
 * loop's 2 s window. The adapter's fresh-venue arm tests `cachedAt` — a RECEIPT time the cache writer stamps on every
 * write — so a rate-limited REST re-serve (producer `kraken_rest_rate_limited_reserve`, which keeps `source:
 * 'kraken_rest'` and its ORIGINAL `observedAt`) is written back with a fresh `cachedAt` and passes that arm as a venue
 * price for 2 s. This judges the RETAINED observation instead.
 *
 * Clock: the crypto adapter stamps `observedAt` on OUR receipt clock (a WS tick: `now`; the REST poller: `Date.now()` at
 * the fetch), the same clock as `cachedAt`, so no venue/receipt skew enters the comparison.
 * A producer in `AGE_EXEMPTION_BY_PRODUCER` passes BY DECLARATION (fresh by construction) and is counted by the caller
 * — never inferred from a null stamp. A missing stamp on a non-exempt producer is NOT fresh.
 * PURE: the exemption predicate is injected (as `venue-mark-actionable.ts` injects the venue predicate).
 */

/** D6's crypto exit window — the ONE number both the adapter read and this recheck use, so they cannot drift. */
export const CRYPTO_EXIT_PRICE_MAX_AGE_MS = 2000;

export type ExitPriceAgeVerdict = 'fresh' | 'exempt' | 'stale' | 'unstamped';

export interface ExitPriceAgeJudgement {
  verdict: ExitPriceAgeVerdict;
  /** May this price decide an exit? */
  actionable: boolean;
  /** now − observedAt on the receipt clock; null when there is no stamp. */
  ageMs: number | null;
}

export function judgeExitPriceAge(
  quote: { observedAt: number | null | undefined; producer: string },
  nowMs: number,
  maxAgeMs: number,
  isExemptProducer: (producer: string) => boolean,
): ExitPriceAgeJudgement {
  const obs = quote.observedAt;
  const ageMs = typeof obs === 'number' && Number.isFinite(obs) ? nowMs - obs : null;
  if (ageMs !== null && ageMs <= maxAgeMs) return { verdict: 'fresh', actionable: true, ageMs };
  if (isExemptProducer(quote.producer)) return { verdict: 'exempt', actionable: true, ageMs };
  return { verdict: ageMs === null ? 'unstamped' : 'stale', actionable: false, ageMs };
}
