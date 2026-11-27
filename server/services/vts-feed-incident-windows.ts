import {
  EQUITY_TICKER_MAX_TRANSPORT_GAP_MS,
  type getEquityTickerFeedEvidence,
} from './passive-archive/equity-spot-archiver.js';
import { VTS_COMMON_XSTOCK_INCIDENT_COHORT } from '../core/trading/vts-rail.js';
import { isInXstockWeekendClose } from '../asset_classes/xstock_spot/market-hours.js';

export const VTS_FEED_INCIDENT_SAMPLE_MS = 5_000;
const WINDOW_MS = 60_000;
const MIN_STALE_SYMBOLS = 10;
const UNVERIFIED_ALIASES = new Set(['AAPL/USD', 'HOOD/USD', 'MSTR/USD', 'SPY/USD']);
const WEEKEND_CLOSURE = 'kraken-equities/ticker/known-weekend-closure';

type FeedEvidence = ReturnType<typeof getEquityTickerFeedEvidence>;
type CoveredFeed = NonNullable<FeedEvidence> & { continuousFromMs: number; lastTransportMs: number };
type FeedMembers = CoveredFeed['members'];

export interface VtsFeedIncidentCohort {
  /** Exact producer, channel and verified session-eligibility group. */
  readonly key: string;
  readonly symbols: ReadonlySet<string>;
  readonly membershipRevision?: number;
}

export function vtsEquityIncidentCohort(monitored: Iterable<string>, verifiedWeekendClosure: boolean): VtsFeedIncidentCohort {
  const symbols = new Set<string>();
  for (const symbol of monitored) if (!UNVERIFIED_ALIASES.has(symbol)) symbols.add(symbol);
  const key = verifiedWeekendClosure ? WEEKEND_CLOSURE : VTS_COMMON_XSTOCK_INCIDENT_COHORT;
  return { key, symbols };
}

/** Publish a fresh cohort on changes to live trades, including changes mirrored by the weekend lifecycle. */
export class VtsIncidentTradeMap<T extends { assetClass: string; state?: string; symbol: string }> extends Map<string, T> {
  private counts = new Map<string, number>();
  private membershipRevision = 0;
  private openCohort: VtsFeedIncidentCohort | undefined;

  constructor() { super(); }

  private monitoredSymbol(trade: T | undefined): string | undefined {
    if (trade?.assetClass === 'xstock_spot' && trade.state !== 'pending' && trade.state !== 'weekend_suspended'
      && !UNVERIFIED_ALIASES.has(trade.symbol)) return trade.symbol;
  }

  private track(symbol: string | undefined, delta: 1 | -1): boolean {
    if (!symbol) return false;
    const before = this.counts.get(symbol) ?? 0;
    const after = before + delta;
    if (after === 0) this.counts.delete(symbol);
    else this.counts.set(symbol, after);
    return (before === 0) !== (after === 0);
  }

  private membershipChanged(): void {
    this.membershipRevision++;
    this.openCohort = undefined;
  }

  private replaceMonitoredSymbol(before: string | undefined, after: string | undefined): void {
    if (before === after) return;
    const removed = this.track(before, -1);
    const added = this.track(after, 1);
    if (removed || added) this.membershipChanged();
  }

  /** Refresh after an in-place lifecycle, fill, or bootstrap change to a resident trade. */
  refreshIncidentCohort(): void {
    const before = this.counts;
    this.counts = new Map();
    for (const trade of this.values()) this.track(this.monitoredSymbol(trade), 1);
    if (this.counts.size !== before.size || [...before.keys()].some(symbol => !this.counts.has(symbol))) this.membershipChanged();
  }

  override set(id: string, trade: T): this {
    this.replaceMonitoredSymbol(this.monitoredSymbol(this.get(id)), this.monitoredSymbol(trade));
    return super.set(id, trade);
  }

  setTradeState(id: string, state: T['state']): void {
    const trade = this.get(id);
    if (!trade) return;
    const before = this.monitoredSymbol(trade);
    trade.state = state;
    this.replaceMonitoredSymbol(before, this.monitoredSymbol(trade));
  }

  override delete(id: string): boolean {
    if (this.track(this.monitoredSymbol(this.get(id)), -1)) this.membershipChanged();
    return super.delete(id);
  }

  override clear(): void {
    super.clear();
    if (this.counts.size) this.membershipChanged();
    this.counts.clear();
  }

  incidentCohort(atMs: number): VtsFeedIncidentCohort {
    const cohort = this.openCohort ??= {
      ...vtsEquityIncidentCohort(this.counts.keys(), false), membershipRevision: this.membershipRevision,
    };
    return isInXstockWeekendClose(new Date(atMs))
      ? { ...cohort, key: WEEKEND_CLOSURE }
      : cohort;
  }
}

type CohortRevision = {
  key: string;
  generation: number;
  membershipRevision: number | undefined;
  subscriptionRevision: number;
  symbols: ReadonlySet<string>;
  members: FeedMembers;
  identity: string;
};

export interface VtsFeedIncidentEvidence {
  readonly key: string;
  readonly generation: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly subscribed: number;
  readonly qualified: readonly string[];
  readonly missing: readonly string[];
}

interface CrossingGrade {
  revision: CohortRevision;
  index: number;
  eligible: ReadonlySet<string>;
  evidence: VtsFeedIncidentEvidence | null;
}

interface WindowPair {
  key: string;
  identity: string;
  startMs: number;
  lastSampleMs: number;
  staleByWindow: Map<number, Set<string>>;
  grade?: CrossingGrade;
}

/** Receipts are checked again at crossing. A sample is never an exit-price witness. */
export class VtsFeedIncidentWindows {
  private pair: WindowPair | undefined;
  private revision: CohortRevision | undefined;

  reset(): void {
    this.pair = undefined;
    this.revision = undefined;
  }

  private currentRevision(cohort: VtsFeedIncidentCohort, feed: CoveredFeed): CohortRevision {
    const prior = this.revision;
    // Both publishers replace their snapshots on mutation. Transport clocks have their own crossing-time check.
    if (prior?.key === cohort.key && prior.generation === feed.generation
      && prior.membershipRevision === cohort.membershipRevision && prior.subscriptionRevision === feed.subscriptionRevision
      && prior.symbols === cohort.symbols && prior.members === feed.members) return prior;

    const identity = JSON.stringify([
      cohort.key, cohort.membershipRevision, feed.generation, feed.subscriptionRevision,
      [...cohort.symbols].sort().map(symbol => [symbol, feed.members.get(symbol)?.acknowledgedAtMs ?? null]),
    ]);
    return this.revision = {
      key: cohort.key, generation: feed.generation, membershipRevision: cohort.membershipRevision,
      subscriptionRevision: feed.subscriptionRevision, symbols: cohort.symbols, members: feed.members, identity,
    };
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
    const { identity } = this.currentRevision(cohort, feed);
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

  evidenceAtCrossing(symbol: string, cohort: VtsFeedIncidentCohort, feed: FeedEvidence, nowMs: number): VtsFeedIncidentEvidence | null {
    const pair = this.pair;
    if (!pair || !cohort.symbols.has(symbol) || !this.hasTransport(feed, nowMs)
      || nowMs < pair.lastSampleMs || nowMs - pair.lastSampleMs > EQUITY_TICKER_MAX_TRANSPORT_GAP_MS) return null;
    const nextIndex = Math.floor((pair.lastSampleMs - pair.startMs) / WINDOW_MS);
    const startMs = pair.startMs + (nextIndex - 2) * WINDOW_MS;
    if (nextIndex < 2 || feed.continuousFromMs > startMs) return null;
    const revision = this.currentRevision(cohort, feed);
    if (revision.identity !== pair.identity) {
      this.pair = undefined;
      return null;
    }
    // observeStale only writes at or after lastSampleMs, so neither completed window can change here.
    const grade = pair.grade;
    if (grade?.revision === revision && grade.index === nextIndex) return grade.eligible.has(symbol) ? grade.evidence : null;
    const first = pair.staleByWindow.get(nextIndex - 2);
    const second = pair.staleByWindow.get(nextIndex - 1);
    if (!first || !second) return null;

    const missing: string[] = [];
    const eligible = new Set<string>();
    let subscribed = 0;
    for (const member of cohort.symbols) {
      const receipt = feed.members.get(member);
      if (!receipt || receipt.acknowledgedAtMs > startMs) {
        missing.push(member);
        continue;
      }
      subscribed++;
      if (first.has(member) && second.has(member) && (receipt.updatedAtMs === null || receipt.updatedAtMs < startMs)) {
        eligible.add(member);
      }
    }
    const evidence: VtsFeedIncidentEvidence | null = eligible.size < Math.max(MIN_STALE_SYMBOLS, Math.ceil(subscribed * 0.8)) ? null : {
      key: pair.key, generation: feed.generation, startMs, endMs: startMs + 2 * WINDOW_MS,
      subscribed, qualified: [...eligible], missing,
    };
    pair.grade = { index: nextIndex, revision, eligible, evidence };
    return eligible.has(symbol) ? evidence : null;
  }
}
