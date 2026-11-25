import { readFileSync } from 'node:fs';
import {
  getLevelBasisFunnel,
  type FunnelOutcome,
  type LevelBasisFunnelRow,
  type LevelBasisRungKey,
} from '../../core/calculations/level-basis.js';
import { krakenAssetPairsService, type AutoMappingEntry } from '../../markets/kraken-asset-pairs-service.js';
import type { CachedPrice, SidesWriter } from '../price-cache.js';
import { pairwiseStatedSides } from './stated-sides.js';

type VenueMap = Pick<typeof krakenAssetPairsService,
  'isReady' | 'getAllMappings' | 'getExactMappingKeys' | 'resolveByInternal' | 'resolveByWsPair' |
  'resolveByRestPair' | 'resolveByKrakenKey' | 'resolveByCompactSymbol'>;
type StoredSides = Pick<CachedPrice, 'sidesWriter' | 'sidesCapturedAtMs' | 'symbol' | 'bid' | 'ask'>;
type CoverageGap = 'inherited_identity' | 'missing_provenance' | 'identity_change' | 'ambiguous_identity' |
  'unresolved_write' | 'dropped_write' | 'unresolved_walk' | 'observer_error';
type UntrackedReason = 'pre_ready' | 'outside_cohort' | 'outside_class' | 'unresolved' | 'identity_change';
type Counts<Key extends string> = Partial<Record<Key, number>>;

interface WalkCounts {
  attempted: number;
  byAcceptedSource: Record<string, number>;
}

interface SymbolCoverage {
  inherited: Counts<SidesWriter>;
  assigned: Counts<SidesWriter>;
  gaps: Counts<CoverageGap>;
}

interface Identity {
  symbol: string;
  venueKey: string;
}

function increment<Key extends string>(counts: Counts<Key>, key: Key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function recordWalk<Key>(rows: Map<Key, WalkCounts>, key: Key, outcome: FunnelOutcome) {
  let row = rows.get(key);
  if (!row) {
    row = { attempted: 0, byAcceptedSource: {} };
    rows.set(key, row);
  }
  row.attempted++;
  if (outcome.ok && outcome.acceptedSource) increment(row.byAcceptedSource, outcome.acceptedSource);
}

function sameIdentity(left: Identity, right: Identity) {
  return left.symbol === right.symbol && left.venueKey === right.venueKey;
}

function identityOf(entry: AutoMappingEntry): Identity {
  return { symbol: entry.internalSymbol, venueKey: entry.krakenPairKey };
}

function indexMappingClaims(mappings: AutoMappingEntry[]) {
  const claims = new Map<string, AutoMappingEntry[]>();
  for (const entry of mappings) {
    for (const name of new Set([entry.internalSymbol, entry.krakenRestPair, entry.krakenWsPair,
      entry.krakenPairKey, entry.base + entry.quote].map(key => key.toUpperCase()))) {
      const prior = claims.get(name);
      if (prior) prior.push(entry);
      else claims.set(name, [entry]);
    }
  }
  return claims;
}

function readBuildSha() {
  try { return readFileSync('dist/BUILD_SHA', 'utf8').trim() || null; }
  catch { return null; }
}

export class KrakenPriceSourceDiagnostics {
  private keys = new Map<string, Identity>();
  private symbols = new Map<string, SymbolCoverage>();
  private globalGaps: Counts<CoverageGap> = {};
  private trackedWalks = new Map<string, Map<string, WalkCounts>>();
  private untrackedWalks = new Map<string, Map<UntrackedReason, WalkCounts>>();
  private cacheEntries: (() => Iterable<readonly [string, StoredSides]>) | undefined;
  private baseline: LevelBasisFunnelRow[] = [];
  private startedAtMs: number | null = null;

  constructor(private readonly venue: VenueMap) {}

  bindCache(entries: () => Iterable<readonly [string, StoredSides]>): void {
    this.cacheEntries = entries;
  }

  observeMappingPublication(): void {
    if (this.startedAtMs === null) {
      this.startIfReady();
      return;
    }
    try {
      // Record changes at publication, even if nobody reads or writes a quote before the next refresh.
      const claims = indexMappingClaims(this.venue.getAllMappings());
      for (const key of new Set([...this.keys.keys(), ...claims.keys(), ...this.venue.getExactMappingKeys()])) {
        const frozen = this.keys.get(key);
        const indexed = this.lookupClaims(key);
        const candidates = this.identitiesForPublication(indexed, claims.get(key));
        if (candidates.length > 1) this.markGap('ambiguous_identity', frozen, ...candidates);
        // A declaration can survive even when its exact lookup has disappeared.
        else if (frozen && (!indexed[0] || !sameIdentity(frozen, identityOf(indexed[0])))) {
          this.markGap('identity_change', frozen, candidates[0]);
        }
      }
    } catch {
      this.markGap('observer_error');
    }
  }

  private lookupClaims(key: string): AutoMappingEntry[] {
    return [
      this.venue.resolveByInternal(key),
      this.venue.resolveByWsPair(key),
      this.venue.resolveByRestPair(key),
      this.venue.resolveByKrakenKey(key),
      this.venue.resolveByCompactSymbol(key),
    ].filter((entry): entry is AutoMappingEntry => entry !== undefined);
  }

  private identitiesForPublication(indexed: AutoMappingEntry[], declared: AutoMappingEntry[] = []): Identity[] {
    // The exact indexes can each retain just one owner for a spelling. Retain declared claimants too.
    const distinct = new Map<string, Identity>();
    for (const entry of [...indexed, ...declared]) {
      const identity = identityOf(entry);
      distinct.set(JSON.stringify([identity.symbol, identity.venueKey]), identity);
    }
    return Array.from(distinct.values());
  }

  private exactIdentity(key: string, canonicalHint?: string): Identity | undefined {
    // The writer/selection supplied an actual key. Guessed suffix identities cannot prove coverage.
    const matches = this.lookupClaims(key);
    const first = matches[0];
    if (!first || matches.some(entry => entry.krakenPairKey !== first.krakenPairKey ||
      entry.internalSymbol !== first.internalSymbol)) return undefined;
    if (canonicalHint !== undefined && first.internalSymbol !== canonicalHint) return undefined;
    return identityOf(first);
  }

  private markGap(reason: CoverageGap, ...identities: Array<Identity | undefined>): void {
    const affected = new Set(identities.flatMap(identity => identity ? [identity.symbol] : []));
    if (affected.size === 0) increment(this.globalGaps, reason);
    for (const symbol of affected) {
      const coverage = this.symbols.get(symbol);
      if (coverage) increment(coverage.gaps, reason);
    }
  }

  startIfReady(): void {
    if (this.startedAtMs !== null || this.globalGaps.observer_error) return;
    try {
      if (!this.venue.isReady() || !this.cacheEntries) return;
      const mappings = this.venue.getAllMappings();
      if (mappings.length === 0) return;
      for (const entry of mappings) {
        this.symbols.set(entry.internalSymbol, { inherited: {}, assigned: {}, gaps: {} });
      }
      const claims = indexMappingClaims(mappings);
      for (const key of new Set([...claims.keys(), ...this.venue.getExactMappingKeys()])) {
        const indexed = this.lookupClaims(key);
        const candidates = this.identitiesForPublication(indexed, claims.get(key));
        if (candidates.length > 1) this.markGap('ambiguous_identity', ...candidates);
        else if (indexed[0]) {
          const identity = identityOf(indexed[0]);
          const canonical = this.venue.resolveByInternal(identity.symbol);
          if (canonical && sameIdentity(identity, identityOf(canonical))) this.keys.set(key, identity);
        }
      }
      // Iterate actual cache keys, including aliases that do not appear in the row values.
      for (const [key, row] of this.cacheEntries()) {
        if (row.sidesWriter == null && row.sidesCapturedAtMs == null) continue;
        const identity = this.exactIdentity(key);
        const rowIdentity = this.exactIdentity(row.symbol);
        const coverage = identity && this.symbols.get(identity.symbol);
        if (!identity || !coverage || !rowIdentity || !sameIdentity(identity, rowIdentity)) {
          this.markGap('inherited_identity');
          continue;
        }
        this.keys.set(key.toUpperCase(), identity);
        // The inherited row does not retain the adapter's raw response key.
        if (row.sidesWriter === 'rest_adapter' || row.sidesWriter == null ||
            row.sidesCapturedAtMs == null || !Number.isFinite(row.sidesCapturedAtMs) ||
            pairwiseStatedSides(row.bid, row.ask) === null) {
          this.markGap('missing_provenance', identity);
          continue;
        }
        increment(coverage.inherited, row.sidesWriter);
      }
      this.baseline = getLevelBasisFunnel();
      this.startedAtMs = Date.now();
    } catch {
      // A failed diagnostic capture may never affect a write or decision.
      this.markGap('observer_error');
    }
  }

  recordAssignment(
    key: string,
    row: StoredSides,
    validPair: boolean,
    canonicalHint?: string,
    restResponseKey?: string,
  ): void {
    if (this.startedAtMs === null) return;
    try {
      const frozen = this.keys.get(key.toUpperCase());
      const current = this.exactIdentity(key, canonicalHint);
      if (!current) {
        this.markGap('unresolved_write', frozen);
        return;
      }
      if (!frozen || !sameIdentity(frozen, current)) {
        this.markGap('identity_change', frozen, current);
        return;
      }
      if (!validPair || row.sidesWriter == null || row.sidesCapturedAtMs == null || !Number.isFinite(row.sidesCapturedAtMs)) {
        this.markGap('missing_provenance', current);
        return;
      }
      if (row.sidesWriter === 'rest_adapter') {
        const frozenResponse = restResponseKey ? this.keys.get(restResponseKey.toUpperCase()) : undefined;
        const exactResponse = restResponseKey ? this.exactIdentity(restResponseKey) : undefined;
        if (!frozenResponse || !exactResponse ||
            !sameIdentity(current, frozenResponse) || !sameIdentity(current, exactResponse)) {
          this.markGap('identity_change', current);
          return;
        }
      }
      const coverage = this.symbols.get(current.symbol);
      if (coverage) increment(coverage.assigned, row.sidesWriter);
    } catch {
      this.markGap('observer_error');
    }
  }

  recordDroppedAssignment(key: string): void {
    if (this.startedAtMs === null) return;
    this.markGap('dropped_write', this.keys.get(key.toUpperCase()));
  }

  checkRestResponseIdentity(key: string, entry: AutoMappingEntry): void {
    if (this.startedAtMs === null) return;
    const frozen = this.keys.get(key.toUpperCase());
    const current = { symbol: entry.internalSymbol, venueKey: entry.krakenPairKey };
    if (frozen ? !sameIdentity(frozen, current) : this.symbols.has(current.symbol)) {
      this.markGap('identity_change', frozen, current);
    }
  }

  private classifyWalk(assetClass: string, key: string | undefined): { symbol: string } | UntrackedReason {
    if (assetClass !== 'crypto_spot') return 'outside_class';
    if (this.startedAtMs === null) return 'pre_ready';
    const frozen = key ? this.keys.get(key.toUpperCase()) : undefined;
    const current = key ? this.exactIdentity(key) : undefined;
    if (!current) {
      this.markGap('unresolved_walk', frozen);
      return 'unresolved';
    }
    if (!this.symbols.has(current.symbol) && !frozen) return 'outside_cohort';
    if (!frozen || !sameIdentity(frozen, current)) {
      this.markGap('identity_change', frozen, current);
      return 'identity_change';
    }
    return { symbol: current.symbol };
  }

  recordWalkOutcomes(base: Omit<LevelBasisRungKey, 'rung'>, key: string | undefined, book: FunnelOutcome, ladder: FunnelOutcome): void {
    try {
      const outcome = this.classifyWalk(base.assetClass, key);
      for (const [rung, result] of [['book', book], ['ladder', ladder]] as const) {
        const cell = `${base.lane}:${base.assetClass}:${base.stage}:${rung}`;
        if (typeof outcome === 'string') {
          let rows = this.untrackedWalks.get(cell);
          if (!rows) { rows = new Map(); this.untrackedWalks.set(cell, rows); }
          recordWalk(rows, outcome, result);
        } else {
          let rows = this.trackedWalks.get(cell);
          if (!rows) { rows = new Map(); this.trackedWalks.set(cell, rows); }
          recordWalk(rows, outcome.symbol, result);
        }
      }
    } catch {
      this.markGap('observer_error');
    }
  }

  snapshot(nowMs: number, aggregate: LevelBasisFunnelRow[]) {
    const symbols = Array.from(this.symbols, ([symbol, counts]) => ({
      symbol,
      inherited: { ...counts.inherited },
      assigned: { ...counts.assigned },
      gaps: { ...counts.gaps },
    }));
    const tracked = Array.from(this.trackedWalks, ([key, walks]) =>
      Array.from(walks, ([symbol, counts]) => ({ key, symbol, ...counts, byAcceptedSource: { ...counts.byAcceptedSource } }))).flat();
    const untracked = Array.from(this.untrackedWalks, ([key, walks]) =>
      Array.from(walks, ([reason, counts]) => ({ key, reason, ...counts, byAcceptedSource: { ...counts.byAcceptedSource } }))).flat();
    const counted = new Map<string, WalkCounts>();
    for (const row of [...tracked, ...untracked]) {
      let total = counted.get(row.key);
      if (!total) { total = { attempted: 0, byAcceptedSource: {} }; counted.set(row.key, total); }
      total.attempted += row.attempted;
      for (const [source, count] of Object.entries(row.byAcceptedSource)) {
        total.byAcceptedSource[source] = (total.byAcceptedSource[source] ?? 0) + count;
      }
    }
    const reconciliation = aggregate.map(row => {
      const total = counted.get(row.key);
      counted.delete(row.key);
      const sources = new Set([...Object.keys(row.byAcceptedSource), ...Object.keys(total?.byAcceptedSource ?? {})]);
      return {
        key: row.key,
        attemptsMatch: row.attempted === (total?.attempted ?? 0),
        sourcesMatch: Array.from(sources).every(source =>
          (row.byAcceptedSource[source] ?? 0) === (total?.byAcceptedSource[source] ?? 0)),
      };
    });
    return {
      capturedAtMs: nowMs,
      coverage: {
        startedAtMs: this.startedAtMs,
        globalGaps: { ...this.globalGaps },
        symbols,
      },
      baseline: this.baseline.map(row => ({ key: row.key, attempted: row.attempted, byAcceptedSource: { ...row.byAcceptedSource } })),
      tracked,
      untracked,
      reconciliation,
      supplementalOnlyKeys: [...counted.keys()],
    };
  }
}

const lifetime = {
  buildSha: readBuildSha(),
  pid: process.pid,
  processStartedAtMs: Math.round(Date.now() - process.uptime() * 1000),
};
export const krakenPriceSourceDiagnostics = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);

export function captureLevelBasisDiagnostics(
  restReceiptOrdering?: Partial<Record<SidesWriter, { eligibleOverwrites: number; strictInversions: number }>>,
) {
  const levelBasisFunnel = getLevelBasisFunnel();
  if (!restReceiptOrdering) return { levelBasisFunnel };
  return {
    levelBasisFunnel,
    krakenPriceSourceBySymbol: {
      lifetime: { ...lifetime },
      ...krakenPriceSourceDiagnostics.snapshot(Date.now(), levelBasisFunnel),
      restReceiptOrdering,
    },
  };
}
