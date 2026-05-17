/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B63 Item 16 — Directional Bias Store (Persistent per-pair DBS + atomic snapshot)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the opportunistic-cache-read approach with:
 *   1. Persistent per-pair DBS entries with timestamps (hard expiry 5 minutes)
 *   2. End-of-cycle atomic snapshot publish
 *   3. Fixed 20-pair floor (replaces prior 70% coverage gate)
 *
 * Consumers read `getLatestGlobalDbsSnapshot()` and receive a deterministic
 * value within any given cycle. Stale / cold-start / below-floor / invalid-compute
 * states are explicit via snapshot.isStale and/or `null` returns.
 *
 * Behavior spec (from BATCH_63_PRE_AUDIT.md §13 Item 16) — five mutually-exclusive
 * situations, each with explicit behavior and log:
 *
 *   1. Cold start (empty store, no prior snapshot)
 *        → return null; log `[GlobalDBS][coldStart] snapshot unavailable, store has N pairs, floor 20`
 *   2. Sample count below floor AND a prior good snapshot exists
 *        → return last good snapshot with isStale: true; log `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=N, floor 20`
 *   3. Sample count below floor AND no prior snapshot exists
 *        → return null; log `[GlobalDBS][noSnapshot] store below floor and no prior snapshot; returning null`
 *   4. Sample count ≥ 20 BUT computed value is invalid (NaN / non-finite)
 *        → keep last good snapshot with isStale: true; log `[GlobalDBS][invalidCompute] kept prior snapshot`
 *   5. Sample count ≥ 20 and compute succeeds (happy path)
 *        → publish fresh snapshot with isStale: false; no explicit log (normal operation)
 *
 * Key principle: `null` and `isStale: true` are DIFFERENT states. Consumers must
 * check both and never substitute zero or any default for `null`.
 *
 * Scope constraint: in-memory only for B63 (Langston-confirmed). Cold-start
 * warmup is acceptable; DB-backed persistence deferred to B64+ if operational
 * evidence requires it.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { computeGlobalDirectionalBias } from './directional-bias';
import type { GlobalDirectionalBias } from '../../types/directional-bias.types';
// B72 (2026-05-05): GLOBAL_DBS_MIN_SAMPLE_COUNT moved to module='dbs_calculation'.
// B-PHASE-A2 (2026-05-17): per-asset-class resolution via constructor option.
import { getCachedNumberRequired, getCachedConstant } from '../../services/module-constants-service.js';
import type { XstockSector } from '../../../shared/asset-classes.js';

/**
 * B-PHASE-A2 — Sectors that count toward the xStock global-floor + sector-coverage-floor.
 * INDEX_PROXY / BROAD_ETF / INTL_ETF / undefined are EXCLUDED.
 */
const GICS_SECTORS: ReadonlySet<XstockSector> = new Set<XstockSector>([
  'XLK', 'XLE', 'XLV', 'XLF', 'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
]);

function getGlobalDbsMinSampleCount(assetClass: 'crypto_spot' | 'xstock_spot'): number {
  return getCachedNumberRequired('dbs_calculation', 'min_sample_count',
    { exchange: '*', assetClass, strategy: '*', regime: '*' });
}

function getSectorCoverageFloor(): number {
  // B-PHASE-A2: xStock-only knob. Crypto store never calls this.
  // Default 7 if cold cache / row missing — matches B-PHASE-A2 Layer-1 starter.
  try {
    const v = getCachedConstant<number>('dbs_calculation', 'sector_coverage_floor',
      { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' });
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 7;
  } catch {
    return 7;
  }
}

/**
 * Per-pair store entry. Timestamp is the last time this pair's DBS was updated.
 *
 * B-PHASE-A2 (2026-05-17): optional `sector` field added for the xStock store
 * instance. Crypto writes leave it undefined; xStock writes populate it from
 * `XSTOCK_SPOT_REGISTRY` at the call site. xStock `publishSnapshot()` consults
 * the field for partition filtering (GICS-sectored vs INDEX_PROXY/BROAD_ETF/INTL_ETF).
 */
interface PairStoreEntry {
  score: number;
  timestamp: number;
  sentinelZero: boolean;
  volume: number;
  sector?: XstockSector;
}

/**
 * B-PHASE-A2 — Constructor option for `DirectionalBiasStore`.
 *
 * `mode` discriminator:
 *   - `'crypto'`: original behavior (single floor `min_sample_count`, no sector partition).
 *     Crypto callers use `directionalBiasStore` (4-arg `updatePair` signature back-compat).
 *   - `'xstock'`: applies (a) sector partition filter at aggregation time (excludes
 *     INDEX_PROXY/BROAD_ETF/INTL_ETF/undefined-sector entries from weighted-median);
 *     (b) global-floor count counts ONLY GICS-sectored non-sentinel entries; (c) additional
 *     `sector_coverage_floor` gate (≥N distinct GICS sectors with ≥1 non-sentinel entry each).
 *
 * `assetClassForKnobs`: routes `module_constants.dbs_calculation.*` reads to the
 * per-asset-class row. xStock instance reads `asset_class='xstock_spot'` rows; crypto
 * instance reads `'crypto_spot'` rows (which today fall through to the wildcard `*` row
 * with min_sample_count=20).
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.1 (constructor option pattern, locked
 * after Langston R4 review).
 */
export interface DirectionalBiasStoreOptions {
  mode: 'crypto' | 'xstock';
  assetClassForKnobs: 'crypto_spot' | 'xstock_spot';
}

/**
 * Atomic snapshot of global DBS, published at end of cycle.
 * `isStale: true` means we served a prior snapshot because current inputs were
 * insufficient or invalid. Consumers surface this in UI where appropriate.
 */
export interface GlobalDbsSnapshot {
  value: GlobalDirectionalBias;
  snapshotTime: number;
  coverage: number;       // number of non-expired pairs used (or the count when last good)
  isStale: boolean;
}

/** Hard expiry for per-pair entries. Older entries are pruned. */
const PAIR_HARD_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Fixed floor — do not compute global DBS from fewer than this many pairs.
 *
 * @deprecated B72: live runtime callers use `getGlobalDbsMinSampleCount()`.
 * This exported constant exists for tests + non-runtime tooling that runs
 * before module_constants is warmed. Mirrors the seed value of the
 * 'dbs_calculation' / 'min_sample_count' module_constants row; if you tune
 * that row, this constant will NOT auto-update — keep in sync manually.
 */
export const GLOBAL_DBS_MIN_SAMPLE_COUNT = 20;

/** Ring-buffer size for snapshot history. 96 entries × 15 min = 24h of history. */
const SNAPSHOT_HISTORY_MAX = 96;

/** Ring-buffer size for category transitions. Keeps most recent N category changes. */
const TRANSITION_HISTORY_MAX = 50;

/**
 * Minimal snapshot record for the history ring buffer. Trimmed from the full
 * GlobalDbsSnapshot to keep memory bounded — we only persist the values the
 * dashboard needs for plotting.
 */
export interface HistoricalSnapshot {
  timestamp: number;  // epoch ms
  score: number;
  category: string;
  pairCount: number;
}

/**
 * Category transition event. Emitted by the store whenever publishSnapshot
 * produces a different `category` than the prior published snapshot.
 */
export interface CategoryTransition {
  timestamp: number;
  from: string;
  to: string;
  scoreAt: number;
}

class DirectionalBiasStore {
  private store = new Map<string, PairStoreEntry>();
  private latestSnapshot: GlobalDbsSnapshot | null = null;
  private history: HistoricalSnapshot[] = [];
  private transitions: CategoryTransition[] = [];
  private readonly opts: DirectionalBiasStoreOptions;

  /**
   * B-PHASE-A2 (2026-05-17): constructor accepts mode + assetClassForKnobs option.
   * Default `{ mode: 'crypto', assetClassForKnobs: 'crypto_spot' }` preserves the
   * pre-B-PHASE-A2 behavior for the existing singleton export (`directionalBiasStore`).
   * The new `xstockDirectionalBiasStore` singleton (exported below) uses
   * `{ mode: 'xstock', assetClassForKnobs: 'xstock_spot' }`.
   */
  constructor(opts: DirectionalBiasStoreOptions = { mode: 'crypto', assetClassForKnobs: 'crypto_spot' }) {
    this.opts = opts;
  }

  /**
   * Update (or insert) a pair's DBS entry. Called whenever computePairDirectionalBias
   * produces a fresh value — typically during the scan cycle's per-pair processing.
   *
   * B-PHASE-A2: optional 5th `sector` parameter (xStock store only). Crypto callers
   * pass 4 args (back-compat preserved); xStock callers pass the sector tag from
   * `XSTOCK_SPOT_REGISTRY`.
   */
  updatePair(symbol: string, score: number, sentinelZero: boolean, volume: number, sector?: XstockSector): void {
    this.store.set(symbol, {
      score,
      timestamp: Date.now(),
      sentinelZero,
      volume,
      sector,
    });
  }

  /**
   * Sweep hard-expired entries. Called at the start of publishSnapshot so expired
   * entries do not contaminate the sample.
   */
  private pruneExpired(): number {
    const cutoff = Date.now() - PAIR_HARD_EXPIRY_MS;
    let pruned = 0;
    for (const [sym, entry] of this.store.entries()) {
      if (entry.timestamp < cutoff) {
        this.store.delete(sym);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Publish an atomic global DBS snapshot. Called at the end of each scan cycle
   * (or on-demand by MCE.computeGlobalBias for backward compatibility).
   *
   * Implements the five-row behavior spec documented at top of file.
   *
   * @returns the freshly-published snapshot, a stale snapshot, or null
   */
  publishSnapshot(): GlobalDbsSnapshot | null {
    this.pruneExpired();

    // B-PHASE-A2: xStock mode applies sector partition + GICS-only + non-sentinel counting
    // for floor evaluation. Crypto mode uses the pre-B-PHASE-A2 count semantics (all entries).
    //
    // Eligible entries for the xStock global aggregation + floor are:
    //   - sector ∈ GICS_SECTORS (XLK..XLC) — INDEX_PROXY / BROAD_ETF / INTL_ETF excluded
    //   - sentinelZero === false — degraded compute results don't count
    //
    // Crypto's freshCount remains `this.store.size` (back-compat, including sentinels —
    // discrepancy filed as RUNNING_ISSUES per B_PHASE_A1_DBS_design_ask_rev2.md §6).
    let freshCount: number;
    let eligibleEntries: [string, PairStoreEntry][];
    let sectorsCovered = 0;

    if (this.opts.mode === 'xstock') {
      const sectorsSeen = new Set<XstockSector>();
      eligibleEntries = [];
      for (const [sym, entry] of this.store.entries()) {
        // GICS-only + non-sentinel partition gate
        if (entry.sector && GICS_SECTORS.has(entry.sector) && !entry.sentinelZero) {
          eligibleEntries.push([sym, entry]);
          sectorsSeen.add(entry.sector);
        }
      }
      freshCount = eligibleEntries.length;
      sectorsCovered = sectorsSeen.size;
    } else {
      // crypto mode — original behavior
      freshCount = this.store.size;
      eligibleEntries = Array.from(this.store.entries());
    }

    // Rows 1, 2, and 3: below-floor handling.
    // Row 1 (cold start — empty store AND no prior snapshot) logs `coldStart` to align with
    // the semantic expectation that PM2 restart produces a coldStart log through the MCE
    // computeGlobalBias path. Row 3 (partial store but < floor pairs, no prior) logs `noSnapshot`.
    // Row 2 (below floor but we have a prior snapshot to carry forward) logs `degradedCoverage`.
    //
    // B-PHASE-A2 (xstock mode only): the floor is dual — global-30 AND sector-coverage-7 must
    // BOTH be satisfied. Either failing triggers the below-floor handling.
    const minSampleCount = getGlobalDbsMinSampleCount(this.opts.assetClassForKnobs);
    const sectorCoverageFloor = this.opts.mode === 'xstock' ? getSectorCoverageFloor() : 0;
    const belowGlobalFloor = freshCount < minSampleCount;
    const belowSectorFloor = this.opts.mode === 'xstock' && sectorsCovered < sectorCoverageFloor;
    const belowFloor = belowGlobalFloor || belowSectorFloor;
    // B-PHASE-A2: log label distinguishes xstock vs crypto store instance for operational clarity.
    const logTag = this.opts.mode === 'xstock' ? 'GlobalDBS-xstock' : 'GlobalDBS';
    const floorDesc = this.opts.mode === 'xstock'
      ? `globalFloor=${minSampleCount} sectorCoverageFloor=${sectorCoverageFloor} sectorsCovered=${sectorsCovered}`
      : `floor=${minSampleCount}`;
    if (belowFloor) {
      if (this.latestSnapshot) {
        // Row 2: serve stale prior snapshot
        this.latestSnapshot = {
          ...this.latestSnapshot,
          isStale: true,
        };
        console.log(
          `[${logTag}][degradedCoverage] serving stale snapshot, liveStore=${freshCount}, ${floorDesc}`
        );
        return this.latestSnapshot;
      }
      // No prior snapshot branch.
      if (freshCount === 0) {
        // Row 1: empty store + no prior — true cold start
        console.log(
          `[${logTag}][coldStart] snapshot unavailable, store has 0 pairs, ${floorDesc}; returning null`
        );
      } else {
        // Row 3: partial but below floor, no prior
        console.log(
          `[${logTag}][noSnapshot] store below floor (liveStore=${freshCount}, ${floorDesc}) and no prior snapshot; returning null`
        );
      }
      return null;
    }

    // Happy-path candidate: compute from current inputs.
    // B-PHASE-A2 xstock mode: aggregate ONLY over eligibleEntries (sector-partition filtered).
    // Crypto mode: aggregate over the full store as before.
    const pairScores = new Map<string, number>();
    const sentinelFlags = new Map<string, boolean>();
    const volumes = new Map<string, number>();
    const aggregationSource = this.opts.mode === 'xstock' ? eligibleEntries : Array.from(this.store.entries());
    for (const [sym, entry] of aggregationSource) {
      pairScores.set(sym, entry.score);
      sentinelFlags.set(sym, entry.sentinelZero);
      volumes.set(sym, entry.volume);
    }

    const computed = computeGlobalDirectionalBias(
      pairScores,
      volumes,
      undefined,
      sentinelFlags
    );

    // Row 4: invalid compute result (NaN / non-finite) — keep prior snapshot stale
    if (!isFinite(computed.score)) {
      if (this.latestSnapshot) {
        this.latestSnapshot = {
          ...this.latestSnapshot,
          isStale: true,
        };
        console.log(
          `[${logTag}][invalidCompute] kept prior snapshot (current compute produced non-finite score=${computed.score})`
        );
        return this.latestSnapshot;
      }
      // No prior snapshot + invalid compute → return null
      console.log(
        `[${logTag}][invalidCompute] non-finite compute AND no prior snapshot; returning null`
      );
      return null;
    }

    // Row 5: happy path — publish fresh
    const priorSnapshot = this.latestSnapshot;
    const nowMs = Date.now();
    this.latestSnapshot = {
      value: computed,
      snapshotTime: nowMs,
      coverage: freshCount,
      isStale: false,
    };

    // Record in history ring buffer (bounded to 24h at 15-min cadence).
    this.history.push({
      timestamp: nowMs,
      score: computed.score,
      category: computed.category,
      pairCount: freshCount,
    });
    if (this.history.length > SNAPSHOT_HISTORY_MAX) {
      this.history.shift();
    }

    // Emit a transition if category changed vs prior non-stale snapshot.
    // (Stale snapshots don't reflect a real change, so we compare against
    // the prior FRESH value instead of prior served value.)
    if (priorSnapshot && !priorSnapshot.isStale && priorSnapshot.value.category !== computed.category) {
      this.transitions.push({
        timestamp: nowMs,
        from: priorSnapshot.value.category,
        to: computed.category,
        scoreAt: computed.score,
      });
      if (this.transitions.length > TRANSITION_HISTORY_MAX) {
        this.transitions.shift();
      }
    }

    return this.latestSnapshot;
  }

  /** Historical snapshot ring buffer (up to last 24h at 15-min cadence). */
  getHistory(): HistoricalSnapshot[] {
    return this.history.slice(); // defensive copy
  }

  /** Category transitions observed across published snapshots. */
  getTransitions(): CategoryTransition[] {
    return this.transitions.slice();
  }

  /**
   * Return the latest published snapshot, or null if no snapshot has ever been
   * published (Row 1: cold start).
   *
   * Consumers must handle `null` explicitly. Never substitute zero or any default.
   */
  getLatestSnapshot(): GlobalDbsSnapshot | null {
    if (!this.latestSnapshot) {
      // Row 1: cold start. B-PHASE-A2 — log tag distinguishes xstock vs crypto.
      const logTag = this.opts.mode === 'xstock' ? 'GlobalDBS-xstock' : 'GlobalDBS';
      console.log(
        `[${logTag}][coldStart] snapshot unavailable, store has ${this.store.size} pairs, floor ${getGlobalDbsMinSampleCount(this.opts.assetClassForKnobs)}`
      );
      return null;
    }
    return this.latestSnapshot;
  }

  /** Current pair-count in the live store (for diagnostics / UI). */
  getStoreSize(): number {
    return this.store.size;
  }

  /** Reset — tests only. */
  clear(): void {
    this.store.clear();
    this.latestSnapshot = null;
    this.history = [];
    this.transitions = [];
  }
}

/**
 * Module-level singleton — crypto instance.
 *
 * Same pattern used elsewhere for infra singletons. Pre-B-PHASE-A2 callers continue
 * using this export with the original 4-arg `updatePair` signature; mode='crypto'
 * preserves original aggregation semantics (no sector partition, single floor).
 */
export const directionalBiasStore = new DirectionalBiasStore({
  mode: 'crypto',
  assetClassForKnobs: 'crypto_spot',
});

/**
 * Module-level singleton — xStock instance (B-PHASE-A2, NEW).
 *
 * Independent store for the xstock_spot universe. mode='xstock' applies:
 *   - Sector partition filter at aggregation (INDEX_PROXY/BROAD_ETF/INTL_ETF excluded)
 *   - Global floor counted over GICS-sectored non-sentinel entries only
 *   - Additional `sector_coverage_floor` gate (≥N distinct GICS sectors)
 *
 * Callers must pass `sector` as the 5th `updatePair` argument from `XSTOCK_SPOT_REGISTRY`
 * sector lookup. Crypto callers do NOT touch this store.
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.1.
 */
export const xstockDirectionalBiasStore = new DirectionalBiasStore({
  mode: 'xstock',
  assetClassForKnobs: 'xstock_spot',
});

/** Convenience accessor for the crypto global DBS snapshot (e.g. for UI/API endpoints). */
export function getLatestGlobalDbsSnapshot(): GlobalDbsSnapshot | null {
  return directionalBiasStore.getLatestSnapshot();
}

/** B-PHASE-A2 convenience accessor for the xStock global DBS snapshot. */
export function getLatestXstockGlobalDbsSnapshot(): GlobalDbsSnapshot | null {
  return xstockDirectionalBiasStore.getLatestSnapshot();
}
