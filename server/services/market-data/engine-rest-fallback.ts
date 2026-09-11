/**
 * B-PRICE-SIDE-BY-JOB r5 — P-7h (decision D7; pre-audit A-9.4; Langston's P-7h ruling (a) and its three conditions,
 * 2026-09-11): THE ACTIVE EXECUTION ENGINE'S DIRECT KRAKEN REST FALLBACK, THROUGH THE SHARED REST TOKEN BUCKET.
 *
 * ⛔ WHAT WAS WRONG: the engine's exit loop fell back to a bare `krakenService.getTicker` whenever the live price was
 * not an actionable venue price. `restRateLimiter` had ONE production caller — the live-pricing adapter — so this leg
 * was the engine's unlimited REST path: with the WebSocket dark, every open position asked Kraken on every tick.
 *
 * ⛔ WHY A TOKEN AND NOT `check()`: `check()` also arms a 60 s per-symbol cooldown on every allowed adapter fetch, and
 * the adapter fetches by REST exactly when the WebSocket price is stale — the same condition that sends the engine
 * here. Sharing it would make this fallback structurally unreachable for any symbol under REST refresh. The bucket is
 * what prevents a venue ban; the cooldown is the adapter's own polling pace.
 *
 * ORDER IS THE CONTRACT, AND THE TESTS PIN IT AS BEHAVIOUR:
 * 1. the token is taken BEFORE the request, and a refusal never reaches the venue (`rest_token_exhausted`);
 * 2. a token taken is NEVER returned — including when the request throws, because the venue was hit;
 * 3. the venue's own rate-limit refusal is its own reason (`rest_venue_rate_limited`), not `rest_failed`.
 *
 * ⛔ A LEAF (it imports only the mid-or-last predicate), so the refusal is testable without the engine's module graph.
 */
import { markKindOf } from './mark-kind.js';

/** Why the engine skipped a position's exit check on this leg. Four facts, never pooled. */
export type EngineRestSkipReason =
  | 'rest_token_exhausted' // our shared REST budget was empty — Kraken was NOT asked
  | 'rest_no_data' // Kraken answered with no ticker row for the pair
  | 'rest_venue_rate_limited' // Kraken refused the request with its rate-limit error
  | 'rest_failed'; // any other failure (network, parse, pair resolution)

export type EngineRestFallbackResult =
  | { kind: 'price'; price: number; bid: number; ask: number; lastTrade: number; markKind: 'mid' | 'last' }
  | { kind: 'skip'; reason: EngineRestSkipReason; error?: unknown };

/**
 * Condition 1: `makePublicRequest` (`exchanges/kraken/kraken.ts:177-195`) throws the venue's error array as a generic
 * `Error("Kraken API error: …")`, so a real venue rate-limit refusal used to land in `rest_failed` beside network
 * failures. `EAPI:Rate limit` is Kraken's own error code — the same token `execution/venue-validate.ts` matches.
 */
export function classifyEngineRestFailure(err: unknown): 'rest_venue_rate_limited' | 'rest_failed' {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return msg.includes('EAPI:Rate limit') ? 'rest_venue_rate_limited' : 'rest_failed';
}

export async function resolveEngineRestFallback(
  restPair: string,
  deps: {
    /** Takes ONE token from the shared bucket; false = refused. Must never arm a per-symbol cooldown. */
    takeToken: () => boolean;
    getTicker: (pair: string) => Promise<Record<string, any>>;
  },
): Promise<EngineRestFallbackResult> {
  if (!deps.takeToken()) {
    return { kind: 'skip', reason: 'rest_token_exhausted' };
  }
  let ticker: Record<string, any>;
  try {
    ticker = await deps.getTicker(restPair);
  } catch (error) {
    // ⛔ NO REFUND (condition 3): the request was sent, so the token stays spent.
    return { kind: 'skip', reason: classifyEngineRestFailure(error), error };
  }
  const tickerData = ticker ? Object.values(ticker)[0] : undefined;
  if (!tickerData) {
    return { kind: 'skip', reason: 'rest_no_data' };
  }
  // 8.9.2 arithmetic, unchanged: the midpoint when both sides exist, else the last trade.
  const ask = parseFloat(tickerData.a[0]);
  const bid = parseFloat(tickerData.b[0]);
  const lastTrade = parseFloat(tickerData.c[0]);
  const markKind = markKindOf(bid, ask);
  return { kind: 'price', price: markKind === 'mid' ? (ask + bid) / 2 : lastTrade, bid, ask, lastTrade, markKind };
}
