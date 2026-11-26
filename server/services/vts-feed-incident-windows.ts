import {
  EQUITY_TICKER_MAX_TRANSPORT_GAP_MS,
  type getEquityTickerFeedEvidence,
} from './passive-archive/equity-spot-archiver.js';

export const VTS_FEED_INCIDENT_SAMPLE_MS = 5_000;
const WINDOW_MS = 60_000;
const MIN_STALE_SYMBOLS = 10;
const UNVERIFIED_ALIASES = new Set(['AAPL/USD', 'HOOD/USD', 'MSTR/USD', 'SPY/USD']);

type FeedEvidence = ReturnType<typeof getEquityTickerFeedEvidence>;
type CoveredFeed = NonNullable<FeedEvidence> & { continuousFromMs: number; lastTransportMs: number };

export interface VtsFeedIncidentCohort {
  /** Exact producer, channel and verified session-eligibility group. */
  key: string;
  symbols: ReadonlySet<string>;
}

export function vtsEquityIncidentCohort(monitored: Iterable<string>, verifiedWeekendClosure: boolean): VtsFeedIncidentCohort {
  const symbols = new Set<string>();
  for (const symbol of monitored) if (!UNVERIFIED_ALIASES.has(symbol)) symbols.add(symbol);
  const session = verifiedWeekendClosure ? 'known-weekend-closure' : 'common-session';
  return { key: `kraken-equities/ticker/${session}`, symbols };
}

interface WindowPair {
  key: string;
  identity: string;
  startMs: number;
  lastSampleMs: number;
  staleByWindow: Map<number, Set<string>>;
}

/** Receipts are checked again at crossing. A sample is never an exit-price witness. */
export class VtsFeedIncidentWindows {
  private pair: WindowPair | undefined;

  reset(): void {
    this.pair = undefined;
  }

  private identity(cohort: VtsFeedIncidentCohort, feed: NonNullable<FeedEvidence>): string {
    return JSON.stringify([
      cohort.key, feed.generation,
      [...cohort.symbols].sort().map(symbol => [symbol, feed.members.get(symbol)?.acknowledgedAtMs ?? null]),
    ]);
  }

  private hasTransport(feed: FeedEvidence, nowMs: number): feed is CoveredFeed {
    return Boolean(feed?.warmedUp && feed.continuousFromMs !== null && feed.lastTransportMs !== null
      && feed.lastTransportMs <= nowMs && nowMs - feed.lastTransportMs <= EQUITY_TICKER_MAX_TRANSPORT_GAP_MS);
  }

  sample(cohort: VtsFeedIncidentCohort, feed: FeedEvidence, nowMs: number): void {
    if (!this.hasTransport(feed, nowMs)) {
      this.reset();
      return;
    }
    const identity = this.identity(cohort, feed);
    const pair = this.pair;
    if (!pair || identity !== pair.identity || nowMs < pair.lastSampleMs
      || nowMs - pair.lastSampleMs > EQUITY_TICKER_MAX_TRANSPORT_GAP_MS
      || feed.continuousFromMs > pair.lastSampleMs) {
      this.pair = { key: cohort.key, identity, startMs: nowMs, lastSampleMs: nowMs, staleByWindow: new Map() };
      return;
    }
    pair.lastSampleMs = nowMs;
    const currentIndex = Math.floor((nowMs - pair.startMs) / WINDOW_MS);
    for (const index of pair.staleByWindow.keys()) {
      if (index < currentIndex - 2) pair.staleByWindow.delete(index);
    }
  }

  /** Call only for an actual, guarded VTS stale quote result. */
  observeStale(symbol: string, nowMs: number): void {
    const pair = this.pair;
    if (!pair || nowMs < pair.lastSampleMs || nowMs - pair.lastSampleMs > EQUITY_TICKER_MAX_TRANSPORT_GAP_MS) return;
    const index = Math.floor((nowMs - pair.startMs) / WINDOW_MS);
    const symbols = pair.staleByWindow.get(index) ?? new Set<string>();
    symbols.add(symbol);
    pair.staleByWindow.set(index, symbols);
  }

  evidenceAtCrossing(symbol: string, cohort: VtsFeedIncidentCohort, feed: FeedEvidence, nowMs: number) {
    const pair = this.pair;
    if (!pair || !this.hasTransport(feed, nowMs) || this.identity(cohort, feed) !== pair.identity
      || nowMs < pair.lastSampleMs || nowMs - pair.lastSampleMs > EQUITY_TICKER_MAX_TRANSPORT_GAP_MS) return null;
    const nextIndex = Math.floor((pair.lastSampleMs - pair.startMs) / WINDOW_MS);
    const startMs = pair.startMs + (nextIndex - 2) * WINDOW_MS;
    if (nextIndex < 2 || feed.continuousFromMs > startMs) return null;
    const first = pair.staleByWindow.get(nextIndex - 2);
    const second = pair.staleByWindow.get(nextIndex - 1);
    if (!first || !second) return null;

    const missing: string[] = [];
    const qualified: string[] = [];
    let subscribed = 0;
    for (const member of cohort.symbols) {
      const receipt = feed.members.get(member);
      if (!receipt || receipt.acknowledgedAtMs > startMs) {
        missing.push(member);
        continue;
      }
      subscribed++;
      if (first.has(member) && second.has(member) && (receipt.updatedAtMs === null || receipt.updatedAtMs < startMs)) {
        qualified.push(member);
      }
    }
    if (!qualified.includes(symbol) || qualified.length < Math.max(MIN_STALE_SYMBOLS, Math.ceil(subscribed * 0.8))) return null;
    return {
      key: pair.key, generation: feed.generation, startMs, endMs: startMs + 2 * WINDOW_MS,
      subscribed, qualified, missing,
    };
  }
}

export type VtsFeedIncidentEvidence = NonNullable<ReturnType<VtsFeedIncidentWindows['evidenceAtCrossing']>>;
